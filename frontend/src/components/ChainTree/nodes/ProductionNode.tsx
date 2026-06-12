import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Select } from 'antd'
import ItemIcon from '../../ItemIcon'
import type { FlowNode } from '../flowUtils'

function fmtNum(n: number): string {
  if (n === 0) return '0'
  if (n === Math.floor(n)) return n.toString()
  return parseFloat(n.toFixed(2)).toString()
}

interface Props extends NodeProps<FlowNode> {
  isRoot?: boolean
}

export default function ProductionNode({ data, isRoot = false }: Props) {
  const borderColor = isRoot ? '#c89a30' : '#1e2e4a'
  const bgColor = isRoot ? '#140f00' : '#0b0b18'
  const headerColor = isRoot ? '#e8b84b' : '#c8d8e8'

  return (
    <div style={{
      background: bgColor,
      border: `1.5px solid ${borderColor}`,
      borderRadius: 8,
      padding: '9px 11px',
      width: 195,
      boxSizing: 'border-box',
      boxShadow: isRoot ? '0 0 12px rgba(200,154,48,0.15)' : '0 2px 8px rgba(0,0,0,0.4)',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#c89a30', width: 8, height: 8 }} />
      {!isRoot && <Handle type="source" position={Position.Right} style={{ background: '#4a7aaa', width: 8, height: 8 }} />}

      {/* 아이템 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <ItemIcon iconPath={data.iconPath} size={28} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: headerColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.displayName}
          </div>
          <div style={{ fontSize: 10, color: '#5a7a9a', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.buildingName}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #181830', marginBottom: 7 }} />

      {/* 기계 수 / 전력 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: '#9aacbc' }}>
          <span style={{ color: '#e8b84b', fontWeight: 800 }}>×{data.buildingCountCeil}</span>
          <span style={{ color: '#6a8aaa', marginLeft: 4 }}>{data.buildingName}</span>
        </span>
        <span style={{ color: '#6ab0b0', fontSize: 11 }}>
          ⚡ {fmtNum(data.powerMW)} MW
        </span>
      </div>

      {/* 클럭 / 처리량 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4a6a7a' }}>
        <span>클럭 {fmtNum(data.clockSpeed)}%</span>
        <span style={{ color: '#5a9090' }}>{fmtNum(data.targetRate)}/min</span>
      </div>

      {/* 대체 레시피 드롭다운 */}
      {data.altRecipes.length > 1 && (
        <div
          className="nodrag nopan"
          onPointerDown={(e) => {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
          }}
          style={{ marginTop: 7, cursor: 'default' }}
        >
          <Select
            size="small"
            value={data.recipe?.id}
            onChange={(v) => data.onRecipeSelect(data.itemId, v)}
            style={{ width: '100%' }}
            options={data.altRecipes.map((r) => ({ value: r.id, label: r.displayName }))}
          />
        </div>
      )}
    </div>
  )
}
