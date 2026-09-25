import * as React from 'react'

import { IMatches } from '../../lib/fuzzy-find'
import { Repository, nameOf } from '../../models/repository'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { SectionFilterList } from '../lib/section-filter-list'
import { HighlightText } from '../lib/highlight-text'
import { RelativeTime } from '../relative-time'
import { shortenSHA } from '../../models/commit'
import { IHomeCommit } from '../../lib/home/types'
import {
  IHomeCommitListItem,
  IHomeCommitGroupIdentifier,
  toHomeCommitGroup,
} from './group-home-repositories'

const RowHeight = 46

interface IHomeCommitListProps {
  /** Already merged across repositories and sorted newest first. */
  readonly commits: ReadonlyArray<IHomeCommit>
  readonly filterText: string
  readonly onFilterTextChanged: (text: string) => void

  /** Called when the user moves selection to another commit. */
  readonly onSelectionChanged: (repository: Repository) => void
}

/**
 * The cross repository commit feed. This is the "what has happened in the last
 * week, everywhere" half of the Home view and it's deliberately searchable by
 * summary, author and repository.
 */
export class HomeCommitList extends React.Component<IHomeCommitListProps, {}> {
  public render() {
    const groups = toHomeCommitGroup(this.props.commits)

    return (
      <div className="home-commit-list">
        <SectionFilterList<IHomeCommitListItem, IHomeCommitGroupIdentifier>
          rowHeight={RowHeight}
          groups={groups}
          selectedItem={null}
          filterText={this.props.filterText}
          onFilterTextChanged={this.props.onFilterTextChanged}
          placeholderText="Search commits"
          renderItem={this.renderItem}
          renderGroupHeader={this.renderGroupHeader}
          getItemAriaLabel={this.getItemAriaLabel}
          onSelectionChanged={this.onItemSelected}
          invalidationProps={{
            commits: this.props.commits,
            filterText: this.props.filterText,
          }}
          renderNoItems={this.renderNoItems}
        />
      </div>
    )
  }

  private onItemSelected = (item: IHomeCommitListItem | null) => {
    if (item !== null) {
      this.props.onSelectionChanged(item.commit.repository)
    }
  }

  private renderItem = (item: IHomeCommitListItem, matches: IMatches) => (
    <div className="home-commit-list-item" key={item.id}>
      <div className="summary">
        <HighlightText text={item.commit.summary} highlight={matches.title} />
      </div>
      <div className="meta">
        <span className="sha">{shortenSHA(item.commit.shortSha)}</span>
        <Octicon className="icon" symbol={octicons.person} />
        <span className="author">{item.commit.authorName}</span>
        <span className="separator">in</span>
        <span className="repository">{nameOf(item.commit.repository)}</span>
        <RelativeTime
          className="date"
          date={item.commit.date}
          onlyRelative={true}
          tooltip={true}
        />
      </div>
    </div>
  )

  private getItemAriaLabel = (item: IHomeCommitListItem) =>
    `${item.commit.summary} in ${nameOf(item.commit.repository)}`

  // The commit feed is one long chronological list, a group header would just
  // be noise on top of the tab label that's already saying the same thing.
  private renderGroupHeader = () => null

  private renderNoItems = () => (
    <div className="no-items">
      <div className="title">No commits this week</div>
      <div className="description">
        Nothing has been committed to any of your repositories in the past week.
      </div>
    </div>
  )
}
