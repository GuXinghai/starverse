import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import GenerationParamsSettingsEditor from './GenerationParamsSettingsEditor.vue'
import ChatSessionConsole from './ChatSessionConsole.vue'
import ImageGenerationSettingsEditor from './ImageGenerationSettingsEditor.vue'
import ModelFactsInspectorPanel from './ModelFactsInspectorPanel.vue'
import ComposerCapabilityChip from './ComposerCapabilityChip.vue'
import { openrouterGenerationProfile } from '@/next/generation-params/providerProfiles/openrouterGenerationProfile'
import {
  buildModelFactControlExplanationsV1,
  failedModelFactControlExplanationsV1,
  loadingModelFactControlExplanationsV1,
} from '../app/modelFactControlExplanations'
import { t, tf } from '@/shared/i18n'

const subject = { providerAuthorityId: 'openrouter', endpointProfileId: 'openrouter-default', nativeModelId: 'vendor/model-test' }
const REVISION = 'capability-revision-v1:' + 'c'.repeat(64)

function control(state: string, domain?: unknown) {
  return { visibility: state === 'supported' || state === 'unknown' ? 'visible' : 'hidden', state,
    ...(domain ? { domain } : {}), constraints: [], evidenceIds: [] }
}

function projection(controls: Record<string, unknown>) {
  return { schemaVersion: 2, binding: {}, capabilityRevision: REVISION, controls } as any
}

function resolved(path: string, overrides: Record<string, unknown> = {}) {
  return { path, state: 'unknown', completenessDisposition: 'unknown', selectionReason: 'no_effective_claim',
    supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [], ...overrides }
}

const PARAM_CONTROLS = {
  'generation.temperature': control('conflict'),
  'generation.topK': control('unsupported'),
  'generation.topP': control('unknown'),
  'generation.maxOutputTokens': control('unknown'),
  'reasoning.effort': control('unknown'),
  'generation.seed': control('unknown'),
}
const PARAM_FIELDS = [
  resolved('sampling.temperature.support', { state: 'conflict' }),
  resolved('sampling.topK.support', { state: 'resolved', selectedValue: { kind: 'support', value: 'unsupported' } }),
  resolved('sampling.topP.providerDefault', { diagnostics: [{ kind: 'invalid', errorCode: 'BAD_TOP_P' }] }),
  resolved('limits.output.maxTokens'),
  resolved('reasoning.effort.nativeValues'),
]

function paramExplanations() {
  const controlsProjection = projection(PARAM_CONTROLS)
  return {
    projection: controlsProjection,
    explanations: buildModelFactControlExplanationsV1({ projection: controlsProjection, subject, inspector: {
      sources: [{ subjectFact: { payload: { outcomes: [{ path: 'reasoning.effort.nativeValues' }] } } }],
      resolved: { resolvedFacts: { capabilityRevision: REVISION, fields: PARAM_FIELDS } },
    } as any }),
  }
}

function sessionConfig(providerId: string, modelId: string) {
  return {
    routeSelection: { schemaVersion: 1 as const, kind: 'provider_model' as const, providerId, modelId },
    reasoning: { enabled: false, effort: 'medium' as const },
    webSearch: { enabled: false, level: 'high' as const, detail: null },
    imageGeneration: { enabled: false, resolution: '1K' as const, aspectRatio: '1:1' as const, mode: 'default' as const, detail: null },
    generationParams: { detail: null },
  } as any
}

