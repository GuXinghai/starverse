import { createHash } from 'node:crypto'
import { safeStorage } from 'electron'
import type { CredentialConfigStore } from './epoch2RuntimeCredentialService'
import { compatibleRegistryCredentialInputSchema, credentialVersionRefSchema, type CompatibleRegistryCredentialInput } from '../../src/shared/provider/openai-chat-compatible'
import { isCredentialScopeIdV2, type CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'

export const OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_ROOT = 'openaiCompatibleCredentials'
export const OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_NAMESPACE = `${OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_ROOT}.v2`
export const OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_PREFIX = `${OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_NAMESPACE}.`
const MAX_CIPHERTEXT_BYTES = 1024 * 1024
type StoredRecord = Readonly<{ version: 3; providerInstanceId: string; credentialVersionRef: string; ciphertextBase64: string;
  revision: number; credentialScopeId: CredentialScopeIdV2; updatedAtMs: number }>
type Slot = Readonly<{ record: StoredRecord; revision: number; credentialScopeId: CredentialScopeIdV2; fingerprint: string }>

export type OpenAICompatibleCredentialV2Status = Readonly<{ credentialVersionRef: string; providerInstanceId: string; configured: boolean; revision: number; credentialScopeId?: CredentialScopeIdV2 }>
export type OpenAICompatibleCredentialV2Lease = Readonly<{ trust: 'openai_compatible_credential_v2_lease'; usage: 'provider_transport_only'; credential: CompatibleRegistryCredentialInput; revision: number; credentialScopeId: CredentialScopeIdV2; assertCurrent: () => void }>
export class OpenAICompatibleCredentialV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE' | 'GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT') { super(code); this.name = 'OpenAICompatibleCredentialV2Error' }
}

