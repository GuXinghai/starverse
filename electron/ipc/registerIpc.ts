import type Store from 'electron-store'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
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
  registerOpenAIResponsesModelAvailabilityIpc,
  OPENAI_RESPONSES_MODEL_AVAILABILITY_IPC_CHANNELS,
} from './openAIResponsesModelAvailabilityIpc'
import {
  registerGoogleAIStudioCredentialSettingsIpc,
  GOOGLE_AI_STUDIO_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './googleAIStudioCredentialSettingsIpc'
import {
  registerAnthropicCredentialSettingsIpc,
  ANTHROPIC_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './anthropicCredentialSettingsIpc'
import {
  registerAnthropicModelAvailabilityIpc,
  ANTHROPIC_MODEL_AVAILABILITY_IPC_CHANNELS,
} from './anthropicModelAvailabilityIpc'
import {
  registerDeepSeekCredentialSettingsIpc,
  DEEPSEEK_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './deepSeekCredentialSettingsIpc'
import {
  registerDeepSeekModelAvailabilityIpc,
  DEEPSEEK_MODEL_AVAILABILITY_IPC_CHANNELS,
} from './deepSeekModelAvailabilityIpc'
import {
  registerGoogleAIStudioModelAvailabilityIpc,
  GOOGLE_AI_STUDIO_MODEL_AVAILABILITY_IPC_CHANNELS,
} from './googleAIStudioModelAvailabilityIpc'
import {
  registerLibreOfficeSystemProxyProbeIpc,
  LIBREOFFICE_SYSTEM_PROXY_PROBE_IPC_CHANNELS,
} from './libreOfficeSystemProxyProbeIpc'
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
  ...OPENAI_RESPONSES_MODEL_AVAILABILITY_IPC_CHANNELS,
  ...GOOGLE_AI_STUDIO_CREDENTIAL_SETTINGS_IPC_CHANNELS,
  ...ANTHROPIC_CREDENTIAL_SETTINGS_IPC_CHANNELS,
  ...ANTHROPIC_MODEL_AVAILABILITY_IPC_CHANNELS,
  ...DEEPSEEK_CREDENTIAL_SETTINGS_IPC_CHANNELS,
  ...GOOGLE_AI_STUDIO_MODEL_AVAILABILITY_IPC_CHANNELS,
  ...DEEPSEEK_MODEL_AVAILABILITY_IPC_CHANNELS,
  ...LIBREOFFICE_SYSTEM_PROXY_PROBE_IPC_CHANNELS,
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
  credentialService: ProviderCredentialService
  isDev: boolean
  netExpRuntimeInfo: unknown
  migrateAndCleanupConfig: () => void
  performConfigSizeCheck: (context: 'startup' | 'write') => void
  refreshMainLocale?: () => void
  resolveAssetFileByUrl: (rawUrl: string) => Promise<ResolvedAssetFile | null>
  importLibreOfficeSvpkg?: (packagePath: string) => Promise<unknown>
  quarantineLibreOfficeRuntime?: () => Promise<unknown>
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
      credentialService: input.credentialService,
    }),
    ...registerOpenAIResponsesCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerOpenAIResponsesModelAvailabilityIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerGoogleAIStudioCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerAnthropicCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerAnthropicModelAvailabilityIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerDeepSeekCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerGoogleAIStudioModelAvailabilityIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerDeepSeekModelAvailabilityIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerLibreOfficeSystemProxyProbeIpc({
      registerInvoke: input.registerInvoke,
    }),
    ...registerLocalEndpointDiagnosticsIpc({
      registerInvoke: input.registerInvoke,
    }),
    ...registerLocalEndpointTextChatIpc({
      registerInvoke: input.registerInvoke,
    }),
    ...registerOpenAIResponsesTextChatIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerGoogleAIStudioTextChatIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerAnthropicTextChatIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerDeepSeekTextChatIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
    }),
    ...registerNetExpIpc({
      registerInvoke: input.registerInvoke,
      runtimeInfo: input.netExpRuntimeInfo,
    }),
    ...registerDialogIpc({
      registerInvoke: input.registerInvoke,
      importLibreOfficeSvpkg: input.importLibreOfficeSvpkg,
      quarantineLibreOfficeRuntime: input.quarantineLibreOfficeRuntime,
    }),
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
