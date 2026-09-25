import * as React from 'react'

import { Repository, nameOf } from '../../models/repository'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Button } from '../lib/button'
import { IPullAllResult, IPullAllState } from '../../lib/home/types'

interface IHomePullResultsProps {
  readonly pullAll: IPullAllState

  /** Called when the user asks to look at one of the repositories. */
  readonly onOpenRepository: (repository: Repository) => void

  /** Called to throw the results away and get the summary back. */
  readonly onDismiss: () => void
}

const isSuccess = (result: IPullAllResult) => result.kind === 'updated'

const isFailure = (result: IPullAllResult) =>
  result.kind === 'failed' || result.kind === 'skipped-diverged'

interface IResultRowProps {
  readonly result: IPullAllResult
  readonly symbol: OcticonSymbol
  readonly onOpenRepository: (repository: Repository) => void
}

class ResultRow extends React.Component<IResultRowProps> {
  public render() {
    const { result, symbol } = this.props
    const repository = result.repository

    return (
      <div className="result">
        <Octicon className="icon" symbol={symbol} />
        <span className="name">{nameOf(repository)}</span>
        <span className="message">{result.message}</span>
        <Button
          className="open"
          size="small"
          tooltip={`Open ${nameOf(repository)} in Desktop`}
          onClick={this.onOpen}
        >
          Open
        </Button>
      </div>
    )
  }

  private onOpen = () => {
    this.props.onOpenRepository(this.props.result.repository)
  }
}

/**
 * The receipt from a "pull updates everywhere" run.
 *
 * This is deliberately loud: the operation touches a lot of repositories without
 * asking about each one, and the honest thing to do is show exactly which ones
 * were left alone, and why, as soon as it's over.
 */
export class HomePullResults extends React.Component<
  IHomePullResultsProps,
  {}
> {
  public render() {
    const { pullAll } = this.props

    const updated = pullAll.results.filter(isSuccess)
    const problems = pullAll.results.filter(isFailure)
    const skipped = pullAll.results.filter(x => !isSuccess(x) && !isFailure(x))

    const running = pullAll.phase === 'fetch' || pullAll.phase === 'merge'

    return (
      <div className="home-pull-results">
        <div className="header">
          <div className="title">{this.getTitle(running)}</div>
          <Button
            className="dismiss"
            size="small"
            onClick={this.props.onDismiss}
          >
            Dismiss
            <Octicon className="icon" symbol={octicons.x} />
          </Button>
        </div>

        <div className="counts">
          <span className="updated">{updated.length} updated</span>
          <span className="skipped">{skipped.length} skipped</span>
          <span className="problems">{problems.length} need attention</span>
        </div>

        {problems.length > 0 && (
          <div className="section">
            <div className="section-header">Couldn't be updated</div>
            {problems.map(x => (
              <ResultRow
                key={x.repository.id}
                result={x}
                symbol={octicons.alert}
                onOpenRepository={this.props.onOpenRepository}
              />
            ))}
          </div>
        )}

        {updated.length > 0 && (
          <div className="section">
            <div className="section-header">Updated</div>
            {updated.map(x => (
              <ResultRow
                key={x.repository.id}
                result={x}
                symbol={octicons.check}
                onOpenRepository={this.props.onOpenRepository}
              />
            ))}
          </div>
        )}

        {skipped.length > 0 && (
          <div className="section">
            <div className="section-header">Left alone</div>
            {skipped.map(x => (
              <ResultRow
                key={x.repository.id}
                result={x}
                symbol={octicons.dash}
                onOpenRepository={this.props.onOpenRepository}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  private getTitle(running: boolean) {
    const { pullAll } = this.props

    if (running) {
      return `Pulling updates… ${pullAll.done} of ${pullAll.total}`
    }

    return pullAll.phase === 'cancelled' ? 'Pull stopped' : 'Pull finished'
  }
}
