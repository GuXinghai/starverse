import {
  sha256PreparedBytesV2,
  stableSerializeProviderRequestV2,
} from '../compiler/stableSerialize'
import type { CanonicalSourceKindV1 } from './canonicalSourceFactsV1'

export const SOURCE_PRIORITY_CONFIG_SCHEMA_VERSION_V1 = 1 as const

export const CANONICAL_SOURCE_PRIORITY_KEYS_V1 = Object.freeze([
  'provider_native',
  'models_dev',
  'capability_rule',
] as const)

export type SourcePriorityMapV1 = Readonly<Record<CanonicalSourceKindV1, number>>

export type SourcePriorityConfigV1 = Readonly<{
  schemaVersion: typeof SOURCE_PRIORITY_CONFIG_SCHEMA_VERSION_V1
  priorities: SourcePriorityMapV1
  sourcePriorityConfigRevision: string
}>

export class SourcePriorityConfigV1Error extends Error {
  constructor(readonly code: 'GENERATION_V2_SOURCE_PRIORITY_CONFIG_INVALID') {
    super(code)
    this.name = 'SourcePriorityConfigV1Error'
  }
}

const SOURCE_PRIORITY_CONFIG_REVISION = /^source-priority-config-v1:[0-9a-f]{64}$/u

function invalid(): never {
  throw new SourcePriorityConfigV1Error('GENERATION_V2_SOURCE_PRIORITY_CONFIG_INVALID')
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function canonicalizePriorities(value: unknown): SourcePriorityMapV1 {
  if (!plainObject(value) || Object.keys(value).sort().join('\0') !== [...CANONICAL_SOURCE_PRIORITY_KEYS_V1].sort().join('\0')) {
    return invalid()
  }
  const priorities = {
    provider_native: value.provider_native,
    models_dev: value.models_dev,
    capability_rule: value.capability_rule,
  }
  if (CANONICAL_SOURCE_PRIORITY_KEYS_V1.some((key) => !Number.isSafeInteger(priorities[key]))) return invalid()
  return Object.freeze(priorities as SourcePriorityMapV1)
}

function semanticValue(priorities: SourcePriorityMapV1): Readonly<{
  priorities: SourcePriorityMapV1
  schemaVersion: typeof SOURCE_PRIORITY_CONFIG_SCHEMA_VERSION_V1
}> {
  return Object.freeze({
    priorities: Object.freeze({
      provider_native: priorities.provider_native,
      models_dev: priorities.models_dev,
      capability_rule: priorities.capability_rule,
    }),
    schemaVersion: SOURCE_PRIORITY_CONFIG_SCHEMA_VERSION_V1,
  })
}

function semanticHash(semanticJson: string): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(semanticJson))
}

export function sourcePriorityConfigSemanticJsonV1(priorities: SourcePriorityMapV1): string {
  return stableSerializeProviderRequestV2(semanticValue(priorities))
}

export function sourcePriorityConfigSemanticHashV1(priorities: SourcePriorityMapV1): string {
  return semanticHash(sourcePriorityConfigSemanticJsonV1(priorities))
}

export function sourcePriorityConfigRevisionV1(priorities: SourcePriorityMapV1): string {
  return `source-priority-config-v1:${sourcePriorityConfigSemanticHashV1(priorities)}`
}

export function canonicalizeSourcePriorityMapV1(value: unknown): SourcePriorityMapV1 {
  return canonicalizePriorities(value)
}

export function buildSourcePriorityConfigV1(value: unknown): SourcePriorityConfigV1 {
  const priorities = canonicalizePriorities(value)
  return Object.freeze({
    schemaVersion: SOURCE_PRIORITY_CONFIG_SCHEMA_VERSION_V1,
    priorities,
    sourcePriorityConfigRevision: sourcePriorityConfigRevisionV1(priorities),
  })
}

export function decodeSourcePriorityConfigV1(value: unknown): SourcePriorityConfigV1 {
  if (!plainObject(value) || Object.keys(value).sort().join('\0') !==
      ['priorities', 'schemaVersion', 'sourcePriorityConfigRevision'].sort().join('\0') ||
      value.schemaVersion !== SOURCE_PRIORITY_CONFIG_SCHEMA_VERSION_V1 ||
      typeof value.sourcePriorityConfigRevision !== 'string' ||
      !SOURCE_PRIORITY_CONFIG_REVISION.test(value.sourcePriorityConfigRevision)) return invalid()
  const config = buildSourcePriorityConfigV1(value.priorities)
  if (config.sourcePriorityConfigRevision !== value.sourcePriorityConfigRevision) return invalid()
  return config
}

export const DEFAULT_SOURCE_PRIORITY_MAP_V1 = Object.freeze({
  provider_native: 3,
  models_dev: 2,
  capability_rule: 1,
}) satisfies SourcePriorityMapV1

export const DEFAULT_SOURCE_PRIORITY_CONFIG_V1 = buildSourcePriorityConfigV1(DEFAULT_SOURCE_PRIORITY_MAP_V1)

export const SOURCE_PRIORITY_CONFIG_SCHEMA_DIGEST_V1 = sha256PreparedBytesV2(new TextEncoder().encode(
  stableSerializeProviderRequestV2({
    schemaVersion: SOURCE_PRIORITY_CONFIG_SCHEMA_VERSION_V1,
    sourceKeys: CANONICAL_SOURCE_PRIORITY_KEYS_V1,
    defaultPriorities: DEFAULT_SOURCE_PRIORITY_MAP_V1,
  }),
))
