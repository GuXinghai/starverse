import { dialog } from 'electron'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { RegisterInvoke } from './types'
import { t } from '../i18n/mainI18n'

export const DIALOG_IPC_CHANNELS = [
  'dialog:select-file',
  'dialog:select-local-files',
  'dialog:import-libreoffice-svpkg',
  'dialog:quarantine-libreoffice-runtime',
] as const

type RegisterDialogIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  importLibreOfficeSvpkg?: (packagePath: string) => Promise<unknown>
  quarantineLibreOfficeRuntime?: () => Promise<unknown>
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
          ? [{ name: t('dialogs.file.filterImages'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
          : [{ name: t('dialogs.file.filterAllFiles'), extensions: ['*'] }],
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

  registerInvoke('dialog:import-libreoffice-svpkg', async () => {
    if (!input.importLibreOfficeSvpkg) {
      return {
        ok: false,
        reason: 'settings_action_not_wired',
        message: 'LibreOffice package import is unavailable.',
        errorChain: null,
      }
    }
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Starverse package', extensions: ['svpkg'] }],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return {
          ok: false,
          reason: 'operation_stale',
          message: 'LibreOffice package import was cancelled.',
          errorChain: null,
        }
      }
      const packagePath = result.filePaths[0]!
      console.log('[dialog] selected LibreOffice svpkg:', {
        hasFile: true,
        extension: path.extname(packagePath).toLowerCase(),
      })
      return await input.importLibreOfficeSvpkg(packagePath)
    } catch (error) {
      console.error('[dialog] LibreOffice svpkg import failed:', sanitizeDialogErrorMessage(error))
      return {
        ok: false,
        reason: 'local_package_unavailable',
        message: 'LibreOffice package import failed.',
        errorChain: null,
      }
    }
  })

  registerInvoke('dialog:quarantine-libreoffice-runtime', async () => {
    if (!input.quarantineLibreOfficeRuntime) {
      return {
        ok: false,
        reason: 'settings_action_not_wired',
        message: 'LibreOffice runtime quarantine is unavailable.',
        errorChain: null,
      }
    }
    try {
      return await input.quarantineLibreOfficeRuntime()
    } catch (error) {
      console.error('[dialog] LibreOffice runtime quarantine failed:', sanitizeDialogErrorMessage(error))
      return {
        ok: false,
        reason: 'local_package_unavailable',
        message: 'LibreOffice runtime quarantine failed.',
        errorChain: null,
      }
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
