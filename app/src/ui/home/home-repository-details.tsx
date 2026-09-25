import * as React from 'react'

import { Repository, getGitHubHtmlUrl, nameOf } from '../../models/repository'
import { Octicon, iconForRepository } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Button } from '../lib/button'
import { TooltippedContent } from '../lib/tooltipped-content'
import { RelativeTime } from '../relative-time'
import { shortenSHA } from '../../models/commit'
import { encodePathAsUrl } from '../../lib/path'
import { IHomeRepositoryInfo } from '../../lib/home/types'
import { canFastForwardFromSnapshot } from '../../lib/home/aggregate'

const BlankSlateImage = encodePathAsUrl(__dirname, 'static/empty-no-repo.svg')

interface IHomeRepositoryDetailsProps {
  readonly info: IHomeRepositoryInfo | null

  /** Called when the user asks to open the repository for real. */
  readonly onOpenRepository: (repository: Repository) => void

  /** Called when the user asks to see the repository in a browser. */
  readonly onViewOnGitHub: (repository: Repository) => void
}

/**
 * The Home view's stand-in for the diff pane: whatever repository the user has
 * moved selection to in the list, described well enough to decide whether to go
 * dig into it.
 */
export class HomeRepositoryDetails extends React.Component<
  IHomeRepositoryDetailsProps,
  {}
> {
  public render() {
    const { info } = this.props

    if (info === null) {
      return this.renderNoSelection()
    }

    const { repository, aheadBehind, changedFilesCount, scan } = info
    const htmlUrl = getGitHubHtmlUrl(repository)
    const pullable = canFastForwardFromSnapshot(info)

    return (
      <div className="home-repository-details">
        <div className="header">
          <Octicon symbol={iconForRepository(repository)} />
          <div className="titles">
            <div className="title">
              {repository.alias ?? nameOf(repository)}
            </div>
            <TooltippedContent
              className="path"
              tagName="div"
              tooltip={repository.path}
            >
              {repository.path}
            </TooltippedContent>
          </div>
        </div>

        <div className="rows">
          {repository.missing && (
            <div className="row error">
              <Octicon symbol={octicons.alert} />
              This repository can no longer be found at that location.
            </div>
          )}

          <div className="row">
            <span className="property">Branch</span>
            <span className="value">
              {scan !== null && scan.branchName !== null ? (
                <>
                  <Octicon symbol={octicons.gitBranch} />
                  {scan.branchName}
                </>
              ) : (
                'Unknown'
              )}
            </span>
          </div>

          <div className="row">
            <span className="property">Upstream</span>
            <span className="value">
              {aheadBehind === null
                ? 'None'
                : `${aheadBehind.ahead} ahead, ${aheadBehind.behind} behind`}
            </span>
          </div>

          <div className="row">
            <span className="property">Uncommitted changes</span>
            <span className="value">{changedFilesCount}</span>
          </div>

          {scan !== null && (
            <div className="row">
              <span className="property">Commits this week</span>
              <span className="value">
                {scan.commitCount ?? '–'}
                {scan.commitCount !== null && scan.commitCount > 0 && (
                  <span className="mine"> ({scan.myCommitCount} by you)</span>
                )}
              </span>
            </div>
          )}

          {scan !== null && scan.error !== null && (
            <div className="row error">
              <Octicon symbol={octicons.alert} />
              {scan.error}
            </div>
          )}

          {pullable && (
            <div className="row hint">
              <Octicon symbol={octicons.arrowDown} />
              Waiting to be pulled. Use <strong>Pull updates</strong> in the
              toolbar, or open the repository and pull from there.
            </div>
          )}
        </div>

        {this.renderRecentCommits(info)}

        <div className="actions">
          <Button
            type="button"
            className="open-repository"
            onClick={this.onOpenRepository}
          >
            Open repository
          </Button>

          {htmlUrl !== null && (
            <Button type="button" onClick={this.onViewOnGitHub}>
              View on GitHub
            </Button>
          )}
        </div>
      </div>
    )
  }

  private renderRecentCommits(info: IHomeRepositoryInfo) {
    const scan = info.scan

    if (scan === null || scan.recentCommits.length === 0) {
      return null
    }

    return (
      <div className="recent-commits">
        <div className="header">Most recent commits this week</div>
        {scan.recentCommits.slice(0, 5).map(commit => (
          <div className="commit" key={commit.sha}>
            <span className="sha">{shortenSHA(commit.shortSha)}</span>
            <span className="summary">{commit.summary}</span>
            <span className="author">{commit.authorName}</span>
            <RelativeTime
              className="date"
              date={commit.date}
              onlyRelative={true}
              tooltip={true}
            />
          </div>
        ))}
      </div>
    )
  }

  private renderNoSelection() {
    return (
      <div className="home-repository-details no-selection">
        <img src={BlankSlateImage} className="blankslate-image" alt="" />
        <div className="title">Pick a repository</div>
        <div className="description">
          Select a repository on the left to see what's going on with it, or use{' '}
          <strong>Pull updates</strong> to bring everything up to date at once.
        </div>
      </div>
    )
  }

  private onOpenRepository = () => {
    const { info } = this.props

    if (info !== null) {
      this.props.onOpenRepository(info.repository)
    }
  }

  private onViewOnGitHub = () => {
    const { info } = this.props

    if (info !== null) {
      this.props.onViewOnGitHub(info.repository)
    }
  }
}
