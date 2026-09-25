import * as React from 'react'

import { OcticonSymbol } from '../octicons'
import * as octicons from '../octicons'
import { ToolbarButton, ToolbarButtonStyle } from './button'
import { IPullAllResult, IPullAllState } from '../../lib/home/types'

interface IHomeToolbarButtonProps {
  /** How many repositories would be fast-forwarded right now. */
  readonly pullableRepositoryCount: number

  /** How many commits those repositories are behind, all together. */
  readonly pullableCommitCount: number

  /** The state of the ongoing, or most recent, pull everything operation. */
  readonly pullAll: IPullAllState | null

  readonly onPullAll: () => void
  readonly onCancel: () => void
}

const isRunning = (state: IPullAllState | null) =>
  state !== null && state.phase !== 'done' && state.phase !== 'cancelled'

function countKind(
  results: ReadonlyArray<IPullAllResult>,
  kind: IPullAllResult['kind']
) {
  return results.filter(x => x.kind === kind).length
}

/**
 * The Home view's equivalent of the push/pull button: one click that brings
 * every repository that can safely be fast-forwarded up to date.
 *
 * While it's working the button doubles as the off switch, which is the same
 * affordance the rest of the toolbar uses for long running operations and keeps
 * us from needing to invent a new place for a cancel button.
 */
export class HomeToolbarButton extends React.Component<
  IHomeToolbarButtonProps,
  {}
> {
  public render() {
    const { pullAll } = this.props

    if (pullAll === null) {
      return this.renderIdle()
    }

    if (isRunning(pullAll)) {
      return this.renderRunning(pullAll)
    }

    if (pullAll.results.length > 0) {
      return this.renderFinished(pullAll)
    }

    return this.renderIdle()
  }

  private renderRunning(state: IPullAllState) {
    const progress = state.total > 0 ? state.done / state.total : undefined
    const phase = state.phase === 'fetch' ? 'Fetching' : 'Updating'

    return (
      <ToolbarButton
        className="home-pull-button"
        style={ToolbarButtonStyle.Subtitle}
        title={`${phase}… ${state.done} of ${state.total}`}
        description={state.currentRepository ?? 'Hang on…'}
        tooltip="Click to stop after the current repository"
        icon={octicons.sync}
        iconClassName="spin"
        progressValue={progress}
        onClick={this.onCancel}
      />
    )
  }

  private renderFinished(state: IPullAllState) {
    const { results } = state

    const updated = countKind(results, 'updated')
    const failed = countKind(results, 'failed')
    const skipped = results.length - updated - failed

    const description = [
      updated > 0 && `${updated} updated`,
      skipped > 0 && `${skipped} skipped`,
      failed > 0 && `${failed} failed`,
    ]
      .filter(x => x !== false)
      .join(' · ')

    const icon: OcticonSymbol =
      failed > 0 ? octicons.alert : updated > 0 ? octicons.check : octicons.sync

    return (
      <ToolbarButton
        className="home-pull-button"
        style={ToolbarButtonStyle.Subtitle}
        title={
          state.phase === 'cancelled' ? 'Pull cancelled' : 'Pull complete'
        }
        description={description}
        tooltip="Pull updates in all of your repositories again"
        icon={icon}
        onClick={this.onPullAll}
      />
    )
  }

  private renderIdle() {
    const { pullableRepositoryCount, pullableCommitCount } = this.props

    if (pullableRepositoryCount === 0) {
      return (
        <ToolbarButton
          className="home-pull-button"
          style={ToolbarButtonStyle.Subtitle}
          title="Pull updates"
          description="Everything is up to date"
          tooltip="Fetch from the remote of every repository and bring the ones that can be fast-forwarded up to date"
          icon={octicons.download}
          onClick={this.onPullAll}
        />
      )
    }

    const repositoryGrammar = `${pullableRepositoryCount} repositor${
      pullableRepositoryCount === 1 ? 'y' : 'ies'
    }`

    return (
      <ToolbarButton
        className="home-pull-button"
        style={ToolbarButtonStyle.Subtitle}
        title="Pull updates"
        description={`${repositoryGrammar} · ${pullableCommitCount} commit${
          pullableCommitCount === 1 ? '' : 's'
        } behind`}
        tooltip={`Brings ${repositoryGrammar} up to date with their upstream branch. Repositories with uncommitted changes, unpushed commits or no upstream are left alone and reported.`}
        icon={octicons.download}
        onClick={this.onPullAll}
      />
    )
  }

  private onPullAll = () => {
    this.props.onPullAll()
  }

  private onCancel = () => {
    this.props.onCancel()
  }
}
