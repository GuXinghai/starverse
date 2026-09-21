import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import {
  CLOUD_RULES_OFFICIAL_REPOSITORY_V1,
  selectCloudRulesReleaseAssetV1,
  selectHighestCloudRulesReleaseV1,
  validateDecodedCloudRulesReleasePublicationV1,
  CloudRulesReleaseV1Error,
  type CloudRulesGitHubReleaseV1,
  type CloudRulesReleaseAssetV1,
} from '../../src/next/generation-v2/capability-rules/cloudRulesReleaseV1'
import {
  CloudRulesDistributionV1Repo,
  CloudRulesDistributionV1RepoError,
  prepareCloudRulesCandidateV1,
  type CloudRulesDistributionStateV1,
} from '../../infra/db/repo/cloudRulesDistributionV1Repo'
import { CloudRulesApplicationV1Repo } from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import type { ProviderFetch } from '../net/providerHttpTransport'

export const CLOUD_RULES_GITHUB_RELEASES_LISTING_URL_V1 =
  `https://api.github.com/repos/${CLOUD_RULES_OFFICIAL_REPOSITORY_V1}/releases?per_page=100&page=1` as const
export const CLOUD_RULES_RELEASES_API_URL_V1 = CLOUD_RULES_GITHUB_RELEASES_LISTING_URL_V1
export const CLOUD_RULES_RELEASES_LIST_PAGE_SIZE_V1 = 100 as const
export const CLOUD_RULES_DEFAULT_REFRESH_CADENCE_MS_V1 = 24 * 60 * 60 * 1_000
export const CLOUD_RULES_DEFAULT_TIMEOUT_MS_V1 = 30_000

const CLOUD_RULES_RELEASES_LIST_PATH_V1 =
  `/repos/${CLOUD_RULES_OFFICIAL_REPOSITORY_V1}/releases`
const CLOUD_RULES_RELEASE_ASSET_API_PATH_PREFIX_V1 =
  `/repos/${CLOUD_RULES_OFFICIAL_REPOSITORY_V1}/releases/assets/`
const GITHUB_API_HOST_V1 = 'api.github.com'
const GITHUB_HOST_V1 = 'github.com'
const GITHUB_CONTENT_HOST_SUFFIX_V1 = '.githubusercontent.com'
const REDIRECT_STATUSES_V1 = new Set([301, 302, 303, 307, 308])
const SENSITIVE_REDIRECT_HEADERS_V1 = new Set([
  'authorization', 'cookie', 'proxy-authorization',
])

export type CloudRulesCandidateRefreshFailureCodeV1 =
  | 'CLOUD_RULES_FETCH_FAILED'
  | 'CLOUD_RULES_ABORTED'
  | 'CLOUD_RULES_TIMEOUT'
  | 'CLOUD_RULES_HTTP_INVALID'
  | 'CLOUD_RULES_REDIRECT_SCHEME_INVALID'
  | 'CLOUD_RULES_REDIRECT_HOST_INVALID'
  | 'CLOUD_RULES_REDIRECT_USERINFO_INVALID'
  | 'CLOUD_RULES_REDIRECT_LOCATION_INVALID'
  | 'CLOUD_RULES_REDIRECT_LOOP'
  | 'CLOUD_RULES_LISTING_INVALID'
  | 'CLOUD_RULES_LISTING_URL_INVALID'
  | 'CLOUD_RULES_LISTING_PAGINATION_LOOP'
  | 'CLOUD_RULES_RELEASE_INVALID'
  | 'CLOUD_RULES_ASSET_INVALID'
  | 'CLOUD_RULES_DOCUMENT_INVALID'
  | 'CLOUD_RULES_CONTENT_REVISION_INVALID'
  | 'CLOUD_RULES_RELEASE_VERSION_DRIFT'
  | 'CLOUD_RULES_PUBLICATION_FAILED'
  | 'CLOUD_RULES_PERSISTENCE_FAILED'

