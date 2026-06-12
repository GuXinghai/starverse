import { describe, expect, it, vi } from 'vitest'
import { streamViaGenericConfig, type GenericFetchFn } from '@/next/provider/generic/genericAdapter'
import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'
import { GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID } from '@/next/provider/generic/genericEndpointDescriptor'
import type { GenericEndpointConfig } from '@/next/provider/generic/genericEndpointConfig'
import {
  createBearerCredential,
  isCredentialValid,
  type ProviderCredential,
} from '@/next/provider/credentials/providerCredential'
import type { ProviderCredentialRef } from '@/next/provider/credentials/providerCredentialResolver'
import {
  providerCredentialResolverFromStore,
  providerCredentialStoreCredential,
  providerCredentialStoreError,
  providerCredentialStoreInvalid,
  providerCredentialStoreMissing,
  providerCredentialStoreUnavailable,
  type ProviderCredentialStore,
  type ProviderCredentialStoreResult,
} from '@/next/provider/credentials/providerCredentialStore'

const VALID_REF: ProviderCredentialRef = { kind: 'credential_ref', id: 'generic-default' }

function inMemoryCredentialStore(
  entries: Readonly<Record<string, ProviderCredential>>,
): ProviderCredentialStore {
  const credentials = new Map(Object.entries(entries))
  return {
    getCredential(ref) {
      const credential = credentials.get(ref.id)
      if (!credential) return providerCredentialStoreMissing()
      return providerCredentialStoreCredential(credential)
    },
  }
}

function fixedStore(result: ProviderCredentialStoreResult): ProviderCredentialStore {
  return {
    getCredential: () => result,
  }
}

function throwingStore(message: string): ProviderCredentialStore {
  return {
    getCredential: () => {
      throw new Error(message)
    },
  }
}

function makeRequest(): ProviderStreamRequest {
  return {
    requestId: 'req_store_1',
    assistantMessageId: 'assistant_store_1',
    userText: 'Hello',
    config: { model: 'gpt-4o-mini', requestedReasoningMode: 'auto' },
  }
}

function validEndpointConfig(overrides?: Partial<GenericEndpointConfig>): GenericEndpointConfig {
  return {
    endpointId: 'ep-store-test',
    displayName: 'Store Test Endpoint',
    profileId: GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-4o-mini',
    credentialRef: VALID_REF,
    ...overrides,
  }
}

function sseFixture(...lines: string[]): string {
  return lines.join('\n') + '\n'
}

function textChunkJson(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}`
}

function finishChunkJson(finishReason: string): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}`
}

function makeSseResponseWithDone(...lines: string[]): Response {
  return makeResponseFromText(sseFixture(...lines, '', 'data: [DONE]', ''))
}

function makeResponseFromText(body: string): Response {
  const bytes = new TextEncoder().encode(body)
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      const next = bytes.slice(offset, offset + 50)
      offset += 50
      controller.enqueue(next)
    },
  })
  return new Response(stream as any, { status: 200 })
}

function mockFetch(response: Response): GenericFetchFn {
  return vi.fn(async () => response)
}

