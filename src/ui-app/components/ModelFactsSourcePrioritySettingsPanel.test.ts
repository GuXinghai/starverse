import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ModelFactsSourcePrioritySettingsPanel from './ModelFactsSourcePrioritySettingsPanel.vue'

const revision = 'source-priority-config-v1:' + 'a'.repeat(64)

describe('ModelFactsSourcePrioritySettingsPanel', () => {
  it('loads the CAS revision and sends edited priorities through the bridge', async () => {
    const get = vi.fn(async () => ({ config: { priorities: { provider_native: 3, models_dev: 2, capability_rule: 1 }, sourcePriorityConfigRevision: revision } }))
    const update = vi.fn(async () => ({ config: { priorities: { provider_native: 5, models_dev: 2, capability_rule: 1 }, sourcePriorityConfigRevision: 'source-priority-config-v1:' + 'b'.repeat(64) } }))
    ;(window as any).generationV2 = { modelFacts: { sourcePriority: { get, update } } }

    const user = userEvent.setup()
    render(ModelFactsSourcePrioritySettingsPanel)
    const provider = await screen.findByLabelText(/Provider Native/)
    await waitFor(() => expect((provider as HTMLInputElement).disabled).toBe(false))
    await user.clear(provider)
    await user.type(provider, '5')
    await user.click(screen.getByRole('button', { name: /保存优先级|Save priority/ }))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ expectedConfigRevision: revision,
      priorities: { provider_native: 5, models_dev: 2, capability_rule: 1 } }))
    expect(get).toHaveBeenCalledWith({})
  })
})
