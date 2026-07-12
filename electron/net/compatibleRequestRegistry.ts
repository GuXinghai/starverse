export type CompatibleRequestAbortReason =
  | 'user_abort'
  | 'headers_timeout'
  | 'idle_timeout'
  | 'overall_timeout'
  | 'window_destroyed'
  | 'app_shutdown'

export type CompatibleRequestHandle = Readonly<{
  requestId: string
  ownerWebContentsId: number
  signal: AbortSignal
  markHeadersReceived: () => void
  armIdleTimeout: (timeoutMs: number) => void
  clearIdleTimeout: () => void
  finish: () => void
  abort: (reason: CompatibleRequestAbortReason) => boolean
  abortReason: () => CompatibleRequestAbortReason | null
}>

export type CompatibleRequestRegistry = Readonly<{
  start: (input: Readonly<{
    requestId: string
    ownerWebContentsId: number
    headersTimeoutMs: number
    overallTimeoutMs: number
  }>) => CompatibleRequestHandle
  abortRequest: (requestId: string, reason?: CompatibleRequestAbortReason) => boolean
  abortRequestForOwner: (requestId: string, ownerWebContentsId: number, reason?: CompatibleRequestAbortReason) => boolean
  abortOwner: (ownerWebContentsId: number, reason?: CompatibleRequestAbortReason) => number
  abortAll: (reason?: CompatibleRequestAbortReason) => number
  activeCount: () => number
}>

type Timer = ReturnType<typeof setTimeout>

export function createCompatibleRequestRegistry(input?: Readonly<{
  setTimer?: (callback: () => void, timeoutMs: number) => Timer
  clearTimer?: (timer: Timer) => void
  maxActiveRequests?: number
  maxActivePerOwner?: number
}>): CompatibleRequestRegistry {
  const setTimer = input?.setTimer ?? ((callback, timeoutMs) => setTimeout(callback, timeoutMs))
  const clearTimer = input?.clearTimer ?? clearTimeout
  const maxActiveRequests = input?.maxActiveRequests ?? 32
  const maxActivePerOwner = input?.maxActivePerOwner ?? 4
  assertCapacity(maxActiveRequests, 1_024)
  assertCapacity(maxActivePerOwner, maxActiveRequests)
  const active = new Map<string, {
    handle: CompatibleRequestHandle
    controller: AbortController
    headersTimer: Timer | null
    overallTimer: Timer | null
    idleTimer: Timer | null
    abortReason: CompatibleRequestAbortReason | null
    finished: boolean
  }>()

  const abortRequest = (requestId: string, reason: CompatibleRequestAbortReason = 'user_abort'): boolean => {
    const record = active.get(requestId)
    if (!record || record.finished || record.abortReason) return false
    record.abortReason = reason
    clearRecordTimers(record)
    record.controller.abort(reason)
    active.delete(requestId)
    return true
  }

  return {
    start: ({ requestId, ownerWebContentsId, headersTimeoutMs, overallTimeoutMs }) => {
      if (!requestId || requestId.length > 256 || active.has(requestId)) throw new Error('compatible_request_registry_invalid')
      if (!Number.isInteger(ownerWebContentsId) || ownerWebContentsId < 1) throw new Error('compatible_request_registry_invalid')
      assertTimeout(headersTimeoutMs)
      assertTimeout(overallTimeoutMs)
      if (headersTimeoutMs > overallTimeoutMs) throw new Error('compatible_request_registry_invalid')
      if (active.size >= maxActiveRequests) throw new Error('compatible_request_registry_capacity')
      let ownerActive = 0
      for (const record of active.values()) {
        if (record.handle.ownerWebContentsId === ownerWebContentsId) ownerActive += 1
      }
      if (ownerActive >= maxActivePerOwner) throw new Error('compatible_request_registry_capacity')

      const controller = new AbortController()
      const record = {
        handle: undefined as unknown as CompatibleRequestHandle,
        controller,
        headersTimer: null as Timer | null,
        overallTimer: null as Timer | null,
        idleTimer: null as Timer | null,
        abortReason: null as CompatibleRequestAbortReason | null,
        finished: false,
      }
      const handle: CompatibleRequestHandle = Object.freeze({
        requestId,
        ownerWebContentsId,
        signal: controller.signal,
        markHeadersReceived: () => {
          if (record.headersTimer) clearTimer(record.headersTimer)
          record.headersTimer = null
        },
        armIdleTimeout: (timeoutMs) => {
          assertTimeout(timeoutMs)
          if (record.finished || record.abortReason) return
          if (record.idleTimer) clearTimer(record.idleTimer)
          record.idleTimer = setTimer(() => abortRequest(requestId, 'idle_timeout'), timeoutMs)
        },
        clearIdleTimeout: () => {
          if (record.idleTimer) clearTimer(record.idleTimer)
          record.idleTimer = null
        },
        finish: () => {
          if (record.finished) return
          record.finished = true
          clearRecordTimers(record)
          active.delete(requestId)
        },
        abort: (reason) => abortRequest(requestId, reason),
        abortReason: () => record.abortReason,
      })
      record.handle = handle
      active.set(requestId, record)
      record.headersTimer = setTimer(() => abortRequest(requestId, 'headers_timeout'), headersTimeoutMs)
      record.overallTimer = setTimer(() => abortRequest(requestId, 'overall_timeout'), overallTimeoutMs)
      return handle
    },
    abortRequest,
    abortRequestForOwner: (requestId, ownerWebContentsId, reason = 'user_abort') => {
      const record = active.get(requestId)
      if (!record || record.handle.ownerWebContentsId !== ownerWebContentsId) return false
      return abortRequest(requestId, reason)
    },
    abortOwner: (ownerWebContentsId, reason = 'window_destroyed') => {
      let count = 0
      for (const [requestId, record] of [...active]) {
        if (record.handle.ownerWebContentsId === ownerWebContentsId && abortRequest(requestId, reason)) count += 1
      }
      return count
    },
    abortAll: (reason = 'app_shutdown') => {
      let count = 0
      for (const requestId of [...active.keys()]) {
        if (abortRequest(requestId, reason)) count += 1
      }
      return count
    },
    activeCount: () => active.size,
  }

  function clearRecordTimers(record: {
    headersTimer: Timer | null
    overallTimer: Timer | null
    idleTimer: Timer | null
  }): void {
    if (record.headersTimer) clearTimer(record.headersTimer)
    if (record.overallTimer) clearTimer(record.overallTimer)
    if (record.idleTimer) clearTimer(record.idleTimer)
    record.headersTimer = null
    record.overallTimer = null
    record.idleTimer = null
  }
}

function assertTimeout(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 30 * 60 * 1000) {
    throw new Error('compatible_request_registry_invalid')
  }
}

function assertCapacity(value: number, maximum: number): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error('compatible_request_registry_invalid')
  }
}
