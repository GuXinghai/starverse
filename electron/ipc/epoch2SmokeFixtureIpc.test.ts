import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileSelectionGrantStore } from './fileSelectionGrants'
import { EPOCH2_SMOKE_FIXTURE_CHANNEL, isEpoch2SmokeFixtureAuthorityEnabled, registerEpoch2SmokeFixtureIpc } from './epoch2SmokeFixtureIpc'

describe('Epoch-2 smoke fixture authority', () => {
  const roots: string[] = []
  afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

  it('only enables for an unpackaged process with an explicit temporary user-data directory', () => {
    const env = { SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY: '1', SV_EPOCH2_SMOKE_FIXTURE_ROOT: 'C:/fixtures' }
    expect(isEpoch2SmokeFixtureAuthorityEnabled({ isPackaged: false, env, argv: ['electron', '--user-data-dir=C:/tmp'] })).toBe(true)
    expect(isEpoch2SmokeFixtureAuthorityEnabled({ isPackaged: true, env, argv: ['electron', '--user-data-dir=C:/tmp'] })).toBe(false)
    expect(isEpoch2SmokeFixtureAuthorityEnabled({ isPackaged: false, env, argv: ['electron'] })).toBe(false)
  })

  it('issues a sender-bound, one-time grant only for an allowlisted fixture inside its configured root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'epoch2-smoke-fixture-'))
    roots.push(root)
    await writeFile(path.join(root, 'fixture-markdown.md'), '# smoke fixture')
    const registerInvoke = vi.fn()
    const grants = createFileSelectionGrantStore({ tokenFactory: () => 'smoke-grant' })
    registerEpoch2SmokeFixtureIpc({ enabled: true, fixtureRoot: root, registerInvoke, fileSelectionGrants: grants })
    expect(registerInvoke).toHaveBeenCalledTimes(1)
    const handler = registerInvoke.mock.calls[0][1] as (event: unknown, payload: unknown) => Promise<unknown>
    const result = await handler({ sender: { id: 17 } }, { fixtureName: 'markdown' })
    expect(result).toEqual(expect.objectContaining({ ok: true, value: expect.objectContaining({ fixtureName: 'markdown', token: 'smoke-grant' }) }))
    const value = (result as { value: { filePath: string; token: string } }).value
    expect(grants.consume({ senderId: 18, filePath: value.filePath, token: value.token })).toEqual({ ok: false, code: 'sender_mismatch' })
    expect(grants.consume({ senderId: 17, filePath: value.filePath, token: value.token })).toEqual({ ok: true })
    expect(await handler({ sender: { id: 17 } }, { fixtureName: '../secret' })).toEqual({ ok: false, code: 'EPOCH2_SMOKE_FIXTURE_INPUT_INVALID' })
    expect(EPOCH2_SMOKE_FIXTURE_CHANNEL).toContain('smoke-fixture')
  })
})