export type CloudRulesCandidateRefreshResultV1 =
  | Readonly<{
    ok: true
    status: 'not_due' | 'refreshed'
    state: CloudRulesDistributionStateV1
  }>
  | Readonly<{
    ok: false
    status: 'failed'
    code: CloudRulesCandidateRefreshFailureCodeV1
  }>

class CloudRulesCandidateRefreshError extends Error {
  constructor(readonly code: CloudRulesCandidateRefreshFailureCodeV1) {
    super(code)
    this.name = 'CloudRulesCandidateRefreshError'
  }
}

function fail(code: CloudRulesCandidateRefreshFailureCodeV1): never {
  throw new CloudRulesCandidateRefreshError(code)
}

function validateAllowedUrl(value: string, context: 'redirect' | 'listing'): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    fail(context === 'listing' ? 'CLOUD_RULES_LISTING_URL_INVALID' : 'CLOUD_RULES_REDIRECT_HOST_INVALID')
  }
  if (url.protocol !== 'https:') fail('CLOUD_RULES_REDIRECT_SCHEME_INVALID')
  if (url.username !== '' || url.password !== '') fail('CLOUD_RULES_REDIRECT_USERINFO_INVALID')
  if (url.port !== '') fail('CLOUD_RULES_REDIRECT_HOST_INVALID')
  if (!isAllowedHost(url.hostname)) fail('CLOUD_RULES_REDIRECT_HOST_INVALID')
  url.hash = ''
  return url
}

function isDnsLabel(value: string): boolean {
  return value.length >= 1 && value.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value)
}

function isAllowedHost(hostname: string): boolean {
  if (hostname === GITHUB_API_HOST_V1 || hostname === GITHUB_HOST_V1) return true
  if (!hostname.endsWith(GITHUB_CONTENT_HOST_SUFFIX_V1)) return false
  const prefix = hostname.slice(0, -GITHUB_CONTENT_HOST_SUFFIX_V1.length)
  return prefix.split('.').every(isDnsLabel) && prefix.length > 0 && hostname.length <= 253
}

function validateListingUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    fail('CLOUD_RULES_LISTING_URL_INVALID')
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' ||
      url.hostname !== GITHUB_API_HOST_V1 || url.port !== '' || url.hash !== '' ||
      url.pathname !== CLOUD_RULES_RELEASES_LIST_PATH_V1) {
    fail('CLOUD_RULES_LISTING_URL_INVALID')
  }
  const entries = [...url.searchParams.entries()]
  if (entries.length !== 2 || entries.some(([key]) => key !== 'page' && key !== 'per_page')) {
    fail('CLOUD_RULES_LISTING_URL_INVALID')
  }
  const page = url.searchParams.get('page')
  const perPage = url.searchParams.get('per_page')
  if (page === null || perPage !== String(CLOUD_RULES_RELEASES_LIST_PAGE_SIZE_V1) ||
      !/^[1-9]\d*$/u.test(page)) {
    fail('CLOUD_RULES_LISTING_URL_INVALID')
  }
  const pageNumber = Number(page)
  if (!Number.isSafeInteger(pageNumber) || String(pageNumber) !== page) {
    fail('CLOUD_RULES_LISTING_URL_INVALID')
  }
  return url
}

function validateAssetApiUrl(asset: CloudRulesReleaseAssetV1): URL {
  const url = validateAllowedUrl(asset.apiUrl, 'redirect')
  if (url.hostname !== GITHUB_API_HOST_V1 || url.port !== '' || url.search !== '' || url.hash !== '' ||
      url.pathname !== `${CLOUD_RULES_RELEASE_ASSET_API_PATH_PREFIX_V1}${asset.assetId}`) {
    fail('CLOUD_RULES_ASSET_INVALID')
  }
  return url
}

function cloneHeaders(input: Readonly<Record<string, string>>): Record<string, string> {
  return { ...input }
}

