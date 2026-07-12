import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const deletedPaths = [
  'src/next/provider/generic',
  'src/next/generation-params/providerProfiles/genericOpenAICompatibleGenerationProfile.ts',
  'src/next/live/localGenericSemanticCoreBoundary.test.ts',
  'src/next/provider/providerEndpointRegistryBaseline.test.ts',
]
for (const path of deletedPaths) {
  if (!existsSync(path)) continue
  if (statSync(path).isDirectory() && readdirSync(path).length === 0) continue
  throw new Error(`[no-legacy-compatible] deleted path remains: ${path}`)
}

const symbols = [
  'generic_openai_compatible', 'generic_openai_compat_chat_completions', 'remote_openai_compatible',
  'streamViaGeneric', 'GenericEndpointConfig', 'GenericEndpointDescriptor', 'decodeGenericSSE', 'buildGenericRequest',
  'legacyOpenRouter', 'DEFAULT_CHAT_PROVIDER_ID', 'openrouter-custom-legacy-store', 'openRouterBaseUrl',
]
const allowed = new Set([
  'infra/db/worker/handlers/compatibleProviderHandlers.ts:generic_openai_compatible',
  'electron/services/compatibleLegacyResetService.ts:openRouterBaseUrl',
])
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'electron', 'infra/db', 'src', 'scripts'], { encoding: 'utf8' })
  .split(/\r?\n/u).filter((file) => file && existsSync(file) && !file.endsWith('.test.ts') && file !== 'scripts/gates/no-legacy-compatible-identities.mjs')
const violations = []
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const symbol of symbols) if (source.includes(symbol) && !allowed.has(`${file.replaceAll('\\', '/')}:${symbol}`)) violations.push(`${file}:${symbol}`)
}
if (violations.length > 0) throw new Error(`[no-legacy-compatible] prohibited identities:\n${violations.join('\n')}`)
console.log(`[no-legacy-compatible] PASS scanned=${files.length}`)
