import type { ProjectSessionContext } from '../../shared/ipc-channels'
import type {
  DocTreeNodeCreateInput,
  DocTreeNodeMutationResult,
  DocTreeReadBundle,
  DocTreeTrashListResult,
  PurgeDocTreeRequest,
} from '../../shared/doc-tree'
import { ipc } from '../ipc-client'

/**
 * 资料树的渲染层服务：只做 IPC adapter，不持权威数据。
 * 每次调用都带冻结的项目会话，换作品或重开同一目录后旧请求自然失效。
 */
export const docTreeService = {
  read: (session: ProjectSessionContext, projectPath: string): Promise<DocTreeReadBundle> =>
    ipc.invokeWithProjectSession(session, 'db:doc-tree-read', projectPath),

  createNode: (
    session: ProjectSessionContext,
    input: DocTreeNodeCreateInput,
    sourceRevision: string,
    projectPath: string,
  ): Promise<DocTreeNodeMutationResult> =>
    ipc.invokeWithProjectSession(session, 'db:doc-tree-node-create', input, sourceRevision, projectPath),

  renameNode: (
    session: ProjectSessionContext,
    id: string,
    title: string,
    sourceRevision: string,
    projectPath: string,
  ): Promise<DocTreeNodeMutationResult> =>
    ipc.invokeWithProjectSession(session, 'db:doc-tree-node-rename', id, title, sourceRevision, projectPath),

  moveNode: (
    session: ProjectSessionContext,
    id: string,
    parentId: string | null,
    order: number,
    sourceRevision: string,
    projectPath: string,
  ): Promise<DocTreeNodeMutationResult> =>
    ipc.invokeWithProjectSession(session, 'db:doc-tree-node-move', id, parentId, order, sourceRevision, projectPath),

  trashNode: (
    session: ProjectSessionContext,
    id: string,
    sourceRevision: string,
    projectPath: string,
  ): Promise<DocTreeNodeMutationResult> =>
    ipc.invokeWithProjectSession(session, 'doc-tree:trash-node', id, sourceRevision, projectPath),

  restoreNode: (
    session: ProjectSessionContext,
    id: string,
    sourceRevision: string,
    projectPath: string,
  ): Promise<DocTreeNodeMutationResult> =>
    ipc.invokeWithProjectSession(session, 'doc-tree:trash-restore', id, sourceRevision, projectPath),

  listTrash: (session: ProjectSessionContext, projectPath: string): Promise<DocTreeTrashListResult> =>
    ipc.invokeWithProjectSession(session, 'doc-tree:trash-list', projectPath),

  purgeNodes: (
    session: ProjectSessionContext,
    request: PurgeDocTreeRequest,
    projectPath: string,
  ): Promise<{ success: boolean; purged?: string[]; alreadyGone?: string[]; error?: string }> =>
    ipc.invokeWithProjectSession(session, 'doc-tree:trash-purge', request, projectPath),
}
