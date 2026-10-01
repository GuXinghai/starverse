import type { GenerationControlsProjectionV2 } from '@/next/generation-v2/capability/resolvedCapabilityV2'
import type { CanonicalModelSubjectV1 } from '@/next/generation-v2/model-facts/canonicalSourceFactsV1'
import { runtimeProjectionSourcePathsV1 } from '@/next/generation-v2/capability/runtimeProjectionSourcePathsV1'
import {
  modelFactControlKey,
  modelFactControlPresentation,
  modelFactStateExplanationKey,
  modelFactStateKey,
  type ModelFactControlPresentation,
  type ModelFactPresentationState,
  type PresentableResolvedField,
} from '@/shared/model-facts/modelFactPresentation'
import { t, tf } from '@/shared/i18n'

/**
 * Per-control Model Facts explanations for the active session. Presentation only: states come from the
 * controls projection plus the S1 mapping over already-resolved fields; nothing feeds send-time gating.
 */
export type ModelFactControlExplanationsV1 = Readonly<{
  status: 'loading' | 'ready' | 'failed'
  errorCode: string | null
  subject: CanonicalModelSubjectV1 | null
  controls: Readonly<Record<string, ModelFactControlPresentation>>
}>

/** Structural subset of the Inspector bridge snapshot this module reads. */
export type ModelFactsInspectorSnapshotForControlsV1 = Readonly<{
  sources: readonly Readonly<{
    subjectFact: Readonly<{ payload: Readonly<{ outcomes: readonly Readonly<{ path: string }>[] }> }> | null
  }>[]
  resolved: Readonly<{
    resolvedFacts: Readonly<{ capabilityRevision: string; fields: readonly PresentableResolvedField[] }>
  }> | null
}>

const EMPTY_CONTROLS: Readonly<Record<string, ModelFactControlPresentation>> = Object.freeze({})

export function loadingModelFactControlExplanationsV1(
  subject: CanonicalModelSubjectV1 | null,
): ModelFactControlExplanationsV1 {
  return Object.freeze({ status: 'loading', errorCode: null, subject, controls: EMPTY_CONTROLS })
}

export function failedModelFactControlExplanationsV1(
  errorCode: string,
  subject: CanonicalModelSubjectV1 | null,
): ModelFactControlExplanationsV1 {
  return Object.freeze({ status: 'failed', errorCode, subject, controls: EMPTY_CONTROLS })
}

/**
 * Inspector fields are used only when they describe the same capabilityRevision as the projection;
 * otherwise the projection-only states stand and nothing is guessed.
 */
export function buildModelFactControlExplanationsV1(input: Readonly<{
  projection: GenerationControlsProjectionV2
  subject: CanonicalModelSubjectV1 | null
  inspector?: ModelFactsInspectorSnapshotForControlsV1 | null
}>): ModelFactControlExplanationsV1 {
  const resolved = input.inspector?.resolved?.resolvedFacts
  const matching = resolved && resolved.capabilityRevision === input.projection.capabilityRevision ? resolved : null
  const fieldsByPath = new Map((matching?.fields ?? []).map((field) => [field.path, field]))
  const sources = matching ? input.inspector?.sources ?? [] : []
  const coverageFor = (path: string) => ({
    coveredBySource: sources.some((source) => source.subjectFact?.payload.outcomes.some((outcome) => outcome.path === path) === true),
  })
  const controls = Object.fromEntries(Object.entries(input.projection.controls).map(([runtimePath, control]) => [
    runtimePath,
    modelFactControlPresentation({
      controlState: control.state,
      sourcePaths: runtimeProjectionSourcePathsV1(runtimePath),
      ...(matching ? { resolvedFieldFor: (path: string) => fieldsByPath.get(path), coverageFor } : {}),
    }),
  ]))
  return Object.freeze({ status: 'ready', errorCode: null, subject: input.subject, controls: Object.freeze(controls) })
}

export type ModelFactControlReasonV1 = Readonly<{
  state: ModelFactPresentationState | 'checking'
  label: string
  text: string
  path: string | null
}>

/**
 * User-readable reason why a capability-aware control is unavailable. With several runtime paths, the
 * first one that is not supported explains it; when every path is supported, the control is hidden only
 * because the resolved value does not list the option.
 */
export function modelFactControlReasonV1(
  explanations: ModelFactControlExplanationsV1 | null | undefined,
  runtimePaths: string | readonly string[],
): ModelFactControlReasonV1 | null {
  if (!explanations) return null
  const paths = typeof runtimePaths === 'string' ? [runtimePaths] : runtimePaths
  if (explanations.status === 'loading') {
    return Object.freeze({ state: 'checking', label: t(modelFactControlKey('checking')), text: '', path: null })
  }
  if (explanations.status === 'failed') {
    const path = paths.map((runtimePath) => runtimeProjectionSourcePathsV1(runtimePath)[0]).find((item) => item !== undefined) ?? null
    return Object.freeze({ state: 'data_gap', label: t(modelFactStateKey('data_gap')),
      text: tf(modelFactControlKey('refreshFailed'), { code: explanations.errorCode ?? '' }), path })
  }
  const presentations = paths.map((runtimePath) => explanations.controls[runtimePath])
    .filter((item): item is ModelFactControlPresentation => item !== undefined)
  const decisive = presentations.find((item) => item.state !== 'supported') ?? presentations[0]
  if (!decisive) {
    return Object.freeze({ state: 'unknown', label: t(modelFactStateKey('unknown')),
      text: t(modelFactControlKey('noModelFactsField')), path: null })
  }
  const text = decisive.state === 'supported'
    ? t(modelFactControlKey('notInDomain'))
    : !decisive.mapped && decisive.state === 'unknown'
      ? t(modelFactControlKey('noModelFactsField'))
      : t(modelFactStateExplanationKey(decisive.state))
  return Object.freeze({ state: decisive.state, label: t(modelFactStateKey(decisive.state)), text, path: decisive.path })
}

/** One-line form for a `title` / `aria-label`. */
export function modelFactControlReasonTextV1(reason: ModelFactControlReasonV1 | null): string | null {
  if (!reason) return null
  return reason.text ? tf(modelFactControlKey('reasonLine'), { state: reason.label, explanation: reason.text }) : reason.label
}
