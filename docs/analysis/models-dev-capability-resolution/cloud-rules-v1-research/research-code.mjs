// Research only: bundle the current pure contracts in memory; never open a database.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const researchRoot = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(researchRoot, '../../../..')
export async function loadResearchContracts() {
  const result = await build({ stdin: {
    contents: [
      "export * from './src/next/generation-v2/capability-rules/capabilityRuleCoreV1.ts'",
      "export * from './src/next/generation-v2/model-facts/providerAuthorityRegistryV1.ts'",
      "export * from './src/next/generation-v2/model-facts/canonicalSourceFactsV1.ts'",
      "export * from './src/next/generation-v2/model-facts/modelsDevSourceAdapterV1.ts'",
      "export * from './src/next/generation-v2/model-facts/providerNativeSourceAdapterV1.ts'",
      "export * from './src/next/generation-v2/model-facts/rawSourceSnapshotV1.ts'",
      "export * from './src/next/generation-v2/model-facts/sourceAdapterV1.ts'",
      "export * from './src/next/generation-v2/model-facts/sourceCoverageManifestV1.ts'",
    ].join('\n'), resolveDir: repoRoot, loader: 'ts',
  }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
