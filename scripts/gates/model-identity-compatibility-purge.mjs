import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const fail = (message) => { throw new Error(`[model-identity-compatibility-purge] ${message}`) }
const relative = (absolute) => path.relative(root, absolute).replaceAll('\\', '/')

const productionFiles = []
for (const rootName of ['src', 'electron', 'infra']) {
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      const absolute = path.join(directory, name)
      if (statSync(absolute).isDirectory()) walk(absolute)
      else if (/\.(?:ts|vue)$/u.test(name) && !/\.(?:test|spec)\.ts$/u.test(name)) productionFiles.push(absolute)
    }
  }
  walk(path.resolve(root, rootName))
}

const bannedTokens = [
  'selectedProviderId',
  'selectedModelKey',
  'CurrentRuntimeSelection',
  'RuntimeProviderKey',
  'cleanupLegacyModelStorage',
  'LEGACY_MODEL_STORAGE_KEYS',
  'providerRuntimeSendCoordinator',
  'legacy_experimental_flag',
]
for (const absolute of productionFiles) {
  const source = readFileSync(absolute, 'utf8')
  for (const token of bannedTokens) if (source.includes(token)) fail(`${relative(absolute)} contains ${token}`)
}

const deletedPaths = [
  'src/constants/providers.ts',
  'src/next/provider/runtimeSelection.ts',
  'src/ui-app/app/providerRuntimeSendCoordinator.ts',
  'scripts/smoke/local-endpoint-text-chat-smoke.mjs',
  'src/next/live/localEndpointTextChat.ts',
  'src/next/live/lmStudioTextChat.ts',
  'src/next/live/ollamaTextChat.ts',
  'src/next/live/openAIResponsesTextChat.ts',
  'src/next/live/googleAIStudioTextChat.ts',
  'src/next/live/anthropicTextChat.ts',
  'src/next/live/deepSeekTextChat.ts',
  'src/next/provider/openai-chat-compatible/ui/compatibleConfigurationSelection.ts',
]
for (const deletedPath of deletedPaths) {
  if (existsSync(path.resolve(root, deletedPath))) fail(`deleted compatibility file remains: ${deletedPath}`)
}

const sendFiles = productionFiles.filter((absolute) => {
  const name = relative(absolute)
  return name === 'src/ui-app/app/appChatApp.logic.ts' || name.startsWith('electron/services/')
})
for (const absolute of sendFiles) {
  const source = readFileSync(absolute, 'utf8')
  if (/modelId\s*\?\?\s*[^\n]*(?:modelKey|nativeModelId)|modelKey\s*\?\?|nativeModelId\s*\?\?/u.test(source)) {
    fail(`${relative(absolute)} contains a send-path model identity fallback`)
  }
}

const nativeModelIdAllowlist = [
  'electron/electron-env.d.ts',
  'electron/services/activeCatalogModelAuthorityV2Service.ts',
  'infra/db/repo/modelCatalogV2Repo.ts',
  'src/next/modelCatalog/catalogQueryService.ts',
  'src/next/modelCatalog/modelCapabilityResolverV2.ts',
  'src/next/provider/',
  'src/shared/modelCatalog/',
  'src/ui-app/app/appChatApp.logic.ts',
  'src/ui-app/components/ChatAppComposer.vue',
  'src/ui-app/components/ChatSessionConsole.vue',
]
for (const absolute of productionFiles) {
  const name = relative(absolute)
  const source = readFileSync(absolute, 'utf8')
  if (!source.includes('nativeModelId')) continue
  if (!nativeModelIdAllowlist.some((entry) => entry.endsWith('/') ? name.startsWith(entry) : name === entry)) {
    fail(`${name} uses nativeModelId outside the discovery/observation allowlist`)
  }
}

const read = (relativePath) => readFileSync(path.resolve(root, relativePath), 'utf8')

const historyProjection = read('src/ui-app/app/appChatApp.logic.ts')
if (/as\s+RuntimeProviderId/u.test(historyProjection)) {
  fail('history/app projection contains an unchecked RuntimeProviderId assertion')
}

const catalogAuthority = read('src/next/modelCatalog/providerCatalogAuthorityRegistryV2.ts')
if (!catalogAuthority.includes('executionProviderId: GenerationExecutionProviderId')) {
  fail('Catalog authority does not expose an explicit Generation execution identity')
}
if (/entry\(\s*['"]google_ai_studio['"][\s\S]{0,120}['"]gemini['"]/u.test(catalogAuthority)) {
  fail('Catalog authority reintroduces the Google gemini ghost identity')
}
if (/(?:replace|replaceAll|slice)\s*\(/u.test(catalogAuthority)) {
  fail('Catalog authority infers provider identity by spelling transformation')
}

const localDescriptor = read('src/shared/provider/localProviderRouteDescriptor.ts')
for (const requiredSignature of [
  'providerId: LocalRuntimeProviderId',
  'routeKind: LocalProviderRouteKind',
]) {
  if (!localDescriptor.includes(requiredSignature)) {
    fail(`LocalProviderRouteDescriptor lookup is not closed-typed: ${requiredSignature}`)
  }
}
for (const forbidden of ['legacyAlias', 'fallbackSpelling', 'normalizeProvider', 'normalizeRoute']) {
  if (localDescriptor.includes(forbidden)) {
    fail(`LocalProviderRouteDescriptor behaves as a compatibility normalizer: ${forbidden}`)
  }
}

const failureContract = read('src/shared/provider/providerFailureV2.ts')
if (!failureContract.includes("namespace: 'generation_execution'") ||
    !failureContract.includes("namespace: 'catalog_source'") ||
    !failureContract.includes("namespace: 'credential_slot'")) {
  fail('ProviderFailureV2 does not declare all frozen provider namespaces')
}
if (/ProviderFailure(?:V2|V2Context)[\s\S]{0,500}\bproviderId\s*:/u.test(failureContract)) {
  fail('ProviderFailureV2 reintroduces an unqualified providerId')
}

const compatibleIntent = read('src/next/provider/openai-chat-compatible/ui/compatibleRouteIntent.ts')
const compatibleIntentContract = compatibleIntent.split('export type CompatibleRoutePickerSource')[0]
for (const forbidden of ['endpointUrl', 'requestProfileId', 'responseProfileId', 'extraBody', 'providerName']) {
  if (compatibleIntentContract.includes(forbidden)) {
    fail(`compatible route intent persists execution/configuration field ${forbidden}`)
  }
}

const composer = read('src/ui-app/components/ChatAppComposer.vue')
if (/recordRecent\s*\(/u.test(composer)) {
  fail('Composer records a recent during selection instead of after accepted operation creation')
}

console.log(`[model-identity-compatibility-purge] PASS files=${productionFiles.length} deleted=${deletedPaths.length}`)
