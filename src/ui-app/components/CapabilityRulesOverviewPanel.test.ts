import { render, screen, waitFor } from '@testing-library/vue'
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
      application: { appliedRecordRevision: 3, applied: { releaseVersion: '1.0.0', document: { packs: [] } } } })),
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
})
