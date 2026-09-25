import type { Repository } from '../../models/repository'
import type { IAheadBehind } from '../../models/branch'

/**
 * How far back in time the Home view looks when counting commits. This is
 * deliberately a Git relative date (see `git help cli` / `--since`) so that we
 * hand it straight to Git instead of doing date math in JavaScript.
 */
export const CommitCountSince = '1.week'

/**
 * Upper bound on how many commits we'll ask Git for in a single repository.
 * Repositories that are extremely active within the time window would produce a
 * lot of output for a number that's going to be displayed as `1000+` anyway.
 */
export const MaxCommitsPerRepository = 1000

/**
 * How many of the commits found in a repository we keep around for the purpose
 * of building the cross repository commit feed. The count itself is derived
 * before we truncate.
 */
export const MaxRecentCommitsPerRepository = 25

/** A single commit, decorated with the repository it came from. */
export interface IHomeCommit {
  readonly repository: Repository
  readonly sha: string
  readonly shortSha: string
  readonly summary: string
  readonly authorName: string
  readonly authorEmail: string
  readonly date: Date
}

/** The outcome of scanning a single repository for recent commit activity. */
export interface IRepositoryScanResult {
  readonly repository: Repository

  /**
   * The name of the branch that's currently checked out, or null when HEAD is
   * detached (or the repository could not be read at all).
   */
  readonly branchName: string | null

  /** The ref the commits were counted on (`@{upstream}` when one exists). */
  readonly scannedRef: string | null

  /** Total number of commits within the time window, or null on failure. */
  readonly commitCount: number | null

  /** The subset of `commitCount` attributed to the signed in user(s). */
  readonly myCommitCount: number | null

  /** The most recent commits within the time window, newest first. */
  readonly recentCommits: ReadonlyArray<IHomeCommit>

  /** Whether `commitCount` hit `MaxCommitsPerRepository`. */
  readonly truncated: boolean

  /** The error message if the scan failed, null otherwise. */
  readonly error: string | null

  /** `Date.now()` at the time the scan completed. */
  readonly scannedAt: number
}

/** The per repository view model rendered by the Home view. */
export interface IHomeRepositoryInfo {
  readonly repository: Repository

  /** Ahead/behind for the checked out branch, from the shared indicator cache. */
  readonly aheadBehind: IAheadBehind | null

  /** Number of uncommitted changes, from the shared indicator cache. */
  readonly changedFilesCount: number

  /** Null until the repository has been scanned. */
  readonly scan: IRepositoryScanResult | null
}

/** Aggregated numbers shown at the top of the Home view. */
export interface IHomeSummary {
  readonly repositoryCount: number
  readonly missingRepositoryCount: number
  readonly totalChangedFiles: number
  readonly totalBehind: number
  readonly repositoriesBehind: number
  readonly commitCount: number
  readonly myCommitCount: number
  readonly repositoriesWithCommits: number

  /** Repositories that we believe can be brought up to date by fast-forwarding */
  readonly pullableCount: number
  readonly pullableCommitCount: number

  /** How much of the work is done, for progressive rendering. */
  readonly scannedCount: number
  readonly totalCount: number
}

export enum HomeTab {
  Changes,
  History,
}

/** What the Home view would do to a given repository if asked to pull it. */
export type PullAllDecision =
  | 'fast-forward'
  | 'skipped-dirty'
  | 'skipped-diverged'
  | 'skipped-up-to-date'
  | 'skipped-no-upstream'
  | 'skipped-detached'
  | 'skipped-missing'

/** The outcome of pulling updates in one repository. */
export interface IPullAllResult {
  readonly repository: Repository
  readonly kind: PullAllDecision | 'updated' | 'failed'
  /** Human readable detail, eg the reason something was skipped. */
  readonly message: string | null
}

export interface IPullAllState {
  readonly phase: 'fetch' | 'merge' | 'done' | 'cancelled'
  readonly done: number
  readonly total: number
  readonly currentRepository: string | null
  readonly results: ReadonlyArray<IPullAllResult>
}
