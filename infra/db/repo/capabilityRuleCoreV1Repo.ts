import BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import {
  projectCapabilityRuleOwnershipSnapshotV1,
  type CapabilityRuleOwnershipSnapshotV1,
  type CapabilityRuleOwnershipV1,
  type ProjectedCapabilityRuleOwnershipSnapshotV1,
} from '../../../src/next/generation-v2/capability-rules/capabilityRuleCoreV1'

type SnapshotRow = Readonly<{
  ownership: string
  owner_id: string
  snapshot_revision: string
  content_digest: string
  created_at_ms: number
  updated_at_ms: number
}>

type PackRow = Readonly<{
  ownership: string
  owner_id: string
  pack_id: string
  display_name: string
  description: string | null
  priority: number
  mode: string
  target: string
  pack_revision: string
  content_digest: string
  created_at_ms: number
  updated_at_ms: number
}>

type RuleRow = Readonly<{
  ownership: string
  owner_id: string
  rule_id: string
  pack_id: string
  label: string | null
  description: string | null
  priority: number
  configured: string
  provider_authority_id: string
  endpoint_profile_id: string
  selector_kind: string
  selector_values_json: string | null
  selector_pattern: string | null
  selector_positive_examples_json: string | null
  selector_negative_examples_json: string | null
  canonical_path: string
  canonical_value_json: string
  evidence_json: string | null
  rule_revision: string
  content_digest: string
  created_at_ms: number
  updated_at_ms: number
}>

export type CapabilityRuleOwnershipSnapshotFactV1 = Readonly<{
  projected: ProjectedCapabilityRuleOwnershipSnapshotV1
  createdAtMs: number
  updatedAtMs: number
}>

type PreparedPackWriteV1 = Readonly<{
  packId: string
  displayName: string
  description: string | null
  priority: number
  mode: string
  target: string
  packRevision: string
  contentDigest: string
}>

type PreparedRuleWriteV1 = Readonly<{
  ruleId: string
  packId: string
  label: string | null
  description: string | null
  priority: number
  configured: string
  providerAuthorityId: string
  endpointProfileId: string
  selectorKind: 'exact' | 'regex'
  selectorValuesJson: string | null
  selectorPattern: string | null
  selectorPositiveExamplesJson: string | null
  selectorNegativeExamplesJson: string | null
  canonicalPath: string
  canonicalValueJson: string
  evidenceJson: string | null
  ruleRevision: string
  contentDigest: string
}>

export type PreparedCapabilityRuleOwnershipSnapshotWriteV1 = Readonly<{
  projected: ProjectedCapabilityRuleOwnershipSnapshotV1
  packs: readonly PreparedPackWriteV1[]
  rules: readonly PreparedRuleWriteV1[]
}>

export class CapabilityRuleCoreV1RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RULE_CORE_REPOSITORY_INVALID'
    | 'GENERATION_V2_CAPABILITY_RULE_CORE_STALE_REVISION') {
    super(code)
    this.name = 'CapabilityRuleCoreV1RepoError'
  }
}

function repositoryInvalid(): never {
  throw new CapabilityRuleCoreV1RepoError('GENERATION_V2_CAPABILITY_RULE_CORE_REPOSITORY_INVALID')
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) repositoryInvalid()
  return value as number
}

function parseJson(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return repositoryInvalid()
  }
}

function ownership(value: unknown): CapabilityRuleOwnershipV1 {
  if (value !== 'cloud' && value !== 'user') repositoryInvalid()
  return value
}

function identity(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) {
    repositoryInvalid()
  }
  return value
}

function decodeSnapshotRow(row: SnapshotRow): Readonly<{
  ownership: CapabilityRuleOwnershipV1
  ownerId: string
  snapshotRevision: string
  contentDigest: string
  createdAtMs: number
  updatedAtMs: number
}> {
  return Object.freeze({ ownership: ownership(row.ownership), ownerId: identity(row.owner_id),
    snapshotRevision: identity(row.snapshot_revision), contentDigest: identity(row.content_digest),
    createdAtMs: safeTime(row.created_at_ms), updatedAtMs: safeTime(row.updated_at_ms) })
}

