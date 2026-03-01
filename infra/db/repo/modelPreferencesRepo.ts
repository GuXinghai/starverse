import BetterSqlite3 from 'better-sqlite3'
import type {
  ModelPrefsAddFavoriteParams,
  ModelPrefsFavoriteRecord,
  ModelPrefsListFavoritesParams,
  ModelPrefsListRecentsParams,
  ModelPrefsModelRefParams,
  ModelPrefsRecentRecord,
  ModelPrefsRecordRecentParams,
  ModelPrefsRemoveFavoriteParams,
  ModelPrefsRemoveFavoriteResult,
  ModelPrefsReorderFavoritesParams,
  ModelPrefsScopeParams,
  ModelPrefsScopeType,
} from '../../db/types'

type SqlDatabase = BetterSqlite3.Database

const MODEL_KEY_DELIMITER = '::'
const MAX_SCOPE_ID_LENGTH = 256
const DEFAULT_RECENTS_LIMIT = 50
const RECENTS_SCOPE_CAPACITY = 50

type NormalizedScope = Readonly<{
  scopeType: ModelPrefsScopeType
  scopeId: string
}>

type NormalizedModelRef = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
}>

function parseModelKey(modelKey: string): Readonly<{ providerKey: string; modelId: string }> | null {
  const index = modelKey.indexOf(MODEL_KEY_DELIMITER)
  if (index <= 0) return null
  const providerKey = modelKey.slice(0, index).trim()
  const modelId = modelKey.slice(index + MODEL_KEY_DELIMITER.length).trim()
  if (!providerKey || !modelId) return null
  return { providerKey, modelId }
}

function normalizeScope(input?: ModelPrefsScopeParams): NormalizedScope {
  const scopeType = (input?.scopeType ?? 'global') as ModelPrefsScopeType
  const rawScopeId = input?.scopeId == null ? '' : String(input.scopeId).trim()

  if (!['global', 'project', 'conversation'].includes(scopeType)) {
    throw new Error(`Invalid scopeType: ${scopeType}`)
  }
  if (rawScopeId.length > MAX_SCOPE_ID_LENGTH) {
    throw new Error(`scopeId is too long (max ${MAX_SCOPE_ID_LENGTH})`)
  }
  if (scopeType === 'global') {
    if (rawScopeId.length > 0) {
      throw new Error('global scope requires empty scopeId')
    }
    return { scopeType, scopeId: '' }
  }
  if (rawScopeId.length === 0) {
    throw new Error(`${scopeType} scope requires non-empty scopeId`)
  }
  return { scopeType, scopeId: rawScopeId }
}

function normalizeModelRef(input: ModelPrefsModelRefParams): NormalizedModelRef {
  const providerKeyRaw = typeof input.providerKey === 'string' ? input.providerKey.trim() : ''
  const modelIdRaw = typeof input.modelId === 'string' ? input.modelId.trim() : ''
  const modelKeyRaw = typeof input.modelKey === 'string' ? input.modelKey.trim() : ''
  const parsedFromModelKey = modelKeyRaw ? parseModelKey(modelKeyRaw) : null

  const providerKey = providerKeyRaw || parsedFromModelKey?.providerKey || ''
  const modelId = modelIdRaw || parsedFromModelKey?.modelId || ''

  if (!providerKey || !modelId) {
    throw new Error('model refs require modelKey or providerKey+modelId')
  }
  if (parsedFromModelKey) {
    if (parsedFromModelKey.providerKey !== providerKey || parsedFromModelKey.modelId !== modelId) {
      throw new Error('modelKey mismatch with providerKey/modelId')
    }
  }

  return {
    providerKey,
    modelId,
    modelKey: `${providerKey}${MODEL_KEY_DELIMITER}${modelId}`,
  }
}