describe('Model Facts control explanations in capability-aware controls', () => {
  it('lists params hidden by Model Facts with distinct unsupported and conflict reasons and exact Inspector paths', async () => {
    const user = userEvent.setup()
    const { projection: controlsProjection, explanations } = paramExplanations()
    const view = render(GenerationParamsSettingsEditor, { props: { modelValue: null, profile: openrouterGenerationProfile,
      modelId: 'vendor/model-test', collapsible: false, capabilityProjection: controlsProjection, controlExplanations: explanations } })

    expect(screen.queryByTestId('generation-param-mode-temperature')).toBeNull()
    expect(screen.getByTestId('generation-params-unavailable-summary')).toBeVisible()
    await user.click(screen.getByTestId('generation-params-advanced-toggle'))

    const conflict = screen.getByTestId('generation-param-unavailable-reason-temperature')
    expect(conflict).toHaveAttribute('data-state', 'conflict')
    expect(conflict).toHaveTextContent(t('settings.modelsCapabilities.facts.state.conflict'))
    const unsupported = screen.getByTestId('generation-param-unavailable-reason-topK')
    expect(unsupported).toHaveAttribute('data-state', 'unsupported')
    expect(unsupported).toHaveTextContent(t('settings.modelsCapabilities.facts.stateExplanation.unsupported'))
    expect(within(screen.getByTestId('generation-param-unavailable-topK')).queryByTestId('generation-param-mode-topK')).toBeNull()

    await user.click(screen.getByTestId('generation-param-unavailable-reason-topK-inspect'))
    await user.click(screen.getByTestId('generation-param-unavailable-reason-temperature-inspect'))
    expect(view.emitted('inspectModelFactsPath')).toEqual([['sampling.topK.support'], ['sampling.temperature.support']])
  })

  it('keeps unknown controls editable but marks data gap, no source coverage and unknown as not verified', async () => {
    const user = userEvent.setup()
    const { projection: controlsProjection, explanations } = paramExplanations()
    const view = render(GenerationParamsSettingsEditor, { props: { modelValue: null, profile: openrouterGenerationProfile,
      modelId: 'vendor/model-test', collapsible: false, capabilityProjection: controlsProjection, controlExplanations: explanations } })

    // Unknown provider-owned enum falls back to free text, still editable, but visibly unverified.
    expect(screen.getByTestId('generation-param-mode-reasoningEffort')).toBeVisible()
    const effortBadge = screen.getByTestId('generation-param-unverified-reasoningEffort')
    expect(effortBadge).toHaveTextContent(t('settings.modelsCapabilities.facts.control.notVerified'))
    expect(effortBadge.getAttribute('title')).toContain(t('settings.modelsCapabilities.facts.state.unknown'))

    expect(screen.getByTestId('generation-param-unverified-topP').getAttribute('title'))
      .toContain(t('settings.modelsCapabilities.facts.state.data_gap'))
    expect(screen.getByTestId('generation-param-unverified-maxOutputTokens').getAttribute('title'))
      .toContain(t('settings.modelsCapabilities.facts.state.no_source_coverage'))
    await user.click(screen.getByTestId('generation-param-unverified-topP'))
    expect(view.emitted('inspectModelFactsPath')).toEqual([['sampling.topP.providerDefault']])

    // A control with no Model Facts field says so and offers no Inspector link.
    await user.click(screen.getByTestId('generation-params-advanced-toggle'))
    const seed = screen.getByTestId('generation-param-unverified-seed')
    expect(seed.getAttribute('title')).toContain(t('settings.modelsCapabilities.facts.control.noModelFactsField'))
    expect(seed).toBeDisabled()
  })

  it('shows a failed capability refresh as a data gap instead of a permanent checking state', async () => {
    const view = render(GenerationParamsSettingsEditor, { props: { modelValue: null, collapsible: false,
      capabilityProjection: null, controlExplanations: loadingModelFactControlExplanationsV1(subject) } })
    expect(screen.getByTestId('generation-params-capability-status')).toHaveAttribute('data-state', 'checking')

    await view.rerender({ modelValue: null, collapsible: false, capabilityProjection: null,
      controlExplanations: failedModelFactControlExplanationsV1('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE', subject) })
    const status = screen.getByTestId('generation-params-capability-status')
    expect(status).toHaveAttribute('data-state', 'data_gap')
    expect(status).toHaveTextContent(tf('settings.modelsCapabilities.facts.control.refreshFailed', {
      code: 'GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE' }))
    expect(status).not.toHaveTextContent(t('settings.modelsCapabilities.facts.control.checking'))
  })

  it('leaves editors without Model Facts explanations exactly as before', () => {
    render(GenerationParamsSettingsEditor, { props: { modelValue: null, collapsible: false, capabilityProjection: null } })
    expect(screen.getByText(t('chat.generationParams.empty'))).toBeVisible()
    expect(screen.queryByTestId('generation-params-capability-status')).toBeNull()
  })

  it('explains a vanished generic reasoning effort control in the console and opens its exact path', async () => {
    const user = userEvent.setup()
    const controlsProjection = projection({ 'reasoning.effort': control('unsupported') })
    const explanations = buildModelFactControlExplanationsV1({ projection: controlsProjection, subject, inspector: {
      sources: [],
      resolved: { resolvedFacts: { capabilityRevision: REVISION, fields: [
        resolved('reasoning.effort.nativeValues'),
        resolved('reasoning.effort.providerDefault', { state: 'resolved', selectedValue: { kind: 'support', value: 'unsupported' } }),
      ] } },
    } as any })
    const view = render(ChatSessionConsole, { props: { disabled: false, isRunning: false,
      sessionConfig: sessionConfig('openrouter', 'vendor/model-test'), reasoningDisplayMode: 'inline', modelCatalog: [],
      webSearchResolved: null, generationParamsResolved: null, capabilityProjection: controlsProjection, controlExplanations: explanations } })

    const reason = screen.getByTestId('session-reasoning-effort-reason')
    expect(reason).toHaveAttribute('data-state', 'unsupported')
    await user.click(screen.getByTestId('session-reasoning-effort-reason-inspect'))
    expect(view.emitted('inspectModelFactsPath')?.[0]).toEqual(['reasoning.effort.providerDefault'])
  })

  it('replaces the collapsed Gemini thinking message with a state-specific reason', () => {
    const controlsProjection = projection({ 'reasoning.mode': control('conflict') })
    const explanations = buildModelFactControlExplanationsV1({ projection: controlsProjection, subject })
    render(ChatSessionConsole, { props: { disabled: false, isRunning: false,
      sessionConfig: sessionConfig('google_ai_studio', 'gemini-test'), reasoningDisplayMode: 'inline', modelCatalog: [],
      webSearchResolved: null, generationParamsResolved: null, capabilityProjection: controlsProjection, controlExplanations: explanations } })

    const reason = screen.getByTestId('session-google-thinking-reason')
    expect(reason).toHaveAttribute('data-state', 'conflict')
    expect(reason).toHaveTextContent(t('settings.modelsCapabilities.facts.stateExplanation.conflict'))
  })

  it('puts the unavailable reason on a disabled composer chip', () => {
    render(ComposerCapabilityChip, { props: { enabled: false, label: 'R', kind: 'reasoning', disabled: true,
      unavailableReason: 'Data gap: reason text' } })
    expect(screen.getByTestId('capability-chip-body').getAttribute('title')).toContain('Data gap: reason text')
  })

  it('marks fallback image option lists as not verified', () => {
    const modelValue = { enabled: true, imageSize: '1K', aspectRatio: '1:1', outputMode: 'auto' } as any
    const view = render(ImageGenerationSettingsEditor, { props: { modelValue, showImageSizeControl: true } })
    expect(screen.getByTestId('image-generation-unverified-size')).toHaveTextContent(t('settings.modelsCapabilities.facts.control.notVerified'))
    expect(screen.getByTestId('image-generation-unverified-aspect')).toBeVisible()
    expect(screen.getByTestId('image-generation-unverified-output-mode')).toBeVisible()
    view.unmount()

    render(ImageGenerationSettingsEditor, { props: { modelValue, showImageSizeControl: true, imageSizeOptions: ['2K'], aspectRatioOptions: ['1:1'],
      outputModeOptions: ['image_only'] } })
    expect(screen.queryByTestId('image-generation-unverified-size')).toBeNull()
    expect(screen.queryByTestId('image-generation-unverified-aspect')).toBeNull()
    expect(screen.queryByTestId('image-generation-unverified-output-mode')).toBeNull()
  })

  it('opens the Inspector at the exact resolved path and never at a near match', async () => {
    const fields = [resolved('sampling.topK.support', { state: 'resolved', selectedValue: { kind: 'support', value: 'unsupported' } }),
      resolved('sampling.topK.providerDefault')]
    const inspectorSubject = { providerAuthorityId: 'p', endpointProfileId: 'e', nativeModelId: 'm-test' }
    ;(window as any).generationV2 = { modelFactsInspector: {
      searchSubjects: vi.fn(async () => ({ subjectSetRevision: 'subject-set:1', nextCursor: null,
        records: [{ subject: inspectorSubject, proofs: [] }] })),
      readInspector: vi.fn(async () => ({ subjectSetRevision: 'subject-set:1', subject: inspectorSubject, sources: [],
        resolved: { resolvedSnapshotRevision: 'resolved-model-facts-snapshot-v1:' + 'a'.repeat(64),
          sourceScopeSelection: { providerNative: 's1', modelsDev: 's2', capabilityRules: 's3' },
          resolvedFacts: { capabilityRevision: REVISION, fields } } })),
      readEvidenceSlice: vi.fn(), readSanitizedRawPayload: vi.fn(),
    } }

    const exact = render(ModelFactsInspectorPanel, { props: { initialSubject: inspectorSubject, initialPath: 'sampling.topK.support' } })
    const detail = await screen.findByTestId('resolved-field-detail')
    expect(detail.getAttribute('aria-label')).toContain('sampling.topK.support')
    exact.unmount()

    render(ModelFactsInspectorPanel, { props: { initialSubject: inspectorSubject, initialPath: 'sampling.topK' } })
    await screen.findByTestId('resolved-field-sampling.topK.support')
    await waitFor(() => expect(screen.queryByTestId('resolved-field-detail')).toBeNull())
  })
})
