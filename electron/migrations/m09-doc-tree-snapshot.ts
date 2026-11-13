import type Database from 'better-sqlite3'
import type { MigrationImplementation, SchemaReader } from './registry'

/**
 * 资料树快照的存储形态（ADR-0029 / S2）。与 `plot_tree_snapshot` 同一列族：
 * `project_core` 加一列存当前资料树 JSON，迁移只改结构，不写任何作者数据。
 * 旧库走 M00 时若已补过这一列，本步跳过（幂等），所以必须查 `PRAGMA table_info`
 * 而不是直接 `ALTER TABLE`。
 */
export const M09_DOC_TREE_COLUMN = 'doc_tree_snapshot'

const ADD_DOC_TREE_COLUMN_SQL =
  `ALTER TABLE project_core ADD COLUMN ${M09_DOC_TREE_COLUMN} TEXT NOT NULL DEFAULT ''`

function projectCoreColumns(db: Database.Database): Set<string> {
  return new Set((db.prepare('PRAGMA table_info(project_core)').all() as Array<{ name: string }>)
    .map(column => column.name))
}

/** The central schema runner owns this transaction and PRAGMA user_version. */
export function applyM09DocTreeSnapshot(db: Database.Database): void {
  if (!db.inTransaction) throw new Error('DOC_TREE_MIGRATION_TRANSACTION_REQUIRED')
  const columns = projectCoreColumns(db)
  if (!columns.has('id')) throw new Error('DOC_TREE_PROJECT_CORE_MISSING')
  if (columns.has(M09_DOC_TREE_COLUMN)) return
  db.exec(ADD_DOC_TREE_COLUMN_SQL)
}

export function verifyM09DocTreeSnapshot(db: Database.Database): boolean {
  try {
    const column = (db.prepare('PRAGMA table_info(project_core)').all() as Array<{
      name: string
      type: string
      notnull: number
      dflt_value: string | null
    }>).find(candidate => candidate.name === M09_DOC_TREE_COLUMN)
    return Boolean(column)
      && column!.type === 'TEXT'
      && column!.notnull === 1
      && column!.dflt_value === "''"
  } catch { return false }
}

export function createM09Migration(deps: {
  database(reader: SchemaReader): Database.Database
  verifyKnownSchema(reader: SchemaReader): boolean
}): MigrationImplementation {
  return { id: 'M09', from: 9, to: 10, owner: 'canvas-mindmap',
    migrate: reader => applyM09DocTreeSnapshot(deps.database(reader)),
    verify: reader => deps.verifyKnownSchema(reader) && verifyM09DocTreeSnapshot(deps.database(reader)) }
}
