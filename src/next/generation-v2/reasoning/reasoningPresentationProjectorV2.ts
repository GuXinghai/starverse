import type {
  ReasoningDisplayBlock,
  ReasoningViewVisibility,
} from '../../state/types'

export type ReasoningPresentationProjectorV2Input = Readonly<{
  providerId: string
  contractId: string
  modelId: string
  answerRootId: string
  orderedFacts: readonly Readonly<Record<string, unknown>>[]
}>

export type ReasoningPresentationV2 = Readonly<{
  displayBlocks: readonly ReasoningDisplayBlock[]
  visibility: ReasoningViewVisibility
  recognizedFactCount: number
  unrecognizedFactCount: number
}>

export type ReasoningPresentationProjectorV2 = (
  input: ReasoningPresentationProjectorV2Input,
) => ReasoningPresentationV2

type TextRole = Extract<ReasoningDisplayBlock, { type: 'text' }>['semanticRole']
type OpaqueKind = NonNullable<Extract<ReasoningDisplayBlock, { type: 'opaque' }>['opaqueKind']>
type ProjectedPiece =
  | Readonly<{ kind: 'text'; text: string; role: TextRole; sourceEventType: string }>
  | Readonly<{ kind: 'image'; url: string; mimeType?: string; role: TextRole; sourceEventType: string }>
  | Readonly<{ kind: 'opaque'; opaqueKind: OpaqueKind; sourceEventType: string }>
  | Readonly<{ kind: 'hidden' }>

type FactProjection = Readonly<{ recognized: boolean; piece?: ProjectedPiece }>
type ContractProjector = (fact: Readonly<Record<string, unknown>>) => FactProjection

const CONTRACT_PROVIDERS = Object.freeze({
  'gemini-generate-content-v1beta': 'google_ai_studio',
  'gemini-interactions-v1beta': 'google_ai_studio',
  'openai-responses-v1': 'openai_responses',
  'anthropic-messages-2023-06-01': 'anthropic',
  'deepseek-stable-chat-v1': 'deepseek',
  'openrouter-chat-completions-v1': 'openrouter',
  'ollama-chat-v1': 'ollama',
  'lmstudio-openresponses': 'lmstudio',
} as const)

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null
}

function hidden(): FactProjection {
  return Object.freeze({ recognized: true, piece: Object.freeze({ kind: 'hidden' as const }) })
}

function unknown(): FactProjection {
  return Object.freeze({ recognized: false })
}

function text(value: unknown, role: TextRole, sourceEventType: string): FactProjection {
  const normalized = nonEmptyString(value)
  return normalized === null
    ? unknown()
    : Object.freeze({ recognized: true, piece: Object.freeze({
      kind: 'text' as const, text: normalized, role, sourceEventType,
    }) })
}

function opaque(opaqueKind: OpaqueKind, sourceEventType: string): FactProjection {
  return Object.freeze({ recognized: true, piece: Object.freeze({
    kind: 'opaque' as const, opaqueKind, sourceEventType,
  }) })
}

function safeReasoningImageUrl(value: unknown): string | null {
  const url = nonEmptyString(value)
  if (url === null) return null
  return /^data:image\/[a-z0-9.+-]+;base64,/iu.test(url) || url.startsWith('asset://') ? url : null
}

function geminiGenerateContent(fact: Readonly<Record<string, unknown>>): FactProjection {
  if (fact.type === 'thought_signature') return hidden()
  if (fact.type !== 'thought') return unknown()
  const value = nonEmptyString(fact.text)
  if (value !== null) return text(value, 'summary', 'thought')
  return nonEmptyString(fact.thoughtSignature) !== null || nonEmptyString(fact.thought_signature) !== null
    ? hidden()
    : unknown()
}

function geminiInteractions(fact: Readonly<Record<string, unknown>>): FactProjection {
  if (fact.type === 'thought_signature') return hidden()
  if (fact.type === 'google_search_call' || fact.type === 'google_search_result' || fact.type === 'url_citation') {
    return hidden()
  }
  if (fact.type === 'thought_summary') {
    return text(fact.summary ?? fact.text, 'summary', 'thought_summary')
  }
  if (fact.type !== 'thought_image') return unknown()
  const image = record(fact.image)
  const url = safeReasoningImageUrl(image?.url)
  if (url === null) return unknown()
  const mimeType = nonEmptyString(image?.mimeType) ?? undefined
  return Object.freeze({ recognized: true, piece: Object.freeze({
    kind: 'image' as const, url, ...(mimeType ? { mimeType } : {}),
    role: 'summary' as const, sourceEventType: 'thought_image',
  }) })
}

function openAIResponses(fact: Readonly<Record<string, unknown>>): FactProjection {
  if (fact.type === 'summary_text' || fact.type === 'reasoning_summary') {
    return text(fact.text ?? fact.summary, 'summary', String(fact.type))
  }
  if (fact.type === 'reasoning.encrypted' ||
      fact.type === 'reasoning_item' && nonEmptyString(fact.encrypted_content) !== null) {
    return opaque('encrypted', String(fact.type))
  }
  return unknown()
}

