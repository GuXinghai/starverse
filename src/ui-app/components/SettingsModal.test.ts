import { fireEvent, render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { resetI18nForTests } from '@/shared/i18n'
import SettingsModal from './SettingsModal.vue'

describe('SettingsModal', () => {
  beforeEach(() => {
    resetI18nForTests()
  })

  it('keeps the default modal sizing unchanged', () => {
    render(SettingsModal, {
      props: { open: true, disabled: false, isRunning: false },
      slots: { default: '<div>default settings</div>' },
    })

    const modal = screen.getByTestId('settings-modal-default')
    expect(modal).toHaveClass('max-w-xl')
    expect(modal).not.toHaveClass('max-w-5xl')
    expect(modal).toHaveAttribute('aria-modal', 'true')
  })

  it('uses the wider categorized variant and preserves close behavior', async () => {
    const onClose = vi.fn()
    render(SettingsModal, {
      props: {
        open: true,
        disabled: false,
        isRunning: false,
        variant: 'categorized',
        onClose,
      },
      slots: { default: '<div>categorized settings</div>' },
    })

    const modal = screen.getByTestId('settings-modal-categorized')
    expect(modal).toHaveClass('max-w-5xl')
    expect(modal).not.toHaveClass('max-w-xl')

    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('traps tab focus and restores the opener after close', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const view = render(SettingsModal, {
      props: { open: true, disabled: false, isRunning: false },
      slots: { default: '<button data-testid="last-control">last</button>' },
    })

    const close = screen.getByRole('button', { name: /关闭|Close/ })
    const last = screen.getByTestId('last-control')
    last.focus()
    await fireEvent.keyDown(screen.getByTestId('settings-modal-default'), { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    await view.rerender({ open: false, disabled: false, isRunning: false })
    await nextTick()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
