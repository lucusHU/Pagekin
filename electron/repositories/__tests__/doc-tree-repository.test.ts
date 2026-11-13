import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { closeProjectDatabase, getProjectDb } from '../../database'
import { openCanonicalProjectFixture as initProjectDatabase } from '../../../test/helpers/canonical-project-fixture'
import { DocTreeRepository } from '../doc-tree-repository'
import { ProjectCoreRepository } from '../project-core-repository'

let projectRoot = ''
const testRoot = path.resolve('.runtime/.cache/doc-tree-repository-tests')

beforeAll(() => {
  fs.mkdirSync(testRoot, { recursive: true })
  fs.writeFileSync(path.join(testRoot, '.vibe-owner.json'), JSON.stringify({
    owner: 'doc-tree-repository.test.ts',
    sourceProject: process.cwd(),
    createdAt: new Date().toISOString(),
    ttlHours: 24,
    reason: 'Owned scratch for doc tree repository tests',
    cleanupCommand: "Remove-Item -LiteralPath '.runtime/.cache/doc-tree-repository-tests' -Recurse -Force",
  }, null, 2))
})

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(testRoot, 'case-'))
  initProjectDatabase(projectRoot)
  ProjectCoreRepository.init('Doc tree novel', 'zh-CN')
})

afterEach(() => {
  closeProjectDatabase()
  fs.rmSync(projectRoot, { recursive: true, force: true })
})

function revision(): string {
  return DocTreeRepository.read().sources.sourceRevision
}

describe('资料树仓储：节点增删改', () => {
  it('新建文件夹与文档并按同级序号追加', () => {
    const first = DocTreeRepository.createNode(
      { parentId: null, kind: 'folder', title: '第一卷', origin: 'human' },
      revision(),
    )
    const second = DocTreeRepository.createNode(
      { parentId: null, kind: 'canvas', title: '主线导图', origin: 'human' },
      revision(),
    )
    const bundle = DocTreeRepository.read()
    expect(bundle.snapshot?.nodes).toHaveLength(2)
    expect(bundle.snapshot!.nodes.map(node => node.order).sort()).toEqual([0, 1])
    expect(first.node.kind).toBe('folder')
    expect(second.node.state).toBe('active')
    expect(bundle.snapshot!.nodes.find(node => node.id === first.node.id)?.title).toBe('第一卷')
  })

  it('新建挂在文件夹下，父级必须是文件夹且不在回收站', () => {
    const folder = DocTreeRepository.createNode(
      { parentId: null, kind: 'folder', title: '资料', origin: 'human' }, revision(),
    ).node
    const child = DocTreeRepository.createNode(
      { parentId: folder.id, kind: 'document', title: '人物小传', origin: 'human' }, revision(),
    ).node
    expect(child.parentId).toBe(folder.id)
    const doc = DocTreeRepository.createNode(
      { parentId: null, kind: 'document', title: '散装文档', origin: 'human' }, revision(),
    ).node
    expect(() => DocTreeRepository.createNode(
      { parentId: doc.id, kind: 'document', title: '不该建出来', origin: 'human' }, revision(),
    )).toThrow('DOC_TREE_PARENT_NOT_FOLDER')
  })

  it('改名递增节点版本并拒绝空标题', () => {
    const node = DocTreeRepository.createNode(
      { parentId: null, kind: 'document', title: '节点一', origin: 'human' }, revision(),
    ).node
    expect(node.revision).toBe(1)
    const renamed = DocTreeRepository.renameNode(node.id, '  节点二  ', revision()).node
    expect(renamed.title).toBe('节点二')
    expect(renamed.revision).toBe(2)
    expect(() => DocTreeRepository.renameNode(node.id, '   ', revision())).toThrow('DOC_TREE_TITLE_INVALID')
    expect(() => DocTreeRepository.renameNode('missing', 'x', revision())).toThrow('DOC_TREE_NODE_NOT_FOUND')
  })

  it('移动改层级与序号，禁止挪进自身子树', () => {
    const root = DocTreeRepository.createNode(
      { parentId: null, kind: 'folder', title: '根', origin: 'human' }, revision(),
    ).node
    const a = DocTreeRepository.createNode(
      { parentId: null, kind: 'document', title: 'A', origin: 'human' }, revision(),
    ).node
    const b = DocTreeRepository.createNode(
      { parentId: null, kind: 'document', title: 'B', origin: 'human' }, revision(),
    ).node
    DocTreeRepository.moveNode(a.id, root.id, 0, revision())
    const moved = DocTreeRepository.moveNode(b.id, root.id, 0, revision()).node
    expect(moved.parentId).toBe(root.id)
    const order = DocTreeRepository.read().snapshot!.nodes
      .filter(node => node.parentId === root.id)
      .sort((x, y) => x.order - y.order)
      .map(node => node.title)
    expect(order).toEqual(['B', 'A'])
    expect(() => DocTreeRepository.moveNode(root.id, root.id, 0, revision()))
      .toThrow('DOC_TREE_CYCLE_DETECTED')
  })

  it('来源变化后旧乐观锁句柄被拒绝', () => {
    const stale = revision()
    DocTreeRepository.createNode(
      { parentId: null, kind: 'folder', title: '先建一个', origin: 'human' }, stale,
    )
    getProjectDb()!.prepare(`
      INSERT INTO blueprints (chapter_number, title, purpose, key_events, notes, notes_updated_at)
      VALUES (1, '第一章', '开场', '主角进城', '', datetime('now'))
    `).run()
    expect(() => DocTreeRepository.createNode(
      { parentId: null, kind: 'document', title: '过期写入', origin: 'human' }, stale,
    )).toThrow('DOC_TREE_SOURCES_CHANGED')
  })
})

