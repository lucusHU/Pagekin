import type { DocTreeNode } from '../../../shared/doc-tree'

/** 侧栏树的一行：节点与缩进层级。 */
export interface DocTreeRow {
  node: DocTreeNode
  depth: number
}

function siblingsOf(nodes: readonly DocTreeNode[], parentId: string | null): DocTreeNode[] {
  return nodes
    .filter(node => node.parentId === parentId && node.deletedAt === null)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** 折叠状态下的可见行：父级没展开时子层不出现；回收站节点不进主树。 */
export function visibleDocTreeRows(
  nodes: readonly DocTreeNode[],
  expandedIds: Record<string, boolean>,
): DocTreeRow[] {
  const rows: DocTreeRow[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const node of siblingsOf(nodes, parentId)) {
      rows.push({ node, depth })
      if (node.kind === 'folder' && expandedIds[node.id]) walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

/** 拖落点换算成落库参数：落在节点上方/下方按同级插序，落在文件夹上归入其中。 */
export function dropTargetToMove(
  nodes: readonly DocTreeNode[],
  draggedId: string,
  target: { id: string; position: 'before' | 'after' | 'inside' },
): { parentId: string | null; order: number } | null {
  const targetNode = nodes.find(node => node.id === target.id)
  if (!targetNode || targetNode.deletedAt !== null) return null
  if (target.id === draggedId) return null

  if (target.position === 'inside') {
    const siblings = siblingsOf(nodes, targetNode.id).filter(node => node.id !== draggedId)
    return { parentId: targetNode.id, order: siblings.length }
  }

  const siblings = siblingsOf(nodes, targetNode.parentId).filter(node => node.id !== draggedId)
  const index = siblings.findIndex(node => node.id === targetNode.id)
  if (index < 0) return null
  return { parentId: targetNode.parentId, order: index + (target.position === 'after' ? 1 : 0) }
}

/** 节点子树规模，右键菜单与回收站提示用。 */
export function liveSubtreeSize(nodes: readonly DocTreeNode[], rootId: string): number {
  const ids = new Set<string>([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes) {
      if (node.parentId !== null && node.deletedAt === null && !ids.has(node.id) && ids.has(node.parentId)) {
        ids.add(node.id)
        grew = true
      }
    }
  }
  return ids.size
}
