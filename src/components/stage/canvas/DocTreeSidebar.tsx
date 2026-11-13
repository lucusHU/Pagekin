import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'

import { Button } from '../../ui/Button'
import { DangerConfirm } from '../../ui/DangerConfirm'
import { EmptyState } from '../../ui/EmptyState'
import { Menu, type MenuGroupSpec } from '../../ui/Menu'
import { pluralEn } from '../../../shared/plural-en'
import { useLocaleStore } from '../../../stores/locale-store'
import { useCanvasStore } from '../../../stores/canvas-store'
import type { DocTreeNode, DocTreeNodeKind } from '../../../shared/doc-tree'
import { useDocTree } from './use-doc-tree'
import { dropTargetToMove, liveSubtreeSize, visibleDocTreeRows, type DocTreeRow } from './doc-tree-view'

const KIND_ICON: Record<DocTreeNodeKind, typeof Folder> = {
  folder: Folder,
  document: FileText,
  canvas: LayoutDashboard,
}

interface DocTreeSidebarProps {
  projectKey: string
}

/**
 * 资料树侧栏：文件夹 / 文档 / 画布混排，拖拽排序与归层、内联改名、回收站。
 * 树只持层级与标题；正文、角色、章节仍由各自权威仓储持有（ADR-0029）。
 */
