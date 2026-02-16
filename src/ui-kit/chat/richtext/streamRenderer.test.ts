import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamRenderer } from './streamRenderer'

describe('StreamRenderer', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
            return setTimeout(() => cb(0), 0) as unknown as number
        }) as any)
        vi.stubGlobal('cancelAnimationFrame', ((id: number) => {
            clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
        }) as any)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('re-renders tail math block when state transitions open -> closed without appending nodes', () => {
        const container = document.createElement('div')
        const renderer = new StreamRenderer(container)

        renderer.feed('$$\nx = 1')
        vi.runOnlyPendingTimers()
        const initialCount = container.children.length

        renderer.feed('$$\nx = 1\n$$')
        vi.runOnlyPendingTimers()
        expect(container.children.length).toBe(initialCount)
        expect(container.innerHTML).toContain('katex')
    })

    it('re-renders tail \\[...\\] math block when closed', () => {
        const container = document.createElement('div')
        const renderer = new StreamRenderer(container)

        renderer.feed('\\[\nx = 1')
        vi.runOnlyPendingTimers()
        const initialCount = container.children.length

        renderer.feed('\\[\nx = 1\n\\]')
        vi.runOnlyPendingTimers()
        expect(container.children.length).toBe(initialCount)
        expect(container.innerHTML).toContain('katex')
    })

    it('re-renders tail \\\\[...\\\\] math block when closed', () => {
        const container = document.createElement('div')
        const renderer = new StreamRenderer(container)

        renderer.feed('\\\\[\nx = 1')
        vi.runOnlyPendingTimers()
        const initialCount = container.children.length

        renderer.feed('\\\\[\nx = 1\n\\\\]')
        vi.runOnlyPendingTimers()
        expect(container.children.length).toBe(initialCount)
        expect(container.innerHTML).toContain('katex')
    })

    it('re-renders tail fenced code block when state transitions open -> closed without appending', () => {
        const container = document.createElement('div')
        const renderer = new StreamRenderer(container)

        renderer.feed('```ts\nconst x = 1')
        vi.runOnlyPendingTimers()
        const initialCount = container.children.length

        renderer.feed('```ts\nconst x = 1\n```')
        vi.runOnlyPendingTimers()
        expect(container.children.length).toBe(initialCount)
        expect(container.querySelector('.rt-code-block')).not.toBeNull()
    })

    it('replaces node on kind mismatch during open -> closed transition', () => {
        const container = document.createElement('div')
        const renderer = new StreamRenderer(container)

        renderer.feed('plain paragraph')
        vi.runOnlyPendingTimers()
        const firstNode = container.children[0]

        renderer.feed('$$\nx = 1\n$$')
        vi.runOnlyPendingTimers()
        expect(container.children.length).toBe(1)
        expect(container.children[0]).not.toBe(firstNode)
        expect(container.innerHTML).toContain('katex')
    })

    it('does not crash on invalid TeX and keeps visible fallback content', () => {
        const container = document.createElement('div')
        const renderer = new StreamRenderer(container)

        expect(() => renderer.feed('$$\n\\frac{1}{\n$$')).not.toThrow()
        vi.runOnlyPendingTimers()
        const visible = (container.textContent ?? '').trim()
        expect(visible.length > 0 || container.innerHTML.includes('katex-error')).toBe(true)
    })
})
