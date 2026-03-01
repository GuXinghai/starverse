import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { APP_CSP_PLACEHOLDER, getAppCsp, injectAppCspIntoHtml } from './appCsp'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

describe('appCsp', () => {
  it('builds production CSP with asset image support', () => {
    const csp = getAppCsp('production')
    expect(csp).toContain("img-src 'self' data: asset: blob:")
    expect(csp).not.toContain('ws://localhost:*')
  })

  it('builds development CSP with local ws/http connect allowances', () => {
    const csp = getAppCsp('development')
    expect(csp).toContain('ws://localhost:*')
    expect(csp).toContain('http://localhost:*')
  })

  it('injects generated CSP into index.html placeholder', () => {
    const template = `<meta http-equiv="Content-Security-Policy" content="${APP_CSP_PLACEHOLDER}">`
    const html = injectAppCspIntoHtml(template, getAppCsp('production'))
    expect(html).not.toContain(APP_CSP_PLACEHOLDER)
    expect(html).toContain('asset:')
  })
})

describe('csp regression guards', () => {
  it('keeps index.html CSP as placeholder only', () => {
    const indexHtml = readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8')
    expect(indexHtml).toContain(`content="${APP_CSP_PLACEHOLDER}"`)
    expect(indexHtml).not.toContain("img-src 'self' data:")
  })

  it('does not reintroduce main-process CSP header injection', () => {
    const mainTs = readFileSync(path.join(ROOT_DIR, 'electron', 'main.ts'), 'utf8')
    expect(mainTs).not.toContain('onHeadersReceived(')
    expect(mainTs).not.toContain('registerDevCspHeaders(')
  })
})
