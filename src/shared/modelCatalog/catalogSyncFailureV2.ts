import type { ProviderFailureOriginV2, ProviderFailurePhaseV2, ProviderFailureV2 } from '../provider/providerFailureV2'

export type CatalogSyncFailureV2 = Readonly<{
  providerId: string
  scopeId: string
  attemptedAt: number
  httpStatus: number | null
  providerErrorCode: string | number | null
  providerErrorType: string | null
  providerMessage: string | null
  providerRequestId: string | null
  rawErrorJson: unknown | null
  rawErrorText: string | null
  origin: ProviderFailureOriginV2
  phase: ProviderFailurePhaseV2
  starverseDiagnosticCode: string
  activeSnapshotPreserved: boolean
  failure: ProviderFailureV2
}>

export function catalogSyncFailureFromProviderFailureV2(input: Readonly<{
  providerId: string
  scopeId: string
  attemptedAt: number
  activeSnapshotPreserved: boolean
  failure: ProviderFailureV2
}>): CatalogSyncFailureV2 {
  const provider = input.failure.providerError
  return Object.freeze({
    providerId: input.providerId,
    scopeId: input.scopeId,
    attemptedAt: input.attemptedAt,
    httpStatus: input.failure.httpStatus,
    providerErrorCode: provider?.code ?? null,
    providerErrorType: provider?.type ?? null,
    providerMessage: provider?.message ?? null,
    providerRequestId: provider?.requestId ?? null,
    rawErrorJson: provider?.rawJson ?? null,
    rawErrorText: provider?.rawText ?? null,
    origin: input.failure.origin,
    phase: input.failure.phase,
    starverseDiagnosticCode: input.failure.starverseDiagnosticCode,
    activeSnapshotPreserved: input.activeSnapshotPreserved,
    failure: input.failure,
  })
}
