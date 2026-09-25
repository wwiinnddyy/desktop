import * as React from 'react'
import { Disposable } from 'event-kit'

import { Dispatcher } from '../dispatcher'
import { IHomeStoreState, HomeStore } from '../../lib/stores/home-store'
import { Account } from '../../models/account'
import {
  getGitHubHtmlUrl,
  ILocalRepositoryState,
  Repository,
} from '../../models/repository'
import { UiView } from '../ui-view'
import { TabBar } from '../tab-bar'
import { FilesChangedBadge } from '../changes/files-changed-badge'
import { Resizable } from '../resizable'
import { FocusContainer } from '../lib/focus-container'
import { IConstrainedValue } from '../../lib/app-state'
import {
  getRecentCommits,
  summarize,
  toHomeRepositoryInfos,
} from '../../lib/home/aggregate'
import { HomeTab, IHomeRepositoryInfo } from '../../lib/home/types'
import { needsAttention } from './group-home-repositories'
import { HomeRepositoryList } from './home-repository-list'
import { HomeCommitList } from './home-commit-list'
import { HomeRepositoryDetails } from './home-repository-details'
import { HomePullResults } from './home-pull-results'
import { HomeSummary } from './home-summary'

interface IHomeViewProps {
  readonly dispatcher: Dispatcher
  readonly homeStore: HomeStore

  /** Every repository that's been added to the app, cloning ones included. */
  readonly repositories: ReadonlyArray<Repository>

  readonly accounts: ReadonlyArray<Account>

  /** The shared ahead/behind and changed file cache from the app state. */
  readonly localRepositoryStateLookup: ReadonlyMap<
    number,
    ILocalRepositoryState
  >

  readonly sidebarWidth: IConstrainedValue
}

interface IHomeViewState {
  readonly selectedTab: HomeTab
  readonly filterText: string
  readonly selectedRepositoryId: number | null
  readonly homeState: IHomeStoreState
}

enum Tab {
  Changes,
  History,
}

/**
 * The Home view: one screen covering every repository the app knows about.
 *
 * It deliberately mirrors the layout of the repository view (toolbar, resizable
 * sidebar with two tabs, and a content area) rather than being its own new
 * thing, so that moving between "the overview" and "one repository" doesn't feel
 * like changing applications.
 */
export class HomeView extends React.Component<IHomeViewProps, IHomeViewState> {
  private storeSubscription: Disposable | null = null

  /**
   * A cheap stand in for comparing the set of repositories we were shown. The
   * app state hands out a new array on every update which makes reference
   * comparisons, and therefore memoization, useless here.
   */
  private repositoryKey = ''

  public constructor(props: IHomeViewProps) {
    super(props)

    this.state = {
      selectedTab: HomeTab.Changes,
      filterText: '',
      selectedRepositoryId: null,
      homeState: props.homeStore.getState(),
    }
  }

  public componentDidMount() {
    this.storeSubscription = this.props.homeStore.onDidUpdate(
      this.onHomeStoreUpdated
    )

    window.addEventListener('keydown', this.onGlobalKeyDown)

    this.repositoryKey = this.getRepositoryKey()
    this.ensureScanned()
  }

  public componentDidUpdate() {
    const repositoryKey = this.getRepositoryKey()

    if (repositoryKey !== this.repositoryKey) {
      this.repositoryKey = repositoryKey
      this.ensureScanned()
    }
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.onGlobalKeyDown)

