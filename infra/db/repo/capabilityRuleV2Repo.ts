import type BetterSqlite3 from 'better-sqlite3'
import {
  decodeCapabilityRuleDefinitionV2,
  decodeCapabilityRulePackDefinitionV2,
  matchesCapabilityRuleIdentityV2,
  projectCapabilityRulePackContentV2,
  projectCapabilityRulesV2,
  type CapabilityRuleIdentityV2,
  type CapabilityRuleOwnerKindV2,
  type CapabilityRulePackDefinitionV2,
  type CapabilityRuleProjectionV2,
  type PersistedCapabilityRuleV2,
} from '../../../src/next/generation-v2/capability-rules/capabilityRuleV2'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'

type PackRow = {
  owner_kind: unknown; pack_id: unknown; owner_id: unknown; pack_version: unknown
  pack_revision: unknown; content_digest: unknown; enabled: unknown
  installed_at_ms: unknown; updated_at_ms: unknown
}

type RuleRow = PackRow & {
  rule_id: unknown; provider_id: unknown; endpoint_profile_id: unknown; selector_kind: unknown
  selector_values_json: unknown; selector_pattern: unknown
  selector_positive_examples_json: unknown; selector_negative_examples_json: unknown
  semantic_path: unknown; capability_state: unknown; domain_json: unknown; constraints_json: unknown
  default_value_json: unknown; priority: unknown; rule_enabled: unknown; evidence_source_ref: unknown
  evidence_kind: unknown; evidence_note: unknown; identity_evidence_kind: unknown; identity_evidence_source_ref: unknown
  provenance_url: unknown; verified_at: unknown; rule_content_digest: unknown; rule_revision: unknown
  created_at_ms: unknown; rule_updated_at_ms: unknown
}

export type CapabilityRulePackRepositoryFactV2 = Readonly<{
  ownerKind: CapabilityRuleOwnerKindV2
  packId: string
  ownerId: string
  packVersion: number
  packRevision: string
  contentDigest: string
  enabled: boolean
  installedAtMs: number
  updatedAtMs: number
}>

export class CapabilityRuleV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RULE_REPOSITORY_INVALID'
    | 'GENERATION_V2_CAPABILITY_RULE_BUILTIN_DOWNGRADE'
    | 'GENERATION_V2_CAPABILITY_RULE_VERSION_COLLISION') {
    super(code)
    this.name = 'CapabilityRuleV2RepoError'
  }
}

function repositoryInvalid(): never {
  throw new CapabilityRuleV2RepoError('GENERATION_V2_CAPABILITY_RULE_REPOSITORY_INVALID')
}

function safeTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return repositoryInvalid()
  return value
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string' || value.length > 1024 * 1024) return repositoryInvalid()
  try { return JSON.parse(value) } catch { return repositoryInvalid() }
}

function parseOptionalJson(value: unknown): unknown | undefined {
  if (value === null) return undefined
  return parseJson(value)
}

function decodePackRow(row: PackRow): CapabilityRulePackRepositoryFactV2 {
  if ((row.owner_kind !== 'built_in' && row.owner_kind !== 'user') || typeof row.pack_id !== 'string' ||
      typeof row.owner_id !== 'string' || !Number.isSafeInteger(row.pack_version) || (row.pack_version as number) < 1 ||
      typeof row.pack_revision !== 'string' || !/^capability-rule-pack-v2:[0-9a-f]{64}$/u.test(row.pack_revision) ||
      typeof row.content_digest !== 'string' || !/^[0-9a-f]{64}$/u.test(row.content_digest) ||
      (row.enabled !== 0 && row.enabled !== 1) || !Number.isSafeInteger(row.installed_at_ms) ||
      !Number.isSafeInteger(row.updated_at_ms) || (row.installed_at_ms as number) < 0 ||
      (row.updated_at_ms as number) < (row.installed_at_ms as number) ||
      row.pack_revision !== `capability-rule-pack-v2:${row.content_digest}`) repositoryInvalid()
  return Object.freeze({ ownerKind: row.owner_kind, packId: row.pack_id, ownerId: row.owner_id,
    packVersion: row.pack_version as number, packRevision: row.pack_revision, contentDigest: row.content_digest,
    enabled: row.enabled === 1, installedAtMs: row.installed_at_ms as number, updatedAtMs: row.updated_at_ms as number })
}

