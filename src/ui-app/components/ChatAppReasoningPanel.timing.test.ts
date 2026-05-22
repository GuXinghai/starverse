import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/vue'
import ChatAppReasoningPanel from './ChatAppReasoningPanel.vue'
import type { ReasoningView } from '@/next/state/types'

describe('ChatAppReasoningPanel - 推理时间显示', () => {
  const mockReasoningView: ReasoningView = {
    summaryText: 'Test summary',
    reasoningText: 'Test reasoning',
    visibility: 'shown',
    panelState: 'expanded'
  }

  it('应该在展开时显示推理时间', () => {
    const { getByText } = render(ChatAppReasoningPanel, {
      props: {
        messageId: 'test-msg-1',
        reasoningView: mockReasoningView,
        localProcessingDurationMs: 2500
      }
    })

    // 应该显示格式化的推理时间 (2500ms = 2.50s)
    expect(getByText('2.50s')).toBeTruthy()
  })

  it('即使消息内联状态为折叠，右侧面板也显示推理时间', () => {
    const { getByText } = render(ChatAppReasoningPanel, {
      props: {
        messageId: 'test-msg-1',
        reasoningView: { ...mockReasoningView, panelState: 'collapsed' },
        localProcessingDurationMs: 2500
      }
    })

    expect(getByText('2.50s')).toBeTruthy()
  })

  it('应该在没有推理时间数据时不显示', () => {
    const { queryByText } = render(ChatAppReasoningPanel, {
      props: {
        messageId: 'test-msg-1',
        reasoningView: mockReasoningView,
        localProcessingDurationMs: undefined
      }
    })

    // 没有数据时不应该显示任何时间
    expect(queryByText(/\d+\.\d+s/)).toBeNull()
  })

  it('应该正确格式化不同的时间值', () => {
    const testCases = [
      { ms: 1000, expected: '1.00s' },
      { ms: 1500, expected: '1.50s' },
      { ms: 500, expected: '0.50s' },
      { ms: 10000, expected: '10.00s' }
    ]

    testCases.forEach(({ ms, expected }) => {
      const { getByText } = render(ChatAppReasoningPanel, {
        props: {
          messageId: 'test-msg-1',
          reasoningView: mockReasoningView,
          localProcessingDurationMs: ms
        }
      })

      expect(getByText(expected)).toBeTruthy()
    })
  })
})
