import pLimit from 'p-limit'

import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { fastForwardMerge, MergeResult } from '../git'
import { pathExists } from '../path-exists'
import { TypedBaseStore } from './base-store'
import { GitStore } from './git-store'
import {
  getMyEmailAddresses,
  scanRepositoryCommits,
  tryGetGlobalUserEmail,
} from '../home/scan'
import {
  decideRepositoryAction,
  describeDecision,
  IRepositoryPullSnapshot,
} from '../home/pull-all'
import {
  IPullAllResult,
  IPullAllState,
  IRepositoryScanResult,
} from '../home/types'

/** How many repositories we'll scan for commit activity at once. */
const MaxConcurrentScans = 3

/** How many repositories we'll fetch at once when pulling everything. */
const MaxConcurrentFetches = 3

/** How long a scan result is considered fresh. */
const ScanTtl = 5 * 60 * 1000

export interface IHomeStoreState {
  /** Scan results keyed on repository id. */
  readonly scans: ReadonlyMap<number, IRepositoryScanResult>

  /** Whether a scan round is currently in flight. */
  readonly scanning: boolean

  /** Progress for the current or most recent scan round. */
  readonly scanProgress: { readonly done: number; readonly total: number }

  /** The state of the ongoing (if any) "pull updates everywhere" operation. */
  readonly pullAll: IPullAllState | null
}

export interface IHomeStoreDependencies {
  /**
   * The `GitStore` for a repository. Provided by the app store rather than
   * constructed here to make sure we share the same cache, and with it the same
   * authentication plumbing, as the rest of the app.
   */
  readonly getGitStore: (repository: Repository) => GitStore

  /** Refresh the repository switcher indicator for a repository. */
  readonly refreshRepositoryIndicators: (
    repository: Repository
  ) => Promise<void>

  /**
   * Pause and resume the app wide repository indicator updater. Bulk updating a
   * lot of repositories is exactly the kind of thing that updater will otherwise
   * race us on.
   */
  readonly pauseRepositoryIndicators: () => void
  readonly resumeRepositoryIndicators: () => void
}

type FetchOutcome =
  | { readonly kind: 'skip'; readonly result: IPullAllResult }
  | {
      readonly kind: 'merge'
      readonly repository: Repository
      readonly snapshot: IRepositoryPullSnapshot
    }

/**
 * The store behind the Home view.
 *
 * It owns two things that the rest of the app deliberately doesn't have: an
 * opinion about commit activity across *all* known repositories, and the
 * ability to bring many of them up to date in one go. Everything else (the
 * ahead/behind and changed file counts that we display alongside our own
 * numbers) continues to come from the app store so that there's only ever one
 * source of truth for repository state.
 */
export class HomeStore extends TypedBaseStore<IHomeStoreState> {
  private readonly scanLimit = pLimit(MaxConcurrentScans)
  private readonly fetchLimit = pLimit(MaxConcurrentFetches)

  private readonly scans = new Map<number, IRepositoryScanResult>()

  private scanning = false
  private pendingScan = false
  private scanDone = 0
  private scanTotal = 0

  /** The email addresses we consider to be "the user" */
  private myEmails: ReadonlySet<string> | null = null
  private myEmailsExpiresAt = 0

  private pullAllState: IPullAllState | null = null
  private cancelPullAllRequested = false

  public constructor(private readonly deps: IHomeStoreDependencies) {
    super()
  }

  public getState(): IHomeStoreState {
    return {
      scans: new Map(this.scans),
      scanning: this.scanning,
      scanProgress: { done: this.scanDone, total: this.scanTotal },
      pullAll: this.pullAllState,
    }
  }

  /** Whether a "pull updates everywhere" operation is in flight. */
  public get isPullingAll(): boolean {
    const state = this.pullAllState

    return (
      state !== null && state.phase !== 'done' && state.phase !== 'cancelled'
    )
  }

