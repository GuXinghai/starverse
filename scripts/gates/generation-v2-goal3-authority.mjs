import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const fail = (message) => { throw new Error(`[generation-v2-goal3-authority] ${message}`) }
const relative = (absolute) => path.relative(root, absolute).replaceAll('\\', '/')

const productionFiles = []
for (const rootName of ['src', 'electron', 'infra']) {
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      const absolute = path.join(directory, name)
      const stats = statSync(absolute)
      if (stats.isDirectory()) { walk(absolute); continue }
      if (/\.(?:ts|vue)$/u.test(name) && !/\.(?:test|spec)\.ts$/u.test(name)) productionFiles.push(absolute)
    }
  }
  walk(path.resolve(root, rootName))
}

const forbiddenTokens = [
  'MaterializedCapabilityRuleProjectionV2Repo',
  'materializedCapabilityRuleProjectionV2',
  'applyCapabilityRuleProjection',
  'assertExpectedCurrentSendCapabilityRevisionV2',
]
const forbiddenPatterns = [
  /compose[A-Za-z0-9_]*WithMaterializedRulesV2/u,
]
for (const absolute of productionFiles) {
  const source = readFileSync(absolute, 'utf8')
  for (const token of forbiddenTokens) if (source.includes(token)) fail(`${relative(absolute)} reintroduces ${token}`)
  for (const pattern of forbiddenPatterns) if (pattern.test(source)) fail(`${relative(absolute)} reintroduces ${pattern}`)
}

const projection = readFileSync(path.resolve(root,
  'src/next/generation-v2/capability/resolvedModelFactsRuntimeProjectionV1.ts'), 'utf8')
for (const token of ['fallbackDomain', 'shape-safe execution envelope', '2_000_000', '1_000_000']) {
  if (projection.includes(token)) fail(`runtime projection contains fabricated-domain authority ${token}`)
}
if (!projection.includes("return 'conflict'")) fail('runtime projection does not preserve semantic conflict state')
if (/field\.state === 'conflict'\)\s*return 'requires_confirmation'/u.test(projection)) {
  fail('runtime projection downgrades semantic conflict to confirmation')
}

const cutover = readFileSync(path.resolve(root, 'electron/services/goal3SnapshotCutoverV1.ts'), 'utf8')
if (!cutover.includes('assertExpectedCapabilityRevisionV2(goal3.modelFacts.capabilityRevision)')) {
  fail('Goal 3 snapshot cutover does not perform the final revision assertion')
}
for (const file of [
  'electron/services/anthropicGenerationAuthorityV2Service.ts',
  'electron/services/deepSeekStableGenerationAuthorityV2Service.ts',
  'electron/services/geminiGenerateContentGenerationAuthorityV2Service.ts',
  'electron/services/geminiInteractionsImageGenerationAuthorityV2Service.ts',
  'electron/services/openAIResponsesGenerationAuthorityV2Service.ts',
  'electron/services/openRouterChatGenerationAuthorityV2Service.ts',
  'electron/services/genericLocalOpenAIChatGenerationV2Coordinator.ts',
  'electron/services/lmStudioOpenResponsesGenerationV2Coordinator.ts',
  'electron/services/ollamaChatGenerationV2Coordinator.ts',
  'electron/services/openAIChatCompatibleGenerationV2Coordinator.ts',
  'electron/services/openRouterImageInitialSnapshotCommitV2.ts',
]) {
  const source = readFileSync(path.resolve(root, file), 'utf8')
  for (const pattern of [
    'assertExpectedCapabilityRevisionV2(capability.snapshot.revision.value)',
    'assertExpectedCapabilityRevisionV2(capability.revision.value)',
    'assertExpectedCapabilityRevisionV2(input.capability.revision.value)',
  ]) {
    if (source.includes(pattern)) fail(`${file} asserts a pre-cutover legacy capability revision`)
  }
}

console.log(`[generation-v2-goal3-authority] PASS files=${productionFiles.length}`)
