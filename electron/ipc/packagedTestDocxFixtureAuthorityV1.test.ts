import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileSelectionGrantStore } from './fileSelectionGrants'
import { bindPackagedTestDocxFixtureGrantInvalidationV1, PACKAGED_TEST_DOCX_FIXTURE_AUTHORITY_V1, PACKAGED_TEST_DOCX_FIXTURE_CHANNEL_V1, createPackagedTestDocxFixtureAuthorityV1 } from './packagedTestDocxFixtureAuthorityV1'

const NONCE = '0123456789abcdef0123456789abcdef'
const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const SHA256 = '7d68acb8d46422123d6bff9ca37154b7d2a05efb081eeef4491787dec90d57e4'

describe('packaged test DOCX fixture authority v1', () => {
  const roots: string[] = []
  afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

  it('is default-deny and does not register for normal packaged startup', async () => {
    const authority = await createPackagedTestDocxFixtureAuthorityV1({ isPackaged: true, env: { NODE_ENV: 'production' }, argv: [],
      userDataRoot: 'C:/not-used', tempRoot: 'C:/not-used', repositoryRoot: process.cwd(), registerInvoke: vi.fn(), fileSelectionGrants: createFileSelectionGrantStore() })
    expect(authority).toBeNull()
  })

  it('returns only opaque grant metadata and stages the exact fixed fixture for the main frame', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'starverse-packaged-authority-')); roots.push(root)
    const canonicalRoot = await realpath(root)
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'starverse-packaged-stage-')); roots.push(tempRoot)
    await writeFile(path.join(canonicalRoot, 'starverse-packaged-docx-pdf-v1.docx'), await fixtureBytes())
    await writeFile(path.join(canonicalRoot, '.starverse-packaged-test-authority-v1.json'), JSON.stringify(marker(canonicalRoot)))
    const registerInvoke = vi.fn(), grants = createFileSelectionGrantStore({ now: () => 2000, tokenFactory: () => 'opaque-grant' })
    const authority = await createPackagedTestDocxFixtureAuthorityV1({ isPackaged: true, env: environment(), argv: [`--user-data-dir=${canonicalRoot}`, `--sv-packaged-test-authority-nonce=${NONCE}`], userDataRoot: canonicalRoot, tempRoot, repositoryRoot: process.cwd(), registerInvoke, fileSelectionGrants: grants, nowMs: () => 2000 })
    expect(authority).not.toBeNull(); authority!.register(() => 7)
    expect(registerInvoke).toHaveBeenCalledWith(PACKAGED_TEST_DOCX_FIXTURE_CHANNEL_V1, expect.any(Function))
    const result = await (registerInvoke.mock.calls[0][1] as Function)({ sender: { id: 7 }, senderFrame: { isMainFrame: true, url: 'file:///app/index.html' } }, {})
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ fixtureId: 'packaged-docx-pdf-v1', mime: MIME, sizeBytes: 1434, selectionGrantToken: 'opaque-grant' }) })
    expect(JSON.stringify(result)).not.toContain(root)
    const consumed = grants.consumeOpaque({ senderId: 7, token: result.value.selectionGrantToken, frameUrl: 'file:///app/index.html' })
    expect(consumed).toEqual(expect.objectContaining({ ok: true }))
    if (consumed.ok) expect((await readFile(consumed.filePath)).byteLength).toBe(1434)
    expect(grants.consumeOpaque({ senderId: 7, token: result.value.selectionGrantToken, frameUrl: 'file:///app/index.html' })).toEqual({ ok: false, code: 'grant_missing' })
    await authority!.dispose()
  })

  it('invalidates opaque grants when the granted renderer navigates or its window closes', () => {
    const grants = createFileSelectionGrantStore({ now: () => 2000, tokenFactory: () => 'opaque-grant' })
    const webContents = Object.assign(new EventEmitter(), { id: 7 })
    const window = new EventEmitter() as EventEmitter & { webContents: typeof webContents }
    window.webContents = webContents
    bindPackagedTestDocxFixtureGrantInvalidationV1({ window, fileSelectionGrants: grants })

    const first = grants.createOpaque({ senderId: 7, filePath: 'C:/fixture.docx', frameUrl: 'file:///app/index.html' })
    webContents.emit('will-navigate')
    expect(grants.consumeOpaque({ senderId: 7, token: first.token, frameUrl: 'file:///app/index.html' })).toEqual({ ok: false, code: 'grant_missing' })

    const second = grants.createOpaque({ senderId: 7, filePath: 'C:/fixture.docx', frameUrl: 'file:///app/index.html' })
    window.emit('closed')
    expect(grants.consumeOpaque({ senderId: 7, token: second.token, frameUrl: 'file:///app/index.html' })).toEqual({ ok: false, code: 'grant_missing' })
  })
})

function environment() { return { NODE_ENV: 'production', SV_ELECTRON_SMOKE: '1', SV_ELECTRON_SMOKE_DFC: '1', SV_PACKAGED_TEST_AUTHORITY: PACKAGED_TEST_DOCX_FIXTURE_AUTHORITY_V1, SV_PACKAGED_TEST_AUTHORITY_NONCE: NONCE } }
function marker(root: string) { return { schemaVersion: 1, nonce: NONCE, createdAtMs: 1000, expiresAtMs: 5000, userDataDir: root, fixture: { fixtureId: 'packaged-docx-pdf-v1', filename: 'starverse-packaged-docx-pdf-v1.docx', mime: MIME, sizeBytes: 1434, sha256: SHA256 } } }
async function fixtureBytes(): Promise<Buffer> {
  const source = await readFile(path.join(process.cwd(), 'scripts', 'dfc', 'office-pdf-libreoffice-packaged-electron-smoke.mjs'), 'utf8')
  const start = source.indexOf('function createMinimalDocxBuffer()'), end = source.indexOf('async function pathExists', start)
  const context = { Buffer } as { Buffer: typeof Buffer; out?: Buffer }; vm.createContext(context)
  vm.runInContext(`${source.slice(start, end)};globalThis.out=createMinimalDocxBuffer()`, context)
  if (!context.out) throw new Error('fixture helper did not create bytes')
  return context.out
}
