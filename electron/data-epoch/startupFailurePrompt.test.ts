import { describe, expect, it, vi } from 'vitest'

const showErrorBox = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  dialog: { showErrorBox },
}))

import { showStartupFailure, startupFailureDialogContent, startupFailureKind } from './startupFailurePrompt'

const DATABASE_PATH = 'C:/Users/me/AppData/Roaming/Starverse/epoch-2/starverse.db'

describe('fail-closed startup failure dialog', () => {
  it('separates integrity failures from storage, permission and lock failures', () => {
    for (const code of ['EPOCH2_DATABASE_CORRUPT', 'EPOCH2_DATABASE_STATE_INVALID',
      'EPOCH2_DATABASE_TRANSACTION_FAILED', 'EPOCH2_DATABASE_POSTCOMMIT_INVALID']) {
      expect(startupFailureKind(code)).toBe('integrity')
    }
    expect(startupFailureKind('EPOCH2_DATABASE_IO_FAILED')).toBe('io')
    expect(startupFailureKind('EPOCH2_DATABASE_ACCESS_DENIED')).toBe('access')
    expect(startupFailureKind('EPOCH2_DATABASE_OPEN_CANTOPEN')).toBe('access')
    expect(startupFailureKind('EPOCH2_WIN32_DATABASE_FILE_OPEN_FAILED')).toBe('access')
    expect(startupFailureKind('EPOCH2_DATABASE_BUSY')).toBe('busy')
    expect(startupFailureKind('EPOCH2_STARTUP_UNCLASSIFIED')).toBe('other')
  })

  it('explains that startup stopped to protect data and gives the code and database location', () => {
    const en = startupFailureDialogContent('EPOCH2_DATABASE_CORRUPT', DATABASE_PATH, 'en-US')
    expect(en.title).toBe('Starverse startup failed')
    expect(en.content).toContain('startup was stopped to protect your existing data')
    expect(en.content).toContain('not repaired, recreated, migrated or deleted')
    expect(en.content).toContain('Error code: EPOCH2_DATABASE_CORRUPT')
    expect(en.content).toContain(DATABASE_PATH)

    const zh = startupFailureDialogContent('EPOCH2_DATABASE_CORRUPT', DATABASE_PATH, 'zh-CN')
    expect(zh.title).toBe('Starverse 启动失败')
    expect(zh.content).toContain('为保护现有数据，已停止启动')
    expect(zh.content).toContain('错误代码：EPOCH2_DATABASE_CORRUPT')
    expect(zh.content).toContain(DATABASE_PATH)
  })

  it('uses a different reason for a busy database and omits an unavailable location', () => {
    const busy = startupFailureDialogContent('EPOCH2_DATABASE_BUSY', null, 'en-US')
    expect(busy.content).toContain('Another program is using the database')
    expect(busy.content).not.toContain('could not confirm that its database is intact')
    expect(busy.content).not.toContain('Database file')
  })

  it('shows the dialog with the localized content only', () => {
    showStartupFailure('EPOCH2_DATABASE_IO_FAILED', DATABASE_PATH, 'en-US')
    const expected = startupFailureDialogContent('EPOCH2_DATABASE_IO_FAILED', DATABASE_PATH, 'en-US')
    expect(showErrorBox).toHaveBeenCalledWith(expected.title, expected.content)
  })
})
