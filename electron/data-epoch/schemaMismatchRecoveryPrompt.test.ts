import { describe, expect, it, vi } from 'vitest'

const showMessageBox = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  dialog: { showMessageBox },
}))

import {
  confirmSchemaMismatchRecovery,
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

    await expect(confirmSchemaMismatchRecovery(env)).resolves.toBe(true)
    expect(isSchemaMismatchRecoveryAutomaticallyApproved(env)).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('confirms backup and reset from the destructive action button', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 })

    await expect(confirmSchemaMismatchRecovery({})).resolves.toBe(true)
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

    await expect(confirmSchemaMismatchRecovery({})).resolves.toBe(false)
  })

  it('explains that the database is backed up while config and credentials remain', () => {
    const options = schemaMismatchRecoveryDialogOptions()

    expect(options.message).toContain('schema')
    expect(options.detail).toContain('备份当前数据库')
    expect(options.detail).toContain('配置和凭据不会被重置')
  })
})
