import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const mainPath = path.join(repoRoot, 'dist-electron', 'epoch2MainEntry.js')
const host = '127.0.0.1'
const port = Number.parseInt(process.env.SV_GENERATION_V2_REAL_SMOKE_PORT ?? '5189', 10)
const viteUrl = `http://${host}:${port}/`
const modelId = String(process.env.SV_GENERATION_V2_REAL_SMOKE_OPENROUTER_MODEL ?? '').trim()
const enabled = process.env.SV_GENERATION_V2_REAL_SMOKE_CONFIRM_PRODUCTION_USER_DATA === '1'
const requestedProxyMode = String(process.env.SV_GENERATION_V2_REAL_SMOKE_PROXY_MODE ?? '').trim()
const artifactRoot = path.join(repoRoot, '.artifacts', 'generation-v2-real-smoke')
const artifactPath = path.join(artifactRoot, 'openrouter-chat-result.json')

function once(value) { return new Promise((resolve) => setTimeout(resolve, value)) }
function safeCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim() } catch { return 'unavailable' }
}
function fail(message) { throw new Error(message) }
function spawnVite() {
  return spawn(process.execPath, [path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', 'scripts/smoke/vite.renderer-smoke.config.ts', '--host', host, '--port', String(port), '--strictPort', '--logLevel', 'warn'], {
    cwd: repoRoot, env: { ...process.env, NODE_ENV: 'development', FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
}
async function waitForVite() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try { if ((await fetch(viteUrl, { cache: 'no-store' })).ok) return } catch { /* retry */ }
    await once(250)
  }
  fail('GENERATION_V2_REAL_SMOKE_VITE_UNAVAILABLE')
}
async function waitForPage(app) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      try {
        const ready = await page.evaluate(() => Boolean(window.generationV2 && document.querySelector('#app')))
        if (ready) return page
      } catch { /* renderer is still loading */ }
    }
    await once(250)
  }
  fail('GENERATION_V2_REAL_SMOKE_RENDERER_UNAVAILABLE')
}
function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[A-Za-z]:[\\/][^\s"'<>)]*/g, '<absolute-path-redacted>').slice(0, 512)
}
async function writeArtifact(value) {
  await fs.mkdir(artifactRoot, { recursive: true })
  await fs.writeFile(artifactPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
async function close(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    child.once('exit', resolve)
    try { process.platform === 'win32' ? execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) : child.kill() } catch { child.kill() }
    setTimeout(resolve, 3_000).unref()
  })
}

