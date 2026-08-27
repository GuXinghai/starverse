import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const fail = (message) => { throw new Error(`[generation-v2-zero-residual] ${message}`) }
const read = (relativePath) => readFileSync(path.resolve(root, relativePath), 'utf8')

const requiredFiles = [
  'electron/epoch2MainEntry.ts',
  'electron/mainV2.ts',
  'electron/ipc/generationV2IpcRegistration.ts',
  'electron/debug/rawGenerationRequestStore.ts',
  'src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2.ts',
  'src/next/generation-v2/capability/canonicalModelFactsV2.ts',
  'src/next/generation-v2/capability/modelCapabilitySchemaV2.ts',
]
for (const file of requiredFiles) if (!existsSync(path.resolve(root, file))) fail(`required V2 file is missing: ${file}`)

const deletedLegacyFiles = [
  'electron/main.ts',
  'electron/db/worker.ts',
  'electron/db/workerManager.ts',
  'electron/ipc/registerIpc.ts',
  'electron/ipc/dbBridge.ts',
  'electron/ipc/openRouterStreamBridge.ts',
  'electron/ipc/compatibleChatIpc.ts',
  'electron/services/compatibleChatRuntimeService.ts',
  'infra/db/schema.sql',
  'infra/db/worker.ts',
  'src/next/live/openRouterLiveStream.ts',
  'src/next/branch/branchClient.ts',
  'src/next/context/contextClient.ts',
  'src/next/generation/assistantAnswerGenerationSnapshot.ts',
  'scripts/build-db-worker.cjs',
  'scripts/clear-all-data.js',
  'scripts/clear-all-data-standalone.cjs',
  'src/next/generation-v2/capability/credentialRevisionEvidenceV2.ts',
  'src/next/generation-v2/providers/openai-responses/modelCapabilityManifestV2.ts',
  'src/next/modelCatalog/modelCapabilityResolverV2.ts',
]
for (const file of deletedLegacyFiles) if (existsSync(path.resolve(root, file))) fail(`deleted legacy file remains: ${file}`)

const vite = read('vite.config.ts')
if (!vite.includes('electron/epoch2MainEntry.ts')) fail('Vite does not use the epoch-2 main entry')
if (/electron\/main\.ts/u.test(vite)) fail('Vite still references the legacy main entry')

const packageJson = read('package.json')
for (const token of ['build-db-worker.cjs', 'infra/db/schema.sql', 'electron/main.ts', 'clear-all-data-standalone']) {
  if (packageJson.includes(token)) fail(`package.json still references ${token}`)
}

const preload = read('electron/preload.ts')
for (const legacyGlobal of [
  "exposeInMainWorld('dbBridge'",
  "exposeInMainWorld('compatibleChat'",
  "exposeInMainWorld('compatibleCatalog'",
  "exposeInMainWorld('compatibleProviderRegistry'",
  "exposeInMainWorld('lmStudioProvider'",
  "exposeInMainWorld('ollamaProvider'",
  "exposeInMainWorld('localEndpointDiagnostics'",
]) if (preload.includes(legacyGlobal)) fail(`preload exposes legacy global ${legacyGlobal}`)
if (!preload.includes("exposeInMainWorld('generationV2'")) fail('preload does not expose Generation V2')

const appLogic = read('src/ui-app/app/appChatApp.logic.ts')
for (const token of ['startStreamingForAssistantTurn', 'openRouterLiveStream', 'buildContextForBranchInternalMessages',
  'window.compatibleChat', 'openAIResponsesModels as', 'googleAIStudioModels as']) {
  if (appLogic.includes(token)) fail(`renderer orchestration still contains legacy token ${token}`)
}

const catalogQuery = read('src/next/modelCatalog/catalogQueryService.ts')
for (const token of ['resolveModelCapabilitiesV2', 'normalizeBooleanCapabilityFilters', 'item.capabilities']) {
  if (catalogQuery.includes(token)) fail(`catalog query still makes an independent capability decision via ${token}`)
}
const modelPicker = read('src/ui-app/components/ModelPickerDialog.vue')
for (const token of ['item.capabilities.reasoning', 'item.capabilities.tools', 'item.capabilities.structuredOutputs',
  'item.capabilities.vision', 'item.capabilities.longContext', 'forceOutputImageOnly']) {
  if (modelPicker.includes(token)) fail(`model picker still consumes raw catalog capability hint ${token}`)
}
const generationParamsEditor = read('src/ui-app/components/GenerationParamsSettingsEditor.vue')
if (generationParamsEditor.includes("field.state !== 'supported'")) {
  fail('generation params editor collapses unknown capability into unsupported')
}
for (const file of [
  'electron/services/deepSeekStableGenerationAuthorityV2Service.ts',
  'electron/services/openAIResponsesGenerationAuthorityV2Service.ts',
  'electron/services/openRouterChatGenerationAuthorityV2Service.ts',
]) {
  if (read(file).includes('function domainContains')) {
    fail(`${file} retains an independent semantic-domain validator`)
  }
}

const runnerFiles = [
  'anthropicMessagesStreamRunnerV2.ts',
  'deepSeekInitialStreamRunnerV2.ts',
  'geminiGenerateContentStreamRunnerV2.ts',
  'geminiInteractionsImageStreamRunnerV2.ts',
  'genericLocalOpenAIChatStreamRunnerV2.ts',
  'lmStudioOpenResponsesStreamRunnerV2.ts',
  'ollamaChatStreamRunnerV2.ts',
  'openAIChatCompatibleStreamRunnerV2.ts',
  'openAIResponsesStreamRunnerV2.ts',
  'openRouterChatStreamRunnerV2.ts',
  'openRouterImageInitialStreamRunnerV2.ts',
]
for (const name of runnerFiles) {
  const source = read(`electron/services/${name}`)
  if (!source.includes('tryPersistPreparedV2')) fail(`${name} does not persist the immutable prepared request body`)
  if (!source.includes('body.copyBytes()')) fail(`${name} does not transport bytes copied from the immutable prepared body`)
  if (/body\s*:\s*JSON\.stringify/u.test(source)) fail(`${name} serializes a second transport body`)
}

const main = read('electron/mainV2.ts')
if (!main.includes("path.join(runtime.layout.debugRoot, 'generation-raw.sqlite')")) {
  fail('Raw Request Data is not rooted in the separate epoch debug database')
}
const rawStore = read('electron/debug/rawGenerationRequestStore.ts')
if (!rawStore.includes('tryPersistPreparedV2') || !rawStore.includes('body.copyUtf8Text()')) {
  fail('Raw Request Data does not consume the immutable prepared body')
}
if (rawStore.includes('starverse.db')) fail('Raw Request Data points at the normal chat database')

console.log(`[generation-v2-zero-residual] PASS runners=${runnerFiles.length} deleted=${deletedLegacyFiles.length}`)
