import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import GenerationParamsSettingsEditor from './GenerationParamsSettingsEditor.vue'
import { openrouterGenerationProfile } from '@/next/generation-params/providerProfiles/openrouterGenerationProfile'
import { openaiResponsesGenerationProfile } from '@/next/generation-params/providerProfiles/openaiResponsesGenerationProfile'
import { t } from '@/shared/i18n'

describe('GenerationParamsSettingsEditor', () => {
  it('hides advanced supported params until the advanced control is enabled', async () => {
    const user = userEvent.setup()

    render(GenerationParamsSettingsEditor, {
      props: {
        modelValue: null,
        profile: openrouterGenerationProfile,
        modelId: 'deepseek/deepseek-v4-flash',
        collapsible: false,
      },
    })

    expect(screen.getByTestId('generation-param-mode-temperature')).toBeVisible()
    expect(screen.queryByTestId('generation-param-mode-minP')).toBeNull()

    await user.click(screen.getByTestId('generation-params-advanced-toggle'))

    expect(screen.getByTestId('generation-param-mode-minP')).toBeVisible()
    expect(screen.getByTestId('generation-param-mode-topA')).toBeVisible()
    expect(screen.getByTestId('generation-param-mode-repetitionPenalty')).toBeVisible()
  })

  it('keeps configured advanced params visible even when advanced params are collapsed', () => {
    render(GenerationParamsSettingsEditor, {
      props: {
        modelValue: {
          minP: { mode: 'custom', value: 0.05 },
        },
        profile: openrouterGenerationProfile,
        modelId: 'deepseek/deepseek-v4-flash',
        collapsible: false,
      },
    })

    expect(screen.getByTestId('generation-param-mode-minP')).toBeVisible()
    expect(screen.getByTestId('generation-param-value-minP')).toHaveValue(0.05)
  })

  it('labels OpenAI Responses provider-auto reasoning effort without making it a wire value', async () => {
    const user = userEvent.setup()

    render(GenerationParamsSettingsEditor, {
      props: {
        modelValue: null,
        profile: openaiResponsesGenerationProfile,
        modelId: 'gpt-5.4-nano',
        collapsible: false,
      },
    })

    const mode = screen.getByTestId('generation-param-mode-reasoningEffort')
    await user.selectOptions(mode, 'custom')

    const value = screen.getByTestId('generation-param-value-reasoningEffort') as HTMLSelectElement
    expect(within(value).getByText(`${t('chat.generationParams.reasoning.auto')} (none)`)).toBeInTheDocument()
    expect(Array.from(value.options).map((option) => option.value)).toEqual([
      'auto',
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  })

  it('does not expose OpenAI Responses reasoning effort controls for unsupported models', () => {
    render(GenerationParamsSettingsEditor, {
      props: {
        modelValue: null,
        profile: openaiResponsesGenerationProfile,
        modelId: 'gpt-4.1-mini',
        collapsible: false,
      },
    })

    expect(screen.queryByTestId('generation-param-mode-reasoningEffort')).toBeNull()
  })

  it('uses OpenAI Responses summary enum values without legacy none', async () => {
    render(GenerationParamsSettingsEditor, {
      props: {
        modelValue: {
          reasoningSummary: { mode: 'custom', value: 'auto' },
        },
        profile: openaiResponsesGenerationProfile,
        modelId: 'gpt-5.4-nano',
        collapsible: false,
      },
    })

    const value = screen.getByTestId('generation-param-value-reasoningSummary') as HTMLSelectElement
    expect(Array.from(value.options).map((option) => option.value)).toEqual([
      'auto',
      'concise',
      'detailed',
    ])
    expect(within(value).queryByText('none')).not.toBeInTheDocument()

    expect(screen.getByTestId('generation-param-mode-reasoningSummary')).toHaveValue('custom')
  })
})
