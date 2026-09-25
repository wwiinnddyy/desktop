import {
  Repository,
  nameOf,
  ILocalRepositoryState,
} from '../../models/repository'
import { compare } from '../compare'
import {
  IHomeCommit,
  IHomeRepositoryInfo,
  IHomeSummary,
  IRepositoryScanResult,
  MaxCommitsPerRepository,
} from './types'

/**
 * Whether we believe this repository can be brought up to date by simply
 * fast-forwarding, based on the snapshot the app keeps for the repository
 * switcher.
 *
 * This is only ever used to size up the work ahead of us and to label the
 * "pull everything" button. The pull itself re-reads the repository state
 * before touching anything, see `decideRepositoryAction` in `pull-all.ts`.
 */
export function canFastForwardFromSnapshot(info: IHomeRepositoryInfo): boolean {
  const { repository, aheadBehind, changedFilesCount } = info

  if (repository.missing) {
    return false
  }

  if (changedFilesCount > 0) {
    return false
  }

  if (aheadBehind === null) {
    return false
  }

  return aheadBehind.ahead === 0 && aheadBehind.behind > 0
}

/** Build the merged per repository view model for the Home view. */
export function toHomeRepositoryInfos(
  repositories: ReadonlyArray<Repository>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  scans: ReadonlyMap<number, IRepositoryScanResult>
): ReadonlyArray<IHomeRepositoryInfo> {
  return repositories
    .map(repository => {
      const state = localRepositoryStateLookup.get(repository.id)

      return {
        repository,
        aheadBehind: state?.aheadBehind ?? null,
        changedFilesCount: state?.changedFilesCount ?? 0,
        scan: scans.get(repository.id) ?? null,
      }
    })
    .sort(compareByAttention)
}

/** Aggregate the numbers shown in the Home view summary strip. */
export function summarize(
  infos: ReadonlyArray<IHomeRepositoryInfo>
): IHomeSummary {
  let totalChangedFiles = 0
  let totalBehind = 0
  let repositoriesBehind = 0
  let commitCount = 0
  let myCommitCount = 0
  let repositoriesWithCommits = 0
  let missingRepositoryCount = 0
  let pullableCount = 0
  let pullableCommitCount = 0
  let scannedCount = 0

  for (const info of infos) {
    if (info.repository.missing) {
      missingRepositoryCount++

      // There's no state worth adding up for a repository we can't even find,
      // and counting its stale ahead/behind would promise pulls we can't do.
      continue
    }

    totalChangedFiles += info.changedFilesCount

    const aheadBehind = info.aheadBehind
    if (aheadBehind !== null && aheadBehind.behind > 0) {
      totalBehind += aheadBehind.behind
      repositoriesBehind++
    }

    if (canFastForwardFromSnapshot(info)) {
      pullableCount++
      pullableCommitCount += aheadBehind?.behind ?? 0
    }

    const scan = info.scan
    if (scan !== null) {
      scannedCount++

      if (scan.commitCount !== null) {
        commitCount += scan.commitCount
        myCommitCount += scan.myCommitCount ?? 0

        if (scan.commitCount > 0) {
          repositoriesWithCommits++
        }
      }
    }
  }

  return {
    repositoryCount: infos.length,
    missingRepositoryCount,
    totalChangedFiles,
    totalBehind,
    repositoriesBehind,
    commitCount,
    myCommitCount,
    repositoriesWithCommits,
    pullableCount,
    pullableCommitCount,
    scannedCount,
    totalCount: infos.length,
  }
}

/**
 * The cross repository commit feed, newest first.
 *
 * We cap the number of commits kept per repository at scan time which keeps
 * this merge bounded regardless of how active the repositories are.
 */
export function getRecentCommits(
  infos: ReadonlyArray<IHomeRepositoryInfo>,
  limit: number = 100
): ReadonlyArray<IHomeCommit> {
  const commits = new Array<IHomeCommit>()

  for (const info of infos) {
    const scan = info.scan

    if (scan !== null) {
      commits.push(...scan.recentCommits)
    }
  }

  commits.sort((x, y) => y.date.getTime() - x.date.getTime())

  return commits.slice(0, limit)
}

/** Whether any repository hit the per repository commit cap. */
export function hasTruncatedCommits(
  infos: ReadonlyArray<IHomeRepositoryInfo>
): boolean {
  return infos.some(x => x.scan?.truncated === true)
}

/** `1000+` for a number that hit the cap, plain otherwise. */
export function formatCommitCount(count: number | null): string {
  if (count === null) {
    return '–'
  }

  return count >= MaxCommitsPerRepository
    ? `${MaxCommitsPerRepository}+`
    : `${count}`
}

/**
 * The searchable text for a repository row, matching the conventions used by
 * the repository switcher so that aliases and `owner/name` both work.
 */
export function getRepositorySearchText(
  repository: Repository
): ReadonlyArray<string> {
  const title = repository.alias ?? repository.name

  return repository.gitHubRepository !== null
    ? [title, nameOf(repository)]
    : [title]
}

/**
 * Sort key for the Home repository list: repositories that need attention
 * first, then by name.
 */
export function compareByAttention(
  x: IHomeRepositoryInfo,
  y: IHomeRepositoryInfo
): number {
  const xScore = attentionScore(x)
  const yScore = attentionScore(y)

  if (xScore !== yScore) {
    return yScore - xScore
  }

  return compare(
    x.repository.alias ?? x.repository.name,
    y.repository.alias ?? y.repository.name
  )
}

/**
 * Higher score means the repository is more likely to be the one the user wants
 * to deal with right now.
 */
function attentionScore(info: IHomeRepositoryInfo): number {
  if (info.repository.missing) {
    return 3
  }

  if (canFastForwardFromSnapshot(info)) {
    return 2
  }

  if (
    info.changedFilesCount > 0 ||
    (info.aheadBehind !== null && info.aheadBehind.ahead > 0)
  ) {
    return 1
  }

  return 0
}
