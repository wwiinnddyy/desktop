import { IAheadBehind } from '../../models/branch'
import { assertNever } from '../fatal-error'
import { PullAllDecision } from './types'

/**
 * The minimum amount of information needed to decide whether we dare bring a
 * repository up to date without asking the user about it.
 *
 * Deliberately a plain object rather than a Repository (plus its GitStore) so
 * that the decision stays a pure function that the Home store can feed from a
 * live `git status`, and tests can feed from a literal.
 */
export interface IRepositoryPullSnapshot {
  /** Whether the repository could be found on disk. */
  readonly missing: boolean

  /** The checked out branch, or null when HEAD is detached or unborn. */
  readonly branchName: string | null

  /** The upstream ref of the checked out branch, ie `refs/remotes/origin/main` */
  readonly upstreamRef: string | null

  /** Ahead/behind for the checked out branch relative to its upstream. */
  readonly aheadBehind: IAheadBehind | null

  /** Number of files with uncommitted changes in the working directory. */
  readonly changedFilesCount: number
}

/**
 * Decide what "pull updates" should do with a given repository.
 *
 * The Home view offers to update repositories on the user's behalf, in bulk,
 * without supervising each one. That means we only ever do the one thing that
 * cannot make a mess: move a branch forward onto its upstream. Anything that
 * would need a merge commit, a stash, or a judgement call is reported back to
 * the user instead of being attempted.
 */
export function decideRepositoryAction(
  snapshot: IRepositoryPullSnapshot
): PullAllDecision {
  if (snapshot.missing) {
    return 'skipped-missing'
  }

  if (snapshot.branchName === null) {
    return 'skipped-detached'
  }

  if (snapshot.changedFilesCount > 0) {
    return 'skipped-dirty'
  }

  if (snapshot.upstreamRef === null) {
    return 'skipped-no-upstream'
  }

  const aheadBehind = snapshot.aheadBehind

  if (aheadBehind === null) {
    return 'skipped-no-upstream'
  }

  if (aheadBehind.behind === 0) {
    return 'skipped-up-to-date'
  }

  if (aheadBehind.ahead > 0) {
    return 'skipped-diverged'
  }

  return 'fast-forward'
}

/** Whether the action implies we'll write to the repository. */
export function willUpdate(decision: PullAllDecision): boolean {
  return decision === 'fast-forward'
}

/**
 * A one line explanation of a decision, used both by the pull results and by
 * the tooltip on the "pull everything" button so that the two can never
 * disagree about why something was left alone.
 */
export function describeDecision(
  decision: PullAllDecision,
  repositoryName: string
): string {
  switch (decision) {
    case 'fast-forward':
      return `${repositoryName} will be brought up to date`
    case 'skipped-dirty':
      return `${repositoryName} has uncommitted changes`
    case 'skipped-diverged':
      return `${repositoryName} has commits that haven't been pushed`
    case 'skipped-up-to-date':
      return `${repositoryName} is already up to date`
    case 'skipped-no-upstream':
      return `${repositoryName} has no upstream branch to pull from`
    case 'skipped-detached':
      return `${repositoryName} is not on a branch`
    case 'skipped-missing':
      return `${repositoryName} can't be found on disk`
    default:
      return assertNever(decision, `Unknown pull decision ${decision}`)
  }
}
