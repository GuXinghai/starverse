import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runCli } from '../index.mjs'
import { readVaultPayload } from '../src/vault.mjs'

const windowsDescribe = process.platform === 'win32' ? describe : describe.skip

type CaptureIo = {
  stdoutText: () => string
  stderrText: () => string
  readSecret?: (prompt: string) => Promise<string>
  readLine?: (prompt: string) => Promise<string>
  stdout: Writable
  stderr: Writable
}

const fakeKeys = {
  openai: 'test-openai-key-redacted',
  anthropic: 'test-anthropic-key-redacted',
  google_ai_studio: 'test-google-key-redacted',
  deepseek: 'test-deepseek-key-redacted',
  openrouter: 'test-openrouter-key-redacted',
} as const

windowsDescribe('provider-key-vault', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'provider-key-vault-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('initializes, sets providers, lists only masked keys, verifies, shows, recovers, and removes', async () => {
    const vaultPath = path.join(tempDir, 'provider-keys.vault')

    let io = captureIo()
    await expect(runCli(['--vault', vaultPath, 'init'], io)).resolves.toBe(0)
    await expect(fs.stat(vaultPath)).resolves.toBeTruthy()

    for (const [provider, key] of Object.entries(fakeKeys)) {
      io = captureIo({ secrets: [key] })
      await expect(runCli(['--vault', vaultPath, 'set', provider], io)).resolves.toBe(0)
      expect(combined(io)).not.toContain(key)
    }

    const vaultText = await fs.readFile(vaultPath, 'utf8')
    expect(vaultText).toContain('windows_dpapi_current_user')
    for (const key of Object.values(fakeKeys)) {
      expect(vaultText).not.toContain(key)
    }

    io = captureIo()
    await expect(runCli(['--vault', vaultPath, 'list'], io)).resolves.toBe(0)
    expect(io.stdoutText()).toContain('provider\tconfigured\tmaskedKey\tupdatedAt')
    expect(io.stdoutText()).toContain('openai\tyes\t****cted')
    expect(io.stdoutText()).toContain('google_ai_studio\tyes\t****cted')
    for (const key of Object.values(fakeKeys)) {
      expect(combined(io)).not.toContain(key)
    }

    io = captureIo()
    await expect(runCli(['--vault', vaultPath, 'verify'], io)).resolves.toBe(0)
    expect(io.stdoutText()).toContain('Vault verified for the current Windows user.')
    expect(io.stdoutText()).toContain('Configured providers: 5')
    for (const key of Object.values(fakeKeys)) {
      expect(combined(io)).not.toContain(key)
    }

    io = captureIo({ lines: ['no'] })
    await expect(runCli(['--vault', vaultPath, 'show', 'openai'], io)).resolves.toBe(1)
    expect(combined(io)).not.toContain(fakeKeys.openai)

    io = captureIo({ lines: ['SHOW openai'] })
    await expect(runCli(['--vault', vaultPath, 'show', 'openai'], io)).resolves.toBe(0)
    expect(io.stdoutText()).toContain(fakeKeys.openai)

    io = captureIo({ lines: ['RECOVER deepseek'] })
    await expect(runCli(['--vault', vaultPath, 'recover', 'deepseek'], io)).resolves.toBe(0)
    expect(io.stdoutText()).toContain('Manual recovery only.')
    expect(io.stdoutText()).toContain(fakeKeys.deepseek)

    io = captureIo()
    await expect(runCli(['--vault', vaultPath, 'remove', 'anthropic'], io)).resolves.toBe(0)
    expect(combined(io)).not.toContain(fakeKeys.anthropic)

    const payload = await readVaultPayload(vaultPath)
    expect(payload.records.map((record) => record.provider).sort()).toEqual(['deepseek', 'google_ai_studio', 'openai', 'openrouter'])
    expect(payload.records.find((record) => record.provider === 'anthropic')).toBeUndefined()
  }, 30000)

  it('rejects provider keys passed as command arguments without leaking the argument', async () => {
    const vaultPath = path.join(tempDir, 'provider-keys.vault')
    let io = captureIo()
    await expect(runCli(['--vault', vaultPath, 'init'], io)).resolves.toBe(0)

    io = captureIo()
    await expect(runCli(['--vault', vaultPath, 'set', 'openai', fakeKeys.openai], io)).resolves.toBe(1)
    expect(combined(io)).not.toContain(fakeKeys.openai)
  })

  it('fails safely for a corrupted vault without raw key output', async () => {
    const vaultPath = path.join(tempDir, 'provider-keys.vault')
    await fs.writeFile(vaultPath, '{not json', 'utf8')

    const io = captureIo()
    await expect(runCli(['--vault', vaultPath, 'verify'], io)).resolves.toBe(1)
    expect(io.stderrText()).toContain('Vault file is invalid or corrupted.')
    for (const key of Object.values(fakeKeys)) {
      expect(combined(io)).not.toContain(key)
    }
  })

  it('has gitignore coverage for vault, temporary, backup, and test-output artifacts', async () => {
    const gitignore = await fs.readFile(path.resolve('.gitignore'), 'utf8')
    expect(gitignore).toContain('*.vault')
    expect(gitignore).toContain('*.vault.tmp')
    expect(gitignore).toContain('*.vault.bak')
    expect(gitignore).toContain('provider-keys.vault')
    expect(gitignore).toContain('tools/provider-key-vault/.tmp/')
    expect(gitignore).toContain('tools/provider-key-vault/test-output/')
  })
})

function captureIo(options: { secrets?: string[], lines?: string[] } = {}): CaptureIo {
  let stdout = ''
  let stderr = ''
  const secrets = [...(options.secrets ?? [])]
  const lines = [...(options.lines ?? [])]
  return {
    stdoutText: () => stdout,
    stderrText: () => stderr,
    readSecret: async () => secrets.shift() ?? '',
    readLine: async () => lines.shift() ?? '',
    stdout: createCaptureStream((chunk) => {
      stdout += chunk
    }),
    stderr: createCaptureStream((chunk) => {
      stderr += chunk
    }),
  }
}

function combined(io: CaptureIo) {
  return `${io.stdoutText()}\n${io.stderrText()}`
}

function createCaptureStream(append: (chunk: string) => void) {
  return new Writable({
    write(chunk, _encoding, callback) {
      append(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
      callback()
    },
  })
}
