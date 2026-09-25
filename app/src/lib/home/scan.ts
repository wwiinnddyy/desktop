import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import {
  getCommits,
  getCurrentUpstreamRef,
  getGlobalConfigValue,
  getSymbolicRef,
} from '../git'
import {
  CommitCountSince,
  IHomeCommit,
  IRepositoryScanResult,
  MaxCommitsPerRepository,
  MaxRecentCommitsPerRepository,
} from './types'

/**
 * The suffix GitHub uses for the privacy "noreply" addresses which come in two
 * shapes: `<login>@users.noreply.github.com` and `<id>+<login>@...`.
 */
const NoReplyDomain = 'users.noreply.github.com'

/**
 * Builds the set of email addresses (and GitHub logins) that we consider to be
 * "the user". We intentionally keep this cheap: the accounts we know about plus
 * the global `user.email` Git configuration. Reading `user.email` per repository
 * would double the number of Git invocations the Home view needs to make and is
 * not worth it for a number that's meant to be indicative.
 */
export function getMyEmailAddresses(
  accounts: ReadonlyArray<Account>
): ReadonlySet<string> {
  const emails = new Set<string>()

  for (const account of accounts) {
    if (account.login.length > 0) {
      emails.add(account.login.toLowerCase())
    }

    for (const email of account.emails) {
      if (email.email.length > 0) {
        emails.add(email.email.toLowerCase())
      }
    }
  }

  return emails
}

/**
 * The subset of emails that are GitHub logins rather than real email addresses,
 * which we need in order to recognize noreply addresses.
 */
function getLogins(emails: ReadonlySet<string>): ReadonlySet<string> {
  const logins = new Set<string>()

  for (const email of emails) {
    if (!email.includes('@')) {
      logins.add(email)
      continue
    }

    const [local, domain] = email.split('@', 2)

    if (domain === NoReplyDomain) {
      // `<id>+<login>@users.noreply.github.com`
      const plus = local.lastIndexOf('+')
      if (plus >= 0) {
        logins.add(local.substring(plus + 1))
      } else {
        logins.add(local)
      }
    }
  }

  return logins
}

/**
 * Whether the given author email should be attributed to the user, matching
 * case insensitively and honoring the GitHub noreply address formats.
 */
export function isMyEmail(
  authorEmail: string,
  emails: ReadonlySet<string>
): boolean {
  if (emails.size === 0) {
    return false
  }

  const email = authorEmail.toLowerCase().trim()

  if (emails.has(email)) {
    return true
  }

  const at = email.indexOf('@')

  if (at < 0) {
    return false
  }

  const [local, domain] = [email.substring(0, at), email.substring(at + 1)]

  if (domain === NoReplyDomain) {
    const plus = local.lastIndexOf('+')
    const login = plus >= 0 ? local.substring(plus + 1) : local

    if (getLogins(emails).has(login)) {
      return true
    }
  }

  return false
}

function toHomeCommit(
  repository: Repository,
  sha: string,
  shortSha: string,
  summary: string,
  authorName: string,
  authorEmail: string,
  date: Date
): IHomeCommit {
  return {
    repository,
    sha,
    shortSha,
    summary,
    authorName,
    authorEmail,
    date,
  }
}

/**
 * Count the commit activity in a single repository over the past
 * {@link CommitCountSince} without loading any of the state that the repository
 * view needs.
 *
 * We prefer to count commits on the upstream tracking branch when there is one
 * because that's what "pull updates" is about: the work that has landed
 * elsewhere and hasn't made it to this clone yet. Repositories without an
 * upstream (or with a detached HEAD) fall back to `HEAD`.
 *
 * Note that this spawns Git processes and is only ever called from the Home
 * store behind a concurrency limiter.
 */
export async function scanRepositoryCommits(
  repository: Repository,
  myEmails: ReadonlySet<string>
): Promise<IRepositoryScanResult> {
  const failed = (error: string): IRepositoryScanResult => ({
    repository,
    branchName: null,
    scannedRef: null,
    commitCount: null,
    myCommitCount: null,
    recentCommits: [],
    truncated: false,
    error,
    scannedAt: Date.now(),
  })

  try {
    const [headRef, upstreamRef] = await Promise.all([
      getSymbolicRef(repository, 'HEAD'),
      getCurrentUpstreamRef(repository.path),
    ])

    const branchName =
      headRef !== null && headRef.startsWith('refs/heads/')
        ? headRef.substring('refs/heads/'.length)
        : null

    const scannedRef = upstreamRef ?? 'HEAD'

    const commits = await getCommits(
      repository,
      scannedRef,
      MaxCommitsPerRepository,
      undefined,
      [`--since=${CommitCountSince}`]
    )

    let myCommitCount = 0
    const recentCommits = new Array<IHomeCommit>()

    for (const commit of commits) {
      const { name, email, date } = commit.author

      if (isMyEmail(email, myEmails)) {
        myCommitCount++
      }

      // `git log` is newest first which is the order we want to keep.
      if (recentCommits.length < MaxRecentCommitsPerRepository) {
        recentCommits.push(
          toHomeCommit(
            repository,
            commit.sha,
            commit.shortSha,
            commit.summary,
            name,
            email,
            date
          )
        )
      }
    }

    return {
      repository,
      branchName,
      scannedRef,
      commitCount: commits.length,
      myCommitCount,
      recentCommits,
      truncated: commits.length >= MaxCommitsPerRepository,
      error: null,
      scannedAt: Date.now(),
    }
  } catch (e) {
    return failed(e instanceof Error ? e.message : `${e}`)
  }
}

/**
 * Read the globally configured `user.email` so that users who aren't signed in
 * to GitHub still get a meaningful "your commits" number.
 */
export async function tryGetGlobalUserEmail(): Promise<string | null> {
  try {
    const email = await getGlobalConfigValue('user.email')
    return email !== null && email.trim().length > 0 ? email.trim() : null
  } catch {
    return null
  }
}
