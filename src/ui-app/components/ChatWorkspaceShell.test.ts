import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ChatWorkspaceShell from './ChatWorkspaceShell.vue'

describe('ChatWorkspaceShell', () => {
  it('emits closeRightRail when the floating backdrop is clicked', async () => {
    const view = render(ChatWorkspaceShell, {
      props: {
        rightRailOpen: true,
      },
      slots: {
        sidebar: '<div>Sidebar</div>',
        transcript: '<div>Transcript</div>',
        'right-rail': '<div data-testid="right-rail-panel">Panel</div>',
      },
    })

    await waitFor(() => {
      expect(screen.getByTestId('right-rail-floating-backdrop')).toBeInTheDocument()
    })

    await fireEvent.click(screen.getByTestId('right-rail-floating-backdrop'))
    expect(view.emitted().closeRightRail).toHaveLength(1)
  })
})
