import { IFilterListItem, IFilterListGroup } from '../lib/filter-list'
import { IHomeCommit, IHomeRepositoryInfo } from '../../lib/home/types'
import {
  canFastForwardFromSnapshot,
  compareByAttention,
  getRepositorySearchText,
} from '../../lib/home/aggregate'
import { nameOf } from '../../models/repository'

/**
 * The identifier for a group in the Home repository list. A union of literal
 * kinds rather than a union valued field, so that switching on `kind` narrows
 * the type and leaves exhaustiveness checks with something to bite on.
 */
export type IHomeRepositoryGroupIdentifier =
  | { readonly kind: 'attention' }
  | { readonly kind: 'calm' }

export interface IHomeRepositoryListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly info: IHomeRepositoryInfo
}

export interface IHomeCommitGroupIdentifier {
  readonly kind: 'commits'
}

export interface IHomeCommitListItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly commit: IHomeCommit
}

/**
 * Split repositories into the ones that need, or allow, the user to do
 * something and the ones that are simply sitting there being up to date.
 *
 * Keeping them in two groups rather than one long list means that the thing
 * a user came to the Home view for (what's behind? what's dirty?) is at the top
 * without anyone having to scroll, while still listing everything so that the
 * view stays a complete overview.
 */
export function groupHomeRepositories(
  infos: ReadonlyArray<IHomeRepositoryInfo>
): ReadonlyArray<
  IFilterListGroup<IHomeRepositoryListItem, IHomeRepositoryGroupIdentifier>
> {
  const attention = new Array<IHomeRepositoryListItem>()
  const calm = new Array<IHomeRepositoryListItem>()

  for (const info of infos) {
    const item = {
      id: info.repository.id.toString(),
      text: getRepositorySearchText(info.repository),
      info,
    }

    if (needsAttention(info)) {
      attention.push(item)
    } else {
      calm.push(item)
    }
  }

  attention.sort((x, y) => compareByAttention(x.info, y.info))
  calm.sort((x, y) => compareByAttention(x.info, y.info))

  const groups = new Array<
    IFilterListGroup<IHomeRepositoryListItem, IHomeRepositoryGroupIdentifier>
  >()

  if (attention.length > 0) {
    groups.push({ identifier: { kind: 'attention' }, items: attention })
  }

  if (calm.length > 0) {
    groups.push({ identifier: { kind: 'calm' }, items: calm })
  }

  return groups
}

/** Whether a repository has something going on that the user should see first. */
export function needsAttention(info: IHomeRepositoryInfo): boolean {
  return (
    info.repository.missing ||
    info.changedFilesCount > 0 ||
    canFastForwardFromSnapshot(info) ||
    (info.aheadBehind !== null && info.aheadBehind.ahead > 0)
  )
}

/** The commit feed, as a single headerless group for the filter list. */
export function toHomeCommitGroup(
  commits: ReadonlyArray<IHomeCommit>
): ReadonlyArray<
  IFilterListGroup<IHomeCommitListItem, IHomeCommitGroupIdentifier>
> {
  const items = commits.map(commit => ({
    // Two commits in different repositories can share a SHA (forks do this all
    // the time) so the repository id has to be part of the identity.
    id: `${commit.repository.id}:${commit.sha}`,
    text: [
      commit.summary,
      commit.authorName,
      commit.authorEmail,
      commit.repository.alias ?? nameOf(commit.repository),
      nameOf(commit.repository),
    ],
    commit,
  }))

  return items.length === 0
    ? []
    : [{ identifier: { kind: 'commits' }, items, showHeader: false }]
}
