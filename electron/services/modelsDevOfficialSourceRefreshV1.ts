import type BetterSqlite3 from 'better-sqlite3'
import {
  CanonicalModelFactSourceIngestionV1Service,
  canonicalModelsDevSourceScopeIdV1,
} from
  '../../infra/db/services/canonicalModelFactSourceIngestionV1Service'
import type { ProviderFetch } from '../net/providerHttpTransport'

export const MODELS_DEV_OFFICIAL_API_URL_V1 = 'https://models.dev/api.json' as const
export const MODELS_DEV_OFFICIAL_DISTRIBUTION_ID_V1 = 'models.dev-official-api' as const
export const MODELS_DEV_OFFICIAL_DISTRIBUTION_CHANNEL_V1 = MODELS_DEV_OFFICIAL_API_URL_V1
export const MODELS_DEV_OFFICIAL_RAW_RECORD_KEY_V1 = 'models-dev:api.json' as const
export const MODELS_DEV_OFFICIAL_DEFAULT_REFRESH_CADENCE_MS_V1 = 24 * 60 * 60 * 1_000
export const MODELS_DEV_OFFICIAL_MAX_RESPONSE_BYTES_V1 = 16 * 1024 * 1024

export type ModelsDevOfficialSourceRefreshResultV1 =
  | Readonly<{ ok: true; status: 'not_due' | 'refreshed'; canonicalSourceRevision: string | null }>
  | Readonly<{ ok: false; status: 'failed'; code: ModelsDevOfficialSourceRefreshFailureCodeV1 }>

export type ModelsDevOfficialSourceRefreshFailureCodeV1 =
  | 'MODELS_DEV_OFFICIAL_FETCH_FAILED'
  | 'MODELS_DEV_OFFICIAL_HTTP_INVALID'
  | 'MODELS_DEV_OFFICIAL_CONTENT_TYPE_INVALID'
  | 'MODELS_DEV_OFFICIAL_BODY_INVALID'
  | 'MODELS_DEV_OFFICIAL_BODY_TOO_LARGE'
  | 'MODELS_DEV_OFFICIAL_ENVELOPE_INVALID'
  | 'MODELS_DEV_OFFICIAL_PUBLICATION_FAILED'

type JsonRecord = Record<string, unknown>

