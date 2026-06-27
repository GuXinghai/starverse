import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { protectUtf8, unprotectUtf8 } from './dpapi.mjs'

export const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'google_ai_studio', 'deepseek', 'openrouter']
const PROTECTION_KIND = 'windows_dpapi_current_user'

export class VaultError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message)
    this.name = 'VaultError'
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function getDefaultVaultPath(env = process.env) {
  const appData = env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(appData, 'Starverse', 'provider-key-vault', 'provider-keys.vault')
}

/**
 * @param {unknown} provider
 * @returns {'openai' | 'anthropic' | 'google_ai_studio' | 'deepseek' | 'openrouter'}
 */
export function normalizeProvider(provider) {
  if (typeof provider !== 'string' || !SUPPORTED_PROVIDERS.includes(provider)) {
    throw new VaultError(`Unsupported provider. Allowed providers: ${SUPPORTED_PROVIDERS.join(', ')}.`)
  }
  return /** @type {'openai' | 'anthropic' | 'google_ai_studio' | 'deepseek' | 'openrouter'} */ (provider)
}

/**
 * @param {string} key
 * @returns {string}
 */
export function maskKey(key) {
  const value = key.trim()
  if (value.length === 0) {
    return 'not configured'
  }
  const suffix = value.slice(-4)
  return value.length <= 4 ? '****' : `****${suffix}`
}

/**
 * @param {string} vaultPath
 * @param {{ nowMs?: number, dpapi?: import('./dpapi.mjs').DpapiOptions }} [options]
 */
export async function initVault(vaultPath, options = {}) {
  if (await fileExists(vaultPath)) {
    throw new VaultError('Vault already exists. Use verify, set a provider, or pass a different --vault path.')
  }

  const nowMs = options.nowMs ?? Date.now()
  await writePayload(vaultPath, createEmptyPayload(), {
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    dpapi: options.dpapi,
  })
}

/**
 * @param {string} vaultPath
 * @param {unknown} providerInput
 * @param {string} keyInput
 * @param {{ nowMs?: number, dpapi?: import('./dpapi.mjs').DpapiOptions }} [options]
 */
export async function setProviderKey(vaultPath, providerInput, keyInput, options = {}) {
  const provider = normalizeProvider(providerInput)
  const key = keyInput.trim()
  if (!key) {
    throw new VaultError('Provider key cannot be empty.')
  }

  const { envelope, payload } = await readPayloadWithEnvelope(vaultPath, options)
  const nowMs = options.nowMs ?? Date.now()
  const existing = payload.records.find((record) => record.provider === provider)
  if (existing) {
    existing.maskedKey = maskKey(key)
    existing.value = key
    existing.updatedAtMs = nowMs
  } else {
    payload.records.push({
      provider,
      maskedKey: maskKey(key),
      value: key,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    })
  }

  await writePayload(vaultPath, payload, {
    createdAtMs: envelope.createdAtMs,
    updatedAtMs: nowMs,
    dpapi: options.dpapi,
  })

  return { provider, maskedKey: maskKey(key), updatedAtMs: nowMs }
}

/**
 * @param {string} vaultPath
 * @param {{ dpapi?: import('./dpapi.mjs').DpapiOptions }} [options]
 */
export async function listProviders(vaultPath, options = {}) {
  const { payload } = await readPayloadWithEnvelope(vaultPath, options)
  return SUPPORTED_PROVIDERS.map((provider) => {
    const record = payload.records.find((item) => item.provider === provider)
    if (!record) {
      return {
        provider,
        configured: false,
        maskedKey: 'not configured',
        updatedAt: '-',
      }
    }
    return {
      provider,
      configured: true,
      maskedKey: record.maskedKey,
      updatedAt: new Date(record.updatedAtMs).toISOString(),
    }
  })
}

/**
 * @param {string} vaultPath
 * @param {unknown} providerInput
 * @param {{ dpapi?: import('./dpapi.mjs').DpapiOptions }} [options]
 */
export async function showProviderKey(vaultPath, providerInput, options = {}) {
  const provider = normalizeProvider(providerInput)
  const { payload } = await readPayloadWithEnvelope(vaultPath, options)
  const record = payload.records.find((item) => item.provider === provider)
  if (!record) {
    throw new VaultError('Provider key is not configured.')
  }
  return record.value
}

/**
 * @param {string} vaultPath
 * @param {unknown} providerInput
 * @param {{ nowMs?: number, dpapi?: import('./dpapi.mjs').DpapiOptions }} [options]
 */
export async function removeProviderKey(vaultPath, providerInput, options = {}) {
  const provider = normalizeProvider(providerInput)
  const { envelope, payload } = await readPayloadWithEnvelope(vaultPath, options)
  const originalLength = payload.records.length
  payload.records = payload.records.filter((record) => record.provider !== provider)
  if (payload.records.length === originalLength) {
    return false
  }

  await writePayload(vaultPath, payload, {
    createdAtMs: envelope.createdAtMs,
    updatedAtMs: options.nowMs ?? Date.now(),
    dpapi: options.dpapi,
  })
  return true
}

/**
 * @param {string} vaultPath
 * @param {{ dpapi?: import('./dpapi.mjs').DpapiOptions }} [options]
 */
