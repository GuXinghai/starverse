import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const compatibleTables = [
  'compatible_provider_instances',
  'compatible_endpoint_revisions',
  'compatible_credential_descriptors',
  'compatible_request_profiles',
  'compatible_request_field_mappings',
  'compatible_response_profiles',
  'compatible_reasoning_mappings',
  'compatible_inline_policies',
  'compatible_model_records',
  'compatible_catalog_snapshots',
  'compatible_catalog_sync_state',
  'compatible_discovered_fields',
  'compatible_route_provenance',
  'compatible_route_choices',
  'compatible_tool_calls',
  'compatible_tool_results',
  'compatible_raw_extension_records',
  'compatible_reasoning_choice_state',
  'compatible_choice_display_projections',
] as const

function openFreshDatabase() {
  const db = new BetterSqlite3(':memory:')
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
  return db
}

function insertCanonicalFixture(db: BetterSqlite3.Database) {
  db.prepare(`
    INSERT INTO compatible_provider_instances (
      provider_instance_id, protocol_key, display_name, status, created_at_ms, updated_at_ms, deleted_at_ms
    ) VALUES (?, 'openai_chat_compatible', ?, 'active', 1, 1, NULL)
  `).run('ocp_provider_12345678', 'Example')
  db.prepare(`
    INSERT INTO compatible_credential_descriptors (
      credential_version_ref, provider_instance_id, version, auth_mode, backend, masked_summary_json, created_at_ms, deleted_at_ms
    ) VALUES (?, ?, 1, 'bearer', 'electron_safe_storage', ?, 1, NULL)
  `).run('ocp_credential_12345678', 'ocp_provider_12345678', JSON.stringify({ schemaVersion: 1, configured: true }))
  db.prepare(`
    INSERT INTO compatible_request_profiles (
      request_profile_id, version, schema_version, config_json, created_at_ms
    ) VALUES (?, 1, 1, ?, 1)
  `).run('ocp_request_profile_12345678', '{}')
  db.prepare(`
    INSERT INTO compatible_reasoning_mappings (
      mapping_id, version, mode, schema_version, config_json, created_at_ms
    ) VALUES (?, 1, 'custom_only', 1, ?, 1)
  `).run('ocp_reasoning_mapping_12345678', '{}')
  db.prepare(`
    INSERT INTO compatible_inline_policies (
      inline_policy_id, version, schema_version, config_json, created_at_ms
    ) VALUES (?, 1, 1, ?, 1)
  `).run('ocp_inline_policy_12345678', '{}')
  db.prepare(`
    INSERT INTO compatible_response_profiles (
      response_profile_id, version, schema_version,
      reasoning_mapping_id, reasoning_mapping_version,
      inline_policy_id, inline_policy_version,
      config_json, created_at_ms
    ) VALUES (?, 1, 1, ?, 1, ?, 1, ?, 1)
  `).run(
    'ocp_response_profile_12345678',
    'ocp_reasoning_mapping_12345678',
    'ocp_inline_policy_12345678',
    '{}',
  )
  db.prepare(`
    INSERT INTO compatible_endpoint_revisions (
      endpoint_revision_id, provider_instance_id, revision, base_url, allow_insecure_http, security_policy,
      auth_mode, credential_version_ref, auth_config_json,
      ordinary_headers_json, sensitive_header_refs_json, query_json,
      request_profile_id, request_profile_version,
      response_profile_id, response_profile_version, created_at_ms
    ) VALUES (?, ?, 1, 'https://api.example.test/v1', 0, 'compatibility_first', 'bearer', ?, ?, '[]', '[]', '[]', ?, 1, ?, 1, 1)
  `).run(
    'ocp_endpoint_12345678',
    'ocp_provider_12345678',
    'ocp_credential_12345678',
    JSON.stringify({ mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' }),
    'ocp_request_profile_12345678',
    'ocp_response_profile_12345678',
  )
}

describe('OpenAI Chat Completions-compatible fresh schema', () => {
  it('creates the complete compatible object set from schema.sql', () => {
    const db = openFreshDatabase()
    try {
      const tables = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name),
      )
      for (const table of compatibleTables) expect(tables.has(table), table).toBe(true)

      const triggers = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as Array<{ name: string }>).map((row) => row.name),
      )
      for (const trigger of [
        'trg_compatible_endpoint_revision_immutable',
        'trg_compatible_request_profile_immutable',
        'trg_compatible_response_profile_immutable',
        'trg_compatible_route_provenance_pin_immutable',
        'trg_compatible_route_initial_state',
        'trg_compatible_route_request_message_valid',
        'trg_compatible_route_pin_consistent',
        'trg_compatible_route_state_transition',
        'trg_compatible_route_choice_message_valid',
      ]) expect(triggers.has(trigger), trigger).toBe(true)
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    } finally {
      db.close()
    }
  })

  it('enforces canonical protocol, scoped revision identity, immutable versions and FK restrictions', () => {
    const db = openFreshDatabase()
    try {
      expect(() => db.prepare(`
        INSERT INTO compatible_provider_instances (
          provider_instance_id, protocol_key, display_name, status, created_at_ms, updated_at_ms
        ) VALUES ('ocp_provider_invalid1', 'generic', 'Wrong', 'active', 1, 1)
      `).run()).toThrow()

      insertCanonicalFixture(db)

      expect(() => db.prepare(`
        UPDATE compatible_endpoint_revisions SET base_url = 'https://other.example.test/v1'
        WHERE endpoint_revision_id = 'ocp_endpoint_12345678'
      `).run()).toThrow(/immutable/i)
      expect(() => db.prepare(`
        UPDATE compatible_request_profiles SET config_json = '{}'
        WHERE request_profile_id = 'ocp_request_profile_12345678' AND version = 1
      `).run()).toThrow(/immutable/i)
      expect(() => db.prepare(`
        DELETE FROM compatible_request_profiles
        WHERE request_profile_id = 'ocp_request_profile_12345678' AND version = 1
      `).run()).toThrow(/foreign key/i)
      expect(() => db.prepare(`
        INSERT INTO compatible_endpoint_revisions (
          endpoint_revision_id, provider_instance_id, revision, base_url, allow_insecure_http, security_policy,
          auth_mode, credential_version_ref, auth_config_json,
          ordinary_headers_json, sensitive_header_refs_json, query_json,
          request_profile_id, request_profile_version,
          response_profile_id, response_profile_version, created_at_ms
        ) VALUES ('ocp_endpoint_abcdefgh', 'ocp_provider_12345678', 1, 'https://other.example.test/v1', 0,
          'compatibility_first', 'bearer', 'ocp_credential_12345678', '{}', '[]', '[]', '[]',
          'ocp_request_profile_12345678', 1, 'ocp_response_profile_12345678', 1, 1)
      `).run()).toThrow(/unique/i)
    } finally {
      db.close()
    }
  })

  it('keeps remote and manual source records independent for one stable provider/model identity', () => {
    const db = openFreshDatabase()
    try {
      insertCanonicalFixture(db)
      db.prepare(`
        INSERT INTO compatible_catalog_snapshots (
          snapshot_id, provider_instance_id, snapshot_sequence, observed_at_ms, model_count, checksum, metadata_json
        ) VALUES (?, ?, 1, 10, 1, NULL, NULL)
      `).run('ocp_catalog_snapshot_12345678', 'ocp_provider_12345678')
      const insert = db.prepare(`
        INSERT INTO compatible_model_records (
          provider_instance_id, model_id, source, record_state, snapshot_id, metadata_json, created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, 'active', ?, ?, 10, 10)
      `)
      insert.run('ocp_provider_12345678', 'same-model', 'remote_sync', 'ocp_catalog_snapshot_12345678', '{}')
      insert.run('ocp_provider_12345678', 'same-model', 'manual', null, '{}')

      const rows = db.prepare(`
        SELECT source FROM compatible_model_records
        WHERE provider_instance_id = ? AND model_id = ? ORDER BY source
      `).all('ocp_provider_12345678', 'same-model') as Array<{ source: string }>
      expect(rows.map((row) => row.source)).toEqual(['manual', 'remote_sync'])
      expect(() => insert.run('ocp_provider_12345678', 'same-model', 'manual', null, '{}')).toThrow(/unique/i)
    } finally {
      db.close()
    }
  })

  it('binds immutable route provenance and every choice to persisted messages', () => {
    const db = openFreshDatabase()
    try {
      insertCanonicalFixture(db)
      db.prepare(`INSERT INTO convo (id, title, created_at, updated_at) VALUES ('c1', 'Chat', 1, 1)`).run()
      db.prepare(`
        INSERT INTO message (id, convo_id, role, created_at, seq, status)
        VALUES ('u1', 'c1', 'user', 1, 1, 'final'), ('a1', 'c1', 'assistant', 2, 2, 'streaming')
      `).run()
      const insertRoute = db.prepare(`
        INSERT INTO compatible_route_provenance (
          route_provenance_id, request_id, request_message_id, protocol_key, provider_instance_id, model_id,
          endpoint_revision_id, credential_version_ref,
          request_profile_id, request_profile_version,
          response_profile_id, response_profile_version,
          reasoning_mapping_id, reasoning_mapping_version, reasoning_mode,
          inline_policy_id, inline_policy_version, state, created_at_ms, updated_at_ms, terminal_at_ms
        ) VALUES (?, ?, 'u1', 'openai_chat_compatible', 'ocp_provider_12345678', 'same-model',
          'ocp_endpoint_12345678', ?,
          'ocp_request_profile_12345678', 1,
          'ocp_response_profile_12345678', 1,
          'ocp_reasoning_mapping_12345678', 1, 'custom_only',
          'ocp_inline_policy_12345678', 1, 'prepared', 2, 2, NULL)
      `)
      expect(() => insertRoute.run('ocp_route_drift0001', 'request-drift', null)).toThrow(/inconsistent/i)
      insertRoute.run('ocp_route_12345678', 'request-1', 'ocp_credential_12345678')
      db.prepare(`
        INSERT INTO compatible_route_choices (route_provenance_id, choice_index, message_id, created_at_ms)
        VALUES ('ocp_route_12345678', 0, 'a1', 2)
      `).run()

      expect(() => insertRoute.run('ocp_route_abcdefgh', 'request-1', 'ocp_credential_12345678')).toThrow(/unique/i)
      expect(() => db.prepare(`
        UPDATE compatible_route_provenance SET model_id = 'other'
        WHERE route_provenance_id = 'ocp_route_12345678'
      `).run()).toThrow(/immutable/i)
      db.prepare(`
        UPDATE compatible_provider_instances
        SET status = 'deleted', deleted_at_ms = 3, updated_at_ms = 3
        WHERE provider_instance_id = 'ocp_provider_12345678'
      `).run()
      expect(db.prepare(`SELECT COUNT(*) AS count FROM compatible_route_provenance`).get()).toEqual({ count: 1 })
      db.prepare(`DELETE FROM convo WHERE id = 'c1'`).run()
      expect(db.prepare(`SELECT COUNT(*) AS count FROM compatible_route_provenance`).get()).toEqual({ count: 0 })
    } finally {
      db.close()
    }
  })

  it('has no second compatible DDL path in runtime or migrations', () => {
    const runtime = readFileSync(path.resolve(process.cwd(), 'infra', 'db', 'worker', 'runtime.ts'), 'utf8')
    expect(runtime).not.toMatch(/CREATE\s+TABLE[^;]*compatible_/i)
    expect(runtime).not.toMatch(/ensure(?:OpenAIChat)?Compatible/i)
  })
})
