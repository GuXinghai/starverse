import {
  CANONICAL_MODEL_FACT_PATHS_V1,
  canonicalizeCanonicalModelSubjectV1,
  canonicalizeRawPayloadRefV1,
  type CanonicalSemanticPathV1,
} from '../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import type { ModelFactsInspectorReadAuthorityV1 } from '../services/modelFactsInspectorV1Service'
import type { RegisterInvoke } from './types'

export const GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_CHANNELS = Object.freeze([
  'generation-v2:model-facts:search-subjects',
  'generation-v2:model-facts:read-inspector',
  'generation-v2:model-facts:read-evidence-slice',
  'generation-v2:model-facts:read-sanitized-raw-payload',
] as const)

function invalid(): never { throw new Error('GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_INVALID') }

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid()
}

function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) invalid()
  return value
}

function sourceKind(value: unknown): 'provider_native' | 'models_dev' | 'capability_rule' {
  if (value !== 'provider_native' && value !== 'models_dev' && value !== 'capability_rule') invalid()
  return value
}

function semanticPath(value: unknown): CanonicalSemanticPathV1 {
  if (typeof value !== 'string' || !(CANONICAL_MODEL_FACT_PATHS_V1 as readonly string[]).includes(value)) invalid()
  return value as CanonicalSemanticPathV1
}

export function registerGenerationV2ModelFactsInspectorIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  service: ModelFactsInspectorReadAuthorityV1
}>): readonly string[] {
  const register = (channel: string, handler: (payload: unknown) => unknown | Promise<unknown>) =>
    input.registerInvoke(channel, (_event, payload) => handler(payload))

  register(GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_CHANNELS[0], (value) => {
    if (!plainObject(value)) invalid()
    const keys = ['limit']
    if (value.query !== undefined) keys.push('query')
    if (value.cursor !== undefined) keys.push('cursor')
    exactKeys(value, keys)
    if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 200) invalid()
    if (value.query !== undefined && (typeof value.query !== 'string' || value.query.length > 512)) invalid()
    if (value.cursor !== undefined && value.cursor !== null) boundedText(value.cursor, 4096)
    return input.service.searchSubjects({ limit: value.limit as number,
      ...(value.query === undefined ? {} : { query: value.query as string }),
      ...(value.cursor === undefined ? {} : { cursor: value.cursor as string | null }) })
  })
  register(GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_CHANNELS[1], (value) => {
    if (!plainObject(value)) invalid()
    const keys = ['subject']
    if (value.expectedSubjectSetRevision !== undefined) keys.push('expectedSubjectSetRevision')
    exactKeys(value, keys)
    return input.service.readInspectorSnapshot({ subject: canonicalizeCanonicalModelSubjectV1(value.subject),
      ...(value.expectedSubjectSetRevision === undefined ? {} : {
        expectedSubjectSetRevision: boundedText(value.expectedSubjectSetRevision, 256) }) })
  })
  register(GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_CHANNELS[2], (value) => {
    if (!plainObject(value)) invalid()
    const keys = ['path', 'sourceKind', 'sourceScopeId', 'subject']
    if (value.expectedSubjectSetRevision !== undefined) keys.push('expectedSubjectSetRevision')
    exactKeys(value, keys)
    return input.service.readEvidenceSlice({ subject: canonicalizeCanonicalModelSubjectV1(value.subject),
      sourceKind: sourceKind(value.sourceKind), sourceScopeId: boundedText(value.sourceScopeId, 1024),
      path: semanticPath(value.path), ...(value.expectedSubjectSetRevision === undefined ? {} : {
        expectedSubjectSetRevision: boundedText(value.expectedSubjectSetRevision, 256) }) })
  })
  register(GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_CHANNELS[3], (value) => {
    if (!plainObject(value)) invalid()
    exactKeys(value, ['rawPayloadRef'])
    return input.service.readSanitizedRawPayload(canonicalizeRawPayloadRefV1(value.rawPayloadRef))
  })
  return GENERATION_V2_MODEL_FACTS_INSPECTOR_IPC_CHANNELS
}
