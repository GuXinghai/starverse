import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { highlightAsync } from './shikiLoader'
import { sanitizeHtml } from './sanitizer'
import type { FinalSnapshot } from './types'

/**
 * Final-path renderer for completed / history messages.
 *
 * Produces a one-shot, fully rendered HTML snapshot:
 *   markdown-it (html:false) → KaTeX math → Shiki code highlight → DOMPurify sanitize
 *
 * This is only called once per message (on stream completion or history load),
 * so full-parse cost is acceptable.
 */

// markdown-it instance with HTML disabled for security
const md = new MarkdownIt({
    html: false,        // CRITICAL: treat raw HTML in source as literal text
    linkify: true,      // auto-detect URLs
    typographer: false,  // keep model output faithful
    breaks: true,       // treat \n as <br> (matches streaming behavior)
})

export const KATEX_SHARED_OPTIONS = Object.freeze({
    throwOnError: false,
    trust: false,
    strict: false,
    output: 'htmlAndMathml' as const,
})

// Override default fence renderer to mark code blocks for async Shiki replacement
md.renderer.rules.fence = (tokens, idx, _options, env) => {
    const token = tokens[idx]
    const lang = token.info?.trim() || ''
    const code = token.content
    // Store in env for async post-processing
    const placeholder = `<!--shiki-placeholder-${idx}-->`
    if (!env._codeBlocks) env._codeBlocks = []
    env._codeBlocks.push({ idx, lang, code, placeholder })
    return `<div class="rt-code-block" data-lang="${escapeAttr(lang)}">${placeholder}</div>`
}

/**
 * Render a complete message text to a sanitized HTML snapshot.
 * Async because Shiki highlighting is async.
 */
export async function renderFinal(text: string): Promise<FinalSnapshot> {
    if (!text || text.trim().length === 0) {
        return { html: '', sanitizerRemoved: false }
    }

    // Pass 1: Pre-process math blocks before markdown-it
    const { processed, mathBlocks } = extractMathBlocks(text)

    // Pass 2: markdown-it parse
    const env: any = {}
    let html = md.render(processed, env)

    // Pass 3: Restore math blocks with KaTeX rendering
    // Placeholders may be wrapped in <p> tags by markdown-it, so replace both forms
    html = restoreMathBlocks(html, mathBlocks)

    // Pass 4: Replace Shiki placeholders with highlighted code
    if (env._codeBlocks) {
        for (const block of env._codeBlocks) {
            const highlighted = await highlightAsync(block.code, block.lang)
            html = html.replace(block.placeholder, highlighted)
        }
    }

    // Pass 5: Sanitize
    const result = sanitizeHtml(html)

    return {
        html: result.html,
        sanitizerRemoved: result.removed,
    }
}

/**
 * Synchronous markdown-it render for a single block (used by streaming renderer).
 * No Shiki, no async — just markdown + inline math.
 */
export function renderBlockSync(content: string): string {
    const { processed, mathBlocks } = extractMathBlocks(content)
    let html = md.render(processed)
    html = restoreMathBlocks(html, mathBlocks)

    return html
}

md.renderer.rules.link_open = (tokens, idx, _options, _env, self) => {
    const token = tokens[idx]
    token.attrSet('rel', 'noopener noreferrer')
    return self.renderToken(tokens, idx, _options)
}

// ---- Math extraction & rendering ----

interface MathBlock {
    placeholder: string
    content: string
    display: boolean
}

let mathCounter = 0

/**
 * Extract $...$ and $$...$$ math expressions before markdown-it sees them.
 * Replace with placeholders to avoid markdown-it interpreting $ as text.
 */
function extractMathBlocks(text: string): { processed: string; mathBlocks: MathBlock[] } {
    const blocks: MathBlock[] = []
    const segments = splitCodeAndTextSegments(text)
    const processed = segments
        .map((segment) => {
            if (segment.kind === 'code') return segment.content
            return replaceMathInPlainText(segment.content, blocks)
        })
        .join('')

    return { processed, mathBlocks: blocks }
}

/**
 * Render a single math expression using KaTeX.
 * throwOnError: false ensures a broken formula doesn't crash the whole message.
 */
