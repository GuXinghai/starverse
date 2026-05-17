import { shell } from 'electron'
import type { RegisterInvoke } from './types'
import { t } from '../i18n/mainI18n'

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
      console.error('[shell] open external error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  return [...SHELL_IPC_CHANNELS]
}