export default function DocTreeSidebar({ projectKey }: DocTreeSidebarProps) {
  const text = useLocaleStore(s => s.text)
  const {
    snapshot, busy, loadState, stale, error, reload, createNode, renameNode, moveNode,
    trashNode, restoreNode, refreshTrash, purgeNodes,
  } = useDocTree(projectKey)

  const expandedIds = useCanvasStore(s => s.expandedIds)
  const toggleExpanded = useCanvasStore(s => s.toggleExpanded)
  const activeNodeId = useCanvasStore(s => s.activeNodeId)
  const setActiveNode = useCanvasStore(s => s.setActiveNode)
  const draggingId = useCanvasStore(s => s.draggingId)
  const setDragging = useCanvasStore(s => s.setDragging)
  const dropTarget = useCanvasStore(s => s.dropTarget)
  const setDropTarget = useCanvasStore(s => s.setDropTarget)
  const trashViewOpen = useCanvasStore(s => s.trashViewOpen)
  const setTrashView = useCanvasStore(s => s.setTrashView)
  const trashEntries = useCanvasStore(s => s.trashEntries)
  const trashDamaged = useCanvasStore(s => s.trashDamaged)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [purgeAllOpen, setPurgeAllOpen] = useState(false)

  const nodes = useMemo(() => snapshot?.nodes ?? [], [snapshot])
  const rows = useMemo(() => visibleDocTreeRows(nodes, expandedIds), [nodes, expandedIds])

  const startRename = (node: DocTreeNode) => {
    setRenamingId(node.id)
    setDraftTitle(node.title)
  }

  const commitRename = async () => {
    if (!renamingId) return
    const id = renamingId
    setRenamingId(null)
    await renameNode(id, draftTitle)
  }

  const openTrash = async () => {
    setTrashView(true)
    await refreshTrash()
  }

  const headerGroups: MenuGroupSpec[] = [
    {
      id: 'create',
      label: text('新建', 'Create'),
      items: [
        { id: 'folder', label: text('新建文件夹', 'New folder'), onSelect: () => { void createNode(null, 'folder') } },
        { id: 'document', label: text('新建文档', 'New document'), onSelect: () => { void createNode(null, 'document') } },
        { id: 'canvas', label: text('新建画布', 'New canvas'), onSelect: () => { void createNode(null, 'canvas') } },
      ],
    },
    {
      id: 'view',
      items: [
        { id: 'reload', label: text('重新载入', 'Reload'), onSelect: () => { void reload() } },
        { id: 'trash', label: text('回收站', 'Trash'), onSelect: () => { void openTrash() } },
      ],
    },
  ]

  const rowMenu = (node: DocTreeNode): MenuGroupSpec[] => {
    const size = liveSubtreeSize(nodes, node.id)
    return [
      {
        id: 'node',
        items: [
          ...(node.kind === 'folder'
            ? [{ id: 'child', label: text('在新文件夹里建文档', 'New document inside'), onSelect: () => { void createNode(node.id, 'document') } }]
            : []),
          { id: 'rename', label: text('改名', 'Rename'), onSelect: () => startRename(node) },
        ],
      },
      {
        id: 'danger',
        tone: 'danger',
        items: [{
          id: 'trash',
          label: size > 1
            ? text(`移到回收站（连同 ${size - 1} 个子节点）`, `Move to trash (with ${size - 1} ${pluralEn(size - 1, 'child', 'children')})`)
            : text('移到回收站', 'Move to trash'),
          onSelect: () => { void trashNode(node.id) },
        }],
      },
    ]
  }

  const dropPosition = (event: React.DragEvent<HTMLLIElement>, node: DocTreeNode): 'before' | 'after' | 'inside' => {
    const rect = event.currentTarget.getBoundingClientRect()
    const offset = event.clientY - rect.top
    if (node.kind === 'folder' && offset > rect.height / 3 && offset < rect.height * 2 / 3) return 'inside'
    return offset < rect.height / 2 ? 'before' : 'after'
  }

  const onDrop = async (event: React.DragEvent<HTMLLIElement>, node: DocTreeNode) => {
    event.preventDefault()
    const id = draggingId
    setDragging(null)
    setDropTarget(null)
    if (!id) return
    const target = dropTargetToMove(nodes, id, { id: node.id, position: dropPosition(event, node) })
    if (!target) return
    await moveNode(id, target.parentId, target.order)
  }

  const renderRow = ({ node, depth }: DocTreeRow) => {
    const Icon = KIND_ICON[node.kind]
    const expanded = Boolean(expandedIds[node.id])
    const targeted = dropTarget?.id === node.id ? dropTarget.position : null
    return (
      <li
        key={node.id}
        className="stage-doc-tree-row"
        data-selected={activeNodeId === node.id || undefined}
        data-drop={targeted ?? undefined}
        data-dragging={draggingId === node.id || undefined}
        style={{ paddingLeft: `calc(var(--s-2) + ${depth} * 16px)` }}
        draggable={renamingId !== node.id}
        onDragStart={event => {
          event.dataTransfer.effectAllowed = 'move'
          setDragging(node.id)
        }}
        onDragEnd={() => { setDragging(null); setDropTarget(null) }}
        onDragOver={event => {
          if (!draggingId || draggingId === node.id) return
          event.preventDefault()
          setDropTarget({ id: node.id, position: dropPosition(event, node) })
        }}
        onDrop={event => { void onDrop(event, node) }}
      >
        <button
          type="button"
          className="stage-doc-tree-toggle"
          aria-label={expanded ? text('折叠', 'Collapse') : text('展开', 'Expand')}
          aria-expanded={node.kind === 'folder' ? expanded : undefined}
          disabled={node.kind !== 'folder'}
          onClick={() => toggleExpanded(node.id)}
        >
          {node.kind === 'folder'
            ? (expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />)
            : null}
        </button>
        <Icon size={15} aria-hidden className="stage-doc-tree-icon" />
        {renamingId === node.id ? (
          <input
            className="stage-doc-tree-rename"
            aria-label={text('节点标题', 'Node title')}
            value={draftTitle}
            autoFocus
            onChange={event => setDraftTitle(event.target.value)}
            onBlur={() => { void commitRename() }}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); void commitRename() }
              if (event.key === 'Escape') { setRenamingId(null) }
            }}
          />
        ) : (
          <button
            type="button"
            className="stage-doc-tree-name"
            data-kind={node.kind}
            aria-current={activeNodeId === node.id ? 'true' : undefined}
            onClick={() => setActiveNode(node.id)}
            onDoubleClick={() => startRename(node)}
          >
            {node.title}
          </button>
        )}
        <Menu
          label={text(`《${node.title}》更多操作`, `More for “${node.title}”`)}
          icon={<MoreHorizontal size={15} aria-hidden />}
          align="end"
          groups={rowMenu(node)}
        />
      </li>
    )
  }

  return (
    <section className="stage-doc-tree" aria-label={text('资料树', 'Doc tree')}>
      <header className="stage-doc-tree-head">
        <div>
          <h3 className="stage-doc-tree-title">{trashViewOpen ? text('回收站', 'Trash') : text('资料树', 'Doc tree')}</h3>
          <p className="stage-doc-tree-note">
            {trashViewOpen
              ? text('删掉的节点留在这里，可以恢复。', 'Deleted nodes stay here and can be restored.')
              : text('文件夹、文档与画布混排，拖动可以换层级。', 'Folders, documents and canvases; drag to reorder.')}
          </p>
        </div>
        {trashViewOpen ? (
          <Button variant="text" size="sm" onClick={() => setTrashView(false)}>
            {text('回资料树', 'Back to tree')}
          </Button>
        ) : (
          <Menu label={text('资料树操作', 'Doc tree actions')} icon={<Plus size={16} aria-hidden />} align="end" groups={headerGroups} />
        )}
      </header>

      {error && (
        <p className="stage-doc-tree-error" role="alert">{error}</p>
      )}
      {stale && (
        <p className="stage-doc-tree-warn" role="status">
          {text('显示的是上次读到的树，重新载入可对齐最新。', 'Showing the last loaded tree; reload to sync.')}
        </p>
      )}

      {trashViewOpen ? (
        <div className="stage-doc-tree-body">
          {trashEntries.length === 0 && trashDamaged.length === 0 ? (
            <EmptyState
              heading={text('回收站是空的', 'Trash is empty')}
              description={text('删掉的文件夹、文档与画布会留在这里。', 'Deleted folders, documents and canvases land here.')}
              action={<Button variant="secondary" size="sm" onClick={() => setTrashView(false)}>{text('回资料树', 'Back to tree')}</Button>}
            />
          ) : (
            <>
              <ul className="stage-doc-tree-list">
                {trashEntries.map(entry => (
                  <li key={entry.id} className="stage-doc-tree-row stage-doc-tree-trash-row">
                    <span className="stage-doc-tree-name" data-kind={entry.kind}>{entry.title}</span>
                    <span className="stage-doc-tree-meta">
                      {entry.subtreeSize > 1 ? text(`含 ${entry.subtreeSize} 个节点`, `${entry.subtreeSize} nodes`) : ''}
                    </span>
                    <Button variant="text" size="sm" onClick={() => { void restoreNode(entry.id) }}>
                      <RotateCcw size={14} aria-hidden />{text('恢复', 'Restore')}
                    </Button>
                  </li>
                ))}
              </ul>
              {trashDamaged.length > 0 && (
                <p className="stage-doc-tree-warn" role="status">
                  {text(`损坏项：${trashDamaged.length}`, `Damaged: ${trashDamaged.length}`)}
                </p>
              )}
              <div className="stage-doc-tree-trash-foot">
                <Button variant="danger" size="sm" disabled={busy} onClick={() => setPurgeAllOpen(true)}>
                  <Trash2 size={14} aria-hidden />{text('清空回收站', 'Empty trash')}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="stage-doc-tree-body">
          {loadState === 'loading' && !snapshot && (
            <p className="stage-doc-tree-note" role="status">{text('正在载入资料树…', 'Loading the doc tree…')}</p>
          )}
          {loadState === 'error' && !snapshot && (
            <EmptyState
              heading={text('资料树没能载入', 'The doc tree did not load')}
              description={text('树里的东西没丢，重新载入一次。', 'Nothing is lost; try loading it again.')}
              action={<Button variant="secondary" size="sm" onClick={() => { void reload() }}>{text('重新载入', 'Reload')}</Button>}
            />
          )}
          {snapshot && rows.length === 0 && (
            <EmptyState
              heading={text('还没有资料', 'Nothing here yet')}
              description={text('先建一个文件夹，再把文档和画布放进去。', 'Start with a folder, then put documents and canvases in it.')}
              action={<Button variant="secondary" size="sm" onClick={() => { void createNode(null, 'folder') }}>{text('新建文件夹', 'New folder')}</Button>}
            />
          )}
          {rows.length > 0 && (
            <ul
              className="stage-doc-tree-list"
              onDragOver={event => { if (draggingId) event.preventDefault() }}
              onDrop={event => {
                event.preventDefault()
                const id = draggingId
                setDragging(null)
                setDropTarget(null)
                if (!id) return
                void moveNode(id, null, nodes.filter(node => node.parentId === null && node.deletedAt === null).length)
              }}
            >
              {rows.map(renderRow)}
            </ul>
          )}
        </div>
      )}

      <DangerConfirm
        open={purgeAllOpen}
        onOpenChange={setPurgeAllOpen}
        title={text('清空回收站', 'Empty the trash')}
        consequence={text('回收站里的资料树节点会从这份作品里彻底移除。', 'Trashed doc tree nodes are removed from this book for good.')}
        recoverability={text('移除后无法恢复；作品备份不受影响。', 'This cannot be undone. Book backups are unaffected.')}
        confirmLabel={text('彻底删除', 'Delete for good')}
        cancelLabel={text('取消', 'Cancel')}
        onConfirm={() => { setPurgeAllOpen(false); void purgeNodes({ all: true }) }}
      />
    </section>
  )
}
