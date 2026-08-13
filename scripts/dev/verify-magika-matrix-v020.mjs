#!/usr/bin/env node
import { cp, mkdir, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(process.argv[2] ?? '.artifacts/matrix')
const output = path.resolve(process.argv[3] ?? '.artifacts/plugin-packages')
const directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory())
if (directories.length !== 6) throw new Error(`expected six runner artifacts, received ${directories.length}`)
const records = await Promise.all(directories.map(async (entry) => {
  const base = path.join(root, entry.name)
  const hashPath = await findFile(base, 'magika-sha256.txt')
  const zip = await findFile(base, 'starverse-plugin-magika-0.2.0-any-any.zip')
  const hash = (await readFile(hashPath, 'utf8')).trim()
  return { name: entry.name, hash, zip }
}))
if (new Set(records.map((record) => record.hash)).size !== 1) {
  throw new Error(`Magika any/any artifact hash mismatch: ${records.map((record) => `${record.name}=${record.hash}`).join(', ')}`)
}
await mkdir(output, { recursive: true })
await cp(records[0].zip, path.join(output, 'starverse-plugin-magika-0.2.0-any-any.zip'))
await cp(path.join(path.dirname(records[0].zip), 'starverse-plugin-magika-0.2.0-any-any.summary.json'),
  path.join(output, 'starverse-plugin-magika-0.2.0-any-any.summary.json'))
console.log(JSON.stringify({ ok: true, runnerCount: records.length, sha256: records[0].hash }))

async function findFile(directory, filename) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name)
    if (entry.isFile() && entry.name === filename) return candidate
    if (entry.isDirectory()) {
      const nested = await findFile(candidate, filename).catch(() => null)
      if (nested) return nested
    }
  }
  throw new Error(`missing ${filename} below ${directory}`)
}
