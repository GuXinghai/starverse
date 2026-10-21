import http from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'

export const actions = new Set(['status', 'snapshot', 'screenshot', 'click', 'fill', 'press', 'scroll', 'select', 'check', 'set-files', 'stop'])

export function locate(page, target) {
  if (!target || typeof target !== 'object') throw new Error('target is required')
  if (typeof target.role === 'string') return page.getByRole(target.role, { name: target.name, exact: target.exact ?? true })
  if (typeof target.testId === 'string') return page.getByTestId(target.testId)
  if (typeof target.label === 'string') return page.getByLabel(target.label, { exact: target.exact ?? true })
  if (typeof target.selector === 'string') return page.locator(target.selector)
  throw new Error('target must specify role, testId, label, or selector')
}

export async function createControlServer(dispatch) {
  const token = randomBytes(32).toString('hex')
  const expected = Buffer.from(`Bearer ${token}`)
  let queue = Promise.resolve()
  let pending = 0
  const server = http.createServer(async (request, response) => {
    const reply = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify(value))
    }
    const received = Buffer.from(request.headers.authorization ?? '')
    if (request.headers.origin !== undefined || request.headers.host !== `127.0.0.1:${server.address().port}` ||
        received.length !== expected.length || !timingSafeEqual(received, expected)) {
      reply(403, { ok: false, error: 'CONTROL_ACCESS_DENIED' })
      request.resume()
      return
    }
    if (request.method !== 'POST' || request.url !== '/command' ||
        request.headers['content-type'] !== 'application/json') {
      reply(400, { ok: false, error: 'CONTROL_REQUEST_INVALID' })
      request.resume()
      return
    }
    if (pending >= 8) {
      reply(429, { ok: false, error: 'CONTROL_QUEUE_FULL' })
      request.resume()
      return
    }
    let body = ''
    let size = 0
    try {
      request.setEncoding('utf8')
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk)
        if (size > 65536) {
          reply(413, { ok: false, error: 'CONTROL_REQUEST_TOO_LARGE' })
          return
        }
        body += chunk
      }
      const command = JSON.parse(body)
      if (!command || !actions.has(command.action)) throw new Error('CONTROL_ACTION_INVALID')
      pending += 1
      const task = queue.then(() => dispatch(command))
      queue = task.catch(() => {})
      try {
        reply(200, { ok: true, value: await task })
      } finally {
        pending -= 1
      }
    } catch (error) {
      reply(400, { ok: false, error: error instanceof Error ? error.message : 'CONTROL_COMMAND_FAILED' })
    }
  })
  server.requestTimeout = 10000
  server.headersTimeout = 10000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return { token, endpoint: `http://127.0.0.1:${server.address().port}/command`,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeIdleConnections() }) }
}

export async function sendCommand(control, command, extraHeaders = {}) {
  // Use node:http rather than an environment-dependent proxy or global fetch.
  const endpoint = new URL(control.endpoint)
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/command') {
    throw new Error('CONTROL_ENDPOINT_INVALID')
  }
  return new Promise((resolve, reject) => {
    const request = http.request(endpoint, { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${control.token}`, ...extraHeaders,
    } }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
      })
    })
    request.setTimeout(40000, () => request.destroy(new Error('CONTROL_TIMEOUT')))
    request.on('error', reject)
    request.end(JSON.stringify(command))
  })
}
