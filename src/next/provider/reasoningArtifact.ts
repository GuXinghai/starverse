export type ReasoningArtifactProvider =
  | 'deepseek'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'google_ai_studio'
  | 'openrouter'

export type ReasoningArtifactKind =
  | 'reasoning_text'
  | 'reasoning_summary'
  | 'thinking_text'
  | 'thought_text'
  | 'signature'
  | 'opaque_reasoning'
  | 'provider_metadata'

export type ReasoningArtifactVisibility =
  | 'hidden_from_visible_text'
  | 'diagnostic_collapsed'
  | 'opaque_not_displayable'

export type ReasoningArtifact = Readonly<{
  id: string
  providerKey: ReasoningArtifactProvider
  messageId?: string
  streamTurnId?: string
  sequence: number
  kind: ReasoningArtifactKind
  visibility: ReasoningArtifactVisibility
  createdAtMs: number
  text?: string
  summaryText?: string
  opaqueRef?: string
  warnings: readonly string[]
  providerSpecific?: Readonly<Record<string, unknown>>
}>

export type ReasoningArtifactCreateInput = Readonly<{
  providerKey: ReasoningArtifactProvider
  messageId?: string
  streamTurnId?: string
  sequence: number
  kind: ReasoningArtifactKind
  visibility: ReasoningArtifactVisibility
  createdAtMs: number
  text?: string
  summaryText?: string
  opaqueRef?: string
  warnings?: readonly string[]
  providerSpecific?: Readonly<Record<string, unknown>>
}>

export type ReasoningArtifactFromDetailInput = Readonly<{
  providerKey: ReasoningArtifactProvider
  detail: unknown
  sequence: number
  createdAtMs: number
  messageId?: string
  streamTurnId?: string
  chunkNo?: number
}>

const SECRET_KEY_PATTERN = /(?:authorization|bearer|api[_-]?key|x-api-key|secret|password|credential|access[_-]?token|refresh[_-]?token|query[_-]?secret)/i
const SECRET_VALUE_PATTERN = /(?:\bBearer\s+\S+|sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{8,}|x-api-key\s+\S+)/i

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.length > 0 ? value : undefined
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function opaqueRef(providerKey: ReasoningArtifactProvider, prefix: string, value: string): string {
  return `${prefix}:${providerKey}:${hashString(value)}:${value.length}`
}

