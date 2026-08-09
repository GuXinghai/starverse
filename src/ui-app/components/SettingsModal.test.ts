import { fireEvent, render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
