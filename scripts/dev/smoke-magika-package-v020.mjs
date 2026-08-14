#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

const zipPath = path.resolve(process.argv[2] ?? '.artifacts/plugin-packages/starverse-plugin-magika-0.2.0-any-any.zip')
const work = await mkdtemp(path.join(os.tmpdir(), 'starverse-magika-smoke-'))
try {
  const entries = unzip(await readFile(zipPath))
  for (const [name, bytes] of entries) {
    if (!name.startsWith('engine/')) continue
    const target = path.resolve(work, name.slice('engine/'.length))
    if (path.relative(work, target).startsWith('..')) throw new Error('unsafe zip path')
    await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(target), { recursive: true }))
    await writeFile(target, bytes)
  }
  const input = path.join(work, 'smoke.txt')
  await writeFile(input, 'Starverse Magika smoke test\n')
  const result = await run(process.execPath, [path.join(work, 'runtime', 'magika-pure-js-runtime.mjs'),
    '--model-dir', path.join(work, 'model', 'standard_v3_3'), '--config-dir', path.join(work, 'model', 'standard_v3_3'),
    '--input', input, '--output-json'])
  if (result.code !== 0) throw new Error(`Magika classify smoke exited ${result.code}: ${sanitize(result.stderr)}`)
  const output = JSON.parse(result.stdout)
  if (typeof output.label !== 'string' || typeof output.score !== 'number') {
    throw new Error(`Magika classify smoke failed: ${result.stderr}`)
  }
  console.log(JSON.stringify({ ok: true, label: output.label, score: output.score, modelVersion: output.modelVersion ?? null }))
} finally { await rm(work, { recursive: true, force: true }) }

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    const stdout = []; const stderr = []
    const timer = setTimeout(() => { child.kill(); reject(new Error('Magika smoke timed out')) }, 60_000)
    child.stdout.on('data', (value) => stdout.push(value))
    child.stderr.on('data', (value) => stderr.push(value))
    child.once('error', reject)
    child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }) })
  })
}

function sanitize(value) {
  return String(value).replace(/\b[A-Za-z]:\\[^\s"'`]+/g, '[redacted-path]').slice(0, 4096)
}

function unzip(bytes) {
  const result = new Map()
  let offset = 0
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const flags = bytes.readUInt16LE(offset + 6); const method = bytes.readUInt16LE(offset + 8)
    if ((flags & 0x08) !== 0) throw new Error('zip data descriptors are unsupported')
    const size = bytes.readUInt32LE(offset + 18); const nameLength = bytes.readUInt16LE(offset + 26); const extraLength = bytes.readUInt16LE(offset + 28)
    const nameStart = offset + 30; const dataStart = nameStart + nameLength + extraLength
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString('utf8')
    const compressed = bytes.subarray(dataStart, dataStart + size)
    result.set(name, method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : (() => { throw new Error('unsupported zip method') })())
    offset = dataStart + size
  }
  return result
}
