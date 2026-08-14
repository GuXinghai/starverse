import type { ProviderFailureTruncationV2, ProviderFailureV2 } from './providerFailureV2'
import { sha256Hex } from '../crypto/sha256Hex'

export const PROVIDER_FAILURE_UI_LIMIT_BYTES_V2 = 64 * 1024

export type ProviderFailureUiProjectionV2 = Readonly<{
  failure: ProviderFailureV2
  projectedBytes: number
  uiTruncations: readonly ProviderFailureTruncationV2[]
}>

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function rawText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return '[unserializable raw error]' }
}

function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  const encoded = new TextEncoder().encode(value)
  if (encoded.byteLength <= maxBytes) return value
  let end = Math.min(maxBytes, encoded.byteLength)
  while (end > 0) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(encoded.slice(0, end)) } catch { end -= 1 }
  }
  return ''
}

function projectedSize(failure: ProviderFailureV2): number {
  return byteLength(JSON.stringify(failure))
}

function envelopeSize(
  failure: ProviderFailureV2,
  uiTruncations: readonly ProviderFailureTruncationV2[],
): number {
  let projectedBytes = 0
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const next = byteLength(JSON.stringify({ failure, projectedBytes, uiTruncations }))
    if (next === projectedBytes) return next
    projectedBytes = next
  }
  return projectedBytes
}