function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  for (const key of Object.keys(headers)) {
    if (SENSITIVE_REDIRECT_HEADERS_V1.has(key.toLowerCase())) delete headers[key]
  }
  return headers
}

export function projectCloudRulesRedirectHeadersV1(input: Readonly<{
  headers: Readonly<Record<string, string>>
  fromHostname: string
  toHostname: string
}>): Readonly<Record<string, string>> {
  const headers = cloneHeaders(input.headers)
  return input.fromHostname.toLowerCase() === input.toHostname.toLowerCase()
    ? headers : stripSensitiveHeaders(headers)
}

async function fetchFollowingRedirects(input: Readonly<{
  fetchImpl: ProviderFetch
  url: string
  headers: Readonly<Record<string, string>>
  signal: AbortSignal
}>): Promise<Response> {
  let current = validateAllowedUrl(input.url, 'redirect')
  const visited = new Set<string>()
  let headers = cloneHeaders(input.headers)

  while (true) {
    const currentHref = current.href
    if (visited.has(currentHref)) fail('CLOUD_RULES_REDIRECT_LOOP')
    visited.add(currentHref)

    let response: Response
    try {
      response = await input.fetchImpl(currentHref, {
        method: 'GET',
        headers,
        redirect: 'manual',
        cache: 'no-store',
        signal: input.signal,
      })
    } catch (error) {
      if (input.signal.aborted) throw error
      fail('CLOUD_RULES_FETCH_FAILED')
    }

    if (response.url) {
      const responseUrl = validateAllowedUrl(response.url, 'redirect')
      if (responseUrl.href !== currentHref) fail('CLOUD_RULES_REDIRECT_LOCATION_INVALID')
    }

    if (!REDIRECT_STATUSES_V1.has(response.status)) return response
    const location = response.headers.get('location')
    if (location === null || location.trim() === '') fail('CLOUD_RULES_REDIRECT_LOCATION_INVALID')

    let next: URL
    try {
      next = new URL(location, currentHref)
    } catch {
      fail('CLOUD_RULES_REDIRECT_LOCATION_INVALID')
    }
    validateAllowedUrl(next.href, 'redirect')
    headers = { ...projectCloudRulesRedirectHeadersV1({ headers,
      fromHostname: current.hostname, toHostname: next.hostname }) }
    current = next
  }
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
  try {
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    fail('CLOUD_RULES_FETCH_FAILED')
  }
}

function parseJsonBytes(bytes: Uint8Array, failureCode: CloudRulesCandidateRefreshFailureCodeV1): unknown {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return JSON.parse(text) as unknown
  } catch {
    fail(failureCode)
  }
}

function nextPaginationUrl(response: Response): string | null {
  const value = response.headers.get('link')
  if (value === null) return null
  for (const part of value.split(',')) {
    const match = /^\s*<([^>]+)>\s*;(.*)$/u.exec(part)
    if (!match) continue
    const parameters = match[2]!.split(';').map((entry) => entry.trim())
    const rel = parameters.find((entry) => /^rel\s*=/iu.test(entry))
    if (!rel) continue
    const relValue = /^rel\s*=\s*(?:"([^"]*)"|([^\s]+))$/iu.exec(rel)?.[1] ??
      /^rel\s*=\s*(?:"([^"]*)"|([^\s]+))$/iu.exec(rel)?.[2]
    if (relValue?.split(/\s+/u).includes('next')) return match[1]!
  }
  return null
}

function paginationKey(url: URL): string {
  return `${url.hostname}${url.pathname}?page=${url.searchParams.get('page')}&per_page=${url.searchParams.get('per_page')}`
}

