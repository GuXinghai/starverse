import type { ReasoningDisplayBlock } from '@/next/state/types'

export type ReasoningDisplayTextRole = Extract<ReasoningDisplayBlock, { type: 'text' }>['semanticRole']
export type ReasoningDisplayImageRole = Extract<ReasoningDisplayBlock, { type: 'image' }>['semanticRole']

export type ReasoningDisplayBlockInputBase = Readonly<{
  messageId: string
  providerKey: string
  ordinal: number
  sourceEventType?: string
}>

export function createReasoningTextDisplayBlock(input: ReasoningDisplayBlockInputBase & Readonly<{
  text: string
  semanticRole?: ReasoningDisplayTextRole
  blockIdSuffix?: string
}>): ReasoningDisplayBlock | null {
  const text = input.text
  if (text.length === 0) return null
  const ordinal = normalizeDisplayOrdinal(input.ordinal)
  if (ordinal == null) return null

  return {
    blockId: buildReasoningDisplayBlockId(input, ordinal, input.blockIdSuffix ?? 'text'),
    ordinal,
    type: 'text',
    text,
    ...(input.semanticRole ? { semanticRole: input.semanticRole } : {}),
    providerKey: input.providerKey,
    ...(input.sourceEventType ? { sourceEventType: input.sourceEventType } : {}),
  }
}

export function createReasoningImageDisplayBlock(input: ReasoningDisplayBlockInputBase & Readonly<{
  url: string
  mimeType?: string
  width?: number
  height?: number
  alt?: string
  semanticRole?: ReasoningDisplayImageRole
  blockIdSuffix?: string
}>): ReasoningDisplayBlock | null {
  const url = input.url.trim()
  if (!url) return null
  const ordinal = normalizeDisplayOrdinal(input.ordinal)
  if (ordinal == null) return null

  return {
    blockId: buildReasoningDisplayBlockId(input, ordinal, input.blockIdSuffix ?? 'image'),
    ordinal,
    type: 'image',
    url,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    ...(typeof input.width === 'number' ? { width: input.width } : {}),
    ...(typeof input.height === 'number' ? { height: input.height } : {}),
    ...(input.alt ? { alt: input.alt } : {}),
    ...(input.semanticRole ? { semanticRole: input.semanticRole } : {}),
    providerKey: input.providerKey,
    ...(input.sourceEventType ? { sourceEventType: input.sourceEventType } : {}),
  }
}

export function normalizeDisplayOrdinal(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

function buildReasoningDisplayBlockId(
  input: ReasoningDisplayBlockInputBase,
  ordinal: number,
  suffix: string,
): string {
  return [
    input.messageId,
    'reasoning-display',
    sanitizeIdPart(input.providerKey),
    sanitizeIdPart(input.sourceEventType ?? 'event'),
    ordinal,
    sanitizeIdPart(suffix),
  ].join(':')
}

function sanitizeIdPart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_.-]+/g, '_')
  return normalized || 'unknown'
}
