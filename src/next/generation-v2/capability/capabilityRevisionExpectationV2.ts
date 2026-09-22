import { AsyncLocalStorage } from 'node:async_hooks'
import { assertCapabilityRevisionV2 } from './resolvedCapabilityV2'

type CapabilityRevisionContextV2 = Readonly<{ expectedCapabilityRevision: string }>

const context = new AsyncLocalStorage<CapabilityRevisionContextV2>()

export class CapabilityRevisionExpectationV2Error extends Error {
  constructor(readonly code: 'CAPABILITY_REVISION_EXPECTATION_MISSING' | 'STALE_CAPABILITY_REVISION') {
    super(code)
    this.name = 'CapabilityRevisionExpectationV2Error'
  }
}

export function runWithExpectedCapabilityRevisionV2<T>(
  expectedCapabilityRevision: string,
  callback: () => T,
): T {
  if (typeof expectedCapabilityRevision !== 'string' || expectedCapabilityRevision.length === 0 ||
      expectedCapabilityRevision.trim() !== expectedCapabilityRevision) {
    throw new CapabilityRevisionExpectationV2Error('CAPABILITY_REVISION_EXPECTATION_MISSING')
  }
  return context.run(Object.freeze({ expectedCapabilityRevision }), callback)
}

export function assertExpectedCapabilityRevisionV2(actualCapabilityRevision: string): void {
  const expected = context.getStore()?.expectedCapabilityRevision
  // Direct repository/coordinator calls remain useful for deterministic unit
  // tests and internal replay work. Production renderer entrypoints cannot
  // reach those paths without the closed IPC envelope, which installs this
  // context. In that production context the comparison is strict.
  if (!expected) return
  try {
    assertCapabilityRevisionV2(expected, actualCapabilityRevision)
  } catch {
    throw new CapabilityRevisionExpectationV2Error('STALE_CAPABILITY_REVISION')
  }
}

/**
 * Transitional current-send bridge: pre-cutover provider authorities may
 * still expose a legacy capability-v2 revision while the persisted snapshot
 * is about to be resolved from Goal 3. The shared snapshot cutover performs
 * the strict Goal 3 comparison before persistence. Historical replay paths
 * must continue using assertExpectedCapabilityRevisionV2 directly.
 */
export function assertExpectedCurrentSendCapabilityRevisionV2(actualCapabilityRevision: string): void {
  const expected = context.getStore()?.expectedCapabilityRevision
  if (expected?.startsWith('capability-revision-v1:') && actualCapabilityRevision.startsWith('capability-v2:')) return
  assertExpectedCapabilityRevisionV2(actualCapabilityRevision)
}

export function readExpectedCapabilityRevisionV2(): string | null {
  return context.getStore()?.expectedCapabilityRevision ?? null
}
