import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileSelectionGrantStore } from './fileSelectionGrants'

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown> | unknown>()
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown> | unknown) => {
        handlers.set(channel, handler)
      }),
    },
  }
})

vi.mock('electron', () => ({
  ipcMain: electronMock.ipcMain,
}))

import { registerDbBridge } from './dbBridge'

function registerTestBridge(input?: Readonly<{ now?: () => number; ttlMs?: number }>) {
  const manager = {
    call: vi.fn(async (_method: string, _params?: unknown) => ({ ok: true })),
    reset: vi.fn(async () => ({ ok: true })),
    getStats: vi.fn(() => ({ pending: 0 })),
  } as any
  const grants = createFileSelectionGrantStore({
    now: input?.now ?? (() => 1000),
    ttlMs: input?.ttlMs ?? 5000,
    tokenFactory: (() => {
      let seq = 0
      return () => `grant-${++seq}`
    })(),
  })
  registerDbBridge(manager, { fileSelectionGrants: grants })
  const handler = electronMock.handlers.get('db:invoke')
  if (!handler) throw new Error('db:invoke handler missing')
  return { manager, grants, handler }
}

describe('registerDbBridge security gates', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    electronMock.handlers.clear()
    electronMock.ipcMain.handle.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('rejects renderer local file ingestion without a selection grant', async () => {
    const { manager, handler } = registerTestBridge()

    await expect(handler({ sender: { id: 7 } }, {
      method: 'fileIngestion.ingestLocalFile',
      params: { filePath: 'C:/tmp/secret.txt' },
    })).rejects.toMatchObject({
      name: 'DbWorkerError',
      code: 'ERR_FORBIDDEN',
    })
    expect(manager.call).not.toHaveBeenCalled()
  })

  it('allows local file ingestion with a matching grant and strips the token before worker dispatch', async () => {
    const { manager, grants, handler } = registerTestBridge()
    const grant = grants.create({ senderId: 7, filePath: 'C:/tmp/allowed.txt' })

    await expect(handler({ sender: { id: 7 } }, {
      method: 'fileIngestion.ingestLocalFile',
      params: { filePath: 'C:/tmp/allowed.txt', selectionGrantToken: grant.token, mimeType: 'text/plain' },
    })).resolves.toEqual({ ok: true })

    expect(manager.call).toHaveBeenCalledWith('fileIngestion.ingestLocalFile', {
      filePath: 'C:/tmp/allowed.txt',
      mimeType: 'text/plain',
    })
  })

  it('rejects reused local file selection tokens', async () => {
    const { manager, grants, handler } = registerTestBridge()
    const grant = grants.create({ senderId: 7, filePath: 'C:/tmp/allowed.txt' })
    await handler({ sender: { id: 7 } }, {
      method: 'fileIngestion.ingestLocalFile',
      params: { filePath: 'C:/tmp/allowed.txt', selectionGrantToken: grant.token },
    })

    await expect(handler({ sender: { id: 7 } }, {
      method: 'fileIngestion.ingestLocalFile',
      params: { filePath: 'C:/tmp/allowed.txt', selectionGrantToken: grant.token },
    })).rejects.toMatchObject({
      name: 'DbWorkerError',
      code: 'ERR_FORBIDDEN',
    })
    expect(manager.call).toHaveBeenCalledTimes(1)
  })

  it('rejects expired and cross-sender local file selection tokens', async () => {
    let now = 1000
    const { manager, grants, handler } = registerTestBridge({ now: () => now, ttlMs: 10 })
    const expired = grants.create({ senderId: 7, filePath: 'C:/tmp/expired.txt' })
    const crossSender = grants.create({ senderId: 7, filePath: 'C:/tmp/cross.txt' })
    now = 1011

    await expect(handler({ sender: { id: 7 } }, {
      method: 'fileIngestion.ingestLocalFile',
      params: { filePath: 'C:/tmp/expired.txt', selectionGrantToken: expired.token },
    })).rejects.toMatchObject({ code: 'ERR_FORBIDDEN' })

    now = 1000
    await expect(handler({ sender: { id: 8 } }, {
      method: 'fileIngestion.ingestLocalFile',
      params: { filePath: 'C:/tmp/cross.txt', selectionGrantToken: crossSender.token },
    })).rejects.toMatchObject({ code: 'ERR_FORBIDDEN' })

    expect(manager.call).not.toHaveBeenCalled()
  })

  it('rejects renderer db.reset instead of bypassing the renderer allowlist', async () => {
    const { manager, handler } = registerTestBridge()

    await expect(handler({ sender: { id: 7 } }, {
      method: 'db.reset',
      params: {},
    })).rejects.toMatchObject({
      name: 'DbWorkerError',
      code: 'ERR_NOT_FOUND',
    })
    expect(manager.reset).not.toHaveBeenCalled()
    expect(manager.call).not.toHaveBeenCalled()
  })
})
