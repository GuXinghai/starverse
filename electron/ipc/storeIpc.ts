import type Store from 'electron-store'
import {
  ALLOWED_CONFIG_KEYS,
  checkConfigIntegrity,
  checkFieldSize,
  safeClearConfig,
} from '../config/configSchema'
import {
  isProviderCredentialSecureStoreKey,
  PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX,
} from '../credentials/providerCredentialContract'
import {
  isOpenAICompatibleCredentialV2StoreKey,
  OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_NAMESPACE,
  OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_ROOT,
} from '../credentials/openAICompatibleCredentialV2Service'
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
  'openAIResponsesApiKey',
  'googleAIStudioApiKey',
  'anthropicApiKey',
  'deepSeekApiKey',
  'geminiApiKey',
  'apiKey',
  // Proxy settings must only change through the apply-before-persist authority.
  'networkProxySettingsV2',
])

const RENDERER_MAIN_AUTHORITY_STORE_KEYS = new Set([
  'configVersion',
  'networkProxyPolicy',
  // Destructive database controls are main-process authority, not renderer preferences.
  'dbExp',
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

const PROVIDER_CREDENTIAL_SECURE_STORE_NAMESPACE = PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX.replace(/\.$/u, '')

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`)
}

function isRendererBlockedCredentialStoreKey(key: string): boolean {
  const protectedPaths = [
    ...RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS,
    ...RENDERER_MAIN_AUTHORITY_STORE_KEYS,
    PROVIDER_CREDENTIAL_SECURE_STORE_NAMESPACE,
    OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_NAMESPACE,
  ]
  return protectedPaths.some((protectedPath) => pathsOverlap(key, protectedPath)) ||
    isProviderCredentialSecureStoreKey(key) ||
    isOpenAICompatibleCredentialV2StoreKey(key)
}

function isRendererAccessibleConfigKey(key: string): boolean {
  return ALLOWED_CONFIG_KEYS.has(key) && !isRendererBlockedCredentialStoreKey(key)
}

function buildRendererSafeClearKeepKeys(keepKeys: unknown): string[] {
  const safeKeepKeys = Array.isArray(keepKeys)
    ? keepKeys.map((item) => String(item)).filter((key) => isRendererAccessibleConfigKey(key))
    : []
  const providerCredentialRoot = PROVIDER_CREDENTIAL_SECURE_STORE_NAMESPACE.split('.')[0]!
  for (const key of [...RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS, providerCredentialRoot, OPENAI_COMPATIBLE_CREDENTIAL_V2_STORE_ROOT]) {
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
    if (!isRendererAccessibleConfigKey(keyText)) return undefined
    return store.get(keyText)
  })

  registerInvoke('store-set', (_event: unknown, key: unknown, value: unknown) => {
    const keyText = String(key ?? '')
    if (!isRendererAccessibleConfigKey(keyText)) return false

    const sizeCheck = checkFieldSize(keyText, value, isDev)
    if (!sizeCheck.ok) return false

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
    if (!isRendererAccessibleConfigKey(keyText)) return false
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
    } catch {
      console.error('[store-ipc] STORE_SAFE_CLEAR_FAILED')
      return null
    }
  })

  registerInvoke('store-check-integrity', () => {
    return checkConfigIntegrity(store)
  })

  return [...STORE_IPC_CHANNELS]
}
