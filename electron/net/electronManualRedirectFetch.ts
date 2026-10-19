import { net, type Session } from 'electron'

function responseHeaders(values: Record<string, string | string[]>): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
  }
  return headers
}

/** session.fetch rejects manual redirects instead of exposing their response.
 * Keep each hop visible so callers can validate it before issuing another request.
 */
export async function electronManualRedirectFetch(
  session: Session, input: string | Request, init?: RequestInit,
): Promise<Response> {
  const source = new Request(input, init)
  source.signal.throwIfAborted()
  const body = source.body ? Buffer.from(await source.arrayBuffer()) : undefined
  source.signal.throwIfAborted()
  return new Promise<Response>((resolve, reject) => {
    const request = net.request({ url: source.url, method: source.method, session,
      redirect: 'manual', credentials: source.credentials,
      ...(source.credentials === 'same-origin' ? { origin: new URL(source.url).origin } : {}),
      useSessionCookies: source.credentials !== 'omit' })
    let settled = false
    let failBody: ((error: unknown) => void) | undefined
    const cleanup = () => source.signal.removeEventListener('abort', abort)
    const fail = (error: unknown) => { cleanup(); if (!settled) { settled = true; reject(error) } else failBody?.(error) }
    const abort = () => { fail(source.signal.reason); request.abort() }
    source.signal.addEventListener('abort', abort, { once: true })
    request.on('error', fail)
    // Electron 42 can emit the writable request's close before response headers.
    // Response completion/error and AbortSignal own the response lifetime.
    request.on('redirect', (status, _method, location, values) => {
      if (settled) return
      const headers = responseHeaders(values)
      headers.set('location', location)
      settled = true
      cleanup()
      resolve(new Response(null, { status, headers }))
      request.abort()
    })
    request.on('response', (incoming) => {
      if (settled) return
      const headers = responseHeaders(incoming.headers)
      const noBody = source.method === 'HEAD' || [204, 205, 304].includes(incoming.statusCode)
      let bodyDone = false
      const stream = noBody ? null : new ReadableStream<Uint8Array>({
        start(controller) {
          failBody = (error) => { if (!bodyDone) { bodyDone = true; controller.error(error) } }
          incoming.on('data', (chunk) => { if (!bodyDone) controller.enqueue(new Uint8Array(chunk)) })
          incoming.on('end', () => { if (!bodyDone) { bodyDone = true; controller.close() }; cleanup() })
          incoming.on('error', failBody)
          incoming.on('aborted', () => failBody?.(new Error('ERR_CONNECTION_CLOSED')))
        },
        cancel() { bodyDone = true; failBody = undefined; cleanup(); request.abort() },
      })
      // Chromium decodes compressed bodies; do not advertise their wire encoding/size.
      if (headers.has('content-encoding')) { headers.delete('content-encoding'); headers.delete('content-length') }
      settled = true
      resolve(new Response(stream, { status: incoming.statusCode, statusText: incoming.statusMessage, headers }))
      if (noBody) { incoming.on('error', () => undefined); incoming.on('end', cleanup) }
    })
    try {
      source.headers.forEach((value, name) => request.setHeader(name, value))
      if (source.cache === 'no-store') request.setHeader('cache-control', 'no-cache, no-store')
      request.end(body)
    } catch (error) { fail(error); request.abort() }
  })
}
