import { describe, expect, it, vi } from 'vitest'
import { createCompatibleRequestRegistry } from './compatibleRequestRegistry'

function timers() {
  let nextId = 0
  const callbacks = new Map<number, () => void>()
  return {
    callbacks,
    setTimer: vi.fn((callback: () => void) => {
      const id = ++nextId
      callbacks.set(id, callback)
      return id as unknown as ReturnType<typeof setTimeout>
    }),
    clearTimer: vi.fn((id: ReturnType<typeof setTimeout>) => callbacks.delete(id as unknown as number)),
  }
}

describe('compatibleRequestRegistry', () => {
  it('owns header/overall/idle timers and finishes idempotently', () => {
    const clock = timers()
    const registry = createCompatibleRequestRegistry(clock)
    const handle = registry.start({ requestId: 'request-1', ownerWebContentsId: 7, headersTimeoutMs: 30_000, overallTimeoutMs: 60_000 })
    expect(registry.activeCount()).toBe(1)
    handle.markHeadersReceived()
    handle.armIdleTimeout(1_000)
    handle.armIdleTimeout(2_000)
    handle.clearIdleTimeout()
    handle.finish()
    handle.finish()
    expect(registry.activeCount()).toBe(0)
    expect(handle.signal.aborted).toBe(false)
  })

  it('aborts once with a typed user reason and rejects duplicate abort', () => {
    const registry = createCompatibleRequestRegistry(timers())
    const handle = registry.start({ requestId: 'request-1', ownerWebContentsId: 7, headersTimeoutMs: 30_000, overallTimeoutMs: 60_000 })
    expect(handle.abort('user_abort')).toBe(true)
    expect(handle.abort('user_abort')).toBe(false)
    expect(handle.signal.aborted).toBe(true)
    expect(handle.signal.reason).toBe('user_abort')
    expect(handle.abortReason()).toBe('user_abort')
    expect(registry.activeCount()).toBe(0)
  })

  it('aborts every request for a destroyed WebContents without touching another owner', () => {
    const registry = createCompatibleRequestRegistry(timers())
    const first = registry.start({ requestId: 'request-1', ownerWebContentsId: 7, headersTimeoutMs: 30_000, overallTimeoutMs: 60_000 })
    const second = registry.start({ requestId: 'request-2', ownerWebContentsId: 7, headersTimeoutMs: 30_000, overallTimeoutMs: 60_000 })
    const other = registry.start({ requestId: 'request-3', ownerWebContentsId: 8, headersTimeoutMs: 30_000, overallTimeoutMs: 60_000 })
    expect(registry.abortOwner(7)).toBe(2)
    expect(first.signal.reason).toBe('window_destroyed')
    expect(second.signal.reason).toBe('window_destroyed')
    expect(other.signal.aborted).toBe(false)
    expect(registry.activeCount()).toBe(1)
  })

  it('does not let one WebContents abort another owner request', () => {
    const registry = createCompatibleRequestRegistry(timers())
    const handle = registry.start({ requestId: 'request-1', ownerWebContentsId: 7, headersTimeoutMs: 30_000, overallTimeoutMs: 60_000 })
    expect(registry.abortRequestForOwner('request-1', 8)).toBe(false)
    expect(handle.signal.aborted).toBe(false)
    expect(registry.abortRequestForOwner('request-1', 7)).toBe(true)
    expect(handle.signal.reason).toBe('user_abort')
  })

  it('aborts all active requests on app shutdown', () => {
    const registry = createCompatibleRequestRegistry(timers())
    const first = registry.start({ requestId: 'request-1', ownerWebContentsId: 7, headersTimeoutMs: 30_000, overallTimeoutMs: 60_000 })
    const second = registry.start({ requestId: 'request-2', ownerWebContentsId: 8, headersTimeoutMs: 30_000, overallTimeoutMs: 60_000 })
    expect(registry.abortAll()).toBe(2)
    expect(first.signal.reason).toBe('app_shutdown')
    expect(second.signal.reason).toBe('app_shutdown')
    expect(registry.activeCount()).toBe(0)
  })

  it('fires headers and idle timeout callbacks with distinct reasons', () => {
    const headersClock = timers()
    const headersRegistry = createCompatibleRequestRegistry(headersClock)
    const headers = headersRegistry.start({ requestId: 'headers', ownerWebContentsId: 1, headersTimeoutMs: 10, overallTimeoutMs: 20 })
    headersClock.callbacks.get(1)?.()
    expect(headers.signal.reason).toBe('headers_timeout')

    const idleClock = timers()
    const idleRegistry = createCompatibleRequestRegistry(idleClock)
    const idle = idleRegistry.start({ requestId: 'idle', ownerWebContentsId: 1, headersTimeoutMs: 10, overallTimeoutMs: 20 })
    idle.markHeadersReceived()
    idle.armIdleTimeout(5)
    idleClock.callbacks.get(3)?.()
    expect(idle.signal.reason).toBe('idle_timeout')
  })

  it('enforces explicit global and per-owner concurrency limits without evicting requests', () => {
    const registry = createCompatibleRequestRegistry({ ...timers(), maxActiveRequests: 3, maxActivePerOwner: 2 })
    registry.start({ requestId: 'owner-1-a', ownerWebContentsId: 1, headersTimeoutMs: 10, overallTimeoutMs: 20 })
    registry.start({ requestId: 'owner-1-b', ownerWebContentsId: 1, headersTimeoutMs: 10, overallTimeoutMs: 20 })
    expect(() => registry.start({
      requestId: 'owner-1-c', ownerWebContentsId: 1, headersTimeoutMs: 10, overallTimeoutMs: 20,
    })).toThrow('compatible_request_registry_capacity')
    registry.start({ requestId: 'owner-2-a', ownerWebContentsId: 2, headersTimeoutMs: 10, overallTimeoutMs: 20 })
    expect(() => registry.start({
      requestId: 'owner-3-a', ownerWebContentsId: 3, headersTimeoutMs: 10, overallTimeoutMs: 20,
    })).toThrow('compatible_request_registry_capacity')
    expect(registry.activeCount()).toBe(3)
  })

  it.each([
    { requestId: '', ownerWebContentsId: 1, headersTimeoutMs: 1, overallTimeoutMs: 1 },
    { requestId: 'id', ownerWebContentsId: 0, headersTimeoutMs: 1, overallTimeoutMs: 1 },
    { requestId: 'id', ownerWebContentsId: 1, headersTimeoutMs: 0, overallTimeoutMs: 1 },
    { requestId: 'id', ownerWebContentsId: 1, headersTimeoutMs: 2, overallTimeoutMs: 1 },
  ])('rejects invalid lifecycle input without creating a request: %#', (value) => {
    const registry = createCompatibleRequestRegistry(timers())
    expect(() => registry.start(value)).toThrow('compatible_request_registry_invalid')
    expect(registry.activeCount()).toBe(0)
  })
})
