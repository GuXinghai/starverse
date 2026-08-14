import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import {
  decodeLocalEndpointExecutionProviderId,
  decodeLocalEndpointProtocolV2,
} from '../../src/shared/provider/localProviderRouteDescriptor'
import type { RegisterInvoke } from './types'

export const LOCAL_ENDPOINT_PROFILE_V2_IPC_CHANNELS = Object.freeze([
  'generation-v2:local-profile:list', 'generation-v2:local-profile:create', 'generation-v2:local-profile:delete',
] as const)
function raw(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
  return value as Record<string, unknown>
}
export function registerLocalEndpointProfileV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke; db: BetterSqlite3.Database
}>): readonly string[] {
  const repo = new LocalEndpointProfileV2Repo(input.db)
  const safe = (fn: (payload: unknown) => unknown) => (_event: unknown, payload?: unknown) => {
    try { return Object.freeze({ ok: true, value: fn(payload) }) } catch (error) {
      return Object.freeze({ ok: false, code: error instanceof Error ? error.message : 'GENERATION_V2_LOCAL_PROFILE_COMMAND_FAILED' })
    }
  }
  input.registerInvoke(LOCAL_ENDPOINT_PROFILE_V2_IPC_CHANNELS[0], safe(() => repo.list()))
  input.registerInvoke(LOCAL_ENDPOINT_PROFILE_V2_IPC_CHANNELS[1], safe((payload) => {
    const value = raw(payload); const keys = Object.keys(value).sort()
    const expectedKeys = value.providerId === 'ollama' ? ['baseUrl', 'protocolConfig', 'protocolContractId', 'providerId'] : ['baseUrl', 'protocolContractId', 'providerId']
    if (keys.join('\0') !== expectedKeys.sort().join('\0') || typeof value.baseUrl !== 'string') {
      throw new Error('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
    }
    let providerId
    let protocolContractId
    try {
      providerId = decodeLocalEndpointExecutionProviderId(value.providerId)
      protocolContractId = decodeLocalEndpointProtocolV2(value.protocolContractId)
    } catch {
      throw new Error('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
    }
    return repo.create({ endpointProfileId: `local-profile:${randomUUID()}`, providerId,
      protocolContractId, baseUrl: value.baseUrl,
      ...(providerId === 'ollama' ? { protocolConfig: value.protocolConfig as Readonly<Record<string, unknown>> } : {}) })
  }))
  input.registerInvoke(LOCAL_ENDPOINT_PROFILE_V2_IPC_CHANNELS[2], safe((payload) => {
    const value = raw(payload)
    if (Object.keys(value).length !== 1 || typeof value.endpointProfileId !== 'string') throw new Error('GENERATION_V2_LOCAL_PROFILE_INPUT_INVALID')
    return Object.freeze({ deleted: repo.delete(value.endpointProfileId) })
  }))
  return LOCAL_ENDPOINT_PROFILE_V2_IPC_CHANNELS
}
