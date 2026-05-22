import { computed, defineComponent, ref } from 'vue'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { resolveSearchSettings, type SearchSettingsLayer } from '@/next/openrouter/searchSettingsResolver'
import WebSearchSettingsEditor from './WebSearchSettingsEditor.vue'

type HarnessInput = Readonly<{
  convo: SearchSettingsLayer | null
  project?: SearchSettingsLayer | null
  global?: SearchSettingsLayer | null
  accountDefaultEnabled?: boolean
}>

function createHarness(input: HarnessInput) {
  return defineComponent({
    components: { WebSearchSettingsEditor },
    setup() {
      const layer = ref<SearchSettingsLayer | null>(input.convo)
      const resolved = computed(() =>
        resolveSearchSettings(
          { convo: layer.value, project: input.project ?? null, global: input.global ?? null },
          { accountDefaultEnabled: input.accountDefaultEnabled === true }
        )
      )
      const serialized = computed(() => JSON.stringify(layer.value))
      return { layer, resolved, serialized }
    },
    template: `
      <div>
        <WebSearchSettingsEditor v-model="layer" :resolved="resolved" />
        <pre data-testid="layer-json">{{ serialized }}</pre>
      </div>
    `,
  })
}

function readLayer(): SearchSettingsLayer | null {
  const raw = screen.getByTestId('layer-json').textContent ?? 'null'
  return JSON.parse(raw)
}

async function selectDepth(user: ReturnType<typeof userEvent.setup>, value: 'default' | 'low' | 'medium' | 'high' | 'custom') {
  await user.selectOptions(screen.getByTestId('search-depth-select'), value)
}

describe('WebSearchSettingsEditor', () => {
  it('SearchMode default shows inherited value and uses two-click behavior', async () => {
    const user = userEvent.setup()
    render(createHarness({
      convo: { searchMode: 'default' },
      project: { searchMode: 'enable' },
    }))

    const modeButton = screen.getByTestId('search-mode-toggle')
    expect(modeButton.textContent ?? '').toContain('enable')

    await user.click(modeButton)
    expect(readLayer()).toEqual({ searchMode: 'enable' })

    await user.click(modeButton)
    expect(readLayer()).toEqual({ searchMode: 'disable' })
  })

  it('Engine default shows inherited value and uses two-click behavior', async () => {
    const user = userEvent.setup()
    render(createHarness({
      convo: { searchEngine: 'default' },
      global: { searchEngine: 'exa' },
    }))

    const engineButton = screen.getByTestId('search-engine-toggle')
    expect(engineButton.textContent ?? '').toContain('exa')

    await user.click(engineButton)
    expect(readLayer()).toEqual({ searchEngine: 'exa' })

    await user.click(engineButton)
    expect(readLayer()).toEqual({ searchEngine: 'auto' })
  })

  it('Depth expands with backfill while keeping selected preset unchanged', async () => {
    const user = userEvent.setup()
    render(createHarness({
      convo: { searchDepth: 'custom', maxResults: 7 },
    }))

    const input = screen.getByTestId('search-max-results-input') as HTMLInputElement
    expect(input.value).toBe('7')

    await selectDepth(user, 'medium')
    expect(readLayer()).toEqual({ searchDepth: 'medium' })
    expect(input.value).toBe('')

    const toggle = screen.getByTestId('search-depth-panel-toggle')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect((screen.getByTestId('search-max-results-input') as HTMLInputElement).value).toBe('7')
    expect(readLayer()).toEqual({ searchDepth: 'medium' })
  })

  it('Depth collapse is blocked when custom is selected with invalid value', async () => {
    const user = userEvent.setup()
    render(createHarness({
      convo: { searchDepth: 'custom', maxResults: 7 },
    }))

    const input = screen.getByTestId('search-max-results-input') as HTMLInputElement
    const toggle = screen.getByTestId('search-depth-panel-toggle')

    await user.clear(input)
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    await user.type(input, '11')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    await user.clear(input)
    await user.type(input, '0')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    await user.clear(input)
    await user.type(input, 'abc')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('Depth deadlock is released by switching to low and then collapsing', async () => {
    const user = userEvent.setup()
    render(createHarness({
      convo: { searchDepth: 'custom', maxResults: 7 },
    }))

    const input = screen.getByTestId('search-max-results-input') as HTMLInputElement
    const toggle = screen.getByTestId('search-depth-panel-toggle')

    await user.clear(input)
    await selectDepth(user, 'low')
    expect(readLayer()).toEqual({ searchDepth: 'low' })
    expect(input.value).toBe('')

    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('Depth custom remains selectable from a preset and enables the max results input', async () => {
    const user = userEvent.setup()
    render(createHarness({
      convo: { searchDepth: 'medium' },
    }))

    await selectDepth(user, 'custom')

    const input = screen.getByTestId('search-max-results-input') as HTMLInputElement
    expect(input).not.toBeDisabled()
    expect(input.value).toBe('5')
    expect(readLayer()).toEqual({ searchDepth: 'custom', maxResults: 5 })
  })

  it('Depth keeps last valid custom value and backfills on next expand', async () => {
    const user = userEvent.setup()
    render(createHarness({
      convo: { searchDepth: 'custom', maxResults: 5 },
    }))

    const input = screen.getByTestId('search-max-results-input') as HTMLInputElement
    const toggle = screen.getByTestId('search-depth-panel-toggle')

    await user.clear(input)
    await user.type(input, '7')
    expect(readLayer()).toEqual({ searchDepth: 'custom', maxResults: 7 })

    await selectDepth(user, 'medium')
    expect(readLayer()).toEqual({ searchDepth: 'medium' })

    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect((screen.getByTestId('search-max-results-input') as HTMLInputElement).value).toBe('7')
  })
})
