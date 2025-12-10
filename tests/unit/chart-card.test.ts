import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ChartCard from '../../src/components/analytics/ChartCard.vue'

describe('ChartCard', () => {
  it('renders svg paths for multiple points', () => {
    const wrapper = mount(ChartCard, {
      props: {
        title: 'Test',
        subtitle: 'Sub',
        value: '123',
        points: [
          { x: 0, y: 1 },
          { x: 1, y: 3 },
          { x: 2, y: 2 }
        ]
      }
    })
    const paths = wrapper.findAll('path')
    expect(paths.length).toBeGreaterThan(0)
  })

  it('shows empty state when no data', () => {
    const wrapper = mount(ChartCard, {
      props: {
        title: 'Empty',
        points: []
      }
    })
    expect(wrapper.text()).toContain('暂无数据')
  })
})