function decodeRuleRow(row: RuleRow): PersistedCapabilityRuleV2 {
  const pack = decodePackRow(row)
  if (typeof row.rule_id !== 'string' || typeof row.provider_id !== 'string' ||
      typeof row.endpoint_profile_id !== 'string' ||
      (row.selector_kind !== 'exact' && row.selector_kind !== 'regex') ||
      typeof row.semantic_path !== 'string' ||
      typeof row.capability_state !== 'string' || !Number.isSafeInteger(row.priority) ||
      (row.rule_enabled !== 0 && row.rule_enabled !== 1) || typeof row.evidence_source_ref !== 'string' ||
      (row.provenance_url !== null && typeof row.provenance_url !== 'string') || typeof row.verified_at !== 'string' ||
      typeof row.rule_content_digest !== 'string' || !/^[0-9a-f]{64}$/u.test(row.rule_content_digest) ||
      typeof row.rule_revision !== 'string' || row.rule_revision !== `capability-rule-v2:${row.rule_content_digest}` ||
      !Number.isSafeInteger(row.created_at_ms) || !Number.isSafeInteger(row.rule_updated_at_ms) ||
      (row.created_at_ms as number) < 0 || (row.rule_updated_at_ms as number) < (row.created_at_ms as number)) repositoryInvalid()
  const definition = decodeCapabilityRuleDefinitionV2({
    ruleId: row.rule_id, providerId: row.provider_id, endpointProfileId: row.endpoint_profile_id,
    selector: row.selector_kind === 'exact'
      ? { kind: 'exact', values: parseJson(row.selector_values_json) }
      : { kind: 'regex', value: row.selector_pattern,
        positiveExamples: parseJson(row.selector_positive_examples_json),
        negativeExamples: parseJson(row.selector_negative_examples_json) },
    semanticPath: row.semantic_path, state: row.capability_state,
    ...(row.domain_json === null ? {} : { domain: parseJson(row.domain_json) }),
    ...(row.default_value_json === null ? {} : { defaultValue: parseOptionalJson(row.default_value_json) }),
    constraints: parseJson(row.constraints_json), priority: row.priority, enabled: row.rule_enabled === 1,
    evidenceSourceRef: row.evidence_source_ref, evidenceKind: row.evidence_kind,
    evidenceNote: row.evidence_note, identityEvidenceKind: row.identity_evidence_kind,
    identityEvidenceSourceRef: row.identity_evidence_source_ref,
    provenanceUrl: row.provenance_url, verifiedAt: row.verified_at,
  })
  const projected = projectCapabilityRulePackContentV2({ schemaVersion: 1, ownerKind: pack.ownerKind,
    ownerId: pack.ownerId, packId: pack.packId, packVersion: pack.packVersion, enabled: pack.enabled,
    rules: [definition] })
  const expectedRule = projected.rules[0]
  if (!expectedRule || expectedRule.contentDigest !== row.rule_content_digest) repositoryInvalid()
  return Object.freeze({ ...definition, ownerKind: pack.ownerKind, ownerId: pack.ownerId,
    packId: pack.packId, packVersion: pack.packVersion, packRevision: pack.packRevision,
    packEnabled: pack.enabled, ruleRevision: row.rule_revision, contentDigest: row.rule_content_digest })
}

