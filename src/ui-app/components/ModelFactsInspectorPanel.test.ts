import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ModelFactsInspectorPanel from './ModelFactsInspectorPanel.vue'

describe('ModelFactsInspectorPanel', () => {
  it('binds inspection to the authoritative subject revision and lazy-loads evidence payloads', async () => {
    const readInspector = vi.fn(async () => ({
      subjectSetRevision: 'subject-set:1',
      subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' },
      resolved: { resolvedSnapshotRevision: 'resolved-model-facts-snapshot-v1:' + 'a'.repeat(64),
        sourceScopeSelection: { providerNative: 'scope:native', modelsDev: 'scope:models', capabilityRules: 'scope:rules' },
        resolvedFacts: { capabilityRevision: 'capability-revision-v1:' + 'b'.repeat(64), fields: [{ path: 'reasoning.support', state: 'resolved',
          completenessDisposition: 'complete', selectionReason: 'single_claim', selectedValue: { kind: 'support', value: 'supported' },
          supportingProvenance: [{}], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] }] } },
      sources: [{ state: { sourceKind: 'provider_native', sourceScopeId: 'scope:1',
        currentSourceRevision: 'source:1', staleReason: null }, subjectFact: { payload: {
        recordOutcome: 'present', outcomes: [{ observationId: 'obs:1', path: 'reasoning.support', disposition: 'current',
          currentObservation: { kind: 'present_valid', assertion: { value: { kind: 'support', value: 'supported' },
            provenance: { sourceFieldRefs: [{ rawPayloadRef: { storeId: 'canonical-raw-v1:' + 'a'.repeat(64),
              persistedPayloadSha256: 'a'.repeat(64), recordKey: 'model:gpt-test', sanitizerRevision: 'sanitizer:1' }, sourceFieldPath: 'reasoning' }] } } } }],
        unmappedSourceFields: [],
      } } }],
    }))
    const readEvidenceSlice = vi.fn(async () => ({ path: 'reasoning.support', disposition: 'current',
      currentObservation: { kind: 'present_valid', assertion: { value: { kind: 'support', value: 'supported' }, provenance: { sourceFieldRefs: [] } } } }))
    const readSanitizedRawPayload = vi.fn(async () => ({ id: 'gpt-test', reasoning: true }))
    ;(window as any).generationV2 = { modelFactsInspector: {
      searchSubjects: vi.fn(async () => ({ subjectSetRevision: 'subject-set:1', nextCursor: null,
        records: [{ subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' }, proofs: [] }] })),
      readInspector, readEvidenceSlice, readSanitizedRawPayload,
    } }

    const user = userEvent.setup()
    render(ModelFactsInspectorPanel)
    await user.click(await screen.findByRole('button', { name: /gpt-test/ }))
    expect(await screen.findByText(/resolved-model-facts-snapshot-v1/)).toBeInTheDocument()
    expect(await screen.findByTestId('resolved-field-reasoning.support')).toHaveTextContent('支持')
    await waitFor(() => expect(readInspector).toHaveBeenCalledWith({
      subject: { providerAuthorityId: 'openai', endpointProfileId: 'openai-default', nativeModelId: 'gpt-test' },
      expectedSubjectSetRevision: 'subject-set:1',
    }))
    await user.click(await screen.findByRole('tab', { name: '字段' }))
    await user.click(await screen.findByRole('button', { name: /reasoning\.support/ }))
    await waitFor(() => expect(readEvidenceSlice).toHaveBeenCalledWith(expect.objectContaining({
      expectedSubjectSetRevision: 'subject-set:1', sourceKind: 'provider_native', path: 'reasoning.support',
    })))
    await user.click(await screen.findByRole('button', { name: '查看完整脱敏 payload' }))
    await waitFor(() => expect(readSanitizedRawPayload).toHaveBeenCalledWith({ rawPayloadRef: expect.objectContaining({
      recordKey: 'model:gpt-test',
    }) }))
    expect(await screen.findByText(/"gpt-test"/)).toBeInTheDocument()
  })

  it('explains winners, ties, data gaps and no coverage from resolver state without recomputing values', async () => {
    const claim = (sourceKind: string, sourcePriority: number, value: string, assertionKind = 'explicit') => ({
      sourceKind, sourcePriority, sourceAssertion: { value: { kind: 'support', value }, provenance: { assertionKind } } })
    const fields = [
      { path: 'reasoning.support', state: 'conflict', completenessDisposition: 'unknown', selectionReason: 'equal_priority_conflict',
        supportingProvenance: [], opposingProvenance: [claim('provider_native', 3, 'supported'), claim('models_dev', 3, 'unsupported')],
        overriddenProvenance: [], diagnostics: [],
        candidates: [{ value: { kind: 'support', value: 'supported' }, provenance: [claim('provider_native', 3, 'supported')] },
          { value: { kind: 'support', value: 'unsupported' }, provenance: [claim('models_dev', 3, 'unsupported')] }] },
      { path: 'search.web.support', state: 'resolved', completenessDisposition: 'complete', selectionReason: 'higher_priority_claim',
        selectedValue: { kind: 'support', value: 'unsupported' }, supportingProvenance: [claim('provider_native', 5, 'unsupported')],
        opposingProvenance: [], overriddenProvenance: [claim('models_dev', 1, 'supported', 'derived')], diagnostics: [] },
      { path: 'search.image.support', state: 'unknown', completenessDisposition: 'unknown', selectionReason: 'no_effective_claim',
        supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [],
        diagnostics: [{ sourceKind: 'capability_rule', kind: 'invalid', errorCode: 'RULE_BAD' }] },
      { path: 'contextManagement.support', state: 'unknown', completenessDisposition: 'unknown', selectionReason: 'no_effective_claim',
        supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [] },
    ]
    ;(window as any).generationV2 = { modelFactsInspector: {
      searchSubjects: vi.fn(async () => ({ subjectSetRevision: 'subject-set:1', nextCursor: null,
        records: [{ subject: { providerAuthorityId: 'p', endpointProfileId: 'e', nativeModelId: 'm-test' }, proofs: [] }] })),
      readInspector: vi.fn(async () => ({ subjectSetRevision: 'subject-set:1',
        subject: { providerAuthorityId: 'p', endpointProfileId: 'e', nativeModelId: 'm-test' },
        resolved: { resolvedSnapshotRevision: 'resolved-model-facts-snapshot-v1:' + 'a'.repeat(64), sourcePriorityConfigRevision: 'prio:rev:1',
          sourceScopeSelection: { providerNative: 's1', modelsDev: 's2', capabilityRules: 's3' },
          resolvedFacts: { capabilityRevision: 'capability-revision-v1:' + 'b'.repeat(64), fields } },
        // only reasoning.support has source-local outcomes, so contextManagement.support has no coverage
        sources: [{ state: { sourceKind: 'provider_native', sourceScopeId: 's1', currentSourceRevision: 'r', staleReason: null },
          subjectFact: { payload: { recordOutcome: 'present', outcomes: [
            { path: 'reasoning.support', disposition: 'current' }, { path: 'search.web.support', disposition: 'current' },
            { path: 'search.image.support', disposition: 'current' }], unmappedSourceFields: [] } } }] })),
      readEvidenceSlice: vi.fn(), readSanitizedRawPayload: vi.fn(),
    } }
    const user = userEvent.setup()
    render(ModelFactsInspectorPanel)
    await user.click(await screen.findByRole('button', { name: /m-test/ }))

    const states = (path: string) => screen.getByTestId(`resolved-field-${path}`).querySelector('[data-state]')!.getAttribute('data-state')
    expect(await screen.findByTestId('resolved-field-reasoning.support')).toBeInTheDocument()
    expect(states('reasoning.support')).toBe('conflict')
    expect(states('search.web.support')).toBe('unsupported')
    expect(states('search.image.support')).toBe('data_gap')
    expect(states('contextManagement.support')).toBe('no_source_coverage')
    expect(screen.getByText(/prio:rev:1/)).toBeInTheDocument()
    expect(screen.queryByText('equal_priority_conflict')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /查看原因 reasoning\.support/ }))
    const conflictDetail = within(await screen.findByTestId('resolved-field-detail'))
    expect(conflictDetail.getByTestId('detail-candidates')).toHaveTextContent(/并列候选 1.*Provider Native.*3/)
    expect(conflictDetail.getByTestId('detail-candidates')).toHaveTextContent(/并列候选 2.*models\.dev.*3/)
    expect(conflictDetail.getByTestId('detail-opposing')).toHaveTextContent('Provider Native')
    expect(conflictDetail.getByTestId('detail-opposing')).toHaveTextContent('models.dev')

    await user.click(screen.getByRole('button', { name: /查看原因 search\.web\.support/ }))
    const winnerDetail = within(await screen.findByTestId('resolved-field-detail'))
    expect(winnerDetail.getByTestId('detail-supporting')).toHaveTextContent(/Provider Native.*5.*显式/)
    expect(winnerDetail.getByTestId('detail-overridden')).toHaveTextContent(/models\.dev.*1.*推导/)

    await user.click(screen.getByRole('button', { name: /查看原因 search\.image\.support/ }))
    const gapDetail = within(await screen.findByTestId('resolved-field-detail'))
    expect(gapDetail.getByTestId('detail-diagnostics')).toHaveTextContent(/Capability Rules.*无效.*RULE_BAD/)
    expect(gapDetail.getByText(/这不代表该能力不受支持/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '冲突' }))
    expect(screen.getByTestId('resolved-field-reasoning.support')).toBeInTheDocument()
    expect(screen.queryByTestId('resolved-field-search.web.support')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '未知 / 数据缺口' }))
    expect(screen.getByTestId('resolved-field-search.image.support')).toBeInTheDocument()
    expect(screen.getByTestId('resolved-field-contextManagement.support')).toBeInTheDocument()
    expect(screen.queryByTestId('resolved-field-reasoning.support')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '有诊断' }))
    expect(screen.getAllByTestId(/^resolved-field-(?!detail)/)).toHaveLength(1)

    await user.click(screen.getByRole('tab', { name: '字段' }))
    expect(screen.queryByText('值不同')).not.toBeInTheDocument()
    expect(screen.getByText('冲突')).toBeInTheDocument()
  })
})