function anthropicMessages(fact: Readonly<Record<string, unknown>>): FactProjection {
  if (fact.type === 'redacted_thinking') return opaque('redacted', 'redacted_thinking')
  if (fact.type === 'thinking_omitted') return opaque('omitted', 'thinking_omitted')
  if (fact.type === 'signature_delta') return hidden()
  if (fact.type !== 'thinking') return unknown()
  const value = nonEmptyString(fact.text ?? fact.thinking)
  if (value !== null) return text(value, 'thinking', 'thinking')
  return nonEmptyString(fact.signature) !== null ? opaque('omitted', 'thinking') : unknown()
}

function thoughtText(role: TextRole, sourceEventType: string): ContractProjector {
  return (fact) => {
    if (fact.type === sourceEventType || fact.type === 'thought') {
      return text(fact.text ?? fact.reasoning_content, role, String(fact.type))
    }
    return unknown()
  }
}

function openRouter(fact: Readonly<Record<string, unknown>>): FactProjection {
  if (fact.type === 'reasoning.text') return text(fact.text, 'reasoning', 'reasoning.text')
  if (fact.type === 'reasoning.summary') return text(fact.summary ?? fact.text, 'summary', 'reasoning.summary')
  if (fact.type === 'thought_summary') return text(fact.summary ?? fact.text, 'thought', 'thought_summary')
  if (fact.type === 'thought_image') {
    const image = record(fact.image)
    const url = safeReasoningImageUrl(image?.url)
    if (url === null) return unknown()
    const mimeType = nonEmptyString(image?.mimeType) ?? undefined
    return Object.freeze({ recognized: true, piece: Object.freeze({
      kind: 'image' as const, url, ...(mimeType ? { mimeType } : {}),
      role: 'thought' as const, sourceEventType: 'thought_image',
    }) })
  }
  if (fact.type === 'reasoning.encrypted') return opaque('encrypted', 'reasoning.encrypted')
  return unknown()
}

const PROJECTORS: Readonly<Record<keyof typeof CONTRACT_PROVIDERS, ContractProjector>> = Object.freeze({
  'gemini-generate-content-v1beta': geminiGenerateContent,
  'gemini-interactions-v1beta': geminiInteractions,
  'openai-responses-v1': openAIResponses,
  'anthropic-messages-2023-06-01': anthropicMessages,
  'deepseek-stable-chat-v1': thoughtText('reasoning', 'reasoning_content'),
  'openrouter-chat-completions-v1': openRouter,
  'ollama-chat-v1': thoughtText('thinking', 'thinking'),
  'lmstudio-openresponses': (fact) => fact.type === 'summary_text'
    ? text(fact.text ?? fact.summary, 'summary', 'summary_text')
    : thoughtText('reasoning', 'reasoning_text')(fact),
})

function opaqueLabel(kind: OpaqueKind): string {
  if (kind === 'omitted') return 'Reasoning was omitted by the provider.'
  if (kind === 'redacted') return 'Reasoning was redacted by the provider.'
  return 'Encrypted reasoning was returned by the provider.'
}

export const projectReasoningPresentationV2: ReasoningPresentationProjectorV2 = (input) => {
  const expectedProvider = CONTRACT_PROVIDERS[input.contractId as keyof typeof CONTRACT_PROVIDERS]
  const projector = PROJECTORS[input.contractId as keyof typeof PROJECTORS]
  if (!projector || expectedProvider !== input.providerId) {
    return Object.freeze({
      displayBlocks: Object.freeze([]),
      visibility: 'not_returned',
      recognizedFactCount: 0,
      unrecognizedFactCount: input.orderedFacts.length,
    })
  }

  const blocks: ReasoningDisplayBlock[] = []
  let recognizedFactCount = 0
  let unrecognizedFactCount = 0

  for (const fact of input.orderedFacts) {
    const projected = projector(fact)
    if (!projected.recognized) {
      unrecognizedFactCount += 1
      continue
    }
    recognizedFactCount += 1
    const piece = projected.piece
    if (!piece || piece.kind === 'hidden') continue

    const previous = blocks.at(-1)
    if (piece.kind === 'text' && previous?.type === 'text' && previous.semanticRole === piece.role) {
      blocks[blocks.length - 1] = Object.freeze({ ...previous, text: `${previous.text}${piece.text}` })
      continue
    }

    const ordinal = blocks.length
    const base = {
      blockId: `${input.contractId}:${input.answerRootId}:reasoning:${ordinal}`,
      ordinal,
      providerKey: input.providerId,
      sourceEventType: piece.sourceEventType,
    }
    if (piece.kind === 'text') {
      blocks.push(Object.freeze({ ...base, type: 'text', text: piece.text, semanticRole: piece.role }))
    } else if (piece.kind === 'image') {
      blocks.push(Object.freeze({ ...base, type: 'image', url: piece.url,
        ...(piece.mimeType ? { mimeType: piece.mimeType } : {}), semanticRole: piece.role }))
    } else {
      blocks.push(Object.freeze({ ...base, type: 'opaque', opaqueKind: piece.opaqueKind,
        label: opaqueLabel(piece.opaqueKind) }))
    }
  }

  return Object.freeze({
    displayBlocks: Object.freeze(blocks),
    visibility: blocks.length > 0 ? 'shown' : 'not_returned',
    recognizedFactCount,
    unrecognizedFactCount,
  })
}
