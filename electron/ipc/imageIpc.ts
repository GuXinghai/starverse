import { app, clipboard, dialog, nativeImage, shell } from 'electron'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { RegisterInvoke } from './types'

export type ResolvedAssetFile = Readonly<{
  path: string
  mime: string
}>

export const IMAGE_IPC_CHANNELS = [
  'dialog:select-image',
  'shell:resolve-image-path',
  'clipboard:write-image',
  'dialog:export-image',
  'shell:open-image',
] as const

type RegisterImageIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  resolveAssetFileByUrl: (rawUrl: string) => Promise<ResolvedAssetFile | null>
}>

type ResolvedImageSource = Readonly<{
  bytes: Buffer
  mime: string
  ext: string
  path?: string
}>

function decodeFileUrlPath(raw: string): string | null {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'file:') return null
    let pathname = decodeURIComponent(parsed.pathname)
    if (process.platform === 'win32' && pathname.startsWith('/')) {
      pathname = pathname.slice(1)
    }
    return pathname
  } catch {
    return null
  }
}

function extensionFromMime(mime: string | null | undefined): string {
  const normalized = String(mime ?? '').trim().toLowerCase()
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg'
  if (normalized === 'image/webp') return 'webp'
  if (normalized === 'image/gif') return 'gif'
  if (normalized === 'image/bmp') return 'bmp'
  if (normalized === 'image/svg+xml') return 'svg'
  return 'png'
}

function inferExtensionFromUrl(raw: string): string {
  const dataMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
  if (dataMatch?.[1]) return extensionFromMime(dataMatch[1])
  try {
    const parsed = new URL(raw)
    const ext = parsed.pathname.split('.').pop()?.toLowerCase()
    if (ext && /^[a-z0-9]+$/.test(ext) && ext.length <= 6) return ext
  } catch {
    const ext = raw.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase()
    if (ext && /^[a-z0-9]+$/.test(ext) && ext.length <= 6) return ext
  }
  return 'png'
}

function sanitizeSuggestedName(raw: string, fallbackExt: string): string {
  const base = String(raw ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  const safeBase = base.length > 0 ? base : `image-${Date.now()}`
  const ext = fallbackExt.replace(/^\.+/, '').trim().toLowerCase() || 'png'
  if (safeBase.toLowerCase().endsWith(`.${ext}`)) return safeBase
  return `${safeBase}.${ext}`
}

async function resolveImageSource(
  imageUrlRaw: string,
  resolveAssetFileByUrl: (rawUrl: string) => Promise<ResolvedAssetFile | null>
): Promise<ResolvedImageSource> {
  const imageUrl = String(imageUrlRaw ?? '').trim()
  if (!imageUrl) throw new Error('Missing image URL')

  if (imageUrl.startsWith('data:image/')) {
    const matches = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!matches) throw new Error('Invalid image data URL')
    const mime = String(matches[1] ?? '').trim().toLowerCase() || 'image/png'
    const base64Data = String(matches[2] ?? '')
    const bytes = Buffer.from(base64Data, 'base64')
    return { bytes, mime, ext: extensionFromMime(mime) }
  }

  if (imageUrl.startsWith('asset://')) {
    const resolved = await resolveAssetFileByUrl(imageUrl)
    if (!resolved) throw new Error('Asset not found')
    const bytes = await readFile(resolved.path)
    return { bytes: Buffer.from(bytes), mime: resolved.mime, ext: extensionFromMime(resolved.mime), path: resolved.path }
  }

  if (imageUrl.startsWith('file://')) {
    const filePath = decodeFileUrlPath(imageUrl)
    if (!filePath) throw new Error('Invalid file URL')
    const bytes = await readFile(filePath)
    return {
      bytes: Buffer.from(bytes),
      mime: 'image/*',
      ext: inferExtensionFromUrl(filePath),
      path: filePath,
    }
  }

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    const response = await fetch(imageUrl)
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const mime = String(response.headers.get('content-type') ?? '').trim() || 'image/*'
    return { bytes, mime, ext: extensionFromMime(mime) }
  }

  const localPath = path.resolve(imageUrl)
  const bytes = await readFile(localPath)
  return {
    bytes: Buffer.from(bytes),
    mime: 'image/*',
    ext: inferExtensionFromUrl(localPath),
    path: localPath,
  }
}

