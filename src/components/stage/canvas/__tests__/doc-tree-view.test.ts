import { describe, expect, it } from 'vitest'

import type { DocTreeNode } from '../../../../shared/doc-tree'
import { dropTargetToMove, liveSubtreeSize, visibleDocTreeRows } from '../doc-tree-view'

function node(id: string, parentId: string | null, order: number, kind: DocTreeNode['kind'] = 'document'): DocTreeNode {
  return {
    id,
    parentId,
    title: id,
    kind,
    origin: 'human',
    state: 'active',
    refs: [],
    deletedAt: null,
    order,
    revision: 1,
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
  }
}

const tree: DocTreeNode[] = [
  node('folder', null, 0, 'folder'),
  node('canvas', null, 1, 'canvas'),
  node('doc-a', 'folder', 0),
  node('doc-b', 'folder', 1),
]

describe('资料树视图展开', () => {
  it('折叠的文件夹只显示自身，展开后按序号带出子层', () => {
    expect(visibleDocTreeRows(tree, {}).map(row => row.node.id)).toEqual(['folder', 'canvas'])
    expect(visibleDocTreeRows(tree, { folder: true }).map(row => [row.node.id, row.depth])).toEqual([
      ['folder', 0], ['doc-a', 1], ['doc-b', 1], ['canvas', 0],
    ])
  })

  it('回收站节点不进主树', () => {
    const trashed = tree.map(row => (row.id === 'doc-a' ? { ...row, deletedAt: '2026-11-13T01:00:00.000Z' } : row))
    expect(visibleDocTreeRows(trashed, { folder: true }).map(row => row.node.id)).toEqual(['folder', 'doc-b', 'canvas'])
  })
})

describe('拖拽落点换算', () => {
  it('落在同级上方/下方换成插入序号，并排除被拖节点自身', () => {
    expect(dropTargetToMove(tree, 'doc-b', { id: 'doc-a', position: 'before' }))
      .toEqual({ parentId: 'folder', order: 0 })
    expect(dropTargetToMove(tree, 'doc-a', { id: 'doc-b', position: 'after' }))
      .toEqual({ parentId: 'folder', order: 1 })
    expect(dropTargetToMove(tree, 'canvas', { id: 'doc-a', position: 'after' }))
      .toEqual({ parentId: 'folder', order: 1 })
  })

  it('落在文件夹中间归入其中并追加到末尾', () => {
    expect(dropTargetToMove(tree, 'canvas', { id: 'folder', position: 'inside' }))
      .toEqual({ parentId: 'folder', order: 2 })
    expect(dropTargetToMove(tree, 'folder', { id: 'folder', position: 'inside' })).toBeNull()
  })
})

describe('子树规模', () => {
  it('按活着的后代计数，不含回收站节点', () => {
    expect(liveSubtreeSize(tree, 'folder')).toBe(3)
    expect(liveSubtreeSize(tree, 'canvas')).toBe(1)
    const withTrashed = tree.map(row => (row.id === 'doc-b' ? { ...row, deletedAt: '2026-11-13T01:00:00.000Z' } : row))
    expect(liveSubtreeSize(withTrashed, 'folder')).toBe(2)
  })
})
