import { dialog } from 'electron'
import type { SupportedLocale } from '../../src/shared/i18n/localeTypes'
import { t, tf } from '../i18n/mainI18n'

export const SCHEMA_MISMATCH_RECOVERY_AUTHORITY = 'SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH' as const

type SchemaMismatchRecoveryEnvironment = Readonly<Record<string, string | undefined>>

// P2a-02: the database (conversations and OpenAI-compatible providers with their
// keys) moves to the backup; config.json, including built-in provider keys, stays.
export function schemaMismatchRecoveryDialogOptions(
  backupRoot: string,
  locale?: SupportedLocale,
): Electron.MessageBoxOptions {
  return {
    type: 'warning',
    title: t('dialogs.schemaRecovery.title', locale),
    message: t('dialogs.schemaRecovery.message', locale),
    detail: tf('dialogs.schemaRecovery.detail', { backupRoot }, locale),
    buttons: [t('dialogs.schemaRecovery.confirm', locale), t('dialogs.schemaRecovery.quit', locale)],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
}

export function schemaMismatchRecoveredNoticeOptions(
  backupDirectory: string,
  locale?: SupportedLocale,
): Electron.MessageBoxOptions {
  return {
    type: 'info',
    title: 'Starverse',
    message: t('dialogs.schemaRecovery.successMessage', locale),
    detail: tf('dialogs.schemaRecovery.successDetail', { backupDirectory }, locale),
    buttons: [t('dialogs.schemaRecovery.ok', locale)],
    noLink: true,
  }
}

/** Non-blocking: startup continues while the notice is shown. */
export function notifySchemaMismatchRecovered(backupDirectory: string, locale?: SupportedLocale): void {
  void dialog.showMessageBox(schemaMismatchRecoveredNoticeOptions(backupDirectory, locale)).catch(() => undefined)
}

export function isSchemaMismatchRecoveryAutomaticallyApproved(
  env: SchemaMismatchRecoveryEnvironment = process.env,
): boolean {
  return env[SCHEMA_MISMATCH_RECOVERY_AUTHORITY] === '1'
}

export function shouldAttemptSchemaMismatchRecovery(
  failureCode: string,
  agentAutomation: boolean,
  env: SchemaMismatchRecoveryEnvironment = process.env,
): boolean {
  return failureCode === 'EPOCH2_DATABASE_SCHEMA_MISMATCH' &&
    (!agentAutomation || isSchemaMismatchRecoveryAutomaticallyApproved(env))
}

export async function confirmSchemaMismatchRecovery(
  backupRoot: string,
  locale?: SupportedLocale,
  env: SchemaMismatchRecoveryEnvironment = process.env,
): Promise<boolean> {
  if (isSchemaMismatchRecoveryAutomaticallyApproved(env)) return true
  const result = await dialog.showMessageBox(schemaMismatchRecoveryDialogOptions(backupRoot, locale))
  return result.response === 0
}
