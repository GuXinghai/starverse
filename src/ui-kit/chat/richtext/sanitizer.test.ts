import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from './sanitizer'

describe('sanitizer', () => {
    describe('clean content passthrough', () => {
        it('passes through clean HTML', () => {
            const input = '<p>Hello <strong>world</strong></p>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).toContain('Hello')
            expect(html).toContain('<strong>')
            expect(removed).toBe(false)
        })

        it('passes through markdown-rendered HTML', () => {
            const input = '<h1>Title</h1><p>Text with <em>emphasis</em></p><ul><li>item</li></ul>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).toContain('<h1>')
            expect(html).toContain('<em>')
            expect(html).toContain('<li>')
            expect(removed).toBe(false)
        })

        it('passes through KaTeX output (spans with inline styles)', () => {
            const input = '<span class="katex"><span style="font-size:1.2em">E=mc²</span></span>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).toContain('katex')
            expect(html).toContain('style')
            expect(removed).toBe(false)
        })

        it('passes through table HTML', () => {
            const input = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).toContain('<table>')
            expect(html).toContain('<th>')
            expect(removed).toBe(false)
        })
    })

    describe('XSS prevention', () => {
        it('strips <script> tags', () => {
            const input = '<p>Hello</p><script>alert(1)</script>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).not.toContain('<script>')
            expect(html).not.toContain('alert(1)')
            expect(removed).toBe(true)
        })

        it('strips onerror attribute from img', () => {
            const input = '<img src="x" onerror="alert(1)">'
            const { html } = sanitizeHtml(input)
            expect(html).not.toContain('onerror')
            expect(html).not.toContain('alert')
        })

        it('strips onclick attribute', () => {
            const input = '<div onclick="alert(1)">Click me</div>'
            const { html } = sanitizeHtml(input)
            expect(html).not.toContain('onclick')
        })

        it('strips javascript: URLs', () => {
            const input = '<a href="javascript:alert(1)">Click</a>'
            const { html } = sanitizeHtml(input)
            expect(html).not.toContain('javascript:')
        })

        it('keeps allowed link protocols and enforces rel', () => {
            const input = '<a href="https://example.com">safe</a>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).toContain('href="https://example.com"')
            expect(html).toContain('rel="noopener noreferrer"')
            expect(removed).toBe(false)
        })

        it('removes disallowed link protocols', () => {
            const input = '<a href="file:///etc/passwd">unsafe</a>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).not.toContain('file:///etc/passwd')
            expect(removed).toBe(true)
        })

        it('strips iframe tags', () => {
            const input = '<iframe src="https://evil.com"></iframe>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).not.toContain('<iframe>')
            expect(removed).toBe(true)
        })

        it('strips form tags', () => {
            const input = '<form action="/steal"><input type="text"></form>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).not.toContain('<form>')
            expect(html).not.toContain('<input>')
            expect(removed).toBe(true)
        })

        it('strips object/embed tags', () => {
            const input = '<object data="evil.swf"></object><embed src="evil.swf">'
            const { html, removed } = sanitizeHtml(input)
            expect(html).not.toContain('<object>')
            expect(html).not.toContain('<embed>')
            expect(removed).toBe(true)
        })
    })

    describe('edge cases', () => {
        it('handles empty string', () => {
            const { html, removed } = sanitizeHtml('')
            expect(html).toBe('')
            expect(removed).toBe(false)
        })

        it('handles plain text (no HTML)', () => {
            const { html, removed } = sanitizeHtml('Just plain text')
            expect(html).toBe('Just plain text')
            expect(removed).toBe(false)
        })

        it('preserves code blocks with class attributes', () => {
            const input = '<pre><code class="language-javascript">const x = 1;</code></pre>'
            const { html, removed } = sanitizeHtml(input)
            expect(html).toContain('<code')
            expect(html).toContain('const x = 1;')
            expect(removed).toBe(false)
        })
    })
})