function mapFailureCode(
  error: unknown,
  signal: AbortSignal,
  timedOut: boolean,
): CloudRulesCandidateRefreshFailureCodeV1 {
  if (timedOut) return 'CLOUD_RULES_TIMEOUT'
  if (signal.aborted) return 'CLOUD_RULES_ABORTED'
  if (error instanceof CloudRulesCandidateRefreshError) return error.code
  if (error instanceof CloudRulesDistributionV1RepoError) {
    return error.code === 'GENERATION_V2_CLOUD_RULES_RELEASE_VERSION_DRIFT'
      ? 'CLOUD_RULES_RELEASE_VERSION_DRIFT'
      : 'CLOUD_RULES_PERSISTENCE_FAILED'
  }
  if (error instanceof CloudRulesReleaseV1Error) {
    switch (error.code) {
      case 'GENERATION_V2_CLOUD_RULES_ASSET_INVALID': return 'CLOUD_RULES_ASSET_INVALID'
      case 'GENERATION_V2_CLOUD_RULES_CONTENT_REVISION_INVALID': return 'CLOUD_RULES_CONTENT_REVISION_INVALID'
      case 'GENERATION_V2_CLOUD_RULES_DOCUMENT_INVALID': return 'CLOUD_RULES_DOCUMENT_INVALID'
      case 'GENERATION_V2_CLOUD_RULES_RELEASE_INVALID':
      case 'GENERATION_V2_CLOUD_RULES_SEMVER_INVALID': return 'CLOUD_RULES_RELEASE_INVALID'
    }
  }
  return 'CLOUD_RULES_PUBLICATION_FAILED'
}

function toSuccess(
  status: 'not_due' | 'refreshed',
  state: CloudRulesDistributionStateV1,
): CloudRulesCandidateRefreshResultV1 {
  return Object.freeze({ ok: true as const, status, state })
}

