import { dialog } from 'electron'

export const SCHEMA_MISMATCH_RECOVERY_AUTHORITY = 'SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH' as const

type SchemaMismatchRecoveryEnvironment = Readonly<Record<string, string | undefined>>

export function schemaMismatchRecoveryDialogOptions(): Electron.MessageBoxOptions {
  return {
    type: 'warning',
    title: 'Starverse startup failed',
    message: '数据库 schema 与本版本不匹配（检测到 schema 变更）。',
    detail: '旧数据无法自动迁移。选择“备份并重置”后，Starverse 会先备份当前数据库，再创建新数据库。应用配置和凭据不会被重置。',
    buttons: ['备份并重置', '退出'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
}

export function isSchemaMismatchRecoveryAutomaticallyApproved(
  env: SchemaMismatchRecoveryEnvironment = process.env,
): boolean {
  return env[SCHEMA_MISMATCH_RECOVERY_AUTHORITY] === '1'
}

export async function confirmSchemaMismatchRecovery(
  env: SchemaMismatchRecoveryEnvironment = process.env,
): Promise<boolean> {
  if (isSchemaMismatchRecoveryAutomaticallyApproved(env)) return true
  const result = await dialog.showMessageBox(schemaMismatchRecoveryDialogOptions())
  return result.response === 0
}
