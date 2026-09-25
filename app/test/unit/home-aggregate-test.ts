import { describe, it } from 'node:test'
import assert from 'node:assert'

import { Repository } from '../../src/models/repository'
import {
  canFastForwardFromSnapshot,
  formatCommitCount,
  getRecentCommits,
  summarize,
  toHomeRepositoryInfos,
} from '../../src/lib/home/aggregate'
import {
  IHomeCommit,
  IHomeRepositoryInfo,
  IRepositoryScanResult,
  MaxCommitsPerRepository,
} from '../../src/lib/home/types'

function createRepository(
  id: number,
  name: string,
  missing: boolean = false
): Repository {
  return new Repository(`C:/repos/${name}`, id, null, missing, null)
}

function createScan(
  repository: Repository,
  commitCount: number,
  myCommitCount: number = 0,
  recentCommits: ReadonlyArray<IHomeCommit> = []
): IRepositoryScanResult {
  return {
    repository,
    branchName: 'main',
    scannedRef: 'refs/remotes/origin/main',
    commitCount,
    myCommitCount,
    recentCommits,
    truncated: false,
    error: null,
    scannedAt: 1,
  }
}

function createInfo(
  id: number,
  name: string,
  ahead: number = 0,
  behind: number = 0,
  changedFilesCount: number = 0,
  scan: IRepositoryScanResult | null = null,
  missing: boolean = false
): IHomeRepositoryInfo {
  const repository = createRepository(id, name, missing)

  return {
    repository,
    aheadBehind: ahead === 0 && behind === 0 ? null : { ahead, behind: behind },
    changedFilesCount,
    scan,
  }
}

function createCommit(
  repository: Repository,
  sha: string,
  date: Date
): IHomeCommit {
  return {
    repository,
    sha,
    shortSha: sha.substring(0, 7),
    summary: `Commit ${sha}`,
    authorName: 'Somebody',
    authorEmail: 'somebody@example.com',
    date,
  }
}