function normalizeModelKeys(input: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const value = String(raw ?? '').trim()
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function toFavoriteRecord(row: any): ModelPrefsFavoriteRecord {
  return {
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    providerKey: row.providerKey,
    modelId: row.modelId,
    modelKey: row.modelKey,
    sortRank: row.sortRank,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
  }
}

function toRecentRecord(row: any): ModelPrefsRecentRecord {
  return {
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    providerKey: row.providerKey,
    modelId: row.modelId,
    modelKey: row.modelKey,
    lastUsedAtMs: row.lastUsedAtMs,
    useCount: row.useCount,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
  }
}

export class ModelPreferencesRepo {
  private listFavoritesStmt: BetterSqlite3.Statement
  private getFavoriteStmt: BetterSqlite3.Statement
  private upsertFavoriteStmt: BetterSqlite3.Statement
  private deleteFavoriteStmt: BetterSqlite3.Statement
  private maxFavoriteRankStmt: BetterSqlite3.Statement
  private updateFavoriteRankByModelKeyStmt: BetterSqlite3.Statement

  private listRecentsStmt: BetterSqlite3.Statement
  private getRecentStmt: BetterSqlite3.Statement
  private upsertRecentStmt: BetterSqlite3.Statement
  private pruneRecentsOverflowStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.listFavoritesStmt = this.db.prepare(`
      SELECT
        scope_type AS scopeType,
        scope_id AS scopeId,
        provider_key AS providerKey,
        model_id AS modelId,
        model_key AS modelKey,
        sort_rank AS sortRank,
        created_at_ms AS createdAtMs,
        updated_at_ms AS updatedAtMs
      FROM model_favorites
      WHERE scope_type = @scopeType
        AND scope_id = @scopeId
      ORDER BY sort_rank ASC, model_key ASC
    `)

    this.getFavoriteStmt = this.db.prepare(`
      SELECT
        scope_type AS scopeType,
        scope_id AS scopeId,
        provider_key AS providerKey,
        model_id AS modelId,
        model_key AS modelKey,
        sort_rank AS sortRank,
        created_at_ms AS createdAtMs,
        updated_at_ms AS updatedAtMs
      FROM model_favorites
      WHERE scope_type = @scopeType
        AND scope_id = @scopeId
        AND provider_key = @providerKey
        AND model_id = @modelId
      LIMIT 1
    `)

    this.upsertFavoriteStmt = this.db.prepare(`
      INSERT INTO model_favorites(
        scope_type,
        scope_id,
        provider_key,
        model_id,
        model_key,
        sort_rank,
        created_at_ms,
        updated_at_ms
      )
      VALUES(
        @scopeType,
        @scopeId,
        @providerKey,
        @modelId,
        @modelKey,
        @sortRank,
        @createdAtMs,
        @updatedAtMs
      )
      ON CONFLICT(scope_type, scope_id, provider_key, model_id) DO UPDATE SET
        model_key = excluded.model_key,
        sort_rank = excluded.sort_rank,
        updated_at_ms = excluded.updated_at_ms
    `)

    this.deleteFavoriteStmt = this.db.prepare(`
      DELETE FROM model_favorites
      WHERE scope_type = @scopeType
        AND scope_id = @scopeId
        AND provider_key = @providerKey
        AND model_id = @modelId
    `)

    this.maxFavoriteRankStmt = this.db.prepare(`
      SELECT MAX(sort_rank) AS maxRank
      FROM model_favorites
      WHERE scope_type = @scopeType
        AND scope_id = @scopeId
    `)

    this.updateFavoriteRankByModelKeyStmt = this.db.prepare(`
      UPDATE model_favorites
      SET sort_rank = @sortRank,
          updated_at_ms = @updatedAtMs
      WHERE scope_type = @scopeType
        AND scope_id = @scopeId
        AND model_key = @modelKey
    `)

    this.listRecentsStmt = this.db.prepare(`
      SELECT
        scope_type AS scopeType,
        scope_id AS scopeId,
        provider_key AS providerKey,
        model_id AS modelId,
        model_key AS modelKey,
        last_used_at_ms AS lastUsedAtMs,
        use_count AS useCount,
        created_at_ms AS createdAtMs,
        updated_at_ms AS updatedAtMs
      FROM model_recents
      WHERE scope_type = @scopeType
        AND scope_id = @scopeId
      ORDER BY last_used_at_ms DESC, model_key ASC
      LIMIT @limit
    `)

    this.getRecentStmt = this.db.prepare(`
      SELECT
        scope_type AS scopeType,
        scope_id AS scopeId,
        provider_key AS providerKey,
        model_id AS modelId,
        model_key AS modelKey,
        last_used_at_ms AS lastUsedAtMs,
        use_count AS useCount,
        created_at_ms AS createdAtMs,
        updated_at_ms AS updatedAtMs
      FROM model_recents
      WHERE scope_type = @scopeType
        AND scope_id = @scopeId
        AND provider_key = @providerKey
        AND model_id = @modelId
      LIMIT 1
    `)

    this.upsertRecentStmt = this.db.prepare(`
      INSERT INTO model_recents(
        scope_type,
        scope_id,
        provider_key,
        model_id,
        model_key,
        last_used_at_ms,
        use_count,
        created_at_ms,
        updated_at_ms
      )
      VALUES(
        @scopeType,
        @scopeId,
        @providerKey,
        @modelId,
        @modelKey,
        @lastUsedAtMs,
        1,
        @createdAtMs,
        @updatedAtMs
      )
      ON CONFLICT(scope_type, scope_id, provider_key, model_id) DO UPDATE SET
        model_key = excluded.model_key,
        last_used_at_ms = CASE
          WHEN excluded.last_used_at_ms > model_recents.last_used_at_ms
            THEN excluded.last_used_at_ms
          ELSE model_recents.last_used_at_ms
        END,
        use_count = model_recents.use_count + 1,
        updated_at_ms = excluded.updated_at_ms
    `)

    this.pruneRecentsOverflowStmt = this.db.prepare(`
      DELETE FROM model_recents
      WHERE scope_type = @scopeType
        AND scope_id = @scopeId
        AND rowid NOT IN (
          SELECT rowid
          FROM model_recents
          WHERE scope_type = @scopeType
            AND scope_id = @scopeId
          ORDER BY last_used_at_ms DESC, model_key ASC
          LIMIT @retainLimit
        )
    `)
  }

  listFavorites(input: ModelPrefsListFavoritesParams = {}): ModelPrefsFavoriteRecord[] {
    const scope = normalizeScope(input)
    const rows = this.listFavoritesStmt.all(scope) as any[]
    return rows.map(toFavoriteRecord)
  }

  addFavorite(input: ModelPrefsAddFavoriteParams): ModelPrefsFavoriteRecord {
    const scope = normalizeScope(input)
    const ref = normalizeModelRef(input)
    const nowMs = Date.now()
    const preferredRank =
      typeof input.sortRank === 'number' && Number.isFinite(input.sortRank) && input.sortRank >= 0
        ? Math.floor(input.sortRank)
        : null

    const tx = this.db.transaction(() => {
      const sortRank =
        preferredRank ??
        (() => {
          const row = this.maxFavoriteRankStmt.get(scope) as { maxRank?: number | null } | undefined
          if (typeof row?.maxRank === 'number' && Number.isFinite(row.maxRank)) return row.maxRank + 1
          return 0
        })()

      this.upsertFavoriteStmt.run({
        ...scope,
        ...ref,
        sortRank,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      })

      const row = this.getFavoriteStmt.get({
        ...scope,
        providerKey: ref.providerKey,
        modelId: ref.modelId,
      }) as any
      if (!row) {
        throw new Error('Failed to read favorite after upsert')
      }
      return toFavoriteRecord(row)
    })

    return tx()
  }

  removeFavorite(input: ModelPrefsRemoveFavoriteParams): ModelPrefsRemoveFavoriteResult {
    const scope = normalizeScope(input)
    const ref = normalizeModelRef(input)
    const result = this.deleteFavoriteStmt.run({
      ...scope,
      providerKey: ref.providerKey,
      modelId: ref.modelId,
    })
    return { removed: Number(result.changes ?? 0) }
  }

  reorderFavorites(input: ModelPrefsReorderFavoritesParams): ModelPrefsFavoriteRecord[] {
    const scope = normalizeScope(input)
    const orderedModelKeys = normalizeModelKeys(input.orderedModelKeys ?? [])
    if (orderedModelKeys.length === 0) {
      return this.listFavorites(scope)
    }

    const tx = this.db.transaction(() => {
      const existingRows = this.listFavoritesStmt.all(scope) as any[]
      const existingKeys = new Set(existingRows.map((row) => String(row.modelKey)))
      const touched = new Set<string>()
      const nowMs = Date.now()
      let nextRank = 0

      for (const modelKey of orderedModelKeys) {
        if (touched.has(modelKey)) continue
        if (!existingKeys.has(modelKey)) {
          throw new Error(`Favorite not found in scope: ${modelKey}`)
        }
        const updated = this.updateFavoriteRankByModelKeyStmt.run({
          ...scope,
          modelKey,
          sortRank: nextRank,
          updatedAtMs: nowMs,
        })
        if (!updated.changes || updated.changes <= 0) {
          throw new Error(`Failed to reorder favorite: ${modelKey}`)
        }
        touched.add(modelKey)
        nextRank += 1
      }

      for (const row of existingRows) {
        const modelKey = String(row.modelKey)
        if (!modelKey || touched.has(modelKey)) continue
        this.updateFavoriteRankByModelKeyStmt.run({
          ...scope,
          modelKey,
          sortRank: nextRank,
          updatedAtMs: nowMs,
        })
        nextRank += 1
      }
    })

    tx()
    return this.listFavorites(scope)
  }

  listRecents(input: ModelPrefsListRecentsParams = {}): ModelPrefsRecentRecord[] {
    const scope = normalizeScope(input)
    const limitRaw = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.floor(input.limit) : DEFAULT_RECENTS_LIMIT
    const limit = Math.max(1, Math.min(500, limitRaw))
    const rows = this.listRecentsStmt.all({
      ...scope,
      limit,
    }) as any[]
    return rows.map(toRecentRecord)
  }

  recordRecent(input: ModelPrefsRecordRecentParams): ModelPrefsRecentRecord {
    const scope = normalizeScope(input)
    const ref = normalizeModelRef(input)
    const nowMs = Date.now()
    const usedAtMsRaw = typeof input.usedAtMs === 'number' && Number.isFinite(input.usedAtMs) ? Math.floor(input.usedAtMs) : nowMs
    const usedAtMs = Math.max(0, usedAtMsRaw)

    const tx = this.db.transaction(() => {
      this.upsertRecentStmt.run({
        ...scope,
        ...ref,
        lastUsedAtMs: usedAtMs,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      })
      this.pruneRecentsOverflowStmt.run({
        ...scope,
        retainLimit: RECENTS_SCOPE_CAPACITY,
      })
      const row = this.getRecentStmt.get({
        ...scope,
        providerKey: ref.providerKey,
        modelId: ref.modelId,
      }) as any
      if (!row) {
        throw new Error('Failed to read recent after upsert')
      }
      return toRecentRecord(row)
    })

    return tx()
  }
}
