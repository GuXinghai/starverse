import {
  createCompatibleAddressLeaseRegistry,
  type CompatibleAddressResolver,
} from '../net/compatibleAddressPolicy'
import type {
  CompatibleTransportAdapter,
  CompatibleTransportKind,
} from '../net/compatibleProviderTransport'

const SMOKE_PUBLIC_ADDRESS = '93.184.216.34'
const encoder = new TextEncoder()

export function isCompatibleE2eSmokeEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
  isPackaged = true,
): boolean {
  return isPackaged === false && env.NODE_ENV === 'development' && env.SV_ELECTRON_COMPATIBLE_E2E === '1'
}

export function createCompatibleE2eSmokeTransportDependencies(input: Readonly<{
  env?: Readonly<Record<string, string | undefined>>
  isPackaged: boolean
}>) {
  if (!isCompatibleE2eSmokeEnabled(input.env, input.isPackaged)) throw new Error('compatible_e2e_smoke_not_enabled')
  const resolver: CompatibleAddressResolver = Object.freeze({
    resolveAll: async () => Object.freeze([{ address: SMOKE_PUBLIC_ADDRESS, family: 'ipv4' as const }]),
  })
  const adapter = (kind: CompatibleTransportKind): CompatibleTransportAdapter => Object.freeze({
    kind,
    securityCapability: 'pre_request_audit_only' as const,
    execute: async (request) => {
      if (request.url.pathname.endsWith('/models')) {
        return jsonResponse({ object: 'list', data: [{ id: 'smoke-model', object: 'model', created: 1, owned_by: 'smoke' }] })
      }
      const body = typeof request.body === 'string' ? request.body : ''
      if (body.includes('smoke-abort')) await waitForAbort(request.signal)
      if (body.includes('"stream":true')) {
        return new Response(encoder.encode([
          'data: {"id":"smoke-response","object":"chat.completion.chunk","created":1,"model":"smoke-model","choices":[{"index":0,"delta":{"role":"assistant","content":"smoke "},"finish_reason":null}]}',
          '',
          'data: {"id":"smoke-response","object":"chat.completion.chunk","created":1,"model":"smoke-model","choices":[{"index":0,"delta":{"content":"complete"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}',
          '',
          'data: [DONE]',
          '',
        ].join('\n')), { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
      }
      return jsonResponse({
        id: 'smoke-response', object: 'chat.completion', created: 1, model: 'smoke-model',
        choices: [{ index: 0, message: { role: 'assistant', content: 'smoke complete' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
      })
    },
  })
  return Object.freeze({
    addressPolicies: Object.freeze({
      electron_session_fetch: createCompatibleAddressLeaseRegistry({ resolver }),
      node_undici: createCompatibleAddressLeaseRegistry({ resolver }),
    }),
    adapters: Object.freeze({
      electron_session_fetch: adapter('electron_session_fetch'),
      node_undici: adapter('node_undici'),
    }),
  })
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function waitForAbort(signal?: AbortSignal): Promise<never> {
  if (signal?.aborted) throw abortError()
  await new Promise<void>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(abortError()), { once: true })
  })
  throw abortError()
}

function abortError(): Error {
  const error = new Error('aborted')
  error.name = 'AbortError'
  return error
}
