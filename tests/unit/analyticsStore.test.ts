import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../src/services/db', () => {
  const aggregateUsage = vi.fn().mockResolvedValue({ data: [], pagination: { limit: 100, offset: 0 } })
  const drillDownUsage = vi.fn().mockResolvedValue({ data: [], pagination: { limit: 50 } })
  return {
    dbService: {
      aggregateUsage,
      drillDownUsage
    }
  }
})

import { dbService } from '../../src/services/db'
import { useAnalyticsStore } from '../../src/stores/analyticsStore'

describe('analyticsStore filters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('applies status=error filter for reliability view', async () => {
    const store = useAnalyticsStore()
    await store.refreshReliability({ days: 7 })
    expect(dbService.aggregateUsage).toHaveBeenCalled()
    const params = (dbService.aggregateUsage as unknown as { mock: { calls: any[][] } }).mock.calls[0][0]
    expect(params.filters?.status).toBe('error')
  })

  it('omits project filter when projectId is null in drill-down', async () => {
    const store = useAnalyticsStore()
    await store.refreshDrilldown({ days: 7, provider: null, model: null, status: null, projectId: null })
    expect(dbService.drillDownUsage).toHaveBeenCalled()
    const params = (dbService.drillDownUsage as unknown as { mock: { calls: any[][] } }).mock.calls[0][0]
    expect(params.filters?.projectId).toBeUndefined()
  })
})
