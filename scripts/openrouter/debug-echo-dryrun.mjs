import { buildOpenRouterChatCompletionsRequest } from '../../src/next/openrouter/buildRequest.ts'

function usage() {
  console.log(`Usage:
  node scripts/openrouter/debug-echo-dryrun.mjs

Required env:
  OPENROUTER_API_KEY

Optional env:
  OPENROUTER_BASE_URL (default: https://openrouter.ai/api/v1)
  OPENROUTER_MODEL    (default: openrouter/auto)

Notes:
  - Sends a streaming /chat/completions request with debug.echo_upstream_body enabled.
  - Prints the first JSON SSE chunk and debug.echo_upstream_body (if present).
`)
}

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) {
  usage()
  process.exitCode = 2
  console.error('Missing env: OPENROUTER_API_KEY')
  process.exit(2)
}

const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const model = process.env.OPENROUTER_MODEL || 'openrouter/auto'

const request = buildOpenRouterChatCompletionsRequest({
  model,
  messages: [
    {
      role: 'user',
      content: 'debug echo dry-run: reply with exactly "ok".',
    },
  ],
  stream: true,
  usage: { include: true },
  reasoning: { effort: 'high', exclude: true },
})

const body = {
  ...request,
  debug: { echo_upstream_body: true },
}

const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

const response = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
    'X-Title': 'Starverse',
  },
  body: JSON.stringify(body),
})

if (!response.ok) {
  const text = await response.text().catch(() => '')
  console.error('HTTP error:', response.status, response.statusText)
  if (text) console.error(text)
  process.exit(1)
}

if (!response.body) {
  console.error('Missing response body (expected SSE)')
  process.exit(1)
}

const decoder = new TextDecoder()
let buffer = ''

function tryParseFirstChunk(jsonText) {
  try {
    const obj = JSON.parse(jsonText)
    console.log('\nfirst_chunk_json=')
    console.log(JSON.stringify(obj, null, 2))
    const echo = obj?.debug?.echo_upstream_body
    if (echo !== undefined) {
      console.log('\ndebug.echo_upstream_body=')
      console.log(typeof echo === 'string' ? echo : JSON.stringify(echo, null, 2))
    } else {
      console.log('\n(debug.echo_upstream_body not present in first chunk)')
    }
    return true
  } catch {
    return false
  }
}

let sawFirstJson = false

for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true })

  while (true) {
    const idx = buffer.indexOf('\n')
    if (idx === -1) break
    const line = buffer.slice(0, idx).replace(/\r$/, '')
    buffer = buffer.slice(idx + 1)

    if (!line) continue
    if (line.startsWith(':')) continue
    if (!line.startsWith('data:')) continue

    const data = line.slice('data:'.length).trim()
    if (data === '[DONE]') {
      if (!sawFirstJson) console.log('\n(no JSON chunk received before [DONE])')
      process.exit(0)
    }

    if (!sawFirstJson) {
      sawFirstJson = tryParseFirstChunk(data)
      if (sawFirstJson) process.exit(0)
    }
  }
}

console.log('\n(stream ended without [DONE])')
process.exit(0)

