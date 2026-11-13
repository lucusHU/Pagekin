import { createHash, randomUUID } from 'node:crypto'

import { getProjectDb } from '../database'
import { NarrativeThreadRepository } from './narrative-thread-repository'
import {
  assertDocTreeSnapshot,
  assertStoredDocTreeSnapshot,
  type DocTreeNode,
  type DocTreeNodeCreateInput,
  type DocTreeReadBundle,
  type DocTreeSnapshot,
  type DocTreeSourceBundle,
  type DocTreeTrashListResult,
  type PurgeDocTreeRequest,
  type TrashedDocTreeNode,
} from '../../src/shared/doc-tree'

type ProjectDb = NonNullable<ReturnType<typeof getProjectDb>>

function requireDb(): ProjectDb {
  const db = getProjectDb()
  if (!db) throw new Error('PROJECT_NOT_OPEN')
  return db
}

/**
 * 来源版本只哈希树能引用的句柄集合（S2 待决项 1 的结论）：角色名单的正文、
 * 蓝图的要点、定稿正文都不进哈希。树只存句柄，被引用实体的内容变化不影响
 * 引用有效性，把 `factHash` 纳进来只会让无关改动被当成乐观锁冲突。
 */
function sourceRevision(facts: Omit<DocTreeSourceBundle, 'sourceRevision'>): string {
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex')
}

function characterHandles(db: ProjectDb): Array<{ characterId: string }> {
  try {
    const rows = db.prepare(`
      SELECT character_id FROM characters
      WHERE character_id <> '' AND retired = 0
      ORDER BY character_id ASC
    `).all() as Array<{ character_id: string }>
    return rows.map(row => ({ characterId: row.character_id }))
  } catch {
    // 身份 schema（M02）之前的旧库没有 character_id：S2 不按姓名兜底，roles 记为无。
    return []
  }
}

function readSources(db: ProjectDb): DocTreeSourceBundle {
  const core = db.prepare("SELECT id FROM project_core WHERE id = 'main'").get() as { id: string } | undefined
  if (!core) throw new Error('DOC_TREE_PROJECT_CORE_MISSING')

  const blueprints = (db.prepare('SELECT chapter_number FROM blueprints ORDER BY chapter_number ASC')
    .all() as Array<{ chapter_number: number }>)
    .map(row => ({ chapterNumber: row.chapter_number }))
  const finalizedChapters = (db.prepare(`
    SELECT drafts.id AS draft_id, drafts.chapter_number
    FROM drafts
    WHERE drafts.status = 'finalized'
      AND NOT EXISTS (
        SELECT 1 FROM drafts newer
        WHERE newer.chapter_number = drafts.chapter_number
          AND newer.status = 'finalized'
          AND (newer.version > drafts.version
            OR (newer.version = drafts.version AND newer.id > drafts.id))
      )
    ORDER BY drafts.chapter_number ASC
  `).all() as Array<{ draft_id: number; chapter_number: number }>)
    .map(row => ({ draftId: row.draft_id, chapterNumber: row.chapter_number }))
  const narrativeThreads = NarrativeThreadRepository.list(db).map(thread => ({ id: thread.id }))
  const characters = characterHandles(db)

  const facts = { characters, blueprints, finalizedChapters, narrativeThreads }
  return { ...facts, sourceRevision: sourceRevision(facts) }
}

function storedSnapshotText(db: ProjectDb): string {
  const row = db.prepare(`
    SELECT doc_tree_snapshot FROM project_core WHERE id = 'main'
  `).get() as { doc_tree_snapshot: string } | undefined
  if (!row) throw new Error('DOC_TREE_PROJECT_CORE_MISSING')
  return row.doc_tree_snapshot
}

function emptySnapshot(sources: DocTreeSourceBundle, now = new Date().toISOString()): DocTreeSnapshot {
  return { version: 1, generatedAt: now, sourceRevision: sources.sourceRevision, nodes: [] }
}

