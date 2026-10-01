import { describe, expect, it } from 'vitest'
import {
  buildModelFactControlExplanationsV1,
  failedModelFactControlExplanationsV1,
  loadingModelFactControlExplanationsV1,
  modelFactControlReasonTextV1,
  modelFactControlReasonV1,
  type ModelFactsInspectorSnapshotForControlsV1,
} from './modelFactControlExplanations'
import { t } from '@/shared/i18n'

const subject = { providerAuthorityId: 'openai', endpointProfileId: 'openai-responses', nativeModelId: 'gpt-test' }
const REVISION = 'capability-revision-v1:' + 'a'.repeat(64)

function control(state: string, domain?: unknown) {
  return { visibility: state === 'supported' ? 'visible' : 'hidden', state, ...(domain ? { domain } : {}), constraints: [], evidenceIds: [] }
}

function projection(controls: Record<string, unknown>, capabilityRevision = REVISION) {
  return { schemaVersion: 2, binding: {}, capabilityRevision, controls } as any
}

function resolved(path: string, overrides: Record<string, unknown> = {}) {
  return { path, state: 'unknown', completenessDisposition: 'unknown', selectionReason: 'no_effective_claim',
    supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [], ...overrides }
}

function inspector(fields: readonly ReturnType<typeof resolved>[], coveredPaths: readonly string[] = [], capabilityRevision = REVISION) {
  return {
    sources: [{ subjectFact: { payload: { outcomes: coveredPaths.map((path) => ({ path })) } } }],
    resolved: { resolvedFacts: { capabilityRevision, fields } },
  } as unknown as ModelFactsInspectorSnapshotForControlsV1
}

const CONTROLS = {
  'generation.topK': control('unsupported'),
  'reasoning.effort': control('unknown'),
  'generation.temperature': control('conflict'),
  'image.aspectRatio': control('unknown'),
  'generation.seed': control('unknown'),
  'web.types': control('supported'),
}
const FIELDS = [
  resolved('sampling.topK.support', { state: 'resolved', selectedValue: { kind: 'support', value: 'unsupported' } }),
  resolved('reasoning.effort.nativeValues', { diagnostics: [{ kind: 'missing', errorCode: 'MISSING' }] }),
  resolved('sampling.temperature.modelMaximum', { state: 'conflict' }),
  resolved('image.generation.aspectRatios'),
]

describe('model fact control explanations', () => {
  it('distinguishes unsupported, unknown, conflict, data gap and no source coverage', () => {
    const explanations = buildModelFactControlExplanationsV1({ projection: projection(CONTROLS), subject, inspector: inspector(FIELDS) })
    const reason = (path: string) => modelFactControlReasonV1(explanations, path)!
    expect(reason('generation.topK')).toMatchObject({ state: 'unsupported', path: 'sampling.topK.support' })
    expect(reason('generation.temperature')).toMatchObject({ state: 'conflict', path: 'sampling.temperature.modelMaximum' })
    expect(reason('reasoning.effort')).toMatchObject({ state: 'data_gap', path: 'reasoning.effort.nativeValues' })
    expect(reason('image.aspectRatio')).toMatchObject({ state: 'no_source_coverage', path: 'image.generation.aspectRatios' })
    expect(reason('generation.seed')).toMatchObject({ state: 'unknown', path: null,
      text: t('settings.modelsCapabilities.facts.control.noModelFactsField') })
    const texts = ['generation.topK', 'generation.temperature', 'reasoning.effort', 'image.aspectRatio', 'generation.seed']
      .map((path) => modelFactControlReasonTextV1(reason(path)))
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('presents an unknown mapped control as unknown when a source covers it', () => {
    const explanations = buildModelFactControlExplanationsV1({ projection: projection(CONTROLS), subject,
      inspector: inspector(FIELDS, ['image.generation.aspectRatios']) })
    expect(modelFactControlReasonV1(explanations, 'image.aspectRatio')).toMatchObject({
      state: 'unknown', path: 'image.generation.aspectRatios',
      text: t('settings.modelsCapabilities.facts.stateExplanation.unknown') })
  })

  it('explains a supported control that hides an option by the resolved domain, not as unsupported', () => {
    const explanations = buildModelFactControlExplanationsV1({ projection: projection(CONTROLS), subject })
    expect(modelFactControlReasonV1(explanations, 'web.types')).toMatchObject({ state: 'supported',
      path: 'search.image.support', text: t('settings.modelsCapabilities.facts.control.notInDomain') })
  })

  it('ignores Inspector data for a different capabilityRevision instead of guessing', () => {
    const explanations = buildModelFactControlExplanationsV1({ projection: projection(CONTROLS), subject,
      inspector: inspector(FIELDS, [], 'capability-revision-v1:' + 'b'.repeat(64)) })
    expect(modelFactControlReasonV1(explanations, 'reasoning.effort')).toMatchObject({ state: 'unknown', path: 'reasoning.effort.nativeValues' })
    expect(modelFactControlReasonV1(explanations, 'generation.topK')).toMatchObject({ state: 'unsupported', path: 'sampling.topK.support' })
  })

  it('shows a failed refresh as a data gap with its error code, never as checking', () => {
    expect(modelFactControlReasonV1(loadingModelFactControlExplanationsV1(subject), 'reasoning.effort')?.state).toBe('checking')
    const failed = modelFactControlReasonV1(failedModelFactControlExplanationsV1('GENERATION_V2_CAPABILITY_TIMEOUT', subject), 'reasoning.effort')
    expect(failed).toMatchObject({ state: 'data_gap', path: 'reasoning.effort.nativeValues' })
    expect(failed?.text).toContain('GENERATION_V2_CAPABILITY_TIMEOUT')
    expect(modelFactControlReasonTextV1(failed)).not.toContain(t('settings.modelsCapabilities.facts.control.checking'))
  })
})
