import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as React from 'react'

import { HomeTotalSummary } from '../../../src/ui/home/home-total-summary'
import { IHomeSummary } from '../../../src/lib/home/types'
import { render, screen } from '../../helpers/ui/render'

const summary: IHomeSummary = {
  repositoryCount: 4,
  missingRepositoryCount: 1,
  totalChangedFiles: 7,
  totalBehind: 3,
  repositoriesBehind: 2,
  commitCount: 12,
  myCommitCount: 5,
  repositoriesWithCommits: 2,
  pullableCount: 1,
  pullableCommitCount: 1,
  scannedCount: 3,
  totalCount: 4,
}

describe('HomeTotalSummary', () => {
  it('shows the global totals above the repository list', () => {
    render(<HomeTotalSummary summary={summary} />)

    assert.ok(screen.getByText('Total'))
    assert.ok(screen.getByText('4'))
    assert.ok(screen.getByText('7'))
    assert.ok(screen.getByText('3'))
    assert.ok(screen.getByText('12'))
    assert.ok(screen.getByText('repositories'))
    assert.ok(screen.getByText('uncommitted'))
    assert.ok(screen.getByText('to pull'))
    assert.ok(screen.getByText('this week'))
  })
})
