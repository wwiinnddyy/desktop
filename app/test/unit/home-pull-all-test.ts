import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  decideRepositoryAction,
  describeDecision,
  IRepositoryPullSnapshot,
} from '../../src/lib/home/pull-all'

function snapshot(
  overrides: Partial<IRepositoryPullSnapshot> = {}
): IRepositoryPullSnapshot {
  return {
    missing: false,
    branchName: 'main',
    upstreamRef: 'origin/main',
    aheadBehind: { ahead: 0, behind: 1 },
    changedFilesCount: 0,
    ...overrides,
  }
}

describe('Home pull all', () => {
  describe('#decideRepositoryAction', () => {
    it('fast-forwards a clean branch that is purely behind', () => {
      assert.equal(decideRepositoryAction(snapshot()), 'fast-forward')
    })

    it('leaves repositories with uncommitted changes alone', () => {
      assert.equal(
        decideRepositoryAction(snapshot({ changedFilesCount: 3 })),
        'skipped-dirty'
      )
    })

    it('leaves diverged branches alone', () => {
      assert.equal(
        decideRepositoryAction(
          snapshot({ aheadBehind: { ahead: 2, behind: 1 } })
        ),
        'skipped-diverged'
      )
    })

    it('reports branches with nothing to pull as up to date', () => {
      assert.equal(
        decideRepositoryAction(
          snapshot({ aheadBehind: { ahead: 0, behind: 0 } })
        ),
        'skipped-up-to-date'
      )

      assert.equal(
        decideRepositoryAction(
          snapshot({ aheadBehind: { ahead: 1, behind: 0 } })
        ),
        'skipped-up-to-date'
      )
    })

    it('needs an upstream to pull from', () => {
      assert.equal(
        decideRepositoryAction(snapshot({ upstreamRef: null })),
        'skipped-no-upstream'
      )

      assert.equal(
        decideRepositoryAction(snapshot({ aheadBehind: null })),
        'skipped-no-upstream'
      )
    })

    it('will not touch a detached or unborn head', () => {
      assert.equal(
        decideRepositoryAction(snapshot({ branchName: null })),
        'skipped-detached'
      )
    })

    it('notices a repository that has gone missing', () => {
      assert.equal(
        decideRepositoryAction(snapshot({ missing: true })),
        'skipped-missing'
      )
    })

    it('checks for a missing repository before anything else', () => {
      // Both of these would be reported differently if the order changed, and a
      // missing repository is the one case where we know the state we're being
      // handed is a leftover from before it went away.
      assert.equal(
        decideRepositoryAction(
          snapshot({ missing: true, branchName: null, changedFilesCount: 2 })
        ),
        'skipped-missing'
      )
    })

    it('checks the branch before the working directory', () => {
      assert.equal(
        decideRepositoryAction(
          snapshot({ branchName: null, changedFilesCount: 2 })
        ),
        'skipped-detached'
      )
    })
  })

  describe('#describeDecision', () => {
    it('names the repository it is talking about', () => {
      assert.equal(
        describeDecision('skipped-dirty', 'my-app'),
        'my-app has uncommitted changes'
      )

      assert.equal(
        describeDecision('skipped-missing', 'my-app'),
        "my-app can't be found on disk"
      )
    })

    it('phrases the action it is about to take', () => {
      assert.equal(
        describeDecision('fast-forward', 'my-app'),
        'my-app will be brought up to date'
      )
    })
  })
})
