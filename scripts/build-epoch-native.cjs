const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const SOURCE_ROOT = path.join(ROOT, 'native', 'epoch-win32')
const OUTPUT_ROOT = path.join(ROOT, 'dist-native', 'win32-x64')
const OUTPUT_FILE = path.join(OUTPUT_ROOT, 'starverse_epoch_win32.node')

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
