import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ChatRightRail from './ChatRightRail.vue'

describe('ChatRightRail', () => {
  it('does not expose Reasoning/Console switching tabs inside the rail', () => {
    render(ChatRightRail, {
      slots: {
        default: '<div>Panel body</div>',
      },
    })

    expect(screen.queryByRole('button', { name: 'Reasoning' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Console' })).not.toBeInTheDocument()
    expect(screen.getByText('Panel body')).toBeInTheDocument()
  })

  it('only emits close from the rail header control', async () => {
    const view = render(ChatRightRail, {
      slots: {
        default: '<div>Panel body</div>',
      },
    })

    await fireEvent.click(screen.getByRole('button'))
    expect(view.emitted().close).toHaveLength(1)
  })

  it('uses a centered gray handle as the close control when floating', async () => {
    const view = render(ChatRightRail, {
      props: {
        floating: true,
      },
      slots: {
        default: '<div>Panel body</div>',
      },
    })

    expect(screen.queryByText('→')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByTestId('right-rail-floating-close-handle'))
    expect(view.emitted().close).toHaveLength(1)
  })
})
