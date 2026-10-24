import { afterEach, describe, it, expect, vi } from 'vitest'
import { renderFinal, renderBlockSync } from './finalRenderer'
import { disposeHighlighter, getHighlighter } from './shikiLoader'

afterEach(() => {
    disposeHighlighter()
})

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

        it('returns a safe code fallback before Shiki is ready, then upgrades on the next render', async () => {
            const text = '```javascript\nconst x = 1;\n```'
            const initial = await renderFinal(text)

            expect(initial.highlightPending).toBe(true)
            expect(initial.html).toContain('rt-pre-fallback')
            expect(initial.html).toContain('const x = 1;')

            await getHighlighter()
            const upgraded = await renderFinal(text)
            expect(upgraded.highlightPending).toBe(false)
            expect(upgraded.html).toContain('shiki')
        })

        it('keeps a safe fallback for an unknown language after Shiki is ready', async () => {
            await getHighlighter()
            const result = await renderFinal('```not-a-real-language\nconst x = 1;\n```')

            expect(result.highlightPending).toBe(false)
            expect(result.html).toContain('rt-pre-fallback')
            expect(result.html).toContain('const x = 1;')
        })

        it('upgrades a lazy-loaded language block after its chunk loads', async () => {
            await getHighlighter()
            const text = '```rust\nlet x = 1;\n```'
            const initial = await renderFinal(text)

            expect(initial.highlightPending).toBe(true)
            expect(initial.html).toContain('rt-pre-fallback')
            expect(initial.html).toContain('let x = 1;')

            await vi.waitFor(async () => {
                const upgraded = await renderFinal(text)
                expect(upgraded.highlightPending).toBe(false)
                expect(upgraded.html).toContain('shiki')
            }, { timeout: 10000 })
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
describe('finalRenderer replacement-pattern safety (R5-04, P6b-01)', () => {
    const textOf = (html: string) => html.replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

    // One case per String.replace special pattern: $&, $`, $' and $$.
    const patterns: Array<[string, string]> = [
        ['$&', 'echo $& done'],
        ['$`', 'echo $` done'],
        ["$'", "echo $' done"],
        ['$$', 'echo $$ done'],
    ]

    describe.each([['fallback', false], ['highlighted', true]] as const)('code block, %s path', (_name, highlight) => {
        it.each(patterns)('keeps %s byte-exact', async (_pattern, line) => {
            if (highlight) await getHighlighter()
            const result = await renderFinal('before\n\n```bash\n' + line + '\n```\n\nafter')
            expect(textOf(result.html)).toContain(line + '\n')
            expect(result.html).not.toContain('shiki-placeholder')
            expect(textOf(result.html)).toContain('before')
            expect(textOf(result.html)).toContain('after')
        })
    })

    // KaTeX keeps the source in its MathML annotation, so a corrupted restore shows up there.
    it.each([
        ['$&', '\\begin{matrix}\\$&b\\end{matrix}'],
        ['$`', '\\text{\\$`}'],
        ["$'", "\\text{\\$'}"],
        ['$$', '\\text{\\$\\$}'],
    ])('keeps %s in the source of rendered display math', async (_pattern, body) => {
        const result = await renderFinal('$$' + body + '$$')
        expect(result.html).not.toContain('MATH_BLOCK')
        expect(result.html).toContain('katex')
        expect(textOf(result.html)).toContain(body)
    })
})
describe('finalRenderer inline math, links and nested fences (R5-05)', () => {
    describe('inline math delimiters (P6b-02)', () => {
        it.each([
            ['currency', 'It costs $5 and $10 in total.'],
            ['shell variables', 'Set $HOME and $PATH before running.'],
            ['a space inside the delimiters', 'Pay $ 5 and $ 10 later.'],
        ])('leaves %s as prose', async (_name, text) => {
            const result = await renderFinal(text)
            expect(result.html).not.toContain('katex')
            expect(result.html).toContain(text.replace(/&/g, '&amp;'))
        })

        it('does not pair a stray $ with a later one across paragraphs', async () => {
            const result = await renderFinal('Costs $5 today.\n\nAnd then it was gone for $x$ later, or $y.')
            expect(result.html.match(/class="katex"/g)?.length ?? 0).toBe(1)
            expect(result.html).toContain('Costs $5 today.')
        })

        it('does not pair a $ with one on the next line of the same paragraph', async () => {
            const result = await renderFinal('first $a\nsecond b$ done')
            expect(result.html).not.toContain('katex')
        })

        it('still renders ordinary inline math, including several on one line', async () => {
            const result = await renderFinal('Given $x+1$ and $y_2$, then $z$.')
            expect(result.html.match(/class="katex"/g)?.length ?? 0).toBe(3)
        })
    })

    describe('link schemes (P6b-03)', () => {
        it.each(['ssh://host/path', 'vscode://file/a', 'obsidian://open?vault=x', 'ftp://example.com/a'])(
            'drops only the href of %s and keeps the rest of the message rendered', async (href) => {
                const result = await renderFinal('# Title\n\nSee [link](' + href + ') and **bold**.')
                expect(result.sanitizerRemoved).toBe(false)
                expect(result.html).toContain('<h1>')
                expect(result.html).toContain('<strong>bold</strong>')
                expect(result.html).toContain('link')
                expect(result.html).not.toContain(href)
            })
    })

    describe('fence nested in a list or quote while streaming (P6b-04)', () => {
        it.each([
            ['list', '- item\n\n  ```js\n  const a = 1 < 2\n  ```\n'],
            ['blockquote', '> ```js\n> const a = 1 < 2\n> ```\n'],
        ])('shows the code of a fence in a %s', (_name, source) => {
            const html = renderBlockSync(source)
            expect(html).not.toContain('shiki-placeholder')
            expect(html).toContain('const a = 1 &lt; 2')
        })

        it('keeps $-patterns in nested code byte-exact', () => {
            const html = renderBlockSync('- item\n\n  ```bash\n  echo $& $$\n  ```\n')
            expect(html).toContain('echo $&amp; $$')
        })
    })
})
