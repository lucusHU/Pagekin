import { useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import type { CanvasEdge, CanvasNode } from '../../../shared/canvas-schema'
import './canvas.css'

/**
 * S1 只读展示节点：仅渲染标题与上下连接桩。节点改名、备注、锁定等编辑操作
 * 在后续切片接入（见 docs/plans/canvas-mindmap-p0.md）。
 */
function CanvasMindNode({ data }: NodeProps<CanvasNode>) {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div className="stage-canvas-node">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </>
  )
}

const nodeTypes: NodeTypes = {
  canvas: CanvasMindNode,
}

/**
 * S1 最小画布：渲染一组静态示例节点与父子连线，可缩放、拖动视口。
 * 尚未接持久化与节点编辑；快照读写与 CRUD 在 S3/S4 落地。
 */
export default function StageCanvas() {
  const nodes = useMemo<CanvasNode[]>(() => [
    {
      id: 'canvas-root',
      type: 'canvas',
      position: { x: 220, y: 0 },
      data: { label: '主角 · 林澈', origin: 'human' },
    },
    {
      id: 'canvas-child-1',
      type: 'canvas',
      position: { x: 0, y: 140 },
      data: { label: '恋人女一 · 苏晚', origin: 'human' },
    },
    {
      id: 'canvas-child-2',
      type: 'canvas',
      position: { x: 440, y: 140 },
      data: { label: '反派 · 陆沉', origin: 'human' },
    },
  ], [])

  const edges = useMemo<CanvasEdge[]>(() => [
    { id: 'edge-root-1', source: 'canvas-root', target: 'canvas-child-1' },
    { id: 'edge-root-2', source: 'canvas-root', target: 'canvas-child-2' },
  ], [])

  return (
    <div className="stage-canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
        <Controls />
      </ReactFlow>
    </div>
  )
}
