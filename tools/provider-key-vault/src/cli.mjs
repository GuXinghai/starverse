import readline from 'node:readline/promises'

import {
  getDefaultVaultPath,
  initVault,
  listProviders,
  normalizeProvider,
  removeProviderKey,
  setProviderKey,
  showProviderKey,
  verifyVault,
  VaultError,
} from './vault.mjs'

/**
 * @typedef {{
 *   stdin?: NodeJS.ReadableStream & { isTTY?: boolean, setRawMode?: (enabled: boolean) => void, resume?: () => void, pause?: () => void }
 *   stdout?: NodeJS.WritableStream
 *   stderr?: NodeJS.WritableStream
 *   env?: NodeJS.ProcessEnv
 *   readSecret?: (prompt: string) => Promise<string>
 *   readLine?: (prompt: string) => Promise<string>
 *   nowMs?: number
 * }} CliIo
 */

/**
 * @param {string[]} argv
 * @param {CliIo} [io]
 * @returns {Promise<number>}
 */
export async function runCli(argv = process.argv.slice(2), io = {}) {
  const streams = {
    stdin: io.stdin ?? process.stdin,
    stdout: io.stdout ?? process.stdout,
    stderr: io.stderr ?? process.stderr,
    env: io.env ?? process.env,
  }

  try {
    const parsed = parseArgs(argv, streams.env)
    const options = { nowMs: io.nowMs }

    switch (parsed.command) {
      case 'init': {
        ensureArgCount(parsed.args, 0, 'Usage: init [--vault <path>]')
        await initVault(parsed.vaultPath, options)
        writeLine(streams.stdout, `Initialized provider key vault at: ${parsed.vaultPath}`)
        return 0
      }
      case 'set': {
        ensureArgCount(parsed.args, 1, 'Usage: set <provider> [--vault <path>]. The key is read from hidden stdin, never from an argument.')
        const provider = normalizeProvider(parsed.args[0])
        const key = io.readSecret
          ? await io.readSecret(`API key for ${provider}: `)
          : await readHiddenLine(streams, `API key for ${provider}: `)
        const result = await setProviderKey(parsed.vaultPath, provider, key, options)
        writeLine(streams.stdout, `Saved ${result.provider} key: ${result.maskedKey}`)
        return 0
      }
      case 'list': {
        ensureArgCount(parsed.args, 0, 'Usage: list [--vault <path>]')
        const rows = await listProviders(parsed.vaultPath)
        writeLine(streams.stdout, 'provider\tconfigured\tmaskedKey\tupdatedAt')
        for (const row of rows) {
          writeLine(streams.stdout, `${row.provider}\t${row.configured ? 'yes' : 'no'}\t${row.maskedKey}\t${row.updatedAt}`)
        }
        return 0
      }
      case 'show': {
        ensureArgCount(parsed.args, 1, 'Usage: show <provider> [--vault <path>]')
        const provider = normalizeProvider(parsed.args[0])
        const confirmed = await confirmRawKeyDisplay(io, streams, provider, 'SHOW')
        if (!confirmed) {
          writeLine(streams.stdout, 'Canceled. Raw key was not displayed.')
          return 1
        }
        const key = await showProviderKey(parsed.vaultPath, provider)
        writeLine(streams.stdout, `Raw key for ${provider}:`)
        writeLine(streams.stdout, key)
        return 0
      }
      case 'recover': {
        ensureArgCount(parsed.args, 1, 'Usage: recover <provider> [--vault <path>]')
        const provider = normalizeProvider(parsed.args[0])
        const confirmed = await confirmRawKeyDisplay(io, streams, provider, 'RECOVER')
        if (!confirmed) {
          writeLine(streams.stdout, 'Canceled. Raw key was not displayed.')
          return 1
        }
        const key = await showProviderKey(parsed.vaultPath, provider)
        writeLine(streams.stdout, 'Manual recovery only. Copy this key into the Starverse settings page yourself; this tool will not write to Starverse.')
        writeLine(streams.stdout, `Raw key for ${provider}:`)
        writeLine(streams.stdout, key)
        return 0
      }
      case 'remove': {
        ensureArgCount(parsed.args, 1, 'Usage: remove <provider> [--vault <path>]')
        const provider = normalizeProvider(parsed.args[0])
        const removed = await removeProviderKey(parsed.vaultPath, provider, options)
        writeLine(streams.stdout, removed ? `Removed ${provider} key.` : `${provider} key was not configured.`)
        return 0
      }
      case 'verify': {
        ensureArgCount(parsed.args, 0, 'Usage: verify [--vault <path>]')
        const result = await verifyVault(parsed.vaultPath)
        writeLine(streams.stdout, 'Vault verified for the current Windows user.')
        writeLine(streams.stdout, `Configured providers: ${result.recordCount}`)
        return 0
      }
      case 'help':
      case undefined: {
        writeLine(streams.stdout, helpText())
        return 0
      }
      default:
        throw new VaultError(helpText())
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider key vault failed.'
    writeLine(streams.stderr, message)
    return 1
  }
}

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env
 */
function parseArgs(argv, env) {
  /** @type {string | undefined} */
  let vaultPath
  /** @type {string[]} */
  const positional = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--vault') {
      const next = argv[index + 1]
      if (!next || next.startsWith('--')) {
        throw new VaultError('Missing value for --vault.')
      }
      vaultPath = next
      index += 1
      continue
    }
    if (arg.startsWith('--vault=')) {
      vaultPath = arg.slice('--vault='.length)
      if (!vaultPath) {
        throw new VaultError('Missing value for --vault.')
      }
      continue
    }
    if (arg.startsWith('--')) {
      throw new VaultError('Unknown option. Supported option: --vault <path>.')
    }
    positional.push(arg)
  }

  return {
    command: positional[0],
    args: positional.slice(1),
    vaultPath: vaultPath ?? getDefaultVaultPath(env),
  }
}

