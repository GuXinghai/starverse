import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import GenerationParamsSettingsEditor from './GenerationParamsSettingsEditor.vue'
import { openrouterGenerationProfile } from '@/next/generation-params/providerProfiles/openrouterGenerationProfile'
import { openaiResponsesGenerationProfile } from '@/next/generation-params/providerProfiles/openaiResponsesGenerationProfile'
import { deepseekGenerationProfile } from '@/next/generation-params/providerProfiles/deepseekGenerationProfile'

function capabilityProjection(fields: Readonly<Record<string, Readonly<{ kind: string; values?: readonly string[]; min?: number; max?: number; integer?: boolean; hidden?: boolean }>>> = {}) {
  const controls = Object.fromEntries(Object.entries(fields).map(([path, domain]) => [path, {
    visibility: domain.hidden ? 'hidden' : 'visible',
    state: 'supported',
    domain: domain.kind === 'enum'
      ? { kind: 'enum', values: [...(domain.values ?? [])] }
      : { kind: 'range', min: domain.min ?? 0, max: domain.max ?? 1, integer: domain.integer ?? false },
    constraints: [], evidenceIds: [],
  }]))
  return { schemaVersion: 1, binding: {}, capabilityRevision: 'capability-v2:test-generation-params', controls } as any
}

function unknownCapabilityProjection(path: string) {
  return {
    schemaVersion: 2,
    binding: {},
    capabilityRevision: 'capability-v2:test-unknown-generation-param',
    controls: {
      [path]: { visibility: 'visible', state: 'unknown', constraints: [], evidenceIds: [] },
    },
  } as any
}

const samplingCapabilityProjection = capabilityProjection({
  'generation.temperature': { kind: 'range', min: 0, max: 2 },
  'generation.minP': { kind: 'range', min: 0, max: 1, hidden: true },
  'generation.topA': { kind: 'range', min: 0, max: 1, hidden: true },
  'generation.repetitionPenalty': { kind: 'range', min: 0, max: 2, hidden: true },
})

describe('GenerationParamsSettingsEditor', () => {
  it('hides advanced supported params until the advanced control is enabled', async () => {
    const user = userEvent.setup()

    render(GenerationParamsSettingsEditor, {
      props: {
        modelValue: null,
        profile: openrouterGenerationProfile,
        modelId: 'deepseek/deepseek-v4-flash',
        collapsible: false,
        capabilityProjection: samplingCapabilityProjection,
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
        capabilityProjection: samplingCapabilityProjection,
      },
    })

    expect(screen.getByTestId('generation-param-mode-minP')).toBeVisible()
    expect(screen.getByTestId('generation-param-value-minP')).toHaveValue(0.05)
  })

  it('uses the resolved OpenAI Responses effort domain without adding a synthetic wire value', async () => {
    const user = userEvent.setup()

    render(GenerationParamsSettingsEditor, {
      props: {
        modelValue: null,
        profile: openaiResponsesGenerationProfile,
        modelId: 'gpt-5.4-nano',
        collapsible: false,
        capabilityProjection: capabilityProjection({
          'reasoning.effort': { kind: 'enum', values: ['low', 'medium', 'high', 'xhigh'] },
        }),
      },
    })

    const mode = screen.getByTestId('generation-param-mode-reasoningEffort')
    await user.selectOptions(mode, 'custom')

    const value = screen.getByTestId('generation-param-value-reasoningEffort') as HTMLSelectElement
    expect(Array.from(value.options).map((option) => option.value)).toEqual([
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
        capabilityProjection: capabilityProjection(),
      },
    })

    expect(screen.queryByTestId('generation-param-mode-reasoningEffort')).toBeNull()
  })

  describe('R4-03 (P6a-11): values the current rules forbid are flagged, never silently changed', () => {
    const temperatureRange = (max: number) => capabilityProjection({ 'generation.temperature': { kind: 'range', min: 0, max } })

    it('preserves a stored value the current rules allow', () => {
      render(GenerationParamsSettingsEditor, { props: { modelValue: { temperature: { mode: 'custom', value: 1.5 } },
        profile: openrouterGenerationProfile, modelId: 'deepseek/deepseek-v4-flash', collapsible: false,
        capabilityProjection: temperatureRange(2) } })
      expect(screen.getByTestId('generation-param-value-temperature')).toHaveValue(1.5)
      expect(screen.queryByTestId('generation-param-invalid-temperature')).toBeNull()
    })

    it('keeps and flags a stored value that newly changed rules forbid', () => {
      const { emitted } = render(GenerationParamsSettingsEditor, { props: { modelValue: { temperature: { mode: 'custom', value: 1.5 } },
        profile: openrouterGenerationProfile, modelId: 'deepseek/deepseek-v4-flash', collapsible: false,
        capabilityProjection: temperatureRange(1) } })
      expect(screen.getByTestId('generation-param-value-temperature')).toHaveValue(1.5)
      expect(screen.getByTestId('generation-param-value-temperature')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByTestId('generation-param-invalid-temperature').textContent).toContain('0..1')
      expect(emitted()['update:modelValue']).toBeUndefined()
    })

    it('keeps rejected input visible with an explanation instead of reverting it', async () => {
      const user = userEvent.setup()
      const { emitted } = render(GenerationParamsSettingsEditor, { props: { modelValue: { temperature: { mode: 'custom', value: 0.5 } },
        profile: openrouterGenerationProfile, modelId: 'deepseek/deepseek-v4-flash', collapsible: false,
        capabilityProjection: temperatureRange(2) } })
      const input = screen.getByTestId('generation-param-value-temperature')
      await user.clear(input)
      await user.type(input, '5')
      await user.tab()
      expect(input).toHaveValue(5)
      expect(screen.getByTestId('generation-param-invalid-temperature')).toBeVisible()
      expect(emitted()['update:modelValue']).toBeUndefined()
      await user.clear(input)
      await user.type(input, '1.25')
      await user.tab()
      expect(screen.queryByTestId('generation-param-invalid-temperature')).toBeNull()
      expect(emitted()['update:modelValue']?.at(-1)).toEqual([{ temperature: { mode: 'custom', value: 1.25 } }])
    })
  })

  it('keeps an unknown provider-owned enum editable without inventing an allowed-value list', () => {
    render(GenerationParamsSettingsEditor, {
      props: {
        modelValue: { reasoningEffort: { mode: 'custom', value: 'provider-native-level' } },
        profile: openaiResponsesGenerationProfile,
        modelId: 'future-openai-model',
        collapsible: false,
        capabilityProjection: unknownCapabilityProjection('reasoning.effort'),
      },
    })

    const value = screen.getByTestId('generation-param-value-reasoningEffort')
    expect(value.tagName).toBe('INPUT')
    expect(value).toBeEnabled()
    expect(value).toHaveValue('provider-native-level')
  })

  it('hides DeepSeek reasoning controls when no provider capability is declared', () => {
    render(GenerationParamsSettingsEditor, {
        props: { modelValue: null, profile: deepseekGenerationProfile, modelId: 'deepseek-v4-flash', collapsible: false },
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
        capabilityProjection: capabilityProjection({
          'reasoning.summary': { kind: 'enum', values: ['auto', 'concise', 'detailed'] },
        }),
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
