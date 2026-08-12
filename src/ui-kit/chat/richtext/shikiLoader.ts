import type { Highlighter } from 'shiki'

/**
 * Lazy singleton loader for Shiki highlighter.
 *
 * Initial language set covers common LLM output languages.
 * The highlighter instance is cached — repeated calls return the same instance.
 */

let instance: Highlighter | null = null
let loading: Promise<Highlighter> | null = null
const readyListeners = new Set<() => void>()
let lifecycle = 0

const INITIAL_LANGS = [
    'javascript', 'typescript', 'python', 'json', 'html', 'css',
    'bash', 'shell', 'sql', 'rust', 'go', 'java', 'c', 'cpp',
    'markdown', 'yaml', 'toml', 'xml', 'diff', 'dockerfile',
    'lua', 'ruby', 'php', 'swift', 'kotlin', 'scala',
] as const

const THEMES = ['github-dark', 'github-light'] as const

export function getHighlighter(): Promise<Highlighter> {
    if (instance) return Promise.resolve(instance)
    if (loading) return loading

    const loadLifecycle = lifecycle
    loading = import('shiki')
        .then(({ createHighlighter }) => createHighlighter({
            themes: [...THEMES],
            langs: [...INITIAL_LANGS],
        }))
        .then((highlighter) => {
            if (loadLifecycle !== lifecycle) {
                highlighter.dispose()
                throw new Error('shiki_loader_disposed')
            }
            instance = highlighter
            for (const listener of readyListeners) {
                try {
                    listener()
                } catch {
                    // A view notification must not invalidate the shared highlighter.
                }
            }
            return highlighter
        })
        .finally(() => {
            if (loadLifecycle === lifecycle) loading = null
        })
    return loading
}

/** Start the singleton load without blocking the renderer's plaintext fallback. */
export function requestHighlighter(): void {
    void getHighlighter().catch(() => {
        // Keep the safe monospace fallback when Shiki or its WASM runtime is unavailable.
    })
}

/** Internal subscription used by rich-text views to upgrade a fallback after a successful load. */
export function subscribeHighlighterReady(listener: () => void): () => void {
    readyListeners.add(listener)
    if (instance) queueMicrotask(listener)
    return () => readyListeners.delete(listener)
}

export function isHighlighterReady(): boolean {
    return instance !== null
}

/**
 * Highlight code synchronously if the highlighter is already loaded,
 * otherwise return null (caller should use monospace fallback).
 */
export function highlightSync(code: string, lang: string): string | null {
    if (!instance) return null
    try {
        return instance.codeToHtml(code, {
            lang: lang || 'text',
            theme: 'github-dark',
        })
    } catch {
        // Unknown language or other error — fall back
        return null
    }
}

/**
 * Highlight code asynchronously (loads highlighter if needed).
 */
export async function highlightAsync(code: string, lang: string): Promise<string> {
    const hl = await getHighlighter()
    try {
        return hl.codeToHtml(code, {
            lang: lang || 'text',
            theme: 'github-dark',
        })
    } catch {
        // Unknown language — return plain pre/code
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `<pre class="shiki" style="background-color:#24292e"><code>${escaped}</code></pre>`
    }
}

/**
 * Dispose the cached highlighter instance (for cleanup/testing).
 */
export function disposeHighlighter(): void {
    lifecycle += 1
    if (instance) {
        instance.dispose()
        instance = null
    }
    loading = null
}