export class CloudRulesCandidateRefreshV1 {
  private readonly repo: CloudRulesDistributionV1Repo
  private readonly applicationRepo: CloudRulesApplicationV1Repo
  private readonly nowMs: () => number
  private readonly refreshCadenceMs: number
  private readonly timeoutMs: number
  private inFlight: Promise<CloudRulesCandidateRefreshResultV1> | null = null
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
    this.repo = new CloudRulesDistributionV1Repo(input.db, input.nowMs ?? Date.now)
    this.applicationRepo = new CloudRulesApplicationV1Repo(input.db, input.nowMs ?? Date.now)
    this.nowMs = input.nowMs ?? Date.now
    this.refreshCadenceMs = input.refreshCadenceMs ?? CLOUD_RULES_DEFAULT_REFRESH_CADENCE_MS_V1
    this.timeoutMs = input.timeoutMs ?? CLOUD_RULES_DEFAULT_TIMEOUT_MS_V1
    if (!Number.isFinite(this.refreshCadenceMs) || this.refreshCadenceMs <= 0 ||
        !Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('Cloud Rules refresh cadence and timeout must be positive finite numbers')
    }
  }

  refreshIfDue(): Promise<CloudRulesCandidateRefreshResultV1> {
    if (this.inFlight) return this.inFlight
    const promise = this.refreshIfDueOnce().finally(() => {
      if (this.inFlight === promise) this.inFlight = null
    })
    this.inFlight = promise
    return promise
  }

  start(): Promise<CloudRulesCandidateRefreshResultV1> {
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

  private async runScheduledRefresh(): Promise<CloudRulesCandidateRefreshResultV1> {
    try {
      return await this.refreshIfDue()
    } finally {
      if (this.started) this.scheduleNextRefresh()
    }
  }

  private scheduleNextRefresh(): void {
    if (this.scheduledRefresh !== null) clearTimeout(this.scheduledRefresh)
    const state = this.repo.readState()
    const now = this.nowMs()
    const dueAt = (state.lastAttemptedAtMs ?? now) + this.refreshCadenceMs
    const delay = Math.max(0, dueAt - now)
    this.scheduledRefresh = setTimeout(() => {
      this.scheduledRefresh = null
      void this.runScheduledRefresh().catch(() => undefined)
    }, delay)
  }

  private async refreshIfDueOnce(): Promise<CloudRulesCandidateRefreshResultV1> {
    const attemptedAtMs = this.nowMs()
    const current = this.repo.readState()
    if (current.lastAttemptedAtMs !== null &&
        attemptedAtMs - current.lastAttemptedAtMs < this.refreshCadenceMs) {
      return toSuccess('not_due', current)
    }

    const controller = new AbortController()
    this.activeController = controller
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)

    try {
      const release = await this.discoverHighestRelease(controller.signal)
      if (release === null) {
        return toSuccess('refreshed', this.repo.publishSuccessfulCheck({
          checkedAtMs: attemptedAtMs,
          candidate: null,
          suppressCandidate: this.applicationRepo.readPolicy().pin !== null,
        }))
      }

      const asset = selectCloudRulesReleaseAssetV1(release)
      const assetApiUrl = validateAssetApiUrl(asset)
      const assetResponse = await fetchFollowingRedirects({
        fetchImpl: this.input.fetchImpl,
        url: assetApiUrl.href,
        headers: { accept: 'application/octet-stream' },
        signal: controller.signal,
      })
      if (!assetResponse.ok) fail('CLOUD_RULES_HTTP_INVALID')
      const assetBytes = await readResponseBytes(assetResponse)
      const document = parseJsonBytes(assetBytes, 'CLOUD_RULES_DOCUMENT_INVALID')
      const publication = validateDecodedCloudRulesReleasePublicationV1({ release, document })
      const rawAssetSha256 = createHash('sha256').update(assetBytes).digest('hex')
      const candidate = prepareCloudRulesCandidateV1({
        publication,
        rawAssetSha256,
        fetchedAtMs: attemptedAtMs,
      })
      return toSuccess('refreshed', this.repo.publishSuccessfulCheck({
        checkedAtMs: attemptedAtMs,
        candidate,
        suppressCandidate: this.applicationRepo.readPolicy().pin !== null,
      }))
    } catch (error) {
      const code = mapFailureCode(error, controller.signal, timedOut)
      try {
        this.repo.recordFailure({ attemptedAtMs, failureCode: code })
      } catch {
        return Object.freeze({ ok: false as const, status: 'failed' as const,
          code: 'CLOUD_RULES_PERSISTENCE_FAILED' as const })
      }
      return Object.freeze({ ok: false as const, status: 'failed' as const, code })
    } finally {
      clearTimeout(timeout)
      if (this.activeController === controller) this.activeController = null
    }
  }

  private async discoverHighestRelease(signal: AbortSignal): Promise<CloudRulesGitHubReleaseV1 | null> {
    let listingUrl = validateListingUrl(CLOUD_RULES_GITHUB_RELEASES_LISTING_URL_V1)
    const visitedPages = new Set<string>()
    const entries: unknown[] = []

    while (true) {
      const key = paginationKey(listingUrl)
      if (visitedPages.has(key)) fail('CLOUD_RULES_LISTING_PAGINATION_LOOP')
      visitedPages.add(key)

      const response = await fetchFollowingRedirects({
        fetchImpl: this.input.fetchImpl,
        url: listingUrl.href,
        headers: { accept: 'application/vnd.github+json' },
        signal,
      })
      if (!response.ok) fail('CLOUD_RULES_HTTP_INVALID')
      const payload = parseJsonBytes(await readResponseBytes(response), 'CLOUD_RULES_LISTING_INVALID')
      if (!Array.isArray(payload)) fail('CLOUD_RULES_LISTING_INVALID')
      entries.push(...payload)

      const next = nextPaginationUrl(response)
      if (next === null) break
      listingUrl = validateListingUrl(next)
    }

    // The pure selector decodes the complete raw listing, so unknown GitHub fields
    // remain harmless while malformed publications stay non-candidates.
    return selectHighestCloudRulesReleaseV1(entries)
  }
}
