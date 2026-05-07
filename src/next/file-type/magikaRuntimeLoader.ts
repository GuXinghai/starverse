export const MAGIKA_RUNTIME_KINDS = ['mock', 'unavailable', 'local_loader', 'adapter_only'] as const
export type MagikaRuntimeKind = (typeof MAGIKA_RUNTIME_KINDS)[number]

export const MAGIKA_RUNTIME_UNAVAILABLE_REASONS = [
  'runtime_unavailable',
  'runtime_error',
  'loader_not_configured',
] as const
export type MagikaRuntimeUnavailableReason = (typeof MAGIKA_RUNTIME_UNAVAILABLE_REASONS)[number]

export type MagikaRuntimeDetectionInput = Readonly<{
  bytes: Uint8Array
  filename?: string | null
  mime?: string | null
}>

export type MagikaRuntimeClassifyOutput = Readonly<{
  label: string
  score: number
}>

export interface MagikaRuntime {
  kind: MagikaRuntimeKind
  modelVersion: string | null
  classify(
    input: MagikaRuntimeDetectionInput
  ): Promise<MagikaRuntimeClassifyOutput | null> | MagikaRuntimeClassifyOutput | null
}

export type MagikaRuntimeLoadResult =
  | Readonly<{
      available: true
      runtime: MagikaRuntime
    }>
  | Readonly<{
      available: false
      runtimeKind: MagikaRuntimeKind
      modelVersion: string | null
      reason: MagikaRuntimeUnavailableReason
      detail: string | null
    }>

export interface MagikaRuntimeLoader {
  load(): Promise<MagikaRuntimeLoadResult> | MagikaRuntimeLoadResult
}

export function createUnavailableMagikaRuntimeLoader(
  input: Readonly<{
    reason?: MagikaRuntimeUnavailableReason
    detail?: string | null
    modelVersion?: string | null
    runtimeKind?: MagikaRuntimeKind
  }> = {}
): MagikaRuntimeLoader {
  return {
    load: () => ({
      available: false,
      reason: input.reason ?? 'loader_not_configured',
      detail: sanitizeDetail(input.detail ?? null),
      modelVersion: normalizeModelVersion(input.modelVersion ?? null),
      runtimeKind: input.runtimeKind ?? 'unavailable',
    }),
  }
}

export function createMockMagikaRuntimeLoader(
  input: Readonly<{
    modelVersion?: string | null
    runtimeKind?: MagikaRuntimeKind
    classify?: (
      probe: MagikaRuntimeDetectionInput
    ) => Promise<MagikaRuntimeClassifyOutput | null> | MagikaRuntimeClassifyOutput | null
    output?: MagikaRuntimeClassifyOutput | null
  }> = {}
): MagikaRuntimeLoader {
  return {
    load: () => ({
      available: true,
      runtime: {
        kind: input.runtimeKind ?? 'mock',
        modelVersion: normalizeModelVersion(input.modelVersion ?? null),
        classify:
          input.classify ??
          (() => input.output ?? null),
      },
    }),
  }
}

function normalizeModelVersion(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function sanitizeDetail(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed
    .replace(/(contentToken["'\s:=]+)([^\s"',}]+)/gi, '$1[redacted-token]')
    .replace(/(fullHash["'\s:=]+)([A-Za-z0-9+/=:_-]{12,})/gi, '$1[redacted-hash]')
    .replace(/\b[A-Za-z]:\\[^\s"'`]+/g, '[redacted-path]')
    .replace(/(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)[^\s"'`]+/g, '[redacted-path]')
}
