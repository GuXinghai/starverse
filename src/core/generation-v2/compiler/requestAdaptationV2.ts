import { createSemanticConsumptionLedgerV2, type SemanticConsumptionLedgerV2, type SemanticConsumptionLedgerEntryV2 } from './semanticConsumptionLedgerV2'

/** Request-local decisions. Original snapshots/assets are never rewritten by adaptation. */
export type RequestAdaptationV2 = Readonly<{
  path: string
  outcome: 'converted' | 'deferred' | 'preserved'
  reason: string
  source?: unknown
}>
type AdaptationScope = Map<string, Map<string, SemanticConsumptionLedgerEntryV2>>
let activeScope: AdaptationScope | null = null

/** Synchronous authority transactions own their decisions; no operation survives the scope. */
export function openRequestAdaptationScopeV2(): Readonly<{ close: () => void }> {
  const previous = activeScope
  const current: AdaptationScope = new Map()
  activeScope = current
  let closed = false
  return Object.freeze({ close: () => {
    if (closed) return
    if (activeScope !== current) throw new Error('GENERATION_V2_ADAPTATION_SCOPE_ORDER_INVALID')
    activeScope = previous
    current.clear()
    closed = true
  } })
}

export function withRequestAdaptationScopeV2<T>(use: () => T): T {
  const scope = openRequestAdaptationScopeV2()
  try { return use() } finally { scope.close() }
}

function writableScope(): AdaptationScope {
  if (!activeScope) throw new Error('GENERATION_V2_ADAPTATION_SCOPE_REQUIRED')
  return activeScope
}

export function recordRequestAdaptationV2(operationId: string, decision: RequestAdaptationV2): void {
  const pending = writableScope()
  let entries = pending.get(operationId)
  if (!entries) { entries = new Map(); pending.set(operationId, entries) }
  const path = `compatibility.${decision.path}`
  entries.set(path, Object.freeze({ kind: 'consumed', path, disposition: 'accepted_no_wire',
    nativeField: null, encodingKind: 'omitted', evidence: JSON.stringify({ schemaVersion: 1, ...decision }) }))
}

export function restoreRequestAdaptationsV2(operationId: string, entries: readonly SemanticConsumptionLedgerEntryV2[]): void {
  const pending = writableScope()
  const restored = new Map(entries.filter(entry => entry.path.startsWith('compatibility.')).map(entry => [entry.path, entry]))
  // New target decisions take precedence over frozen historical decisions.
  for (const [path, entry] of pending.get(operationId) ?? []) restored.set(path, entry)
  pending.set(operationId, restored)
}

export function clearRequestAdaptationsV2(operationId: string): void { activeScope?.delete(operationId) }

export function readRequestAdaptationV2(operationId: string, path: string): RequestAdaptationV2 | null {
  const entry = activeScope?.get(operationId)?.get(`compatibility.${path}`)
  return entry ? JSON.parse(entry.evidence) as RequestAdaptationV2 : null
}

export function requestAdaptationLedgerV2(operationId: string, ledger: SemanticConsumptionLedgerV2): SemanticConsumptionLedgerV2 {
  const entries = activeScope?.get(operationId)
  if (!entries?.size) return ledger
  return createSemanticConsumptionLedgerV2([...ledger.entries.filter(entry => !entries.has(entry.path)), ...entries.values()]
    .sort((left, right) => left.path.localeCompare(right.path, 'en')))
}

export function readRequestAdaptationDecisionsV2(operationId: string): readonly RequestAdaptationV2[] {
  return Object.freeze([...(activeScope?.get(operationId)?.values() ?? [])]
    .map(entry => JSON.parse(entry.evidence) as RequestAdaptationV2))
}
