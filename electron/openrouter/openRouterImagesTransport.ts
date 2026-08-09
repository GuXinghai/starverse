import type { ProviderFetch } from '../net/providerHttpTransport'

export type OpenRouterImagesTransportResult = Readonly<{
  status: number
  headers: Readonly<Record<string, string>>
  body: unknown
}>

export async function postOpenRouterImagesExactBody(input: Readonly<{
  baseUrl: string
  apiKey: string
  serializedBody: string
  fetchImpl: ProviderFetch
  signal?: AbortSignal
}>): Promise<OpenRouterImagesTransportResult> {
  if (!input.serializedBody.trim()) throw new Error('serializedBody must be non-empty')
  const response = await input.fetchImpl(`${input.baseUrl.replace(/\/+$/, '')}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: input.serializedBody,
    signal: input.signal,
  })
  const responseText = await response.text()
  let body: unknown = null
  if (responseText.trim()) {
    try {
      body = JSON.parse(responseText)
    } catch {
      body = responseText
    }
  }
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => { headers[key] = value })
  if (!response.ok) {
    throw Object.assign(new Error(`OPENROUTER_IMAGES_HTTP_${response.status}`), {
      status: response.status,
      responseBody: body,
    })
  }
  return { status: response.status, headers, body }
}