export class CapabilityRuleV2Repo {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) repositoryInvalid()
  }

  installBuiltInPacks(packs: readonly CapabilityRulePackDefinitionV2[]): readonly CapabilityRulePackRepositoryFactV2[] {
    const decoded = packs.map(decodeCapabilityRulePackDefinitionV2)
    const naturalKeys = decoded.flatMap((pack) => pack.rules.flatMap((rule) => rule.selector.kind === 'exact'
      ? rule.selector.values.map((nativeModelId) => [rule.providerId, rule.endpointProfileId,
        'exact', nativeModelId, rule.semanticPath].join('\0'))
      : [[rule.providerId, rule.endpointProfileId, 'regex', rule.selector.value,
        rule.semanticPath].join('\0')]))
    if (decoded.some((pack) => pack.ownerKind !== 'built_in') ||
        new Set(decoded.map((pack) => pack.packId)).size !== decoded.length ||
        new Set(naturalKeys).size !== naturalKeys.length) repositoryInvalid()
    const run = () => {
      if (decoded.length === 0) {
        this.db.prepare("DELETE FROM capability_rule_pack_v2 WHERE owner_kind = 'built_in'").run()
      } else {
        const placeholders = decoded.map(() => '?').join(', ')
        this.db.prepare(`DELETE FROM capability_rule_pack_v2 WHERE owner_kind = 'built_in'
          AND pack_id NOT IN (${placeholders})`).run(...decoded.map((pack) => pack.packId))
      }
      return Object.freeze(decoded.map((pack) => this.installPack(pack, true)))
    }
    return this.db.inTransaction ? run() : this.db.transaction(run).immediate()
  }

  replaceUserPack(value: unknown): CapabilityRulePackRepositoryFactV2 {
    const pack = decodeCapabilityRulePackDefinitionV2(value)
    if (pack.ownerKind !== 'user') repositoryInvalid()
    const run = () => this.installPack(pack, false)
    return this.db.inTransaction ? run() : this.db.transaction(run).immediate()
  }

  listPacks(ownerKind?: CapabilityRuleOwnerKindV2): readonly CapabilityRulePackRepositoryFactV2[] {
    const rows = (ownerKind === undefined
      ? this.db.prepare(`SELECT owner_kind, pack_id, owner_id, pack_version, pack_revision, content_digest,
          enabled, installed_at_ms, updated_at_ms FROM capability_rule_pack_v2 ORDER BY owner_kind, pack_id`).all()
      : this.db.prepare(`SELECT owner_kind, pack_id, owner_id, pack_version, pack_revision, content_digest,
          enabled, installed_at_ms, updated_at_ms FROM capability_rule_pack_v2
          WHERE owner_kind = ? ORDER BY pack_id`).all(ownerKind)) as PackRow[]
    return Object.freeze(rows.map(decodePackRow))
  }

  resolveForIdentity(input: Readonly<{
    providerId: string
    endpointProfileId: string
    nativeModelId: string
  }>): CapabilityRuleProjectionV2 {
    return projectCapabilityRulesV2({ identity: input,
      matchingRules: this.listMatchingRulesForIdentity(input) })
  }

  listAllRulesForSourceSnapshot(): readonly PersistedCapabilityRuleV2[] {
    const rows = this.db.prepare(`SELECT
      p.owner_kind, p.pack_id, p.owner_id, p.pack_version, p.pack_revision, p.content_digest,
      p.enabled, p.installed_at_ms, p.updated_at_ms,
      r.rule_id, r.provider_id, r.endpoint_profile_id, r.selector_kind, r.selector_values_json,
      r.selector_pattern,
      r.selector_positive_examples_json, r.selector_negative_examples_json, r.semantic_path,
      r.capability_state, r.domain_json, r.constraints_json, r.default_value_json, r.priority,
      r.enabled AS rule_enabled, r.evidence_source_ref, r.evidence_kind, r.evidence_note,
      r.identity_evidence_kind, r.identity_evidence_source_ref, r.provenance_url, r.verified_at,
      r.content_digest AS rule_content_digest, r.rule_revision, r.created_at_ms,
      r.updated_at_ms AS rule_updated_at_ms
      FROM capability_rule_v2 r
      JOIN capability_rule_pack_v2 p ON p.owner_kind = r.owner_kind AND p.pack_id = r.pack_id
      ORDER BY p.owner_kind, p.pack_id, r.rule_id`).all() as RuleRow[]
    return Object.freeze(rows.map(decodeRuleRow))
  }

  listMatchingRulesForIdentity(input: CapabilityRuleIdentityV2): readonly PersistedCapabilityRuleV2[] {
    const rows = this.db.prepare(`SELECT
      p.owner_kind, p.pack_id, p.owner_id, p.pack_version, p.pack_revision, p.content_digest,
      p.enabled, p.installed_at_ms, p.updated_at_ms,
      r.rule_id, r.provider_id, r.endpoint_profile_id, r.selector_kind, r.selector_values_json,
      r.selector_pattern,
      r.selector_positive_examples_json, r.selector_negative_examples_json, r.semantic_path,
      r.capability_state, r.domain_json, r.constraints_json, r.default_value_json, r.priority,
      r.enabled AS rule_enabled, r.evidence_source_ref, r.evidence_kind, r.evidence_note,
      r.identity_evidence_kind, r.identity_evidence_source_ref, r.provenance_url, r.verified_at,
      r.content_digest AS rule_content_digest, r.rule_revision, r.created_at_ms,
      r.updated_at_ms AS rule_updated_at_ms
      FROM capability_rule_v2 r
      JOIN capability_rule_pack_v2 p ON p.owner_kind = r.owner_kind AND p.pack_id = r.pack_id
      WHERE r.provider_id = ? AND r.endpoint_profile_id = ?
      ORDER BY p.owner_kind, p.pack_id, r.rule_id`).all(
      input.providerId, input.endpointProfileId,
    ) as RuleRow[]
    return Object.freeze(rows.map(decodeRuleRow)
      .filter((rule) => rule.enabled && rule.packEnabled && matchesCapabilityRuleIdentityV2(rule, input)))
  }

  private installPack(
    pack: CapabilityRulePackDefinitionV2,
    rejectDowngrade: boolean,
  ): CapabilityRulePackRepositoryFactV2 {
    const projected = projectCapabilityRulePackContentV2(pack)
    const currentRow = this.db.prepare(`SELECT owner_kind, pack_id, owner_id, pack_version, pack_revision,
      content_digest, enabled, installed_at_ms, updated_at_ms FROM capability_rule_pack_v2
      WHERE owner_kind = ? AND pack_id = ?`).get(pack.ownerKind, pack.packId) as PackRow | undefined
    const current = currentRow ? decodePackRow(currentRow) : null
    if (current && current.ownerId !== pack.ownerId) {
      throw new CapabilityRuleV2RepoError('GENERATION_V2_CAPABILITY_RULE_VERSION_COLLISION')
    }
    if (current && current.packVersion > pack.packVersion && rejectDowngrade) {
      throw new CapabilityRuleV2RepoError('GENERATION_V2_CAPABILITY_RULE_BUILTIN_DOWNGRADE')
    }
    if (current && current.packVersion === pack.packVersion) {
      if (current.contentDigest !== projected.contentDigest || current.ownerId !== pack.ownerId ||
          current.enabled !== pack.enabled) {
        throw new CapabilityRuleV2RepoError('GENERATION_V2_CAPABILITY_RULE_VERSION_COLLISION')
      }
      return current
    }
    const now = Math.max(safeTime(this.nowMs()), current?.updatedAtMs ?? 0)
    const installedAt = current?.installedAtMs ?? now
    this.db.prepare(`INSERT INTO capability_rule_pack_v2 (
      owner_kind, pack_id, owner_id, pack_version, pack_revision, content_digest, enabled,
      installed_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_kind, pack_id) DO UPDATE SET
      pack_version = excluded.pack_version,
      pack_revision = excluded.pack_revision,
      content_digest = excluded.content_digest,
      enabled = excluded.enabled,
      updated_at_ms = excluded.updated_at_ms`).run(
      pack.ownerKind, pack.packId, pack.ownerId, pack.packVersion, projected.packRevision,
      projected.contentDigest, pack.enabled ? 1 : 0, installedAt, now,
    )
    this.db.prepare('DELETE FROM capability_rule_v2 WHERE owner_kind = ? AND pack_id = ?')
      .run(pack.ownerKind, pack.packId)
    const insert = this.db.prepare(`INSERT INTO capability_rule_v2 (
      owner_kind, pack_id, rule_id, provider_id, endpoint_profile_id, selector_kind,
      selector_values_json, selector_pattern,
      selector_positive_examples_json, selector_negative_examples_json,
      semantic_path, capability_state, domain_json, constraints_json, default_value_json,
      priority, enabled, evidence_source_ref, evidence_kind, evidence_note, identity_evidence_kind,
      identity_evidence_source_ref, provenance_url, verified_at, content_digest,
      rule_revision, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const entry of projected.rules) {
      const rule = entry.definition
      insert.run(pack.ownerKind, pack.packId, rule.ruleId, rule.providerId, rule.endpointProfileId,
        rule.selector.kind,
        rule.selector.kind === 'exact' ? stableSerializeProviderRequestV2(rule.selector.values) : null,
        rule.selector.kind === 'regex' ? rule.selector.value : null,
        rule.selector.kind === 'regex' ? stableSerializeProviderRequestV2(rule.selector.positiveExamples) : null,
        rule.selector.kind === 'regex' ? stableSerializeProviderRequestV2(rule.selector.negativeExamples) : null,
        rule.semanticPath, rule.state,
        rule.domain === undefined ? null : stableSerializeProviderRequestV2(rule.domain),
        stableSerializeProviderRequestV2(rule.constraints),
        rule.defaultValue === undefined ? null : stableSerializeProviderRequestV2(rule.defaultValue),
        rule.priority, rule.enabled ? 1 : 0, rule.evidenceSourceRef, rule.evidenceKind, rule.evidenceNote,
        rule.identityEvidenceKind, rule.identityEvidenceSourceRef, rule.provenanceUrl,
        rule.verifiedAt, entry.contentDigest, entry.ruleRevision, now, now)
    }
    const installed = this.db.prepare(`SELECT owner_kind, pack_id, owner_id, pack_version, pack_revision,
      content_digest, enabled, installed_at_ms, updated_at_ms FROM capability_rule_pack_v2
      WHERE owner_kind = ? AND pack_id = ?`).get(pack.ownerKind, pack.packId) as PackRow | undefined
    return installed ? decodePackRow(installed) : repositoryInvalid()
  }
}