function plainObject(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const parsed = Number(declaredLength)
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('MODELS_DEV_OFFICIAL_BODY_INVALID')
    if (parsed > MODELS_DEV_OFFICIAL_MAX_RESPONSE_BYTES_V1) {
      throw new Error('MODELS_DEV_OFFICIAL_BODY_TOO_LARGE')
    }
  }
  if (!response.body) throw new Error('MODELS_DEV_OFFICIAL_BODY_INVALID')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > MODELS_DEV_OFFICIAL_MAX_RESPONSE_BYTES_V1) {
        throw new Error('MODELS_DEV_OFFICIAL_BODY_TOO_LARGE')
      }
      chunks.push(next.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  if (size === 0) throw new Error('MODELS_DEV_OFFICIAL_BODY_INVALID')
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function failureCode(error: unknown): ModelsDevOfficialSourceRefreshFailureCodeV1 {
  const code = error instanceof Error ? error.message : ''
  if (code === 'MODELS_DEV_OFFICIAL_HTTP_INVALID' ||
      code === 'MODELS_DEV_OFFICIAL_CONTENT_TYPE_INVALID' ||
      code === 'MODELS_DEV_OFFICIAL_BODY_INVALID' ||
      code === 'MODELS_DEV_OFFICIAL_BODY_TOO_LARGE' ||
      code === 'MODELS_DEV_OFFICIAL_ENVELOPE_INVALID') return code
  return 'MODELS_DEV_OFFICIAL_PUBLICATION_FAILED'
}

export class ModelsDevOfficialSourceRefreshV1 {
  private readonly ingestion: CanonicalModelFactSourceIngestionV1Service
  private readonly sourceScopeId = canonicalModelsDevSourceScopeIdV1({
    distributionId: MODELS_DEV_OFFICIAL_DISTRIBUTION_ID_V1,
    distributionChannel: MODELS_DEV_OFFICIAL_DISTRIBUTION_CHANNEL_V1,
  })
  private inFlight: Promise<ModelsDevOfficialSourceRefreshResultV1> | null = null
  private activeController: AbortController | null = null
  private scheduledRefresh: ReturnType<typeof setTimeout> | null = null
  private started = false

  constructor(private readonly input: Readonly<{
    db: BetterSqlite3.Database
    fetchImpl: ProviderFetch
    nowMs?: () => number
    refreshCadenceMs?: number
    timeoutMs?: number
  }>) {
    this.ingestion = new CanonicalModelFactSourceIngestionV1Service(input.db, input.nowMs ?? Date.now)
  }

  refreshIfDue(): Promise<ModelsDevOfficialSourceRefreshResultV1> {
    if (this.inFlight) return this.inFlight
    const promise = this.refreshIfDueOnce().finally(() => {
      if (this.inFlight === promise) this.inFlight = null
    })
    this.inFlight = promise
    return promise
  }

  start(): Promise<ModelsDevOfficialSourceRefreshResultV1> {
    if (this.started) return this.refreshIfDue()
    this.started = true
    return this.runScheduledRefresh()
  }

  async dispose(): Promise<void> {
    this.started = false
    if (this.scheduledRefresh !== null) clearTimeout(this.scheduledRefresh)
    this.scheduledRefresh = null
    this.activeController?.abort()
    await this.inFlight?.catch(() => undefined)
  }

  private async runScheduledRefresh(): Promise<ModelsDevOfficialSourceRefreshResultV1> {
    try {
      return await this.refreshIfDue()
    } finally {
      if (this.started) this.scheduleNextRefresh()
    }
  }

  private scheduleNextRefresh(): void {
    if (this.scheduledRefresh !== null) clearTimeout(this.scheduledRefresh)
    const cadence = this.input.refreshCadenceMs ?? MODELS_DEV_OFFICIAL_DEFAULT_REFRESH_CADENCE_MS_V1
    const state = this.ingestion.sourceRepo.readSourceState('models_dev', this.sourceScopeId)
    const now = (this.input.nowMs ?? Date.now)()
    const delay = Math.max(1_000, (state?.lastAttemptedAtMs ?? now) + cadence - now)
    this.scheduledRefresh = setTimeout(() => {
      this.scheduledRefresh = null
      void this.runScheduledRefresh().catch(() => undefined)
    }, delay)
  }

  private async refreshIfDueOnce(): Promise<ModelsDevOfficialSourceRefreshResultV1> {
    const now = (this.input.nowMs ?? Date.now)()
    const cadence = this.input.refreshCadenceMs ?? MODELS_DEV_OFFICIAL_DEFAULT_REFRESH_CADENCE_MS_V1
    const state = this.ingestion.sourceRepo.configureRefresh({
      sourceKind: 'models_dev', sourceScopeId: this.sourceScopeId, refreshCadenceMs: cadence,
    })
    if (state.lastAttemptedAtMs !== null && now - state.lastAttemptedAtMs < cadence) {
      return Object.freeze({ ok: true, status: 'not_due',
        canonicalSourceRevision: state.currentSourceRevision })
    }

    let response: Response
    const controller = new AbortController()
    this.activeController = controller
    const timeout = setTimeout(() => controller.abort(), this.input.timeoutMs ?? 30_000)
    try {
      response = await this.input.fetchImpl(MODELS_DEV_OFFICIAL_API_URL_V1, {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { accept: 'application/json' },
      })
    } catch {
      clearTimeout(timeout)
      if (this.activeController === controller) this.activeController = null
      return this.fail(now, 'MODELS_DEV_OFFICIAL_FETCH_FAILED')
    }

    try {
      if (!response.ok) throw new Error('MODELS_DEV_OFFICIAL_HTTP_INVALID')
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (!contentType.startsWith('application/json')) {
        throw new Error('MODELS_DEV_OFFICIAL_CONTENT_TYPE_INVALID')
      }
      const bytes = await readBoundedBody(response)
      let payload: unknown
      try {
        payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      } catch {
        throw new Error('MODELS_DEV_OFFICIAL_BODY_INVALID')
      }
      if (!plainObject(payload)) throw new Error('MODELS_DEV_OFFICIAL_ENVELOPE_INVALID')
      const publication = this.ingestion.refreshModelsDev({
        distributionId: MODELS_DEV_OFFICIAL_DISTRIBUTION_ID_V1,
        distributionChannel: MODELS_DEV_OFFICIAL_DISTRIBUTION_CHANNEL_V1,
        rawEnvelope: { recordKey: MODELS_DEV_OFFICIAL_RAW_RECORD_KEY_V1, payload },
        fetchedAtMs: now,
        lastAttemptedAtMs: now,
      })
      return Object.freeze({ ok: true, status: 'refreshed',
        canonicalSourceRevision: publication.source.sourceRevision.canonicalSourceRevision })
    } catch (error) {
      return this.fail(now, failureCode(error))
    } finally {
      clearTimeout(timeout)
      if (this.activeController === controller) this.activeController = null
    }
  }

  private fail(
    attemptedAtMs: number,
    code: ModelsDevOfficialSourceRefreshFailureCodeV1,
  ): ModelsDevOfficialSourceRefreshResultV1 {
    this.ingestion.recordModelsDevRefreshFailure({
      distributionId: MODELS_DEV_OFFICIAL_DISTRIBUTION_ID_V1,
      distributionChannel: MODELS_DEV_OFFICIAL_DISTRIBUTION_CHANNEL_V1,
      attemptedAtMs,
      staleReason: code,
    })
    return Object.freeze({ ok: false, status: 'failed', code })
  }
}