function sanitizeProviderSpecificValue(value: unknown, depth: number): unknown {
  if (depth > 3) return undefined
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERN.test(value)) return undefined
    return value.length > 500 ? `${value.slice(0, 500)}...` : value
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) {
    const out = value
      .slice(0, 20)
      .map((item) => sanitizeProviderSpecificValue(item, depth + 1))
      .filter((item) => item !== undefined)
    return out.length > 0 ? out : undefined
  }
  const record = asRecord(value)
  if (!record) return undefined
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(record)) {
    if (SECRET_KEY_PATTERN.test(key)) continue
    const sanitized = sanitizeProviderSpecificValue(child, depth + 1)
    if (sanitized !== undefined) out[key] = sanitized
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function sanitizeReasoningArtifactProviderSpecific(
  input: Readonly<Record<string, unknown>> | null | undefined,
): Readonly<Record<string, unknown>> | undefined {
  const record = asRecord(input)
  if (!record) return undefined
  const sanitized = sanitizeProviderSpecificValue(record, 0)
  const out = asRecord(sanitized)
  return out && Object.keys(out).length > 0 ? out : undefined
}

export function createReasoningArtifact(input: ReasoningArtifactCreateInput): ReasoningArtifact {
  const providerSpecific = sanitizeReasoningArtifactProviderSpecific(input.providerSpecific)
  return {
    id: `ra_${input.providerKey}_${input.streamTurnId ?? input.messageId ?? 'stream'}_${input.sequence}`,
    providerKey: input.providerKey,
    ...(input.messageId ? { messageId: input.messageId } : {}),
    ...(input.streamTurnId ? { streamTurnId: input.streamTurnId } : {}),
    sequence: input.sequence,
    kind: input.kind,
    visibility: input.visibility,
    createdAtMs: input.createdAtMs,
    ...(input.text ? { text: input.text } : {}),
    ...(input.summaryText ? { summaryText: input.summaryText } : {}),
    ...(input.opaqueRef ? { opaqueRef: input.opaqueRef } : {}),
    warnings: [...(input.warnings ?? [])],
    ...(providerSpecific ? { providerSpecific } : {}),
  }
}

function baseProviderSpecific(input: ReasoningArtifactFromDetailInput, detailType?: string): Record<string, unknown> {
  return {
    ...(detailType ? { providerDetailType: detailType } : {}),
    ...(typeof input.chunkNo === 'number' ? { chunkNo: input.chunkNo } : {}),
  }
}

export function reasoningArtifactFromDetail(input: ReasoningArtifactFromDetailInput): ReasoningArtifact | null {
  const detail = asRecord(input.detail)
  if (!detail) {
    return createReasoningArtifact({
      ...input,
      kind: 'provider_metadata',
      visibility: 'diagnostic_collapsed',
      warnings: ['Reasoning detail was not an object and was captured as provider metadata.'],
    })
  }

  const detailType = asNonEmptyString(detail.type)
  const common = baseProviderSpecific(input, detailType)

  if (input.providerKey === 'deepseek' && detailType === 'reasoning_content') {
    const text = asNonEmptyString(detail.text)
    if (!text) return null
    return createReasoningArtifact({
      ...input,
      kind: 'reasoning_text',
      visibility: 'hidden_from_visible_text',
      text,
      providerSpecific: common,
    })
  }

  if (input.providerKey === 'openai_responses') {
    if (detailType === 'reasoning_summary') {
      const summaryText = asNonEmptyString(detail.text)
      if (!summaryText) return null
      return createReasoningArtifact({
        ...input,
        kind: 'reasoning_summary',
        visibility: 'diagnostic_collapsed',
        summaryText,
        providerSpecific: common,
      })
    }
    if (detailType === 'reasoning_text') {
      const text = asNonEmptyString(detail.text)
      if (!text) return null
      return createReasoningArtifact({
        ...input,
        kind: 'reasoning_text',
        visibility: 'hidden_from_visible_text',
        text,
        providerSpecific: common,
      })
    }
    if (detailType === 'reasoning_item') {
      const encrypted = asNonEmptyString(detail.encrypted_content)
      const itemId = asNonEmptyString(detail.id)
      const summary = Array.isArray(detail.summary) ? detail.summary : []
      return createReasoningArtifact({
        ...input,
        kind: 'opaque_reasoning',
        visibility: 'opaque_not_displayable',
        opaqueRef: encrypted
          ? opaqueRef(input.providerKey, 'opaque-reasoning', encrypted)
          : itemId
            ? `opaque-reasoning:${input.providerKey}:${itemId}`
            : `opaque-reasoning:${input.providerKey}:${input.sequence}`,
        warnings: ['OpenAI opaque reasoning item is not displayable and is not treated as visible text.'],
        providerSpecific: {
          ...common,
          ...(itemId ? { itemId } : {}),
          ...(asNonEmptyString(detail.status) ? { status: detail.status } : {}),
          summaryCount: summary.length,
        },
      })
    }
  }

  if (input.providerKey === 'anthropic_messages') {
    if (detailType === 'thinking_delta') {
      const text = asNonEmptyString(detail.thinking)
      if (!text) return null
      return createReasoningArtifact({
        ...input,
        kind: 'thinking_text',
        visibility: 'hidden_from_visible_text',
        text,
        providerSpecific: common,
      })
    }
    if (detailType === 'signature_delta') {
      const signature = asNonEmptyString(detail.signature)
      if (!signature) return null
      return createReasoningArtifact({
        ...input,
        kind: 'signature',
        visibility: 'opaque_not_displayable',
        opaqueRef: opaqueRef(input.providerKey, 'provider-signature', signature),
        warnings: ['Anthropic signature is provider metadata, not human-readable reasoning text.'],
        providerSpecific: common,
      })
    }
  }

  if (input.providerKey === 'google_ai_studio' && detailType === 'thought') {
    const text = asNonEmptyString(detail.text)
    if (!text) return null
    return createReasoningArtifact({
      ...input,
      kind: 'thought_text',
      visibility: 'hidden_from_visible_text',
      text,
      providerSpecific: common,
    })
  }

  if (input.providerKey === 'openrouter') {
    if (detailType === 'reasoning.text') {
      const text = asNonEmptyString(detail.text)
      if (!text) return null
      return createReasoningArtifact({
        ...input,
        kind: 'reasoning_text',
        visibility: 'hidden_from_visible_text',
        text,
        providerSpecific: common,
      })
    }
    if (detailType === 'reasoning.summary') {
      const summaryText = asNonEmptyString(detail.summary) ?? asNonEmptyString(detail.text)
      if (!summaryText) return null
      return createReasoningArtifact({
        ...input,
        kind: 'reasoning_summary',
        visibility: 'diagnostic_collapsed',
        summaryText,
        providerSpecific: common,
      })
    }
    if (detailType === 'reasoning.encrypted') {
      const data = asNonEmptyString(detail.data)
      return createReasoningArtifact({
        ...input,
        kind: 'opaque_reasoning',
        visibility: 'opaque_not_displayable',
        ...(data ? { opaqueRef: opaqueRef(input.providerKey, 'opaque-reasoning', data) } : {}),
        warnings: ['Opaque OpenRouter reasoning detail is not displayable.'],
        providerSpecific: common,
      })
    }
  }

  if (asNonEmptyString(detail.encrypted_content) || asNonEmptyString(detail.data)) {
    const opaque = asNonEmptyString(detail.encrypted_content) ?? asNonEmptyString(detail.data)
    return createReasoningArtifact({
      ...input,
      kind: 'opaque_reasoning',
      visibility: 'opaque_not_displayable',
      ...(opaque ? { opaqueRef: opaqueRef(input.providerKey, 'opaque-reasoning', opaque) } : {}),
      warnings: ['Unknown opaque reasoning detail is not displayable.'],
      providerSpecific: common,
    })
  }

  return createReasoningArtifact({
    ...input,
    kind: 'provider_metadata',
    visibility: 'diagnostic_collapsed',
    warnings: ['Unknown provider reasoning detail was captured as metadata only.'],
    providerSpecific: common,
  })
}

export function reasoningArtifactPreviewText(artifact: ReasoningArtifact): string {
  if (artifact.kind === 'signature') return 'Provider signature metadata; not displayable as reasoning text.'
  if (artifact.kind === 'opaque_reasoning') return 'Opaque reasoning; not displayable.'
  const value = artifact.summaryText ?? artifact.text ?? ''
  return value.length > 240 ? `${value.slice(0, 240)}...` : value
}