describe('Home aggregate', () => {
  describe('#canFastForwardFromSnapshot', () => {
    it('is true for a clean branch that is purely behind', () => {
      const info = createInfo(1, 'a', 0, 3)
      assert.ok(canFastForwardFromSnapshot(info))
    })

    it('is false when there is anything uncommitted', () => {
      const info = createInfo(1, 'a', 0, 3, 1)
      assert.ok(!canFastForwardFromSnapshot(info))
    })

    it('is false when the branch has diverged', () => {
      const info = createInfo(1, 'a', 1, 3)
      assert.ok(!canFastForwardFromSnapshot(info))
    })

    it('is false when there is nothing to pull', () => {
      assert.ok(!canFastForwardFromSnapshot(createInfo(1, 'a')))
      assert.ok(!canFastForwardFromSnapshot(createInfo(1, 'a', 2, 0)))
    })

    it('is false when the repository is gone from disk', () => {
      const info = createInfo(1, 'a', 0, 3, 0, null, true)
      assert.ok(!canFastForwardFromSnapshot(info))
    })
  })

  describe('#toHomeRepositoryInfos', () => {
    it('merges the shared indicator cache with the scans', () => {
      const repository = createRepository(7, 'seven')
      const lookup = new Map([
        [7, { aheadBehind: { ahead: 1, behind: 2 }, changedFilesCount: 4 }],
      ])
      const scan = createScan(repository, 5, 2)

      const infos = toHomeRepositoryInfos(
        [repository],
        lookup,
        new Map([[7, scan]])
      )

      assert.equal(infos.length, 1)
      assert.deepStrictEqual(infos[0].aheadBehind, { ahead: 1, behind: 2 })
      assert.equal(infos[0].changedFilesCount, 4)
      assert.equal(infos[0].scan, scan)
    })

    it('copes with repositories that have no cached state at all', () => {
      const infos = toHomeRepositoryInfos(
        [createRepository(7, 'seven')],
        new Map(),
        new Map()
      )

      assert.equal(infos[0].aheadBehind, null)
      assert.equal(infos[0].changedFilesCount, 0)
      assert.equal(infos[0].scan, null)
    })

    it('sorts the repositories that need attention first', () => {
      const infos = toHomeRepositoryInfos(
        [
          createRepository(1, 'quiet'),
          createRepository(2, 'behind'),
          createRepository(3, 'dirty'),
        ],
        new Map([
          [2, { aheadBehind: { ahead: 0, behind: 1 }, changedFilesCount: 0 }],
          [3, { aheadBehind: null, changedFilesCount: 2 }],
        ]),
        new Map()
      )

      assert.deepStrictEqual(
        infos.map(x => x.repository.name),
        ['behind', 'dirty', 'quiet']
      )
    })
  })

  describe('#summarize', () => {
    it('adds up the per repository numbers', () => {
      const a = createRepository(1, 'a')
      const b = createRepository(2, 'b')

      const summary = summarize([
        createInfo(1, 'a', 0, 3, 2, createScan(a, 10, 4)),
        createInfo(2, 'b', 0, 1, 0, createScan(b, 1, 1)),
        createInfo(3, 'c', 0, 0, 5, null),
      ])

      assert.equal(summary.repositoryCount, 3)
      assert.equal(summary.totalChangedFiles, 7)
      assert.equal(summary.totalBehind, 4)
      assert.equal(summary.repositoriesBehind, 2)
      assert.equal(summary.commitCount, 11)
      assert.equal(summary.myCommitCount, 5)
      assert.equal(summary.repositoriesWithCommits, 2)
      assert.equal(summary.pullableCount, 1)
      assert.equal(summary.pullableCommitCount, 1)
      assert.equal(summary.scannedCount, 2)
      assert.equal(summary.totalCount, 3)
    })

    it('treats unscanned repositories as unknown rather than zero activity', () => {
      const summary = summarize([
        createInfo(1, 'a', 0, 0, 0, null),
        createInfo(2, 'b', 0, 0, 0, createScan(createRepository(2, 'b'), 0)),
      ])

      assert.equal(summary.commitCount, 0)
      assert.equal(summary.scannedCount, 1)
      assert.equal(summary.repositoriesWithCommits, 0)
    })

    it('counts missing repositories without letting them be pullable', () => {
      const summary = summarize([createInfo(1, 'a', 0, 4, 0, null, true)])

      assert.equal(summary.missingRepositoryCount, 1)
      assert.equal(summary.pullableCount, 0)
      assert.equal(summary.totalBehind, 0)
    })
  })

  describe('#getRecentCommits', () => {
    it('merges feeds from every repository, newest first', () => {
      const a = createRepository(1, 'a')
      const b = createRepository(2, 'b')

      const commits = getRecentCommits([
        {
          ...createInfo(1, 'a'),
          scan: createScan(a, 2, 0, [
            createCommit(a, 'aaaa', new Date(1000)),
            createCommit(a, 'bbbb', new Date(2000)),
          ]),
        },
        {
          ...createInfo(2, 'b'),
          scan: createScan(b, 1, 0, [createCommit(b, 'cccc', new Date(1500))]),
        },
      ])

      assert.deepStrictEqual(
        commits.map(x => x.sha),
        ['bbbb', 'cccc', 'aaaa']
      )
    })

    it('caps how many commits it hands back', () => {
      const repository = createRepository(1, 'a')
      const commits = new Array<IHomeCommit>()

      for (let i = 0; i < 10; i++) {
        commits.push(createCommit(repository, `${i}`, new Date(i * 1000)))
      }

      const merged = getRecentCommits(
        [
          {
            ...createInfo(1, 'a'),
            scan: createScan(repository, 10, 0, commits),
          },
        ],
        3
      )

      assert.equal(merged.length, 3)
      assert.equal(merged[0].sha, '9')
    })
  })

  describe('#formatCommitCount', () => {
    it('shows nothing as unknown rather than zero', () => {
      assert.equal(formatCommitCount(null), '–')
    })

    it('is honest about hitting the scan ceiling', () => {
      assert.equal(
        formatCommitCount(MaxCommitsPerRepository),
        `${MaxCommitsPerRepository}+`
      )
      assert.equal(formatCommitCount(MaxCommitsPerRepository - 1), '999')
    })
  })
})
