import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CapabilityRulesOverviewPanel from './CapabilityRulesOverviewPanel.vue'

describe('CapabilityRulesOverviewPanel', () => {
  it('views and applies exactly the persisted Cloud candidate revision', async () => {
    const candidateDiff = vi.fn(async () => ({ current: null, candidate: '{"packs":[]}' }))
    const apply = vi.fn(async () => null)
    ;(window as any).generationV2 = { capabilityRules: { cloud: {
      read: vi.fn(async () => ({ distribution: { latestObserved: { releaseVersion: '1.1.0' },
        candidate: { candidateRecordRevision: 'candidate:7', releaseVersion: '1.1.0' } },
      application: { appliedIntegrity: 'valid', appliedRecordRevision: 3, applied: { releaseVersion: '1.0.0', document: { packs: [] } },
        overrides: { revision: 4, overrides: [] } },
      active: { activeSnapshot: null } })),
      check: vi.fn(async () => null), candidateDiff, apply,
    }, user: { readCommitted: vi.fn(async () => ({ snapshot: null, notes: [] })) } } }
    const user = userEvent.setup()
    render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
    await screen.findByText('候选发布: 1.1.0')
    await user.click(screen.getByRole('button', { name: '查看变更' }))
    await waitFor(() => expect(candidateDiff).toHaveBeenCalledWith({
      expectedCandidateRecordRevision: 'candidate:7', expectedAppliedRecordRevision: 3,
    }))
    await user.click(screen.getByRole('button', { name: '应用更新' }))
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(apply).toHaveBeenCalledWith({
      expectedCandidateRecordRevision: 'candidate:7', expectedAppliedRecordRevision: 3,
    }))
  })

  it('removes a local rule override when the Cloud baseline option is selected', async () => {
    const replaceActivationOverrides = vi.fn(async () => null)
    ;(window as any).generationV2 = { capabilityRules: { cloud: {
      read: vi.fn(async () => ({ distribution: { latestObserved: null, candidate: null },
        application: { appliedIntegrity: 'valid', appliedRecordRevision: 8, applied: null,
          overrides: { revision: 9, overrides: [{ kind: 'rule', ruleId: 'rule:one', configured: 'off' }] } },
        active: { activeSnapshot: { projected: { definition: { packs: [{ packId: 'pack:one', displayName: 'Pack',
          priority: 0, mode: 'no_control', target: 'enabled', rules: [{ ruleId: 'rule:one', label: null,
            configured: 'off', assertion: { path: 'reasoning.support' } }] }] } } } }, history: [] })),
      replaceActivationOverrides, check: vi.fn(async () => null), candidateDiff: vi.fn(async () => null),
      apply: vi.fn(async () => null), rollback: vi.fn(async () => null), setHistoryLimit: vi.fn(async () => null),
      resumeUpdates: vi.fn(async () => null),
    }, user: { readCommitted: vi.fn(async () => ({ snapshot: null, notes: [] })) } } }
    const user = userEvent.setup()
    render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
    await user.click(await screen.findByRole('button', { name: /Pack.*1 Rules/ }))
    await user.click(await screen.findByRole('button', { name: /rule:one.*reasoning\.support/ }))
    const select = await screen.findByRole('combobox')
    await fireEvent.update(select, 'remote:off')
    await waitFor(() => expect(replaceActivationOverrides).toHaveBeenCalledWith({
      expectedAppliedRecordRevision: 8, expectedOverrideRevision: 9, overrides: [],
    }))
  })

  it('hides stale shared Cloud facts when the persisted LKG is invalid', async () => {
    ;(window as any).generationV2 = { capabilityRules: { cloud: {
      read: vi.fn(async () => ({ distribution: { latestObserved: null, candidate: null },
        application: { appliedIntegrity: 'invalid', appliedRecordRevision: 8, applied: null,
          overrides: { revision: 9, overrides: [] } },
        active: { activeSnapshot: { projected: { definition: { packs: [{ packId: 'pack:one', displayName: 'Pack',
          priority: 0, mode: 'no_control', target: 'enabled', rules: [] }] } } } }, history: [] })),
      check: vi.fn(async () => null), candidateDiff: vi.fn(async () => null), apply: vi.fn(async () => null),
      rollback: vi.fn(async () => null), replaceActivationOverrides: vi.fn(async () => null),
      setHistoryLimit: vi.fn(async () => null), resumeUpdates: vi.fn(async () => null),
    }, user: { readCommitted: vi.fn(async () => ({ snapshot: null, notes: [] })) } } }
    render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
    expect(await screen.findByTestId('cloud-rules-integrity-invalid')).toHaveTextContent('云端规则已停用')
    expect(screen.getByTestId('cloud-rules-integrity-invalid')).toHaveTextContent('使用“检查更新”下载经验证的发布副本')
    expect(screen.queryByText('Pack')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('keeps User Rule edits in the session draft until the batch Save', async () => {
    const replaceDraft = vi.fn(async (input: any) => ({
      ...draftFixture, draftRevision: input.expectedDraftRevision + 1, dirty: true,
      projected: { definition: input.snapshot },
    }))
    const saveDraft = vi.fn(async () => ({ snapshotRevision: 'snapshot:2', canonicalSourceRevision: 'source:2' }))
    const draftFixture = {
      sessionId: 'session:1', draftRevision: 1, dirty: false, notes: [],
      projected: { definition: { schemaVersion: 1, ownership: 'user', ownerId: 'local-user', packs: [{
        schemaVersion: 1, packId: 'pack:one', displayName: 'User Pack', description: null, priority: 0,
        mode: 'no_control', target: 'enabled', rules: [{ ruleId: 'rule:one', label: null, description: null,
          priority: 0, configured: 'default', providerAuthorityId: 'openai', endpointProfileId: 'openai-default',
          selector: { kind: 'exact', nativeModelIds: ['gpt-test'] },
          assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } }, evidence: null }],
      }] } },
    }
    ;(window as any).generationV2 = { capabilityRules: { user: {
      readCommitted: vi.fn(async () => ({ snapshot: null, notes: [] })),
      readDraft: vi.fn(async () => null), openDraft: vi.fn(async () => draftFixture), replaceDraft,
      addRule: vi.fn(), rewritePack: vi.fn(), importPack: vi.fn(), exportCommittedPack: vi.fn(), saveDraft,
      cancelDraft: vi.fn(),
    } } }
    const user = userEvent.setup()
    render(CapabilityRulesOverviewPanel, { props: { ownership: 'user' } })
    await user.click(await screen.findByRole('button', { name: '编辑规则' }))
    await user.click(await screen.findByRole('button', { name: /User Pack.*1 Rules/ }))
    await user.click(await screen.findByRole('button', { name: /rule:one.*reasoning\.support/ }))
    await user.selectOptions((await screen.findAllByRole('combobox'))[0]!, 'off')
    await waitFor(() => expect(replaceDraft).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session:1', expectedDraftRevision: 1,
    })))
    await user.click(screen.getByRole('button', { name: '保存更改' }))
    await waitFor(() => expect(saveDraft).toHaveBeenCalledWith({ sessionId: 'session:1', expectedDraftRevision: 2 }))
  })

  it('rolls back a persisted Cloud history record with the current revision and optional pin', async () => {
    const rollback = vi.fn(async () => null)
    ;(window as any).generationV2 = { capabilityRules: { cloud: {
      read: vi.fn(async () => ({ distribution: { latestObserved: null, candidate: null },
        application: { appliedIntegrity: 'valid', appliedRecordRevision: 8, applied: null,
          policy: { policyRevision: 3, historyLimit: 4, pin: null }, overrides: { revision: 1, overrides: [] } },
        active: { activeSnapshot: null }, history: [{ appliedRecordRevision: 7, releaseVersion: '1.0.0', contentRevision: 'sha256:' + 'a'.repeat(64) }] })),
      rollback, check: vi.fn(), candidateDiff: vi.fn(), apply: vi.fn(), replaceActivationOverrides: vi.fn(),
      setHistoryLimit: vi.fn(), resumeUpdates: vi.fn(),
    }, user: { readCommitted: vi.fn(), readDraft: vi.fn(), openDraft: vi.fn(), replaceDraft: vi.fn(),
      addRule: vi.fn(), rewritePack: vi.fn(), importPack: vi.fn(), exportCommittedPack: vi.fn(), saveDraft: vi.fn(), cancelDraft: vi.fn() } } }
    const user = userEvent.setup()
    render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
    await user.click(await screen.findByRole('button', { name: '回滚' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(rollback).toHaveBeenCalledWith({ expectedAppliedRecordRevision: 8,
      expectedHistoryTargetRecordRevision: 7, pinTarget: true }))
  })

  describe('Cloud lifecycle closure', () => {
    const contentRevision = 'sha256:' + 'c'.repeat(64)
    const remoteRule = {
      ruleId: 'anthropic-v1-thinking', label: 'reasoning.support', description: 'Thinking is supported.',
      priority: 0, configured: 'default', providerAuthorityId: 'anthropic', endpointProfileId: 'anthropic-api',
      selector: { kind: 'exact', nativeModelIds: ['claude-a', 'claude-b'] },
      assertion: { path: 'reasoning.support', value: { kind: 'support', value: 'supported' } },
      evidence: { evidenceSourceRef: 'anthropic-E001', evidenceKind: 'explicit_provider', evidenceNote: 'Official model doc.',
        identityEvidenceKind: 'official_exact_model_doc', identityEvidenceSourceRef: 'anthropic-E002',
        provenanceUrl: 'https://example.test/models', verifiedAt: '2026-10-02T00:00:00.000Z', derivation: null },
    }
    const pack = (rules: readonly unknown[]) => ({ schemaVersion: 1, packId: 'pack.anthropic', displayName: 'Anthropic',
      description: null, priority: 0, mode: 'no_control', target: 'enabled', rules })

    function cloudState(overrides: Record<string, any> = {}) {
      const { distribution, application, ...rest } = overrides
      return {
        distribution: { lastAttemptedAtMs: 1_000, lastSuccessfulCheckAtMs: 1_000, lastFailureCode: null,
          latestObserved: { releaseVersion: '1.0.0', contentRevision }, candidate: null, ...distribution },
        application: { appliedIntegrity: 'valid', appliedRecordRevision: 2,
          applied: { releaseVersion: '1.0.0', contentRevision, appliedAtMs: 1_000, document: { packs: [pack([remoteRule])] } },
          policy: { policyRevision: 5, historyLimit: 4, pin: null }, overrides: { revision: 3, overrides: [] }, ...application },
        active: { activeSnapshot: { projected: { definition: { packs: [pack([remoteRule])] } } } },
        history: [], ...rest,
      }
    }

    function installCloud(api: Record<string, unknown>) {
      const cloud = { read: vi.fn(async () => cloudState()), check: vi.fn(async () => ({ ok: true })),
        candidateDiff: vi.fn(), apply: vi.fn(), rollback: vi.fn(), replaceActivationOverrides: vi.fn(),
        setHistoryLimit: vi.fn(), resumeUpdates: vi.fn(), ...api }
      ;(window as any).generationV2 = { capabilityRules: { cloud, user: { readCommitted: vi.fn() } } }
      return cloud
    }

    it('shows a failed update check as a failure with a readable message, not as up to date', async () => {
      const read = vi.fn()
        .mockResolvedValueOnce(cloudState())
        .mockResolvedValue(cloudState({ distribution: { lastAttemptedAtMs: 2_000, lastFailureCode: 'CLOUD_RULES_TIMEOUT' } }))
      const check = vi.fn(async () => ({ ok: false, status: 'failed', code: 'CLOUD_RULES_TIMEOUT' }))
      installCloud({ read, check })
      const user = userEvent.setup()
      render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      expect(await screen.findByText('已是最新。')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '检查更新' }))
      expect(await screen.findByTestId('cloud-rules-check-failure')).toHaveTextContent('更新检查超时，请稍后重试。')
      expect(screen.getByTestId('cloud-rules-check-failure')).toHaveTextContent('CLOUD_RULES_TIMEOUT')
      expect(screen.getByText('上次更新检查失败。这不等于“没有更新”。')).toBeInTheDocument()
      expect(screen.queryByText('已是最新。')).not.toBeInTheDocument()
      expect(check).toHaveBeenCalledTimes(1)
    })

    it('shows freshness: last successful check, latest release, candidate, and first-run states', async () => {
      installCloud({ read: vi.fn(async () => cloudState()) })
      const { unmount } = render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      const freshness = await screen.findByTestId('cloud-rules-freshness')
      await waitFor(() => expect(freshness).toHaveTextContent('已是最新。'))
      expect(freshness).toHaveTextContent('最新发布: 1.0.0')
      expect(freshness).toHaveTextContent('上次成功检查: ' + new Date(1_000).toLocaleString())
      expect(freshness).toHaveTextContent('cccccccccccc')
      unmount()

      installCloud({ read: vi.fn(async () => cloudState({
        distribution: { lastAttemptedAtMs: null, lastSuccessfulCheckAtMs: null, latestObserved: null },
        application: { appliedIntegrity: 'missing', appliedRecordRevision: null, applied: null },
        active: { activeSnapshot: null } })) })
      const firstRun = render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      expect(await screen.findByText('尚未检查。启动后会自动进行首次检查。')).toBeInTheDocument()
      expect(screen.getByTestId('cloud-rules-empty')).toHaveTextContent('正在等待首次更新检查')
      firstRun.unmount()

      installCloud({ read: vi.fn(async () => cloudState({
        distribution: { latestObserved: { releaseVersion: '1.0.0', contentRevision },
          candidate: { candidateRecordRevision: 'candidate:1', releaseVersion: '1.0.0' } },
        application: { appliedIntegrity: 'missing', appliedRecordRevision: null, applied: null },
        active: { activeSnapshot: null } })) })
      render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      expect(await screen.findByText('云端规则已可安装。')).toBeInTheDocument()
      expect(screen.getByTestId('cloud-rules-freshness')).toHaveTextContent('有候选更新: 1.0.0')
      expect(screen.getByRole('button', { name: '安装云端规则' })).toBeInTheDocument()
    })

    it('summarizes candidate changes instead of dumping the candidate JSON', async () => {
      const changedRule = { ...remoteRule, selector: { kind: 'exact', nativeModelIds: ['claude-a', 'claude-c'] },
        assertion: { ...remoteRule.assertion, value: { kind: 'support', value: 'unsupported' } } }
      const addedRule = { ...remoteRule, ruleId: 'anthropic-v1-vision', label: null,
        assertion: { path: 'input.image.support', value: { kind: 'support', value: 'supported' } } }
      const current = JSON.stringify({ releaseVersion: '1.0.0', packs: [pack([remoteRule]),
        { ...pack([]), packId: 'pack.old', displayName: 'Old' }] })
      const candidate = JSON.stringify({ releaseVersion: '1.1.0', packs: [pack([changedRule, addedRule])] })
      const candidateDiff = vi.fn(async () => ({ current, candidate }))
      installCloud({ candidateDiff, read: vi.fn(async () => cloudState({ distribution: {
        latestObserved: { releaseVersion: '1.1.0', contentRevision: 'sha256:' + 'd'.repeat(64) },
        candidate: { candidateRecordRevision: 'candidate:2', releaseVersion: '1.1.0' } } })) })
      const user = userEvent.setup()
      render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      await user.click(await screen.findByRole('button', { name: '查看变更' }))
      const diff = await screen.findByTestId('cloud-candidate-diff')
      expect(screen.getByTestId('cloud-candidate-diff-summary')).toHaveTextContent(
        '规则包：新增 0，移除 1，变更 0。规则：新增 1，移除 0，变更 1，未变 0。')
      expect(diff).toHaveTextContent('从 1.0.0 到 1.1.0 的变更。')
      const changed = screen.getByTestId('cloud-candidate-diff-rules-changed')
      expect(changed).toHaveTextContent('anthropic-v1-thinking')
      expect(changed).toHaveTextContent('模型: claude-a, claude-b → claude-a, claude-c')
      expect(changed).toHaveTextContent('取值: {"kind":"support","value":"supported"} → {"kind":"support","value":"unsupported"}')
      expect(screen.getByTestId('cloud-candidate-diff-rules-added')).toHaveTextContent('anthropic-v1-vision · input.image.support')
      expect(screen.getByTestId('cloud-candidate-diff-packs')).toHaveTextContent('− Old')
      expect(screen.queryByTestId('cloud-candidate-raw')).not.toBeInTheDocument()
    })

    it('renders Rule detail with selector models, asserted value, remote baseline and local override', async () => {
      const effective = { ...remoteRule, configured: 'off' }
      installCloud({ read: vi.fn(async () => cloudState({
        application: { overrides: { revision: 3, overrides: [{ kind: 'rule', ruleId: remoteRule.ruleId, configured: 'off' }] } },
        active: { activeSnapshot: { projected: { definition: { packs: [pack([effective])] } } } } })) })
      const user = userEvent.setup()
      render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      await user.click(await screen.findByRole('button', { name: /Anthropic.*1 Rules/ }))
      const row = await screen.findByRole('button', { name: /anthropic-v1-thinking · reasoning\.support · claude-a \+1/ })
      expect(row).toHaveTextContent('本地覆盖')
      await user.click(row)
      const detail = await screen.findByTestId('cloud-rule-detail')
      expect(detail).toHaveTextContent('Thinking is supported.')
      expect(detail).toHaveTextContent('anthropic / anthropic-api')
      expect(screen.getByTestId('cloud-rule-model-ids')).toHaveTextContent('claude-aclaude-b')
      expect(screen.getByTestId('cloud-rule-asserted-value')).toHaveTextContent('{"kind":"support","value":"supported"}')
      expect(screen.getByTestId('cloud-rule-baseline')).toHaveTextContent('远端基线: 默认 · 本地覆盖: 关')
      expect(detail).toHaveTextContent('实际启用状态')
      expect(screen.getByTestId('cloud-rule-evidence')).toHaveTextContent('anthropic-E001')
      expect(screen.getByTestId('cloud-rule-evidence')).toHaveTextContent('https://example.test/models')
      expect(screen.getByRole('heading', { name: 'anthropic-v1-thinking' })).toBeInTheDocument()
      expect((screen.getByRole('combobox', { name: /本地启用设置/ }) as HTMLSelectElement).value).toBe('off')
    })

    it('renders regex selector details', async () => {
      const regexRule = { ...remoteRule, selector: { kind: 'regex', pattern: '^claude-',
        positiveExamples: ['claude-a'], negativeExamples: ['gpt-a'] } }
      installCloud({ read: vi.fn(async () => cloudState({
        active: { activeSnapshot: { projected: { definition: { packs: [pack([regexRule])] } } } } })) })
      const user = userEvent.setup()
      render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      await user.click(await screen.findByRole('button', { name: /Anthropic.*1 Rules/ }))
      await user.click(await screen.findByRole('button', { name: /anthropic-v1-thinking/ }))
      const regex = await screen.findByTestId('cloud-rule-regex')
      expect(regex).toHaveTextContent('/^claude-/')
      expect(regex).toHaveTextContent('匹配: claude-a')
      expect(regex).toHaveTextContent('不匹配: gpt-a')
    })

    it('reloads current state and explains a stale save instead of leaving stale revisions', async () => {
      const read = vi.fn()
        .mockResolvedValueOnce(cloudState())
        .mockResolvedValue(cloudState({ application: { overrides: { revision: 4, overrides: [] } } }))
      const replaceActivationOverrides = vi.fn()
        .mockRejectedValueOnce(new Error("Error invoking remote method 'generation-v2:capability-rules:cloud:replace-activation-overrides': Error: GENERATION_V2_CLOUD_RULES_APPLICATION_STALE"))
        .mockResolvedValue(null)
      installCloud({ read, replaceActivationOverrides })
      const user = userEvent.setup()
      render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      await user.click(await screen.findByRole('button', { name: /Anthropic.*1 Rules/ }))
      await user.click(await screen.findByRole('button', { name: /anthropic-v1-thinking/ }))
      await fireEvent.update(await screen.findByRole('combobox', { name: /本地启用设置/ }), 'off')
      expect(await screen.findByTestId('cloud-rules-error')).toHaveTextContent('加载此视图后云端规则已发生变化')
      expect(read).toHaveBeenCalledTimes(2)
      await fireEvent.update(screen.getByRole('combobox', { name: /本地启用设置/ }), 'on')
      await waitFor(() => expect(replaceActivationOverrides).toHaveBeenLastCalledWith({
        expectedAppliedRecordRevision: 2, expectedOverrideRevision: 4,
        overrides: [{ kind: 'rule', ruleId: remoteRule.ruleId, configured: 'on' }] }))
    })

    it('runs a fresh update check right after Resume updates and shows the newer release while pinned', async () => {
      const pinned = cloudState({ distribution: { latestObserved: { releaseVersion: '1.1.0', contentRevision: 'sha256:' + 'd'.repeat(64) } },
        application: { policy: { policyRevision: 5, historyLimit: 4, pin: { releaseVersion: '1.0.0', contentRevision } } } })
      const read = vi.fn().mockResolvedValueOnce(pinned).mockResolvedValue(cloudState({ distribution: {
        latestObserved: { releaseVersion: '1.1.0', contentRevision: 'sha256:' + 'd'.repeat(64) },
        candidate: { candidateRecordRevision: 'candidate:3', releaseVersion: '1.1.0' } } }))
      const resumeUpdates = vi.fn(async () => null)
      const check = vi.fn(async () => ({ ok: true }))
      installCloud({ read, resumeUpdates, check })
      const user = userEvent.setup()
      render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      expect(await screen.findByText(/最新可用：1\.1\.0/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '恢复更新' }))
      await waitFor(() => expect(check).toHaveBeenCalledTimes(1))
      expect(resumeUpdates).toHaveBeenCalledWith({ expectedPolicyRevision: 5 })
      expect(resumeUpdates.mock.invocationCallOrder[0]).toBeLessThan(check.mock.invocationCallOrder[0]!)
      expect(await screen.findByText('候选发布: 1.1.0')).toBeInTheDocument()
    })

    it('offers a same-version Repair for a corrupt applied snapshot with the current revisions', async () => {
      const apply = vi.fn(async () => null)
      installCloud({ apply, read: vi.fn(async () => cloudState({
        distribution: { candidate: { candidateRecordRevision: 'candidate:1', releaseVersion: '1.0.0' } },
        application: { appliedIntegrity: 'invalid', appliedRecordRevision: 8, applied: null },
        active: { activeSnapshot: null } })) })
      const user = userEvent.setup()
      render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
      expect(await screen.findByTestId('cloud-rules-integrity-invalid')).toHaveTextContent('使用下方的“修复”重新安装经验证的发布')
      await user.click(screen.getByRole('button', { name: '修复' }))
      expect(screen.getByText(/重新安装这个已验证的发布以替换损坏的本地快照吗/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '确认' }))
      await waitFor(() => expect(apply).toHaveBeenCalledWith({
        expectedCandidateRecordRevision: 'candidate:1', expectedAppliedRecordRevision: 8 }))
    })

    it('reloads when the Cloud tab becomes active again', async () => {
      const read = vi.fn(async () => cloudState())
      installCloud({ read })
      const view = render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud', active: true } })
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
      await view.rerender({ ownership: 'cloud', active: false })
      await view.rerender({ ownership: 'cloud', active: true })
      await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    })
  })
})
