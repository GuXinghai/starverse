import type { StreamBlock } from './types'

/**
 * Lightweight block-level state machine for streaming Markdown.
 *
 * This does NOT do full Markdown parsing — it only detects block boundaries
 * to determine when a block is "closed" and can be safely frozen in the DOM.
 *
 * Key invariant: only the last block can be in 'open' state.
 * All previous blocks are 'closed' and immutable.
 */
export class BlockTokenizer {
    private blocks: StreamBlock[] = []
    private rawText = ''

    /**
     * Feed a new chunk of text. The tokenizer will process the delta
     * (text added since last feed) to update block boundaries.
     */
    feed(fullText: string): void {
        this.rawText = fullText
        this.reTokenize()
    }

    /** Get all blocks (both open and closed) */
    getBlocks(): ReadonlyArray<Readonly<StreamBlock>> {
        return this.blocks
    }

    /** Get indexes of blocks that were just closed in the last feed() */
    getClosedBlocks(): ReadonlyArray<Readonly<StreamBlock>> {
        return this.blocks.filter(b => b.state === 'closed')
    }

    /** Get the last block if it's open (the "tail buffer") */
    getTailBlock(): Readonly<StreamBlock> | null {
        const last = this.blocks[this.blocks.length - 1]
        return last?.state === 'open' ? last : null
    }

    /** Reset tokenizer state */
    reset(): void {
        this.blocks = []
        this.rawText = ''
    }

    /**
     * Full re-tokenize from rawText.
     * This is intentionally simple — we re-parse the block structure each time.
     * At ~50-100 chunks per message, this is negligible cost vs DOM operations.
     */
    private reTokenize(): void {
        const text = this.rawText
        const lines = text.split('\n')
        const newBlocks: StreamBlock[] = []

        let i = 0
        while (i < lines.length) {
            const line = lines[i]

            // --- Fenced code block ---
            const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)$/)
            if (fenceMatch) {
                const fence = fenceMatch[1]
                const lang = fenceMatch[2]?.trim() || undefined
                const closingPattern = fence.charAt(0).repeat(fence.length)
                const contentLines = [line]
                let closed = false
                i++

                while (i < lines.length) {
                    contentLines.push(lines[i])
                    if (lines[i].trimEnd() === closingPattern || lines[i].startsWith(closingPattern)) {
                        closed = true
                        i++
                        break
                    }
                    i++
                }

                newBlocks.push({
                    kind: 'fenced_code',
                    content: contentLines.join('\n'),
                    state: closed ? 'closed' : 'open',
                    meta: lang,
                })
                continue
            }

            // --- Math block ($$ or \[) ---
            const mathStart = detectMathBlockStart(line)
            if (mathStart) {
                const contentLines = [line]
                if (isSingleLineMathClosed(line, mathStart)) {
                    newBlocks.push({
                        kind: 'math_block',
                        content: line,
                        state: 'closed',
                    })
                    i++
                    continue
                }

                let closed = false
                i++
                while (i < lines.length) {
                    contentLines.push(lines[i])
                    if (isMathBlockClosed(lines[i], mathStart)) {
                        closed = true
                        i++
                        break
                    }
                    i++
                }

                newBlocks.push({
                    kind: 'math_block',
                    content: contentLines.join('\n'),
                    state: closed ? 'closed' : 'open',
                })
                continue
            }

            // --- Heading ---
            if (/^#{1,6}\s/.test(line)) {
                newBlocks.push({
                    kind: 'heading',
                    content: line,
                    state: 'closed', // headings are always single-line, immediately closed
                })
                i++
                continue
            }

