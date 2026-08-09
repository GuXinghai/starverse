import type BetterSqlite3 from 'better-sqlite3'
import { GenerationV2SearchRepo } from '../../infra/db/repo/generationV2SearchRepo'
import type { RegisterInvoke } from './types'

export const GENERATION_V2_SEARCH_CHANNELS = Object.freeze([
  'generation-v2:search:query',
  'generation-v2:search:rebuild',
] as const)

type ClosedObject = Readonly<Record<string, unknown>>

function closedObject(value: unknown, keys: readonly string[]): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('GENERATION_V2_SEARCH_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((entry) => !entry.enumerable || !('value' in entry))) {
    throw new Error('GENERATION_V2_SEARCH_INPUT_INVALID')
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function optionalId(value: unknown): string | null {
  if (value === null) return null
  return text(value, 512)
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) {
    throw new Error('GENERATION_V2_SEARCH_INPUT_INVALID')
  }
  return value
}

function nonNegativeInteger(value: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error('GENERATION_V2_SEARCH_INPUT_INVALID')
  }
  return value as number
}

function decodeQuery(value: unknown) {
  const raw = closedObject(value, ['q', 'scope', 'projectId', 'convoId', 'timeFromSec', 'timeToSec', 'limit', 'offset', 'mode'])
  const scope = closedObject(raw.scope, ['projectName', 'convoName', 'convoContent'])
  if (typeof scope.projectName !== 'boolean' || typeof scope.convoName !== 'boolean' || typeof scope.convoContent !== 'boolean' ||
      (raw.mode !== 'exact' && raw.mode !== 'fuzzy')) {
    throw new Error('GENERATION_V2_SEARCH_INPUT_INVALID')
  }
  const timeFromSec = raw.timeFromSec === undefined ? undefined : nonNegativeInteger(raw.timeFromSec, 0, Number.MAX_SAFE_INTEGER)
  const timeToSec = raw.timeToSec === undefined ? undefined : nonNegativeInteger(raw.timeToSec, 0, Number.MAX_SAFE_INTEGER)
  if (timeFromSec !== undefined && timeToSec !== undefined && timeToSec < timeFromSec) {
    throw new Error('GENERATION_V2_SEARCH_INPUT_INVALID')
  }
  return Object.freeze({
    q: text(raw.q, 4_096),
    scope: Object.freeze({ projectName: scope.projectName, convoName: scope.convoName, convoContent: scope.convoContent }),
    projectId: optionalId(raw.projectId),
    convoId: optionalId(raw.convoId),
    ...(timeFromSec === undefined ? {} : { timeFromSec }),
    ...(timeToSec === undefined ? {} : { timeToSec }),
    limit: nonNegativeInteger(raw.limit, 1, 200),
    offset: nonNegativeInteger(raw.offset, 0, 10_000),
    mode: raw.mode,
  })
}

export function registerGenerationV2SearchIpc(input: Readonly<{ registerInvoke: RegisterInvoke; db: BetterSqlite3.Database }>): readonly string[] {
  const search = new GenerationV2SearchRepo(input.db)
  const safe = (operation: (payload: unknown) => unknown) => async (_event: unknown, payload?: unknown) => {
    try { return Object.freeze({ ok: true, value: operation(payload) }) }
    catch (error) { return Object.freeze({ ok: false, code: error instanceof Error ? error.message : 'GENERATION_V2_SEARCH_COMMAND_FAILED' }) }
  }
  input.registerInvoke(GENERATION_V2_SEARCH_CHANNELS[0], safe((payload) => search.query(decodeQuery(payload))))
  input.registerInvoke(GENERATION_V2_SEARCH_CHANNELS[1], safe(() => { search.rebuild(); return true }))
  return GENERATION_V2_SEARCH_CHANNELS
}
