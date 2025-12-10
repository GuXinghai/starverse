import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { DashboardPrefRecord, SaveDashboardPrefInput, DeleteDashboardPrefInput } from '../../db/types'

type SqlDatabase = BetterSqlite3.Database

export class DashboardPrefRepo {
  constructor(private db: SqlDatabase) {}

  list(userId: string): DashboardPrefRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, view_id, name, layout_json, filters_json, is_default, updated_at
         FROM user_dashboard_prefs
         WHERE user_id = ?
         ORDER BY updated_at DESC`
      )
      .all(userId) as any[]

    return rows.map(this.toRecord)
  }

  getDefault(userId: string): DashboardPrefRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, user_id, view_id, name, layout_json, filters_json, is_default, updated_at
         FROM user_dashboard_prefs
         WHERE user_id = ? AND is_default = 1
         LIMIT 1`
      )
      .get(userId) as any
    return row ? this.toRecord(row) : null
  }

  save(input: SaveDashboardPrefInput): DashboardPrefRecord {
    const id = input.id ?? randomUUID()
    const now = Date.now()

    const layoutJson = JSON.stringify(input.layout)
    const filtersJson = input.filters ? JSON.stringify(input.filters) : null

    const existing = this.db
      .prepare('SELECT id FROM user_dashboard_prefs WHERE user_id = ? AND view_id = ?')
      .get(input.userId, input.viewId) as any

    if (existing) {
      this.db
        .prepare(
          `UPDATE user_dashboard_prefs
           SET name = @name, layout_json = @layoutJson, filters_json = @filtersJson, updated_at = @updatedAt
           WHERE user_id = @userId AND view_id = @viewId`
        )
        .run({
          name: input.name,
          layoutJson,
          filtersJson,
          updatedAt: now,
          userId: input.userId,
          viewId: input.viewId
        })
    } else {
      this.db
        .prepare(
          `INSERT INTO user_dashboard_prefs(id, user_id, view_id, name, layout_json, filters_json, is_default, updated_at)
           VALUES (@id, @userId, @viewId, @name, @layoutJson, @filtersJson, @isDefault, @updatedAt)`
        )
        .run({
          id,
          userId: input.userId,
          viewId: input.viewId,
          name: input.name,
          layoutJson,
          filtersJson,
          isDefault: input.isDefault ? 1 : 0,
          updatedAt: now
        })
    }

    if (input.isDefault) {
      this.setDefault({ userId: input.userId, viewId: input.viewId })
    }

    return this.toRecord({
      id,
      user_id: input.userId,
      view_id: input.viewId,
      name: input.name,
      layout_json: layoutJson,
      filters_json: filtersJson,
      is_default: input.isDefault ? 1 : 0,
      updated_at: now
    })
  }

  delete(input: DeleteDashboardPrefInput): { deleted: number } {
    const res = this.db
      .prepare('DELETE FROM user_dashboard_prefs WHERE user_id = ? AND view_id = ?')
      .run(input.userId, input.viewId)
    return { deleted: res.changes ?? 0 }
  }

  setDefault(input: { userId: string; viewId: string }): { ok: boolean } {
    const txn = this.db.transaction(() => {
      this.db
        .prepare('UPDATE user_dashboard_prefs SET is_default = 0 WHERE user_id = ?')
        .run(input.userId)
      this.db
        .prepare('UPDATE user_dashboard_prefs SET is_default = 1 WHERE user_id = ? AND view_id = ?')
        .run(input.userId, input.viewId)
    })
    txn()
    return { ok: true }
  }

  private toRecord(row: any): DashboardPrefRecord {
    return {
      id: row.id,
      userId: row.user_id,
      viewId: row.view_id,
      name: row.name,
      layout: JSON.parse(row.layout_json),
      filters: row.filters_json ? JSON.parse(row.filters_json) : null,
      isDefault: Boolean(row.is_default),
      updatedAt: row.updated_at
    }
  }
}
