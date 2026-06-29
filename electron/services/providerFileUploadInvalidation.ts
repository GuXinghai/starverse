import type { StarverseProviderError, StarverseStreamEvent } from '../../src/next/provider/providerTypes'
import type { ProviderFileUploadCacheEvent, ProviderFileUploadService } from './providerFileUploadService'

export async function invalidateProviderFileUploadCacheOnReferenceError(input: Readonly<{
  service?: ProviderFileUploadService
  cacheEvents?: ReadonlyArray<ProviderFileUploadCacheEvent>
  streamEvent: StarverseStreamEvent
}>): Promise<void> {
  if (!input.service || !input.cacheEvents?.length) return
  if (!isProviderFileReferenceInvalidationError(input.streamEvent)) return

  const cacheIds = new Set(input.cacheEvents.map((event) => event.cacheId).filter(Boolean))
  for (const cacheId of cacheIds) {
    try {
      await input.service.invalidate({
        cacheId,
        errorCode: 'provider_file_reference_invalid',
        errorMessage: 'Provider reported that the cached file reference is invalid, deleted, or expired.',
      })
    } catch {
      // Best-effort cache invalidation must not mask the provider generation error.
    }
  }
}

export function isProviderFileReferenceInvalidationError(event: StarverseStreamEvent): boolean {
  if (event.type !== 'stream.error') return false
  const error = event.error as StarverseProviderError
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return /\b(file|file_id|fileid|fileuri|file_uri|input_file|document)\b/.test(text) &&
    /(invalid|expired|deleted|not[_ -]?found|missing|does not exist|no such|unavailable)/.test(text)
}