function renderMath(content: string, display: boolean): string {
    try {
        const rendered = katex.renderToString(content, {
            displayMode: display,
            ...KATEX_SHARED_OPTIONS,
        })
        if (isKaTeXErrorHtml(rendered)) {
            return buildMathFallback(content, display)
        }
        return rendered
    } catch {
        return buildMathFallback(content, display)
    }
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function restoreMathBlocks(html: string, mathBlocks: ReadonlyArray<MathBlock>): string {
    let result = html
    for (const block of mathBlocks) {
        const rendered = renderMath(block.content, block.display)
        result = result.replace(`<p>${block.placeholder}</p>`, rendered)
        result = result.replace(block.placeholder, rendered)
    }
    return result
}

function buildMathFallback(content: string, display: boolean): string {
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const tag = display ? 'div' : 'span'
    return `<${tag} class="rt-math-error" title="Math rendering failed">${escaped}</${tag}>`
}

function isKaTeXErrorHtml(rendered: string): boolean {
    return rendered.includes('katex-error') || rendered.includes('color:#cc0000')
}

type TextSegment = Readonly<{
    kind: 'text' | 'code'
    content: string
}>

function splitCodeAndTextSegments(text: string): TextSegment[] {
    const withFences = splitByFencedCode(text)
    const out: TextSegment[] = []

    for (const segment of withFences) {
        if (segment.kind === 'code') {
            out.push(segment)
            continue
        }
        out.push(...splitByInlineCode(segment.content))
    }

    return out
}

function splitByFencedCode(text: string): TextSegment[] {
    const lines = text.split('\n')
    const segments: TextSegment[] = []
    let fenceMarker: string | null = null
    let buffer = ''
    let bufferKind: 'text' | 'code' = 'text'

    const flush = () => {
        if (!buffer) return
        segments.push({ kind: bufferKind, content: buffer })
        buffer = ''
    }

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        const withNewline = i < lines.length - 1 ? `${line}\n` : line

        if (fenceMarker === null) {
            const opener = line.match(/^\s*(`{3,}|~{3,})/)
            if (opener) {
                flush()
                bufferKind = 'code'
                fenceMarker = opener[1]
            }
            buffer += withNewline
            continue
        }

        buffer += withNewline
        const closeRegex = new RegExp(`^\\s*${escapeRegex(fenceMarker)}\\s*$`)
        if (closeRegex.test(line)) {
            flush()
            bufferKind = 'text'
            fenceMarker = null
        }
    }

    flush()
    return segments
}

function splitByInlineCode(text: string): TextSegment[] {
    const segments: TextSegment[] = []
    let cursor = 0

    while (cursor < text.length) {
        const start = text.indexOf('`', cursor)
        if (start < 0) break

        const tickLen = readTickRunLength(text, start)
        const delimiter = '`'.repeat(tickLen)
        const end = text.indexOf(delimiter, start + tickLen)
        if (end < 0) break

        if (start > cursor) {
            segments.push({ kind: 'text', content: text.slice(cursor, start) })
        }
        segments.push({ kind: 'code', content: text.slice(start, end + tickLen) })
        cursor = end + tickLen
    }

    if (cursor < text.length) {
        segments.push({ kind: 'text', content: text.slice(cursor) })
    }

    if (segments.length === 0) {
        segments.push({ kind: 'text', content: text })
    }
    return segments
}

function readTickRunLength(text: string, start: number): number {
    let len = 0
    for (let i = start; i < text.length && text[i] === '`'; i += 1) {
        len += 1
    }
    return len
}

function replaceMathInPlainText(text: string, blocks: MathBlock[]): string {
    let result = text

    // Display math (must run before inline to avoid $$...$$ double-match):
    //   $$...$$ and \[...\]
    result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_match, content: string) => {
        const id = `MATH_BLOCK_${mathCounter++}_PH`
        blocks.push({ placeholder: id, content: content.trim(), display: true })
        return id
    })

    result = result.replace(/\\{1,2}\[([\s\S]+?)\\{1,2}\]/g, (_match, content: string) => {
        const id = `MATH_BLOCK_${mathCounter++}_PH`
        blocks.push({ placeholder: id, content: content.trim(), display: true })
        return id
    })

    // Inline math: $...$ and \(...\)
    result = result.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (_match, content: string) => {
        const id = `MATH_INLINE_${mathCounter++}_PH`
        blocks.push({ placeholder: id, content: content.trim(), display: false })
        return id
    })

    result = result.replace(/\\{1,2}\((.+?)\\{1,2}\)/g, (_match, content: string) => {
        const id = `MATH_INLINE_${mathCounter++}_PH`
        blocks.push({ placeholder: id, content: content.trim(), display: false })
        return id
    })

    return result
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
