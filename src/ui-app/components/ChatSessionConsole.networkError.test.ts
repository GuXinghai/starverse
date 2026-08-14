import { render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetI18nForTests, t } from '@/shared/i18n'
import ChatSessionConsole from './ChatSessionConsole.vue'

function defaultSessionConfig() {
  return {
    routeSelection: null,
    reasoning: { enabled: false, effort: 'medium' as const },
    webSearch: { enabled: false, level: 'high' as const, detail: null },
    imageGeneration: {
      enabled: false,
      resolution: '1K' as const,
      aspectRatio: '1:1' as const,
      mode: 'default' as const,
      detail: null,
    },
    generationParams: { detail: null },
  }
}

function networkError(reason: string, key: string) {
  return {
    requestPurpose: 'provider_availability',
    transportKind: 'electron_session_fetch',
    reason,
    safeDetailCode: reason,
    safeMessage: 'safe',
    safeMessageKey: key,
    retryable: false,
  }
}

function availabilityFailure(providerKey: string, reason: string, key: string) {
  return {
    ok: false,
    providerKey,
    endpointId: `${providerKey}-endpoint`,
    profileId: `${providerKey}-profile`,
    observedAtMs: 123,
    code: 'http_error',
    message: 'Network error',
    networkError: networkError(reason, key),
  }
}

describe('ChatSessionConsole network error display', () => {
  beforeEach(() => {
    resetI18nForTests()
  })

  it('shows distinct structured provider availability messages for common HTTP failures', () => {
    render(ChatSessionConsole, {
      props: {
        disabled: false,
        isRunning: false,
        sessionConfig: defaultSessionConfig(),
        openAIResponsesChat: { enabled: true, experimentalLabel: 'OpenAI Responses' },
        openAIResponsesModelAvailability: {
          loading: false,
          result: availabilityFailure('openai_responses', 'http_401_auth', 'errors.network.reason.http401Auth') as any,
        },
        anthropicChat: { enabled: true, thinkingDisplay: 'summarized', experimentalLabel: 'Anthropic' },
        anthropicModelAvailability: {
          loading: false,
          result: availabilityFailure('anthropic', 'http_403_forbidden', 'errors.network.reason.http403Forbidden') as any,
        },
        googleAIStudioChat: { enabled: true, experimentalLabel: 'Google AI Studio' },
        googleAIStudioModelAvailability: {
          loading: false,
          result: availabilityFailure('google_ai_studio', 'http_404_not_found_or_model_missing', 'errors.network.reason.http404NotFoundOrModelMissing') as any,
        },
        deepSeekChat: { enabled: true, experimentalLabel: 'DeepSeek' },
        deepSeekModelAvailability: {
          loading: false,
          result: availabilityFailure('deepseek', 'http_429_rate_limited', 'errors.network.reason.http429RateLimited') as any,
        },
        reasoningDisplayMode: 'inline',
        modelCatalog: [],
        webSearchResolved: null,
        generationParamsResolved: null,
      },
    })

    expect(screen.getByTestId('openai-responses-models-error').textContent)
      .toContain(t('errors.network.reason.http401Auth'))
    expect(screen.getByTestId('anthropic-models-error').textContent)
      .toContain(t('errors.network.reason.http403Forbidden'))
    expect(screen.getByTestId('google-ai-studio-models-error').textContent)
      .toContain(t('errors.network.reason.http404NotFoundOrModelMissing'))
    expect(screen.getByTestId('deepseek-models-error').textContent)
      .toContain(t('errors.network.reason.http429RateLimited'))
    expect(screen.getByTestId('openai-responses-models-error').textContent).not.toContain('Network error')
  })
})
