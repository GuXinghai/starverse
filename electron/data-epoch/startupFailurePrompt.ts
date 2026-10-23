import { dialog } from 'electron'
import type { SupportedLocale } from '../../src/shared/i18n/localeTypes'
import { t, tf } from '../i18n/mainI18n'

export type StartupFailureKind = 'integrity' | 'io' | 'access' | 'busy' | 'other'

// Database-wide failures stop startup and leave the database untouched. Codes
// that cannot prove the file is intact count as integrity failures; storage,
// permission and lock failures are reported separately because the data is
// usually fine and the cause lies outside the app.
const KIND_BY_CODE: Readonly<Record<string, StartupFailureKind>> = Object.freeze({
  EPOCH2_DATABASE_CORRUPT: 'integrity',
  EPOCH2_DATABASE_STATE_INVALID: 'integrity',
  EPOCH2_DATABASE_TRANSACTION_FAILED: 'integrity',
  EPOCH2_DATABASE_POSTCOMMIT_INVALID: 'integrity',
  EPOCH2_DATABASE_IO_FAILED: 'io',
  EPOCH2_DATABASE_ACCESS_DENIED: 'access',
  EPOCH2_DATABASE_OPEN_CANTOPEN: 'access',
  EPOCH2_DATABASE_OPEN_FAILED: 'access',
  EPOCH2_WIN32_DATABASE_FILE_OPEN_FAILED: 'access',
  EPOCH2_DATABASE_BUSY: 'busy',
})

export function startupFailureKind(code: string): StartupFailureKind {
  return KIND_BY_CODE[code] ?? 'other'
}

/** The dialog shows only the stable code and the database location, never raw error text. */
export function startupFailureDialogContent(
  code: string,
  databasePath: string | null,
  locale?: SupportedLocale,
): Readonly<{ title: string; content: string }> {
  const lines = [
    t(`dialogs.startupFailure.${startupFailureKind(code)}`, locale),
    t('dialogs.startupFailure.preserved', locale),
    '',
    tf('dialogs.startupFailure.code', { code }, locale),
  ]
  if (databasePath) lines.push(tf('dialogs.startupFailure.databasePath', { databasePath }, locale))
  return Object.freeze({ title: t('dialogs.startupFailure.title', locale), content: lines.join('\n') })
}

export function showStartupFailure(code: string, databasePath: string | null, locale?: SupportedLocale): void {
  const { title, content } = startupFailureDialogContent(code, databasePath, locale)
  dialog.showErrorBox(title, content)
}
