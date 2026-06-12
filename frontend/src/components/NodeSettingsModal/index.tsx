import { useState, useEffect, useMemo } from 'react'
import { Modal, Tabs, Select, InputNumber, Button, Radio } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import ItemIcon from '../ItemIcon'
import { computeSupply } from '../../utils/extractorUtils'
import { useExtractors, useGameConstants } from '../../api/calculator'
import type { RawNodeSettings, NodeConfig, Purity } from '../../types'

const PURITY_OPTIONS = [
  { value: 'impure', label: '불순' },
  { value: 'normal', label: '보통' },
  { value: 'pure', label: '순수' },
]

function fmtRate(r: number) {
  if (r === 0) return '0'
  if (r === Math.floor(r)) return r.toString()
  return parseFloat(r.toFixed(2)).toString()
}

interface Props {
  open: boolean
  itemId: string
  displayName: string
  iconPath: string | null
  targetRate: number
  settings: RawNodeSettings
  acquisitionType: string
  onConfirm: (itemId: string, settings: RawNodeSettings) => void
  onClose: () => void
}

export default function NodeSettingsModal({
  open, itemId, displayName, iconPath, targetRate,
  settings, acquisitionType,
  onConfirm, onClose,
}: Props) {
  const { data: extractors = {} } = useExtractors()
  const { data: gameConstants } = useGameConstants()
  const purityMultipliers = gameConstants?.purityMultipliers ?? {}

  const [draft, setDraft] = useState<RawNodeSettings>(settings)

  useEffect(() => {
    if (open) setDraft(JSON.parse(JSON.stringify(settings)))
  }, [open, settings])

  const availableExtractors = useMemo(
    () =>
      Object.values(extractors)
        .filter((e) => e.acquisitionType === acquisitionType)
        .sort((a, b) => a.baseRatePerMin - b.baseRatePerMin),
    [extractors, acquisitionType],
  )

  const defaultExtractorId =
    availableExtractors.length > 0
      ? availableExtractors[availableExtractors.length - 1].id
      : ''

  const totalSupply = computeSupply(draft, extractors, purityMultipliers)
  const sufficient = totalSupply >= targetRate - 0.001

  function updateNode(i: number, patch: Partial<NodeConfig>) {
    setDraft((prev) => {
      const nodes = [...prev.nodes]
      nodes[i] = { ...nodes[i], ...patch }
      return { ...prev, nodes }
    })
  }

  function addNode() {
    setDraft((prev) => ({
      ...prev,
      nodes: [
        ...prev.nodes,
        { extractorId: defaultExtractorId, purity: 'normal', overclock: 100 },
      ],
    }))
  }

  function removeNode(i: number) {
    setDraft((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((_, idx) => idx !== i),
    }))
  }

  function setMode(mode: 'nodes' | 'manual') {
    setDraft((prev) => ({ ...prev, mode }))
  }

  const cellStyle: React.CSSProperties = { padding: '0 4px' }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ItemIcon iconPath={iconPath} size={20} />
          <span>{displayName} 노드 설정</span>
        </div>
      }
      open={open}
      onOk={() => onConfirm(itemId, draft)}
      onCancel={onClose}
      okText="확인"
      cancelText="취소"
      width={580}
      styles={{
        content: { background: '#0d0d1a', border: '1px solid #1e1e2e' },
        header: { background: '#0d0d1a', borderBottom: '1px solid #1e1e2e' },
        footer: { background: '#0d0d1a', borderTop: '1px solid #1e1e2e' },
      }}
    >
      {/* 필요량 */}
      <div style={{ marginBottom: 12, fontSize: 12, color: '#888' }}>
        필요 공급량: <span style={{ color: '#7ab8b8', fontWeight: 600 }}>{fmtRate(targetRate)}/min</span>
      </div>

      {/* 모드 전환 */}
      <Radio.Group
        value={draft.mode}
        onChange={(e) => setMode(e.target.value)}
        style={{ marginBottom: 16 }}
        buttonStyle="solid"
        size="small"
      >
        <Radio.Button value="nodes">노드별 설정</Radio.Button>
        <Radio.Button value="manual">직접 입력</Radio.Button>
      </Radio.Group>

      {draft.mode === 'nodes' && (
        <>
          {/* 헤더 행 */}
          <div style={{ display: 'flex', fontSize: 10, color: '#666', marginBottom: 4, padding: '0 4px' }}>
            <div style={{ flex: 3, ...cellStyle }}>채굴기 등급</div>
            <div style={{ flex: 2, ...cellStyle }}>순도</div>
            <div style={{ flex: 2, ...cellStyle }}>오버클럭</div>
            <div style={{ flex: 2, textAlign: 'right', ...cellStyle }}>공급량</div>
            <div style={{ width: 32 }} />
          </div>

          {/* 노드 행 목록 */}
          {draft.nodes.map((node, i) => {
            const ext = extractors[node.extractorId]
            const rowSupply = ext
              ? ext.baseRatePerMin * (purityMultipliers[node.purity] ?? 1) * (node.overclock / 100)
              : 0
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 6,
                  background: '#111122',
                  borderRadius: 6,
                  padding: '6px 4px',
                }}
              >
                <div style={{ flex: 3, minWidth: 0 }}>
                  <Select
                    size="small"
                    value={node.extractorId}
                    onChange={(v) => updateNode(i, { extractorId: v })}
                    style={{ width: '100%' }}
                    options={availableExtractors.map((e) => ({
                      value: e.id,
                      label: e.displayName,
                    }))}
                  />
                </div>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <Select
                    size="small"
                    value={node.purity}
                    onChange={(v) => updateNode(i, { purity: v as Purity })}
                    style={{ width: '100%' }}
                    options={PURITY_OPTIONS}
                  />
                </div>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <InputNumber
                    size="small"
                    min={25}
                    max={250}
                    value={node.overclock}
                    onChange={(v) => updateNode(i, { overclock: v ?? 100 })}
                    addonAfter="%"
                    controls={false}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ flex: 2, textAlign: 'right', fontSize: 11, color: '#7ab8b8', whiteSpace: 'nowrap', paddingRight: 4 }}>
                  {fmtRate(rowSupply)}/min
                </div>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => removeNode(i)}
                  style={{ flexShrink: 0 }}
                />
              </div>
            )
          })}

          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={addNode}
            style={{ marginTop: 4, marginBottom: 12 }}
            disabled={availableExtractors.length === 0}
          >
            노드 추가
          </Button>

          {/* 합계 */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: sufficient ? '#0a2a0a' : '#2a0a0a',
            border: `1px solid ${sufficient ? '#1e5a1e' : '#5a1e1e'}`,
            borderRadius: 6,
            padding: '6px 12px',
          }}>
            <span style={{ fontSize: 12, color: '#aaa' }}>총 공급량</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: sufficient ? '#4caf50' : '#cc4444' }}>
              {fmtRate(totalSupply)}/min {sufficient ? '✓' : '✗'}
            </span>
          </div>
        </>
      )}

      {draft.mode === 'manual' && (
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>공급 속도를 직접 입력하세요.</div>
          <InputNumber
            value={draft.manualRate ?? 0}
            onChange={(v) => setDraft((prev) => ({ ...prev, manualRate: v }))}
            min={0}
            step={10}
            addonAfter="/min"
            style={{ width: 200 }}
          />
          <div style={{ marginTop: 8, fontSize: 11, color: sufficient ? '#4caf50' : '#cc4444' }}>
            {sufficient ? `✓ 충분 (${fmtRate(totalSupply)}/min)` : `✗ 부족 (${fmtRate(totalSupply)}/min, 필요 ${fmtRate(targetRate)}/min)`}
          </div>
        </div>
      )}
    </Modal>
  )
}
