/**
 * Vitest 测试环境全局设置
 */

import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'
import { config } from '@vue/test-utils'

// Mock Electron APIs
global.window = global.window || {}
;(global.window as any).electron = {
  store: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  },
  api: {
    selectImage: vi.fn(),
    selectFile: vi.fn(),
    openExternal: vi.fn(),
    showImageInFolder: vi.fn()
  },
  ipc: {
    invoke: vi.fn()
  },
  db: {
    invoke: vi.fn()
  }
}

// 配置 Vue Test Utils
config.global.mocks = {
  $electron: (global.window as any).electron
}

// 每个测试前重置所有 mocks
beforeEach(() => {
  vi.clearAllMocks()
})
