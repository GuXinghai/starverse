import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const defaultDir = path.join(repoRoot, '.artifacts', 'netlog')
const netLogDir = process.env.SV_NETLOG_DIR
  ? path.resolve(process.env.SV_NETLOG_DIR)
  : defaultDir

fs.mkdirSync(netLogDir, { recursive: true })

const pad2 = (value) => String(value).padStart(2, '0')
const now = new Date()
const timestamp = [
  now.getFullYear(),
  pad2(now.getMonth() + 1),
  pad2(now.getDate()),
].join('') + '-' + [
  pad2(now.getHours()),
  pad2(now.getMinutes()),
  pad2(now.getSeconds()),
].join('')

const filename = `netlog-${timestamp}-p${process.pid}.json`
const netLogPath = path.join(netLogDir, filename)

const allowedCaptureModes = new Set(['Default', 'IncludeSensitive', 'Everything'])
const captureMode = process.env.SV_NETLOG_CAPTURE_MODE || 'Default'

if (!allowedCaptureModes.has(captureMode)) {
  console.error(`[netlog] Invalid SV_NETLOG_CAPTURE_MODE: ${captureMode}`)
  console.error('[netlog] Allowed values: Default | IncludeSensitive | Everything')
  process.exit(1)
}

const isSensitive = captureMode === 'IncludeSensitive' || captureMode === 'Everything'
const allowSensitive = process.env.SV_NETLOG_ALLOW_SENSITIVE === '1'

if (isSensitive && !allowSensitive) {
  console.error('[netlog] Sensitive capture mode blocked.')
  console.error('[netlog] Re-run with SV_NETLOG_ALLOW_SENSITIVE=1 to confirm.')
  process.exit(1)
}

console.log(`[netlog] Output file: ${netLogPath}`)
console.log(`[netlog] Capture mode: ${captureMode}`)

if (isSensitive) {
  console.warn('[netlog] WARNING: Sensitive capture may include tokens, headers, and request bodies.')
}

const npmExecPath = process.env.npm_execpath
const isNodeScript = npmExecPath ? /\.(mjs|cjs|js)$/i.test(npmExecPath) : false

const npmCommand = npmExecPath
  ? npmExecPath
  : process.platform === 'win32'
    ? 'npm.cmd'
    : 'npm'

const command = isNodeScript ? process.execPath : npmCommand
const args = isNodeScript ? [npmExecPath, 'run', 'electron:dev'] : ['run', 'electron:dev']

let child
try {
  child = spawn(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      SV_NETLOG_PATH: netLogPath,
      SV_NETLOG_CAPTURE_MODE: captureMode,
    },
  })
} catch (error) {
  console.error('[netlog] Failed to spawn npm (sync):', error)
  process.exit(1)
}

child.on('error', (error) => {
  console.error('[netlog] Failed to spawn npm:', error)
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[netlog] Electron dev process exited via signal: ${signal}`)
    process.exit(1)
  }
  process.exit(code ?? 0)
})
