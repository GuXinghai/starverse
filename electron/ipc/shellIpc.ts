import { shell } from 'electron'
import type { RegisterInvoke } from './types'
import { t } from '../i18n/mainI18n'
import { summarizeErrorForLog } from './logSanitizer'

export const SHELL_IPC_CHANNELS = ['shell:open-external'] as const

type RegisterShellIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
}>

export function registerShellIpc(input: RegisterShellIpcInput): string[] {
  const { registerInvoke } = input

  registerInvoke('shell:open-external', async (_event: unknown, url: unknown) => {
    try {
      const rawUrl = typeof url === 'string' ? url : ''
      if (!rawUrl) {
        throw new Error(t('dialogs.errors.invalidUrl'))
      }
      const parsed = new URL(rawUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(t('dialogs.errors.unsupportedProtocol'))
      }
      await shell.openExternal(parsed.toString())
      return { success: true }
    } catch (error) {
      const errorSummary = summarizeErrorForLog(error)
      console.error('[shell] open external error:', {
        errorName: errorSummary.name,
        errorCode: errorSummary.code,
        errorCategory: categorizeOpenExternalError(url),
      })
      return {
        success: false,
        error: errorSummary.sanitizedMessage,
      }
    }
  })

  return [...SHELL_IPC_CHANNELS]
}

function categorizeOpenExternalError(url: unknown): string {
  const rawUrl = typeof url === 'string' ? url : ''
  if (!rawUrl) return 'invalid_url'
  try {
    const parsed = new URL(rawUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'unsupported_protocol'
  } catch {
    return 'invalid_url'
  }
  return 'open_external_failed'
}
