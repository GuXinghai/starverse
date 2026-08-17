import { describe, expect, it, vi } from 'vitest'

const showMessageBox = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  dialog: { showMessageBox },
}))

import {
  confirmSchemaMismatchRecovery,
  isSchemaMismatchRecoveryAutomaticallyApproved,
  schemaMismatchRecoveryDialogOptions,
} from './schemaMismatchRecoveryPrompt'

describe('schema mismatch recovery prompt', () => {
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
