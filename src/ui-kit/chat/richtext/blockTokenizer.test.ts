import { describe, it, expect, beforeEach } from 'vitest'
import { BlockTokenizer } from './blockTokenizer'

describe('BlockTokenizer', () => {
    let tokenizer: BlockTokenizer

    beforeEach(() => {
        tokenizer = new BlockTokenizer()
    })

    describe('paragraphs', () => {
        it('creates a single open paragraph from plain text', () => {
            tokenizer.feed('Hello world')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('paragraph')
            expect(blocks[0].state).toBe('open')
            expect(blocks[0].content).toBe('Hello world')
        })

        it('closes paragraph before a new paragraph on blank line', () => {
            tokenizer.feed('First paragraph\n\nSecond paragraph')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(2)
            expect(blocks[0].kind).toBe('paragraph')
            expect(blocks[0].state).toBe('closed')
            expect(blocks[1].kind).toBe('paragraph')
            expect(blocks[1].state).toBe('open')
        })

        it('handles multi-line paragraphs', () => {
            tokenizer.feed('Line one\nLine two\nLine three')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('paragraph')
            expect(blocks[0].content).toContain('Line one')
            expect(blocks[0].content).toContain('Line three')
        })
    })

    describe('fenced code blocks', () => {
        it('detects open fenced code block (no closing fence)', () => {
            tokenizer.feed('```javascript\nconsole.log("hi")')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('fenced_code')
            expect(blocks[0].state).toBe('open')
            expect(blocks[0].meta).toBe('javascript')
        })

        it('detects closed fenced code block', () => {
            tokenizer.feed('```python\nprint("hi")\n```')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('fenced_code')
            expect(blocks[0].state).toBe('closed')
            expect(blocks[0].meta).toBe('python')
        })

        it('handles code block split across feeds', () => {
            tokenizer.feed('```js\nconst x')
            expect(tokenizer.getBlocks()[0].state).toBe('open')

            tokenizer.feed('```js\nconst x = 1;\n```')
            expect(tokenizer.getBlocks()[0].state).toBe('closed')
        })

        it('handles code block without language', () => {
            tokenizer.feed('```\nhello\n```')
            const blocks = tokenizer.getBlocks()
            expect(blocks[0].kind).toBe('fenced_code')
            expect(blocks[0].state).toBe('closed')
            expect(blocks[0].meta).toBeUndefined()
        })
    })

    describe('math blocks', () => {
        it('detects open math block (no closing $$)', () => {
            tokenizer.feed('$$\nx = \\frac{1}{2}')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('math_block')
            expect(blocks[0].state).toBe('open')
        })

        it('detects closed math block', () => {
            tokenizer.feed('$$\nx = \\frac{1}{2}\n$$')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('math_block')
            expect(blocks[0].state).toBe('closed')
        })

        it('detects single-line math block', () => {
            tokenizer.feed('$$ x = 1 $$')
            const blocks = tokenizer.getBlocks()
            expect(blocks[0].kind).toBe('math_block')
            expect(blocks[0].state).toBe('closed')
        })

        it('detects open \\[ math block only at line-start/leading whitespace', () => {
            tokenizer.feed('  \\[\nx = \\frac{1}{2}')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('math_block')
            expect(blocks[0].state).toBe('open')
        })

        it('detects closed \\[...\\] math block', () => {
            tokenizer.feed('\\[\nx = \\frac{1}{2}\n\\]')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('math_block')
            expect(blocks[0].state).toBe('closed')
        })

        it('detects closed \\\\[...\\\\] math block', () => {
            tokenizer.feed('\\\\[\nx = \\frac{1}{2}\n\\\\]')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('math_block')
            expect(blocks[0].state).toBe('closed')
        })

        it('does not treat mid-paragraph \\[ as block math start', () => {
            tokenizer.feed('abc \\[ x = 1')
            const blocks = tokenizer.getBlocks()
            expect(blocks).toHaveLength(1)
            expect(blocks[0].kind).toBe('paragraph')
        })
    })

    describe('headings', () => {
        it('detects headings as always-closed', () => {
            tokenizer.feed('# Hello')
            const blocks = tokenizer.getBlocks()
            expect(blocks[0].kind).toBe('heading')
            expect(blocks[0].state).toBe('closed')
        })

        it('detects multiple heading levels', () => {
            tokenizer.feed('## Heading 2\n\n### Heading 3')
            const blocks = tokenizer.getBlocks()
            expect(blocks.filter(b => b.kind === 'heading')).toHaveLength(2)
        })
    })

    describe('horizontal rules', () => {
        it('detects --- as hr', () => {
            tokenizer.feed('---')
            expect(tokenizer.getBlocks()[0].kind).toBe('hr')
            expect(tokenizer.getBlocks()[0].state).toBe('closed')
        })

        it('detects *** as hr', () => {
            tokenizer.feed('***')
            expect(tokenizer.getBlocks()[0].kind).toBe('hr')
        })
    })

    describe('blockquotes', () => {
        it('detects blockquote', () => {
            tokenizer.feed('> This is a quote')
            const blocks = tokenizer.getBlocks()
            expect(blocks[0].kind).toBe('blockquote')
        })

        it('closes blockquote on blank line', () => {
            tokenizer.feed('> Quote\n\nParagraph')
            const blocks = tokenizer.getBlocks()
            expect(blocks[0].kind).toBe('blockquote')
            expect(blocks[0].state).toBe('closed')
        })
    })

    describe('lists', () => {
        it('detects unordered list', () => {
            tokenizer.feed('- item 1\n- item 2')
            const blocks = tokenizer.getBlocks()
            expect(blocks[0].kind).toBe('list')
        })

        it('detects ordered list', () => {
            tokenizer.feed('1. first\n2. second')
            const blocks = tokenizer.getBlocks()
            expect(blocks[0].kind).toBe('list')
        })
    })

    describe('mixed content', () => {
        it('handles heading + paragraph + code block', () => {
            tokenizer.feed('# Title\n\nSome text\n\n```js\ncode\n```')
            const blocks = tokenizer.getBlocks()
            const kinds = blocks.map(b => b.kind)
            expect(kinds).toContain('heading')
            expect(kinds).toContain('paragraph')
            expect(kinds).toContain('fenced_code')
        })

        it('preserves CJK text', () => {
            tokenizer.feed('你好世界\n\n这是一个测试')
            const blocks = tokenizer.getBlocks()
            expect(blocks.some(b => b.content.includes('你好世界'))).toBe(true)
            expect(blocks.some(b => b.content.includes('这是一个测试'))).toBe(true)
        })

        it('preserves emoji', () => {
            tokenizer.feed('Hello 🌍 World 🚀')
            const blocks = tokenizer.getBlocks()
            expect(blocks[0].content).toContain('🌍')
            expect(blocks[0].content).toContain('🚀')
        })
    })

    describe('tail block', () => {
        it('returns tail block for open content', () => {
            tokenizer.feed('Hello')
            expect(tokenizer.getTailBlock()).not.toBeNull()
            expect(tokenizer.getTailBlock()?.state).toBe('open')
        })

        it('returns null when last block is closed', () => {
            tokenizer.feed('# Heading')
            expect(tokenizer.getTailBlock()).toBeNull()
        })
    })

    describe('reset', () => {
        it('clears all state', () => {
            tokenizer.feed('Hello world')
            tokenizer.reset()
            expect(tokenizer.getBlocks()).toHaveLength(0)
            expect(tokenizer.getTailBlock()).toBeNull()
        })
    })
})
