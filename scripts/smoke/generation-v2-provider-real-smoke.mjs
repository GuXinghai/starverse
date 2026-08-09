import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const entryPath = path.join(repoRoot, 'scripts', 'smoke', 'generation-v2-real-smoke-main-wrapper.mjs')
const host = '127.0.0.1'
const port = Number.parseInt(process.env.SV_GENERATION_V2_REAL_SMOKE_PORT ?? '5196', 10)
const viteUrl = `http://${host}:${port}/`
const provider = String(process.env.SV_GENERATION_V2_REAL_SMOKE_PROVIDER ?? '').trim()
const modelId = String(process.env.SV_GENERATION_V2_REAL_SMOKE_MODEL ?? '').trim()
const errorModelId = String(process.env.SV_GENERATION_V2_REAL_SMOKE_ERROR_MODEL ?? 'starverse-invalid-model-for-error-witness').trim()
const appDataDir = String(process.env.SV_GENERATION_V2_REAL_SMOKE_APP_DATA_DIR ?? '').trim()
const scenarios = String(process.env.SV_GENERATION_V2_REAL_SMOKE_SCENARIOS ?? 'ordinary,reasoning,tool,tool_continuation,abort')
  .split(',').map((value) => value.trim()).filter(Boolean)
const maxRequests = 5
const artifactRoot = path.join(repoRoot, '.artifacts', 'generation-v2-real-smoke')
const artifactPath = path.join(artifactRoot, `${provider || 'unknown'}-matrix.json`)

const PROVIDERS = Object.freeze({
  deepseek: Object.freeze({ bridge: 'deepSeek', credential: 'deepSeek', endpoint: 'deepseek-stable-api-v1' }),
  openrouter: Object.freeze({ bridge: 'openRouterChat', credential: 'openRouter', endpoint: 'openrouter-chat-v1' }),
  openai_responses: Object.freeze({ bridge: 'openAIResponses', credential: 'openAIResponses', endpoint: 'openai-api-v1' }),
  google_ai_studio: Object.freeze({ bridge: 'geminiGenerateContent', credential: 'googleAIStudio', endpoint: 'gemini-generate-content-v1' }),
  anthropic_messages: Object.freeze({ bridge: 'anthropic', credential: 'anthropic', endpoint: 'anthropic-messages-v1' }),
})

function once(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function safeCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim() } catch { return 'unavailable' }
}
function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[A-Za-z]:[\\/][^\s"'<>)]*/g, '<absolute-path-redacted>').slice(0, 1024)
}
function spawnVite() {
  return spawn(process.execPath, [path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--config', path.join(repoRoot, 'scripts', 'smoke', 'vite.renderer-smoke.config.ts'),
    '--host', host, '--port', String(port), '--strictPort', '--logLevel', 'warn'], {
    cwd: repoRoot, env: { ...process.env, NODE_ENV: 'development', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
}
async function waitForVite() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try { if ((await fetch(viteUrl, { cache: 'no-store' })).ok) return } catch { /* retry */ }
    await once(250)
  }
  throw new Error('GENERATION_V2_REAL_SMOKE_VITE_UNAVAILABLE')
}
async function waitForPage(app) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      try {
        if (await page.evaluate(() => Boolean(window.generationV2 && document.querySelector('#app')))) return page
      } catch { /* renderer is still loading */ }
    }
    await once(250)
  }
  throw new Error('GENERATION_V2_REAL_SMOKE_RENDERER_UNAVAILABLE')
}
async function closeChild(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    child.once('exit', resolve)
    try {
      if (process.platform === 'win32') execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      else child.kill()
    } catch { child.kill() }
    setTimeout(resolve, 3_000).unref()
  })
}
async function writeArtifact(value) {
  await fs.mkdir(artifactRoot, { recursive: true })
  await fs.writeFile(artifactPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
function unwrap(value) {
  if (!value || value.ok !== true) throw new Error(value?.code ?? 'GENERATION_V2_REAL_SMOKE_IPC_FAILED')
  return value.value ?? value
}
function providerBridgeExpression(providerKey) {
  const entry = PROVIDERS[providerKey]
  if (!entry) throw new Error(`GENERATION_V2_REAL_SMOKE_PROVIDER_UNSUPPORTED:${providerKey}`)
  return entry.bridge
}

async function launch(vite, stderrCodes, stderrLines) {
  const app = await electron.launch({ executablePath: require('electron'), args: [entryPath], cwd: repoRoot,
    env: { ...process.env, ...(appDataDir ? { SV_GENERATION_V2_REAL_SMOKE_APP_DATA_DIR: appDataDir } : {}),
      NODE_ENV: 'development', VITE_DEV_SERVER_URL: viteUrl, SV_GENERATION_V2_REAL_SMOKE: '1', FORCE_COLOR: '0' }, timeout: 180_000 })
  app.process().stderr?.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/u).map((value) => value.trim()).filter(Boolean)) {
      if (stderrLines.length < 80 && /(?:GENERATION|provider-fetch|fetch failed|EPOCH2|credential|proxy)/iu.test(line)) stderrLines.push(sanitizeError(line).slice(0, 1024))
    }
    for (const match of String(chunk).matchAll(/\[provider-fetch\] ([A-Z][A-Z0-9_]{1,127})/gu)) {
      if (!stderrCodes.includes(match[1])) stderrCodes.push(match[1])
    }
  })
  const page = await waitForPage(app)
  return { app, page }
}

