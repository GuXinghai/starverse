import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RichTextFinal from './RichTextFinal.vue'
import { disposeHighlighter, getHighlighter } from './shikiLoader'

const codeA = '```typescript\nconst first = true\n```'
const codeB = '```typescript\nconst second = true\n```'

afterEach(() => {
    disposeHighlighter()
})

describe('RichTextFinal', () => {
    it('renders a fallback immediately and upgrades it after the highlighter becomes ready', async () => {
        const wrapper = mount(RichTextFinal, { props: { text: codeA } })
        await flushPromises()

        expect(wrapper.find('.rt-pre-fallback').exists()).toBe(true)
        expect(wrapper.text()).toContain('const first = true')

        await getHighlighter()
        await flushPromises()

        expect(wrapper.find('.shiki').exists()).toBe(true)
        wrapper.unmount()
    })

    it('does not let a completed highlighter load replace newer message content', async () => {
        const wrapper = mount(RichTextFinal, { props: { text: codeA } })
        await flushPromises()
        await wrapper.setProps({ text: codeB })

        await getHighlighter()
        await flushPromises()

        expect(wrapper.text()).toContain('const second = true')
        expect(wrapper.text()).not.toContain('const first = true')
        wrapper.unmount()
    })

    it('does not update an unmounted message when the highlighter becomes ready', async () => {
        const wrapper = mount(RichTextFinal, { props: { text: codeA } })
        await flushPromises()
        wrapper.unmount()

        await getHighlighter()
        await flushPromises()
        expect(wrapper.exists()).toBe(false)
    })
})
