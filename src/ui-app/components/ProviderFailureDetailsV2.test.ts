import { fireEvent, render, screen } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetI18nForTests } from '@/shared/i18n'
import { createProviderFailureV2 } from '@/shared/provider/providerFailureV2'
import { projectProviderFailureEnvelopeForUiV2, PROVIDER_FAILURE_UI_LIMIT_BYTES_V2 } from '@/shared/provider/providerFailureUiProjectionV2'
import ProviderFailureDetailsV2 from './ProviderFailureDetailsV2.vue'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

describe('ProviderFailureDetailsV2 safe details and copy', () => {
  beforeEach(() => { resetI18nForTests() })
  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('renders and copies the actual projected envelope with credentials removed and diagnostic facts retained', async () => {
    const writeText = vi.fn(async (_value: string) => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const failure = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_body', provider: { namespace: 'generation_execution', id: 'openai_responses' },
        contractId: 'openai-responses-v1', operationId: 'ui:privacy', requestSequence: 1 },
      httpStatus: 401, httpStatusText: 'Unauthorized',
      body: { error: { code: 'invalid_api_key', type: 'authentication_error', param: 'model', request_id: 'req-safe',
        message: 'x-api-key: AUDIT_DUMMY_MESSAGE See https://docs.example.test/api-key/docs',
        nested: [{ 'X-API-Key': 'AUDIT_DUMMY_HEADER', 'x-goog-api-key': 'AUDIT_DUMMY_GOOGLE' }] } },
      rawFrameExcerpt: 'x-goog-api-key: AUDIT_DUMMY_FRAME https://docs.example.test/help',
      transportError: new Error('x-api-key: AUDIT_DUMMY_TRANSPORT https://docs.example.test/help'),
      headers: { 'retry-after': '30' },
    })
    const view = render(ProviderFailureDetailsV2, { props: { failure } })
    const expected = projectProviderFailureEnvelopeForUiV2(failure)
    expect(view.container.textContent).not.toContain('AUDIT_DUMMY_')
    expect(screen.getByTestId('provider-failure-message')).toHaveTextContent('x-api-key: [redacted] See https://docs.example.test/api-key/docs')
    expect(screen.getByTestId('provider-failure-http-status')).toHaveTextContent('401 Unauthorized')
    const displayedJson = screen.getByTestId('provider-failure-safe-json').textContent!
    expect(JSON.parse(displayedJson)).toEqual(expected)
    expect(JSON.parse(displayedJson).failure.providerError).toMatchObject({ code: 'invalid_api_key', type: 'authentication_error',
      param: 'model', requestId: 'req-safe', retryAfterMs: 30_000 })
    await fireEvent.click(screen.getByTestId('provider-failure-copy-json'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(displayedJson)
    expect(writeText.mock.calls[0][0]).not.toContain('AUDIT_DUMMY_')
  })

  it('copies the same bounded safe projection that the details component displays', async () => {
    const writeText = vi.fn(async (_value: string) => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const failure = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_body', provider: { namespace: 'catalog_source', id: 'google_ai_studio' },
        contractId: 'gemini-models-v1beta', operationId: 'ui:privacy-bounded', requestSequence: 1 },
      httpStatus: 400,
      body: { error: { code: 'INVALID_ARGUMENT', message: 'x'.repeat(200_000),
        headers: { 'x-goog-api-key': 'AUDIT_DUMMY_HEADER' } } },
    })
    render(ProviderFailureDetailsV2, { props: { failure } })
    expect(screen.getByTestId('provider-failure-ui-truncation')).toBeInTheDocument()
    const displayedJson = screen.getByTestId('provider-failure-safe-json').textContent!
    const projected = JSON.parse(displayedJson)
    expect(projected).toEqual(projectProviderFailureEnvelopeForUiV2(failure))
    expect(new TextEncoder().encode(JSON.stringify(projected)).byteLength).toBeLessThanOrEqual(PROVIDER_FAILURE_UI_LIMIT_BYTES_V2)
    expect(displayedJson).not.toContain('AUDIT_DUMMY_')
    await fireEvent.click(screen.getByTestId('provider-failure-copy-json'))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(displayedJson)
  })
})