export function isOpenAICompatibleCredentialV2StoreKey(value: string): boolean {
  return String(value ?? '').startsWith(OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_PREFIX)
}
function key(ref: string): string { return `${OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_PREFIX}${ref}` }
function id(value: unknown): string {
  try { return credentialVersionRefSchema.parse(value) } catch { throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID') }
}
function provider(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
  return value
}
function fingerprint(record: StoredRecord): string { return createHash('sha256').update(JSON.stringify(record), 'utf8').digest('hex') }
function record(value: unknown, ref: string, providerInstanceId: string): StoredRecord | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
  const item = value as Record<string, unknown>
  if (Object.keys(item).sort().join('\0') !== 'ciphertextBase64\0credentialScopeId\0credentialVersionRef\0providerInstanceId\0revision\0updatedAtMs\0version' ||
      item.version !== 3 || item.credentialVersionRef !== ref || item.providerInstanceId !== providerInstanceId ||
      typeof item.ciphertextBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(item.ciphertextBase64) ||
      !Number.isSafeInteger(item.revision) || (item.revision as number) < 1 || !isCredentialScopeIdV2(item.credentialScopeId) ||
      !Number.isSafeInteger(item.updatedAtMs) || (item.updatedAtMs as number) < 0) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
  const bytes = Buffer.from(item.ciphertextBase64, 'base64')
  try { if (bytes.byteLength === 0 || bytes.byteLength > MAX_CIPHERTEXT_BYTES || bytes.toString('base64') !== item.ciphertextBase64) throw new Error('invalid') }
  catch { throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT') } finally { bytes.fill(0) }
  return Object.freeze({ version: 3, providerInstanceId, credentialVersionRef: ref, ciphertextBase64: item.ciphertextBase64,
    revision: item.revision as number, credentialScopeId: item.credentialScopeId, updatedAtMs: item.updatedAtMs as number })
}
function serialized(payload: CompatibleRegistryCredentialInput): string { return JSON.stringify(payload) }

export function createOpenAICompatibleCredentialV2Service(input: Readonly<{
  store: CredentialConfigStore
  deriveScope: (providerInstanceId: string, canonicalCredential: string) => Promise<CredentialScopeIdV2>
  nowMs?: () => number
}>) {
  const nowMs = input.nowMs ?? Date.now
  const slots = new Map<string, Slot>()
  const revisions = new Map<string, number>()
  const active = new WeakSet<object>()
  async function requireAvailable(): Promise<void> { try { if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('unavailable') } catch { throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE') } }
  function persisted(ref: string, providerInstanceId: string): StoredRecord | undefined { return record(input.store.get(key(ref)), ref, providerInstanceId) }
  function current(ref: string, providerInstanceId: string): Slot | undefined {
    let slot = slots.get(ref); const stored = persisted(ref, providerInstanceId)
    if (!slot && stored) {
      slot = Object.freeze({ record: stored, revision: stored.revision, credentialScopeId: stored.credentialScopeId, fingerprint: fingerprint(stored) })
      slots.set(ref, slot); revisions.set(ref, stored.revision)
    }
    if (slot && (!stored || fingerprint(stored) !== slot.fingerprint)) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
    return slot
  }
  async function decrypt(slot: Slot): Promise<CompatibleRegistryCredentialInput> {
    await requireAvailable(); const bytes = Buffer.from(slot.record.ciphertextBase64, 'base64')
    try { const decoded = await safeStorage.decryptStringAsync(bytes); return compatibleRegistryCredentialInputSchema.parse(JSON.parse(decoded.result)) }
    catch { throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE') }
    finally { bytes.fill(0) }
  }
  async function write(inputValue: Readonly<{ providerInstanceId: string; credentialVersionRef: string; credential: CompatibleRegistryCredentialInput; expectedRevision: number }>): Promise<OpenAICompatibleCredentialV2Status> {
    const providerInstanceId = provider(inputValue.providerInstanceId); const ref = id(inputValue.credentialVersionRef)
    const previous = current(ref, providerInstanceId); const revision = previous?.revision ?? revisions.get(ref) ?? 0
    if (revision !== inputValue.expectedRevision) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
    let payload: CompatibleRegistryCredentialInput; try { payload = compatibleRegistryCredentialInputSchema.parse(inputValue.credential) } catch { throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID') }
    if (payload.mode === 'none') throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
    const canonical = serialized(payload); await requireAvailable(); const scope = await input.deriveScope(`openai_chat_compatible:${providerInstanceId}`, canonical)
    let encrypted: Buffer | undefined
    try {
      encrypted = await safeStorage.encryptStringAsync(canonical)
      if (!Buffer.isBuffer(encrypted) || encrypted.byteLength === 0 || encrypted.byteLength > MAX_CIPHERTEXT_BYTES) throw new Error('invalid')
      const next = revision + 1
      const stored = Object.freeze({ version: 3 as const, providerInstanceId, credentialVersionRef: ref, ciphertextBase64: encrypted.toString('base64'),
        revision: next, credentialScopeId: scope, updatedAtMs: Math.max(nowMs(), previous?.record.updatedAtMs ?? 0) })
      if (current(ref, providerInstanceId) !== previous) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT')
      input.store.set(key(ref), stored); const checked = persisted(ref, providerInstanceId)
      if (!checked || fingerprint(checked) !== fingerprint(stored)) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE')
      revisions.set(ref, next); slots.set(ref, Object.freeze({ record: stored, revision: next, credentialScopeId: scope, fingerprint: fingerprint(stored) }))
      return Object.freeze({ credentialVersionRef: ref, providerInstanceId, configured: true, revision: next, credentialScopeId: scope })
    } catch (error) { if (error instanceof OpenAICompatibleCredentialV2Error) throw error; throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE') }
    finally { encrypted?.fill(0) }
  }
  return Object.freeze({
    getStatus: async (providerInstanceId: string, credentialVersionRef: string): Promise<OpenAICompatibleCredentialV2Status> => {
      const providerId = provider(providerInstanceId); const ref = id(credentialVersionRef); const slot = current(ref, providerId); const revision = slot?.revision ?? revisions.get(ref) ?? 0
      return Object.freeze({ credentialVersionRef: ref, providerInstanceId: providerId, configured: Boolean(slot), revision, ...(slot ? { credentialScopeId: slot.credentialScopeId } : {}) })
    },
    write,
    clear: async (providerInstanceId: string, credentialVersionRef: string, expectedRevision: number): Promise<OpenAICompatibleCredentialV2Status> => {
      const providerId = provider(providerInstanceId); const ref = id(credentialVersionRef); const slot = current(ref, providerId)
      const revision = slot?.revision ?? revisions.get(ref) ?? 0
      if (!slot) return Object.freeze({ credentialVersionRef: ref, providerInstanceId: providerId, configured: false, revision })
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== revision) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
      input.store.delete(key(ref))
      if (persisted(ref, providerId)) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STORAGE_UNAVAILABLE')
      slots.delete(ref); revisions.set(ref, revision + 1)
      return Object.freeze({ credentialVersionRef: ref, providerInstanceId: providerId, configured: false, revision: revision + 1 })
    },
    withCredential: async <T>(request: Readonly<{ providerInstanceId: string; credentialVersionRef: string; expectedRevision: number; expectedCredentialScopeId: CredentialScopeIdV2; consume: (lease: OpenAICompatibleCredentialV2Lease) => Promise<T> | T }>): Promise<T> => {
      const providerId = provider(request.providerInstanceId); const ref = id(request.credentialVersionRef); const slot = current(ref, providerId)
      if (!slot) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING')
      if (slot.revision !== request.expectedRevision || slot.credentialScopeId !== request.expectedCredentialScopeId || typeof request.consume !== 'function') throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
      const credential = await decrypt(slot); const lease = Object.freeze({ trust: 'openai_compatible_credential_v2_lease' as const, usage: 'provider_transport_only' as const, credential, revision: slot.revision, credentialScopeId: slot.credentialScopeId,
        assertCurrent: () => { if (!active.has(lease) || current(ref, providerId) !== slot) throw new OpenAICompatibleCredentialV2Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_DRIFT') } })
      active.add(lease); try { const result = await request.consume(lease); lease.assertCurrent(); return result } finally { active.delete(lease) }
    },
  })
}