  /**
   * Make sure that every repository has a reasonably fresh scan, emitting an
   * update for each one as it comes in so that the numbers in the Home view
   * appear progressively instead of all at once.
   *
   * Called from the Home view whenever the list of repositories changed or the
   * user asked us to look again.
   */
  public async ensureRepositoriesScanned(
    repositories: ReadonlyArray<Repository>,
    accounts: ReadonlyArray<Account>
  ): Promise<void> {
    if (this.scanning) {
      this.pendingScan = true
      return
    }

    const now = Date.now()
    const stale = repositories.filter(
      x => !x.missing && !this.isFresh(x.id, now)
    )

    if (stale.length === 0) {
      return
    }

    const emails = await this.getEmailAddresses(accounts, now)

    this.scanning = true
    this.scanDone = 0
    this.scanTotal = stale.length
    this.emitUpdate(this.getState())

    try {
      await Promise.all(
        stale.map(repository =>
          this.scanLimit(async () => {
            const result = await scanRepositoryCommits(repository, emails)

            this.scans.set(repository.id, result)
            this.scanDone++
            this.emitUpdate(this.getState())
          })
        )
      )
    } finally {
      this.scanning = false
      this.emitUpdate(this.getState())

      if (this.pendingScan) {
        this.pendingScan = false
        this.ensureRepositoriesScanned(repositories, accounts)
      }
    }
  }

  /** Forget everything and look again. */
  public async refresh(
    repositories: ReadonlyArray<Repository>,
    accounts: ReadonlyArray<Account>
  ): Promise<void> {
    this.scans.clear()
    this.myEmails = null
    this.scanDone = 0
    this.scanTotal = 0

    await this.ensureRepositoriesScanned(repositories, accounts)
  }

  /** Forget the scan result for a repository, eg after it was updated. */
  public invalidate(repository: Repository) {
    if (!this.scans.delete(repository.id)) {
      return
    }

    this.emitUpdate(this.getState())
  }

  private isFresh(repositoryId: number, now: number): boolean {
    const existing = this.scans.get(repositoryId)

    return existing !== undefined && now - existing.scannedAt < ScanTtl
  }

  private async getEmailAddresses(
    accounts: ReadonlyArray<Account>,
    now: number
  ): Promise<ReadonlySet<string>> {
    if (this.myEmails !== null && now < this.myEmailsExpiresAt) {
      return this.myEmails
    }

    const emails = new Set(getMyEmailAddresses(accounts))
    const globalEmail = await tryGetGlobalUserEmail()

    if (globalEmail !== null) {
      emails.add(globalEmail.toLowerCase())
    }

    this.myEmails = emails
    this.myEmailsExpiresAt = now + ScanTtl

    return emails
  }

