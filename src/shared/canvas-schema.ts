import type { Edge, Node } from '@xyflow/react'

/** 画布节点来源：作者手写、AI 提案落库、外部导入。 */
export type CanvasNodeOrigin = 'human' | 'ai' | 'imported'

/** 画布节点承载的业务数据（不含 React Flow 内部布局字段）。 */
export type CanvasNodeData = {
  /** 节点标题/正文短标签。 */
  label: string
  /** 来源标记，用于区分作者草稿与 AI 落库内容。 */
  origin: CanvasNodeOrigin
  /** 节点备注；S1 仅预留字段，编辑在后续切片接入。 */
  note?: string
}

/** 画布节点：React Flow Node 挂接本仓画布数据。 */
export type CanvasNode = Node<CanvasNodeData, 'canvas'>

/** 画布连线。 */
export type CanvasEdge = Edge

/**
 * 画布快照形状。S1 先固定字段形状；快照校验、成环/自连/悬空引用校验与
 * sourceRevision 乐观锁结构在 S3 落地（见 docs/plans/canvas-mindmap-p0.md）。
 */
export interface CanvasSnapshot {
  version: 1
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

/**
 * 资料树节点完整合同（层级、来源、引用句柄、软删除、快照与断言器）在
 * `./doc-tree`；此处仅 type-only 再导出，兼容既有引用路径，不再重复定义。
 */
export type { DocTreeNode } from './doc-tree'