export function prepareCapabilityRuleOwnershipSnapshotWriteV1(
  snapshot: unknown,
): PreparedCapabilityRuleOwnershipSnapshotWriteV1 {
  const projected = projectCapabilityRuleOwnershipSnapshotV1(snapshot)
  const packs = projected.packs.map((entry) => Object.freeze({
    packId: entry.definition.packId,
    displayName: entry.definition.displayName,
    description: entry.definition.description,
    priority: entry.definition.priority,
    mode: entry.definition.mode,
    target: entry.definition.target,
    packRevision: entry.packRevision,
    contentDigest: entry.contentDigest,
  }))
  const rules = projected.packs.flatMap((pack) => pack.rules.map((entry) => {
    const rule = entry.definition
    return Object.freeze({
      ruleId: rule.ruleId,
      packId: pack.definition.packId,
      label: rule.label,
      description: rule.description,
      priority: rule.priority,
      configured: rule.configured,
      providerAuthorityId: rule.providerAuthorityId,
      endpointProfileId: rule.endpointProfileId,
      selectorKind: rule.selector.kind,
      selectorValuesJson: rule.selector.kind === 'exact'
        ? stableSerializeProviderRequestV2(rule.selector.nativeModelIds) : null,
      selectorPattern: rule.selector.kind === 'regex' ? rule.selector.pattern : null,
      selectorPositiveExamplesJson: rule.selector.kind === 'regex'
        ? stableSerializeProviderRequestV2(rule.selector.positiveExamples) : null,
      selectorNegativeExamplesJson: rule.selector.kind === 'regex'
        ? stableSerializeProviderRequestV2(rule.selector.negativeExamples) : null,
      canonicalPath: rule.assertion.path,
      canonicalValueJson: stableSerializeProviderRequestV2(rule.assertion.value),
      evidenceJson: rule.evidence === null ? null : stableSerializeProviderRequestV2(rule.evidence),
      ruleRevision: entry.ruleRevision,
      contentDigest: entry.contentDigest,
    })
  }))
  return Object.freeze({ projected, packs: Object.freeze(packs), rules: Object.freeze(rules) })
}

