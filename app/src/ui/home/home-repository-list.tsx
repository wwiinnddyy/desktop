import * as React from 'react'

import { IMatches } from '../../lib/fuzzy-find'
import { Repository, nameOf } from '../../models/repository'
import { Octicon, iconForRepository } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { SectionFilterList } from '../lib/section-filter-list'
import { IFilterListGroup } from '../lib/filter-list'
import { HighlightText } from '../lib/highlight-text'
import { TooltippedContent } from '../lib/tooltipped-content'
import { FilesChangedBadge } from '../changes/files-changed-badge'
import { formatCommitCount } from '../../lib/home/aggregate'
import { IHomeRepositoryInfo } from '../../lib/home/types'
import {
  groupHomeRepositories,
  IHomeRepositoryGroupIdentifier,
  IHomeRepositoryListItem,
} from './group-home-repositories'
import { assertNever } from '../../lib/fatal-error'

const RowHeight = 48

interface IHomeRepositoryListProps {
  readonly infos: ReadonlyArray<IHomeRepositoryInfo>
  readonly filterText: string
  readonly onFilterTextChanged: (text: string) => void

  /** The repository the details pane is currently all about, if any. */
  readonly selectedRepository: Repository | null

  /** Called when the user moves selection to another repository. */
  readonly onSelectionChanged: (repository: Repository) => void
}

type RepositoryGroups = ReadonlyArray<
  IFilterListGroup<IHomeRepositoryListItem, IHomeRepositoryGroupIdentifier>
>

const getGroupLabel = (identifier: IHomeRepositoryGroupIdentifier) => {
  switch (identifier.kind) {
    case 'attention':
      return 'Needs attention'
    case 'calm':
      return 'All the rest'
    default:
      return assertNever(identifier, `Unknown repository group ${identifier}`)
  }
}

function findItem(
  groups: RepositoryGroups,
  repository: Repository
): IHomeRepositoryListItem | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (item.info.repository.id === repository.id) {
        return item
      }
    }
  }

  return null
}

/**
 * The searchable list of every repository that's been added to the app, which
 * is the main interaction in the Home view.
 */
export class HomeRepositoryList extends React.Component<
  IHomeRepositoryListProps,
  {}
> {
  public render() {
    const groups = groupHomeRepositories(this.props.infos)

    const selected =
      this.props.selectedRepository === null
        ? null
        : findItem(groups, this.props.selectedRepository)

    return (
      <div className="home-repository-list">
        <SectionFilterList<
          IHomeRepositoryListItem,
          IHomeRepositoryGroupIdentifier
        >
          rowHeight={RowHeight}
          groups={groups}
          selectedItem={selected}
          filterText={this.props.filterText}
          onFilterTextChanged={this.props.onFilterTextChanged}
          placeholderText="Search repositories"
          renderItem={this.renderItem}
          renderGroupHeader={this.renderGroupHeader}
          getItemAriaLabel={this.getItemAriaLabel}
          getGroupAriaLabel={this.getGroupAriaLabel(groups)}
          onSelectionChanged={this.onItemSelected}
          invalidationProps={{
            infos: this.props.infos,
            filterText: this.props.filterText,
          }}
          renderNoItems={this.renderNoItems}
        />
      </div>
    )
  }

  private onItemSelected = (item: IHomeRepositoryListItem | null) => {
    if (item !== null) {
      this.props.onSelectionChanged(item.info.repository)
    }
  }

  private renderItem = (item: IHomeRepositoryListItem, matches: IMatches) => (
    <HomeRepositoryListItem key={item.id} info={item.info} matches={matches} />
  )

  private getItemAriaLabel = (item: IHomeRepositoryListItem) =>
    nameOf(item.info.repository)

  private getGroupAriaLabel = (groups: RepositoryGroups) => (group: number) =>
    getGroupLabel(groups[group].identifier)

  private renderGroupHeader = (identifier: IHomeRepositoryGroupIdentifier) => (
    <div className="filter-list-group-header">{getGroupLabel(identifier)}</div>
  )

  private renderNoItems = () => (
    <div className="no-items">
      <div className="title">No repositories match that search</div>
    </div>
  )
}

interface IHomeRepositoryListItemProps {
  readonly info: IHomeRepositoryInfo
  readonly matches: IMatches
}

const HomeRepositoryListItem = ({
  info,
  matches,
}: IHomeRepositoryListItemProps) => {
  const { repository, aheadBehind, changedFilesCount, scan } = info
  const gitHubRepository = repository.gitHubRepository
  const alias = repository.alias
  const title = alias ?? repository.name

  const branchName = scan !== null ? scan.branchName : null
  const commitCount = scan !== null ? scan.commitCount : null

  return (
    <div className="home-repository-list-item">
      <Octicon className="icon" symbol={iconForRepository(repository)} />

      <div className="details">
        <div className="title">
          {alias === null && gitHubRepository !== null && (
            <span className="prefix">{gitHubRepository.owner.login}/</span>
          )}
          <HighlightText text={title} highlight={matches.title} />
        </div>

        <div className="subtitle">
          {repository.missing ? (
            <span className="missing">Missing from disk</span>
          ) : branchName !== null ? (
            <TooltippedContent
              className="branch"
              tagName="span"
              tooltip={`The currently checked out branch is ${branchName}`}
            >
              <Octicon symbol={octicons.gitBranch} />
              {branchName}
            </TooltippedContent>
          ) : (
            <span className="path">{repository.path}</span>
          )}

          {commitCount !== null && commitCount > 0 && (
            <span className="commit-count">
              {formatCommitCount(commitCount)} this week
            </span>
          )}
        </div>
      </div>

      <div className="indicators">
        {changedFilesCount > 0 && (
          <TooltippedContent
            tagName="div"
            tooltip={`There ${
              changedFilesCount === 1 ? 'is' : 'are'
            } ${changedFilesCount} file${
              changedFilesCount === 1 ? '' : 's'
            } with uncommitted changes`}
          >
            <FilesChangedBadge filesChangedCount={changedFilesCount} />
          </TooltippedContent>
        )}

        {aheadBehind !== null && aheadBehind.behind > 0 && (
          <TooltippedContent
            tagName="div"
            className="behind"
            tooltip={`Behind its upstream branch by ${
              aheadBehind.behind
            } commit${aheadBehind.behind === 1 ? '' : 's'}`}
          >
            <Octicon symbol={octicons.arrowDown} />
            {aheadBehind.behind}
          </TooltippedContent>
        )}

        {aheadBehind !== null && aheadBehind.ahead > 0 && (
          <TooltippedContent
            tagName="div"
            className="ahead"
            tooltip={`Ahead of its upstream branch by ${
              aheadBehind.ahead
            } commit${aheadBehind.ahead === 1 ? '' : 's'}`}
          >
            <Octicon symbol={octicons.arrowUp} />
            {aheadBehind.ahead}
          </TooltippedContent>
        )}
      </div>
    </div>
  )
}