function readSnapshot(db: ProjectDb, sources: DocTreeSourceBundle): DocTreeSnapshot {
  const text = storedSnapshotText(db)
  if (!text) return emptySnapshot(sources)
  try {
    const snapshot = assertStoredDocTreeSnapshot(JSON.parse(text))
    return { ...snapshot, sourceRevision: sources.sourceRevision }
  } catch {
    // 坏快照隔离：读不成形就按空树继续，库里的原文不删，作者下一次写入会覆盖它。
    return emptySnapshot(sources)
  }
}

function writeSnapshot(db: ProjectDb, snapshot: DocTreeSnapshot): void {
  const result = db.prepare(`
    UPDATE project_core SET doc_tree_snapshot = ? WHERE id = 'main'
  `).run(JSON.stringify(snapshot))
  if (result.changes !== 1) throw new Error('DOC_TREE_SAVE_FAILED')
}

function childrenOf(nodes: readonly DocTreeNode[], parentId: string | null, live: boolean): DocTreeNode[] {
  return nodes
    .filter(node => node.parentId === parentId && (live ? node.deletedAt === null : node.deletedAt !== null))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** 同级序号整体重排（S2 待决项 5 的结论）：0 起连续，不做稀疏序号。 */
function normalizeOrders(nodes: DocTreeNode[]): void {
  const parents = [...new Set(nodes.map(node => node.parentId))].sort((a, b) => String(a).localeCompare(String(b)))
  for (const parentId of parents) {
    childrenOf(nodes, parentId, true).forEach((node, index) => { node.order = index })
  }
}

function subtreeIds(nodes: readonly DocTreeNode[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes) {
      if (node.parentId !== null && !ids.has(node.id) && ids.has(node.parentId)) {
        ids.add(node.id)
        grew = true
      }
    }
  }
  return ids
}

function findNode(nodes: readonly DocTreeNode[], id: string): DocTreeNode {
  const node = nodes.find(candidate => candidate.id === id)
  if (!node) throw new Error('DOC_TREE_NODE_NOT_FOUND')
  return node
}

function trimmedTitle(title: string): string {
  const value = typeof title === 'string' ? title.trim() : ''
  if (!value) throw new Error('DOC_TREE_TITLE_INVALID')
  return value
}

export class DocTreeRepository {
  static read(db = requireDb()): DocTreeReadBundle {
    const sources = readSources(db)
    const text = storedSnapshotText(db)
    if (!text) return { sources, snapshot: null }
    try {
      return { sources, snapshot: assertStoredDocTreeSnapshot(JSON.parse(text)) }
    } catch {
      return { sources, snapshot: null, storedSnapshotInvalid: true }
    }
  }