            // --- Horizontal rule ---
            if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
                newBlocks.push({
                    kind: 'hr',
                    content: line,
                    state: 'closed',
                })
                i++
                continue
            }

            // --- Blockquote ---
            if (line.startsWith('>')) {
                const contentLines = [line]
                i++
                while (i < lines.length && (lines[i].startsWith('>') || (lines[i].trim() !== '' && !isBlockBoundary(lines[i])))) {
                    contentLines.push(lines[i])
                    i++
                }
                // A blockquote is closed when followed by a blank line or different block type
                const isLast = i >= lines.length
                const followedByBlank = !isLast && lines[i].trim() === ''
                const closed = !isLast && (followedByBlank || isBlockBoundary(lines[i]))

                newBlocks.push({
                    kind: 'blockquote',
                    content: contentLines.join('\n'),
                    state: closed ? 'closed' : 'open',
                })
                continue
            }

            // --- List (unordered or ordered) ---
            if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line)) {
                const contentLines = [line]
                i++
                while (i < lines.length) {
                    const l = lines[i]
                    // Continue list if: list item, indented continuation, or blank line within list
                    if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(l) || (l.trim() === '' && i + 1 < lines.length && /^(\s*[-*+]\s|\s*\d+\.\s|\s{2,})/.test(lines[i + 1])) || /^\s{2,}/.test(l)) {
                        contentLines.push(l)
                        i++
                    } else {
                        break
                    }
                }

                const isLast = i >= lines.length
                const followedByBlank = !isLast && lines[i].trim() === ''
                const closed = !isLast && (followedByBlank || isBlockBoundary(lines[i]))

                newBlocks.push({
                    kind: 'list',
                    content: contentLines.join('\n'),
                    state: closed ? 'closed' : 'open',
                })
                continue
            }

            // --- Table ---
            if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|?\s*$/.test(lines[i + 1])) {
                const contentLines = [line]
                i++
                while (i < lines.length && lines[i].includes('|')) {
                    contentLines.push(lines[i])
                    i++
                }

                const isLast = i >= lines.length
                const closed = !isLast

                newBlocks.push({
                    kind: 'table',
                    content: contentLines.join('\n'),
                    state: closed ? 'closed' : 'open',
                })
                continue
            }

            // --- Blank line: close previous open block if any ---
            if (line.trim() === '') {
                // Close previous open paragraph if exists
                const prev = newBlocks[newBlocks.length - 1]
                if (prev && prev.state === 'open' && prev.kind === 'paragraph') {
                    prev.state = 'closed'
                }
                i++
                continue
            }

            // --- Paragraph (default) ---
            {
                const prev = newBlocks[newBlocks.length - 1]
                if (prev && prev.state === 'open' && prev.kind === 'paragraph') {
                    // Extend existing open paragraph
                    prev.content += '\n' + line
                } else {
                    newBlocks.push({
                        kind: 'paragraph',
                        content: line,
                        state: 'open',
                    })
                }
                i++
            }
        }

        // Preserve DOM anchors from old blocks that haven't changed
        for (let j = 0; j < Math.min(this.blocks.length, newBlocks.length); j++) {
            if (this.blocks[j].kind === newBlocks[j].kind && this.blocks[j].domAnchor) {
                newBlocks[j].domAnchor = this.blocks[j].domAnchor
            }
        }

        this.blocks = newBlocks
    }
}

/** Check if a line starts a new block-level element */
function isBlockBoundary(line: string): boolean {
    if (/^#{1,6}\s/.test(line)) return true
    if (/^(`{3,}|~{3,})/.test(line)) return true
    if (/^\s*\$\$/.test(line)) return true
    if (/^\s*\\{1,2}\[/.test(line)) return true
    if (line.startsWith('>')) return true
    if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(line)) return true
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) return true
    return false
}

function detectMathBlockStart(line: string): 'dollar' | 'bracket' | null {
    if (/^\s*\$\$/.test(line)) return 'dollar'
    if (/^\s*\\{1,2}\[/.test(line)) return 'bracket'
    return null
}

function isSingleLineMathClosed(line: string, style: 'dollar' | 'bracket'): boolean {
    const trimmed = line.trim()
    if (style === 'dollar') {
        const afterOpener = trimmed.startsWith('$$') ? trimmed.slice(2) : ''
        return afterOpener.includes('$$') && afterOpener.endsWith('$$')
    }
    return /^\s*\\{1,2}\[[\s\S]*\\{1,2}\]\s*$/.test(line)
}

function isMathBlockClosed(line: string, style: 'dollar' | 'bracket'): boolean {
    if (style === 'dollar') {
        return line.trimEnd().endsWith('$$') || /^\s*\$\$/.test(line)
    }
    return /^\s*\\{1,2}\]\s*$/.test(line)
}