export async function verifyVault(vaultPath, options = {}) {
  const { payload } = await readPayloadWithEnvelope(vaultPath, options)
  return {
    configuredProviders: payload.records.map((record) => record.provider),
    recordCount: payload.records.length,
  }
}

/**
 * @param {string} vaultPath
 * @param {{ dpapi?: import('./dpapi.mjs').DpapiOptions }} [options]
 */
export async function readVaultPayload(vaultPath, options = {}) {
  const { payload } = await readPayloadWithEnvelope(vaultPath, options)
  return payload
}

function createEmptyPayload() {
  return {
    version: 1,
    records: [],
  }
}

/**
 * @param {string} vaultPath
 * @param {{ dpapi?: import('./dpapi.mjs').DpapiOptions }} options
 */
async function readPayloadWithEnvelope(vaultPath, options) {
  const envelope = await readEnvelope(vaultPath)
  let plaintext
  try {
    plaintext = await unprotectUtf8(envelope.payloadCiphertext, options.dpapi)
  } catch {
    throw new VaultError('Vault cannot be decrypted by the current Windows user or is corrupted.')
  }

  let payload
  try {
    payload = JSON.parse(plaintext)
  } catch {
    throw new VaultError('Vault payload is invalid or corrupted.')
  }
  assertPayload(payload)
  return { envelope, payload }
}

/**
 * @param {string} vaultPath
 * @returns {Promise<{
 *   version: 1
 *   protection: { kind: 'windows_dpapi_current_user' }
 *   payloadCiphertext: string
 *   createdAtMs: number
 *   updatedAtMs: number
 * }>}
 */
async function readEnvelope(vaultPath) {
  let raw
  try {
    raw = await fs.readFile(vaultPath, 'utf8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new VaultError('Vault file does not exist. Run init first or pass the correct --vault path.')
    }
    throw error
  }

  let envelope
  try {
    envelope = JSON.parse(raw)
  } catch {
    throw new VaultError('Vault file is invalid or corrupted.')
  }
  assertEnvelope(envelope)
  return envelope
}

/**
 * @param {string} vaultPath
 * @param {ReturnType<typeof createEmptyPayload>} payload
 * @param {{ createdAtMs: number, updatedAtMs: number, dpapi?: import('./dpapi.mjs').DpapiOptions }} metadata
 */
async function writePayload(vaultPath, payload, metadata) {
  assertPayload(payload)
  const payloadCiphertext = await protectUtf8(JSON.stringify(payload), metadata.dpapi)
  const envelope = {
    version: 1,
    protection: {
      kind: PROTECTION_KIND,
    },
    payloadCiphertext,
    createdAtMs: metadata.createdAtMs,
    updatedAtMs: metadata.updatedAtMs,
  }

  await fs.mkdir(path.dirname(vaultPath), { recursive: true })
  const temporaryPath = `${vaultPath}.tmp`
  const backupPath = `${vaultPath}.bak`
  await fs.writeFile(temporaryPath, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  if (await fileExists(vaultPath)) {
    await fs.copyFile(vaultPath, backupPath)
    await fs.rm(vaultPath, { force: true })
  }
  await fs.rename(temporaryPath, vaultPath)
}

/**
 * @param {unknown} envelope
 * @returns {asserts envelope is {
 *   version: 1
 *   protection: { kind: 'windows_dpapi_current_user' }
 *   payloadCiphertext: string
 *   createdAtMs: number
 *   updatedAtMs: number
 * }}
 */
function assertEnvelope(envelope) {
  if (
    !isRecord(envelope)
    || envelope.version !== 1
    || !isRecord(envelope.protection)
    || envelope.protection.kind !== PROTECTION_KIND
    || typeof envelope.payloadCiphertext !== 'string'
    || typeof envelope.createdAtMs !== 'number'
    || typeof envelope.updatedAtMs !== 'number'
  ) {
    throw new VaultError('Vault file is invalid or corrupted.')
  }
}

/**
 * @param {unknown} payload
 * @returns {asserts payload is {
 *   version: 1
 *   records: {
 *     provider: 'openai' | 'anthropic' | 'google_ai_studio' | 'deepseek' | 'openrouter'
 *     label?: string
 *     maskedKey: string
 *     value: string
 *     createdAtMs: number
 *     updatedAtMs: number
 *   }[]
 * }}
 */
function assertPayload(payload) {
  if (!isRecord(payload) || payload.version !== 1 || !Array.isArray(payload.records)) {
    throw new VaultError('Vault payload is invalid or corrupted.')
  }

  for (const record of payload.records) {
    if (
      !isRecord(record)
      || typeof record.provider !== 'string'
      || !SUPPORTED_PROVIDERS.includes(record.provider)
      || typeof record.maskedKey !== 'string'
      || typeof record.value !== 'string'
      || typeof record.createdAtMs !== 'number'
      || typeof record.updatedAtMs !== 'number'
    ) {
      throw new VaultError('Vault payload is invalid or corrupted.')
    }
  }
}

/**
 * @param {string} filePath
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {unknown} error
 * @returns {error is NodeJS.ErrnoException}
 */
function isNodeError(error) {
  return error instanceof Error && 'code' in error
}
