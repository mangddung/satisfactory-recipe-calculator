import { Handle, Position, type NodeProps } from '@xyflow/react'
import ItemIcon from '../../ItemIcon'
import type { Node } from '@xyflow/react'

export interface ByproductNodeData extends Record<string, unknown> {
  itemId: string
  displayName: string
  iconPath: string | null
  rate: number
}

export type ByproductFlowNode = Node<ByproductNodeData, 'byproduct'>

function fmtRate(r: number) {
  if (r === 0) return '0'
  if (r === Math.floor(r)) return r.toString()
  return parseFloat(r.toFixed(2)).toString()
}

export default function ByproductNode({ data }: NodeProps<ByproductFlowNode>) {
  return (
    <div style={{
      background: '#0b0b18',
      border: '1px dashed #2a3050',
      borderRadius: 7,
      padding: '6px 10px',
      width: 160,
      boxSizing: 'border-box',
      opacity: 0.5,
      display: 'flex',
      alignItems: 'center',
      gap: 7,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#4a4a6a' }} />
      <ItemIcon iconPath={data.iconPath} size={20} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.displayName}
        </div>
        <div style={{ fontSize: 10, color: '#6a8a8a' }}>
          {fmtRate(data.rate)}/min
        </div>
      </div>
    </div>
  )
}
