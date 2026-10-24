import type { Plugin } from 'vite'
import { getAppCsp, injectAppCspIntoHtml, normalizeAppCspEnv, type AppCspEnv } from './appCsp'

// SSOT: the CSP is generated here from Vite's resolved mode and injected into the index.html placeholder.
export function appCspPlugin(name = 'app-csp-meta-inject'): Plugin {
  let env: AppCspEnv = 'production'
  return {
    name,
    configResolved(config) {
      env = normalizeAppCspEnv(config.mode)
    },
    transformIndexHtml(html) {
      return injectAppCspIntoHtml(html, getAppCsp(env))
    },
  }
}
