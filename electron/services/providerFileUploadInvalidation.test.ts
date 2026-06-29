import { describe, expect, it, vi } from 'vitest'
import { invalidateProviderFileUploadCacheOnReferenceError } from './providerFileUploadInvalidation'

const cacheEvents = [
  {
    cacheId: 'cache-1',
    provider: 'openai_responses',
    status: 'reused',
    assetId: 'asset-1',
    revisionId: 'rev-1',
    kind: 'pdf',
  },
  {
    cacheId: 'cache-1',
    provider: 'openai_responses',
    status: 'reused',
    assetId: 'asset-1',
    revisionId: 'rev-1',
    kind: 'pdf',
  },
] as const

describe('providerFileUploadInvalidation', () => {
  it('invalidates cached provider files when generation reports an invalid file reference', async () => {
    const service = {
      resolveContentBlocks: vi.fn(),
      invalidate: vi.fn(async () => undefined),
    }

    await invalidateProviderFileUploadCacheOnReferenceError({
      service: service as any,
      cacheEvents,
      streamEvent: {
        type: 'stream.error',
        terminal: true,
        error: {
          phase: 'provider',
          provider: 'openai-responses',
          category: 'provider_error',
          code: 'invalid_request_error',
          message: 'Input file_id file-openai-1 does not exist.',
        },
      },
    })

    expect(service.invalidate).toHaveBeenCalledTimes(1)
    expect(service.invalidate).toHaveBeenCalledWith({
      cacheId: 'cache-1',
      errorCode: 'provider_file_reference_invalid',
      errorMessage: 'Provider reported that the cached file reference is invalid, deleted, or expired.',
    })
  })

  it('preserves cache entries for generic generation failures', async () => {
    const service = {
      resolveContentBlocks: vi.fn(),
      invalidate: vi.fn(async () => undefined),
    }

    await invalidateProviderFileUploadCacheOnReferenceError({
      service: service as any,
      cacheEvents,
      streamEvent: {
        type: 'stream.error',
        terminal: true,
        error: {
          phase: 'provider',
          provider: 'openai-responses',
          category: 'provider_error',
          code: 'server_error',
          message: 'Provider generation failed.',
        },
      },
    })

    expect(service.invalidate).not.toHaveBeenCalled()
  })
})
