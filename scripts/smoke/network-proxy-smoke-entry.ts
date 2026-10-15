import { app, BrowserWindow, WebContentsView, ipcMain, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createProductNetworkProxyV2Controller } from '../../electron/net/productNetworkProxyV2'
import { applySessionRequestPolicy } from '../../electron/net/sessionRequestPolicy'
import { isTrustedProxyIpcSender, registerNetworkProxyIpc } from '../../electron/ipc/networkProxyIpc'
import { DEFAULT_NETWORK_PROXY_SETTINGS, type NetworkProxyConfiguration } from '../../src/shared/plugin-distribution/networkProxyShared'

const root = process.env.SV_PROXY_SMOKE_ROOT!
if (!root || !path.isAbsolute(root)) throw new Error('PROXY_SMOKE_PROFILE_REQUIRED')
for (const key of ['appData', 'userData', 'sessionData'] as const) {
  const directory = path.join(root, key)
  fs.mkdirSync(directory, { recursive: true })
  app.setPath(key, directory)
}
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('host-resolver-rules', 'MAP *.proxy.test 127.0.0.1')
// Fixture-only trust for this run's generated key; all other invalid certificates still fail.
app.commandLine.appendSwitch('ignore-certificate-errors-spki-list', process.env.SV_PROXY_SMOKE_SPKI!)
const servers: (http.Server | https.Server | net.Server)[] = []
const sockets = new Set<net.Socket>()
const records: { route: string; url: string }[] = []
const track = (socket: net.Socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); return socket }
async function listen(server: http.Server | https.Server | net.Server) {
  servers.push(server)
  server.on('connection', track)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as net.AddressInfo).port
}
const manual = (port: number, scheme = 'http', noProxy = '') => ({ proxyMode: 'manual' as const, manualProxyUrl: `${scheme}://127.0.0.1:${port}`, noProxy, strictSSL: true })
const waitFor = async (predicate: () => boolean) => {
  const until = Date.now() + 5000
  while (!predicate()) { if (Date.now() > until) throw new Error('PROXY_SMOKE_WAIT_TIMEOUT'); await new Promise((resolve) => setTimeout(resolve, 10)) }
}

