import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Button } from 'antd'
import ItemIcon from '../../ItemIcon'
import NodeSettingsModal from '../../NodeSettingsModal'
import { computeSupply } from '../../../utils/extractorUtils'
import { useExtractors, useGameConstants } from '../../../api/calculator'
import { useLang } from '../../../i18n'
import type { FlowNode } from '../flowUtils'

function fmtRate(r: number): string {
  if (r === 0) return '0'
  if (r === Math.floor(r)) return r.toString()
  return parseFloat(r.toFixed(2)).toString()
}

function stopProp(e: React.PointerEvent) {
  e.stopPropagation()
  e.nativeEvent.stopImmediatePropagation()
}

export default function RawNode({ data }: NodeProps<FlowNode>) {
  const { t } = useLang()
  const [modalOpen, setModalOpen] = useState(false)
  const { data: extractors = {} } = useExtractors()
  const { data: gameConstants } = useGameConstants()
  const purityMultipliers = gameConstants?.purityMultipliers ?? {}

  const { extractorSuggestion, rawSettings, onRawSettingsChange, itemId } = data

  const supplyRate = rawSettings
    ? computeSupply(rawSettings, extractors, purityMultipliers)
    : null

  const sufficient = supplyRate !== null && supplyRate >= data.targetRate - 0.001
  const hasExtractor = !!extractorSuggestion

  const extractorBreakdown = rawSettings?.mode === 'nodes' && rawSettings.nodes.length > 0
    ? Object.entries(
        rawSettings.nodes.reduce<Record<string, number>>((acc, n) => {
          acc[n.extractorId] = (acc[n.extractorId] ?? 0) + 1
          return acc
        }, {}),
      ).map(([id, count]) => `${extractors[id]?.displayName ?? id} ×${count}`)
    : null

  const acquisitionType = data.itemAcquisition ?? 'miner'
  const borderColor = data.isCycle || (hasExtractor && supplyRate !== null && !sufficient) ? 'var(--danger-border)' : 'var(--success-border)'

  return (
    <>
      <div
        style={{
          background: 'var(--raw-bg)',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 8,
          padding: '9px 11px',
          width: 215,
          boxSizing: 'border-box',
          boxShadow: 'var(--shadow-node)',
        }}
      >
        <Handle type="source" position={Position.Right} style={{ background: 'var(--success-muted)', width: 8, height: 8 }} />

        {/* 헤더: 아이콘 + 이름 + 설정 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ItemIcon iconPath={data.iconPath} size={26} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {data.displayName}
            </div>
            {extractorBreakdown ? (
              <div style={{ fontSize: 10, color: 'var(--success-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                {extractorBreakdown.join(' / ')}
              </div>
            ) : extractorSuggestion ? (
              <div style={{ fontSize: 10, color: 'var(--success-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                {extractors[extractorSuggestion.extractorId]?.displayName ?? extractorSuggestion.displayName}
              </div>
            ) : null}
          </div>
          {hasExtractor && rawSettings && (
            <div className="nodrag nopan" onPointerDown={stopProp}>
              <Button
                type="text"
                size="small"
                style={{ color: 'var(--accent)', padding: '0 4px', height: 22, fontSize: 11, lineHeight: '22px' }}
                onClick={() => setModalOpen(true)}
              >
                {t('node.settings')}
              </Button>
            </div>
          )}
        </div>

        {/* 공급량 표시 */}
        {hasExtractor && supplyRate !== null && (
          <>
            <div style={{ borderTop: '1px solid var(--border)', margin: '7px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--text-faint)' }}>{t('node.required', { rate: fmtRate(data.targetRate) })}</span>
              <span style={{ color: sufficient ? 'var(--success-muted)' : 'var(--danger)', fontWeight: 700 }}>
                {t('node.supply', { rate: fmtRate(supplyRate) })} {sufficient ? '✓' : '✗'}
              </span>
            </div>
          </>
        )}

        {!hasExtractor && (
          <div style={{ fontSize: 11, color: 'var(--rate-muted)', marginTop: 5 }}>
            {t('node.required', { rate: fmtRate(data.targetRate) })}
          </div>
        )}

        {data.isCycle && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>
            {t('node.cycle')}
          </div>
        )}
      </div>

      {hasExtractor && rawSettings && (
        <NodeSettingsModal
          open={modalOpen}
          itemId={itemId}
          displayName={data.displayName}
          iconPath={data.iconPath}
          targetRate={data.targetRate}
          settings={rawSettings}
          acquisitionType={acquisitionType}
          onConfirm={(_, newSettings) => {
            onRawSettingsChange?.(data.pathKey, newSettings)
            setModalOpen(false)
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
