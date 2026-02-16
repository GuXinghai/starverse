import { BlockTokenizer } from './blockTokenizer'
import { KATEX_SHARED_OPTIONS, renderBlockSync } from './finalRenderer'
import { sanitizeHtml } from './sanitizer'
import { highlightSync, highlightAsync } from './shikiLoader'
import katex from 'katex'
import type { StreamBlock } from './types'

/**
 * Imperative DOM renderer for active streaming messages.
 *
 * Key design:
 * - Bypasses Vue VDOM entirely — operates directly on a container ref
 * - Batches DOM mutations in requestAnimationFrame
 * - Only touches tail (open) blocks and newly-closed blocks
 * - Code highlighting and math rendering deferred to block closure
 *
 * Performance contracts:
 * - Each chunk touches only tail DOM nodes + any newly-closed block
 * - No innerHTML on the root container
 * - Code highlight and math render never fire on unclosed blocks
 */
export class StreamRenderer {
    private container: HTMLElement
    private tokenizer = new BlockTokenizer()
    private renderedBlockCount = 0
    private blockElements: HTMLElement[] = []
    private pendingRaf: number | null = null
    private lastText = ''
    private disposed = false
    private fallbackMode = false
    private prevBlockMeta: Array<{ state: StreamBlock['state']; kind: StreamBlock['kind'] }> = []

    constructor(container: HTMLElement) {
        this.container = container
    }

    /**
     * Feed new text from the streaming source.
     * Called on every contentBlocks change.
     */
    feed(fullText: string): void {
        if (this.disposed || this.fallbackMode) return
        if (fullText === this.lastText) return
        this.lastText = fullText

        this.tokenizer.feed(fullText)
        this.scheduleFlush()
    }

    /**
     * Finalize: called when streaming completes.
     * Runs the final-path renderer and replaces container content.
     * This is handled externally by the Vue component using finalRenderer.
     */
    finalize(): void {
        this.cancelPendingRaf()
    }

    /** Dispose renderer, cancel pending operations */
    dispose(): void {
        this.disposed = true
        this.cancelPendingRaf()
        this.tokenizer.reset()
        this.blockElements = []
        this.prevBlockMeta = []
    }

    private cancelPendingRaf(): void {
        if (this.pendingRaf !== null) {
            cancelAnimationFrame(this.pendingRaf)
            this.pendingRaf = null
        }
    }

    private scheduleFlush(): void {
        if (this.pendingRaf !== null) return
        this.pendingRaf = requestAnimationFrame(() => {
            this.pendingRaf = null
            if (!this.disposed) {
                this.flush()
            }
        })
    }

    /**
     * Execute batched DOM updates.
     * Strategy:
     * 1. For each closed block not yet rendered → render and freeze
     * 2. For the open tail block → update/replace tail element
     */
    private flush(): void {
        const blocks = this.tokenizer.getBlocks()

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i]
            const prevMeta = this.prevBlockMeta[i]

            if (i < this.renderedBlockCount) {
                // Re-render when an existing block transitions open -> closed.
                if (prevMeta && prevMeta.state === 'open' && block.state === 'closed') {
                    if (prevMeta.kind !== block.kind) {
                        this.replaceBlockElement(i)
                    }
                    this.renderClosedBlock(block, i)
                    continue
                }

                // Already rendered block — check if it was updated (only possible for tail)
                if (i === blocks.length - 1 && block.state === 'open') {
                    this.updateTailBlock(block, i)
                }
                continue
            }

