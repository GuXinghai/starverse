import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve, isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'

const args = process.argv.slice(2)
const output = args[0]
if (!output || !isAbsolute(output) || args.length > 2) {
  throw new Error('Usage: node scripts/rules/export-reviewed-request-rules-v2.mjs <absolute-output-directory> [model-scopes.json]')
}
const scopes = args[1] ? JSON.parse(await readFile(resolve(args[1]), 'utf8')) : []
if (!Array.isArray(scopes)) throw new Error('Model scopes must be an array')
const scratch = await mkdtemp(join(tmpdir(), 'starverse-rule-authoring-'))
try {
  const entry = join(scratch, 'rules.mjs')
  await build({ entryPoints: [resolve('scripts/rules/reviewedRequestRulePacksV2.ts')], outfile: entry,
    bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
  const { createReviewedRequestRulePacksV2 } = await import(pathToFileURL(entry).href)
  const packets = createReviewedRequestRulePacksV2(scopes)
  await mkdir(output, { recursive: true })
  const files = []
  for (const packet of packets) {
    const name = `${packet.pack.packId}.json`
    const bytes = `${JSON.stringify(packet, null, 2)}\n`
    await writeFile(join(output, name), bytes, { flag: 'wx' })
    files.push({ name, sha256: createHash('sha256').update(bytes).digest('hex'), rules: packet.pack.rules.length })
  }
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify({ schemaVersion: 2,
    delivery: 'user-import', application: 'explicit-import-and-save', files }, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`${JSON.stringify({ output, files }, null, 2)}\n`)
} finally {
  await rm(scratch, { recursive: true, force: true })
}
