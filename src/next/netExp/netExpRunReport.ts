import type { DomainEvent } from '@/next/state/types'
import type { NetExpRuntimeInfo, NetExpSettings } from './netExpClient'

export type NetExpRunStatus = 'done' | 'error' | 'aborted'

export type NetExpRunReport = {
  runId: string
  requestId: string
  streamMode: 'renderer' | 'main'
  model?: string
  provider?: string
  generationId?: string
  baseUrl?: string
  startedAt: string
  endedAt?: string
  firstByteAt?: string
  firstByteMs?: number
  maxIdleMs?: number
  maxIdleWindow?: { start: string; end: string }
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
    cost?: number
    currency?: string
  }
  status?: NetExpRunStatus
  error?: { message?: string; raw?: unknown }
  settings: NetExpSettings
}

export type NetExpRunTracker = Readonly<{
  onEvent: (event: DomainEvent) => void
  onEnd: (status: NetExpRunStatus, error?: unknown) => void
  getSnapshot: () => NetExpRunReport
}>

let lastReport: NetExpRunReport | null = null

function asIso(ts: number): string {
  return new Date(ts).toISOString()
}

function pickErrorMessage(err: unknown): string | undefined {
  if (!err) return undefined
  if (typeof err === 'string') return err
  if (typeof err === 'object' && 'openrouter' in (err as any)) {
    const msg = (err as any)?.openrouter?.message
    if (typeof msg === 'string' && msg.trim().length > 0) return msg
  }
  if (typeof err === 'object' && 'message' in (err as any)) return String((err as any).message ?? '')
  return undefined
}

