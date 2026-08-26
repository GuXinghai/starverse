import type { HighlighterCore } from 'shiki/core'
import { createHighlighterCore } from 'shiki/core'
import type { LanguageInput } from '@shikijs/types'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import githubDark from 'shiki/themes/github-dark.mjs'

import javascript from 'shiki/langs/javascript.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import python from 'shiki/langs/python.mjs'
import json from 'shiki/langs/json.mjs'
import html from 'shiki/langs/html.mjs'
import css from 'shiki/langs/css.mjs'
import markdown from 'shiki/langs/markdown.mjs'
import bash from 'shiki/langs/bash.mjs'
import sql from 'shiki/langs/sql.mjs'

/**
 * Lazy singleton loader for Shiki highlighter.
 *
 * Only a small core language set is loaded eagerly; the remaining languages
 * are code-split into separate chunks and loaded on first use. A single theme
 * (github-dark) is loaded — the app has no light-theme rendering path.
 */

const CORE_LANGS: LanguageInput[] = [
    javascript,
    typescript,
    python,
    json,
    html,
    css,
    markdown,
    bash,
    sql,
]

const CORE_LANG_KEYS = new Set([
    'javascript',
    'typescript',
    'python',
    'json',
    'html',
    'css',
    'markdown',
    'bash',
    'sql',
])

const ALIAS_TO_LANG: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'markdown',
    'c++': 'cpp',
}

const LAZY_LANG_LOADERS: Record<string, () => Promise<{ default: LanguageInput }>> = {
    rust: () => import('shiki/langs/rust.mjs'),
    go: () => import('shiki/langs/go.mjs'),
    java: () => import('shiki/langs/java.mjs'),
    c: () => import('shiki/langs/c.mjs'),
    cpp: () => import('shiki/langs/cpp.mjs'),
    yaml: () => import('shiki/langs/yaml.mjs'),
    toml: () => import('shiki/langs/toml.mjs'),
    xml: () => import('shiki/langs/xml.mjs'),
    diff: () => import('shiki/langs/diff.mjs'),
    dockerfile: () => import('shiki/langs/dockerfile.mjs'),
    lua: () => import('shiki/langs/lua.mjs'),
    ruby: () => import('shiki/langs/ruby.mjs'),
    php: () => import('shiki/langs/php.mjs'),
    swift: () => import('shiki/langs/swift.mjs'),
    kotlin: () => import('shiki/langs/kotlin.mjs'),
    scala: () => import('shiki/langs/scala.mjs'),
}

let instance: HighlighterCore | null = null
let loading: Promise<HighlighterCore> | null = null
const readyListeners = new Set<() => void>()
let lifecycle = 0
const loadedLazyLangs = new Set<string>()
const pendingLazyLoads = new Map<string, Promise<void>>()

export function getHighlighter(): Promise<HighlighterCore> {
    if (instance) return Promise.resolve(instance)
    if (loading) return loading

    const loadLifecycle = lifecycle
    loading = createHighlighterCore({
        themes: [githubDark],
        langs: [...CORE_LANGS],
        engine: createOnigurumaEngine(import('shiki/wasm')),
    })
        .then((highlighter) => {
            if (loadLifecycle !== lifecycle) {
                highlighter.dispose()
                throw new Error('shiki_loader_disposed')
            }
            instance = highlighter
            notifyReady()
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
 * True when a code block can still upgrade to a highlighted render:
 * the highlighter is not ready yet, or the language is known but not loaded.
 */
export function isLangLoadable(lang: string): boolean {
    if (!instance) return true
    const key = resolveLangKey(lang)
    return key !== null && !isLangLoaded(key)
}

/**
 * Highlight code synchronously if the highlighter and the language are already
 * loaded, otherwise return null (caller should use monospace fallback).
 * A known but not-yet-loaded language starts loading in the background.
 */
export function highlightSync(code: string, lang: string): string | null {
    if (!instance) return null
    const key = resolveLangKey(lang)
    if (key && !isLangLoaded(key)) {
        void ensureLanguage(key)
        return null
    }
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
 * Highlight code asynchronously (loads highlighter and language if needed).
 */
export async function highlightAsync(code: string, lang: string): Promise<string> {
    const hl = await getHighlighter()
    const key = resolveLangKey(lang)
    if (key) await ensureLanguage(key)
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
    loadedLazyLangs.clear()
    pendingLazyLoads.clear()
}

function resolveLangKey(lang: string): string | null {
    const normalized = lang.trim().toLowerCase()
    if (CORE_LANG_KEYS.has(normalized) || LAZY_LANG_LOADERS[normalized]) return normalized
    const canonical = ALIAS_TO_LANG[normalized]
    if (canonical) return canonical
    return null
}

function isLangLoaded(key: string): boolean {
    return CORE_LANG_KEYS.has(key) || loadedLazyLangs.has(key)
}

function ensureLanguage(lang: string): Promise<void> {
    const loader = LAZY_LANG_LOADERS[lang]
    if (!loader) return Promise.resolve()
    if (loadedLazyLangs.has(lang)) return Promise.resolve()
    const existing = pendingLazyLoads.get(lang)
    if (existing) return existing

    const loadLifecycle = lifecycle
    const promise = loader()
        .then(async (mod) => {
            if (loadLifecycle !== lifecycle || !instance) return
            await instance.loadLanguage(mod.default as LanguageInput)
        })
        .then(() => {
            if (loadLifecycle !== lifecycle) return
            loadedLazyLangs.add(lang)
            notifyReady()
        })
        .catch(() => {
            // Unknown/unavailable language — keep the monospace fallback.
        })
        .finally(() => {
            pendingLazyLoads.delete(lang)
        })
    pendingLazyLoads.set(lang, promise)
    return promise
}

function notifyReady(): void {
    for (const listener of readyListeners) {
        try {
            listener()
        } catch {
            // A view notification must not invalidate the shared highlighter.
        }
    }
}