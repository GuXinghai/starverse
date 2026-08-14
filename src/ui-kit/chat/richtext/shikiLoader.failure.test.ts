import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
    vi.doUnmock('shiki')
    vi.resetModules()
})

describe('Shiki load failure', () => {
    it('keeps the final renderer fallback visible when the dynamic import fails', async () => {
        vi.resetModules()
        vi.doMock('shiki', () => {
            throw new Error('shiki unavailable')
        })

        const { renderFinal } = await import('./finalRenderer')
        const snapshot = await renderFinal('```typescript\nconst stillVisible = true\n```')

        expect(snapshot.highlightPending).toBe(true)
        expect(snapshot.html).toContain('rt-pre-fallback')
        expect(snapshot.html).toContain('const stillVisible = true')

        await vi.dynamicImportSettled()
        const { isHighlighterReady } = await import('./shikiLoader')
        expect(isHighlighterReady()).toBe(false)
    })
})
