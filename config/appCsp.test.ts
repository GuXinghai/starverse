import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { APP_CSP_PLACEHOLDER, getAppCsp, injectAppCspIntoHtml, normalizeAppCspEnv } from './appCsp'
import { appCspPlugin } from './appCspPlugin'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

  // R6-07 (P1-08, I7-01): the renderer makes no direct provider requests; providers are reached through the main process.
  it('limits production connect-src to self and closes base-uri and form-action', () => {
    const csp = getAppCsp('production')
    expect(csp.split('; ')).toEqual(expect.arrayContaining([
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ]))
    expect(csp).not.toContain('https://openrouter.ai')
  })

  it('keeps base-uri and form-action in development too, and the local dev servers connectable', () => {
    const csp = getAppCsp('development')
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain('ws://127.0.0.1:*')
  })

  it('treats only development-like Vite modes as development', () => {
    expect(['development', 'dev', 'test'].map(normalizeAppCspEnv)).toEqual(['development', 'development', 'development'])
    expect(['production', 'staging', '', null, undefined].map(normalizeAppCspEnv)).toEqual(Array(5).fill('production'))
  })

  it('injects generated CSP into index.html placeholder', () => {
    const template = `<meta http-equiv="Content-Security-Policy" content="${APP_CSP_PLACEHOLDER}">`
    const html = injectAppCspIntoHtml(template, getAppCsp('production'))
    expect(html).not.toContain(APP_CSP_PLACEHOLDER)
    expect(html).toContain('asset:')
  })
})

describe('appCspPlugin', () => {
  const template = `<meta content="${APP_CSP_PLACEHOLDER}">`
  function render(mode: string, nodeEnv: string): string {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = nodeEnv
    try {
      const plugin = appCspPlugin() as unknown as {
        configResolved: (config: { mode: string }) => void
        transformIndexHtml: (html: string) => string
      }
      plugin.configResolved({ mode })
      return plugin.transformIndexHtml(template)
    } finally {
      process.env.NODE_ENV = previous
    }
  }

  // R6-07 (P8-14): the Vite mode decides, not a stray NODE_ENV.
  it('ships no localhost allowance in a production build even when NODE_ENV says development', () => {
    expect(render('production', 'development')).not.toContain('localhost')
  })

  it('allows the local dev servers in development mode even when NODE_ENV says production', () => {
    expect(render('development', 'production')).toContain('http://localhost:*')
  })
})

describe('csp regression guards', () => {
  it('keeps index.html CSP as placeholder only', () => {
    const indexHtml = readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8')
    expect(indexHtml).toContain(`content="${APP_CSP_PLACEHOLDER}"`)
    expect(indexHtml).not.toContain("img-src 'self' data:")
  })

  it('does not reintroduce main-process CSP header injection', () => {
    const mainTs = readFileSync(path.join(ROOT_DIR, 'electron', 'mainV2.ts'), 'utf8')
    expect(mainTs).not.toContain('onHeadersReceived(')
    expect(mainTs).not.toContain('registerDevCspHeaders(')
  })
})