  /**
   * Bring as many repositories up to date as we safely can.
   *
   * We fetch first (a few at a time) and then fast-forward only those
   * repositories where doing so is a no-risk operation: clean working
   * directory, on a branch with an upstream, and nothing local that hasn't been
   * pushed. Everything we decided to leave alone is reported to the user rather
   * than attempted, and a failure in one repository never stops the rest.
   */
  public async pullAllUpdates(
    repositories: ReadonlyArray<Repository>
  ): Promise<void> {
    if (this.isPullingAll) {
      return
    }

    this.cancelPullAllRequested = false

    const results = new Array<IPullAllResult>()
    const toMerge = new Array<{
      repository: Repository
      snapshot: IRepositoryPullSnapshot
    }>()

    this.setPullAllState({
      phase: 'fetch',
      done: 0,
      total: repositories.length,
      currentRepository: null,
      results,
    })

    this.deps.pauseRepositoryIndicators()

    try {
      await Promise.all(
        repositories.map(repository =>
          this.fetchLimit(async () => {
            if (this.cancelPullAllRequested) {
              return
            }

            let outcome: FetchOutcome

            try {
              outcome = await this.fetchAndDecide(repository)
            } catch (e) {
              results.push({
                repository,
                kind: 'failed',
                message: `Unable to prepare ${repository.name}: ${getErrorMessage(e)}`,
              })
              this.advancePullAllProgress(repository)
              return
            }

            if (outcome.kind === 'merge') {
              toMerge.push({
                repository: outcome.repository,
                snapshot: outcome.snapshot,
              })
            } else {
              results.push(outcome.result)
              this.advancePullAllProgress(outcome.result.repository)
            }
          })
        )
      )

      if (this.cancelPullAllRequested) {
        this.finishPullAll('cancelled', results)
        return
      }

      this.setPullAllState({ phase: 'merge', currentRepository: null })

      // Merges happen one at a time. They're the only part of this that writes
      // to the user's working directory, and serialising them keeps the
      // progress honest and the reflog easy to follow.
      for (const { repository, snapshot } of toMerge) {
        if (this.cancelPullAllRequested) {
          break
        }

        const upstreamRef = snapshot.upstreamRef

        if (upstreamRef === null) {
          continue
        }

        const result = await this.fastForwardRepository(repository, snapshot)

        results.push(result)
        this.advancePullAllProgress(repository)
      }

      this.finishPullAll(
        this.cancelPullAllRequested ? 'cancelled' : 'done',
        results
      )
    } catch {
      this.finishPullAll('done', results)
    } finally {
      this.deps.resumeRepositoryIndicators()
    }
  }

  /** Ask the in-flight "pull updates everywhere" operation to stop. */
  public cancelPullAllUpdates() {
    if (!this.isPullingAll) {
      return
    }

    this.cancelPullAllRequested = true
  }

  /**
   * Throw away the results of the last completed run. Refuses while one is in
   * flight since that would mean throwing away progress reports.
   */
  public clearPullAllResults() {
    if (this.isPullingAll || this.pullAllState === null) {
      return
    }

    this.pullAllState = null
    this.emitUpdate(this.getState())
  }

  /**
   * Fetch a single repository and figure out what we can safely do about it.
   *
   * Note that the ahead/behind we get out of `git status` only ever reflects
   * what was last fetched, which is why we have to fetch before we're allowed to
   * conclude that a repository is up to date.
   */
  private async fetchAndDecide(
    repository: Repository
  ): Promise<FetchOutcome> {
    const skip = (
      kind: IPullAllResult['kind'],
      message: string | null = null
    ): FetchOutcome => ({
      kind: 'skip',
      result: { repository, kind, message },
    })

    if (repository.missing || !(await pathExists(repository.path))) {
      return skip(
        'skipped-missing',
        describeDecision('skipped-missing', repository.name)
      )
    }

    const gitStore = this.deps.getGitStore(repository)
    const status = await gitStore.loadStatus()

    if (status === null) {
      return skip('failed', `Unable to read the state of ${repository.name}`)
    }

    await gitStore.loadRemotes()

    const snapshot: IRepositoryPullSnapshot = {
      missing: false,
      branchName: status.currentBranch ?? null,
      upstreamRef: status.currentUpstreamBranch ?? null,
      aheadBehind: status.branchAheadBehind ?? null,
      changedFilesCount: status.workingDirectory.files.length,
    }

    const decisionBeforeFetch = decideRepositoryAction(snapshot)

    // There's no point asking a remote for anything about a repository we're
    // never going to touch, and every one of those requests potentially costs us
    // a round trip to a credential helper.
    if (
      decisionBeforeFetch === 'skipped-detached' ||
      decisionBeforeFetch === 'skipped-dirty' ||
      decisionBeforeFetch === 'skipped-no-upstream' ||
      decisionBeforeFetch === 'skipped-missing'
    ) {
      return skip(
        decisionBeforeFetch,
        describeDecision(decisionBeforeFetch, repository.name)
      )
    }

    try {
      const fetchSucceeded = await gitStore.fetch(true)

      if (!fetchSucceeded) {
        return skip('failed', `Unable to fetch from ${repository.name}`)
      }
    } catch (e) {
      return skip(
        'failed',
        `Unable to fetch from ${repository.name}: ${getErrorMessage(e)}`
      )
    }

    // `fetch` leaves an up to date ahead/behind on the store for the branch that
    // we just fetched.
    const fetchedSnapshot: IRepositoryPullSnapshot = {
      ...snapshot,
      aheadBehind: gitStore.aheadBehind,
    }

    const decision = decideRepositoryAction(fetchedSnapshot)

    if (decision !== 'fast-forward') {
      return skip(decision, describeDecision(decision, repository.name))
    }

    return { kind: 'merge', repository, snapshot: fetchedSnapshot }
  }

