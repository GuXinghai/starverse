import { afterEach, describe, expect, it } from 'vitest'
import {
    disposeHighlighter,
    getHighlighter,
    isHighlighterReady,
    subscribeHighlighterReady,
} from './shikiLoader'

afterEach(() => {
    disposeHighlighter()
})

describe('shikiLoader', () => {
    it('shares one initialization promise across concurrent callers and notifies subscribers once', async () => {
        let notifications = 0
        const unsubscribe = subscribeHighlighterReady(() => {
            notifications += 1
        })

        const first = getHighlighter()
        const second = getHighlighter()
        expect(first).toBe(second)

        await Promise.all([first, second])
        expect(isHighlighterReady()).toBe(true)
        expect(notifications).toBe(1)
        unsubscribe()
    })

    it('does not retain a highlighter that finishes after test cleanup', async () => {
        const pending = getHighlighter()
        disposeHighlighter()

        await expect(pending).rejects.toThrow('shiki_loader_disposed')
        expect(isHighlighterReady()).toBe(false)
    })
})
