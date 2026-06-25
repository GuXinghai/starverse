import { DFC_TARGET_KINDS, type DfcTargetKind } from './documentFormatConversion'

export type DfcAttachmentDefaults = Readonly<{
  globalTargetKind: DfcTargetKind | null
  fileTypeTargetKinds: Readonly<Record<string, DfcTargetKind>>
}>

export const DEFAULT_DFC_ATTACHMENT_DEFAULTS: DfcAttachmentDefaults = {
  globalTargetKind: null,
  fileTypeTargetKinds: {},
}

const DFC_TARGET_KIND_SET = new Set<string>(DFC_TARGET_KINDS)

export function normalizeDfcAttachmentDefaults(input: unknown): DfcAttachmentDefaults {
  if (!input || typeof input !== 'object') return DEFAULT_DFC_ATTACHMENT_DEFAULTS
  const record = input as Record<string, unknown>
  const globalTargetKind = normalizeDfcDefaultTargetKind(record.globalTargetKind)
  const rawFileTypeTargetKinds = record.fileTypeTargetKinds
  const fileTypeTargetKinds: Record<string, DfcTargetKind> = {}
  if (rawFileTypeTargetKinds && typeof rawFileTypeTargetKinds === 'object' && !Array.isArray(rawFileTypeTargetKinds)) {
    for (const [rawKey, rawValue] of Object.entries(rawFileTypeTargetKinds as Record<string, unknown>)) {
      const key = normalizeDfcDefaultFileTypeKey(rawKey)
      const targetKind = normalizeDfcDefaultTargetKind(rawValue)
      if (key && targetKind) fileTypeTargetKinds[key] = targetKind
    }
  }
  return {
    globalTargetKind,
    fileTypeTargetKinds,
  }
}

export function normalizeDfcDefaultTargetKind(value: unknown): DfcTargetKind | null {
  const normalized = String(value ?? '').trim()
  return DFC_TARGET_KIND_SET.has(normalized) ? normalized as DfcTargetKind : null
}

export function normalizeDfcDefaultFileTypeKey(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\.+/, '')
    .replace(/[^a-z0-9_-]/g, '')
  return normalized || null
}

export function setDfcAttachmentDefaultTarget(
  current: unknown,
  input: Readonly<{
    scope: 'global' | 'file_type'
    targetKind: unknown
    fileTypeKey?: unknown
  }>,
): DfcAttachmentDefaults {
  const base = normalizeDfcAttachmentDefaults(current)
  const targetKind = normalizeDfcDefaultTargetKind(input.targetKind)
  if (!targetKind) return base
  if (input.scope === 'global') {
    return {
      ...base,
      globalTargetKind: targetKind,
    }
  }
  const key = normalizeDfcDefaultFileTypeKey(input.fileTypeKey)
  if (!key) return base
  return {
    ...base,
    fileTypeTargetKinds: {
      ...base.fileTypeTargetKinds,
      [key]: targetKind,
    },
  }
}

export function clearDfcAttachmentDefaultTarget(
  current: unknown,
  input: Readonly<{
    scope: 'global' | 'file_type'
    fileTypeKey?: unknown
  }>,
): DfcAttachmentDefaults {
  const base = normalizeDfcAttachmentDefaults(current)
  if (input.scope === 'global') {
    return {
      ...base,
      globalTargetKind: null,
    }
  }
  const key = normalizeDfcDefaultFileTypeKey(input.fileTypeKey)
  if (!key || !(key in base.fileTypeTargetKinds)) return base
  const nextFileTypeTargetKinds = { ...base.fileTypeTargetKinds }
  delete nextFileTypeTargetKinds[key]
  return {
    ...base,
    fileTypeTargetKinds: nextFileTypeTargetKinds,
  }
}