  private async fastForwardRepository(
    repository: Repository,
    expected: IRepositoryPullSnapshot
  ): Promise<IPullAllResult> {
    try {
      const gitStore = this.deps.getGitStore(repository)
      const status = await gitStore.loadStatus()

      if (status === null) {
        return {
          repository,
          kind: 'failed',
          message: `Unable to re-read the state of ${repository.name}`,
        }
      }

      const current: IRepositoryPullSnapshot = {
        missing: false,
        branchName: status.currentBranch ?? null,
        upstreamRef: status.currentUpstreamBranch ?? null,
        aheadBehind: status.branchAheadBehind ?? null,
        changedFilesCount: status.workingDirectory.files.length,
      }

      if (
        current.branchName !== expected.branchName ||
        current.upstreamRef !== expected.upstreamRef
      ) {
        return {
          repository,
          kind: 'failed',
          message: `${repository.name} changed while updates were being prepared`,
        }
      }

      const decision = decideRepositoryAction(current)

      if (decision !== 'fast-forward') {
        return {
          repository,
          kind: decision,
          message: describeDecision(decision, repository.name),
        }
      }

      const upstreamRef = current.upstreamRef

      if (upstreamRef === null) {
        return {
          repository,
          kind: 'failed',
          message: `${repository.name} has no upstream branch`,
        }
      }

      const result = await fastForwardMerge(repository, upstreamRef)

      if (result === MergeResult.Success) {
        await this.deps.refreshRepositoryIndicators(repository)

        return {
          repository,
          kind: 'updated',
          message: `Brought up to date with ${upstreamRef}`,
        }
      }

      if (result === MergeResult.AlreadyUpToDate) {
        return {
          repository,
          kind: 'skipped-up-to-date',
          message: describeDecision('skipped-up-to-date', repository.name),
        }
      }

      // `--ff-only` refusing to do anything means the repository isn't a simple
      // fast-forward after all, most likely because something changed underneath
      // us while we were working through the list. Nothing was written.
      return {
        repository,
        kind: 'failed',
        message: `Could not update ${repository.name} without merging`,
      }
    } catch (e) {
      return {
        repository,
        kind: 'failed',
        message: `Unable to update ${repository.name}: ${getErrorMessage(e)}`,
      }
    }
  }

  private setPullAllState(
    partial: Partial<IPullAllState> & Pick<IPullAllState, 'phase'>
  ) {
    const previous = this.pullAllState

    this.pullAllState = {
      done: partial.done ?? previous?.done ?? 0,
      total: partial.total ?? previous?.total ?? 0,
      currentRepository:
        partial.currentRepository !== undefined
          ? partial.currentRepository
          : previous?.currentRepository ?? null,
      results: partial.results ?? previous?.results ?? [],
      phase: partial.phase,
    }

    this.emitUpdate(this.getState())
  }

  private advancePullAllProgress(repository: Repository) {
    const state = this.pullAllState

    if (state === null) {
      return
    }

    this.pullAllState = {
      ...state,
      done: state.done + 1,
      currentRepository: repository.name,
    }
    this.emitUpdate(this.getState())
  }

  private finishPullAll(
    phase: 'done' | 'cancelled',
    results: ReadonlyArray<IPullAllResult>
  ) {
    this.setPullAllState({ phase, results })
  }
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : `${e}`
}
