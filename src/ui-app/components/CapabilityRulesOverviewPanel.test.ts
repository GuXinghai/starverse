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
    render(CapabilityRulesOverviewPanel, { props: { ownership: 'cloud' } })
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
    await waitFor(() => expect(screen.getByText('没有可用的规则包。')).toBeInTheDocument())
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
