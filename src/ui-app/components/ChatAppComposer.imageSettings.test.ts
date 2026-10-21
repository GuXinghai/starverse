import { fireEvent, render, screen, within } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installGenerationV2TestBridge } from '../../../tests/helpers/generationV2Bridge'
import { t } from '@/shared/i18n'
import type { ChatSessionConfig } from '@/ui-app/app/chatSessionConfig'
import ChatAppComposer from './ChatAppComposer.vue'

describe('ChatAppComposer image settings entry', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens full image settings without choosing another model or changing Gemini parameters', async () => {
    const bridge = installGenerationV2TestBridge()
    ;(bridge.modelPreferences as any).listFavorites = vi.fn(async () => [])
    ;(bridge.modelPreferences as any).listRecents = vi.fn(async () => [])
    const config: ChatSessionConfig = {
      routeSelection: { schemaVersion: 1, kind: 'provider_model', providerId: 'openai_responses', modelId: 'gpt-4.1-mini' },
      reasoning: { enabled: false, effort: 'medium' }, webSearch: { enabled: false, level: 'high', detail: null },
      imageGeneration: { enabled: true, resolution: '4K', aspectRatio: '1:8', mode: 'custom',
        detail: { enabled: true, outputMode: 'auto', aspectRatio: '1:8', imageSize: '4K', openAI: { size: '1024x1024', quality: 'low' } } },
      generationParams: { detail: null },
    }
    const view = render(ChatAppComposer, { props: { draft: '', disabled: false, isRunning: false, sessionConfig: config, modelCatalog: [] } })
    const chip = screen.getByTestId('image-chip')
    expect(chip.textContent).toContain('1024x1024')
    expect(chip.textContent).not.toContain('4K')
    await fireEvent.click(within(chip).getByTestId('capability-chip-chevron'))
    const menu = screen.getByTestId('capability-chip-menu')
    expect(within(menu).getAllByRole('button')).toHaveLength(1)
    await fireEvent.click(within(menu).getByRole('button', { name: t('chat.console.imageSettings.more') }))
    expect(view.emitted('openImageSettings')).toHaveLength(1)
    expect(view.emitted('updateImageGenerationResolution')).toBeUndefined()
    expect(view.emitted('updateRouteSelection')).toBeUndefined()
  })
})
