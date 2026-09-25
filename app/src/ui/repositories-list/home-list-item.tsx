import * as React from 'react'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Tooltip } from '../lib/tooltip'
import { createObservableRef } from '../lib/observable-ref'

interface IHomeListItemProps {
  /** Whether or not the Home view is what's currently being shown. */
  readonly isActive: boolean

  /** The number of repositories the Home view will show. */
  readonly repositoryCount: number

  /** Called when the user activates the Home row. */
  readonly onClick: () => void
}

/**
 * The "Home" row at the top of the repository switcher, above the Recent
 * group. Unlike the repository rows this is not part of the virtualized,
 * filterable list: it's a destination rather than a repository so it should
 * stay put regardless of what the user has typed into the filter.
 */
export class HomeListItem extends React.Component<IHomeListItemProps, {}> {
  private readonly listItemRef = createObservableRef<HTMLButtonElement>()

  public render() {
    const { isActive, repositoryCount } = this.props

    return (
      <button
        type="button"
        className="home-list-item"
        ref={this.listItemRef}
        aria-current={isActive ? 'true' : undefined}
        onClick={this.props.onClick}
      >
        <Tooltip target={this.listItemRef}>{this.renderTooltip()}</Tooltip>

        <Octicon className="icon-for-repository" symbol={octicons.home} />

        <div className="name">Home</div>

        {repositoryCount > 0 && (
          <div className="repository-count">{repositoryCount}</div>
        )}
      </button>
    )
  }

  private renderTooltip() {
    const { repositoryCount } = this.props

    return (
      <>
        <div>
          <strong>All repositories</strong>
        </div>
        <div>
          {repositoryCount === 1
            ? '1 repository added to Desktop'
            : `${repositoryCount} repositories added to Desktop`}
        </div>
      </>
    )
  }
}
