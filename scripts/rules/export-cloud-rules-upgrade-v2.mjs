import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { isAbsolute, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const [source, output, version, scopesPath, ...extra] = process.argv.slice(2)
if (!source || !output || !version || !scopesPath || extra.length || !isAbsolute(source) || !isAbsolute(output)) {
  throw new Error('Usage: node scripts/rules/export-cloud-rules-upgrade-v2.mjs <absolute-source.json> <absolute-output.json> <new-version> <model-scopes.json>')
}
const scratch = await mkdtemp(join(tmpdir(), 'starverse-cloud-upgrade-'))
try {
  const entry = join(scratch, 'upgrade.mjs')
  await build({ entryPoints: [resolve('scripts/rules/cloudRulesUpgradeV2.ts')], outfile: entry,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
  const { createCloudRulesUpgradeV2 } = await import(pathToFileURL(entry).href)
  const scopes = JSON.parse(await readFile(scopesPath, 'utf8'))
  if (!Array.isArray(scopes)) throw new Error('Model scopes must be an array')
  const document = createCloudRulesUpgradeV2(JSON.parse(await readFile(source, 'utf8')), version, scopes)
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`${JSON.stringify({ output, schemaVersion: document.schemaVersion,
    releaseVersion: document.releaseVersion, contentRevision: document.contentRevision,
    packs: document.packs.length, rules: document.packs.reduce((sum, pack) => sum + pack.rules.length, 0) })}\n`)
} finally {
  await rm(scratch, { recursive: true, force: true })
}
