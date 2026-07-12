import type Store from 'electron-store'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import type { CompatibleProviderRegistryService } from './compatibleProviderRegistryIpc'
import type { CompatibleProviderTransportService } from '../services/compatibleProviderTransportService'
import type { CompatibleChatRuntimeService } from '../services/compatibleChatRuntimeService'
import type { CompatibleCatalogService } from './compatibleCatalogIpc'
import type { CompatibleLegacyResetService } from '../services/compatibleLegacyResetService'
import {
  COMPATIBLE_PROVIDER_REGISTRY_CHANNELS,
  registerCompatibleProviderRegistryIpc,
} from './compatibleProviderRegistryIpc'
import {
  COMPATIBLE_PROVIDER_TRANSPORT_CHANNELS,
  registerCompatibleProviderTransportIpc,
} from './compatibleProviderTransportIpc'
import { COMPATIBLE_CHAT_CHANNELS, registerCompatibleChatIpc } from './compatibleChatIpc'
import { COMPATIBLE_CATALOG_CHANNELS, registerCompatibleCatalogIpc } from './compatibleCatalogIpc'
import { COMPATIBLE_LEGACY_RESET_CHANNELS, registerCompatibleLegacyResetIpc } from './compatibleLegacyResetIpc'
import { registerDialogIpc, DIALOG_IPC_CHANNELS } from './dialogIpc'
import { registerImageIpc, IMAGE_IPC_CHANNELS, type ResolvedAssetFile } from './imageIpc'
import { registerNetExpIpc, NETEXP_IPC_CHANNELS } from './netExpIpc'
import { registerNetworkProxyIpc, NETWORK_PROXY_IPC_CHANNELS } from './networkProxyIpc'
import { registerShellIpc, SHELL_IPC_CHANNELS } from './shellIpc'
import { registerStoreIpc, STORE_IPC_CHANNELS } from './storeIpc'
import {
  registerOpenRouterCredentialSettingsIpc,
  OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './openRouterCredentialSettingsIpc'
import type { FileSelectionGrantStore } from './fileSelectionGrants'
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
  registerLMStudioLocalProviderIpc,
  LM_STUDIO_LOCAL_PROVIDER_IPC_CHANNELS,
} from './lmStudioLocalProviderIpc'
import {
  registerOllamaLocalProviderIpc,
  OLLAMA_LOCAL_PROVIDER_IPC_CHANNELS,
} from './ollamaLocalProviderIpc'
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
import type { ProviderFileUploadService } from '../services/providerFileUploadService'
import type { ElectronSessionProxyController } from '../net/electronSessionProxyController'
import type { RegisterInvoke } from './types'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'

export const CORE_IPC_CHANNELS = [
  ...STORE_IPC_CHANNELS,
  ...COMPATIBLE_PROVIDER_REGISTRY_CHANNELS,
  ...COMPATIBLE_PROVIDER_TRANSPORT_CHANNELS,
  ...COMPATIBLE_CHAT_CHANNELS,
  ...COMPATIBLE_CATALOG_CHANNELS,
  ...COMPATIBLE_LEGACY_RESET_CHANNELS,
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
  ...LM_STUDIO_LOCAL_PROVIDER_IPC_CHANNELS,
  ...OLLAMA_LOCAL_PROVIDER_IPC_CHANNELS,
  ...OPENAI_RESPONSES_TEXT_CHAT_IPC_CHANNELS,
  ...GOOGLE_AI_STUDIO_TEXT_CHAT_IPC_CHANNELS,
  ...ANTHROPIC_TEXT_CHAT_IPC_CHANNELS,
  ...DEEPSEEK_TEXT_CHAT_IPC_CHANNELS,
  ...NETEXP_IPC_CHANNELS,
  ...NETWORK_PROXY_IPC_CHANNELS,
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
  compatibleProviderRegistryService: CompatibleProviderRegistryService
  compatibleProviderTransportService: CompatibleProviderTransportService
  compatibleChatRuntimeService: CompatibleChatRuntimeService
  compatibleCatalogService: CompatibleCatalogService
  compatibleLegacyResetService: CompatibleLegacyResetService
  isDev: boolean
  netExpRuntimeInfo: unknown
  networkProxyController: ElectronSessionProxyController
  migrateAndCleanupConfig: () => void
  performConfigSizeCheck: (context: 'startup' | 'write') => void
  refreshMainLocale?: () => void
  resolveAssetFileByUrl: (rawUrl: string) => Promise<ResolvedAssetFile | null>
  fileSelectionGrants?: FileSelectionGrantStore
  importLibreOfficeSvpkg?: (packagePath: string) => Promise<unknown>
  quarantineLibreOfficeRuntime?: () => Promise<unknown>
  providerFileUploadService?: ProviderFileUploadService
  rawGenerationRequestStore?: RawGenerationRequestStore
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
    ...registerCompatibleProviderRegistryIpc({
      registerInvoke: input.registerInvoke,
      service: input.compatibleProviderRegistryService,
    }),
    ...registerCompatibleProviderTransportIpc({
      registerInvoke: input.registerInvoke,
      service: input.compatibleProviderTransportService,
    }),
    ...registerCompatibleChatIpc({
      registerInvoke: input.registerInvoke,
      service: input.compatibleChatRuntimeService,
    }),
    ...registerCompatibleCatalogIpc({
      registerInvoke: input.registerInvoke,
      service: input.compatibleCatalogService,
    }),
    ...registerCompatibleLegacyResetIpc({
      registerInvoke: input.registerInvoke,
      service: input.compatibleLegacyResetService,
    }),
    ...registerOpenRouterCredentialSettingsIpc({
      registerInvoke: input.registerInvoke,
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
      rawGenerationRequestStore: input.rawGenerationRequestStore,
    }),
    ...registerLMStudioLocalProviderIpc({
      registerInvoke: input.registerInvoke,
      rawGenerationRequestStore: input.rawGenerationRequestStore,
    }),
    ...registerOllamaLocalProviderIpc({
      registerInvoke: input.registerInvoke,
      rawGenerationRequestStore: input.rawGenerationRequestStore,
    }),
    ...registerOpenAIResponsesTextChatIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
      providerFileUploadService: input.providerFileUploadService,
      rawGenerationRequestStore: input.rawGenerationRequestStore,
    }),
    ...registerGoogleAIStudioTextChatIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
      providerFileUploadService: input.providerFileUploadService,
      rawGenerationRequestStore: input.rawGenerationRequestStore,
    }),
    ...registerAnthropicTextChatIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
      providerFileUploadService: input.providerFileUploadService,
      rawGenerationRequestStore: input.rawGenerationRequestStore,
    }),
    ...registerDeepSeekTextChatIpc({
      registerInvoke: input.registerInvoke,
      credentialService: input.credentialService,
      rawGenerationRequestStore: input.rawGenerationRequestStore,
    }),
    ...registerNetExpIpc({
      registerInvoke: input.registerInvoke,
      runtimeInfo: input.netExpRuntimeInfo,
    }),
    ...registerNetworkProxyIpc({
      registerInvoke: input.registerInvoke,
      controller: input.networkProxyController,
    }),
    ...registerDialogIpc({
      registerInvoke: input.registerInvoke,
      fileSelectionGrants: input.fileSelectionGrants,
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
