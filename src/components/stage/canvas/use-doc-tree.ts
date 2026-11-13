import { useCallback, useEffect, useState } from 'react'

import { captureProjectSession, isProjectSessionCurrent, isProjectSessionPath } from '../../project-session-gate'
import { useLocaleStore } from '../../../stores/locale-store'
import { useProjectStore } from '../../../stores/project-store'
import { useCanvasStore } from '../../../stores/canvas-store'
import { docTreeService } from '../../../services/canvas/doc-tree-service'
import type {
  DocTreeNode,
  DocTreeNodeCreateInput,
  DocTreeNodeKind,
  DocTreeNodeMutationResult,
  PurgeDocTreeRequest,
} from '../../../shared/doc-tree'
import { docTreeErrorMessage } from './doc-tree-errors'

function newNodeTitle(kind: DocTreeNodeKind, text: (zhCN: string, enUS: string) => string): string {
  if (kind === 'folder') return text('新建文件夹', 'New folder')
  if (kind === 'canvas') return text('新建画布', 'New canvas')
  return text('新建文档', 'New document')
}

/**
 * 资料树的读写入口：冻结项目会话 → 调服务层 → 校验会话仍有效再落 store。
 * 快照与乐观锁句柄都在 store 里，这里只负责一次请求的完整生命周期。
 */
export function useDocTree(projectKey: string) {
  const text = useLocaleStore(s => s.text)
  const [error, setError] = useState('')

  const snapshot = useCanvasStore(s => s.snapshot)
  const busy = useCanvasStore(s => s.busy)
  const loadState = useCanvasStore(s => s.loadState)
  const stale = useCanvasStore(s => s.stale)

  const activeSession = useCallback(() => {
    const session = captureProjectSession(useProjectStore.getState().currentProject)
    return session && isProjectSessionPath(session, projectKey) ? session : null
  }, [projectKey])

  const reload = useCallback(async () => {
    const session = activeSession()
    if (!session) return
    useCanvasStore.getState().beginLoad(projectKey)
    try {
      const bundle = await docTreeService.read(session, projectKey)
      if (!isProjectSessionCurrent(session)) return
      useCanvasStore.getState().applyRead({
        projectPath: projectKey,
        snapshot: bundle.snapshot,
        sourceRevision: bundle.sources.sourceRevision,
        storedSnapshotInvalid: bundle.storedSnapshotInvalid,
      })
    } catch {
      if (isProjectSessionCurrent(session)) useCanvasStore.getState().failRead(projectKey)
    }
  }, [activeSession, projectKey])

  useEffect(() => { void reload() }, [reload])

  const mutate = useCallback(async (
    work: (session: NonNullable<ReturnType<typeof activeSession>>, revision: string) => Promise<DocTreeNodeMutationResult>,
  ): Promise<DocTreeNode | null> => {
    const session = activeSession()
    if (!session) {
      setError(text('作品会话已经变了，重新打开资料树再试。', 'The book session changed. Reopen the tree and try again.'))
      return null
    }
    const state = useCanvasStore.getState()
    if (state.busy) return null
    state.setBusy(true)
    setError('')
    try {
      const result = await work(session, state.sourceRevision)
      if (!isProjectSessionCurrent(session)) return null
      if (!result.success) {
        setError(docTreeErrorMessage(result.errorCode ?? result.error, text))
        if (result.errorCode === 'DOC_TREE_SOURCES_CHANGED') void reload()
        return null
      }
      useCanvasStore.getState().applySnapshot(result.snapshot)
      return result.node
    } catch (failure) {
      if (isProjectSessionCurrent(session)) {
        const message = failure instanceof Error ? failure.message : String(failure)
        setError(docTreeErrorMessage(message, text))
      }
      return null
    } finally {
      useCanvasStore.getState().setBusy(false)
    }
  }, [activeSession, reload, text])

  const createNode = useCallback(async (
    parentId: string | null,
    kind: DocTreeNodeKind,
  ): Promise<DocTreeNode | null> => {
    const input: DocTreeNodeCreateInput = { parentId, kind, title: newNodeTitle(kind, text), origin: 'human' }
    const node = await mutate((session, revision) => (
      docTreeService.createNode(session, input, revision, projectKey)
    ))
    if (node && parentId) useCanvasStore.getState().setExpanded(parentId, true)
    return node
  }, [mutate, projectKey, text])

  const renameNode = useCallback((id: string, title: string) => (
    mutate((session, revision) => docTreeService.renameNode(session, id, title, revision, projectKey))
  ), [mutate, projectKey])

  const moveNode = useCallback((id: string, parentId: string | null, order: number) => (
    mutate((session, revision) => docTreeService.moveNode(session, id, parentId, order, revision, projectKey))
  ), [mutate, projectKey])

  const trashNode = useCallback((id: string) => (
    mutate((session, revision) => docTreeService.trashNode(session, id, revision, projectKey))
  ), [mutate, projectKey])

  const restoreNode = useCallback(async (id: string): Promise<boolean> => {
    const node = await mutate((session, revision) => docTreeService.restoreNode(session, id, revision, projectKey))
    return Boolean(node)
  }, [mutate, projectKey])

  const refreshTrash = useCallback(async () => {
    const session = activeSession()
    if (!session) return
    try {
      const result = await docTreeService.listTrash(session, projectKey)
      if (!isProjectSessionCurrent(session)) return
      useCanvasStore.getState().setTrash(result)
    } catch (failure) {
      if (isProjectSessionCurrent(session)) {
        const message = failure instanceof Error ? failure.message : String(failure)
        setError(docTreeErrorMessage(message, text))
      }
    }
  }, [activeSession, projectKey, text])

  const purgeNodes = useCallback(async (request: PurgeDocTreeRequest): Promise<boolean> => {
    const session = activeSession()
    if (!session) return false
    setError('')
    try {
      const result = await docTreeService.purgeNodes(session, request, projectKey)
      if (!isProjectSessionCurrent(session)) return false
      if (!result.success) {
        setError(docTreeErrorMessage(result.error, text))
        return false
      }
      await Promise.all([reload(), refreshTrash()])
      return true
    } catch (failure) {
      if (isProjectSessionCurrent(session)) {
        const message = failure instanceof Error ? failure.message : String(failure)
        setError(docTreeErrorMessage(message, text))
      }
      return false
    }
  }, [activeSession, projectKey, refreshTrash, reload, text])

  return {
    snapshot,
    busy,
    loadState,
    stale,
    error,
    clearError: () => setError(''),
    reload,
    createNode,
    renameNode,
    moveNode,
    trashNode,
    restoreNode,
    refreshTrash,
    purgeNodes,
  }
}
