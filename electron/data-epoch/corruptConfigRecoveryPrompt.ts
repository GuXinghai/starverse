import { dialog } from 'electron'

export const CONFIG_CORRUPT_RECOVERY_AUTHORITY = 'SV_EPOCH2_RECOVER_ON_CONFIG_CORRUPT' as const

type ConfigCorruptRecoveryEnvironment = Readonly<Record<string, string | undefined>>

export function corruptConfigRecoveryDialogOptions(): Electron.MessageBoxOptions {
  return {
    type: 'warning',
    title: 'Starverse startup failed',
    message: '应用配置文件（config.json）已损坏，且无法自动修复。',
    detail: '选择“创建新配置”后，Starverse 会把损坏的配置文件原样保留在应用数据目录的 epoch-2-recovery-backups 文件夹中，再创建一个新的空白配置。' +
      '损坏文件中的应用设置、网络代理设置和已保存的凭据不会被载入，需要重新设置；原文件不会被修改或删除。' +
      '对话数据、工作区和附件不会被改动。',
    buttons: ['创建新配置', '退出'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
}

export function isCorruptConfigRecoveryAutomaticallyApproved(
  env: ConfigCorruptRecoveryEnvironment = process.env,
): boolean {
  return env[CONFIG_CORRUPT_RECOVERY_AUTHORITY] === '1'
}

export async function confirmFreshConfigCreation(
  env: ConfigCorruptRecoveryEnvironment = process.env,
): Promise<boolean> {
  if (isCorruptConfigRecoveryAutomaticallyApproved(env)) return true
  const result = await dialog.showMessageBox(corruptConfigRecoveryDialogOptions())
  return result.response === 0
}

export function configRepairedNoticeOptions(backupDirectory: string): Electron.MessageBoxOptions {
  return {
    type: 'info',
    title: 'Starverse',
    message: '检测到应用配置文件已损坏，已自动修复。',
    detail: `修复前的原始文件已完整保留在：\n${backupDirectory}`,
    buttons: ['确定'],
    noLink: true,
  }
}

/** Non-blocking: startup continues while the notice is shown. */
export function notifyConfigRepaired(backupDirectory: string): void {
  void dialog.showMessageBox(configRepairedNoticeOptions(backupDirectory)).catch(() => undefined)
}

export function configFreshCreatedNoticeOptions(backupDirectory: string): Electron.MessageBoxOptions {
  return {
    type: 'info',
    title: 'Starverse',
    message: '已创建新的应用配置。',
    detail: `损坏的原配置文件已原样保留在：\n${backupDirectory}\n应用设置、网络代理设置和凭据需要重新设置。`,
    buttons: ['确定'],
    noLink: true,
  }
}

export function notifyFreshConfigCreated(backupDirectory: string): void {
  void dialog.showMessageBox(configFreshCreatedNoticeOptions(backupDirectory)).catch(() => undefined)
}
