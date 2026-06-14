import type Store from 'electron-store'
import {
  ALLOWED_CONFIG_KEYS,
  checkConfigIntegrity,
  checkFieldSize,
  safeClearConfig,
} from '../config/configSchema'
import { OPENROUTER_CATALOG_LOCAL_SECRET_KEY } from '../modelCatalog/catalogScope'
import type { RegisterInvoke } from './types'

export const STORE_IPC_CHANNELS = [
  'store-get',
  'store-set',
  'store-delete',
  'store-clear-safe',
  'store-check-integrity',
] as const

export const RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS = new Set([
  'openRouterApiKey',
  'openRouterBaseUrl',
  'geminiApiKey',
  'apiKey',
  OPENROUTER_CATALOG_LOCAL_SECRET_KEY,
])

type RegisterStoreIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
  isDev: boolean
  performConfigSizeCheck: (context: 'startup' | 'write') => void
  migrateAndCleanupConfig: () => void
  refreshMainLocale?: () => void
}>

function isLocaleConfigKey(key: string): boolean {
  return key === 'language' || key === 'languageManual'
}

function isRendererBlockedCredentialStoreKey(key: string): boolean {
  return RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS.has(key)
}

function buildRendererSafeClearKeepKeys(keepKeys: unknown): string[] {
  const safeKeepKeys = Array.isArray(keepKeys) ? keepKeys.map((item) => String(item)) : []
  for (const key of RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS) {
    if (!safeKeepKeys.includes(key)) {
      safeKeepKeys.push(key)
    }
  }
  return safeKeepKeys
}

export function registerStoreIpc(input: RegisterStoreIpcInput): string[] {
  const { registerInvoke, store, isDev, performConfigSizeCheck, migrateAndCleanupConfig, refreshMainLocale } = input

  registerInvoke('store-get', (_event: unknown, key: unknown) => {
    const keyText = String(key ?? '')
    if (isRendererBlockedCredentialStoreKey(keyText)) return undefined
    return store.get(keyText)
  })

  registerInvoke('store-set', (_event: unknown, key: unknown, value: unknown) => {
    const keyText = String(key ?? '')
    if (isRendererBlockedCredentialStoreKey(keyText)) return false

    const sizeCheck = checkFieldSize(keyText, value, isDev)
    if (!sizeCheck.ok) {
      // keep behavior: warn only, do not block write
    }

    if (!ALLOWED_CONFIG_KEYS.has(keyText)) {
      if (isDev) {
        console.warn(`[Config] ⚠️ 写入非白名单字段: "${keyText}"`)
        console.warn('[Config] 如需使用，请添加到 config/configSchema.ts 的 ALLOWED_CONFIG_KEYS')
      } else {
        console.warn(`[Config] 未知配置字段: "${keyText}"`)
      }
    }

    store.set(keyText, value)

    if (isLocaleConfigKey(keyText)) {
      refreshMainLocale?.()
    }

    if (isDev) {
      performConfigSizeCheck('write')
    }

    return true
  })

  registerInvoke('store-delete', (_event: unknown, key: unknown) => {
    const keyText = String(key ?? '')
    if (isRendererBlockedCredentialStoreKey(keyText)) return false
    store.delete(keyText)
    if (isLocaleConfigKey(keyText)) {
      refreshMainLocale?.()
    }
    return true
  })

  registerInvoke('store-clear-safe', (_event: unknown, keepKeys: unknown = []) => {
    try {
      const safeKeepKeys = buildRendererSafeClearKeepKeys(keepKeys)
      const backupPath = safeClearConfig(store, safeKeepKeys)
      migrateAndCleanupConfig()
      performConfigSizeCheck('startup')
      if (!safeKeepKeys.includes('language') || !safeKeepKeys.includes('languageManual')) {
        refreshMainLocale?.()
      }
      return backupPath
    } catch (error) {
      console.error('[IPC] 安全清空配置失败:', error)
      return null
    }
  })

  registerInvoke('store-check-integrity', () => {
    return checkConfigIntegrity(store)
  })

  return [...STORE_IPC_CHANNELS]
}
