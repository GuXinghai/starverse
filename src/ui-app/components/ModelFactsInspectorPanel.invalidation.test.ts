import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@/shared/i18n'
import { CAPABILITY_RULE_SOURCE_SCOPE_ID_V1 } from '@/core/generation-v2/model-facts/semanticInvalidationV1'
import ModelFactsInspectorPanel from './ModelFactsInspectorPanel.vue'

const subject = (id: string) => ({ providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId: id })
const a = subject('model-A')
const b = subject('model-B')
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (value: unknown) => void
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no }), resolve, reject }
}
function snapshot(selected = a, revision = 'current') {
  return { subjectSetRevision: 'subject-set:current', subject: selected,
    resolved: { resolvedSnapshotRevision: `resolved:${revision}`,
      sourceScopeSelection: { providerNative: 'scope:native', modelsDev: 'scope:models', capabilityRules: 'scope:rules' },
      resolvedFacts: { capabilityRevision: `capability:${revision}`, fields: [{ path: 'reasoning.support', state: 'resolved',
        completenessDisposition: 'complete', selectionReason: 'single_claim', selectedValue: { kind: 'support', value: 'supported' },
        supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] }] } },
    sources: [{ state: { sourceKind: 'provider_native', sourceScopeId: 'scope:native', currentSourceRevision: `source:${revision}`, staleReason: null },
      subjectFact: { payload: { recordOutcome: 'present', outcomes: [{ path: 'reasoning.support', disposition: 'current',
        currentObservation: { kind: 'present_valid', assertion: { value: { kind: 'support', value: 'supported' },
          provenance: { sourceFieldRefs: [{ rawPayloadRef: { storeId: `raw:${revision}`, recordKey: selected.nativeModelId,
            persistedPayloadSha256: 'a'.repeat(64), sanitizerRevision: 'synthetic:1' }, sourceFieldPath: 'reasoning' }] } } } }] } } }] }
}

