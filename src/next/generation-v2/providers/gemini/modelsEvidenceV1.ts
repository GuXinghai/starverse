import { sha256PreparedBytesV2, stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'

export const GEMINI_MODELS_EVIDENCE_MAX_BYTES_V1 = 8 * 1_024 * 1_024

export type GeminiModelVisibilityRecordV1 = Readonly<{
  name: string
  baseModelId: string
  version: string
  displayName: string
  description: string
  inputTokenLimit: number
  outputTokenLimit: number
  supportedGenerationMethods: readonly string[]
  temperature?: number
  maxTemperature?: number
  topP?: number
  topK?: number
}>

export type GeminiModelsEvidenceV1 = Readonly<{
  schemaVersion: 1
  models: readonly GeminiModelVisibilityRecordV1[]
  nextPageToken: string | null
  canonicalJson: string
  responseDigest: string
  responseRevision: string
}>

export class GeminiModelsEvidenceV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_MODELS_EVIDENCE_INVALID'
    | 'GENERATION_V2_GEMINI_MODELS_EVIDENCE_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'GeminiModelsEvidenceV1Error'
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new GeminiModelsEvidenceV1Error('GENERATION_V2_GEMINI_MODELS_EVIDENCE_INVALID')
  }
  return value as Readonly<Record<string, unknown>>
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new GeminiModelsEvidenceV1Error('GENERATION_V2_GEMINI_MODELS_EVIDENCE_INVALID')
  return value
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new GeminiModelsEvidenceV1Error('GENERATION_V2_GEMINI_MODELS_EVIDENCE_INVALID')
  }
  return value as number
}

function optionalFinite(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GeminiModelsEvidenceV1Error('GENERATION_V2_GEMINI_MODELS_EVIDENCE_INVALID')
  }
  return value
}

function decodeModel(value: unknown): GeminiModelVisibilityRecordV1 {
  const input = record(value)
  const allowed = ['name', 'baseModelId', 'version', 'displayName', 'description', 'inputTokenLimit',
    'outputTokenLimit', 'supportedGenerationMethods', 'temperature', 'maxTemperature', 'topP', 'topK']
  if (Object.keys(input).some((key) => !allowed.includes(key)) || !Array.isArray(input.supportedGenerationMethods) ||
      input.supportedGenerationMethods.some((item) => typeof item !== 'string' || item.length === 0) ||
      new Set(input.supportedGenerationMethods).size !== input.supportedGenerationMethods.length) {
    throw new GeminiModelsEvidenceV1Error('GENERATION_V2_GEMINI_MODELS_EVIDENCE_INVALID')
  }
  const name = text(input.name)
  const baseModelId = text(input.baseModelId)
  if (name !== `models/${baseModelId}` || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(baseModelId)) {
    throw new GeminiModelsEvidenceV1Error('GENERATION_V2_GEMINI_MODELS_EVIDENCE_INVALID')
  }
  return Object.freeze({
    name,
    baseModelId,
    version: text(input.version),
    displayName: text(input.displayName),
    description: text(input.description),
    inputTokenLimit: nonnegativeInteger(input.inputTokenLimit),
    outputTokenLimit: nonnegativeInteger(input.outputTokenLimit),
    supportedGenerationMethods: Object.freeze([...input.supportedGenerationMethods] as string[]),
    ...(input.temperature === undefined ? {} : { temperature: optionalFinite(input.temperature)! }),
    ...(input.maxTemperature === undefined ? {} : { maxTemperature: optionalFinite(input.maxTemperature)! }),
    ...(input.topP === undefined ? {} : { topP: optionalFinite(input.topP)! }),
    ...(input.topK === undefined ? {} : { topK: optionalFinite(input.topK)! }),
  })
}

export function decodeGeminiModelsEvidenceV1(value: unknown): GeminiModelsEvidenceV1 {
  const input = record(value)
  if (Object.keys(input).some((key) => !['models', 'nextPageToken'].includes(key)) || !Array.isArray(input.models) ||
      input.models.length === 0 || input.models.length > 10_000 ||
      (input.nextPageToken !== undefined && (typeof input.nextPageToken !== 'string' || input.nextPageToken.length === 0))) {
    throw new GeminiModelsEvidenceV1Error('GENERATION_V2_GEMINI_MODELS_EVIDENCE_INVALID')
  }
  const models = input.models.map(decodeModel)
  if (new Set(models.map((model) => model.baseModelId)).size !== models.length) {
    throw new GeminiModelsEvidenceV1Error('GENERATION_V2_GEMINI_MODELS_EVIDENCE_INVALID')
  }
  const projection = Object.freeze({
    schemaVersion: 1 as const,
    models: Object.freeze(models),
    nextPageToken: typeof input.nextPageToken === 'string' ? input.nextPageToken : null,
  })
  let canonicalJson: string
  try {
    canonicalJson = stableSerializeProviderRequestBoundedV2(projection, GEMINI_MODELS_EVIDENCE_MAX_BYTES_V1)
  } catch {
    throw new GeminiModelsEvidenceV1Error('GENERATION_V2_GEMINI_MODELS_EVIDENCE_LIMIT_EXCEEDED')
  }
  const responseDigest = sha256PreparedBytesV2(new TextEncoder().encode(canonicalJson))
  return Object.freeze({ ...projection, canonicalJson, responseDigest,
    responseRevision: `gemini-models-v1:${responseDigest}` })
}
