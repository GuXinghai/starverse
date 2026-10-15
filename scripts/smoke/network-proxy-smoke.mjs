import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash, createPublicKey } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const tempRoot = path.resolve(os.tmpdir())
const profileRoot = fs.mkdtempSync(path.join(tempRoot, 'starverse-proxy-smoke-'))
const electronPath = createRequire(import.meta.url)('electron')
try {
  const openssl = process.env.OPENSSL_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : 'openssl')
  for (const name of ['trusted', 'untrusted']) {
    const generated = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', path.join(profileRoot, `${name}.key`), '-out', path.join(profileRoot, `${name}.crt`),
      '-days', '1', '-subj', '/CN=target.proxy.test', '-addext', 'subjectAltName=DNS:target.proxy.test'],
    { encoding: 'utf8', windowsHide: true, timeout: 15_000 })
    if (generated.error || generated.status !== 0) throw new Error(`PROXY_SMOKE_CERTIFICATE_FIXTURE_FAILED: ${generated.error?.code ?? generated.status}`)
  }
  const key = createPublicKey(fs.readFileSync(path.join(profileRoot, 'trusted.crt'))).export({ type: 'spki', format: 'der' })
  const spki = createHash('sha256').update(key).digest('base64')
  const bundled = await build({ entryPoints: [path.join(repositoryRoot, 'scripts/smoke/network-proxy-smoke-entry.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['electron'], write: false, logLevel: 'silent' })
  fs.writeFileSync(path.join(profileRoot, 'main.mjs'), bundled.outputFiles[0].text)
  fs.writeFileSync(path.join(profileRoot, 'package.json'), JSON.stringify({ name: 'starverse-proxy-smoke', main: 'main.mjs' }))
  const env = { ...process.env, SV_PROXY_SMOKE_ROOT: profileRoot, SV_PROXY_SMOKE_REPO: repositoryRoot, SV_PROXY_SMOKE_SPKI: spki }
  delete env.ELECTRON_RUN_AS_NODE
  const run = spawnSync(electronPath, [profileRoot], { cwd: repositoryRoot, env, encoding: 'utf8', windowsHide: true, timeout: 60_000 })
  if (run.stdout) process.stdout.write(run.stdout)
  if (run.stderr) process.stderr.write(run.stderr)
  if (run.error) throw run.error
  if (run.status !== 0 || !run.stdout.includes('[network-proxy-smoke] PASS')) throw new Error('NETWORK_PROXY_ELECTRON_SMOKE_FAILED')
} finally {
  const resolved = path.resolve(profileRoot)
  const relative = path.relative(tempRoot, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(resolved).startsWith('starverse-proxy-smoke-')) {
    throw new Error('PROXY_SMOKE_CLEANUP_PATH_INVALID')
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
