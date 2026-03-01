export type ImageCapabilityClass = 'text_and_image' | 'image_only'

export type ImageModelFilterReason =
  | 'missing_image_output'
  | 'missing_text_input'
  | 'inactive_status'
  | 'hidden_visibility'
  | 'expired_model'
  | 'endpoint_unavailable'

export type ImageGenerationModel = Readonly<{
  modelId: string
  inputModalities?: ReadonlyArray<string> | null
  outputModalities?: ReadonlyArray<string> | null
  status?: string | null
  visibility?: string | null
  expirationAtSec?: number | null
  endpointAvailable?: boolean | null
}>

export type EvaluateImageModelOptions = Readonly<{
  nowSec?: number
  requireActive?: boolean
  requireVisible?: boolean
  requireTextInput?: boolean
  requireEndpointAvailable?: boolean
}>

export type ImageModelEligibility = Readonly<{
  eligible: boolean
  capabilityClass: ImageCapabilityClass | null
  reasons: ImageModelFilterReason[]
}>

export type ImageReferenceModelSelection = Readonly<{
  textAndImageModelId: string | null
  imageOnlyModelId: string | null
  eligibleModelIds: string[]
}>

export type ModelCountBaselineStatus = 'ok' | 'probe_missing' | 'possible_subset'

export type ModelCountBaselineCheck = Readonly<{
  status: ModelCountBaselineStatus
  listedModelCount: number
  countProbe: number | null
  delta: number | null
}>

function normalizeString(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeModalities(input: ReadonlyArray<string> | null | undefined): string[] {
  if (!Array.isArray(input)) return []
  const out = new Set<string>()
  for (const raw of input) {
    const normalized = normalizeString(raw)
    if (!normalized) continue
    out.add(normalized)
  }
  return Array.from(out.values())
}

function toNowSec(value?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  return Math.floor(Date.now() / 1000)
}

function normalizeCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0) return null
  return Math.floor(value)
}

function normalizeListedCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value <= 0) return 0
  return Math.floor(value)
}

export function evaluateImageGenerationModel(
  model: ImageGenerationModel,
  options: EvaluateImageModelOptions = {}
): ImageModelEligibility {
  const reasons: ImageModelFilterReason[] = []

  const nowSec = toNowSec(options.nowSec)
  const requireActive = options.requireActive !== false
  const requireVisible = options.requireVisible !== false
  const requireTextInput = options.requireTextInput !== false
  const requireEndpointAvailable = options.requireEndpointAvailable === true

  const inputModalities = normalizeModalities(model.inputModalities)
  const outputModalities = normalizeModalities(model.outputModalities)
  const hasImageOutput = outputModalities.includes('image')
  const hasTextOutput = outputModalities.includes('text')
  const hasTextInput = inputModalities.includes('text')

  let capabilityClass: ImageCapabilityClass | null = null
  if (!hasImageOutput) {
    reasons.push('missing_image_output')
  } else {
    capabilityClass = hasTextOutput ? 'text_and_image' : 'image_only'
  }

  if (requireTextInput && !hasTextInput) {
    reasons.push('missing_text_input')
  }

  const status = normalizeString(model.status)
  if (requireActive && status && status !== 'active') {
    reasons.push('inactive_status')
  }

  const visibility = normalizeString(model.visibility)
  if (requireVisible && visibility && visibility !== 'visible') {
    reasons.push('hidden_visibility')
  }

  const expirationAtSec = normalizeCount(model.expirationAtSec)
  if (expirationAtSec !== null && expirationAtSec <= nowSec) {
    reasons.push('expired_model')
  }
  if (requireEndpointAvailable && model.endpointAvailable === false) {
    reasons.push('endpoint_unavailable')
  }

  return {
    eligible: reasons.length === 0 && capabilityClass !== null,
    capabilityClass,
    reasons,
  }
}

export function resolveImageGenerationRequestModalities(
  capabilityClass: ImageCapabilityClass
): ReadonlyArray<'image' | 'text'> {
  if (capabilityClass === 'text_and_image') return ['image', 'text']
  return ['image']
}

export function selectImageGenerationReferenceModels(
  models: ReadonlyArray<ImageGenerationModel>,
  options: EvaluateImageModelOptions = {}
): ImageReferenceModelSelection {
  let textAndImageModelId: string | null = null
  let imageOnlyModelId: string | null = null
  const eligibleModelIds: string[] = []

  for (const model of models) {
    const modelId = String(model.modelId ?? '').trim()
    if (!modelId) continue
    const result = evaluateImageGenerationModel(model, options)
    if (!result.eligible || !result.capabilityClass) continue
    eligibleModelIds.push(modelId)
    if (result.capabilityClass === 'text_and_image' && textAndImageModelId == null) {
      textAndImageModelId = modelId
      continue
    }
    if (result.capabilityClass === 'image_only' && imageOnlyModelId == null) {
      imageOnlyModelId = modelId
    }
  }

  return {
    textAndImageModelId,
    imageOnlyModelId,
    eligibleModelIds,
  }
}

export function evaluateModelCountBaseline(
  listedModelCount: number,
  countProbe: number | null | undefined
): ModelCountBaselineCheck {
  const normalizedListed = normalizeListedCount(listedModelCount)
  const normalizedProbe = normalizeCount(countProbe)

  if (normalizedProbe === null) {
    return {
      status: 'probe_missing',
      listedModelCount: normalizedListed,
      countProbe: null,
      delta: null,
    }
  }

  const delta = normalizedProbe - normalizedListed
  if (normalizedListed < normalizedProbe) {
    return {
      status: 'possible_subset',
      listedModelCount: normalizedListed,
      countProbe: normalizedProbe,
      delta,
    }
  }

  return {
    status: 'ok',
    listedModelCount: normalizedListed,
    countProbe: normalizedProbe,
    delta,
  }
}