function parseNumberLike(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function parseUsageCost(usage: Record<string, unknown>): { cost?: number; currency?: string } {
  const rawCost = usage.cost
  const rawCurrency =
    (rawCost && typeof rawCost === 'object' ? (rawCost as Record<string, unknown>).currency : undefined) ??
    usage.cost_currency ??
    usage.currency

  let cost = parseNumberLike(rawCost)
  if (cost === undefined && rawCost && typeof rawCost === 'object') {
    const costObj = rawCost as Record<string, unknown>
    cost =
      parseNumberLike(costObj.amount) ??
      parseNumberLike(costObj.value) ??
      parseNumberLike(costObj.total) ??
      parseNumberLike(costObj.usd)
  }

  const currency =
    typeof rawCurrency === 'string' && rawCurrency.trim().length > 0
      ? rawCurrency.trim().toUpperCase()
      : undefined
  return {
    ...(cost !== undefined ? { cost } : {}),
    ...(currency ? { currency } : {}),
  }
}

export function startNetExpRunReport(input: {
  runId: string
  requestId: string
  streamMode: 'renderer' | 'main'
  model?: string
  baseUrl?: string
  settings: NetExpSettings
}): NetExpRunTracker {
  const startedAt = Date.now()
  let lastEventAt: number | null = null
  let maxIdleMs = 0
  let maxIdleWindow: { start: string; end: string } | undefined

  const report: NetExpRunReport = {
    runId: input.runId,
    requestId: input.requestId,
    streamMode: input.streamMode,
    model: input.model,
    baseUrl: input.baseUrl,
    startedAt: asIso(startedAt),
    settings: input.settings,
  }

  lastReport = report

  const onEvent = (event: DomainEvent) => {
    const now = Date.now()
    if (!report.firstByteAt) {
      report.firstByteAt = asIso(now)
      report.firstByteMs = now - startedAt
    }

    if (lastEventAt !== null) {
      const idleMs = now - lastEventAt
      if (idleMs >= maxIdleMs) {
        maxIdleMs = idleMs
        maxIdleWindow = { start: asIso(lastEventAt), end: asIso(now) }
        report.maxIdleMs = maxIdleMs
        report.maxIdleWindow = maxIdleWindow
      }
    }

    lastEventAt = now

    if (event.type === 'MetaDelta') {
      report.generationId = event.meta?.id ?? report.generationId
      report.model = event.meta?.model ?? report.model
      report.provider = event.meta?.provider ?? report.provider
    }

    if (event.type === 'UsageDelta' && event.usage && typeof event.usage === 'object') {
      const usage = event.usage as Record<string, unknown>
      const promptTokens = parseNumberLike(usage.prompt_tokens)
      const completionTokens = parseNumberLike(usage.completion_tokens)
      const totalTokens = parseNumberLike(usage.total_tokens)
      const cost = parseUsageCost(usage)
      report.usage = {
        ...(promptTokens !== undefined ? { promptTokens } : {}),
        ...(completionTokens !== undefined ? { completionTokens } : {}),
        ...(totalTokens !== undefined ? { totalTokens } : {}),
        ...(cost.cost !== undefined ? { cost: cost.cost } : {}),
        ...(cost.currency ? { currency: cost.currency } : {}),
      }
    }

    if (event.type === 'StreamError') {
      const completionClass = (event.error as any)?.completionClass
      report.status = completionClass === 'aborted' ? 'aborted' : completionClass === 'error' ? 'error' : 'done'
      report.error = { message: pickErrorMessage(event.error), raw: event.error }
    }

    if (event.type === 'StreamAbort') {
      report.status = 'aborted'
    }
  }

  const onEnd = (status: NetExpRunStatus, error?: unknown) => {
    const now = Date.now()
    if (lastEventAt !== null) {
      const idleMs = now - lastEventAt
      if (idleMs >= maxIdleMs) {
        maxIdleMs = idleMs
        maxIdleWindow = { start: asIso(lastEventAt), end: asIso(now) }
        report.maxIdleMs = maxIdleMs
        report.maxIdleWindow = maxIdleWindow
      }
    }

    report.endedAt = asIso(now)
    report.status = status
    if (error && status === 'error') {
      report.error = { message: pickErrorMessage(error), raw: error }
    }
  }

  return {
    onEvent,
    onEnd,
    getSnapshot: () => report,
  }
}

export function getLastNetExpRunReport(): NetExpRunReport | null {
  return lastReport
}

export function formatNetExpRunReport(report: NetExpRunReport | null, runtime?: NetExpRuntimeInfo | null): string {
  if (!report) {
    return [
      'Starverse NetExp Run Report (v1)',
      `Generated: ${new Date().toISOString()}`,
      'No stream captured yet.',
    ].join('\n')
  }

  const lines: string[] = []
  lines.push('Starverse NetExp Run Report (v1)')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`RunId: ${report.runId}`)
  lines.push(`RequestId: ${report.requestId}`)
  lines.push(`StreamMode: ${report.streamMode}`)
  lines.push(`Model: ${report.model ?? 'n/a'}`)
  lines.push(`Provider: ${report.provider ?? 'n/a'}`)
  lines.push(`GenerationId: ${report.generationId ?? 'n/a'}`)
  lines.push(`BaseUrl: ${report.baseUrl ?? 'default'}`)
  lines.push(`Status: ${report.status ?? 'n/a'}`)
  lines.push(`StartedAt: ${report.startedAt}`)
  lines.push(`EndedAt: ${report.endedAt ?? 'n/a'}`)
  lines.push(`FirstByteMs: ${report.firstByteMs ?? 'n/a'}`)
  lines.push(`MaxIdleMs: ${report.maxIdleMs ?? 'n/a'}`)
  lines.push(`MaxIdleWindow: ${report.maxIdleWindow ? `${report.maxIdleWindow.start} → ${report.maxIdleWindow.end}` : 'n/a'}`)
  lines.push(`Usage.prompt_tokens: ${report.usage?.promptTokens ?? 'n/a'}`)
  lines.push(`Usage.completion_tokens: ${report.usage?.completionTokens ?? 'n/a'}`)
  lines.push(`Usage.total_tokens: ${report.usage?.totalTokens ?? 'n/a'}`)
  lines.push(`Usage.cost: ${report.usage?.cost ?? 'n/a'}`)
  lines.push(`Usage.currency: ${report.usage?.currency ?? 'n/a'}`)

  if (report.error) {
    lines.push(`ErrorMessage: ${report.error.message ?? 'n/a'}`)
    lines.push(`ErrorRaw: ${safeStringify(report.error.raw)}`)
  } else {
    lines.push('ErrorMessage: n/a')
  }

  lines.push('Settings:')
  lines.push(`  disableHttp2: ${report.settings.disableHttp2}`)
  lines.push(`  disableQuic: ${report.settings.disableQuic}`)
  lines.push(`  streamInMainProcess: ${report.settings.streamInMainProcess}`)
  lines.push(`  forceHttp1: ${report.settings.forceHttp1}`)
  lines.push(`  tcpKeepAliveEnable: ${report.settings.tcpKeepAliveEnable}`)
  lines.push(`  tcpKeepAliveIdleMs: ${report.settings.tcpKeepAliveIdleMs}`)

  lines.push('Runtime:')
  if (runtime) {
    lines.push(`  electron: ${runtime.electron}`)
    lines.push(`  chromium: ${runtime.chrome}`)
    lines.push(`  node: ${runtime.node}`)
    lines.push(`  argv: ${runtime.argv.join(' ')}`)
    lines.push(`  appliedAt: ${runtime.appliedAt}`)
    lines.push(`  appliedSwitches: ${runtime.appliedSwitches.map((s) => s.value ? `${s.name}=${s.value}` : s.name).join(', ') || 'n/a'}`)
    lines.push(`  switchErrors: ${runtime.switchErrors?.length ? runtime.switchErrors.map((e) => `${e.name}: ${e.error}`).join('; ') : 'n/a'}`)
    lines.push(`  requested.disableHttp2: ${runtime.requested.disableHttp2}`)
    lines.push(`  requested.disableQuic: ${runtime.requested.disableQuic}`)
    lines.push(`  applied.disableHttp2: ${runtime.applied.disableHttp2}`)
    lines.push(`  applied.disableQuic: ${runtime.applied.disableQuic}`)
  } else {
    lines.push('  runtime info unavailable')
  }

  lines.push('Diagnostics:')
  lines.push('  stdoutTail: n/a')
  lines.push('  stderrTail: n/a')

  return lines.join('\n')
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
