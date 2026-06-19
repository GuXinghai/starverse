import type Store from 'electron-store'
import { registerDialogIpc, DIALOG_IPC_CHANNELS } from './dialogIpc'
import { registerImageIpc, IMAGE_IPC_CHANNELS, type ResolvedAssetFile } from './imageIpc'
import { registerNetExpIpc, NETEXP_IPC_CHANNELS } from './netExpIpc'
import { registerShellIpc, SHELL_IPC_CHANNELS } from './shellIpc'
import { registerStoreIpc, STORE_IPC_CHANNELS } from './storeIpc'
import {
  registerOpenRouterCredentialSettingsIpc,
  OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './openRouterCredentialSettingsIpc'
import {
  registerOpenAIResponsesCredentialSettingsIpc,
  OPENAI_RESPONSES_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './openAIResponsesCredentialSettingsIpc'
import {
  registerGoogleAIStudioCredentialSettingsIpc,
  GOOGLE_AI_STUDIO_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './googleAIStudioCredentialSettingsIpc'
import {
  registerAnthropicCredentialSettingsIpc,
  ANTHROPIC_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './anthropicCredentialSettingsIpc'
import {
  registerDeepSeekCredentialSettingsIpc,
  DEEPSEEK_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './deepSeekCredentialSettingsIpc'
import {
  registerLocalEndpointDiagnosticsIpc,
  LOCAL_ENDPOINT_DIAGNOSTICS_IPC_CHANNELS,
} from './localEndpointDiagnosticsIpc'
import {
  registerLocalEndpointTextChatIpc,
  LOCAL_ENDPOINT_TEXT_CHAT_IPC_CHANNELS,
} from './localEndpointTextChatIpc'
import {
  registerOpenAIResponsesTextChatIpc,
  OPENAI_RESPONSES_TEXT_CHAT_IPC_CHANNELS,
} from './openAIResponsesTextChatIpc'
import {
  registerGoogleAIStudioTextChatIpc,
  GOOGLE_AI_STUDIO_TEXT_CHAT_IPC_CHANNELS,
} from './googleAIStudioTextChatIpc'
import {
  registerAnthropicTextChatIpc,
  ANTHROPIC_TEXT_CHAT_IPC_CHANNELS,
} from './anthropicTextChatIpc'
import {
  registerDeepSeekTextChatIpc,
  DEEPSEEK_TEXT_CHAT_IPC_CHANNELS,
} from './deepSeekTextChatIpc'
import type { RegisterInvoke } from './types'

export const CORE_IPC_CHANNELS = [
  ...STORE_IPC_CHANNELS,
  ...OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS,
  ...OPENAI_RESPONSES_CREDENTIAL_SETTINGS_IPC_CHANNELS,
  ...GOOGLE_AI_STUDIO_CREDENTIAL_SETTINGS_IPC_CHANNELS,
  ...ANTHROPIC_CREDENTIAL_SETTINGS_IPC_CHANNELS,
  ...DEEPSEEK_CREDENTIAL_SETTINGS_IPC_CHANNELS,
  ...LOCAL_ENDPOINT_DIAGNOSTICS_IPC_CHANNELS,
  ...LOCAL_ENDPOINT_TEXT_CHAT_IPC_CHANNELS,
  ...OPENAI_RESPONSES_TEXT_CHAT_IPC_CHANNELS,
  ...GOOGLE_AI_STUDIO_TEXT_CHAT_IPC_CHANNELS,
  ...ANTHROPIC_TEXT_CHAT_IPC_CHANNELS,
  ...DEEPSEEK_TEXT_CHAT_IPC_CHANNELS,
  ...NETEXP_IPC_CHANNELS,
  ...DIALOG_IPC_CHANNELS,
  ...SHELL_IPC_CHANNELS,
  ...IMAGE_IPC_CHANNELS,
] as const

export const CORE_IPC_CRITICAL_CHANNELS = [
  'store-get',
  'store-set',
  'dialog:select-file',
  'dialog:select-image',
  'shell:open-image',
] as const

type RegisterIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
  isDev: boolean
  netExpRuntimeInfo: unknown
  migrateAndCleanupConfig: () => void
  performConfigSizeCheck: (context: 'startup' | 'write') => void
  refreshMainLocale?: () => void
  resolveAssetFileByUrl: (rawUrl: string) => Promise<ResolvedAssetFile | null>
}>

export type IpcRegistrationResult = Readonly<{
  channels: string[]
}>

export type IpcRegistrationCheckResult =
  | Readonly<{ ok: true; expectedCount: number; actualCount: number }>
  | Readonly<{
      ok: false
      expectedCount: number
      actualCount: number
      missing: string[]
      unexpected: string[]
      missingCritical: string[]
    }>

export function registerIpc(input: RegisterIpcInput): IpcRegistrationResult {
  const channels = [
    ...registerStoreIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
      isDev: input.isDev,
      migrateAndCleanupConfig: input.migrateAndCleanupConfig,
      performConfigSizeCheck: input.performConfigSizeCheck,
      refreshMainLocale: input.refreshMainLocale,
    }),
    ...registerOpenRouterCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
    }),
    ...registerOpenAIResponsesCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
    }),
    ...registerGoogleAIStudioCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
    }),
    ...registerAnthropicCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
    }),
    ...registerDeepSeekCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
    }),
    ...registerLocalEndpointDiagnosticsIpc({
      registerInvoke: input.registerInvoke,
    }),
    ...registerLocalEndpointTextChatIpc({
      registerInvoke: input.registerInvoke,
    }),
    ...registerOpenAIResponsesTextChatIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
    }),
    ...registerGoogleAIStudioTextChatIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
    }),
    ...registerAnthropicTextChatIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
    }),
    ...registerDeepSeekTextChatIpc({
      registerInvoke: input.registerInvoke,
      store: input.store,
    }),
    ...registerNetExpIpc({
      registerInvoke: input.registerInvoke,
      runtimeInfo: input.netExpRuntimeInfo,
    }),
    ...registerDialogIpc({ registerInvoke: input.registerInvoke }),
    ...registerShellIpc({ registerInvoke: input.registerInvoke }),
    ...registerImageIpc({
      registerInvoke: input.registerInvoke,
      resolveAssetFileByUrl: input.resolveAssetFileByUrl,
    }),
  ]

  return { channels: [...new Set(channels)] }
}

export function validateCoreIpcRegistration(channels: readonly string[]): IpcRegistrationCheckResult {
  const expected = [...CORE_IPC_CHANNELS]
  const expectedSet = new Set<string>(expected)
  const actual = [...new Set(channels)]
  const actualSet = new Set(actual)
  const missing = expected.filter((channel) => !actualSet.has(channel))
  const unexpected = actual.filter((channel) => !expectedSet.has(channel))
  const missingCritical = CORE_IPC_CRITICAL_CHANNELS.filter((channel) => !actualSet.has(channel))

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