describe('ModelFactsInspectorPanel semantic response ownership', () => {
  let inspector: any
  let invalidation: (event: unknown) => void
  let unsubscribe: ReturnType<typeof vi.fn>
  const originalBridge = window.generationV2
  const invalidate = (digest = 'a') => invalidation({ kind: 'capability_rules', sourceScopeId: CAPABILITY_RULE_SOURCE_SCOPE_ID_V1,
    canonicalSourceRevision: `canonical-source-v1:${digest.repeat(64)}` })
  beforeEach(() => {
    unsubscribe = vi.fn()
    inspector = { searchSubjects: vi.fn(async () => ({ subjectSetRevision: 'subject-set:current', nextCursor: null,
      records: [a, b].map(subject => ({ subject, proofs: [] })) })),
    readInspector: vi.fn(async ({ subject }: any) => snapshot(subject)), readEvidenceSlice: vi.fn(async () => null),
    readSanitizedRawPayload: vi.fn(async () => ({ current: true })) }
    ;(window as any).generationV2 = { modelFactsInspector: inspector,
      onModelFactsSemanticInvalidated: vi.fn((listener) => { invalidation = listener; return unsubscribe }) }
  })
  afterEach(() => { cleanup(); (window as any).generationV2 = originalBridge })

  it.each(['success', 'failure'] as const)('does not publish an old subject %s after a newer selection', async completion => {
    const old = deferred<any>()
    inspector.readInspector.mockImplementationOnce(() => old.promise)
    render(ModelFactsInspectorPanel)
    await fireEvent.click(await screen.findByRole('button', { name: /model-A/ }))
    await fireEvent.click(screen.getByRole('button', { name: /model-B/ }))
    await screen.findByText(/resolved:current/)
    if (completion === 'success') old.resolve(snapshot(a, 'stale-A'))
    else old.reject(new Error('SYNTHETIC_STALE_A_ERROR'))
    await waitFor(() => expect(screen.queryByText(/stale-A|SYNTHETIC_STALE_A_ERROR/)).toBeNull())
    expect(screen.getByText('openai / openai-api-v1 / model-B')).toBeInTheDocument()
  })

  it('clears current semantics immediately and fences two unordered same-subject refreshes while preserving detail/filter/view', async () => {
    const view = render(ModelFactsInspectorPanel, { props: { initialSubject: a, initialPath: 'reasoning.support' } })
    await screen.findByText(/resolved:current/)
    await screen.findByTestId('resolved-field-detail')
    await fireEvent.click(screen.getByRole('tab', { name: t('settings.modelsCapabilities.inspector.fields') }))
    const older = deferred<any>()
    const latest = deferred<any>()
    inspector.readInspector.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => latest.promise)
    inspector.searchSubjects.mockResolvedValue({ subjectSetRevision: 'subject-set:current', records: [], nextCursor: null })
    invalidate('f')
    await waitFor(() => expect(screen.queryByText(/resolved:current/)).toBeNull())
    invalidate('a')
    latest.resolve(snapshot(a, 'newest'))
    await waitFor(() => expect(screen.getByRole('tab', { name: t('settings.modelsCapabilities.inspector.fields') })).toHaveAttribute('aria-selected', 'true'))
    expect(inspector.readInspector.mock.calls.at(-1)![0]).toEqual({ subject: a })
    older.resolve(snapshot(a, 'older-event'))
    await fireEvent.click(screen.getByRole('tab', { name: t('settings.modelsCapabilities.inspector.overview') }))
    expect(await screen.findByText(/resolved:newest/)).toBeInTheDocument()
    expect(screen.queryByText(/resolved:older-event/)).toBeNull()
    expect(screen.getByTestId('resolved-field-detail')).toBeInTheDocument()
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it.each([['evidence', 'success'], ['evidence', 'failure'], ['raw', 'success'], ['raw', 'failure']] as const)(
    'drops late %s %s and finally after invalidation', async (kind, completion) => {
    render(ModelFactsInspectorPanel, { props: { initialSubject: a } })
    await screen.findByText(/resolved:current/)
    await fireEvent.click(screen.getByRole('tab', { name: t('settings.modelsCapabilities.inspector.fields') }))
    const stale = deferred<any>()
    if (kind === 'evidence') inspector.readEvidenceSlice.mockImplementationOnce(() => stale.promise)
    await fireEvent.click(screen.getByRole('button', { name: /reasoning\.support/ }))
    if (kind === 'raw') {
      await screen.findByRole('tab', { name: t('settings.modelsCapabilities.inspector.evidence'), selected: true })
      inspector.readSanitizedRawPayload.mockImplementationOnce(() => stale.promise)
      await fireEvent.click(screen.getByRole('button', { name: t('settings.modelsCapabilities.viewRawPayload') }))
    }
    const current = deferred<any>()
    inspector.readInspector.mockImplementationOnce(() => current.promise)
    invalidate()
    await waitFor(() => expect(screen.queryByRole('button', { name: t('settings.modelsCapabilities.viewRawPayload') })).toBeNull())
    if (completion === 'success') stale.resolve(kind === 'raw' ? { stalePayload: 'SYNTHETIC_OLD_RAW' } : snapshot(a).sources[0]!.subjectFact.payload.outcomes[0])
    else stale.reject(new Error('SYNTHETIC_OLD_ERROR'))
    await Promise.resolve()
    expect(screen.queryByText(/SYNTHETIC_OLD_RAW/)).toBeNull()
    expect(screen.queryByText(t('common.error'))).toBeNull()
    expect(screen.queryByRole('button', { name: t('settings.modelsCapabilities.viewRawPayload') })).toBeNull()
    current.resolve(snapshot(a, 'refreshed'))
    await fireEvent.click(await screen.findByRole('tab', { name: t('settings.modelsCapabilities.inspector.overview') }))
    expect(await screen.findByText(/resolved:refreshed/)).toBeInTheDocument()
  })

  it('keeps a newer raw read disabled when an older raw finally completes', async () => {
    render(ModelFactsInspectorPanel, { props: { initialSubject: a } })
    await screen.findByText(/resolved:current/)
    await fireEvent.click(screen.getByRole('tab', { name: t('settings.modelsCapabilities.inspector.fields') }))
    await fireEvent.click(screen.getByRole('button', { name: /reasoning\.support/ }))
    const older = deferred<any>()
    const newer = deferred<any>()
    inspector.readSanitizedRawPayload.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise)
    await fireEvent.click(await screen.findByRole('button', { name: t('settings.modelsCapabilities.viewRawPayload') }))
    invalidate()
    await waitFor(() => expect(inspector.readInspector).toHaveBeenCalledTimes(2))
    const button = await screen.findByRole('button', { name: t('settings.modelsCapabilities.viewRawPayload') })
    await fireEvent.click(button)
    expect(button).toBeDisabled()
    older.resolve({ oldRaw: true })
    await Promise.resolve()
    expect(button).toBeDisabled()
    expect(screen.queryByText(/oldRaw/)).toBeNull()
    newer.resolve({ newRaw: true })
    expect(await screen.findByText(/newRaw/)).toBeInTheDocument()
    expect(button).toBeEnabled()
  })

  it('covers an invalidation while the initial search is pending without losing the requested subject', async () => {
    const initialSearch = deferred<any>()
    inspector.searchSubjects.mockImplementationOnce(() => initialSearch.promise)
    render(ModelFactsInspectorPanel, { props: { initialSubject: a } })
    invalidate()
    expect(await screen.findByText(/resolved:current/)).toBeInTheDocument()
    initialSearch.resolve({ subjectSetRevision: 'stale-search', records: [{ subject: b, proofs: [] }], nextCursor: null })
    await Promise.resolve()
    expect(screen.getByText('openai / openai-api-v1 / model-A')).toBeInTheDocument()
    expect(screen.queryByText('stale-search')).toBeNull()
    expect(inspector.readInspector).toHaveBeenCalledExactlyOnceWith({ subject: a })
  })

  it('subscribes before the first read and disposes all pending publications on unmount', async () => {
    const read = deferred<any>()
    inspector.searchSubjects.mockImplementationOnce(() => read.promise)
    const view = render(ModelFactsInspectorPanel, { props: { initialSubject: a } })
    expect(window.generationV2!.onModelFactsSemanticInvalidated).toHaveBeenCalledOnce()
    const subscribed = (window.generationV2!.onModelFactsSemanticInvalidated as any).mock.invocationCallOrder[0]
    expect(subscribed).toBeLessThan(inspector.searchSubjects.mock.invocationCallOrder[0])
    view.unmount()
    read.resolve({ subjectSetRevision: 'late', records: [{ subject: a, proofs: [] }], nextCursor: null })
    await Promise.resolve()
    invalidate()
    expect(inspector.readInspector).not.toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
