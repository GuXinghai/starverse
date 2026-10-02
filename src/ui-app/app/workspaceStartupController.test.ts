import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceStartupController, WorkspaceStartupSupersededError, type WorkspaceStartupLease } from './workspaceStartupController'

const deferred = () => { let resolve!: () => void; return { promise: new Promise<void>(done => { resolve = done }), resolve: () => resolve() } }
const reset = { templateConversationId: 'template:one', resetModelConfig: true, resetDraftAttachments: true }

describe('workspace startup controller', () => {
  it('coalesces initialization and duplicate retries, then retains readiness', async () => {
    const gate = deferred()
    const initialize = vi.fn(() => gate.promise)
    const controller = createWorkspaceStartupController({ initialize })
    const first = controller.run()
    expect(controller.retry()).toBe(first)
    await Promise.resolve()
    expect(initialize).toHaveBeenCalledTimes(1)
    expect(controller.state.value.phase).toBe('loading')
    gate.resolve()
    await first
    expect(controller.state.value.phase).toBe('ready')
    await controller.retry()
    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it('publishes a bounded error and reruns initialization only on an explicit retry', async () => {
    const initialize = vi.fn().mockRejectedValueOnce(new Error('native-secret-path AUDIT_DUMMY')).mockResolvedValueOnce(undefined)
    const controller = createWorkspaceStartupController({ initialize })
    await controller.run()
    expect(controller.state.value).toEqual({ phase: 'error', attempt: 1, error: 'initialization_failed' })
    expect(JSON.stringify(controller.state.value)).not.toContain('AUDIT_DUMMY')
    expect(initialize).toHaveBeenCalledTimes(1)
    await controller.retry()
    expect(controller.state.value).toEqual({ phase: 'ready', attempt: 2, error: null })
  })

  it('fences late completion after disposal and invalidates the publication lease', async () => {
    const gate = deferred()
    let lease!: WorkspaceStartupLease
    const controller = createWorkspaceStartupController({ initialize: async current => { lease = current; await gate.promise } })
    const pending = controller.run()
    await Promise.resolve()
    controller.dispose()
    expect(lease.isCurrent()).toBe(false)
    expect(() => lease.assertCurrent()).toThrow(WorkspaceStartupSupersededError)
    gate.resolve()
    await pending
    expect(controller.state.value.phase).toBe('loading')
    await controller.retry()
    expect(controller.state.value.phase).toBe('loading')
  })

  it('does not declare a superseded scope ready', async () => {
    const controller = createWorkspaceStartupController({ initialize: async () => { throw new WorkspaceStartupSupersededError() } })
    await controller.run()
    expect(controller.state.value).toMatchObject({ phase: 'error', error: 'superseded' })
  })

  it('remembers only acknowledged resets and checks their persisted template revision', async () => {
    const controller = createWorkspaceStartupController({ initialize: async () => {} })
    expect(controller.hasAcknowledgedTemplateReset({ ...reset, templateRevision: 0 })).toBe(false)
    controller.acknowledgeTemplateReset({ ...reset, expectedTemplateRevision: 0, acknowledgedTemplateRevision: 1 })
    expect(controller.hasAcknowledgedTemplateReset({ ...reset, templateRevision: 2 })).toBe(true)
    expect(controller.hasAcknowledgedTemplateReset({ ...reset, templateConversationId: 'template:two', templateRevision: 0 })).toBe(false)
    expect(controller.hasAcknowledgedTemplateReset({ ...reset, resetModelConfig: false, templateRevision: 2 })).toBe(false)
    expect(() => controller.hasAcknowledgedTemplateReset({ ...reset, templateRevision: 0 })).toThrow('WORKSPACE_STARTUP_TEMPLATE_REVISION_INVALID')
    expect(() => controller.acknowledgeTemplateReset({ ...reset, expectedTemplateRevision: 2, acknowledgedTemplateRevision: 2 })).toThrow()
  })

  it('records a committed reset even when its acknowledgement arrives after disposal', async () => {
    const gate = deferred()
    const controller = createWorkspaceStartupController({ initialize: async lease => {
      await gate.promise
      controller.acknowledgeTemplateReset({ ...reset, expectedTemplateRevision: 0, acknowledgedTemplateRevision: 1 })
      lease.assertCurrent()
    } })
    const pending = controller.run()
    await Promise.resolve()
    controller.dispose()
    gate.resolve()
    await pending
    expect(controller.hasAcknowledgedTemplateReset({ ...reset, templateRevision: 1 })).toBe(true)
    expect(controller.state.value.phase).toBe('loading')
  })
})
