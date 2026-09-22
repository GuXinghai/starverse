import type BetterSqlite3 from 'better-sqlite3'
import { SourcePriorityConfigV1Service } from '../services/sourcePriorityConfigV1Service'
import type { RegisterInvoke } from './types'

export const GENERATION_V2_SOURCE_PRIORITY_CONFIG_IPC_CHANNELS = Object.freeze([
  'generation-v2:model-facts:source-priority:get',
  'generation-v2:model-facts:source-priority:update',
] as const)

function invalid(): never { throw new Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_IPC_INVALID') }

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid()
}

function revision(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 90 ||
      !/^source-priority-config-v1:[0-9a-f]{64}$/u.test(value)) invalid()
  return value
}

export function registerGenerationV2SourcePriorityConfigIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  db: BetterSqlite3.Database
}>): readonly string[] {
  const service = new SourcePriorityConfigV1Service(input.db)
  input.registerInvoke(GENERATION_V2_SOURCE_PRIORITY_CONFIG_IPC_CHANNELS[0], (_event, payload) => {
    if (payload !== undefined && (!plainObject(payload) || Object.keys(payload).length !== 0)) invalid()
    return service.read()
  })
  input.registerInvoke(GENERATION_V2_SOURCE_PRIORITY_CONFIG_IPC_CHANNELS[1], (_event, payload) => {
    if (!plainObject(payload)) invalid()
    exactKeys(payload, ['expectedConfigRevision', 'priorities'])
    return service.update({ expectedConfigRevision: revision(payload.expectedConfigRevision),
      priorities: payload.priorities })
  })
  return GENERATION_V2_SOURCE_PRIORITY_CONFIG_IPC_CHANNELS
}
