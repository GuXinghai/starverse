import type { ProviderFailureV2 } from '../../../shared/provider/providerFailureV2'
import type { GenerationOperationRuntimeSnapshotV2 } from '../domain/generationStreamEventV2'

export type BranchRuntimeCacheEntryV2 = Readonly<{
  conversationId: string
  branchId: string
  activeOperationId: string | null
  targetAnswerId: string | null
  status: 'generating' | 'completed' | 'failed' | 'cancelled'
  body: string
  reasoning: readonly Readonly<Record<string, unknown>>[]
  lastSequence: number
  errorFact: ProviderFailureV2 | null
  lastAccessedAt: number
}>

const DEFAULT_TERMINAL_BRANCH_LIMIT = 16
const DEFAULT_BYTE_LIMIT = 32 * 1024 * 1024

function estimateBytes(snapshot: GenerationOperationRuntimeSnapshotV2): number {
  const bodyBytes = new TextEncoder().encode(snapshot.body).byteLength
  let structuredBytes = 0
  try {
    structuredBytes = new TextEncoder().encode(JSON.stringify({
      reasoning: snapshot.reasoning,
      errorFact: snapshot.errorFact,
    })).byteLength
  } catch {
    structuredBytes = DEFAULT_BYTE_LIMIT
  }
  return bodyBytes + structuredBytes
}

function newer(
  left: GenerationOperationRuntimeSnapshotV2,
  right: GenerationOperationRuntimeSnapshotV2,
): GenerationOperationRuntimeSnapshotV2 {
  if (left.status === 'generating' && right.status !== 'generating') return left
  if (right.status === 'generating' && left.status !== 'generating') return right
  if (right.updatedAtMs !== left.updatedAtMs) return right.updatedAtMs > left.updatedAtMs ? right : left
  return right.lastSequence >= left.lastSequence ? right : left
}

export class BranchRuntimeCacheV2 {
  readonly #byOperation = new Map<string, GenerationOperationRuntimeSnapshotV2>()
  readonly #lastAccessedAt = new Map<string, number>()

  constructor(
    private readonly nowMs: () => number = Date.now,
    private readonly terminalBranchLimit = DEFAULT_TERMINAL_BRANCH_LIMIT,
    private readonly byteLimit = DEFAULT_BYTE_LIMIT,
  ) {}

  upsert(snapshot: GenerationOperationRuntimeSnapshotV2, currentBranchId?: string | null): BranchRuntimeCacheEntryV2 {
    const operationId = snapshot.binding.operationId
    const previous = this.#byOperation.get(operationId)
    if (previous && snapshot.lastSequence < previous.lastSequence) {
      return this.get(snapshot.binding.branchId, false) ?? this.#entry(previous)
    }
    this.#byOperation.set(operationId, snapshot)
    if (!this.#lastAccessedAt.has(snapshot.binding.branchId)) {
      this.#lastAccessedAt.set(snapshot.binding.branchId, this.nowMs())
    }
    this.prune(currentBranchId)
    return this.get(snapshot.binding.branchId, false) ?? this.#entry(snapshot)
  }

  get(branchId: string, touch = true): BranchRuntimeCacheEntryV2 | null {
    const candidates = [...this.#byOperation.values()].filter((snapshot) => snapshot.binding.branchId === branchId)
    if (candidates.length === 0) return null
    const selected = candidates.reduce(newer)
    if (touch) this.#lastAccessedAt.set(branchId, this.nowMs())
    return this.#entry(selected)
  }

  snapshotForOperation(operationId: string): GenerationOperationRuntimeSnapshotV2 | null {
    return this.#byOperation.get(operationId) ?? null
  }

  prune(currentBranchId?: string | null): void {
    const selectedByBranch = new Map<string, GenerationOperationRuntimeSnapshotV2>()
    for (const snapshot of this.#byOperation.values()) {
      const existing = selectedByBranch.get(snapshot.binding.branchId)
      selectedByBranch.set(snapshot.binding.branchId, existing ? newer(existing, snapshot) : snapshot)
    }
    const terminal = [...selectedByBranch.entries()]
      .filter(([branchId, snapshot]) => branchId !== currentBranchId && snapshot.status !== 'generating')
      .sort((left, right) =>
        (this.#lastAccessedAt.get(right[0]) ?? 0) - (this.#lastAccessedAt.get(left[0]) ?? 0))
    let retainedBytes = 0
    const retainedBranches = new Set<string>()
    for (const [branchId, snapshot] of terminal) {
      const bytes = estimateBytes(snapshot)
      if (retainedBranches.size < this.terminalBranchLimit && retainedBytes + bytes <= this.byteLimit) {
        retainedBranches.add(branchId)
        retainedBytes += bytes
      }
    }
    const evictedBranches = new Set(terminal.map(([branchId]) => branchId)
      .filter((branchId) => !retainedBranches.has(branchId)))
    for (const [operationId, snapshot] of this.#byOperation) {
      if (evictedBranches.has(snapshot.binding.branchId)) this.#byOperation.delete(operationId)
    }
    for (const branchId of evictedBranches) this.#lastAccessedAt.delete(branchId)
  }

  #entry(snapshot: GenerationOperationRuntimeSnapshotV2): BranchRuntimeCacheEntryV2 {
    return Object.freeze({
      conversationId: snapshot.binding.conversationId,
      branchId: snapshot.binding.branchId,
      activeOperationId: snapshot.status === 'generating' ? snapshot.binding.operationId : null,
      targetAnswerId: snapshot.binding.targetAnswerId,
      status: snapshot.status,
      body: snapshot.body,
      reasoning: snapshot.reasoning,
      lastSequence: snapshot.lastSequence,
      errorFact: snapshot.errorFact,
      lastAccessedAt: this.#lastAccessedAt.get(snapshot.binding.branchId) ?? this.nowMs(),
    })
  }
}