export function projectProviderFailureEnvelopeForUiV2(failure: ProviderFailureV2): ProviderFailureUiProjectionV2 {
  const fullBytes = envelopeSize(failure, [])
  if (fullBytes <= PROVIDER_FAILURE_UI_LIMIT_BYTES_V2) {
    return Object.freeze({ failure, projectedBytes: fullBytes, uiTruncations: Object.freeze([]) })
  }

  const sourceFields = [
    { path: 'providerError.rawJson', value: failure.providerError?.rawJson ?? null },
    { path: 'providerError.rawText', value: failure.providerError?.rawText ?? null },
    { path: 'rawFrameExcerpt', value: failure.rawFrameExcerpt },
  ] as const
  const projectedRaw: Record<string, unknown> = {
    'providerError.rawJson': null,
    'providerError.rawText': null,
    rawFrameExcerpt: null,
  }
  const makeFailure = (): ProviderFailureV2 => Object.freeze({
    ...failure,
    rawFrameExcerpt: projectedRaw.rawFrameExcerpt as string | null,
    providerError: failure.providerError === null ? null : Object.freeze({
      ...failure.providerError,
      rawJson: projectedRaw['providerError.rawJson'],
      rawText: projectedRaw['providerError.rawText'] as string | null,
    }),
  })
  const uiTruncations: ProviderFailureTruncationV2[] = []
  for (const field of sourceFields) {
    const source = rawText(field.value)
    if (source === null) continue
    projectedRaw[field.path] = field.value
    if (envelopeSize(makeFailure(), uiTruncations) <= PROVIDER_FAILURE_UI_LIMIT_BYTES_V2) continue
    const truncation: ProviderFailureTruncationV2 = {
      path: field.path,
      originalByteLength: byteLength(source),
      retainedByteLength: 0,
      sha256: sha256Hex(source),
    }
    uiTruncations.push(truncation)
    let low = 0
    let high = byteLength(source)
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      const retained = utf8Prefix(source, middle)
      projectedRaw[field.path] = retained
      uiTruncations[uiTruncations.length - 1] = { ...truncation, retainedByteLength: byteLength(retained) }
      if (envelopeSize(makeFailure(), uiTruncations) <= PROVIDER_FAILURE_UI_LIMIT_BYTES_V2) low = middle
      else high = middle - 1
    }
    const retained = utf8Prefix(source, low)
    projectedRaw[field.path] = retained || null
    uiTruncations[uiTruncations.length - 1] = Object.freeze({
      ...truncation,
      retainedByteLength: byteLength(retained),
    })
  }
  let projected = makeFailure()
  if (envelopeSize(projected, uiTruncations) > PROVIDER_FAILURE_UI_LIMIT_BYTES_V2) {
    const source = JSON.stringify(projected)
    const bounded = (value: string | null): string | null => value === null ? null : utf8Prefix(value, 4_096)
    projected = Object.freeze({
      ...projected,
      provider: projected.provider,
      contractId: utf8Prefix(projected.contractId, 1_024),
      operationId: utf8Prefix(projected.operationId, 1_024),
      starverseDiagnosticCode: utf8Prefix(projected.starverseDiagnosticCode, 1_024),
      httpStatusText: bounded(projected.httpStatusText),
      rawFrameExcerpt: null,
      providerError: projected.providerError === null ? null : Object.freeze({
        ...projected.providerError,
        code: typeof projected.providerError.code === 'string' ? bounded(projected.providerError.code) : projected.providerError.code,
        type: bounded(projected.providerError.type),
        status: bounded(projected.providerError.status),
        message: bounded(projected.providerError.message),
        param: bounded(projected.providerError.param),
        requestId: bounded(projected.providerError.requestId),
        rawJson: null,
        rawText: null,
      }),
      transportError: projected.transportError === null ? null : Object.freeze({
        name: bounded(projected.transportError.name),
        code: bounded(projected.transportError.code),
        message: bounded(projected.transportError.message),
      }),
      redactions: Object.freeze(projected.redactions.slice(0, 16).map((record) => Object.freeze({
        ...record,
        path: utf8Prefix(record.path, 256),
      }))),
      truncations: Object.freeze(projected.truncations.slice(0, 16).map((record) => Object.freeze({
        ...record,
        path: utf8Prefix(record.path, 256),
      }))),
    })
    uiTruncations.push(Object.freeze({
      path: 'failure.uiProjection',
      originalByteLength: byteLength(source),
      retainedByteLength: projectedSize(projected),
      sha256: sha256Hex(source),
    }))
  }
  let projectedBytes = envelopeSize(projected, uiTruncations)
  if (projectedBytes > PROVIDER_FAILURE_UI_LIMIT_BYTES_V2) {
    const source = JSON.stringify(projected)
    const bounded = (value: string | null): string | null => value === null ? null : utf8Prefix(value, 512)
    projected = Object.freeze({
      ...projected,
      provider: projected.provider,
      contractId: utf8Prefix(projected.contractId, 512),
      operationId: utf8Prefix(projected.operationId, 512),
      starverseDiagnosticCode: utf8Prefix(projected.starverseDiagnosticCode, 512),
      httpStatusText: bounded(projected.httpStatusText),
      rawFrameExcerpt: null,
      providerError: projected.providerError === null ? null : Object.freeze({
        ...projected.providerError,
        code: typeof projected.providerError.code === 'string' ? bounded(projected.providerError.code) : projected.providerError.code,
        type: bounded(projected.providerError.type),
        status: bounded(projected.providerError.status),
        message: bounded(projected.providerError.message),
        param: bounded(projected.providerError.param),
        requestId: bounded(projected.providerError.requestId),
        rawJson: null,
        rawText: null,
      }),
      transportError: projected.transportError === null ? null : Object.freeze({
        name: bounded(projected.transportError.name),
        code: bounded(projected.transportError.code),
        message: bounded(projected.transportError.message),
      }),
      redactions: Object.freeze([]),
      truncations: Object.freeze([]),
    })
    const index = uiTruncations.findIndex((item) => item.path === 'failure.uiProjection')
    const record = Object.freeze({
      path: 'failure.uiProjection',
      originalByteLength: byteLength(source),
      retainedByteLength: projectedSize(projected),
      sha256: sha256Hex(source),
    })
    if (index >= 0) uiTruncations[index] = record
    else uiTruncations.push(record)
    projectedBytes = envelopeSize(projected, uiTruncations)
  }
  return Object.freeze({
    failure: projected,
    projectedBytes,
    uiTruncations: Object.freeze(uiTruncations),
  })
}

export function projectProviderFailureForUiV2(failure: ProviderFailureV2): ProviderFailureV2 {
  return projectProviderFailureEnvelopeForUiV2(failure).failure
}