    if (this.storeSubscription !== null) {
      this.storeSubscription.dispose()
      this.storeSubscription = null
    }
  }

  private onHomeStoreUpdated = (homeState: IHomeStoreState) => {
    this.setState({ homeState })
  }

  private ensureScanned() {
    this.props.homeStore.ensureRepositoriesScanned(
      this.props.repositories,
      this.props.accounts
    )
  }

  private onRefresh = () => {
    this.props.homeStore.refresh(this.props.repositories, this.props.accounts)
  }

  public render() {
    return (
      <UiView id="home">
        {this.renderSidebar()}
        {this.renderContent()}
      </UiView>
    )
  }

  private onGlobalKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    // Toggle tab selection on Ctrl+Tab, same as the repository view does. Note
    // that we don't care about the shift key since there's only two tabs.
    if (event.ctrlKey && event.key === 'Tab') {
      this.changeTab()
      event.preventDefault()
    }
  }

  private changeTab() {
    this.setState({
      selectedTab:
        this.state.selectedTab === HomeTab.History
          ? HomeTab.Changes
          : HomeTab.History,
    })
  }

  private onTabClicked = (tab: Tab) => {
    this.setState({
      selectedTab: tab === Tab.History ? HomeTab.History : HomeTab.Changes,
      // The two tabs filter completely different things so carrying the text
      // from one over to the other is only ever confusing.
      filterText: '',
    })
  }

  private getRepositoryKey() {
    return this.props.repositories.map(x => `${x.id}`).join(',')
  }

  private getInfos(): ReadonlyArray<IHomeRepositoryInfo> {
    return toHomeRepositoryInfos(
      this.props.repositories,
      this.props.localRepositoryStateLookup,
      this.state.homeState.scans
    )
  }

  private renderTabs(): JSX.Element {
    const infos = this.getInfos()
    const attentionCount = infos.filter(needsAttention).length

    const selectedIndex =
      this.state.selectedTab === HomeTab.Changes ? Tab.Changes : Tab.History

    return (
      <TabBar selectedIndex={selectedIndex} onTabClicked={this.onTabClicked}>
        <span className="with-indicator" id="home-changes-tab">
          <span>Repositories</span>
          {attentionCount > 0 && (
            <FilesChangedBadge filesChangedCount={attentionCount} />
          )}
        </span>

        <div className="with-indicator" id="home-history-tab">
          <span>Commits</span>
        </div>
      </TabBar>
    )
  }

  private renderSidebarContents(): JSX.Element {
    if (this.state.selectedTab === HomeTab.Changes) {
      return this.renderRepositoryList()
    }

    return this.renderCommitList()
  }

  private renderRepositoryList(): JSX.Element {
    const infos = this.getInfos()

    return (
      <HomeRepositoryList
        infos={infos}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        selectedRepository={this.getSelectedRepository(infos)}
        onSelectionChanged={this.onRepositorySelectionChanged}
      />
    )
  }

  private renderCommitList(): JSX.Element {
    const commits = getRecentCommits(this.getInfos())

    return (
      <HomeCommitList
        commits={commits}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        onSelectionChanged={this.onRepositorySelectionChanged}
      />
    )
  }

  private renderSidebar(): JSX.Element {
    const width = this.props.sidebarWidth

    return (
      <FocusContainer className="sidebar">
        <Resizable
          id="home-sidebar"
          width={width.value}
          maximumWidth={width.max}
          minimumWidth={width.min}
          onReset={this.handleSidebarWidthReset}
          onResize={this.handleSidebarResize}
          description="Home sidebar"
        >
          {this.renderTabs()}
          {this.renderSidebarContents()}
        </Resizable>
      </FocusContainer>
    )
  }

  private renderContent(): JSX.Element {
    const infos = this.getInfos()
    const selected = this.getSelectedInfo(infos)
    const state = this.state.homeState

    // Holding on to the narrowed value rather than a separate boolean keeps the
    // branch below from having to assert anything about the store state.
    const pullAll =
      state.pullAll !== null && state.pullAll.results.length > 0
        ? state.pullAll
        : null

    return (
      <div className="home-content">
        <HomeSummary
          summary={summarize(infos)}
          scanning={state.scanning}
          scanProgress={state.scanProgress}
          onRefresh={this.onRefresh}
        />
        {pullAll !== null ? (
          <HomePullResults
            pullAll={pullAll}
            onOpenRepository={this.onOpenRepository}
            onDismiss={this.onDismissResults}
          />
        ) : (
          <HomeRepositoryDetails
            info={selected}
            onOpenRepository={this.onOpenRepository}
            onViewOnGitHub={this.onViewOnGitHub}
          />
        )}
      </div>
    )
  }

  private onDismissResults = () => {
    this.props.homeStore.clearPullAllResults()
  }

  private getSelectedRepository(
    infos: ReadonlyArray<IHomeRepositoryInfo>
  ): Repository | null {
    const selected = this.getSelectedInfo(infos)

    return selected === null ? null : selected.repository
  }

  /**
   * The details pane always has something to show, which matters because the
   * whole point of the view is to be able to arrow through the list and read
   * about each repository without having to click into it first.
   */
  private getSelectedInfo(
    infos: ReadonlyArray<IHomeRepositoryInfo>
  ): IHomeRepositoryInfo | null {
    const { selectedRepositoryId } = this.state

    if (selectedRepositoryId !== null) {
      const selected = infos.find(x => x.repository.id === selectedRepositoryId)

      if (selected !== undefined) {
        return selected
      }
    }

    return infos.length > 0 ? infos[0] : null
  }

  private onRepositorySelectionChanged = (repository: Repository) => {
    this.setState({ selectedRepositoryId: repository.id })
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onOpenRepository = (repository: Repository) => {
    this.props.dispatcher.selectRepository(repository)
  }

  private onViewOnGitHub = (repository: Repository) => {
    const url = getGitHubHtmlUrl(repository)

    if (url !== null) {
      this.props.dispatcher.openInBrowser(url)
    }
  }

  private handleSidebarWidthReset = () => {
    this.props.dispatcher.resetSidebarWidth()
  }

  private handleSidebarResize = (width: number) => {
    this.props.dispatcher.setSidebarWidth(width)
  }
}
