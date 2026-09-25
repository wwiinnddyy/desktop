import * as React from 'react'

import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Button } from '../lib/button'
import { formatCommitCount } from '../../lib/home/aggregate'
import { IHomeSummary } from '../../lib/home/types'

interface IHomeSummaryProps {
  readonly summary: IHomeSummary

  /** Whether a scan round is currently in flight. */
  readonly scanning: boolean

  readonly scanProgress: { readonly done: number; readonly total: number }

  readonly onRefresh: () => void
}

interface ISummaryCardProps {
  readonly symbol: OcticonSymbol
  readonly label: string
  readonly value: string | number
  readonly tooltip: string

  /** Whether to draw the eye to this card, eg when there's work to do. */
  readonly emphasis?: boolean
}

const SummaryCard = ({
  symbol,
  label,
  value,
  tooltip,
  emphasis,
}: ISummaryCardProps) => (
  <TooltippedContent
    className={emphasis === true ? 'summary-card emphasis' : 'summary-card'}
    tagName="div"
    tooltip={tooltip}
    onlyWhenOverflowed={false}
  >
    <div className="value">
      <Octicon symbol={symbol} />
      {value}
    </div>
    <div className="label">{label}</div>
  </TooltippedContent>
)

/**
 * The "how am I doing overall" strip at the top of the Home view's content
 * area. Everything here is derived from the same numbers that drive the "pull
 * updates" button so that the two can never disagree about what's going on.
 */
export class HomeSummary extends React.Component<IHomeSummaryProps, {}> {
  public render() {
    const { summary, scanning, scanProgress } = this.props

    return (
      <div className="home-summary">
        <div className="cards">
          <SummaryCard
            symbol={octicons.repo}
            value={summary.repositoryCount}
            label="repositories"
            tooltip={
              summary.missingRepositoryCount > 0
                ? `${summary.missingRepositoryCount} of them can't be found on disk`
                : 'Repositories you have added to Desktop'
            }
          />
          <SummaryCard
            symbol={octicons.tools}
            value={summary.totalChangedFiles}
            label="uncommitted changes"
            tooltip="Files that have been changed but not committed yet"
          />
          <SummaryCard
            symbol={octicons.arrowDown}
            value={summary.totalBehind}
            label="commits to pull"
            emphasis={summary.totalBehind > 0}
            tooltip={
              summary.repositoriesBehind === 0
                ? 'Every repository is up to date with its upstream branch'
                : `${summary.totalBehind} commits that ${
                    summary.repositoriesBehind
                  } repositor${
                    summary.repositoriesBehind === 1 ? 'y is' : 'ies are'
                  } behind, waiting to be pulled`
            }
          />
          <SummaryCard
            symbol={octicons.check}
            value={formatCommitCount(summary.commitCount)}
            label="commits this week"
            tooltip={this.getCommitTooltip()}
          />
        </div>

        <div className="status">
          {scanning ? (
            <span className="scanning">
              Counting commits in your repositories… {scanProgress.done} of{' '}
              {scanProgress.total}
            </span>
          ) : (
            <Button className="refresh" onClick={this.props.onRefresh}>
              Refresh
              <Octicon className="icon" symbol={octicons.sync} />
            </Button>
          )}
        </div>
      </div>
    )
  }

  private getCommitTooltip() {
    const { summary } = this.props

    if (summary.repositoriesWithCommits === 0) {
      return summary.scannedCount === 0
        ? 'Counting the commits of the past week in every repository'
        : 'No commits in the past week in any of your repositories'
    }

    const mine =
      summary.myCommitCount === 0
        ? ''
        : `, ${summary.myCommitCount} of them by you`

    return `${formatCommitCount(
      summary.commitCount
    )} commits in the past week${mine}, across ${
      summary.repositoriesWithCommits
    } of your repositories`
  }
}
