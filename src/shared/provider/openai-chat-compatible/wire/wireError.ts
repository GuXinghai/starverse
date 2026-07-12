import {
  buildCompatibleNetworkError,
  compatibleNetworkErrorFromHttpStatus,
  type CompatibleNetworkErrorCode,
  type CompatibleNetworkStage,
} from '../../../../shared/network/compatibleNetworkError'
import type { CompatibleWireErrorEnvelope } from './wireTypes'

export type CompatibleWireDiagnosticCategory = CompatibleWireErrorEnvelope['diagnostic']['category']

export class CompatibleWireError extends Error {
  readonly envelope: CompatibleWireErrorEnvelope

  constructor(envelope: CompatibleWireErrorEnvelope) {
    super(envelope.network.code)
    this.name = 'CompatibleWireError'
    this.envelope = envelope
  }
}

export function createCompatibleWireError(input: Readonly<{
  code: CompatibleNetworkErrorCode
  stage?: CompatibleNetworkStage
  category: CompatibleWireDiagnosticCategory
  httpStatus?: number
}>): CompatibleWireError {
  return new CompatibleWireError(Object.freeze({
    network: buildCompatibleNetworkError({
      code: input.code,
      stage: input.stage ?? 'response',
      ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
    }),
    diagnostic: Object.freeze({ category: input.category }),
  }))
}

export function createCompatibleHttpWireError(input: Readonly<{
  status: number
  providerErrorShape: 'object' | 'other' | 'none'
  providerCodePresent?: boolean
  providerTypePresent?: boolean
}>): CompatibleWireError {
  return new CompatibleWireError(Object.freeze({
    network: compatibleNetworkErrorFromHttpStatus(input.status),
    diagnostic: Object.freeze({
      category: 'http' as const,
      providerErrorShape: input.providerErrorShape,
      ...(input.providerCodePresent === undefined ? {} : { providerCodePresent: input.providerCodePresent }),
      ...(input.providerTypePresent === undefined ? {} : { providerTypePresent: input.providerTypePresent }),
    }),
  }))
}
