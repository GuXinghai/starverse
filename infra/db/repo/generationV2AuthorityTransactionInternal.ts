import type BetterSqlite3 from 'better-sqlite3'

export type GenerationV2AuthorityTransactionContextV2 = Readonly<{
  trust: 'generation_v2_authority_transaction_context'
}>

export class GenerationV2AuthorityTransactionError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT'
    | 'GENERATION_V2_AUTHORITY_TRANSACTION_NESTED'
    | 'GENERATION_V2_AUTHORITY_TRANSACTION_ASYNC_CALLBACK'
    | 'GENERATION_V2_AUTHORITY_TRANSACTION_LOCK_CONFLICT') {
    super(code)
    this.name = 'GenerationV2AuthorityTransactionError'
  }
}

type Participant = Readonly<{
  preCommit: () => void
  committed: () => void
  rolledBack: () => void
}>

type ContextState = {
  db: BetterSqlite3.Database
  active: boolean
  participants: Participant[]
}

const contexts = new WeakMap<object, ContextState>()
const runningDatabases = new WeakSet<object>()

function hasThenMember(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false
  try {
    let cursor: object | null = value as object
    const visited = new Set<object>()
    while (cursor !== null) {
      if (visited.has(cursor)) {
        throw new GenerationV2AuthorityTransactionError('GENERATION_V2_AUTHORITY_TRANSACTION_ASYNC_CALLBACK')
      }
      visited.add(cursor)
      if (Object.getOwnPropertyDescriptor(cursor, 'then')) return true
      cursor = Object.getPrototypeOf(cursor) as object | null
    }
    return false
  } catch (error) {
    if (error instanceof GenerationV2AuthorityTransactionError) throw error
    throw new GenerationV2AuthorityTransactionError('GENERATION_V2_AUTHORITY_TRANSACTION_ASYNC_CALLBACK')
  }
}

function stateFor(
  context: GenerationV2AuthorityTransactionContextV2,
  db: BetterSqlite3.Database,
): ContextState {
  const state = context && typeof context === 'object' ? contexts.get(context) : undefined
  if (!state || !state.active || state.db !== db || !db.inTransaction) {
    throw new GenerationV2AuthorityTransactionError('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
  }
  return state
}

export function isGenerationV2AuthorityTransactionContextV2(
  value: unknown,
): value is GenerationV2AuthorityTransactionContextV2 {
  if (!value || typeof value !== 'object') return false
  const state = contexts.get(value)
  return Boolean(state?.active && state.db.inTransaction)
}

export function assertGenerationV2AuthorityTransactionContextV2(
  context: GenerationV2AuthorityTransactionContextV2,
  db: BetterSqlite3.Database,
): void {
  stateFor(context, db)
}

export function registerGenerationV2AuthorityTransactionParticipantV2(
  context: GenerationV2AuthorityTransactionContextV2,
  db: BetterSqlite3.Database,
  participant: Participant,
): void {
  const state = stateFor(context, db)
  const descriptors = participant && typeof participant === 'object'
    ? Object.getOwnPropertyDescriptors(participant)
    : null
  if (!descriptors || Object.getPrototypeOf(participant) !== Object.prototype ||
      Reflect.ownKeys(participant).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== ['committed', 'preCommit', 'rolledBack'].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable ||
        !('value' in descriptor) || typeof descriptor.value !== 'function')) {
    throw new GenerationV2AuthorityTransactionError('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
  }
  state.participants.push(Object.freeze({
    preCommit: descriptors.preCommit.value as () => void,
    committed: descriptors.committed.value as () => void,
    rolledBack: descriptors.rolledBack.value as () => void,
  }))
}

/** No production caller. A future verified epoch coordinator may own this connection boundary. */
export function runGenerationV2AuthorityTransactionOnOwnedConnectionV2<T>(
  db: BetterSqlite3.Database,
  use: (context: GenerationV2AuthorityTransactionContextV2) => T extends PromiseLike<unknown> ? never : T,
): T {
  if (typeof use !== 'function' || db.inTransaction || runningDatabases.has(db)) {
    throw new GenerationV2AuthorityTransactionError('GENERATION_V2_AUTHORITY_TRANSACTION_NESTED')
  }
  db.pragma('foreign_keys = ON')
  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new GenerationV2AuthorityTransactionError('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
  }

  const context = Object.freeze({ trust: 'generation_v2_authority_transaction_context' as const })
  const state: ContextState = { db, active: false, participants: [] }
  contexts.set(context, state)
  const transaction = db.transaction(() => {
    state.active = true
    try {
      const result = use(context)
      if (hasThenMember(result)) {
        throw new GenerationV2AuthorityTransactionError('GENERATION_V2_AUTHORITY_TRANSACTION_ASYNC_CALLBACK')
      }
      for (const participant of state.participants) participant.preCommit()
      return result
    } finally {
      state.active = false
    }
  })

  runningDatabases.add(db)
  try {
    const result = transaction.immediate()
    for (const participant of state.participants) {
      try { participant.committed() } catch { /* commit is already durable */ }
    }
    return result
  } catch (error) {
    for (let index = state.participants.length - 1; index >= 0; index -= 1) {
      try { state.participants[index].rolledBack() } catch { /* cleanup is best effort */ }
    }
    if (error instanceof GenerationV2AuthorityTransactionError) throw error
    const code = (error as { code?: unknown })?.code
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
      throw new GenerationV2AuthorityTransactionError('GENERATION_V2_AUTHORITY_TRANSACTION_LOCK_CONFLICT')
    }
    throw error
  } finally {
    state.active = false
    contexts.delete(context)
    runningDatabases.delete(db)
  }
}