export class CapabilityRuleCoreV1Repo {
  private savepointSequence = 0

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) repositoryInvalid()
  }

  readOwnershipSnapshot(input: Readonly<{
    ownership: CapabilityRuleOwnershipV1
    ownerId: string
  }>): CapabilityRuleOwnershipSnapshotFactV1 | null {
    const ownerId = identity(input.ownerId)
    const snapshotRow = this.db.prepare(`SELECT ownership, owner_id, snapshot_revision, content_digest,
      created_at_ms, updated_at_ms FROM capability_rule_owner_snapshot_v1
      WHERE ownership = ? AND owner_id = ?`).get(input.ownership, ownerId) as SnapshotRow | undefined
    if (!snapshotRow) return null
    const snapshot = decodeSnapshotRow(snapshotRow)
    const packRows = this.db.prepare(`SELECT ownership, owner_id, pack_id, display_name, description,
      priority, mode, target, pack_revision, content_digest, created_at_ms, updated_at_ms
      FROM capability_rule_pack_core_v1 WHERE ownership = ? AND owner_id = ?
      ORDER BY pack_id`).all(input.ownership, ownerId) as PackRow[]
    const ruleRows = this.db.prepare(`SELECT ownership, owner_id, rule_id, pack_id, label, description,
      priority, configured, provider_authority_id, endpoint_profile_id, selector_kind,
      selector_values_json, selector_pattern, selector_positive_examples_json,
      selector_negative_examples_json, canonical_path, canonical_value_json, evidence_json,
      rule_revision, content_digest, created_at_ms, updated_at_ms
      FROM capability_rule_core_v1 WHERE ownership = ? AND owner_id = ?
      ORDER BY pack_id, rule_id`).all(input.ownership, ownerId) as RuleRow[]
    const rulesByPack = new Map<string, RuleRow[]>()
    for (const row of ruleRows) {
      if (row.ownership !== snapshot.ownership || row.owner_id !== snapshot.ownerId) repositoryInvalid()
      const rows = rulesByPack.get(row.pack_id) ?? []
      rows.push(row)
      rulesByPack.set(row.pack_id, rows)
    }
    const definition: CapabilityRuleOwnershipSnapshotV1 = {
      schemaVersion: 1,
      ownership: snapshot.ownership,
      ownerId: snapshot.ownerId,
      packs: packRows.map((pack) => {
        if (pack.ownership !== snapshot.ownership || pack.owner_id !== snapshot.ownerId) repositoryInvalid()
        return {
          schemaVersion: 1,
          packId: pack.pack_id,
          displayName: pack.display_name,
          description: pack.description,
          priority: pack.priority,
          mode: pack.mode as 'override',
          target: pack.target as 'enabled',
          rules: (rulesByPack.get(pack.pack_id) ?? []).map((rule) => ({
            ruleId: rule.rule_id,
            label: rule.label,
            description: rule.description,
            priority: rule.priority,
            configured: rule.configured as 'default',
            providerAuthorityId: rule.provider_authority_id,
            endpointProfileId: rule.endpoint_profile_id,
            selector: rule.selector_kind === 'exact'
              ? { kind: 'exact' as const, nativeModelIds: parseJson(rule.selector_values_json) as readonly string[] }
              : { kind: 'regex' as const, pattern: rule.selector_pattern!,
                positiveExamples: parseJson(rule.selector_positive_examples_json) as readonly string[],
                negativeExamples: parseJson(rule.selector_negative_examples_json) as readonly string[] },
            assertion: { path: rule.canonical_path as never, value: parseJson(rule.canonical_value_json) as never },
            evidence: parseJson(rule.evidence_json) as never,
          })),
        }
      }),
    }
    const projected = projectCapabilityRuleOwnershipSnapshotV1(definition)
    if (projected.snapshotRevision !== snapshot.snapshotRevision ||
        projected.contentDigest !== snapshot.contentDigest || packRows.length !== projected.packs.length) {
      repositoryInvalid()
    }
    const packById = new Map(packRows.map((row) => [row.pack_id, row]))
    const ruleById = new Map(ruleRows.map((row) => [row.rule_id, row]))
    for (const projectedPack of projected.packs) {
      const storedPack = packById.get(projectedPack.definition.packId)
      if (!storedPack || storedPack.pack_revision !== projectedPack.packRevision ||
          storedPack.content_digest !== projectedPack.contentDigest ||
          !Number.isSafeInteger(storedPack.created_at_ms) || !Number.isSafeInteger(storedPack.updated_at_ms)) {
        repositoryInvalid()
      }
      for (const projectedRule of projectedPack.rules) {
        const storedRule = ruleById.get(projectedRule.definition.ruleId)
        if (!storedRule || storedRule.pack_id !== projectedPack.definition.packId ||
            storedRule.rule_revision !== projectedRule.ruleRevision ||
            storedRule.content_digest !== projectedRule.contentDigest ||
            !Number.isSafeInteger(storedRule.created_at_ms) || !Number.isSafeInteger(storedRule.updated_at_ms)) {
          repositoryInvalid()
        }
      }
    }
    return Object.freeze({ projected, createdAtMs: snapshot.createdAtMs, updatedAtMs: snapshot.updatedAtMs })
  }

  replaceOwnershipSnapshot(input: Readonly<{
    expectedSnapshotRevision: string | null
    snapshot: unknown
  }>): CapabilityRuleOwnershipSnapshotFactV1 {
    const prepared = prepareCapabilityRuleOwnershipSnapshotWriteV1(input.snapshot)
    const projected = prepared.projected
    const run = () => {
      const currentRow = this.db.prepare(`SELECT ownership, owner_id, snapshot_revision, content_digest,
        created_at_ms, updated_at_ms FROM capability_rule_owner_snapshot_v1
        WHERE ownership = ? AND owner_id = ?`).get(
        projected.definition.ownership, projected.definition.ownerId) as SnapshotRow | undefined
      const current = currentRow ? decodeSnapshotRow(currentRow) : null
      if ((current?.snapshotRevision ?? null) !== input.expectedSnapshotRevision) {
        throw new CapabilityRuleCoreV1RepoError('GENERATION_V2_CAPABILITY_RULE_CORE_STALE_REVISION')
      }
      if (current?.snapshotRevision === projected.snapshotRevision) {
        if (current.contentDigest !== projected.contentDigest) repositoryInvalid()
        return Object.freeze({ projected, createdAtMs: current.createdAtMs, updatedAtMs: current.updatedAtMs })
      }
      const now = Math.max(safeTime(this.nowMs()), current?.updatedAtMs ?? 0)
      const createdAt = current?.createdAtMs ?? now
      this.db.prepare(`INSERT INTO capability_rule_owner_snapshot_v1 (
        ownership, owner_id, snapshot_revision, content_digest, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(ownership, owner_id) DO UPDATE SET
        snapshot_revision = excluded.snapshot_revision,
        content_digest = excluded.content_digest,
        updated_at_ms = excluded.updated_at_ms`).run(
        projected.definition.ownership, projected.definition.ownerId, projected.snapshotRevision,
        projected.contentDigest, createdAt, now)

      const upsertPack = this.db.prepare(`INSERT INTO capability_rule_pack_core_v1 (
        ownership, owner_id, pack_id, display_name, description, priority, mode, target,
        pack_revision, content_digest, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ownership, owner_id, pack_id) DO UPDATE SET
        display_name = excluded.display_name,
        description = excluded.description,
        priority = excluded.priority,
        mode = excluded.mode,
        target = excluded.target,
        pack_revision = excluded.pack_revision,
        content_digest = excluded.content_digest,
        updated_at_ms = CASE
          WHEN capability_rule_pack_core_v1.content_digest = excluded.content_digest
            THEN capability_rule_pack_core_v1.updated_at_ms
          ELSE excluded.updated_at_ms
        END`)
      const upsertRule = this.db.prepare(`INSERT INTO capability_rule_core_v1 (
        ownership, owner_id, rule_id, pack_id, label, description, priority, configured,
        provider_authority_id, endpoint_profile_id, selector_kind, selector_values_json,
        selector_pattern, selector_positive_examples_json, selector_negative_examples_json,
        canonical_path, canonical_value_json, evidence_json, rule_revision, content_digest,
        created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ownership, owner_id, rule_id) DO UPDATE SET
        pack_id = excluded.pack_id,
        label = excluded.label,
        description = excluded.description,
        priority = excluded.priority,
        configured = excluded.configured,
        provider_authority_id = excluded.provider_authority_id,
        endpoint_profile_id = excluded.endpoint_profile_id,
        selector_kind = excluded.selector_kind,
        selector_values_json = excluded.selector_values_json,
        selector_pattern = excluded.selector_pattern,
        selector_positive_examples_json = excluded.selector_positive_examples_json,
        selector_negative_examples_json = excluded.selector_negative_examples_json,
        canonical_path = excluded.canonical_path,
        canonical_value_json = excluded.canonical_value_json,
        evidence_json = excluded.evidence_json,
        rule_revision = excluded.rule_revision,
        content_digest = excluded.content_digest,
        updated_at_ms = CASE
          WHEN capability_rule_core_v1.content_digest = excluded.content_digest
            THEN capability_rule_core_v1.updated_at_ms
          ELSE excluded.updated_at_ms
        END`)
      const packCreatedAtById = new Map((this.db.prepare(`SELECT pack_id, created_at_ms
        FROM capability_rule_pack_core_v1 WHERE ownership = ? AND owner_id = ?`).all(
        projected.definition.ownership, projected.definition.ownerId) as Array<{
          pack_id: string
          created_at_ms: number
        }>).map((row) => [row.pack_id, safeTime(row.created_at_ms)]))
      const ruleCreatedAtById = new Map((this.db.prepare(`SELECT rule_id, created_at_ms
        FROM capability_rule_core_v1 WHERE ownership = ? AND owner_id = ?`).all(
        projected.definition.ownership, projected.definition.ownerId) as Array<{
          rule_id: string
          created_at_ms: number
        }>).map((row) => [row.rule_id, safeTime(row.created_at_ms)]))
      const desiredPackIds = new Set<string>()
      const desiredRuleIds = new Set<string>()
      for (const pack of prepared.packs) {
        desiredPackIds.add(pack.packId)
        upsertPack.run(projected.definition.ownership, projected.definition.ownerId, pack.packId,
          pack.displayName, pack.description, pack.priority, pack.mode, pack.target,
          pack.packRevision, pack.contentDigest, packCreatedAtById.get(pack.packId) ?? now, now)
      }
      for (const rule of prepared.rules) {
        desiredRuleIds.add(rule.ruleId)
        upsertRule.run(projected.definition.ownership, projected.definition.ownerId, rule.ruleId, rule.packId,
          rule.label, rule.description, rule.priority, rule.configured, rule.providerAuthorityId,
          rule.endpointProfileId, rule.selectorKind, rule.selectorValuesJson, rule.selectorPattern,
          rule.selectorPositiveExamplesJson, rule.selectorNegativeExamplesJson, rule.canonicalPath,
          rule.canonicalValueJson, rule.evidenceJson, rule.ruleRevision, rule.contentDigest,
          ruleCreatedAtById.get(rule.ruleId) ?? now, now)
      }
      const deleteRule = this.db.prepare(`DELETE FROM capability_rule_core_v1
        WHERE ownership = ? AND owner_id = ? AND rule_id = ?`)
      for (const ruleId of ruleCreatedAtById.keys()) {
        if (!desiredRuleIds.has(ruleId)) deleteRule.run(projected.definition.ownership,
          projected.definition.ownerId, ruleId)
      }
      const deletePack = this.db.prepare(`DELETE FROM capability_rule_pack_core_v1
        WHERE ownership = ? AND owner_id = ? AND pack_id = ?`)
      for (const packId of packCreatedAtById.keys()) {
        if (!desiredPackIds.has(packId)) deletePack.run(projected.definition.ownership,
          projected.definition.ownerId, packId)
      }
      return Object.freeze({ projected, createdAtMs: createdAt, updatedAtMs: now })
    }
    return this.runImmediate(run)
  }

  private runImmediate<T>(run: () => T): T {
    if (!this.db.inTransaction) return this.db.transaction(run).immediate()
    this.savepointSequence += 1
    const savepoint = `capability_rule_core_v1_${this.savepointSequence}`
    this.db.exec(`SAVEPOINT ${savepoint}`)
    try {
      const result = run()
      this.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
      return result
    } catch (error) {
      try {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
      } catch {
        return repositoryInvalid()
      }
      throw error
    }
  }
}
