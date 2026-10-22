import { describe, expect, it, vi } from 'vitest'

const showMessageBox = vi.hoisted(() => vi.fn())
const BACKUP_ROOT = 'C:/Users/me/AppData/Roaming/Starverse/epoch-2-recovery-backups'

vi.mock('electron', () => ({
  dialog: { showMessageBox },
}))

import {
  confirmSchemaMismatchRecovery,
  schemaMismatchRecoveredNoticeOptions,
  isSchemaMismatchRecoveryAutomaticallyApproved,
  schemaMismatchRecoveryDialogOptions,
  shouldAttemptSchemaMismatchRecovery,
} from './schemaMismatchRecoveryPrompt'

describe('schema mismatch recovery prompt', () => {
  it('requires explicit reset authority for agent startup and only handles schema mismatch', () => {
    const mismatch = 'EPOCH2_DATABASE_SCHEMA_MISMATCH'
    expect(shouldAttemptSchemaMismatchRecovery(mismatch, true, {})).toBe(false)
    expect(shouldAttemptSchemaMismatchRecovery(mismatch, true,
      { SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH: 'true' })).toBe(false)
    const approved = { SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH: '1' }
    expect(shouldAttemptSchemaMismatchRecovery(mismatch, true, approved)).toBe(true)
    expect(shouldAttemptSchemaMismatchRecovery(mismatch, false, {})).toBe(true)
    for (const code of ['EPOCH2_CONFIG_CORRUPT', 'EPOCH2_DATABASE_OPEN_FAILED',
      'EPOCH2_RESET_JOURNAL_INVALID', 'NODE_MODULE_VERSION', 'EPOCH2_STARTUP_UNCLASSIFIED']) {
      expect(shouldAttemptSchemaMismatchRecovery(code, true, approved)).toBe(false)
      expect(shouldAttemptSchemaMismatchRecovery(code, false, approved)).toBe(false)
    }
  })

  it('keeps the explicit environment authority as a non-interactive bypass', async () => {
    const env = { SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH: '1' }

    await expect(confirmSchemaMismatchRecovery(BACKUP_ROOT, 'zh-CN', env)).resolves.toBe(true)
    expect(isSchemaMismatchRecoveryAutomaticallyApproved(env)).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('confirms backup and reset from the destructive action button', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 })

    await expect(confirmSchemaMismatchRecovery(BACKUP_ROOT, 'zh-CN', {})).resolves.toBe(true)
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      type: 'warning',
      buttons: ['备份并重置', '退出'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    }))
  })

  it('keeps the application fail-closed when the user exits', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1 })

    await expect(confirmSchemaMismatchRecovery(BACKUP_ROOT, 'zh-CN', {})).resolves.toBe(false)
  })

  // P2a-02: the dialog must say what moves to the backup, what stays and where
  // the backup goes; the old text claimed that no credentials were reset.
  it('P2a-02: states what moves to the backup, what stays, and where the backup is', () => {
    const zh = schemaMismatchRecoveryDialogOptions(BACKUP_ROOT, 'zh-CN')
    expect(zh.detail).toContain('OpenAI 兼容服务商及其 API 密钥')
    expect(zh.detail).toContain('保留：应用设置和内置服务商的 API 密钥')
    expect(zh.detail).toContain(BACKUP_ROOT)
    expect(zh.detail).not.toContain('凭据不会被重置')

    const en = schemaMismatchRecoveryDialogOptions(BACKUP_ROOT, 'en-US')
    expect(en.message).toContain('schema')
    expect(en.detail).toContain('OpenAI-compatible providers with their API keys')
    expect(en.detail).toContain('Kept: app settings and the API keys of built-in providers')
    expect(en.detail).toContain(BACKUP_ROOT)
    expect(en.buttons).toEqual(['Back up and reset', 'Quit'])
  })

  it('P2a-02: reports the backup directory after a successful recovery', () => {
    const directory = `${BACKUP_ROOT}/epoch-2-1700000000000`
    const notice = schemaMismatchRecoveredNoticeOptions(directory, 'en-US')
    expect(notice).toMatchObject({ type: 'info', message: 'The database was backed up and reset.', buttons: ['OK'] })
    expect(notice.detail).toContain(directory)
    expect(schemaMismatchRecoveredNoticeOptions(directory, 'zh-CN').detail).toContain(directory)
  })
})
