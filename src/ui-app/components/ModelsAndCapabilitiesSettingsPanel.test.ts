import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ModelsAndCapabilitiesSettingsPanel from './ModelsAndCapabilitiesSettingsPanel.vue'
import { t } from '@/shared/i18n'

describe('ModelsAndCapabilitiesSettingsPanel Source Priority links (Goal 4 S3)', () => {
  it('moves from a source-priority tie to the Facts Inspector tab', async () => {
    ;(window as any).generationV2 = {
      modelFacts: { sourcePriority: {
        get: vi.fn(async () => ({ config: { priorities: { provider_native: 2, models_dev: 2, capability_rule: 1 },
          sourcePriorityConfigRevision: 'source-priority-config-v1:' + 'a'.repeat(64) } })),
        update: vi.fn(),
      } },
      modelFactsInspector: { searchSubjects: vi.fn(async () => ({ subjectSetRevision: 's:1', nextCursor: null, records: [] })),
        readInspector: vi.fn(), readEvidenceSlice: vi.fn(), readSanitizedRawPayload: vi.fn() },
    }
    const user = userEvent.setup()
    render(ModelsAndCapabilitiesSettingsPanel)
    const ties = await screen.findByTestId('source-priority-ties')
    await user.click(within(ties).getByRole('button', { name: t('settings.modelsCapabilities.sourcePriority.openInspector') }))
    await waitFor(() => expect(screen.getByRole('tab', { name: t('settings.modelsCapabilities.inspectorTab') })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByTestId('model-facts-inspector-panel')).toBeVisible()
  })

  it('moves from the Facts Inspector to the Source Priority editor', async () => {
    const subject = { providerAuthorityId: 'openai', endpointProfileId: 'openai-default', nativeModelId: 'm-test' }
    ;(window as any).generationV2 = {
      modelFacts: { sourcePriority: {
        get: vi.fn(async () => ({ config: { priorities: { provider_native: 3, models_dev: 2, capability_rule: 1 },
          sourcePriorityConfigRevision: 'source-priority-config-v1:' + 'a'.repeat(64) } })),
        update: vi.fn(),
      } },
      modelFactsInspector: {
        searchSubjects: vi.fn(async () => ({ subjectSetRevision: 's:1', nextCursor: null, records: [{ subject, proofs: [] }] })),
        readInspector: vi.fn(async () => ({ subjectSetRevision: 's:1', subject, sources: [], resolved: {
          resolvedSnapshotRevision: 'r:1', sourcePriorityConfigRevision: 'prio:rev:1',
          sourceScopeSelection: { providerNative: 'a', modelsDev: 'b', capabilityRules: 'c' },
          resolvedFacts: { capabilityRevision: 'cap:1', fields: [] } } })),
        readEvidenceSlice: vi.fn(), readSanitizedRawPayload: vi.fn(),
      },
    }
    const user = userEvent.setup()
    render(ModelsAndCapabilitiesSettingsPanel, { props: { initialTab: 'inspector', inspectorSubject: subject } })
    await user.click(await screen.findByRole('button', { name: t('settings.modelsCapabilities.sourcePriority.edit') }))
    await waitFor(() => expect(screen.getByRole('tab', { name: t('settings.modelsCapabilities.cloudTab') })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByTestId('model-facts-source-priority-settings')).toBeVisible()
  })
})
