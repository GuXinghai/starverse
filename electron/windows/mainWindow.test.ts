import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: {},
  dialog: {},
  shell: {},
}))

import { createMainWindowNavigationPolicy } from './mainWindow'

describe('main window navigation policy', () => {
  it('allows only the exact dev-server origin', () => {
    const policy = createMainWindowNavigationPolicy({
      isDev: true,
      viteDevServerUrl: 'http://127.0.0.1:5173/',
      rendererDist: 'dist',
    })

    expect(policy.isTrustedAppUrl('http://127.0.0.1:5173/settings')).toBe(true)
    expect(policy.isTrustedAppUrl('http://127.0.0.1:51730/evil')).toBe(false)
    expect(policy.externalHttpUrl('http://127.0.0.1:51730/evil')).toBe('http://127.0.0.1:51730/evil')
  })

  it.each([
    'file:///C:/Users/alice/secret.txt',
    'data:text/html,hello',
    'javascript:alert(1)',
  ])('does not trust %s', (url) => {
    const policy = createMainWindowNavigationPolicy({
      isDev: true,
      viteDevServerUrl: 'http://127.0.0.1:5173/',
      rendererDist: 'dist',
    })

    expect(policy.isTrustedAppUrl(url)).toBe(false)
    expect(policy.externalHttpUrl(url)).toBeNull()
  })

  it('allows only the packaged renderer entry file in production', () => {
    const rendererDist = path.resolve('dist')
    const policy = createMainWindowNavigationPolicy({
      isDev: false,
      rendererDist,
    })

    expect(policy.isTrustedAppUrl(pathToFileURL(path.join(rendererDist, 'index.html')).href)).toBe(true)
    expect(policy.isTrustedAppUrl(pathToFileURL(path.join(rendererDist, 'other.html')).href)).toBe(false)
    expect(policy.externalHttpUrl('https://example.com/path')).toBe('https://example.com/path')
  })
})
