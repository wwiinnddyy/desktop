import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import * as React from 'react'

import { SectionFilterList } from '../../../src/ui/lib/section-filter-list'
import { IFilterListItem } from '../../../src/ui/lib/filter-list'
import { render } from '../../helpers/ui/render'

type ITestItem = IFilterListItem

class TestResizeObserver {
  public observe() {}
  public unobserve() {}
  public disconnect() {}
}

beforeEach(() => {
  Object.assign(globalThis, { ResizeObserver: TestResizeObserver })
  if (typeof window !== 'undefined') {
    Object.assign(window, { ResizeObserver: TestResizeObserver })
  }
})

const item: ITestItem = { id: 'repository', text: ['repository'] }
const renderPreList = () => <div data-testid="pre-list" />
const renderPreContent = () => <div data-testid="home" />
const renderItem = (testItem: ITestItem) => <div>{testItem.id}</div>
const onFilterTextChanged = () => {}

describe('SectionFilterList pre-content', () => {
  it('renders pre-content after the filter and before the list', () => {
    const view = render(
      <SectionFilterList<ITestItem, string>
        rowHeight={30}
        groups={[{ identifier: 'recent', items: [item] }]}
        selectedItem={null}
        renderItem={renderItem}
        renderPreList={renderPreList}
        renderPreContent={renderPreContent}
        filterText=""
        onFilterTextChanged={onFilterTextChanged}
        invalidationProps={{}}
      />
    )

    const filterList = view.container.querySelector('.filter-list')
    const children = Array.from(filterList?.children ?? [])

    const filterIndex = children.findIndex(child =>
      child.classList.contains('filter-field-row')
    )
    const homeIndex = children.findIndex(
      child => child.getAttribute('data-testid') === 'home'
    )
    const listIndex = children.findIndex(child =>
      child.classList.contains('filter-list-container')
    )

    assert.ok(filterIndex >= 0)
    assert.ok(filterIndex < homeIndex)
    assert.ok(homeIndex < listIndex)
  })
})
