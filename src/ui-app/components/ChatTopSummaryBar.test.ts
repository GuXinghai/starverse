import { fireEvent, render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetI18nForTests, t } from '@/shared/i18n'
import ChatTopSummaryBar from './ChatTopSummaryBar.vue'

function renderBar(consolePanelOpen = false) {
  return render(ChatTopSummaryBar, {
    props: {
      title: 'Chat',
      branchSummary: 'Branch Main',
      runSummary: 'Status idle',
      consolePanelOpen,
    },
  })
}

describe('ChatTopSummaryBar', () => {
  beforeEach(() => resetI18nForTests())

  it('uses Console as the only top-level right rail opener', async () => {
    const view = renderBar(false)

    expect(screen.getByRole('button', { name: t('chat.topBar.console') })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show panel/ })).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: t('chat.topBar.console') }))
    expect(view.emitted().toggleConsolePanel).toHaveLength(1)
  })

  it('labels the button as Hide Console only when the console panel is open', () => {
    renderBar(true)

    expect(screen.getByRole('button', { name: t('chat.topBar.hideConsole') })).toBeInTheDocument()
  })
})
