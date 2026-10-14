import { Handle, Position, type NodeProps } from '@xyflow/react'
import ItemIcon from '../../ItemIcon'
import { useLang } from '../../../i18n'
import type { Node } from '@xyflow/react'

export interface ByproductNodeData extends Record<string, unknown> {
  itemId: string
  displayName: string
  iconPath: string | null
  rate: number
  usedInChain: boolean
}

export type ByproductFlowNode = Node<ByproductNodeData, 'byproduct'>

function fmtRate(r: number) {
  if (r === 0) return '0'
  if (r === Math.floor(r)) return r.toString()
  return parseFloat(r.toFixed(2)).toString()
}

export default function ByproductNode({ data }: NodeProps<ByproductFlowNode>) {
  const { t } = useLang()
  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: `1px dashed ${data.usedInChain ? 'var(--success-border)' : 'var(--border-strong)'}`,
      borderRadius: 7,
      padding: '6px 10px',
      width: 160,
      boxSizing: 'border-box',
      opacity: data.usedInChain ? 1 : 0.5,
      display: 'flex',
      alignItems: 'center',
      gap: 7,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: 'var(--text-faint)' }} />
      <ItemIcon iconPath={data.iconPath} size={20} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.displayName}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {fmtRate(data.rate)}/min
          {data.usedInChain && <span style={{ color: 'var(--success)', marginLeft: 6 }}>{t('node.byproductUsed')}</span>}
        </div>
      </div>
    </div>
  )
}
