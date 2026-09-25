import * as React from 'react'

import { formatCommitCount } from '../../lib/home/aggregate'
import { IHomeSummary } from '../../lib/home/types'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IHomeTotalSummaryProps {
  readonly summary: IHomeSummary
}

interface ITotalStatProps {
  readonly symbol: OcticonSymbol
  readonly value: string | number
  readonly label: string
}

const TotalStat = ({ symbol, value, label }: ITotalStatProps) => (
  <div className="total-stat">
    <div className="value">
      <Octicon symbol={symbol} />
      {value}
    </div>
    <div className="label">{label}</div>
  </div>
)

export class HomeTotalSummary extends React.Component<
  IHomeTotalSummaryProps,
  {}
> {
  public render() {
    const { summary } = this.props

    return (
      <section className="home-total-summary" aria-label="Total overview">
        <div className="title">Total</div>
        <div className="stats">
          <TotalStat
            symbol={octicons.repo}
            value={summary.repositoryCount}
            label="repositories"
          />
          <TotalStat
            symbol={octicons.tools}
            value={summary.totalChangedFiles}
            label="uncommitted"
          />
          <TotalStat
            symbol={octicons.arrowDown}
            value={summary.totalBehind}
            label="to pull"
          />
          <TotalStat
            symbol={octicons.check}
            value={formatCommitCount(summary.commitCount)}
            label="this week"
          />
        </div>
      </section>
    )
  }
}
