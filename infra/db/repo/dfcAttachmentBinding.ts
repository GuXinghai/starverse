import type {
  DfcSendAssetRef,
  DfcSendStrategy,
  DfcTargetKind,
} from '../../../src/shared/files/documentFormatConversion'

export function parseDfcSendAssetRefsJson(value: string | null | undefined): DfcSendAssetRef[] {
  if (!value) return []
  return normalizeDfcSendAssetRefs(JSON.parse(value))
}

export function parseRequiredDfcSendAssetRefsJson(value: string | null | undefined): DfcSendAssetRef[] {
  const refs = parseDfcSendAssetRefsJson(value)
  if (refs.length === 0) throw new Error('DFC-managed attachment requires at least one SendAssetRef')
  return refs
}

export function stringifyDfcSendAssetRefs(value: readonly DfcSendAssetRef[] | null | undefined): string | null {
  const refs = normalizeDfcSendAssetRefs(value ?? [])
  return refs.length > 0 ? JSON.stringify(refs) : null
}

export function stringifyRequiredDfcSendAssetRefs(value: readonly DfcSendAssetRef[] | null | undefined): string {
  const refs = normalizeDfcSendAssetRefs(value ?? [])
  if (refs.length === 0) throw new Error('DFC-managed attachment requires at least one SendAssetRef')
  return JSON.stringify(refs)
}

export function normalizeRequiredDfcSendAssetRefs(value: readonly DfcSendAssetRef[] | null | undefined): DfcSendAssetRef[] {
  const refs = normalizeDfcSendAssetRefs(value ?? [])
  if (refs.length === 0) throw new Error('DFC-managed attachment requires at least one SendAssetRef')
  return refs
}

export function normalizeDfcTargetKind(value: DfcTargetKind | string | null | undefined): DfcTargetKind | null {
  const normalized = normalizeNullable(value)
  if (!normalized) return null
  if (normalized === 'original_file'
    || normalized === 'plain_text'
    || normalized === 'markdown'
    || normalized === 'code'
    || normalized === 'table_markdown'
    || normalized === 'pdf_attachment') {
    return normalized
  }
  throw new Error(`invalid DFC targetKind: ${normalized}`)
}

export function normalizeDfcSendStrategy(value: DfcSendStrategy | string | null | undefined): DfcSendStrategy | null {
  const normalized = normalizeNullable(value)
  if (!normalized) return null
  if (normalized === 'text_in_prompt' || normalized === 'file_attachment') return normalized
  throw new Error(`invalid DFC sendStrategy: ${normalized}`)
}

export function normalizeDfcBindingText(value: string | null | undefined): string | null {
  return normalizeNullable(value)
}

export function assertDfcBindingRequiresManaged(
  dfcManaged: boolean,
  fields: Readonly<Record<string, unknown>>,
  recordKind: 'draft' | 'message',
): void {
  if (dfcManaged) return
  const hasDfcField = Object.values(fields).some((value) => {
    if (Array.isArray(value)) return value.length > 0
    return value !== undefined && value !== null
  })
  if (hasDfcField) throw new Error(`DFC ${recordKind} binding fields require dfcManaged true`)
}

export function normalizeDfcSendAssetRefs(value: unknown): DfcSendAssetRef[] {
  if (!Array.isArray(value)) throw new Error('DFC send asset refs must be an array')
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`DFC send asset ref at index ${index} must be an object`)
    }
    const record = item as Record<string, unknown>
    const kind = record.kind
    const assetId = normalizeNullable(record.assetId)
    if (!assetId) throw new Error(`DFC send asset ref at index ${index} requires assetId`)
    if (kind === 'raw_file') return { kind, assetId }
    if (kind === 'derived_asset') return { kind, assetId }
    throw new Error(`invalid DFC send asset ref kind at index ${index}`)
  })
}

function normalizeNullable(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}