void app.whenReady().then(async () => {
console.log('[network-proxy-smoke] Electron ready')
try {
  const require = createRequire(path.join(process.env.SV_PROXY_SMOKE_REPO!, 'package.json'))
  const Database = require('better-sqlite3')
  const database = new Database(':memory:')
  assert.equal(database.prepare('SELECT 1 AS value').get().value, 1)
  database.close()
  console.log('[network-proxy-smoke] native ABI verified', process.versions.modules)
  const origin = await listen(http.createServer((req, res) => {
    records.push({ route: 'origin', url: req.url ?? '' })
    res.end('<html><head><link rel="icon" href="data:,"></head><body>proxy fixture</body></html>')
  }))
  const makeTls = (name: string) => https.createServer({ key: fs.readFileSync(path.join(root, `${name}.key`)), cert: fs.readFileSync(path.join(root, `${name}.crt`)) }, (_req, res) => res.end('tls fixture'))
  const tlsPort = await listen(makeTls('trusted'))
  const badTlsPort = await listen(makeTls('untrusted'))
  async function proxy(route: string) {
    const server = http.createServer((req, res) => {
      records.push({ route, url: req.url ?? '' })
      const url = new URL(req.url!)
      if (url.hostname !== 'target.proxy.test' || Number(url.port) !== origin) { res.writeHead(403).end(); return }
      const upstream = http.request({ hostname: '127.0.0.1', port: origin, path: url.pathname, method: req.method }, (response) => {
        res.writeHead(response.statusCode!, response.headers); response.pipe(res)
      })
      upstream.on('error', () => res.destroy())
      req.pipe(upstream)
    })
    server.on('connect', (req, client, head) => {
      records.push({ route, url: `CONNECT ${req.url}` })
      const [host, port] = req.url!.split(':')
      if (host !== 'target.proxy.test' || ![origin, tlsPort, badTlsPort].includes(Number(port))) { client.destroy(); return }
      const upstream = track(net.connect(Number(port), '127.0.0.1', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        client.pipe(upstream); upstream.pipe(client)
      }))
      upstream.on('error', () => client.destroy())
      client.on('error', () => upstream.destroy())
    })
    return listen(server)
  }
  const a = await proxy('A')
  const b = await proxy('B')
  console.log('[network-proxy-smoke] HTTP/TLS fixtures ready')
  const socks = await listen(net.createServer((client) => {
    let phase = 0
    let buffer = Buffer.alloc(0)
    const consume = (data: Buffer) => {
      buffer = Buffer.concat([buffer, data])
      if (phase === 0) {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return
        buffer = buffer.subarray(2 + buffer[1]); client.write(Buffer.from([5, 0])); phase = 1
      }
      if (phase !== 1 || buffer.length < 5) return
      const length = buffer[3] === 3 ? buffer[4] : 4
      const offset = buffer[3] === 3 ? 5 : 4
      if (buffer.length < offset + length + 2) return
      const host = buffer[3] === 3 ? buffer.subarray(offset, offset + length).toString() : [...buffer.subarray(offset, offset + length)].join('.')
      const port = buffer.readUInt16BE(offset + length)
      if (host !== 'target.proxy.test' || ![origin, tlsPort].includes(port)) { client.destroy(); return }
      records.push({ route: 'SOCKS5', url: `${host}:${port}` })
      phase = 2; client.removeListener('data', consume)
      const remaining = buffer.subarray(offset + length + 2)
      const upstream = track(net.connect(port, '127.0.0.1', () => {
        client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]))
        if (remaining.length) upstream.write(remaining)
        client.pipe(upstream); upstream.pipe(client)
      }))
      upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy())
    }
    client.on('data', consume)
  }))
  const storeValues: Record<string, unknown> = {}
  const store = { get: (key: string) => storeValues[key], set: (key: string | Record<string, unknown>, value?: unknown) => {
    if (typeof key === 'string') storeValues[key] = value
    else Object.assign(storeValues, key)
  } }
  const application = session.defaultSession
  const browser = session.fromPartition('persist:intra-links')
  const env: Record<string, string> = {}
  const controller = createProductNetworkProxyV2Controller({ store: store as any, session: application, browserSession: browser, env: () => env })
  applySessionRequestPolicy(browser, () => controller.getState('browser').status === 'ready')
  // No browser network operation is allowed before initialization.
  await assert.rejects(() => browser.fetch(`http://target.proxy.test:${origin}/early`))
  console.log('[network-proxy-smoke] startup gate checked')
  assert.equal(records.length, 0)
  await controller.applyStoredSettings()
  const baseline: NetworkProxyConfiguration = { application: manual(a), browser: { mode: 'inherit', settings: manual(b) } }
  assert.equal((await controller.updateConfiguration(baseline)).ok, true)
  await application.fetch(`http://target.proxy.test:${origin}/application`).then((r) => r.text())
  const preload = path.join(root, 'proxy-smoke-preload.cjs')
  fs.writeFileSync(preload, "const {contextBridge,ipcRenderer}=require('electron'); contextBridge.exposeInMainWorld('proxySmoke', {configuration:()=>ipcRenderer.invoke('network-proxy:get-configuration')});")
  const window = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true } })
  registerNetworkProxyIpc({ controller, registerInvoke: (channel, handler) => ipcMain.handle(channel, handler),
    authorize: (event) => isTrustedProxyIpcSender(event, window.webContents) })
  await window.loadURL('data:text/html,<html>proxy smoke</html>')
  assert.equal((await window.webContents.executeJavaScript('window.proxySmoke.configuration()')).ok, true)
  const view = new WebContentsView({ webPreferences: { session: browser, sandbox: true, nodeIntegration: false } })
  window.contentView.addChildView(view)
  await view.webContents.loadURL(`http://target.proxy.test:${origin}/browser-follow`)
  assert(records.some((r) => r.route === 'A' && r.url.endsWith('/application')))
  assert(records.some((r) => r.route === 'A' && r.url.endsWith('/browser-follow')))
  console.log('[network-proxy-smoke] application/browser follow checked')
  await controller.updateConfiguration({ ...baseline, browser: { mode: 'independent', settings: manual(b) } })
  await view.webContents.loadURL(`http://target.proxy.test:${origin}/browser-independent`)
  assert(records.some((r) => r.route === 'B' && r.url.endsWith('/browser-independent')))
  console.log('[network-proxy-smoke] independent browser checked')
  await application.fetch(`https://target.proxy.test:${tlsPort}/tls`).then((r) => r.text())
  assert(records.some((r) => r.route === 'A' && r.url === `CONNECT target.proxy.test:${tlsPort}`))
  await assert.rejects(() => application.fetch(`https://target.proxy.test:${badTlsPort}/bad-tls`))
  console.log('[network-proxy-smoke] HTTPS and TLS rejection checked')
  await controller.updateSettings(manual(socks, 'socks5'))
  await application.fetch(`http://target.proxy.test:${origin}/socks`).then((r) => r.text())
  await application.fetch(`https://target.proxy.test:${tlsPort}/socks-tls`).then((r) => r.text())
  assert(records.filter((r) => r.route === 'SOCKS5').length >= 2)
  console.log('[network-proxy-smoke] SOCKS5 checked')
  const beforeBypass = records.filter((r) => r.route !== 'origin').length
  await controller.updateSettings(manual(a, 'http', 'target.proxy.test'))
  await application.fetch(`http://target.proxy.test:${origin}/bypass`).then((r) => r.text())
  assert.equal(records.filter((r) => r.route !== 'origin').length, beforeBypass)
  env.ALL_PROXY = `http://127.0.0.1:${a}`
  await controller.updateSettings({ ...DEFAULT_NETWORK_PROXY_SETTINGS, proxyMode: 'environment' })
  await application.fetch(`http://target.proxy.test:${origin}/environment`).then((r) => r.text())
  assert(records.some((r) => r.route === 'A' && r.url.endsWith('/environment')))
  await controller.updateSettings({ ...DEFAULT_NETWORK_PROXY_SETTINGS, proxyMode: 'direct' })
  await application.fetch(`http://target.proxy.test:${origin}/direct`).then((r) => r.text())
  // Close a known port, then verify a failed proxy never reaches the direct target.
  const unavailable = net.createServer()
  const unavailablePort = await listen(unavailable)
  await new Promise<void>((resolve) => unavailable.close(() => resolve()))
  await controller.updateSettings(manual(unavailablePort))
  await assert.rejects(() => application.fetch(`http://target.proxy.test:${origin}/must-not-be-direct`))
  assert(!records.some((r) => r.route === 'origin' && r.url === '/must-not-be-direct'))
  await view.webContents.loadURL(`http://target.proxy.test:${origin}/independent-survives`)
  await waitFor(() => records.some((r) => r.route === 'B' && r.url.endsWith('/independent-survives')))
  window.destroy()
  console.log('[network-proxy-smoke] PASS', JSON.stringify({ checks: ['native-ABI', 'main-frame-IPC', 'startup-block', 'follow', 'independent', 'HTTP', 'HTTPS-CONNECT', 'TLS-rejection', 'SOCKS5-HTTP', 'SOCKS5-HTTPS', 'bypass', 'environment-ALL', 'direct', 'no-direct-fallback', 'failure-isolation'], recordedRequests: records.length }))
  app.exit(0)
} catch (error) {
  console.error('[network-proxy-smoke] FAIL', error)
  app.exit(1)
} finally {
  for (const socket of sockets) socket.destroy()
  for (const server of servers) server.close()
}
})
