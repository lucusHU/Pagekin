import { describe, expect, it } from 'vitest'

import {
  assertDocTreeSnapshot,
  assertStoredDocTreeSnapshot,
  isDocTreeSourceRevision,
  type DocTreeNode,
  type DocTreeSnapshot,
  type DocTreeSourceBundle,
} from '../doc-tree'

const HASH = 'a'.repeat(64)

function node(overrides: Partial<DocTreeNode> = {}): DocTreeNode {
  return {
    id: 'n1',
    parentId: null,
    title: '第一章节点',
    kind: 'document',
    origin: 'human',
    state: 'active',
    refs: [],
    deletedAt: null,
    order: 0,
    revision: 1,
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
    ...overrides,
  }
}

function snapshot(nodes: DocTreeNode[], sourceRevision = HASH): DocTreeSnapshot {
  return { version: 1, generatedAt: '2026-11-13T00:00:00.000Z', sourceRevision, nodes }
}

function sources(sourceRevision = HASH): DocTreeSourceBundle {
  return { characters: [], blueprints: [], finalizedChapters: [], narrativeThreads: [], sourceRevision }
}

describe('资料树快照结构校验', () => {
  it('接受空树与合法节点', () => {
    expect(assertStoredDocTreeSnapshot(snapshot([])).nodes).toEqual([])
    expect(assertStoredDocTreeSnapshot(snapshot([node()])).nodes).toHaveLength(1)
  })

  it('拒绝重复 id', () => {
    expect(() => assertStoredDocTreeSnapshot(snapshot([node(), node({ order: 1 })])))
      .toThrow('资料树节点 ID 重复')
  })

  it('拒绝自连与悬空父节点', () => {
    expect(() => assertStoredDocTreeSnapshot(snapshot([node({ parentId: 'n1' })])))
      .toThrow('资料树节点不能自连')
    expect(() => assertStoredDocTreeSnapshot(snapshot([node({ parentId: 'missing' })])))
      .toThrow('资料树父节点不存在')
  })

  it('拒绝层级成环', () => {
    expect(() => assertStoredDocTreeSnapshot(snapshot([
      node({ id: 'a', parentId: 'b' }),
      node({ id: 'b', parentId: 'a' }),
    ]))).toThrow('资料树存在层级环')
  })

  it('拒绝未知枚举与空标题', () => {
    expect(() => assertStoredDocTreeSnapshot(snapshot([node({ kind: 'page' as never })])))
      .toThrow('资料树节点类型无效')
    expect(() => assertStoredDocTreeSnapshot(snapshot([node({ title: '   ' })])))
      .toThrow('资料树节点标题无效')
  })

  it('保留历史 locked 状态与回收站时间', () => {
    const parsed = assertStoredDocTreeSnapshot(snapshot([
      node({ state: 'locked', deletedAt: '2026-11-13T01:00:00.000Z' }),
    ]))
    expect(parsed.nodes[0]!.state).toBe('locked')
    expect(parsed.nodes[0]!.deletedAt).toBe('2026-11-13T01:00:00.000Z')
  })

  it('校验 sourceRevision 为 64 位十六进制', () => {
    expect(isDocTreeSourceRevision(HASH)).toBe(true)
    expect(isDocTreeSourceRevision('abc')).toBe(false)
    expect(() => assertStoredDocTreeSnapshot(snapshot([], 'short'))).toThrow('资料树来源版本无效')
  })
})

describe('资料树快照来源校验', () => {
  it('来源版本不一致时拒绝', () => {
    expect(() => assertDocTreeSnapshot(snapshot([], 'b'.repeat(64)), sources())).toThrow('资料树来源版本不匹配')
  })

  it('悬空引用逐条检测', () => {
    const withRefs: DocTreeSnapshot = snapshot([
      node({ refs: [{ type: 'character', characterId: 'char-missing' }] }),
    ])
    expect(() => assertDocTreeSnapshot(withRefs, sources())).toThrow('资料树角色引用不存在')
    expect(assertDocTreeSnapshot(withRefs, {
      ...sources(),
      characters: [{ characterId: 'char-missing' }],
    }).nodes[0]!.refs).toHaveLength(1)
  })

  it('蓝图、定稿与线索引用按句柄对齐', () => {
    const bundle: DocTreeSourceBundle = {
      characters: [{ characterId: 'c1' }],
      blueprints: [{ chapterNumber: 1 }],
      finalizedChapters: [{ draftId: 7, chapterNumber: 1 }],
      narrativeThreads: [{ id: 3 }],
      sourceRevision: HASH,
    }
    expect(assertDocTreeSnapshot(snapshot([
      node({ refs: [
        { type: 'character', characterId: 'c1' },
        { type: 'blueprint', chapterNumber: 1 },
        { type: 'finalized-chapter', draftId: 7, chapterNumber: 1 },
        { type: 'narrative-thread', planId: 3 },
      ] }),
    ]), bundle).nodes[0]!.refs).toHaveLength(4)
    expect(() => assertDocTreeSnapshot(snapshot([
      node({ refs: [{ type: 'blueprint', chapterNumber: 2 }] }),
    ]), bundle)).toThrow('资料树蓝图引用不存在')
    expect(() => assertDocTreeSnapshot(snapshot([
      node({ refs: [{ type: 'finalized-chapter', draftId: 8, chapterNumber: 1 }] }),
    ]), bundle)).toThrow('资料树定稿引用不存在')
    expect(() => assertDocTreeSnapshot(snapshot([
      node({ refs: [{ type: 'narrative-thread', planId: 4 }] }),
    ]), bundle)).toThrow('资料树叙事计划引用不存在')
  })
})
