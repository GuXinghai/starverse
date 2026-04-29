import type { OpenRouterFileParserEngine } from '../../src/next/openrouter/buildRequest'

export type OpenRouterDerivativeTransport = Readonly<{
  apiKey: string
  baseUrl?: string | null
  timeoutMs?: number | null
}>

export type OpenRouterTranscriptRequest = Readonly<{
  modelId: string
  prompt: string
  audioBase64: string
  audioFormat: string
  pdfFileParserEngine?: OpenRouterFileParserEngine | null
}>

export type OpenRouterTranscriptResult = Readonly<{
  text: string
  usage: Record<string, unknown> | null
  responseId: string | null
}>

export type OpenRouterEmbeddingRequest = Readonly<{
  modelId: string
  input: string | string[]
}>

export type OpenRouterEmbeddingResult = Readonly<{
  responseId: string | null
  model: string
  usage: Record<string, unknown> | null
  embeddings: Array<Readonly<{ index: number; embedding: number[] }>>
}>

export async function requestTranscriptFromOpenRouter(
  transport: OpenRouterDerivativeTransport,
  request: OpenRouterTranscriptRequest
): Promise<OpenRouterTranscriptResult> {
  const json = await postJson(
    transport,
    '/chat/completions',
    {
      model: request.modelId,
      stream: false,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: request.prompt },
            {
              type: 'input_audio',
              input_audio: {
                data: request.audioBase64,
                format: request.audioFormat,
              },
            },
          ],
        },
      ],
    }
  )

  const choice = Array.isArray(json?.choices) ? json.choices[0] : null
  const message = choice?.message
  const text = extractChatMessageText(message)
  return {
    text,
    usage: toPlainObject(json?.usage),
    responseId: typeof json?.id === 'string' ? json.id : null,
  }
}

export async function requestEmbeddingsFromOpenRouter(
  transport: OpenRouterDerivativeTransport,
  request: OpenRouterEmbeddingRequest
): Promise<OpenRouterEmbeddingResult> {
  const json = await postJson(
    transport,
    '/embeddings',
    {
      model: request.modelId,
      input: request.input,
    }
  )

  const rows = Array.isArray(json?.data) ? json.data : []
  return {
    responseId: typeof json?.id === 'string' ? json.id : null,
    model: typeof json?.model === 'string' ? json.model : request.modelId,
    usage: toPlainObject(json?.usage),
    embeddings: rows.map((row: any, index: number) => ({
      index: typeof row?.index === 'number' ? row.index : index,
      embedding: Array.isArray(row?.embedding)
        ? row.embedding.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value))
        : [],
    })),
  }
}

async function postJson(
  transport: OpenRouterDerivativeTransport,
  pathname: string,
  body: Record<string, unknown>
): Promise<any> {
  const apiKey = String(transport.apiKey ?? '').trim()
  if (!apiKey) throw new Error('Missing OpenRouter API key')

  const baseUrl = String(transport.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const controller = new AbortController()
  const timeoutMs =
    typeof transport.timeoutMs === 'number' && Number.isFinite(transport.timeoutMs) && transport.timeoutMs > 0
      ? Math.floor(transport.timeoutMs)
      : 60_000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
        'X-Title': 'Starverse',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`OpenRouter HTTP ${response.status}: ${truncateForError(text)}`)
    }
    return text ? JSON.parse(text) : {}
  } finally {
    clearTimeout(timeoutId)
  }
}

function extractChatMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as any).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part: any) => {
      if (part?.type === 'text' && typeof part?.text === 'string') return part.text
      return ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function truncateForError(value: string): string {
  const normalized = String(value ?? '').trim()
  if (normalized.length <= 300) return normalized
  return `${normalized.slice(0, 300)}…`
}

function toPlainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
