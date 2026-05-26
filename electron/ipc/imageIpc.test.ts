import { afterEach, describe, expect, it, vi } from 'vitest'
import { clipboard, nativeImage } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { registerImageIpc } from './imageIpc'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tmpdir()),
  },
  clipboard: {
    writeImage: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
  nativeImage: {
    createFromBuffer: vi.fn(() => ({ isEmpty: () => false })),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
}))

function registerHandlers(resolveAssetFileByUrl = vi.fn()) {
  const registerInvoke = vi.fn()
  registerImageIpc({ registerInvoke, resolveAssetFileByUrl })
  const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<any>>()
  for (const [channel, handler] of registerInvoke.mock.calls) {
    handlers.set(channel, handler)
  }
  return handlers
}

describe('registerImageIpc local source boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['absolute path', path.resolve('secret.png')],
    ['UNC path', '\\\\server\\share\\secret.png'],
    ['path traversal', '..\\secret.png'],
    ['NUL character', 'asset://image-ok\u0000.png'],
    ['file URL', 'file:///C:/Users/alice/secret.png'],
  ])('rejects arbitrary local image source for clipboard: %s', async (_name, imageUrl) => {
    const handlers = registerHandlers()

    const result = await handlers.get('clipboard:write-image')?.({}, { imageUrl })

    expect(result).toEqual(expect.objectContaining({ success: false }))
    expect(clipboard.writeImage).not.toHaveBeenCalled()
    expect(nativeImage.createFromBuffer).not.toHaveBeenCalled()
  })

  it.each([
    ['absolute path', path.resolve('secret.png')],
    ['UNC path', '\\\\server\\share\\secret.png'],
    ['path traversal', '../secret.png'],
    ['NUL character', 'asset://image-ok\u0000.png'],
    ['file URL', 'file:///C:/Users/alice/secret.png'],
  ])('rejects arbitrary local image source for shell:resolve-image-path: %s', async (_name, imageUrl) => {
    const handlers = registerHandlers()

    const result = await handlers.get('shell:resolve-image-path')?.({}, { imageUrl })

    expect(result).toEqual(expect.objectContaining({ success: false }))
  })

  it('allows registered asset image sources through the resolver registry', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'image-ipc-'))
    const assetPath = path.join(tempDir, 'registered.png')
    await writeFile(assetPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const resolveAssetFileByUrl = vi.fn(async (rawUrl: string) => (
      rawUrl === 'asset://registered-image'
        ? { path: assetPath, mime: 'image/png' }
        : null
    ))
    const handlers = registerHandlers(resolveAssetFileByUrl)

    try {
      const clipboardResult = await handlers.get('clipboard:write-image')?.({}, { imageUrl: 'asset://registered-image' })
      const resolveResult = await handlers.get('shell:resolve-image-path')?.({}, { imageUrl: 'asset://registered-image' })

      expect(clipboardResult).toEqual({ success: true })
      expect(resolveResult).toEqual({ success: true, path: assetPath })
      expect(resolveAssetFileByUrl).toHaveBeenCalledWith('asset://registered-image')
      expect(clipboard.writeImage).toHaveBeenCalledTimes(1)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
