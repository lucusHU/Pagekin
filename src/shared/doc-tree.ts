import {
  MAX_PLOT_TREE_CHAPTER_NUMBER,
  isPlotTreeSourceRevision,
} from './plot-tree'

/** 资料树节点类型：文件夹 / 文档 / 画布，与 canvas-schema 既有桩口径一致。 */
export const DOC_TREE_NODE_KINDS = Object.freeze(['folder', 'document', 'canvas'] as const)
export type DocTreeNodeKind = typeof DOC_TREE_NODE_KINDS[number]

/** 节点来源：作者手写、AI 提案落库、外部导入；与 CanvasNodeOrigin 口径一致。 */
export const DOC_TREE_NODE_ORIGINS = Object.freeze(['human', 'ai', 'imported'] as const)
export type DocTreeNodeOrigin = typeof DOC_TREE_NODE_ORIGINS[number]

/**
 * 节点业务状态。`locked` 预留给 S4 锁定操作（禁拖拽/改名/删除）；
 * S2 写入路径只产生 `active`，读取路径必须容忍历史快照里的 `locked`。
 */
export type DocTreeNodeState = 'active' | 'locked'

/**
 * 单向引用的权威实体句柄。只存 id / 编号类句柄，不复制角色卡、蓝图、
 * 定稿正文等任何权威内容；权威事实仍以角色库 / 蓝图 / 草稿 / 叙事计划为准。
 */
export type DocTreeEntityRef =
  | { type: 'character'; characterId: string }
  | { type: 'blueprint'; chapterNumber: number }
  | { type: 'finalized-chapter'; draftId: number; chapterNumber: number }
  | { type: 'narrative-thread'; planId: number }

/**
 * 资料树节点。资料树是作者主动草稿层（ADR-0029），不是第二套项目事实源：
 * 层级、标题、来源标记与引用句柄由本树持有；被引用实体的正文不进本快照。
 */
export interface DocTreeNode {
  id: string
  parentId: string | null
  title: string
  kind: DocTreeNodeKind
  origin: DocTreeNodeOrigin
  state: DocTreeNodeState
  /** 单向引用权威实体的句柄列表；可为空。 */
  refs: DocTreeEntityRef[]
  /** 软删除时间；null 表示在树内。被删节点保留在快照里进回收站，恢复时清空。 */
  deletedAt: string | null
  /** 同级排序序号，从 0 起的安全整数。 */
  order: number
  /** 节点级单调版本号，从 1 起；快照保存时随结构一并乐观锁校验。 */
  revision: number
  createdAt: string
  updatedAt: string
}

/** 资料树快照形状；与剧情树快照同一套版本号 / sourceRevision 乐观锁模式。 */
export interface DocTreeSnapshot {
  version: 1
  generatedAt: string
  /** sha256 64 位十六进制乐观锁，口径复用剧情树 `isPlotTreeSourceRevision`。 */
  sourceRevision?: string
  nodes: DocTreeNode[]
}

/**
 * 当前权威实体来源包，供 `assertDocTreeSnapshot` 做悬空引用与版本比对。
 * 各列表只携带句柄所需字段；正文内容由对应权威仓储持有，不在本包复制。
 */
export interface DocTreeSourceBundle {
  characters: Array<{ characterId: string }>
  blueprints: Array<{ chapterNumber: number }>
  finalizedChapters: Array<{ draftId: number; chapterNumber: number }>
  narrativeThreads: Array<{ id: number }>
  sourceRevision: string
}

/** 读快照结果包：当前来源、快照副本与坏快照隔离标记（对齐剧情树 read bundle）。 */
export interface DocTreeReadBundle {
  sources: DocTreeSourceBundle
  snapshot: DocTreeSnapshot | null
  storedSnapshotInvalid?: true
}

/** 新建节点输入。父级存在性、成环与悬空引用在仓储事务内校验。 */
export interface DocTreeNodeCreateInput {
  parentId: string | null
  kind: DocTreeNodeKind
  title: string
  origin: DocTreeNodeOrigin
  refs?: DocTreeEntityRef[]
}