            // New block — needs rendering
            if (block.state === 'closed') {
                this.renderClosedBlock(block, i)
            } else {
                // Open tail block
                this.renderTailBlock(block, i)
            }
        }

        // Remove excess elements if blocks were re-tokenized to fewer
        while (this.blockElements.length > blocks.length) {
            const el = this.blockElements.pop()
            if (el?.parentNode === this.container) {
                this.container.removeChild(el)
            }
        }
        this.prevBlockMeta = blocks.map((b) => ({ state: b.state, kind: b.kind }))
        this.renderedBlockCount = blocks.length
    }

    /** Render a fully closed block with proper formatting */
    private renderClosedBlock(block: StreamBlock, index: number): void {
        const el = this.getOrCreateBlockElement(index)

        switch (block.kind) {
            case 'fenced_code':
                this.renderCodeBlock(el, block)
                break
            case 'math_block':
                this.renderMathBlock(el, block)
                break
            default:
                this.renderMarkdownBlock(el, block)
                break
        }

        el.classList.add('rt-block-frozen')
        el.classList.remove('rt-block-open')
    }

    /** Render open tail block (lightweight, will be replaced when closed) */
    private renderTailBlock(block: StreamBlock, index: number): void {
        const el = this.getOrCreateBlockElement(index)

        switch (block.kind) {
            case 'fenced_code':
                // Show as monospace pre while unclosed
                el.className = 'rt-block rt-block-open rt-code-block'
                el.textContent = block.content
                break
            case 'math_block':
                // Show raw math while unclosed
                el.className = 'rt-block rt-block-open rt-math-block'
                el.textContent = block.content
                break
            default:
                // Lightweight markdown render for paragraphs, headings etc.
                this.renderMarkdownBlock(el, block)
                el.classList.add('rt-block-open')
                el.classList.remove('rt-block-frozen')
                break
        }
    }

    /** Update an existing open tail block */
    private updateTailBlock(block: StreamBlock, index: number): void {
        const el = this.blockElements[index]
        if (!el) return

        switch (block.kind) {
            case 'fenced_code':
                el.textContent = block.content
                break
            case 'math_block':
                el.textContent = block.content
                break
            default:
                this.renderMarkdownBlock(el, block)
                break
        }
    }

    /** Render a Markdown block (paragraph, heading, blockquote, list, table) */
    private renderMarkdownBlock(el: HTMLElement, block: StreamBlock): void {
        const html = renderBlockSync(block.content)
        const { html: clean, removed } = sanitizeHtml(html)

        if (removed) {
            console.warn('[StreamRenderer] Sanitizer removed dangerous content, falling back to plaintext')
            this.fallbackToPlaintext()
            return
        }

        el.className = `rt-block rt-${block.kind}`
        el.innerHTML = clean
    }

    /** Render a closed code block: monospace first, then async Shiki */
    private renderCodeBlock(el: HTMLElement, block: StreamBlock): void {
        const lang = block.meta || ''
        const code = this.extractCodeContent(block.content)

        el.className = 'rt-block rt-code-block'

        // Try sync highlight first (if Shiki is already loaded)
        const syncResult = highlightSync(code, lang)
        if (syncResult) {
            const { html: clean, removed } = sanitizeHtml(syncResult)
            if (!removed) {
                el.innerHTML = clean
                return
            }
        }

        // Fallback: monospace, schedule async highlight
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        el.innerHTML = `<pre class="rt-pre-fallback"><code>${escaped}</code></pre>`

        // Async highlight replacement
        highlightAsync(code, lang).then(highlighted => {
            if (this.disposed) return
            const { html: clean, removed } = sanitizeHtml(highlighted)
            if (!removed && el.parentNode === this.container) {
                el.innerHTML = clean
            }
        }).catch(() => {
            // Keep monospace fallback
        })
    }

    /** Render a closed math block using KaTeX */
    private renderMathBlock(el: HTMLElement, block: StreamBlock): void {
        const content = this.extractMathContent(block.content)
        el.className = 'rt-block rt-math-block'

        try {
            const rendered = katex.renderToString(content, {
                displayMode: true,
                ...KATEX_SHARED_OPTIONS,
            })
            if (rendered.includes('katex-error') || rendered.includes('color:#cc0000')) {
                el.textContent = content
                return
            }
            const { html: clean, removed } = sanitizeHtml(rendered)
            if (removed) {
                el.textContent = block.content
            } else {
                el.innerHTML = clean
            }
        } catch {
            // Show raw content on KaTeX error
            el.textContent = block.content
        }
    }

    /** Extract code content from a fenced code block (strip ``` markers) */
    private extractCodeContent(content: string): string {
        const lines = content.split('\n')
        // Remove first line (``` marker) and last line (closing ```)
        if (lines.length >= 2) {
            const first = lines[0]
            const last = lines[lines.length - 1]
            if (/^(`{3,}|~{3,})/.test(first)) {
                const startIdx = 1
                const endIdx = /^(`{3,}|~{3,})\s*$/.test(last) ? lines.length - 1 : lines.length
                return lines.slice(startIdx, endIdx).join('\n')
            }
        }
        return content
    }

    /** Extract math content from a math block (strip $$ markers) */
    private extractMathContent(content: string): string {
        let result = content.trim()
        if (result.startsWith('$$')) result = result.slice(2)
        else result = result.replace(/^\\{1,2}\[/, '')

        if (result.endsWith('$$')) result = result.slice(0, -2)
        else result = result.replace(/\\{1,2}\]$/, '')

        return result.trim()
    }

    /** Fall back to plain text rendering for the entire message */
    private fallbackToPlaintext(): void {
        this.fallbackMode = true
        this.cancelPendingRaf()
        // Clear all rendered blocks
        this.container.textContent = ''
        const pre = document.createElement('pre')
        pre.className = 'rt-fallback-plaintext'
        pre.textContent = this.lastText
        this.container.appendChild(pre)
    }

    /** Get or create a block-level DOM element at the given index */
    private getOrCreateBlockElement(index: number): HTMLElement {
        if (this.blockElements[index]) {
            return this.blockElements[index]
        }

        const el = document.createElement('div')
        el.className = 'rt-block'

        // Insert at the correct position
        if (index < this.container.children.length) {
            this.container.insertBefore(el, this.container.children[index])
        } else {
            this.container.appendChild(el)
        }

        this.blockElements[index] = el
        return el
    }

    private replaceBlockElement(index: number): HTMLElement {
        const existing = this.blockElements[index]
        const replacement = document.createElement('div')
        replacement.className = 'rt-block'

        if (existing && existing.parentNode === this.container) {
            this.container.replaceChild(replacement, existing)
        } else if (index < this.container.children.length) {
            this.container.insertBefore(replacement, this.container.children[index])
        } else {
            this.container.appendChild(replacement)
        }

        this.blockElements[index] = replacement
        return replacement
    }
}
