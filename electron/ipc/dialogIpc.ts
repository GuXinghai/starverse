import { dialog } from 'electron'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { RegisterInvoke } from './types'

export const DIALOG_IPC_CHANNELS = ['dialog:select-file'] as const

type RegisterDialogIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
}>

type SelectFileOptions = Readonly<{
  filters?: Array<{ name: string; extensions: string[] }>
  defaultMimeType?: string
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

      console.log('[dialog] selected file:', filePath, 'size:', (size / 1024).toFixed(2), 'KB')
      return {
        dataUrl,
        filename: path.basename(filePath),
        size,
        mimeType,
      }
    } catch (error) {
      console.error('[dialog] select file failed:', error)
      return null
    }
  })

  return [...DIALOG_IPC_CHANNELS]
}