async function main() {
  const base = Object.freeze({ schemaVersion: 1, commit: safeCommit(), protocol: 'openrouter_chat_completions', profile: 'openrouter-first-party-v1',
    endpointHost: 'openrouter.ai', modelId: modelId || null, proxyMode: requestedProxyMode || null, securityPolicy: 'compatibility_first', stream: true })
  if (!enabled || !modelId) {
    const result = Object.freeze({ ...base, result: 'NOT_RUN_EXPLICIT_CONFIRMATION_OR_MODEL_MISSING' })
    await writeArtifact(result)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  if (requestedProxyMode !== 'system' && requestedProxyMode !== 'direct') {
    fail('GENERATION_V2_REAL_SMOKE_PROXY_MODE_REQUIRED')
  }
  try { await fs.access(mainPath) } catch { fail('GENERATION_V2_REAL_SMOKE_MAIN_BUILD_MISSING') }
  const vite = spawnVite()
  let app
  const transportDiagnostics = []
  try {
    await waitForVite()
    // Deliberately omit --user-data-dir: identity bootstrap selects the normal
    // Starverse product userData, where the main-process safe-storage record lives.
    app = await electron.launch({ executablePath: require('electron'), args: [mainPath], cwd: repoRoot,
      env: { ...process.env, NODE_ENV: 'development', VITE_DEV_SERVER_URL: viteUrl, SV_GENERATION_V2_REAL_SMOKE: '1', FORCE_COLOR: '0' }, timeout: 60_000 })
    app.process().stderr?.on('data', (chunk) => {
      for (const match of String(chunk).matchAll(/\[provider-fetch\] ([A-Z][A-Z0-9_]{1,127})/gu)) {
        if (!transportDiagnostics.includes(match[1])) transportDiagnostics.push(match[1])
      }
    })
    const page = await waitForPage(app)
    const observed = await page.evaluate(async ({ modelId, requestedProxyMode }) => {
      const unwrapRendererResult = (result) => {
        if (!result || result.ok !== true) throw new Error(result?.code ?? 'GENERATION_V2_REAL_SMOKE_IPC_FAILED')
        return result.value
      }
      const api = window.generationV2
      if (!api?.workspace || !api.openRouter?.chat || !api.credentials?.openRouter || !window.rawGenerationDebug || !window.networkProxy) throw new Error('GENERATION_V2_REAL_SMOKE_BRIDGE_UNAVAILABLE')
      const appliedProxy = await window.networkProxy.updateSettings({
        proxyMode: requestedProxyMode,
        manualProxyUrl: '',
        noProxy: '',
        strictSSL: true,
      })
      if (!appliedProxy?.ok || appliedProxy.settings?.proxyMode !== requestedProxyMode || appliedProxy.state?.status !== 'ready') {
        throw new Error(appliedProxy?.code ?? 'GENERATION_V2_REAL_SMOKE_PROXY_APPLY_FAILED')
      }
      const status = await api.credentials.openRouter.getStatus()
      if (!status?.ok || status.status?.apiKeyConfigured !== true) throw new Error('NOT_RUN_CREDENTIAL_MISSING')
      const proxy = await window.networkProxy?.getSettings?.()
      const workspace = unwrapRendererResult(await api.workspace.ensureDefault())
      const conversation = unwrapRendererResult(await api.workspace.createConversation(workspace.projectId, 'Generation V2 real smoke'))
      try {
        const config = unwrapRendererResult(await api.workspace.getConfig('conversation', conversation.conversationId))
        unwrapRendererResult(await api.workspace.updateConfig({ ownerKind: 'conversation', ownerId: conversation.conversationId,
          expectedConfigRevision: config.configRevision, semanticLayer: { schemaVersion: 2, generation: { maxOutputTokens: 32 } } }))
        const terminal = await new Promise((resolve, reject) => {
          const operationId = `real-smoke:openrouter:${crypto.randomUUID()}`
          const timeout = setTimeout(() => { stop(); reject(new Error('GENERATION_V2_REAL_SMOKE_TERMINAL_TIMEOUT')) }, 5 * 60_000)
          const stop = api.openRouter.chat.onProjection((projection) => {
            if (projection?.type === 'terminal' && projection.operationId === operationId) { clearTimeout(timeout); stop(); resolve(projection) }
          })
          void (async () => {
            try {
              const committed = await api.openRouter.chat.initial({ operationId, branchId: conversation.branchId, expectedHeadMessageId: null,
                userBody: 'Starverse Generation Compiler V2 smoke. Reply exactly: OK.', modelId, commandAttachments: [] })
              if (!committed?.ok) throw new Error(committed?.code ?? 'GENERATION_V2_REAL_SMOKE_COMMIT_FAILED')
            } catch (error) { clearTimeout(timeout); stop(); reject(error) }
          })()
        })
        const view = unwrapRendererResult(await api.workspace.readBranch(conversation.branchId))
        const lastTurn = view.turns.at(-1)
        const answer = lastTurn?.answers?.find((item) => item.chosen === true)
        if (!answer || answer.status !== terminal.state || answer.operationId !== terminal.operationId || view.headMessageId !== answer.answerRootId) {
          throw new Error('GENERATION_V2_REAL_SMOKE_PERSISTENCE_INVALID')
        }
        const raw = await window.rawGenerationDebug.listByAnswerRootId(answer.answerRootId)
        const request = Array.isArray(raw) ? raw.find((item) => item.requestSequence === 1) : null
        if (!request || typeof request.bodySha256 !== 'string' || typeof request.bodyBytes !== 'number') throw new Error('GENERATION_V2_REAL_SMOKE_RAW_REQUEST_MISSING')
        return { conversationId: conversation.conversationId,
          terminal: { state: terminal.state, errorCode: terminal.errorCode ?? null,
          errorMessage: typeof terminal.errorMessage === 'string' ? terminal.errorMessage.slice(0, 256) : null },
          answer: { answerRootId: answer.answerRootId, chosen: answer.chosen, status: answer.status, providerId: answer.providerId,
            modelId: answer.modelId, endpointProfileId: answer.endpointProfileId, protocolContractId: answer.protocolContractId },
          request: { bodySha256: request.bodySha256, bodyBytes: request.bodyBytes }, proxyMode: proxy?.settings?.proxyMode ?? null }
      } catch (error) {
        await api.workspace.deleteConversation(conversation.conversationId).catch(() => undefined)
        throw error
      }
    }, { modelId, requestedProxyMode })
    let persistedFinishReason = null
    try {
      if (observed.terminal.state === 'completed') {
        persistedFinishReason = await app.evaluate(({ app }, answerRootId) => {
          const path = process.getBuiltinModule('node:path')
          const { createRequire } = process.getBuiltinModule('node:module')
          const requireFromApp = createRequire(path.join(process.cwd(), 'package.json'))
          const BetterSqlite3 = requireFromApp('better-sqlite3')
          const db = new BetterSqlite3(path.join(app.getPath('userData'), 'workspace', 'epoch-2', 'starverse.db'), {
            readonly: true, fileMustExist: true,
          })
          try {
            const row = db.prepare(`SELECT artifact_json AS artifactJson FROM generation_native_artifact_v2
              WHERE answer_root_id=? AND request_sequence=1 AND artifact_kind='openrouter_chat_terminal_result_v1'`).get(answerRootId)
            if (!row || typeof row.artifactJson !== 'string') throw new Error('GENERATION_V2_REAL_SMOKE_TERMINAL_ARTIFACT_MISSING')
            const artifact = JSON.parse(row.artifactJson)
            if (typeof artifact.finishReason !== 'string') throw new Error('GENERATION_V2_REAL_SMOKE_FINISH_REASON_NOT_PERSISTED')
            return artifact.finishReason
          } finally { db.close() }
        }, observed.answer.answerRootId)
      }
    } finally {
      await page.evaluate(async (conversationId) => {
        await window.generationV2?.workspace?.deleteConversation(conversationId).catch(() => undefined)
      }, observed.conversationId)
    }
    const result = Object.freeze({ ...base, requestShapeHash: observed.request.bodySha256, requestBytes: observed.request.bodyBytes,
      proxyMode: observed.proxyMode, terminal: observed.terminal, answer: observed.answer, persistedFinishReason,
      result: observed.terminal.state === 'completed' && typeof persistedFinishReason === 'string'
        ? 'PASS' : 'FAIL_TERMINAL_NOT_COMPLETED' })
    await writeArtifact(result)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.result !== 'PASS') process.exitCode = 1
  } catch (error) {
    const result = Object.freeze({ ...base, result: 'FAIL', error: sanitizeError(error),
      transportDiagnostics: Object.freeze([...transportDiagnostics]) })
    await writeArtifact(result)
    process.stderr.write(`${JSON.stringify(result)}\n`)
    throw error
  } finally {
    await app?.close().catch(() => undefined)
    await close(vite)
  }
}

main().catch((error) => { process.stderr.write(`GENERATION_V2_REAL_SMOKE_FAILED:${sanitizeError(error)}\n`); process.exit(1) })
