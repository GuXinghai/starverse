const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const SOURCE_ROOT = path.join(ROOT, 'native', 'epoch-win32')
const OUTPUT_ROOT = path.join(ROOT, 'dist-native', 'win32-x64')
const OUTPUT_FILE = path.join(OUTPUT_ROOT, 'starverse_epoch_win32.node')
const GENERATED_ROOT = path.join(SOURCE_ROOT, '.generated')
const GENERATED_IDENTITY_HEADER = path.join(GENERATED_ROOT, 'product_identity.h')

function fail(message) {
  console.error(`[epoch-native] ${message}`)
  process.exit(1)
}

const runtimeArg = process.argv.find((value) => value.startsWith('--runtime='))
const runtime = runtimeArg?.slice('--runtime='.length)
if (runtime !== 'node' && runtime !== 'electron') {
  fail('expected --runtime=node or --runtime=electron')
}

if (process.platform !== 'win32') {
  fs.rmSync(path.join(ROOT, 'dist-native'), { recursive: true, force: true })
  console.log('[epoch-native] skipped: Windows-only authority')
  process.exit(0)
}
if (process.arch !== 'x64') {
  fail(`unsupported Windows architecture: ${process.arch}`)
}

const packageMetadata = require(path.join(ROOT, 'package.json'))
const productName = packageMetadata.productName
const applicationId = packageMetadata.build?.appId
if (typeof productName !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]*$/.test(productName) ||
    typeof applicationId !== 'string' ||
    !/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(applicationId)) {
  fail('package identity is not safe for the native generated header')
}
fs.mkdirSync(GENERATED_ROOT, { recursive: true })
fs.writeFileSync(GENERATED_IDENTITY_HEADER, [
  '#pragma once',
  `#define STARVERSE_PRODUCT_NAME_W L${JSON.stringify(productName)}`,
  `#define STARVERSE_PRODUCT_NAME_UTF8 ${JSON.stringify(productName)}`,
  `#define STARVERSE_PACKAGED_APP_ID_UTF8 ${JSON.stringify(applicationId)}`,
  '',
].join('\n'))

const nodeGyp = require.resolve('node-gyp/bin/node-gyp.js')
const args = [nodeGyp, 'rebuild', '--release']
if (runtime === 'electron') {
  const electronVersion = require('electron/package.json').version
  args.push(`--target=${electronVersion}`, '--dist-url=https://electronjs.org/headers')
}

const result = spawnSync(process.execPath, args, {
  cwd: SOURCE_ROOT,
  env: process.env,
  stdio: 'inherit',
})
if (result.error) fail(`node-gyp failed to start: ${result.error.message}`)
if (result.status !== 0) fail(`node-gyp exited with status ${result.status}`)

const builtFile = path.join(SOURCE_ROOT, 'build', 'Release', 'starverse_epoch_win32.node')
if (!fs.existsSync(builtFile)) fail('node-gyp completed without the expected addon')
fs.mkdirSync(OUTPUT_ROOT, { recursive: true })
fs.copyFileSync(builtFile, OUTPUT_FILE)
console.log(`[epoch-native] built ${runtime} target: dist-native/win32-x64/${path.basename(OUTPUT_FILE)}`)
