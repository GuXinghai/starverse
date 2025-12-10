import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

vi.mock('../../src/stores/analyticsStore', () => {
  const overview = {
    data: [
      { bucket_start: 0, cost: 1, tokens_total: 10, effective_tokens: 8, request_count: 2, avg_latency: 100, p50_latency: 90, p90_latency: 110, success_rate: 1, error_rate: 0 }
    ],
    pagination: { limit: 10, offset: 0 }
  }
  const overviewStatus = {
    data: [{ status: 'success', request_count: 2, cost: 1 }],
    pagination: { limit: 10, offset: 0 }
  }
  const comparison = {
    data: [{ provider: 'OpenRouter', model: 'm1', cost_per_1k_tokens: 0.1, success_rate: 1, avg_latency: 100, cost: 1 }],
    pagination: { limit: 10, offset: 0 }
  }
  const reliability = {
    data: [{ error_code: 'TIMEOUT', request_count: 1 }],
    pagination: { limit: 10, offset: 0 }
  }
  const drilldown = { data: [], pagination: { limit: 50 } }

  const refresh = vi.fn()

  return {
    useAnalyticsStore: () => ({
      overview,
      overviewStatus,
      comparison,
      reliability,
      drilldown,
      loading: ref(false),
      error: ref(null),
      refreshOverview: refresh,
      refreshComparison: refresh,
      refreshReliability: refresh,
      refreshDrilldown: refresh,
      toSeries: (_: any, field: string) => [{ x: 0, y: (overview.data[0] as any)[field] ?? 0 }]
    })
  }
})

import AnalyticsView from '../../src/components/AnalyticsView.vue'

describe('AnalyticsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dashboard headings', () => {
    const wrapper = mount(AnalyticsView)
    expect(wrapper.text()).toContain('Starverse Usage Dashboard')
    expect(wrapper.text()).toContain('全局概览')
  })

  it('shows KPI values based on overview data', () => {
    const wrapper = mount(AnalyticsView)
    expect(wrapper.text()).toContain('$1.000')
  })
})