/**
 * @param {string[]} args
 * @param {number} expected
 * @param {string} usage
 */
function ensureArgCount(args, expected, usage) {
  if (args.length !== expected) {
    throw new VaultError(usage)
  }
}

/**
 * @param {CliIo} io
 * @param {{ stdin: NonNullable<CliIo['stdin']>, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream, env: NodeJS.ProcessEnv }} streams
 * @param {string} provider
 * @param {'SHOW' | 'RECOVER'} action
 */
async function confirmRawKeyDisplay(io, streams, provider, action) {
  const expected = `${action} ${provider}`
  const prompt = `Type ${expected} to display the raw key once: `
  const answer = io.readLine
    ? await io.readLine(prompt)
    : await readVisibleLine(streams, prompt)
  return answer.trim() === expected
}

/**
 * @param {{ stdin: NonNullable<CliIo['stdin']>, stdout: NodeJS.WritableStream }} streams
 * @param {string} prompt
 */
export async function readHiddenLine(streams, prompt) {
  streams.stdout.write(prompt)
  if (!streams.stdin.isTTY || typeof streams.stdin.setRawMode !== 'function') {
    const data = await readAll(streams.stdin)
    streams.stdout.write('\n')
    return firstLine(data)
  }

  return new Promise((resolve, reject) => {
    let value = ''

    const cleanup = () => {
      streams.stdin.setRawMode?.(false)
      streams.stdin.pause?.()
      streams.stdin.removeListener('data', onData)
    }

    const onData = (chunk) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      for (const char of text) {
        if (char === '\u0003') {
          cleanup()
          streams.stdout.write('\n')
          reject(new VaultError('Canceled.'))
          return
        }
        if (char === '\r' || char === '\n') {
          cleanup()
          streams.stdout.write('\n')
          resolve(value)
          return
        }
        if (char === '\b' || char === '\u007f') {
          value = value.slice(0, -1)
          continue
        }
        value += char
      }
    }

    streams.stdin.setRawMode(true)
    streams.stdin.resume?.()
    streams.stdin.on('data', onData)
  })
}

/**
 * @param {{ stdin: NonNullable<CliIo['stdin']>, stdout: NodeJS.WritableStream }} streams
 * @param {string} prompt
 */
async function readVisibleLine(streams, prompt) {
  if (!streams.stdin.isTTY) {
    streams.stdout.write(prompt)
    const data = await readAll(streams.stdin)
    return firstLine(data)
  }

  const rl = readline.createInterface({
    input: streams.stdin,
    output: streams.stdout,
  })
  try {
    return await rl.question(prompt)
  } finally {
    rl.close()
  }
}

/**
 * @param {NodeJS.ReadableStream} input
 */
async function readAll(input) {
  let data = ''
  input.setEncoding?.('utf8')
  for await (const chunk of input) {
    data += chunk
  }
  return data
}

/**
 * @param {string} data
 */
function firstLine(data) {
  return data.split(/\r?\n/, 1)[0]?.trim() ?? ''
}

/**
 * @param {NodeJS.WritableStream} stream
 * @param {string} line
 */
function writeLine(stream, line) {
  stream.write(`${line}\n`)
}

function helpText() {
  return [
    'Provider Key Vault v1',
    '',
    'Commands:',
    '  init',
    '  set <provider>',
    '  list',
    '  show <provider>',
    '  recover <provider>',
    '  remove <provider>',
    '  verify',
    '',
    'Providers: openai, anthropic, google_ai_studio, deepseek, openrouter',
    'Options:',
    '  --vault <path>  Override the vault file path.',
  ].join('\n')
}