async function installToolFixture(app) {
  return app.evaluate(({ app }) => {
    const pathModule = process.getBuiltinModule('node:path')
    const crypto = process.getBuiltinModule('node:crypto')
    const { createRequire } = process.getBuiltinModule('node:module')
    const requireFromApp = createRequire(pathModule.join(process.cwd(), 'package.json'))
    const BetterSqlite3 = requireFromApp('better-sqlite3')
    const dbPath = pathModule.join(app.getPath('userData'), 'workspace', 'epoch-2', 'starverse.db')
    const db = new BetterSqlite3(dbPath, { fileMustExist: true })
    try {
      const sortJson = (value) => {
        if (Array.isArray(value)) return value.map(sortJson)
        if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]))
        return value
      }
      const registry = { schemaVersion: 2, definitions: [{ toolId: 'tool:weather', kind: 'function', function: {
        name: 'get_weather', description: 'Return a fictional weather reading.', strict: true,
        parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false },
      }, sideEffectPolicy: 'none' }] }
      const canonicalJson = JSON.stringify(sortJson(registry))
      const digest = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex')
      const revision = `tool-registry-v2:${digest}`
      const existing = db.prepare("SELECT registry_revision AS revision FROM tool_registry_head_v2 WHERE singleton_id='current'").get()
      if (!existing) {
        const now = Date.now()
        db.pragma('foreign_keys = ON')
        const tx = db.transaction(() => {
          db.prepare(`INSERT INTO tool_registry_revision_v2 (registry_revision, definitions_digest, definitions_json, created_at_ms)
            VALUES (?, ?, ?, ?)`).run(revision, digest, canonicalJson, now)
          db.prepare(`INSERT INTO tool_registry_head_v2 (singleton_id, registry_revision, updated_at_ms) VALUES ('current', ?, ?)`).run(revision, now)
        })
        tx.immediate()
      }
      const head = db.prepare("SELECT registry_revision AS revision FROM tool_registry_head_v2 WHERE singleton_id='current'").get()
      return { installed: !existing, revision: typeof head?.revision === 'string' ? head.revision : null }
    } finally { db.close() }
  })
}

