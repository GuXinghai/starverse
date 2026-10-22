import { describe, expect, it, vi } from 'vitest'
import {
  closeResourcesInOrderV2,
  createAppShutdownCoordinatorV2,
  createStoreBackedQuitWarningSourceV2,
  type ActiveWorkSourceV2,
} from './appShutdownCoordinatorV2'

function setup(opts: {
  active?: number
  warning?: () => boolean
  confirm?: boolean
  quiesce?: () => Promise<void>
  drainTimeoutMs?: number
} = {}) {
  const order: string[] = []
  const event = { preventDefault: vi.fn() }
  const source: ActiveWorkSourceV2 = {
    name: 'test',
    activeCount: () => opts.active ?? 0,
    quiesce: async () => { order.push('quiesce'); await opts.quiesce?.() },
    seal: () => { order.push('seal') },
  }
  const confirmQuit = vi.fn(async () => { order.push('confirm'); return opts.confirm ?? true })
  const coordinator = createAppShutdownCoordinatorV2({
    isWarningEnabled: opts.warning ?? (() => true),
    confirmQuit,
    closeResources: async () => { order.push('close') },
    exit: (code) => { order.push(`exit:${code}`) },
    onQuitCancelled: () => { order.push('cancelled') },
    drainTimeoutMs: opts.drainTimeoutMs ?? 50,
    log: () => undefined,
  })
  coordinator.registerSource(source)
  return { coordinator, event, order, confirmQuit }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('app shutdown coordinator', () => {
  it('quits without prompting when no work is running', async () => {
    const { coordinator, event, order, confirmQuit } = setup({ active: 0 })
    coordinator.handleBeforeQuit(event)
    await settle()
    expect(event.preventDefault).toHaveBeenCalled()
    expect(confirmQuit).not.toHaveBeenCalled()
    expect(order).toEqual(['quiesce', 'seal', 'close', 'exit:0'])
  })

  it('Cancel leaves work untouched and allows a later quit', async () => {
    const { coordinator, event, order } = setup({ active: 2, confirm: false })
    coordinator.handleBeforeQuit(event)
    await settle()
    expect(order).toEqual(['confirm', 'cancelled'])
    expect(coordinator.state).toBe('running')
    coordinator.handleBeforeQuit(event)
    await settle()
    expect(order.filter((step) => step === 'confirm')).toHaveLength(2)
  })

  it('Quit anyway aborts and drains before closing resources', async () => {
    const { coordinator, event, order } = setup({ active: 1, confirm: true })
    coordinator.handleBeforeQuit(event)
    await settle()
    expect(order).toEqual(['confirm', 'quiesce', 'seal', 'close', 'exit:0'])
  })

  it('skips the prompt when the warning is disabled but still drains first', async () => {
    const { coordinator, event, order, confirmQuit } = setup({ active: 1, warning: () => false })
    coordinator.handleBeforeQuit(event)
    await settle()
    expect(confirmQuit).not.toHaveBeenCalled()
    expect(order).toEqual(['quiesce', 'seal', 'close', 'exit:0'])
  })

  it('reads the preference live so a saved change applies without restart', async () => {
    const prefs: Record<string, unknown> = {}
    const store = { get: (key: string) => (key === 'generationV2UiPreferences' ? prefs : undefined) }
    const warning = createStoreBackedQuitWarningSourceV2(store)
    expect(warning()).toBe(true)
    prefs.warnOnQuitWithActiveWork = false
    expect(warning()).toBe(false)
    prefs.warnOnQuitWithActiveWork = true
    expect(warning()).toBe(true)
    prefs.warnOnQuitWithActiveWork = 'garbage'
    expect(warning()).toBe(true)

    const { coordinator, event, order } = setup({ active: 1, warning })
    prefs.warnOnQuitWithActiveWork = false
    coordinator.handleBeforeQuit(event)
    await settle()
    expect(order).not.toContain('confirm')
  })

  it('is idempotent for repeated quit requests', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { coordinator, event, order } = setup({ active: 1, confirm: true, quiesce: () => gate, drainTimeoutMs: 1_000 })
    coordinator.handleBeforeQuit(event)
    coordinator.handleBeforeQuit(event) // while the dialog is pending
    await settle()
    coordinator.handleBeforeQuit(event) // while draining
    await settle()
    release()
    await settle()
    coordinator.handleBeforeQuit(event) // after exit was requested
    await settle()
    expect(event.preventDefault).toHaveBeenCalledTimes(4)
    expect(order.filter((step) => step === 'confirm')).toHaveLength(1)
    expect(order.filter((step) => step === 'close')).toHaveLength(1)
    expect(order.filter((step) => step === 'exit:0')).toHaveLength(1)
  })

  it('never waits indefinitely: a hung drain times out, then seals before closing', async () => {
    const { coordinator, event, order } = setup({ active: 1, warning: () => false, quiesce: () => new Promise<void>(() => undefined), drainTimeoutMs: 20 })
    coordinator.handleBeforeQuit(event)
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(order).toEqual(['quiesce', 'seal', 'close', 'exit:0'])
  })

  it('exits with code 1 when closing resources fails', async () => {
    const exit = vi.fn()
    const coordinator = createAppShutdownCoordinatorV2({
      isWarningEnabled: () => false, confirmQuit: async () => true,
      closeResources: async () => { throw new Error('boom') }, exit, drainTimeoutMs: 10, log: () => undefined,
    })
    coordinator.handleBeforeQuit({ preventDefault: () => undefined })
    await settle()
    expect(exit).toHaveBeenCalledWith(1)
  })
})

describe('closeResourcesInOrderV2', () => {
  it('P1-04: closes the database even when an earlier close step fails, then reports the first failure', async () => {
    const order: string[] = []
    const first = new Error('store close failed')
    await expect(closeResourcesInOrderV2([
      () => { order.push('store'); throw first },
      async () => { order.push('refresh'); throw new Error('refresh dispose failed') },
      () => { order.push('fixture') },
    ], async () => { order.push('database') })).rejects.toBe(first)
    expect(order).toEqual(['store', 'refresh', 'fixture', 'database'])
  })

  it('runs every step in order and resolves when all succeed', async () => {
    const order: string[] = []
    await closeResourcesInOrderV2([() => { order.push('a') }, async () => { order.push('b') }],
      async () => { order.push('database') })
    expect(order).toEqual(['a', 'b', 'database'])
  })
})
