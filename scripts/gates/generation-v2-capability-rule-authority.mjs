import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const fail = (message) => { throw new Error(`[generation-v2-capability-rule-authority] ${message}`) }

const removedAuthorities = [
  'src/next/provider/gemini/geminiThinkingPolicy.ts',
  'src/next/provider/gemini/geminiImageGenerationPolicy.ts',
  'src/next/generation-v2/providers/gemini/toolCapabilityPolicyV2.ts',
  'src/next/generation-v2/providers/gemini/interactionsImageCapabilityPolicyV1.ts',
  'src/next/generation-v2/providers/anthropic/modelThinkingRulesV1.ts',
]
for (const file of removedAuthorities) {
  if (existsSync(path.resolve(root, file))) fail(`obsolete model-fact authority remains: ${file}`)
}

const roots = [
  'electron/services',
  'src/next/provider',
  'src/next/generation-v2/providers',
  'src/ui-app',
]
const files = []
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const absolute = path.join(directory, name)
    const relative = path.relative(root, absolute).replaceAll('\\', '/')
    const stats = statSync(absolute)
    if (stats.isDirectory()) { walk(absolute); continue }
    if (!/\.(?:ts|vue)$/u.test(name) || /\.test\.ts$/u.test(name) || relative.includes('/capability-rules/')) continue
    files.push(relative)
  }
}
for (const directory of roots) walk(path.resolve(root, directory))

const forbiddenSymbols = [
  'resolveGeminiThinkingCapability',
  'resolveGeminiImageGenerationPolicy',
  'isGeminiInteractionsImageModelIdV1',
  'hasReviewedGeminiGenerateContentToolCapabilityV2',
  'hasReviewedGeminiGenerateContentReasoningWebCapabilityV2',
  'readAnthropicModelThinkingRuleV1',
  'OPENAI_RESPONSES_IMAGE_SIZE_DOMAIN_V2',
]
const exactModelLiteral = /['"](?:gemini-[0-9]|claude-[0-9]|gpt-[0-9]|o[0-9](?:-|['"])|deepseek-v[0-9])/u
for (const file of files) {
  const source = readFileSync(path.resolve(root, file), 'utf8')
  for (const symbol of forbiddenSymbols) if (source.includes(symbol)) fail(`${file} reintroduces ${symbol}`)
  if (!/ModelSource\.ts$/u.test(file) && exactModelLiteral.test(source)) {
    fail(`${file} contains an exact model literal outside approved capability-rule data`)
  }
}

console.log(`[generation-v2-capability-rule-authority] checked ${files.length} production files`)