  /**
   * 回收站列表。一次删除带走的子树按 `deletedAt`（该次操作的组句柄）收成一项；
   * 子树内节点单独出现在回收站时不重复计入。坏项单列，不挡其余项。
   */
  static listTrash(db = requireDb()): DocTreeTrashListResult {
    const bundle = this.read(db)
    const nodes = bundle.snapshot?.nodes ?? []
    const entries: TrashedDocTreeNode[] = []
    const damaged: DocTreeTrashListResult['damaged'] = []
    for (const node of nodes) {
      if (node.deletedAt === null) continue
      const parent = node.parentId === null ? undefined : nodes.find(candidate => candidate.id === node.parentId)
      if (parent && parent.deletedAt === node.deletedAt) continue // 子节点随父项走
      try {
        const subtree = [...subtreeIds(nodes, node.id)]
          .map(id => nodes.find(candidate => candidate.id === id))
          .filter((candidate): candidate is DocTreeNode => Boolean(candidate) && candidate!.deletedAt === node.deletedAt)
        entries.push({
          id: node.id,
          title: node.title,
          kind: node.kind,
          deletedAt: node.deletedAt,
          subtreeSize: subtree.length,
        })
      } catch (error) {
        damaged.push({ id: node.id, error: error instanceof Error ? error.message : String(error) })
      }
    }
    entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt) || a.title.localeCompare(b.title))
    return { entries, damaged }
  }

  static createNode(
    input: DocTreeNodeCreateInput,
    expectedSourceRevision: string,
    db = requireDb(),
  ): { node: DocTreeNode; snapshot: DocTreeSnapshot } {
    return db.transaction(() => {
      const sources = readSources(db)
      if (sources.sourceRevision !== expectedSourceRevision) throw new Error('DOC_TREE_SOURCES_CHANGED')
      const snapshot = readSnapshot(db, sources)
      const nodes = snapshot.nodes
      const now = new Date().toISOString()
      const parentId = input.parentId ?? null
      if (parentId !== null) {
        const parent = nodes.find(node => node.id === parentId)
        if (!parent) throw new Error('DOC_TREE_PARENT_NOT_FOUND')
        if (parent.kind !== 'folder') throw new Error('DOC_TREE_PARENT_NOT_FOLDER')
        if (parent.deletedAt !== null) throw new Error('DOC_TREE_PARENT_TRASHED')
      }
      const siblings = childrenOf(nodes, parentId, true).length
      const node: DocTreeNode = {
        id: randomUUID(),
        parentId,
        title: trimmedTitle(input.title),
        kind: input.kind,
        origin: input.origin,
        state: 'active',
        refs: input.refs ?? [],
        deletedAt: null,
        order: siblings,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }
      nodes.push(node)
      normalizeOrders(nodes)
      const next = assertDocTreeSnapshot(
        { version: 1, generatedAt: now, sourceRevision: sources.sourceRevision, nodes },
        sources,
      )
      writeSnapshot(db, next)
      return { node: findNode(next.nodes, node.id), snapshot: next }
    })()
  }

  static renameNode(
    id: string,
    title: string,
    expectedSourceRevision: string,
    db = requireDb(),
  ): { node: DocTreeNode; snapshot: DocTreeSnapshot } {
    return this.mutate(db, expectedSourceRevision, (nodes, now) => {
      const node = findNode(nodes, id)
      if (node.deletedAt !== null) throw new Error('DOC_TREE_NODE_TRASHED')
      if (node.state === 'locked') throw new Error('DOC_TREE_NODE_LOCKED')
      node.title = trimmedTitle(title)
      node.revision += 1
      node.updatedAt = now
      return node
    })
  }

  static moveNode(
    id: string,
    parentId: string | null,
    order: number,
    expectedSourceRevision: string,
    db = requireDb(),
  ): { node: DocTreeNode; snapshot: DocTreeSnapshot } {
    return this.mutate(db, expectedSourceRevision, (nodes, now) => {
      const node = findNode(nodes, id)
      if (node.deletedAt !== null) throw new Error('DOC_TREE_NODE_TRASHED')
      if (node.state === 'locked') throw new Error('DOC_TREE_NODE_LOCKED')
      if (parentId !== null && parentId === id) throw new Error('DOC_TREE_CYCLE_DETECTED')
      if (parentId !== null && subtreeIds(nodes, id).has(parentId)) throw new Error('DOC_TREE_CYCLE_DETECTED')
      if (parentId !== null) {
        const parent = nodes.find(candidate => candidate.id === parentId)
        if (!parent) throw new Error('DOC_TREE_PARENT_NOT_FOUND')
        if (parent.kind !== 'folder') throw new Error('DOC_TREE_PARENT_NOT_FOLDER')
        if (parent.deletedAt !== null) throw new Error('DOC_TREE_PARENT_TRASHED')
      }
      const target = childrenOf(nodes.filter(candidate => candidate.id !== id), parentId, true)
      const index = Math.max(0, Math.min(Math.trunc(order), target.length))
      node.parentId = parentId
      node.revision += 1
      node.updatedAt = now
      target.splice(index, 0, node)
      target.forEach((sibling, position) => { sibling.order = position })
      return node
    })
  }

  /** 软删除：文件夹连同仍活着的子树一起进回收站，共用同一个 `deletedAt` 组句柄。 */
  static trashNode(
    id: string,
    expectedSourceRevision: string,
    db = requireDb(),
  ): { node: DocTreeNode; snapshot: DocTreeSnapshot } {
    return this.mutate(db, expectedSourceRevision, (nodes, now) => {
      const node = findNode(nodes, id)
      if (node.deletedAt !== null) return node
      if (node.state === 'locked') throw new Error('DOC_TREE_NODE_LOCKED')
      const ids = subtreeIds(nodes, id)
      for (const candidate of nodes) {
        if (!ids.has(candidate.id) || candidate.deletedAt !== null) continue
        candidate.deletedAt = now
        candidate.updatedAt = now
        candidate.revision += 1
      }
      return node
    })
  }

  /**
   * 从回收站放回：同一组句柄（`deletedAt` 相同）的子树一起恢复。父级仍在回收站时
   * 挂回根级，避免活树里出现跨删除组的孤儿。已在树内时幂等返回。
   */
  static restoreNode(
    id: string,
    expectedSourceRevision: string,
    db = requireDb(),
  ): { node: DocTreeNode; snapshot: DocTreeSnapshot } {
    return this.mutate(db, expectedSourceRevision, (nodes, now) => {
      const node = findNode(nodes, id)
      if (node.deletedAt === null) return node
      const group = node.deletedAt
      const ids = subtreeIds(nodes, id)
      for (const candidate of nodes) {
        if (!ids.has(candidate.id) || candidate.deletedAt !== group) continue
        candidate.deletedAt = null
        candidate.updatedAt = now
        candidate.revision += 1
      }
      if (node.parentId !== null) {
        const parent = nodes.find(candidate => candidate.id === node.parentId)
        if (parent && parent.deletedAt !== null) {
          node.parentId = null
          node.order = childrenOf(nodes, null, true).length
        }
      }
      return node
    })
  }

  /** 彻底清除：连同子树一起物理移出快照；已不在回收站的列为 alreadyGone。 */
  static purgeNodes(request: PurgeDocTreeRequest, db = requireDb()): { purged: string[]; alreadyGone: string[] } {
    return db.transaction(() => {
      const sources = readSources(db)
      const snapshot = readSnapshot(db, sources)
      const nodes = snapshot.nodes
      const ids = 'all' in request
        ? nodes.filter(node => node.deletedAt !== null).map(node => node.id)
        : [...new Set(request.ids)]
      const purged: string[] = []
      const alreadyGone: string[] = []
      const remove = new Set<string>()
      for (const id of ids) {
        const node = nodes.find(candidate => candidate.id === id)
        if (!node || node.deletedAt === null) { alreadyGone.push(id); continue }
        for (const candidate of subtreeIds(nodes, id)) remove.add(candidate)
        purged.push(id)
      }
      if (remove.size > 0) {
        const survivors = nodes.filter(node => !remove.has(node.id))
        normalizeOrders(survivors)
        const now = new Date().toISOString()
        const next = assertDocTreeSnapshot(
          { version: 1, generatedAt: now, sourceRevision: sources.sourceRevision, nodes: survivors },
          sources,
        )
        writeSnapshot(db, next)
      }
      return { purged, alreadyGone }
    })()
  }

  static clear(db = requireDb()): void {
    const result = db.prepare(`
      UPDATE project_core SET doc_tree_snapshot = '' WHERE id = 'main'
    `).run()
    if (result.changes !== 1) throw new Error('DOC_TREE_CLEAR_FAILED')
  }

  private static mutate(
    db: ProjectDb,
    expectedSourceRevision: string,
    change: (nodes: DocTreeNode[], now: string) => DocTreeNode,
  ): { node: DocTreeNode; snapshot: DocTreeSnapshot } {
    return db.transaction(() => {
      const sources = readSources(db)
      if (sources.sourceRevision !== expectedSourceRevision) throw new Error('DOC_TREE_SOURCES_CHANGED')
      const snapshot = readSnapshot(db, sources)
      const nodes = snapshot.nodes
      const now = new Date().toISOString()
      const changed = change(nodes, now)
      normalizeOrders(nodes)
      const next = assertDocTreeSnapshot(
        { version: 1, generatedAt: now, sourceRevision: sources.sourceRevision, nodes },
        sources,
      )
      writeSnapshot(db, next)
      return { node: findNode(next.nodes, changed.id), snapshot: next }
    })()
  }
}
