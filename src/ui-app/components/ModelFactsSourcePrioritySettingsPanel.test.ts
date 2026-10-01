import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ModelFactsSourcePrioritySettingsPanel from './ModelFactsSourcePrioritySettingsPanel.vue'
import { t } from '@/shared/i18n'
import { sourcePriorityErrorKey, sourcePriorityKey, sourcePriorityValidationKey } from '@/shared/model-facts/modelFactPresentation'

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

describe('ModelFactsSourcePrioritySettingsPanel operational UX (Goal 4 S3)', () => {
  const STALE = 'Error invoking remote method \'generation-v2:model-facts:source-priority:update\': Error: GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION'
  const nextRevision = 'source-priority-config-v1:' + 'c'.repeat(64)

  function mount(priorities = { provider_native: 3, models_dev: 2, capability_rule: 1 }) {
    const get = vi.fn(async () => ({ config: { priorities, sourcePriorityConfigRevision: revision } }))
    const update = vi.fn()
    ;(window as any).generationV2 = { modelFacts: { sourcePriority: { get, update } } }
    const view = render(ModelFactsSourcePrioritySettingsPanel)
    return { get, update, view }
  }

  async function ready() {
    const provider = await screen.findByLabelText(/Provider Native/) as HTMLInputElement
    await waitFor(() => expect(provider.disabled).toBe(false))
    return provider
  }

  it('reports invalid input instead of coercing it to 0 and blocks the save', async () => {
    const { update } = mount()
    const user = userEvent.setup()
    const provider = await ready()
    const save = screen.getByRole('button', { name: /保存优先级|Save priority/ })

    for (const [text, reason] of [['abc', 'notInteger'], ['1.5', 'notInteger'], ['99999999999999999999', 'outOfRange']] as const) {
      await user.clear(provider)
      await user.type(provider, text)
      expect(provider.value).toBe(text)
      expect(provider).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByTestId('source-priority-provider_native-hint')).toHaveTextContent(t(sourcePriorityValidationKey(reason)))
      expect(save).toBeDisabled()
    }
    await user.clear(provider)
    expect(screen.getByTestId('source-priority-provider_native-hint')).toHaveTextContent(t(sourcePriorityValidationKey('empty')))
    expect(provider.value).toBe('')
    expect(save).toBeDisabled()
    await user.click(save)
    expect(update).not.toHaveBeenCalled()

    await user.type(provider, '-4')
    expect(save).not.toBeDisabled()
    await user.click(save)
    await waitFor(() => expect(update).toHaveBeenCalledWith({ expectedConfigRevision: revision,
      priorities: { provider_native: -4, models_dev: 2, capability_rule: 1 } }))
  })

  it('localizes a stale-revision rejection, keeps the draft, and saves it against the latest revision', async () => {
    const { get, update } = mount()
    update.mockRejectedValueOnce(new Error(STALE))
    const user = userEvent.setup()
    const provider = await ready()
    await user.clear(provider)
    await user.type(provider, '7')
    await user.click(screen.getByRole('button', { name: /保存优先级|Save priority/ }))

    const alert = await screen.findByTestId('source-priority-error')
    expect(alert).toHaveAttribute('data-error-kind', 'staleRevision')
    expect(alert).toHaveTextContent(t(sourcePriorityErrorKey('staleRevision')))
    expect(document.body.textContent).not.toContain('GENERATION_V2_SOURCE_PRIORITY_CONFIG_STALE_REVISION')
    expect(provider.value).toBe('7')

    get.mockResolvedValueOnce({ config: { priorities: { provider_native: 3, models_dev: 4, capability_rule: 1 }, sourcePriorityConfigRevision: nextRevision } })
    await user.click(screen.getByRole('button', { name: t(sourcePriorityKey('loadLatestKeepDraft')) }))
    expect(await screen.findByTestId('source-priority-latest')).toHaveTextContent(/models\.dev 4/)
    expect(provider.value).toBe('7')
    expect((screen.getByLabelText(/models\.dev/) as HTMLInputElement).value).toBe('2')
    expect(screen.queryByTestId('source-priority-error')).not.toBeInTheDocument()

    update.mockResolvedValueOnce({ config: { priorities: { provider_native: 7, models_dev: 2, capability_rule: 1 }, sourcePriorityConfigRevision: revision } })
    await user.click(screen.getByRole('button', { name: /保存优先级|Save priority/ }))
    await waitFor(() => expect(update).toHaveBeenLastCalledWith({ expectedConfigRevision: nextRevision,
      priorities: { provider_native: 7, models_dev: 2, capability_rule: 1 } }))
  })

  it('shows unrecognized failures with a localized summary and other codes localized', async () => {
    const { update } = mount()
    update.mockRejectedValueOnce(new Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INPUT_INVALID'))
    const user = userEvent.setup()
    await ready()
    await user.click(screen.getByRole('button', { name: /保存优先级|Save priority/ }))
    const alert = await screen.findByTestId('source-priority-error')
    expect(alert).toHaveAttribute('data-error-kind', 'invalid')
    expect(alert).toHaveTextContent(t(sourcePriorityErrorKey('invalid')))
    expect(alert).not.toHaveTextContent('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INPUT_INVALID')
  })

  it('shows relative rank and explains ties with a path to the Facts Inspector', async () => {
    const { view } = mount({ provider_native: 3, models_dev: 3, capability_rule: 1 })
    const user = userEvent.setup()
    await ready()
    expect(screen.getByTestId('source-priority-provider_native-hint')).toHaveTextContent(/1.*models\.dev/)
    expect(screen.getByTestId('source-priority-capability_rule-hint')).toHaveTextContent(t(sourcePriorityKey('rank')).replace('{rank}', '2'))
    expect(screen.getByTestId('source-priority-order')).toHaveTextContent(/Provider Native = models\.dev > Capability Rules/)
    const ties = screen.getByTestId('source-priority-ties')
    expect(ties).toHaveTextContent(t(sourcePriorityKey('tieExplanation')))
    await user.click(within(ties).getByRole('button', { name: t(sourcePriorityKey('openInspector')) }))
    expect(view.emitted('open-inspector')).toHaveLength(1)

    const modelsDev = screen.getByLabelText(/models\.dev/)
    await user.clear(modelsDev)
    await user.type(modelsDev, '2')
    expect(screen.queryByTestId('source-priority-ties')).not.toBeInTheDocument()
    expect(screen.getByTestId('source-priority-order')).toHaveTextContent('Provider Native > models.dev > Capability Rules')
    expect(screen.getByTestId('source-priority-order')).toHaveTextContent(t(sourcePriorityKey('noTies')))
  })
})
