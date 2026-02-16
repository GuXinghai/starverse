import { describe, it, expect } from 'vitest'
import { renderFinal, renderBlockSync } from './finalRenderer'

describe('finalRenderer', () => {
    describe('renderFinal', () => {
        it('returns empty html for empty input', async () => {
            const result = await renderFinal('')
            expect(result.html).toBe('')
            expect(result.sanitizerRemoved).toBe(false)
        })

        it('returns empty html for whitespace-only input', async () => {
            const result = await renderFinal('   \n\n  ')
            expect(result.html).toBe('')
        })

        it('renders markdown headings', async () => {
            const result = await renderFinal('# Hello World')
            expect(result.html).toContain('<h1>')
            expect(result.html).toContain('Hello World')
        })

        it('renders bold and italic', async () => {
            const result = await renderFinal('**bold** and *italic*')
            expect(result.html).toContain('<strong>bold</strong>')
            expect(result.html).toContain('<em>italic</em>')
        })

        it('renders unordered lists', async () => {
            const result = await renderFinal('- item 1\n- item 2\n- item 3')
            expect(result.html).toContain('<ul>')
            expect(result.html).toContain('<li>')
            expect(result.html).toContain('item 1')
        })

        it('renders ordered lists', async () => {
            const result = await renderFinal('1. first\n2. second')
            expect(result.html).toContain('<ol>')
            expect(result.html).toContain('first')
        })

        it('renders blockquotes', async () => {
            const result = await renderFinal('> This is a quote')
            expect(result.html).toContain('<blockquote>')
            expect(result.html).toContain('This is a quote')
        })

        it('renders inline math with KaTeX', async () => {
            const result = await renderFinal('The formula is $E=mc^2$ here.')
            expect(result.html).toContain('katex')
            expect(result.sanitizerRemoved).toBe(false)
        })

        it('renders block math with KaTeX', async () => {
            const result = await renderFinal('$$\n\\int_0^1 x \\, dx\n$$')
            expect(result.html).toContain('katex')
        })

        it('renders inline math with \\(...\\) delimiters', async () => {
            const result = await renderFinal('Inline math: \\(a^2 + b^2 = c^2\\)')
            expect(result.html).toContain('katex')
        })

        it('renders block math with \\[...\\] delimiters', async () => {
            const result = await renderFinal('\\[\n\\int_0^1 x \\, dx\n\\]')
            expect(result.html).toContain('katex')
        })

        it('renders inline math with double-backslash \\(...\\) delimiters', async () => {
            const result = await renderFinal('Inline math: \\\\(a^2 + b^2 = c^2\\\\)')
            expect(result.html).toContain('katex')
        })

        it('renders block math with double-backslash \\[...\\] delimiters', async () => {
            const result = await renderFinal('\\\\[\n\\int_0^1 x \\, dx\n\\\\]')
            expect(result.html).toContain('katex')
        })

        it('does not parse fenced code content as math', async () => {
            const result = await renderFinal('```js\nconst formula = "$E=mc^2$";\n```')
            expect(result.html).toContain('rt-code-block')
            expect(result.html).not.toContain('katex-display')
        })

        it('does not parse inline code content as math', async () => {
            const result = await renderFinal('Use `$x+1$` and `\\(x+1\\)` literally.')
            expect(result.html).not.toContain('katex')
        })

        it('still parses math outside inline code segments', async () => {
            const result = await renderFinal('Use `$x+1$` literally, but render $y+1$.')
            expect(result.html).toContain('katex')
        })

        it('handles invalid LaTeX gracefully (throwOnError: false)', async () => {
            const result = await renderFinal('ok $\\invalidcommand$ still works')
            expect(result.html.length).toBeGreaterThan(0)
            expect(result.html).toContain('rt-math-error')
            expect(result.html).toContain('still works')
            expect(result.sanitizerRemoved).toBe(false)
        })

        it('enforces safe rel on rendered links', async () => {
            const result = await renderFinal('[safe](https://example.com)')
            expect(result.html).toContain('rel="noopener noreferrer"')
        })

        it('does not render markdown links with disallowed protocols', async () => {
            const result = await renderFinal('[bad](file:///etc/passwd)')
            expect(result.html).toContain('[bad](file:///etc/passwd)')
            expect(result.html).not.toContain('<a ')
            expect(result.sanitizerRemoved).toBe(false)
        })

        it('renders code blocks with Shiki highlighting', async () => {
            const result = await renderFinal('```javascript\nconst x = 1;\n```')
            expect(result.html).toContain('rt-code-block')
            expect(result.sanitizerRemoved).toBe(false)
        })

        it('renders code blocks without language', async () => {
            const result = await renderFinal('```\nhello world\n```')
            expect(result.html).toContain('rt-code-block')
        })

        it('blocks raw HTML in markdown source (html: false)', async () => {
            const result = await renderFinal('<script>alert(1)</script>')
            expect(result.html).not.toContain('<script>')
        })

        it('renders links', async () => {
            const result = await renderFinal('[Google](https://google.com)')
            expect(result.html).toContain('<a')
            expect(result.html).toContain('https://google.com')
        })

        it('auto-links URLs', async () => {
            const result = await renderFinal('Visit https://example.com for more.')
            expect(result.html).toContain('<a')
            expect(result.html).toContain('https://example.com')
        })

        it('renders horizontal rules', async () => {
            const result = await renderFinal('Above\n\n---\n\nBelow')
            expect(result.html).toContain('<hr')
        })

        it('preserves CJK text', async () => {
            const result = await renderFinal('# 你好世界\n\n这是一段**中文**文本。')
            expect(result.html).toContain('你好世界')
            expect(result.html).toContain('中文')
        })
    })

    describe('renderBlockSync', () => {
        it('renders a paragraph', () => {
            const html = renderBlockSync('Hello world')
            expect(html).toContain('<p>')
            expect(html).toContain('Hello world')
        })

        it('renders inline math', () => {
            const html = renderBlockSync('The value is $x=1$ here.')
            expect(html).toContain('katex')
        })

        it('renders bold/italic', () => {
            const html = renderBlockSync('**bold** and *italic*')
            expect(html).toContain('<strong>')
            expect(html).toContain('<em>')
        })
    })
})