describe('资料树仓储：软删除与恢复', () => {
  it('删文件夹带走整棵仍活着的子树，回收站里只算一项', () => {
    const folder = DocTreeRepository.createNode(
      { parentId: null, kind: 'folder', title: '被删的文件夹', origin: 'human' }, revision(),
    ).node
    const child = DocTreeRepository.createNode(
      { parentId: folder.id, kind: 'document', title: '跟着走', origin: 'human' }, revision(),
    ).node
    DocTreeRepository.trashNode(folder.id, revision())
    const nodes = DocTreeRepository.read().snapshot!.nodes
    const trashed = nodes.filter(node => node.deletedAt !== null)
    expect(trashed.map(node => node.id).sort()).toEqual([folder.id, child.id].sort())
    expect(new Set(trashed.map(node => node.deletedAt)).size).toBe(1)
    const trash = DocTreeRepository.listTrash()
    expect(trash.entries).toHaveLength(1)
    expect(trash.entries[0]!.id).toBe(folder.id)
    expect(trash.entries[0]!.subtreeSize).toBe(2)
  })

  it('恢复一项把同一组句柄的子树一起放回', () => {
    const folder = DocTreeRepository.createNode(
      { parentId: null, kind: 'folder', title: '回来吧', origin: 'human' }, revision(),
    ).node
    DocTreeRepository.createNode(
      { parentId: folder.id, kind: 'document', title: '子节点', origin: 'human' }, revision(),
    )
    DocTreeRepository.trashNode(folder.id, revision())
    const restored = DocTreeRepository.restoreNode(folder.id, revision()).node
    expect(restored.deletedAt).toBeNull()
    expect(DocTreeRepository.read().snapshot!.nodes.every(node => node.deletedAt === null)).toBe(true)
    expect(DocTreeRepository.listTrash().entries).toHaveLength(0)
    // 重复恢复幂等
    expect(DocTreeRepository.restoreNode(folder.id, revision()).node.deletedAt).toBeNull()
  })

  it('父级仍在回收站时，恢复的子节点挂回根级', () => {
    const folder = DocTreeRepository.createNode(
      { parentId: null, kind: 'folder', title: '先删父级', origin: 'human' }, revision(),
    ).node
    const child = DocTreeRepository.createNode(
      { parentId: folder.id, kind: 'document', title: '后删子级', origin: 'human' }, revision(),
    ).node
    DocTreeRepository.trashNode(child.id, revision())
    DocTreeRepository.trashNode(folder.id, revision())
    const restored = DocTreeRepository.restoreNode(child.id, revision()).node
    expect(restored.parentId).toBeNull()
    expect(restored.deletedAt).toBeNull()
    expect(DocTreeRepository.listTrash().entries.map(entry => entry.id)).toEqual([folder.id])
  })

  it('彻底清除连子树一起移出快照，已不在回收站的列入 alreadyGone', () => {
    const folder = DocTreeRepository.createNode(
      { parentId: null, kind: 'folder', title: '清掉', origin: 'human' }, revision(),
    ).node
    const live = DocTreeRepository.createNode(
      { parentId: null, kind: 'document', title: '还在树里', origin: 'human' }, revision(),
    ).node
    DocTreeRepository.trashNode(folder.id, revision())
    const result = DocTreeRepository.purgeNodes({ ids: [folder.id, 'not-there', live.id] })
    expect(result.purged).toEqual([folder.id])
    expect(result.alreadyGone.sort()).toEqual(['not-there', live.id].sort())
    expect(DocTreeRepository.read().snapshot!.nodes.map(node => node.id)).toEqual([live.id])
    expect(DocTreeRepository.listTrash().entries).toHaveLength(0)
  })
})

describe('资料树仓储：坏快照与清空', () => {
  it('读不成形的快照隔离成空树，原文不被删除', () => {
    getProjectDb()!.prepare("UPDATE project_core SET doc_tree_snapshot = ? WHERE id = 'main'").run('{ not json')
    const bundle = DocTreeRepository.read()
    expect(bundle.snapshot).toBeNull()
    expect(bundle.storedSnapshotInvalid).toBe(true)
    const raw = getProjectDb()!.prepare("SELECT doc_tree_snapshot FROM project_core WHERE id = 'main'").pluck().get()
    expect(raw).toBe('{ not json')
  })

  it('清空把列写回空串', () => {
    DocTreeRepository.createNode(
      { parentId: null, kind: 'folder', title: '清空我', origin: 'human' }, revision(),
    )
    DocTreeRepository.clear()
    expect(getProjectDb()!.prepare("SELECT doc_tree_snapshot FROM project_core WHERE id = 'main'").pluck().get()).toBe('')
    expect(DocTreeRepository.read().snapshot).toBeNull()
  })
})