async function main() {
  const config = PROVIDERS[provider]
  if (!config || !modelId || !appDataDir) {
    const result = { schemaVersion: 1, commit: safeCommit(), provider, modelId: modelId || null,
      result: 'NOT_RUN_PROVIDER_MODEL_OR_APPDATA_MISSING', requestLimit: maxRequests }
    await writeArtifact(result); process.stdout.write(`${JSON.stringify(result)}\n`); return
  }
  const vite = spawnVite()
  const stderrCodes = []
  const stderrLines = []
  let app
  let page
  let restartObserved = null
  const requestKinds = []
  try {
    await waitForVite();
    ({ app, page } = await launch(vite, stderrCodes, stderrLines))
    const fixture = scenarios.some((item) => item === 'tool' || item === 'tool_continuation') ? await installToolFixture(app) : null
    const result = await page.evaluate(async ({ providerKey, bridgeName, modelIdValue, errorModelIdValue, scenarioList, limit }) => {
      const api = window.generationV2
      const unwrapRenderer = (value) => {
        if (!value || value.ok !== true) throw new Error(value?.code ?? 'GENERATION_V2_REAL_SMOKE_IPC_FAILED')
        return value.value
      }
      const bridge = providerKey === 'openrouter'
        ? api?.openRouter?.chat
        : providerKey === 'google_ai_studio'
          ? api?.gemini?.generateContent
          : api?.[bridgeName]
      const credential = api?.credentials?.[{
        deepseek: 'deepSeek', openrouter: 'openRouter', openai_responses: 'openAIResponses',
        google_ai_studio: 'googleAIStudio', anthropic_messages: 'anthropic',
      }[providerKey]]
      if (!api?.workspace || !bridge || !credential) throw new Error('GENERATION_V2_REAL_SMOKE_BRIDGE_UNAVAILABLE')
      const requestKinds = []
      const calls = { count: 0 }
      const nextOperation = (kind) => {
        if (calls.count >= limit) throw new Error('GENERATION_V2_REAL_SMOKE_REQUEST_LIMIT_EXCEEDED')
        calls.count += 1; requestKinds.push(kind)
        return `real-smoke:${providerKey}:${kind}:${crypto.randomUUID()}`
      }
      const waitTerminal = (operationId, timeoutMs = 300_000) => new Promise((resolve, reject) => {
        let stop = () => undefined
        const timeout = setTimeout(() => { stop(); reject(new Error('GENERATION_V2_REAL_SMOKE_TERMINAL_TIMEOUT')) }, timeoutMs)
        stop = bridge.onProjection((projection) => {
          if (projection?.type !== 'terminal' || projection.operationId !== operationId) return
          clearTimeout(timeout); stop(); resolve(projection)
        })
      })
      const readState = async (branchId) => {
        const view = unwrapRenderer(await api.workspace.readBranch(branchId))
        const turn = view.turns.at(-1)
        const answer = turn?.answers?.find((item) => item.answerRootId === turn.chosenAnswerRootId) ?? turn?.answers?.at(-1)
        return { view, turn, answer }
      }
      const readProviderErrorFacts = async (answerRootId) => {
        if (!answerRootId || !window.rawGenerationDebug?.listProviderErrorsByAnswerRootId) return []
        const rows = await window.rawGenerationDebug.listProviderErrorsByAnswerRootId(answerRootId)
        return (Array.isArray(rows) ? rows : []).map((row) => {
          let providerError = null
          if (typeof row.payloadText === 'string') {
            try {
              const parsed = JSON.parse(row.payloadText)
              const error = parsed && typeof parsed === 'object' && parsed.error && typeof parsed.error === 'object' ? parsed.error : parsed
              if (error && typeof error === 'object') providerError = {
                code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : null,
                type: typeof error.type === 'string' ? error.type : null,
                message: typeof error.message === 'string' ? error.message.slice(0, 1024) : null,
                param: typeof error.param === 'string' ? error.param : null,
              }
            } catch { /* keep providerError null for non-JSON payloads */ }
          }
          return { phase: row.phase, httpStatus: row.httpStatus, contentType: row.contentType,
            providerRequestId: row.providerRequestId, payloadBytes: row.payloadBytes, payloadSha256: row.payloadSha256, providerError }
        })
      }
      const updateConfig = async (conversationId, update) => {
        const current = unwrapRenderer(await api.workspace.getConfig('conversation', conversationId))
        return unwrapRenderer(await api.workspace.updateConfig({ ownerKind: 'conversation', ownerId: conversationId,
          expectedConfigRevision: current.configRevision, semanticLayer: update }))
      }
      const runInitial = async (conversation, body, model, kind) => {
        const operationId = nextOperation(kind)
        const terminalPromise = waitTerminal(operationId)
        const committed = await bridge.initial({ operationId, branchId: conversation.branchId,
          expectedHeadMessageId: conversation.headMessageId ?? null, userBody: body, modelId: model, commandAttachments: [] })
        if (committed?.ok !== true) {
          const state = await readState(conversation.branchId)
          return { operationId, committed, terminal: { state: 'commit_failed', errorCode: committed?.code ?? null }, ...state,
            providerErrorFacts: await readProviderErrorFacts(state.answer?.answerRootId ?? null) }
        }
        const terminal = await terminalPromise.catch((error) => ({ state: 'wait_failed', errorMessage: String(error) }))
        const finalState = await readState(conversation.branchId)
        return { operationId, committed, terminal, ...finalState,
          providerErrorFacts: await readProviderErrorFacts(finalState.answer?.answerRootId ?? null) }
      }
      const runAction = async (action, conversation, state) => {
        const operationId = nextOperation(action)
        const targetAnswer = state.answer?.answerRootId
        const questionId = state.turn?.questionId
        if (!targetAnswer || !questionId) throw new Error(`GENERATION_V2_REAL_SMOKE_ACTION_TARGET_MISSING:${action}`)
        const terminalPromise = waitTerminal(operationId)
        let committed
        if (action === 'retry') committed = await bridge.retry({ actionKind: 'retry_as_new', operationId, branchId: conversation.branchId,
          questionId, sourceAnswerId: targetAnswer, expectedHeadMessageId: targetAnswer })
        else if (action === 'regenerate') committed = await bridge.regenerate({ operationId, branchId: conversation.branchId,
          questionId, expectedHeadMessageId: targetAnswer, modelId: modelIdValue, commandAttachments: [] })
        else if (action === 'edit_resend') committed = await bridge.editResend({ operationId, mode: 'replace', branchId: conversation.branchId,
          sourceQuestionId: questionId, sourceAnswerRootId: targetAnswer, expectedHeadMessageId: targetAnswer,
          userBody: 'Starverse real smoke edited resend. Reply exactly: EDIT_OK.', modelId: modelIdValue, commandAttachments: [] })
        else throw new Error(`GENERATION_V2_REAL_SMOKE_ACTION_UNSUPPORTED:${action}`)
        if (committed?.ok !== true) {
          const nextState = await readState(conversation.branchId)
          return { operationId, committed, terminal: { state: 'commit_failed', errorCode: committed?.code ?? null }, ...nextState,
            providerErrorFacts: await readProviderErrorFacts(nextState.answer?.answerRootId ?? null) }
        }
        const terminal = await terminalPromise.catch((error) => ({ state: 'wait_failed', errorMessage: String(error) }))
        const finalState = await readState(conversation.branchId)
        return { operationId, committed, terminal, ...finalState,
          providerErrorFacts: await readProviderErrorFacts(finalState.answer?.answerRootId ?? null) }
      }
      const credentialStatus = await credential.getStatus()
      const credentialReveal = await credential.reveal()
      const observed = { credential: { ok: credentialStatus?.ok === true, configured: credentialStatus?.status?.apiKeyConfigured === true,
        revision: credentialStatus?.status?.revision ?? null, leaseAvailable: credentialReveal?.ok === true },
        proxy: await window.networkProxy?.getSettings?.(), actions: [] }
      if (observed.credential?.ok !== true || observed.credential?.configured !== true || observed.credential?.leaseAvailable !== true) throw new Error('GENERATION_V2_REAL_SMOKE_CREDENTIAL_MISSING')
      const workspace = unwrapRenderer(await api.workspace.ensureDefault())
      const conversation = unwrapRenderer(await api.workspace.createConversation(workspace.projectId, `Generation V2 ${providerKey} real smoke`))
      let current = { headMessageId: null, turn: null, answer: null }
      try {
        for (const action of scenarioList) {
          if (action === 'restart') continue
          if (action === 'ordinary') {
            await updateConfig(conversation.conversationId, providerKey === 'google_ai_studio'
              ? { schemaVersion: 2, generation: { candidateCount: 1 }, providerExtension: {
                kind: 'gemini_generate_content', thinkingMode: 'provider_default', includeThoughts: 'provider_default',
              } }
              : providerKey === 'anthropic_messages'
                ? { schemaVersion: 2, generation: { maxOutputTokens: 256 }, providerExtension: {
                  kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'model_recommended',
                } }
                : { schemaVersion: 2, generation: { candidateCount: 1 } })
            const value = await runInitial({ ...conversation, headMessageId: current.headMessageId }, 'Starverse real smoke ordinary text. Reply exactly: OK.', modelIdValue, action)
            current = { headMessageId: value.answer?.answerRootId ?? current.headMessageId, ...value }; observed.actions.push({ kind: action, state: value.terminal?.state, errorCode: value.terminal?.errorCode ?? value.committed?.code ?? null, providerErrorFacts: value.providerErrorFacts ?? [], answerRootId: value.answer?.answerRootId ?? null, operationId: value.operationId, committed: value.committed?.ok === true })
          } else if (action === 'reasoning') {
            const reasoning = providerKey === 'openai_responses'
              ? { mode: 'enabled', effort: 'max', summary: 'auto' }
              : { mode: 'enabled', effort: 'high' }
            const semantic = providerKey === 'openai_responses'
              ? { schemaVersion: 2, generation: {}, reasoning, providerExtension: { kind: 'openai_responses', reasoningMode: 'pro', reasoningContext: 'all_turns' } }
              : { schemaVersion: 2, generation: {}, reasoning }
            await updateConfig(conversation.conversationId, semantic)
            const value = await runInitial({ ...conversation, headMessageId: current.headMessageId }, 'Starverse real smoke reasoning. Return one short sentence.', modelIdValue, action)
            current = { headMessageId: value.answer?.answerRootId ?? current.headMessageId, ...value }; observed.actions.push({ kind: action, state: value.terminal?.state, errorCode: value.terminal?.errorCode ?? value.committed?.code ?? null, providerErrorFacts: value.providerErrorFacts ?? [], answerRootId: value.answer?.answerRootId ?? null, operationId: value.operationId, committed: value.committed?.ok === true })
          } else if (action === 'tool') {
            await updateConfig(conversation.conversationId, { schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, tools: { mode: 'enabled', allowedToolIds: ['tool:weather'], toolChoice: { mode: 'named', toolId: 'tool:weather' }, sideEffectConfirmation: 'required_each_retry' } })
            const value = await runInitial({ ...conversation, headMessageId: current.headMessageId }, 'Call get_weather for Shanghai, then tell me the result.', modelIdValue, action)
            current = { headMessageId: value.answer?.answerRootId ?? current.headMessageId, ...value }; observed.actions.push({ kind: action, state: value.terminal?.state, errorCode: value.terminal?.errorCode ?? value.committed?.code ?? null, answerRootId: value.answer?.answerRootId ?? null, operationId: value.operationId, committed: value.committed?.ok === true, body: value.answer?.body?.slice(0, 128) ?? '' })
          } else if (action === 'tool_continuation') {
            if (!current.answer?.answerRootId) throw new Error('GENERATION_V2_REAL_SMOKE_TOOL_ANSWER_MISSING')
            const operationId = nextOperation(action)
            const terminalPromise = waitTerminal(operationId)
            const continued = await bridge.continueTool?.({ operationId, branchId: conversation.branchId, answerRootId: current.answer.answerRootId,
              expectedHeadMessageId: current.answer.answerRootId, priorRequestSequence: 1,
              toolOutputs: [{ toolCallId: 'call:weather', content: '{"temperature":25,"unit":"C"}', userConfirmedExternalSideEffect: false }] })
            const terminal = continued?.ok === true
              ? await terminalPromise.catch((error) => ({ state: 'wait_failed', errorMessage: String(error) }))
              : { state: 'commit_failed', errorCode: continued?.code ?? null }
            const value = { operationId, committed: continued, terminal, ...(await readState(conversation.branchId)) }
            current = { headMessageId: value.answer?.answerRootId ?? current.headMessageId, ...value }; observed.actions.push({ kind: action, state: value.terminal?.state, errorCode: value.terminal?.errorCode ?? value.committed?.code ?? null, answerRootId: value.answer?.answerRootId ?? null, operationId: value.operationId, committed: value.committed?.ok === true })
          } else if (action === 'abort') {
            const operationId = nextOperation(action)
            const terminalPromise = waitTerminal(operationId)
            const committedPromise = bridge.initial({ operationId, branchId: conversation.branchId,
              expectedHeadMessageId: current.headMessageId ?? null, userBody: 'Starverse abort smoke. Reply with a long answer.', modelId: modelIdValue, commandAttachments: [] })
            const abort = await bridge.abort(operationId)
            const committed = await committedPromise
            const terminal = committed?.ok === true
              ? await terminalPromise.catch((error) => ({ state: 'wait_failed', errorMessage: String(error) }))
              : { state: 'commit_failed', errorCode: committed?.code ?? null }
            observed.actions.push({ kind: action, state: terminal?.state, operationId, committed: committed?.ok === true, abort: abort?.aborted === true })
          } else if (action === 'provider_error') {
            const operationId = nextOperation(action)
            const committed = await bridge.initial({ operationId, branchId: conversation.branchId,
              expectedHeadMessageId: current.headMessageId ?? null, userBody: 'Starverse provider error smoke.', modelId: errorModelIdValue, commandAttachments: [] })
            observed.actions.push({ kind: action, committed: committed?.ok === true, errorCode: committed?.code ?? null })
          } else if (action === 'retry' || action === 'regenerate' || action === 'edit_resend') {
            const value = await runAction(action, conversation, current)
            current = { headMessageId: value.answer?.answerRootId ?? current.headMessageId, ...value }; observed.actions.push({ kind: action, state: value.terminal?.state, answerRootId: value.answer?.answerRootId ?? null, operationId: value.operationId, committed: value.committed?.ok === true })
          } else throw new Error(`GENERATION_V2_REAL_SMOKE_SCENARIO_UNSUPPORTED:${action}`)
        }
        const finalState = await readState(conversation.branchId)
        return { conversationId: conversation.conversationId, branchId: conversation.branchId, credential: observed.credential, actions: observed.actions,
          finalHeadMessageId: finalState.view.headMessageId, requestCount: calls.count, requestKinds, proxyMode: observed.proxy?.settings?.proxyMode ?? null }
      } finally {
        await api.workspace.deleteConversation(conversation.conversationId).catch(() => undefined)
      }
    }, { providerKey: provider, bridgeName: providerBridgeExpression(provider), modelIdValue: modelId, errorModelIdValue: errorModelId,
      scenarioList: scenarios, limit: maxRequests })
    requestKinds.push(...(result.requestKinds ?? []))
    const resultObject = { schemaVersion: 1, commit: safeCommit(), provider, modelId,
      requestLimit: maxRequests, scenarioPlan: scenarios, fixture,
      result: result.requestCount <= maxRequests && result.actions.every((action) => action.kind === 'provider_error'
        ? action.committed !== true && typeof action.errorCode === 'string'
        : action.committed === true && action.state === 'completed') ? 'PASS' : 'FAIL_MATRIX',
      observed: { ...result, requestKinds: result.requestKinds, providerFetchDiagnostics: stderrCodes, stderrTail: stderrLines } }
    await writeArtifact(resultObject)
    process.stdout.write(`${JSON.stringify(resultObject)}\n`)
  } catch (error) {
    const resultObject = { schemaVersion: 1, commit: safeCommit(), provider, modelId, requestLimit: maxRequests,
      scenarioPlan: scenarios, result: 'FAIL', error: sanitizeError(error), errorStack: sanitizeError(error?.stack ?? ''), providerFetchDiagnostics: stderrCodes, stderrTail: stderrLines,
      requestKinds, restartObserved }
    await writeArtifact(resultObject); process.stderr.write(`${JSON.stringify(resultObject)}\n`); process.exitCode = 1
  } finally {
    await app?.close().catch(() => undefined)
    await closeChild(vite)
  }
}

main().catch((error) => { process.stderr.write(`GENERATION_V2_PROVIDER_REAL_SMOKE_FAILED:${sanitizeError(error)}\n`); process.exit(1) })
