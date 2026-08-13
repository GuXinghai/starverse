import { describe, expect, it } from 'vitest'
import { modelRecentUsageForCreatedOperation } from './modelRecentUsage'

describe('modelRecentUsageForCreatedOperation', () => {
  const ref = { providerId: 'openrouter' as const, modelId: 'openai/gpt-4o' }

  it('records exactly the ordinary route accepted as a newly created operation', () => {
    expect(modelRecentUsageForCreatedOperation({ ok: true, kind: 'created' }, ref)).toEqual(ref)
  })

  it('does not record idempotent replay, rejection, or compatible routes', () => {
    expect(modelRecentUsageForCreatedOperation({ ok: true, kind: 'idempotent_replay' }, ref)).toBeNull()
    expect(modelRecentUsageForCreatedOperation({ ok: false }, ref)).toBeNull()
    expect(modelRecentUsageForCreatedOperation({ ok: true, kind: 'created' }, null)).toBeNull()
  })
})
