import type { ReasoningEffort, ReasoningPrefs } from '@/next/state/types'

export const DEFAULT_REASONING_PREFS: ReasoningPrefs = { mode: 'auto', effort: 'auto', exclude: false }

const REASONING_EFFORTS: readonly ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']

export type ReasoningPrefsSource = 'conversation' | 'project' | 'global' | 'default'

export type ResolvedReasoningPrefsLayers = Readonly<{
  convoLayer: ReasoningPrefs | null
  projectLayer: ReasoningPrefs | null
  globalLayer: ReasoningPrefs | null
  resolved: ReasoningPrefs
  source: ReasoningPrefsSource
}>

export type ReasoningPrefsSavePlan = Readonly<{
  nextConvoMeta: Record<string, unknown>
  normalizedPrefs: ReasoningPrefs
  shouldMirrorToGlobalDefault: boolean
  globalMirrorReason: 'missing_project' | 'scoped_conversation'
}>

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORTS as readonly string[]).includes(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function normalizeReasoningPrefs(raw: unknown): ReasoningPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const mode = (raw as any).mode === 'effort' || (raw as any).mode === 'auto' ? (raw as any).mode : 'auto'
  const effortRaw = (raw as any).effort
  const effort = effortRaw === 'auto' || isReasoningEffort(effortRaw) ? effortRaw : undefined
  const excludeRaw = (raw as any).exclude === true

  if (mode === 'auto') {
    return DEFAULT_REASONING_PREFS
  }

  const resolvedEffort = effort && effort !== 'auto' ? effort : 'none'
  const exclude = resolvedEffort === 'none' ? false : excludeRaw
  return { mode: 'effort', effort: resolvedEffort, exclude }
}

export function extractReasoningPrefs(meta: unknown): ReasoningPrefs | null {
  const root = asRecord(meta)
  if (!root) return null
  return normalizeReasoningPrefs(root.reasoningPrefs)
}

export function mergeReasoningPrefsIntoMeta(meta: unknown, prefs: ReasoningPrefs): Record<string, unknown> {
  const base = asRecord(meta)
  return {
    ...(base ?? {}),
    reasoningPrefs: normalizeReasoningPrefs(prefs) ?? DEFAULT_REASONING_PREFS,
  }
}

export function resolveReasoningPrefsFromStoredLayers(input: Readonly<{
  convoMeta?: unknown
  projectMeta?: unknown
  globalPrefs?: unknown
  defaultPrefs?: ReasoningPrefs
}>): ResolvedReasoningPrefsLayers {
  const convoLayer = extractReasoningPrefs(input.convoMeta)
  const projectLayer = extractReasoningPrefs(input.projectMeta)
  const globalLayer = normalizeReasoningPrefs(input.globalPrefs)
  const fallback = normalizeReasoningPrefs(input.defaultPrefs) ?? DEFAULT_REASONING_PREFS

  if (convoLayer) {
    return { convoLayer, projectLayer, globalLayer, resolved: convoLayer, source: 'conversation' }
  }
  if (projectLayer) {
    return { convoLayer, projectLayer, globalLayer, resolved: projectLayer, source: 'project' }
  }
  if (globalLayer) {
    return { convoLayer, projectLayer, globalLayer, resolved: globalLayer, source: 'global' }
  }
  return { convoLayer, projectLayer, globalLayer, resolved: fallback, source: 'default' }
}

export function buildReasoningPrefsSavePlan(input: Readonly<{
  convoMeta?: unknown
  convoProjectId?: string | null
  prefs: ReasoningPrefs
}>): ReasoningPrefsSavePlan {
  const normalizedPrefs = normalizeReasoningPrefs(input.prefs) ?? DEFAULT_REASONING_PREFS
  const trimmedProjectId = String(input.convoProjectId ?? '').trim()
  const shouldMirrorToGlobalDefault = trimmedProjectId.length === 0

  return {
    nextConvoMeta: mergeReasoningPrefsIntoMeta(input.convoMeta ?? null, normalizedPrefs),
    normalizedPrefs,
    shouldMirrorToGlobalDefault,
    globalMirrorReason: shouldMirrorToGlobalDefault ? 'missing_project' : 'scoped_conversation',
  }
}
