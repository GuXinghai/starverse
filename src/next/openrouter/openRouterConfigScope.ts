import {
  extractConvoSamplingParamsOverride,
  extractProjectSamplingParamsDefaults,
  normalizeSamplingParamsLayer,
} from './samplingParamsPersistence'
import {
  resolveSamplingParams,
  type ResolvedSamplingParams,
  type SamplingParamsLayer,
} from './samplingParamsResolver'
import {
  DEFAULT_REASONING_PREFS,
  resolveReasoningPrefsFromStoredLayers,
  type ReasoningPrefsSource,
} from '@/next/settings/reasoningPrefsScope'
import {
  extractConvoWebSearchOverride,
  extractProjectWebSearchDefaults,
  normalizeSearchSettingsLayer,
} from './searchSettingsPersistence'
import {
  resolveSearchSettings,
  type ResolveSearchSettingsOptions,
  type ResolvedSearchSettings,
  type SearchSettingsLayer,
} from './searchSettingsResolver'
import type { ReasoningPrefs } from '@/next/state/types'

export type OpenRouterConfigScopedConvo = Readonly<{
  projectId?: string | null
  meta?: unknown
}>

export type OpenRouterConfigScopedProject = Readonly<{
  id: string
  meta?: unknown
}>

export type ResolvedOpenRouterConfigScope = Readonly<{
  convoMeta: unknown | null
  projectMeta: unknown | null
  reasoning: Readonly<{
    convoLayer: ReasoningPrefs | null
    projectLayer: ReasoningPrefs | null
    globalLayer: ReasoningPrefs | null
    resolved: ReasoningPrefs
    source: ReasoningPrefsSource
  }>
  webSearch: Readonly<{
    convoLayer: SearchSettingsLayer | null
    projectLayer: SearchSettingsLayer | null
    globalLayer: SearchSettingsLayer | null
    resolved: ResolvedSearchSettings
  }>
  samplingParams: Readonly<{
    convoLayer: SamplingParamsLayer | null
    projectLayer: SamplingParamsLayer | null
    globalLayer: SamplingParamsLayer | null
    resolved: ResolvedSamplingParams
  }>
}>

export type ResolveOpenRouterConfigScopeInput = Readonly<{
  convoMeta?: unknown
  projectMeta?: unknown
  globalReasoningPrefs?: unknown
  globalWebSearchDefaults?: unknown
  globalSamplingParamsDefaults?: unknown
  webSearchOptions?: ResolveSearchSettingsOptions
}>

function normalizeScopedProjectId(projectId: unknown): string {
  return String(projectId ?? '').trim()
}

function findProjectMetaForConvo(
  convo: OpenRouterConfigScopedConvo | null | undefined,
  projects: ReadonlyArray<OpenRouterConfigScopedProject>
): unknown | null {
  const projectId = normalizeScopedProjectId(convo?.projectId)
  if (!projectId) return null
  return projects.find((project) => normalizeScopedProjectId(project.id) === projectId)?.meta ?? null
}

export function resolveOpenRouterConfigScopeFromStoredLayers(
  input: ResolveOpenRouterConfigScopeInput
): ResolvedOpenRouterConfigScope {
  const convoMeta = input.convoMeta ?? null
  const projectMeta = input.projectMeta ?? null
  const reasoning = resolveReasoningPrefsFromStoredLayers({
    convoMeta,
    projectMeta,
    globalPrefs: input.globalReasoningPrefs,
    defaultPrefs: DEFAULT_REASONING_PREFS,
  })

  const webSearchConvoLayer = extractConvoWebSearchOverride(convoMeta)
  const webSearchProjectLayer = extractProjectWebSearchDefaults(projectMeta)
  const webSearchGlobalLayer = normalizeSearchSettingsLayer(input.globalWebSearchDefaults)

  const samplingConvoLayer = extractConvoSamplingParamsOverride(convoMeta)
  const samplingProjectLayer = extractProjectSamplingParamsDefaults(projectMeta)
  const samplingGlobalLayer = normalizeSamplingParamsLayer(input.globalSamplingParamsDefaults)

  return {
    convoMeta,
    projectMeta,
    reasoning,
    webSearch: {
      convoLayer: webSearchConvoLayer,
      projectLayer: webSearchProjectLayer,
      globalLayer: webSearchGlobalLayer,
      resolved: resolveSearchSettings(
        {
          convo: webSearchConvoLayer,
          project: webSearchProjectLayer,
          global: webSearchGlobalLayer,
        },
        input.webSearchOptions
      ),
    },
    samplingParams: {
      convoLayer: samplingConvoLayer,
      projectLayer: samplingProjectLayer,
      globalLayer: samplingGlobalLayer,
      resolved: resolveSamplingParams({
        convo: samplingConvoLayer,
        project: samplingProjectLayer,
        global: samplingGlobalLayer,
      }),
    },
  }
}

export function resolveOpenRouterConfigScopeForConvo(input: Readonly<{
  convo?: OpenRouterConfigScopedConvo | null
  projects?: ReadonlyArray<OpenRouterConfigScopedProject>
  globalReasoningPrefs?: unknown
  globalWebSearchDefaults?: unknown
  globalSamplingParamsDefaults?: unknown
  webSearchOptions?: ResolveSearchSettingsOptions
}>): ResolvedOpenRouterConfigScope {
  return resolveOpenRouterConfigScopeFromStoredLayers({
    convoMeta: input.convo?.meta ?? null,
    projectMeta: findProjectMetaForConvo(input.convo ?? null, input.projects ?? []),
    globalReasoningPrefs: input.globalReasoningPrefs,
    globalWebSearchDefaults: input.globalWebSearchDefaults,
    globalSamplingParamsDefaults: input.globalSamplingParamsDefaults,
    webSearchOptions: input.webSearchOptions,
  })
}

export function resolveOpenRouterConfigScopeForProject(input: Readonly<{
  projectMeta?: unknown
  globalReasoningPrefs?: unknown
  globalWebSearchDefaults?: unknown
  globalSamplingParamsDefaults?: unknown
  webSearchOptions?: ResolveSearchSettingsOptions
}>): ResolvedOpenRouterConfigScope {
  return resolveOpenRouterConfigScopeFromStoredLayers({
    projectMeta: input.projectMeta,
    globalReasoningPrefs: input.globalReasoningPrefs,
    globalWebSearchDefaults: input.globalWebSearchDefaults,
    globalSamplingParamsDefaults: input.globalSamplingParamsDefaults,
    webSearchOptions: input.webSearchOptions,
  })
}
