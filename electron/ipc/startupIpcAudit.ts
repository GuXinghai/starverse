import { DB_BRIDGE_IPC_CHANNELS } from './dbBridge'
import { INAPP_BROWSER_IPC_CHANNELS } from './inappBrowserIpc'
import { MODEL_CATALOG_SYNC_IPC_CHANNELS } from './modelCatalogSyncIpc'
import { OPENROUTER_STREAM_IPC_CHANNELS } from './openRouterStreamBridge'
import { CORE_IPC_CHANNELS, CORE_IPC_CRITICAL_CHANNELS } from './registerIpc'

export const STARTUP_IPC_CHANNELS = [
  ...CORE_IPC_CHANNELS,
  ...DB_BRIDGE_IPC_CHANNELS,
  ...OPENROUTER_STREAM_IPC_CHANNELS,
  ...INAPP_BROWSER_IPC_CHANNELS,
  ...MODEL_CATALOG_SYNC_IPC_CHANNELS,
] as const

export const STARTUP_IPC_CRITICAL_CHANNELS = [
  ...CORE_IPC_CRITICAL_CHANNELS,
  'db:invoke',
  'openrouter:stream-chat',
  'openrouter:abort',
  'inapp:open-link',
] as const

export type StartupIpcRegistrationCheckResult =
  | Readonly<{ ok: true; expectedCount: number; actualCount: number }>
  | Readonly<{
      ok: false
      expectedCount: number
      actualCount: number
      missing: string[]
      unexpected: string[]
      missingCritical: string[]
    }>

export function validateStartupIpcRegistration(channels: readonly string[]): StartupIpcRegistrationCheckResult {
  const expected = [...STARTUP_IPC_CHANNELS]
  const expectedSet = new Set<string>(expected)
  const actual = [...new Set(channels)]
  const actualSet = new Set(actual)
  const missing = expected.filter((channel) => !actualSet.has(channel))
  const unexpected = actual.filter((channel) => !expectedSet.has(channel))
  const missingCritical = STARTUP_IPC_CRITICAL_CHANNELS.filter((channel) => !actualSet.has(channel))

  if (missing.length === 0 && unexpected.length === 0) {
    return { ok: true, expectedCount: expected.length, actualCount: actual.length }
  }

  return {
    ok: false,
    expectedCount: expected.length,
    actualCount: actual.length,
    missing,
    unexpected,
    missingCritical,
  }
}
