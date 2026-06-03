import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixtures = [
  {
    path: path.join(repoRoot, 'src', '__vite_resolution_alias_probe.ts'),
    route: '/src/__vite_resolution_alias_probe.ts',
    source: "import { getDiagnosticsFlags } from '@/shared/diagnostics/flags'\nconsole.log(getDiagnosticsFlags)\n",
  },
  {
    path: path.join(repoRoot, 'src', '__vite_resolution_bare_probe.ts'),
    route: '/src/__vite_resolution_bare_probe.ts',
    source: "import { createApp } from 'vue'\nconsole.log(createApp)\n",
  },
  {
    path: path.join(repoRoot, 'src', '__vite_resolution_katex_css_probe.ts'),
    route: '/src/__vite_resolution_katex_css_probe.ts',
    source: "import 'katex/dist/katex.min.css'\nconsole.log('katex css')\n",
  },
]

const requiredRoutes = [
  '/',
  '/@vite/client',
  '/src/main.ts',
  '/src/style.css',
  fixtures[0].route,
  fixtures[1].route,
  fixtures[2].route,
  '/src/next/state/perfMetrics.ts',
]

const routeTimeoutMs = new Map([
  ['/src/style.css', 60000],
  [fixtures[2].route, 60000],
])

const buildIdPath = path.join(repoRoot, 'public', 'build-id.json')
const originalBuildId = fs.existsSync(buildIdPath) ? fs.readFileSync(buildIdPath) : null

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

function request(url, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const started = Date.now()
    const req = http.get(url, (res) => {
      let bytes = 0
      res.on('data', (chunk) => { bytes += chunk.length })
      res.on('end', () => {
        resolve({ ok: res.statusCode === 200 && bytes > 0, status: res.statusCode, bytes, ms: Date.now() - started })
      })
    })
    req.on('error', (error) => resolve({ ok: false, error: error.message, bytes: 0, ms: Date.now() - started }))
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'))
      resolve({ ok: false, error: 'timeout', bytes: 0, ms: Date.now() - started })
    })
  })
}

async function waitForViteUrl(readLog) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    const clean = stripAnsi(readLog())
    const match = clean.match(/Local:\s+(http:\/\/localhost:\d+\/)/)
    if (match) return match[1].replace(/\/$/, '')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('vite dev server did not report a localhost URL within 90s')
}

function killTree(child) {
  if (!child?.pid) return
  try {
    execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    child.kill()
  }
}

function restoreFiles() {
  for (const fixture of fixtures) {
    try { fs.unlinkSync(fixture.path) } catch {}
  }
  if (originalBuildId === null) {
    try { fs.unlinkSync(buildIdPath) } catch {}
  } else {
    fs.writeFileSync(buildIdPath, originalBuildId)
  }
}

let child
let log = ''

try {
  for (const fixture of fixtures) {
    fs.writeFileSync(fixture.path, fixture.source, 'utf8')
  }

  child = spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  child.stdout.on('data', (chunk) => { log += chunk.toString() })
  child.stderr.on('data', (chunk) => { log += chunk.toString() })

  const baseUrl = await waitForViteUrl(() => log)
  const failures = []
  const results = {}

  for (const route of requiredRoutes) {
    const result = await request(`${baseUrl}${route}`, routeTimeoutMs.get(route) ?? 30000)
    results[route] = result
    if (!result.ok) failures.push({ route, result })
  }

  console.log(JSON.stringify({ baseUrl, results }, null, 2))
  if (failures.length > 0) {
    console.error(stripAnsi(log).split(/\r?\n/).slice(-80).join('\n'))
    throw new Error(`Vite renderer resolution smoke failed: ${JSON.stringify(failures)}`)
  }
} finally {
  killTree(child)
  restoreFiles()
}
