import type { ProviderCatalogSnapshot } from './providerCatalogContracts'
import type { CatalogScopedSnapshotWriterInput } from './providerCatalogWriterContracts'
import type { CatalogModel, JsonValue } from './internalSchema'

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function rawPayloadForModel(model: CatalogModel): JsonValue | null {
  return model.raw?.buckets?.[0]?.payload ?? model.raw ?? null
}

function toScopedModelRow(
  model: CatalogModel,
): CatalogScopedSnapshotWriterInput['models'][number] {
  return {
    modelId: model.modelId,
    modelKey: model.modelKey,
    canonicalSlug: model.canonicalSlug ?? null,
    displayName: model.displayName,
    description: model.description ?? null,
    vendor: model.vendor ?? null,
    family: model.family ?? null,
    status: model.status,
    visibility: model.visibility,
    contextLength: model.contextLength ?? null,
    maxOutputTokens: model.maxOutputTokens ?? null,
    inputModalitiesJson: safeStringify(model.inputModalities) ?? '[]',
    outputModalitiesJson: safeStringify(model.outputModalities) ?? '[]',
    supportedParametersJson: safeStringify(model.supportedParameters) ?? '[]',
    capabilitiesJson: safeStringify(model.capabilities) ?? '{}',
    pricingJson: model.pricing ? safeStringify(model.pricing) : null,
    rawJson: safeStringify(rawPayloadForModel(model)) ?? null,
    createdAtSec: model.createdAtSec ?? null,
    firstSeenAtMs: model.firstSeenAtMs,
    lastSeenAtMs: model.lastSeenAtMs,
    syncedAtMs: model.syncedAtMs,
  }
}

export function mapProviderCatalogSnapshotToScopedWriterInput(input: Readonly<{
  snapshot: ProviderCatalogSnapshot
  snapshotId: string
  schemaVersion: number
  snapshotChecksum?: string | null
  syncedAtMs?: number
}>): CatalogScopedSnapshotWriterInput {
  const snapshotChecksum = input.snapshotChecksum ?? input.snapshotId
  return {
    providerKey: input.snapshot.providerKey,
    baseUrl: input.snapshot.baseUrl,
    dataSource: input.snapshot.dataSource,
    snapshotId: input.snapshotId,
    snapshotChecksum,
    models: input.snapshot.models.map(toScopedModelRow),
    syncedAtMs: input.syncedAtMs ?? input.snapshot.fetchedAtMs,
    schemaVersion: input.schemaVersion,
  }
}
