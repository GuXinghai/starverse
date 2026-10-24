export type AppCspEnv = 'development' | 'production'

export const APP_CSP_PLACEHOLDER = '__APP_CSP__'

// The renderer makes no direct provider requests; providers are reached through the main process (R6-07).
const PROD_CONNECT_SRC = ["'self'"]

const DEV_CONNECT_SRC = [
  'https://generativelanguage.googleapis.com',
  'https://openrouter.ai',
  'ws://localhost:*',
  'ws://127.0.0.1:*',
  'http://localhost:*',
  'http://127.0.0.1:*',
]

function directive(name: string, sources: string[]): string {
  return `${name} ${sources.join(' ')}`
}

/** `input` is Vite's resolved `mode`, not `NODE_ENV`: a stray `NODE_ENV` must not change what a build ships. */
export function normalizeAppCspEnv(input: string | null | undefined): AppCspEnv {
  const value = String(input ?? '').trim().toLowerCase()
  if (value === 'development' || value === 'dev' || value === 'test') {
    return 'development'
  }
  return 'production'
}

export function getAppCsp(env: AppCspEnv): string {
  const connectSrc = env === 'development' ? [...PROD_CONNECT_SRC, ...DEV_CONNECT_SRC] : PROD_CONNECT_SRC
  const directives = [
    directive('default-src', ["'self'"]),
    directive('script-src', ["'self'", "'wasm-unsafe-eval'"]),
    directive('connect-src', connectSrc),
    directive('img-src', ["'self'", 'data:', 'asset:', 'blob:']),
    directive('style-src', ["'self'", "'unsafe-inline'"]),
    directive('font-src', ["'self'", 'data:']),
    directive('base-uri', ["'self'"]),
    directive('form-action', ["'self'"]),
  ]
  return directives.join('; ')
}

export function injectAppCspIntoHtml(html: string, csp: string): string {
  if (!html.includes(APP_CSP_PLACEHOLDER)) {
    throw new Error(`[app-csp] missing placeholder: ${APP_CSP_PLACEHOLDER}`)
  }
  return html.split(APP_CSP_PLACEHOLDER).join(csp)
}
