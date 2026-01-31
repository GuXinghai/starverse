import type BetterSqlite3 from 'better-sqlite3'

type SqlDatabase = BetterSqlite3.Database

function tableExists(db: SqlDatabase, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=@name LIMIT 1")
    .get({ name }) as { 1?: number } | undefined
  return !!row
}

function ensureSearchDocsTable(db: SqlDatabase) {
  if (!tableExists(db, 'search_docs')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS search_docs (
        doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        project_id TEXT,
        convo_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'text',
        extra_json TEXT
      );
    `)
    return
  }
}

function ensureSearchFtsTable(db: SqlDatabase) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS search_fts
    USING fts5(
      title,
      body,
      tokenize='unicode61'
    );
  `)
}

function ensureSearchIndexes(db: SqlDatabase) {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_search_docs_entity ON search_docs(entity_type, entity_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_search_docs_project_time ON search_docs(project_id, created_at);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_search_docs_convo_time ON search_docs(convo_id, created_at);`)
}

export function ensureSearchSchema(db: SqlDatabase) {
  const txn = db.transaction(() => {
    ensureSearchDocsTable(db)
    ensureSearchFtsTable(db)
    ensureSearchIndexes(db)
  })
  txn()
}