export function registerImageIpc(input: RegisterImageIpcInput): string[] {
  const { registerInvoke, resolveAssetFileByUrl } = input

  registerInvoke('dialog:select-image', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'],
          },
        ],
        title: '选择图片',
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]!
      const fileBuffer = await readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()

      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
      }
      const mimeType = mimeTypes[ext] || 'image/jpeg'
      const base64Data = fileBuffer.toString('base64')
      const dataUri = `data:${mimeType};base64,${base64Data}`

      console.log('[dialog] selected image:', filePath, 'size:', (base64Data.length / 1024).toFixed(2), 'KB')
      return dataUri
    } catch (error) {
      console.error('[dialog] select image failed:', error)
      return null
    }
  })

  registerInvoke('shell:resolve-image-path', async (_event: unknown, payload: unknown) => {
    try {
      const imageUrl = typeof payload === 'string' ? payload : String((payload as { imageUrl?: unknown })?.imageUrl ?? '')
      const trimmed = imageUrl.trim()
      if (!trimmed) return { success: false, error: 'Missing image URL' }

      if (trimmed.startsWith('asset://')) {
        const resolved = await resolveAssetFileByUrl(trimmed)
        if (!resolved) return { success: false, error: 'Asset not found' }
        return { success: true, path: resolved.path }
      }
      if (trimmed.startsWith('file://')) {
        const filePath = decodeFileUrlPath(trimmed)
        if (!filePath) return { success: false, error: 'Invalid file URL' }
        return { success: true, path: filePath }
      }
      return { success: true, path: trimmed }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  registerInvoke('clipboard:write-image', async (_event: unknown, payload: unknown) => {
    try {
      const imageUrl = String((payload as { imageUrl?: unknown })?.imageUrl ?? '').trim()
      const source = await resolveImageSource(imageUrl, resolveAssetFileByUrl)
      const image = nativeImage.createFromBuffer(source.bytes)
      if (image.isEmpty()) return { success: false, error: 'Invalid image bytes' }
      clipboard.writeImage(image)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  registerInvoke('dialog:export-image', async (_event: unknown, payload: unknown) => {
    try {
      const payloadObject = (payload ?? {}) as { imageUrl?: unknown; suggestedName?: unknown }
      const imageUrl = String(payloadObject.imageUrl ?? '').trim()
      const source = await resolveImageSource(imageUrl, resolveAssetFileByUrl)
      const ext = source.ext || inferExtensionFromUrl(imageUrl)
      const fileName = sanitizeSuggestedName(String(payloadObject.suggestedName ?? ''), ext)
      const defaultPath = path.join(app.getPath('downloads'), fileName)
      const result = await dialog.showSaveDialog({
        title: 'Export image',
        defaultPath,
        filters: [
          { name: 'Image', extensions: [ext] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })
      if (result.canceled || !result.filePath) return { success: false, canceled: true }
      await writeFile(result.filePath, source.bytes)
      return { success: true, path: result.filePath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  registerInvoke('shell:open-image', async (_event: unknown, imageUrl: unknown) => {
    try {
      const normalizedImageUrl = String(imageUrl ?? '')
      if (normalizedImageUrl.startsWith('data:image/')) {
        const matches = normalizedImageUrl.match(/^data:image\/(\w+);base64,(.+)$/)
        if (!matches) {
          throw new Error('无效的 data URI 格式')
        }

        const [, extension, base64Data] = matches
        if (!extension || !base64Data) {
          throw new Error('无效的 data URI 内容')
        }
        const tempDir = path.join(tmpdir(), 'starverse-images')
        await mkdir(tempDir, { recursive: true })

        const timestamp = Date.now()
        const tempFilePath = path.join(tempDir, `image-${timestamp}.${extension}`)
        const buffer = Buffer.from(base64Data, 'base64')
        await writeFile(tempFilePath, buffer)

        console.log('[shell] saved base64 image to temp:', tempFilePath)
        const result = await shell.openPath(tempFilePath)
        if (result) {
          console.error('[shell] open image failed:', result)
          return { success: false, error: result }
        }
        return { success: true, path: tempFilePath }
      }
      if (normalizedImageUrl.startsWith('http://') || normalizedImageUrl.startsWith('https://')) {
        await shell.openExternal(normalizedImageUrl)
        console.log('[shell] opened remote image:', normalizedImageUrl)
        return { success: true, url: normalizedImageUrl }
      }
      if (normalizedImageUrl.startsWith('asset://')) {
        const resolved = await resolveAssetFileByUrl(normalizedImageUrl)
        if (!resolved) {
          return { success: false, error: 'Asset not found' }
        }
        const result = await shell.openPath(resolved.path)
        if (result) {
          console.error('[shell] open asset image failed:', result)
          return { success: false, error: result }
        }
        console.log('[shell] opened asset image:', normalizedImageUrl, '->', resolved.path)
        return { success: true, path: resolved.path }
      }

      const result = await shell.openPath(normalizedImageUrl)
      if (result) {
        console.error('[shell] open image failed:', result)
        return { success: false, error: result }
      }
      console.log('[shell] opened local image:', normalizedImageUrl)
      return { success: true, path: normalizedImageUrl }
    } catch (error) {
      console.error('[shell] open image error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  return [...IMAGE_IPC_CHANNELS]
}