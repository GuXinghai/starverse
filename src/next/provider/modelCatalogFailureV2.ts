import {
  createProviderFailureV2,
  type ProviderFailureV2,
} from '../../shared/provider/providerFailureV2'

export type ProviderModelResponseBodyV2 = Readonly<{
  text: string
  payload: unknown
}>

export async function readProviderModelResponseBodyV2(response: Response): Promise<ProviderModelResponseBodyV2> {
  const text = await response.text()
  if (!text.trim()) return Object.freeze({ text, payload: {} })
  try {
    return Object.freeze({ text, payload: JSON.parse(text) as unknown })
  } catch {
    return Object.freeze({ text, payload: null })
  }
}

function responseHeaders(response: Response): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => { headers[key] = value })
  return Object.freeze(headers)
}

export function providerModelHttpFailureV2(input: Readonly<{
  providerId: string
  contractId: string
  observedAtMs: number
  requestSequence: number
  response: Response
  body: ProviderModelResponseBodyV2
}>): ProviderFailureV2 {
  return createProviderFailureV2({
    context: {
      origin: 'http_response',
      phase: 'response_headers',
      providerId: input.providerId,
      contractId: input.contractId,
      operationId: `model-catalog:${input.providerId}:${input.observedAtMs}`,
      requestSequence: input.requestSequence,
      starverseDiagnosticCode: 'MODEL_CATALOG_PROVIDER_HTTP_ERROR',
    },
    httpStatus: input.response.status,
    httpStatusText: input.response.statusText,
    bodyText: input.body.text,
    headers: responseHeaders(input.response),
  })
}

export function providerModelTransportFailureV2(input: Readonly<{
  providerId: string
  contractId: string
  observedAtMs: number
  requestSequence: number
  error: unknown
  credential?: string
}>): ProviderFailureV2 {
  const failure = createProviderFailureV2({
    context: {
      origin: 'network_transport',
      phase: 'request_open',
      providerId: input.providerId,
      contractId: input.contractId,
      operationId: `model-catalog:${input.providerId}:${input.observedAtMs}`,
      requestSequence: input.requestSequence,
      starverseDiagnosticCode: 'MODEL_CATALOG_REQUEST_OPEN_FAILED',
    },
    transportError: input.error,
  })
  const credential = input.credential?.trim()
  if (!credential || !failure.transportError) return failure
  const redact = (value: string | null) => value === null ? null : value.split(credential).join('[redacted]')
  const transportError = Object.freeze({
    name: redact(failure.transportError.name),
    code: redact(failure.transportError.code),
    message: redact(failure.transportError.message),
  })
  if (JSON.stringify(transportError) === JSON.stringify(failure.transportError)) return failure
  return Object.freeze({
    ...failure,
    transportError,
    redactions: Object.freeze([...failure.redactions, Object.freeze({ path: 'transportError', reason: 'credential' as const })]),
  })
}
