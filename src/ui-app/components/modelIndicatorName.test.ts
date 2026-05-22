import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ChatAppComposer from './ChatAppComposer.vue'
import { formatModelIndicatorName } from './modelIndicatorName'

describe('formatModelIndicatorName', () => {
  it('removes provider prefix only when the name uses colon-space', () => {
    expect(formatModelIndicatorName('DeepSeek: DeepSeek V4 Flash')).toBe('DeepSeek V4 Flash')
    expect(formatModelIndicatorName('DeepSeek:DeepSeek V4 Flash')).toBe('DeepSeek:DeepSeek V4 Flash')
  })
})

describe('ChatAppComposer model indicator', () => {
  it('shows the selected model name without the provider prefix', () => {
    render(ChatAppComposer, {
      props: {
        draft: '',
        disabled: false,
        isRunning: false,
        sessionConfig: {
          model: { selectedModelKey: 'deepseek/deepseek-v4-flash' },
          reasoning: { enabled: false, effort: 'medium' },
          webSearch: { enabled: false, level: 'high', detail: null },
          imageGeneration: {
            enabled: false,
            resolution: '1K',
            aspectRatio: '1:1',
            mode: 'default',
            detail: null,
          },
          samplingParams: { detail: null },
        },
        modelCatalog: [
          {
            modelId: 'deepseek/deepseek-v4-flash',
            name: 'DeepSeek: DeepSeek V4 Flash',
            vendor: 'deepseek',
            status: 'visible',
            supportedParameters: [],
            lastSeenSnapshotId: 's1',
          },
        ],
      },
    })

    expect(screen.getByTestId('current-model-pill').textContent).toBe('DeepSeek V4 Flash')
  })
})
