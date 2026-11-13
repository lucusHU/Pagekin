import { create } from 'zustand'

import type {
  DamagedDocTreeTrashEntry,
  DocTreeSnapshot,
  TrashedDocTreeNode,
} from '../shared/doc-tree'

/** 拖拽落点：同级前后插入，或归入文件夹。 */
export interface DocTreeDropTarget {
  id: string
  position: 'before' | 'after' | 'inside'
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

interface CanvasSessionState {
  /** 当前作品路径；换作品时整份会话态重来。 */
  projectPath: string | null
  /** 资料树快照副本；权威数据在主进程仓储，这里只放渲染用的一份。 */
  snapshot: DocTreeSnapshot | null
  /** 写入用的乐观锁句柄。 */
  sourceRevision: string
  loadState: LoadState
  /** 读失败但手里还有旧树：旧树继续显示，标记过期。 */
  stale: boolean
  /** 库里的快照读不成形，已被隔离成空树。 */
  storedSnapshotInvalid: boolean
  expandedIds: Record<string, boolean>
  selectedIds: string[]
  activeNodeId: string | null
  draggingId: string | null
  dropTarget: DocTreeDropTarget | null
  trashViewOpen: boolean
  trashEntries: TrashedDocTreeNode[]
  trashDamaged: DamagedDocTreeTrashEntry[]
  /** 有写请求在飞；期间禁止二次提交，避免同一份快照被并发改。 */
  busy: boolean
}

interface CanvasSessionActions {
  beginLoad: (projectPath: string) => void
  applyRead: (input: {
    projectPath: string
    snapshot: DocTreeSnapshot | null
    sourceRevision: string
    storedSnapshotInvalid?: boolean
    expandedIds?: Record<string, boolean>
  }) => void
  failRead: (projectPath: string) => void
  applySnapshot: (snapshot: DocTreeSnapshot) => void
  reset: (projectPath: string | null) => void
  toggleExpanded: (id: string) => void
  setExpanded: (id: string, expanded: boolean) => void
  setSelected: (id: string) => void
  setActiveNode: (id: string | null) => void
  setDragging: (id: string | null) => void
  setDropTarget: (target: DocTreeDropTarget | null) => void
  setTrashView: (open: boolean) => void
  setTrash: (input: { entries: TrashedDocTreeNode[]; damaged: DamagedDocTreeTrashEntry[] }) => void
  setBusy: (busy: boolean) => void
}

const emptyState = (projectPath: string | null): CanvasSessionState => ({
  projectPath,
  snapshot: null,
  sourceRevision: '',
  loadState: projectPath ? 'loading' : 'idle',
  stale: false,
  storedSnapshotInvalid: false,
  expandedIds: {},
  selectedIds: [],
  activeNodeId: null,
  draggingId: null,
  dropTarget: null,
  trashViewOpen: false,
  trashEntries: [],
  trashDamaged: [],
  busy: false,
})

export const useCanvasStore = create<CanvasSessionState & CanvasSessionActions>((set, get) => ({
  ...emptyState(null),
  beginLoad: projectPath => set(emptyState(projectPath)),
  applyRead: ({ projectPath, snapshot, sourceRevision, storedSnapshotInvalid }) => set(state => {
    if (state.projectPath !== projectPath) return state
    const expandedIds = state.expandedIds
    return {
      snapshot,
      sourceRevision,
      loadState: 'ready',
      stale: false,
      storedSnapshotInvalid: Boolean(storedSnapshotInvalid),
      expandedIds,
    }
  }),
  failRead: projectPath => set(state => (
    state.projectPath === projectPath
      ? { loadState: state.snapshot ? 'ready' : 'error', stale: Boolean(state.snapshot) }
      : state
  )),
  applySnapshot: snapshot => set({ snapshot, sourceRevision: snapshot.sourceRevision ?? get().sourceRevision }),
  reset: projectPath => set(emptyState(projectPath)),
  toggleExpanded: id => set(state => ({ expandedIds: { ...state.expandedIds, [id]: !state.expandedIds[id] } })),
  setExpanded: (id, expanded) => set(state => ({ expandedIds: { ...state.expandedIds, [id]: expanded } })),
  setSelected: id => set({ selectedIds: [id] }),
  setActiveNode: id => set({ activeNodeId: id, selectedIds: id ? [id] : [] }),
  setDragging: id => set({ draggingId: id, dropTarget: id ? get().dropTarget : null }),
  setDropTarget: target => set({ dropTarget: target }),
  setTrashView: open => set({ trashViewOpen: open }),
  setTrash: ({ entries, damaged }) => set({ trashEntries: entries, trashDamaged: damaged }),
  setBusy: busy => set({ busy }),
}))