/** 回收站条目：一次删除带走的子树在回收站里算一项。 */
export interface TrashedDocTreeNode {
  id: string
  title: string
  kind: DocTreeNodeKind
  /** 本次删除的组句柄：子树内被删节点共享同一 ISO 时间。 */
  deletedAt: string
  /** 本次删除带走的节点数（含自身）。 */
  subtreeSize: number
}

/** 回收站里读不成形的条目，单列不挡其余条目（对齐章节回收站 `DamagedTrashEntry`）。 */
export interface DamagedDocTreeTrashEntry {
  id: string
  error: string
}

export interface DocTreeTrashListResult {
  entries: TrashedDocTreeNode[]
  damaged: DamagedDocTreeTrashEntry[]
}

/** 彻底清除请求：指定 id 集合，或清空整个回收站。 */
export type PurgeDocTreeRequest = { ids: string[] } | { all: true }

/**
 * 节点变更结果。成功时带节点与改动后的完整快照，作者侧一次刷新即可对齐，
 * 不必再发一次读请求；失败时只带错误码/文案，快照不动。
 */
export type DocTreeNodeMutationResult =
  | { success: true; node: DocTreeNode; snapshot: DocTreeSnapshot }
  | { success: false; error?: string; errorCode?: string }

export { isPlotTreeSourceRevision as isDocTreeSourceRevision }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`资料树${label}无效`)
  return value.trim()
}

// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`资料树${label}无效`)
  return value as number
}

// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`资料树${label}无效`)
  return value as number
}

function validChapterNumber(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) >= 1
    && (value as number) <= MAX_PLOT_TREE_CHAPTER_NUMBER
}

// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function validIsoTimestamp(value: unknown, label: string): string {
  const textValue = text(value, label)
  if (Number.isNaN(Date.parse(textValue))) throw new Error(`资料树${label}无效`)
  return textValue
}

// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function chapterInteger(value: unknown, label: string): number {
  if (!validChapterNumber(value)) throw new Error(`资料树${label}无效`)
  return value
}

// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function entityRef(value: unknown): DocTreeEntityRef {
  const input = record(value)
  if (!input) throw new Error('资料树实体引用无效')
  if (input.type === 'character') {
    return { type: 'character', characterId: text(input.characterId, '角色 ID') }
  }
  if (input.type === 'blueprint') {
    return { type: 'blueprint', chapterNumber: chapterInteger(input.chapterNumber, '蓝图章节') }
  }
  if (input.type === 'finalized-chapter') {
    return {
      type: 'finalized-chapter',
      draftId: positiveInteger(input.draftId, '定稿 ID'),
      chapterNumber: chapterInteger(input.chapterNumber, '定稿章节'),
    }
  }
  if (input.type === 'narrative-thread') {
    return { type: 'narrative-thread', planId: positiveInteger(input.planId, '叙事计划 ID') }
  }
  throw new Error('资料树实体引用无效')
}

/** 父链自连检测：节点不能把自己挂为父节点。 */
// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function assertNoSelfLink(node: DocTreeNode): void {
  if (node.parentId !== null && node.parentId === node.id) {
    throw new Error('资料树节点不能自连')
  }
}

/** 层级成环检测：沿父链上溯不得回到已访问节点。 */
// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function assertNoCycle(nodes: DocTreeNode[]): void {
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (const start of nodes) {
    const visited = new Set<string>()
    let current: DocTreeNode = start
    while (current.parentId !== null) {
      if (visited.has(current.id)) throw new Error('资料树存在层级环')
      visited.add(current.id)
      const parent = byId.get(current.parentId)
      if (!parent) break // 悬空父节点已在结构校验阶段拒绝
      current = parent
    }
  }
}

// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function parseNode(candidate: unknown): DocTreeNode {
  const input = record(candidate)
  if (!input || !DOC_TREE_NODE_KINDS.includes(String(input.kind) as DocTreeNodeKind)) {
    throw new Error('资料树节点类型无效')
  }
  if (!DOC_TREE_NODE_ORIGINS.includes(String(input.origin) as DocTreeNodeOrigin)) {
    throw new Error('资料树节点来源无效')
  }
  if (!['active', 'locked'].includes(String(input.state))) {
    throw new Error('资料树节点状态无效')
  }
  const id = text(input.id, '节点 ID')
  const parentId = input.parentId === null
    ? null
    : text(input.parentId, '父节点 ID')
  const refs = Array.isArray(input.refs)
    ? input.refs.map(entityRef)
    : []
  const deletedAt = input.deletedAt === null || input.deletedAt === undefined
    ? null
    : validIsoTimestamp(input.deletedAt, '删除时间')
  const node: DocTreeNode = {
    id,
    parentId,
    title: text(input.title, '节点标题'),
    kind: input.kind as DocTreeNodeKind,
    origin: input.origin as DocTreeNodeOrigin,
    state: input.state as DocTreeNodeState,
    refs,
    deletedAt,
    order: nonNegativeInteger(input.order, '排序序号'),
    revision: positiveInteger(input.revision, '节点版本'),
    createdAt: validIsoTimestamp(input.createdAt, '创建时间'),
    updatedAt: validIsoTimestamp(input.updatedAt, '更新时间'),
  }
  assertNoSelfLink(node)
  return node
}

// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
function assertRefExists(ref: DocTreeEntityRef, sources: DocTreeSourceBundle): void {
  if (ref.type === 'character') {
    if (!sources.characters.some(character => character.characterId === ref.characterId)) {
      throw new Error('资料树角色引用不存在')
    }
    return
  }
  if (ref.type === 'blueprint') {
    if (!sources.blueprints.some(blueprint => blueprint.chapterNumber === ref.chapterNumber)) {
      throw new Error('资料树蓝图引用不存在')
    }
    return
  }
  if (ref.type === 'finalized-chapter') {
    if (!sources.finalizedChapters.some(chapter => (
      chapter.draftId === ref.draftId && chapter.chapterNumber === ref.chapterNumber
    ))) throw new Error('资料树定稿引用不存在')
    return
  }
  if (!sources.narrativeThreads.some(thread => thread.id === ref.planId)) {
    throw new Error('资料树叙事计划引用不存在')
  }
}

/** Validates a persisted snapshot without requiring its historical sources to still exist. */
// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
export function assertStoredDocTreeSnapshot(value: unknown): DocTreeSnapshot {
  const input = record(value)
  if (!input || input.version !== 1) throw new Error('资料树快照版本无效')
  const generatedAt = validIsoTimestamp(input.generatedAt, '生成时间')
  const sourceRevision = input.sourceRevision
  if (sourceRevision !== undefined && !isPlotTreeSourceRevision(sourceRevision)) {
    throw new Error('资料树来源版本无效')
  }
  if (!Array.isArray(input.nodes)) throw new Error('资料树节点无效')

  const nodes = input.nodes.map(parseNode)

  const byId = new Map<string, DocTreeNode>()
  for (const node of nodes) {
    if (byId.has(node.id)) throw new Error('资料树节点 ID 重复')
    byId.set(node.id, node)
  }
  for (const node of nodes) {
    if (node.parentId !== null && !byId.has(node.parentId)) {
      throw new Error('资料树父节点不存在')
    }
  }
  assertNoCycle(nodes)

  return {
    version: 1,
    generatedAt,
    ...(sourceRevision === undefined ? {} : { sourceRevision }),
    nodes,
  }
}

/** Validates a newly generated snapshot against the project's current authoritative sources. */
// i18n-exempt: 资料树只在主进程生成与保存，失败经生成 IPC 边界换成错误码，读快照失败被 catch 吞掉；作者看不到这条说明
export function assertDocTreeSnapshot(
  value: unknown,
  sources: DocTreeSourceBundle,
): DocTreeSnapshot {
  const snapshot = assertStoredDocTreeSnapshot(value)
  if (snapshot.sourceRevision !== sources.sourceRevision) {
    throw new Error('资料树来源版本不匹配')
  }
  for (const node of snapshot.nodes) {
    for (const ref of node.refs) assertRefExists(ref, sources)
  }
  return snapshot
}
