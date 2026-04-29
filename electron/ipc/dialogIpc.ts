import { dialog } from 'electron'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { RegisterInvoke } from './types'

export const DIALOG_IPC_CHANNELS = ['dialog:select-file', 'dialog:select-local-files'] as const

type RegisterDialogIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
}>

type SelectFileOptions = Readonly<{
  filters?: Array<{ name: string; extensions: string[] }>
  defaultMimeType?: string
}>

type SelectLocalFilesOptions = Readonly<{
  context?: 'file' | 'image'
  allowMultiple?: boolean
}>

export function registerDialogIpc(input: RegisterDialogIpcInput): string[] {
  const { registerInvoke } = input

  registerInvoke('dialog:select-file', async (_event: unknown, options: unknown = {}) => {
    try {
      const normalizedOptions = (options ?? {}) as SelectFileOptions
      const filters =
        Array.isArray(normalizedOptions.filters) && normalizedOptions.filters.length > 0
          ? normalizedOptions.filters
          : [{ name: 'PDF', extensions: ['pdf'] }]
      const defaultMimeType = normalizedOptions.defaultMimeType || 'application/pdf'

      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters,
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]!
      const fileBuffer = await readFile(filePath)
      const size = fileBuffer.byteLength
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
      }
      const mimeType = mimeTypes[ext] || defaultMimeType || 'application/octet-stream'
      const base64Data = fileBuffer.toString('base64')
      const dataUrl = `data:${mimeType};base64,${base64Data}`

      console.log('[dialog] selected file:', {
        hasFile: true,
        extension: ext,
        sizeKb: Number((size / 1024).toFixed(2)),
      })
      return {
        dataUrl,
        filename: path.basename(filePath),
        size,
        mimeType,
      }
    } catch (error) {
      console.error('[dialog] select file failed:', sanitizeDialogErrorMessage(error))
      return null
    }
  })

  registerInvoke('dialog:select-local-files', async (_event: unknown, options: unknown = {}) => {
    try {
      const normalized = (options ?? {}) as SelectLocalFilesOptions
      const context = normalized.context === 'image' ? 'image' : 'file'
      const allowMultiple = normalized.allowMultiple === true
      const result = await dialog.showOpenDialog({
        properties: allowMultiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: context === 'image'
          ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
          : [{ name: 'All Files', extensions: ['*'] }],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { filePaths: [] }
      }
      return { filePaths: result.filePaths }
    } catch (error) {
      console.error('[dialog] select local files failed:', sanitizeDialogErrorMessage(error))
      return { filePaths: [] }
    }
  })

  return [...DIALOG_IPC_CHANNELS]
}

function sanitizeDialogErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  return String(raw)
    .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=]+/gi, 'data:[redacted]')
    .replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, '[redacted-base64]')
    .replace(/\b[A-Za-z]:\\[^\s'"`]+/g, '[redacted-path]')
    .replace(/\\\\[^\s'"`]+/g, '[redacted-path]')
    .replace(/\/Users\/[^\s'"`]+/g, '[redacted-path]')
    .replace(/\/home\/[^\s'"`]+/g, '[redacted-path]')
}