async function collectEvents(gen: AsyncGenerator<StarverseStreamEvent>): Promise<StarverseStreamEvent[]> {
  const events: StarverseStreamEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

function visibleText(events: StarverseStreamEvent[]): string {
  return events
    .filter((event): event is Extract<StarverseStreamEvent, { type: 'message.text_delta' }> => event.type === 'message.text_delta')
    .map((event) => event.text)
    .join('')
}

function expectCredentialFailureBeforeFetch(
  events: StarverseStreamEvent[],
  fetch: GenericFetchFn,
): void {
  expect(fetch).toHaveBeenCalledTimes(0)
  const errorEvents = events.filter((event) => event.type === 'stream.error')
  const doneEvents = events.filter((event) => event.type === 'stream.done')
  expect(errorEvents).toHaveLength(1)
  expect(doneEvents).toHaveLength(0)
  expect(events[events.length - 1].type).toBe('stream.error')
  if (errorEvents[0].type === 'stream.error') {
    expect(errorEvents[0].terminal).toBe(true)
    expect(errorEvents[0].error.code).toBe('credential_resolution_failed')
    expect(errorEvents[0].error.category).toBe('auth')
  }
}

describe('providerCredentialStore boundary', () => {
  it('in-memory credential store returns bearer credential by ProviderCredentialRef', () => {
    const store = inMemoryCredentialStore({
      [VALID_REF.id]: createBearerCredential('sk-store-token') as ProviderCredential,
    })
    const resolver = providerCredentialResolverFromStore(store)

    const result = resolver(VALID_REF)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.credential.kind).toBe('bearer')
      expect(result.credential.token).toBe('sk-store-token')
    }
  })

  it('missing credential becomes safe unresolved failure', () => {
    const resolver = providerCredentialResolverFromStore(inMemoryCredentialStore({}))

    const result = resolver(VALID_REF)

    expect(result).toEqual({
      ok: false,
      error: { code: 'credential_unresolved', message: 'Credential could not be resolved.' },
    })
  })

  it('invalid credential material becomes safe invalid failure', () => {
    const resolver = providerCredentialResolverFromStore(fixedStore(providerCredentialStoreInvalid()))

    const result = resolver(VALID_REF)

    expect(result).toEqual({
      ok: false,
      error: { code: 'credential_invalid', message: 'Credential material is invalid.' },
    })
  })

  it('explicit invalid store result becomes safe invalid failure', () => {
    const resolver = providerCredentialResolverFromStore(fixedStore(providerCredentialStoreInvalid()))

    const result = resolver(VALID_REF)

    expect(result).toEqual({
      ok: false,
      error: { code: 'credential_invalid', message: 'Credential material is invalid.' },
    })
  })

  it('store success helper accepts only valid ProviderCredential material', () => {
    const credential = createBearerCredential('sk-store-valid-token')
    expect(isCredentialValid(credential)).toBe(true)
    if (!isCredentialValid(credential)) {
      throw new Error('Expected valid credential in test setup')
    }

    const result = providerCredentialStoreCredential(credential)

    expect(result).toEqual({ ok: true, credential })
  })

  it('store success helper rejects CredentialError at type level', () => {
    type StoreCredentialInput = Parameters<typeof providerCredentialStoreCredential>[0]

    const invalidCredential = createBearerCredential('')
    expect(isCredentialValid(invalidCredential)).toBe(false)
    if (!isCredentialValid(invalidCredential)) {
      type CredentialErrorAssignableToStoreSuccess =
        typeof invalidCredential extends StoreCredentialInput ? true : false
      const assignable: CredentialErrorAssignableToStoreSuccess = false
      expect(assignable).toBe(false)
    }
  })

  it('store unavailable and internal errors become safe unresolved failures', () => {
    const unavailableResolver = providerCredentialResolverFromStore(fixedStore(providerCredentialStoreUnavailable()))
    const errorResolver = providerCredentialResolverFromStore(fixedStore(providerCredentialStoreError()))

    expect(unavailableResolver(VALID_REF)).toEqual({
      ok: false,
      error: { code: 'credential_unresolved', message: 'Credential could not be resolved.' },
    })
    expect(errorResolver(VALID_REF)).toEqual({
      ok: false,
      error: { code: 'credential_unresolved', message: 'Credential could not be resolved.' },
    })
  })

  it('thrown store error does not leak raw token, Authorization, Bearer, or headers', () => {
    const resolver = providerCredentialResolverFromStore(throwingStore(
      'store failed with Authorization: Bearer sk-store-throw-secret headers={"Authorization":"Bearer sk-store-throw-secret"}',
    ))

    const result = resolver(VALID_REF)
    const serialized = JSON.stringify(result)

    expect(result.ok).toBe(false)
    expect(serialized).not.toContain('sk-store-throw-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('headers')
  })

  it('store boundary does not expose a raw credential list API', () => {
    const rawToken = 'sk-hidden-in-memory-store'
    const store = inMemoryCredentialStore({
      [VALID_REF.id]: createBearerCredential(rawToken) as ProviderCredential,
    })

    expect(Object.keys(store)).toEqual(['getCredential'])
    expect('listCredentials' in store).toBe(false)
    expect('entries' in store).toBe(false)
    expect('credentials' in store).toBe(false)
    expect(JSON.stringify(store)).not.toContain(rawToken)
  })

  it('CredentialRef remains non-secret', () => {
    const serialized = JSON.stringify(VALID_REF)

    expect(VALID_REF).toEqual({ kind: 'credential_ref', id: 'generic-default' })
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('headers')
  })

  it('store-backed resolver works with Generic config adapter happy path', async () => {
    const store = inMemoryCredentialStore({
      [VALID_REF.id]: createBearerCredential('sk-store-generic-token') as ProviderCredential,
    })
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hello from store'), finishChunkJson('stop')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      providerCredentialResolverFromStore(store),
      fetch,
    ))

    expect(visibleText(events)).toBe('Hello from store')
    expect(events[events.length - 1].type).toBe('stream.done')
    const [, init] = (fetch as any).mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer sk-store-generic-token')
  })

  it('store-backed missing credential fails Generic config path before fetch and no done', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('must not fetch'), finishChunkJson('stop')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      providerCredentialResolverFromStore(inMemoryCredentialStore({})),
      fetch,
    ))

    expectCredentialFailureBeforeFetch(events, fetch)
  })

  it('store-backed invalid credential fails Generic config path before fetch and no done', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('must not fetch'), finishChunkJson('stop')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      providerCredentialResolverFromStore(fixedStore(providerCredentialStoreInvalid())),
      fetch,
    ))

    expectCredentialFailureBeforeFetch(events, fetch)
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('headers')
  })

  it('store-backed unavailable credential store fails Generic config path before fetch and no done', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('must not fetch'), finishChunkJson('stop')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      providerCredentialResolverFromStore(fixedStore(providerCredentialStoreUnavailable())),
      fetch,
    ))

    expectCredentialFailureBeforeFetch(events, fetch)
  })

  it('store-backed internal credential store error fails Generic config path before fetch and no done', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('must not fetch'), finishChunkJson('stop')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      providerCredentialResolverFromStore(fixedStore(providerCredentialStoreError())),
      fetch,
    ))

    expectCredentialFailureBeforeFetch(events, fetch)
  })

  it('store-backed failure in Generic config path does not leak credential internals', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('must not fetch'), finishChunkJson('stop')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      providerCredentialResolverFromStore(throwingStore(
        'Authorization: Bearer sk-store-generic-leak headers={"Authorization":"Bearer sk-store-generic-leak"}',
      )),
      fetch,
    ))

    expectCredentialFailureBeforeFetch(events, fetch)
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('sk-store-generic-leak')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('headers')
  })
})
