import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CapabilityRulesUserPanel from './CapabilityRulesUserPanel.vue'

describe('CapabilityRulesUserPanel Rule V2 compatibility', () => {
  it('imports a legacy file into the existing V2 draft without opening a V1 replacement', async () => {
    const snapshot = { schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs: [] }
    const draft = { sessionId: 'v2-existing', draftRevision: 7, dirty: true, projected: { definition: snapshot }, notes: [] }
    const v1Open = vi.fn()
    const v1Import = vi.fn()
    const v2Import = vi.fn(async (_input: unknown) => draft)
    ;(window as any).generationV2 = { capabilityRules: { user: {
      readCommitted: vi.fn(async () => ({ snapshot: null, notes: [] })), readDraft: vi.fn(async () => null),
      openDraft: v1Open, importPack: v1Import,
      v2: { readCommitted: vi.fn(async () => ({ snapshot: { projected: { definition: snapshot } }, notes: [] })),
        readDraft: vi.fn(async () => draft), importPack: v2Import },
    } } }
    const user = userEvent.setup()
    render(CapabilityRulesUserPanel)
    await screen.findByText(/草稿 revision: 7/)
    const transfer = { schemaVersion: 1, contentDigest: 'legacy-validated-by-server' }
    const file = new File([JSON.stringify(transfer)], 'legacy.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(transfer) })
    await user.upload(screen.getByLabelText(/导入 Pack/), file)
    await waitFor(() => expect(v2Import).toHaveBeenCalledWith({ sessionId: 'v2-existing', expectedDraftRevision: 7, transfer }))
    expect(v1Open).not.toHaveBeenCalled()
    expect(v1Import).not.toHaveBeenCalled()
  })
  it('keeps the existing fact-authoring form available after migrating to V2', async () => {
    const snapshot = { schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs: [] }
    const draft = { sessionId: 'v2-add', draftRevision: 1, dirty: false, projected: { definition: snapshot }, notes: [] }
    const addRule = vi.fn(async (_input: unknown) => ({ ...draft, draftRevision: 2, dirty: true }))
    ;(window as any).generationV2 = { capabilityRules: { user: {
      readCommitted: vi.fn(async () => ({ snapshot: null, notes: [] })), readDraft: vi.fn(async () => null),
      v2: { readCommitted: vi.fn(async () => ({ snapshot: { projected: { definition: snapshot } }, notes: [] })),
        readDraft: vi.fn(async () => null), openDraft: vi.fn(async () => draft), addRule },
    } } }
    const user = userEvent.setup()
    const { container } = render(CapabilityRulesUserPanel)
    await user.click(await screen.findByRole('button', { name: '编辑规则' }))
    await user.click(await screen.findByRole('button', { name: '添加 Rule' }))
    const fields = container.querySelector('form')!.querySelectorAll('input')
    await user.type(fields[0]!, 'rule:user-reasoning')
    await user.type(fields[3]!, 'openai')
    await user.type(fields[4]!, 'openai-api-v1')
    await user.type(fields[5]!, 'model:test')
    await user.click(container.querySelector('form button[type="submit"]')!)
    await waitFor(() => expect(addRule).toHaveBeenCalled())
    expect(addRule).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'v2-add', expectedDraftRevision: 1,
      rule: expect.objectContaining({ ruleId: 'rule:user-reasoning', category: 'reasoning', when: null,
        decisionKey: 'fact:reasoning.support', dependencies: [], effect: { kind: 'fact_assertion',
          path: 'reasoning.support', value: { kind: 'support', value: 'supported' } } }) }))
    expect(addRule.mock.calls[0]![0]).not.toHaveProperty('rule.assertion')
  })
  it('reads V2 rules without assertion and opens the matching V2 draft API', async () => {
    const rule = { ruleId: 'reasoning-policy', label: 'Reasoning policy', description: null,
      priority: 4, configured: 'default', providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
      selector: { kind: 'exact', nativeModelIds: ['gpt-test'] }, evidence: null, category: 'reasoning',
      when: null, effect: { kind: 'registered_operation', operationId: 'reasoning_openai',
        parameters: { samplingBehavior: 'preserve' } }, decisionKey: 'reasoning.openai', dependencies: [] }
    const snapshot = { schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs: [{
      schemaVersion: 2, packId: 'user-v2', displayName: 'User V2', description: null, priority: 0,
      mode: 'override', target: 'enabled', rules: [rule],
    }] }
    const readDraft = vi.fn(async () => null)
    const draftFixture = { sessionId: 'v2-session', draftRevision: 1, dirty: false,
      baseSnapshotRevision: 'snapshot:v2', projected: { definition: snapshot }, notes: [] }
    const openDraft = vi.fn(async () => ({ sessionId: 'v2-session', draftRevision: 1, dirty: false,
      baseSnapshotRevision: 'snapshot:v2', projected: { definition: snapshot }, notes: [] }))
    const replaceDraft = vi.fn(async (input: any) => ({ ...draftFixture,
      draftRevision: input.expectedDraftRevision + 1, dirty: true, projected: { definition: input.snapshot } }))
    const saveDraft = vi.fn(async () => ({ snapshotRevision: 'snapshot:v2-next', canonicalSourceRevision: 'source:v2-next' }))
    ;(window as any).generationV2 = { capabilityRules: { user: {
      readCommitted: vi.fn(async () => ({ snapshot: null, notes: [] })), readDraft: vi.fn(async () => null),
      openDraft: vi.fn(), replaceDraft: vi.fn(), addRule: vi.fn(), rewritePack: vi.fn(), importPack: vi.fn(),
      exportCommittedPack: vi.fn(), saveDraft: vi.fn(), cancelDraft: vi.fn(),
      v2: { readCommitted: vi.fn(async () => ({ snapshot: { projected: { definition: snapshot } }, notes: [] })),
        readDraft, openDraft, replaceDraft, addRule: vi.fn(), rewritePack: vi.fn(), importPack: vi.fn(),
        exportCommittedPack: vi.fn(), saveDraft, cancelDraft: vi.fn() },
    } } }

    const user = userEvent.setup()
    render(CapabilityRulesUserPanel)
    await user.click(await screen.findByRole('button', { name: /User V2.*1 Rules/ }))
    await user.click(await screen.findByRole('button', { name: /Reasoning policy.*reasoning/ }))
    expect(screen.getByText('reasoning_openai')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '编辑规则' }))
    expect(openDraft).toHaveBeenCalledTimes(1)
    expect(readDraft).toHaveBeenCalledTimes(1)
    await user.selectOptions(screen.getByRole('combobox'), 'off')
    await screen.findByText('未保存的更改会保留在用户规则草稿中，直到保存或取消。')
    expect(replaceDraft).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'v2-session', expectedDraftRevision: 1,
      snapshot: expect.objectContaining({ schemaVersion: 2,
        packs: [expect.objectContaining({ rules: [expect.objectContaining({ configured: 'off' })] })] }),
    }))
    await user.click(screen.getByRole('button', { name: '保存更改' }))
    expect(saveDraft).toHaveBeenCalledWith({ sessionId: 'v2-session', expectedDraftRevision: 2 })
  })

  it('routes a V2 transfer through the V2 API from a V1-only draft without replacing that draft', async () => {
    const v1Snapshot = { schemaVersion: 1, ownership: 'user', ownerId: 'local-user', packs: [] }
    const v1Draft = { sessionId: 'v1-session', draftRevision: 1, dirty: false,
      projected: { definition: v1Snapshot }, notes: [] }
    const v2Snapshot = { schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs: [] }
    const v2Draft = { sessionId: 'v2-session', draftRevision: 1, dirty: false,
      projected: { definition: v2Snapshot }, notes: [] }
    const v1ReadDraft = vi.fn(async () => null)
    const v1OpenDraft = vi.fn(async () => v1Draft)
    const v1ImportPack = vi.fn(async () => v1Draft)
    const v2ReadDraft = vi.fn(async () => null)
    const v2OpenDraft = vi.fn(async () => v2Draft)
    const v2ImportPack = vi.fn(async () => v2Draft)
    ;(window as any).generationV2 = { capabilityRules: { user: {
      readCommitted: vi.fn(async () => ({ snapshot: { projected: { definition: v1Snapshot } }, notes: [] })),
      readDraft: v1ReadDraft, openDraft: v1OpenDraft, replaceDraft: vi.fn(), addRule: vi.fn(),
      rewritePack: vi.fn(), importPack: v1ImportPack, exportCommittedPack: vi.fn(),
      saveDraft: vi.fn(), cancelDraft: vi.fn(),
      v2: { readCommitted: vi.fn(async () => ({ snapshot: null, notes: [] })), readDraft: v2ReadDraft,
        openDraft: v2OpenDraft, replaceDraft: vi.fn(), addRule: vi.fn(), rewritePack: vi.fn(),
        importPack: v2ImportPack, exportCommittedPack: vi.fn(), saveDraft: vi.fn(), cancelDraft: vi.fn() },
    } } }

    const user = userEvent.setup()
    render(CapabilityRulesUserPanel)
    await user.click(await screen.findByRole('button', { name: '编辑规则' }))
    const file = new File([JSON.stringify({ schemaVersion: 2 })], 'request-rules-v2.json',
      { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify({ schemaVersion: 2 }) })
    await user.upload(screen.getByLabelText(/导入 Pack/), file)

    expect(v1OpenDraft).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(v2ImportPack).toHaveBeenCalled())
    expect(v2OpenDraft).toHaveBeenCalledTimes(1)
    expect(v2ImportPack).toHaveBeenCalledWith({ sessionId: 'v2-session', expectedDraftRevision: 1,
      transfer: { schemaVersion: 2 } })
    expect(v1ImportPack).not.toHaveBeenCalled()
  })
})
