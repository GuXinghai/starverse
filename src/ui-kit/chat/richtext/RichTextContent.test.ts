import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RichTextContent from './RichTextContent.vue'
import { disposeHighlighter, getHighlighter } from './shikiLoader'

afterEach(() => {
    vi.unstubAllGlobals()
    disposeHighlighter()
})

describe('RichTextContent', () => {
    it('keeps the completed stream readable while Shiki loads, then upgrades the code block', async () => {
        vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
            callback(0)
            return 1
        }) as typeof requestAnimationFrame)
        vi.stubGlobal('cancelAnimationFrame', vi.fn())

        const wrapper = mount(RichTextContent, {
            props: {
                text: '```typescript\nconst streamed = true\n```',
                streaming: true,
            },
        })

        await wrapper.setProps({ streaming: false })
        await flushPromises()
        expect(wrapper.find('.rt-pre-fallback').exists()).toBe(true)
        expect(wrapper.text()).toContain('const streamed = true')

        await getHighlighter()
        await flushPromises()
        expect(wrapper.find('.shiki').exists()).toBe(true)

        wrapper.unmount()
    })
})
