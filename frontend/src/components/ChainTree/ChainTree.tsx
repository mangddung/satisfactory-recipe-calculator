import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Panel, useReactFlow, type Node } from '@xyflow/react'
import { Segmented } from 'antd'
import '@xyflow/react/dist/style.css'
import { buildFlowGraph, chainDepth, collapsedPathsAtDepth, countNodesToDepth } from './flowUtils'
import { useLang } from '../../i18n'
import RawNode from './nodes/RawNode'
import ProductionNode from './nodes/ProductionNode'
import RootNode from './nodes/RootNode'
import ConveyorEdge from './nodes/ConveyorEdge'
import ByproductNode from './nodes/ByproductNode'
import type { ChainNode, Item, Recipe, RawNodeSettings } from '../../types'

const nodeTypes = {
  raw: RawNode,
  production: ProductionNode,
  root: RootNode,
  byproduct: ByproductNode,
}

const edgeTypes = {
  conveyor: ConveyorEdge,
}

interface ChainTreeProps {
  chainResult: ChainNode
  itemMap: Record<string, Item>
  buildingMap: Record<string, { displayName: string }>
  recipeMap: Record<string, Recipe>
  recipeSelections: Record<string, string>
  onRecipeSelect: (itemId: string, recipeId: string) => void
  rawNodeSettings: Record<string, RawNodeSettings>
  onRawSettingsChange: (pathKey: string, settings: RawNodeSettings) => void
  conveyorLimit: number
  collapsedPaths: Set<string>
  onCollapsedPathsChange: Dispatch<SetStateAction<Set<string>>>
}

const DEPTH_STEPS = [1, 2, 3]

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((k) => b.has(k))
}

// 캔버스 좌상단 단계 선택 — 고르면 그 단계 노드를 접고 화면을 맞춤. 노드별로 접고 펴서 어느 단계와도 안 맞으면 선택 없음
function DepthPanel({ root, collapsedPaths, onChange }: {
  root: ChainNode
  collapsedPaths: Set<string>
  onChange: (paths: Set<string>) => void
}) {
  const { t } = useLang()
  const { fitView } = useReactFlow()
  const maxDepth = chainDepth(root)
  const steps = [...DEPTH_STEPS.filter((d) => d < maxDepth), Infinity]
  if (steps.length < 2) return null

  const current = steps.find((d) => sameSet(collapsedPathsAtDepth(root, d), collapsedPaths)) ?? -1
  return (
    <Panel position="top-left">
      <Segmented
        size="small"
        value={current}
        onChange={(d) => {
          onChange(collapsedPathsAtDepth(root, d))
          fitView({ padding: 0.15, duration: 300 })
        }}
        options={steps.map((d) => ({
          value: d,
          label: `${d === Infinity ? t('chain.depthAll') : t('chain.depth', { n: d })} · ${countNodesToDepth(root, d)}`,
        }))}
      />
    </Panel>
  )
}

// seq: 같은 노드를 다시 눌러도 새 요청으로 구분
type Anchor = { pathKey: string; seq: number }

// 접기/펼치기로 dagre 레이아웃이 바뀌어도 누른 노드가 화면 같은 자리에 남도록 뷰포트를 옮김
function KeepAnchor({ nodes, anchor }: { nodes: Node[]; anchor: Anchor | null }) {
  const { getViewport, setViewport } = useReactFlow()
  const prevNodesRef = useRef(nodes)
  const handledSeqRef = useRef(0)
  useEffect(() => {
    const prev = prevNodesRef.current
    prevNodesRef.current = nodes
    if (!anchor || anchor.seq === handledSeqRef.current) return
    handledSeqRef.current = anchor.seq
    const before = prev.find((n) => n.data.pathKey === anchor.pathKey)
    const after = nodes.find((n) => n.data.pathKey === anchor.pathKey)
    if (!before || !after) return
    const { x, y, zoom } = getViewport()
    setViewport({
      x: x - (after.position.x - before.position.x) * zoom,
      y: y - (after.position.y - before.position.y) * zoom,
      zoom,
    })
  }, [nodes, anchor, getViewport, setViewport])
  return null
}

export default function ChainTree({
  chainResult,
  itemMap,
  buildingMap,
  recipeMap,
  onRecipeSelect,
  rawNodeSettings,
  onRawSettingsChange,
  conveyorLimit,
  collapsedPaths,
  onCollapsedPathsChange,
}: ChainTreeProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  const onToggleCollapse = useCallback((pathKey: string) => {
    setAnchor((a) => ({ pathKey, seq: (a?.seq ?? 0) + 1 }))
    onCollapsedPathsChange((prev) => {
      const next = new Set(prev)
      if (!next.delete(pathKey)) next.add(pathKey)
      return next
    })
  }, [onCollapsedPathsChange])

  const { nodes, edges } = useMemo(
    () =>
      buildFlowGraph(
        chainResult, itemMap, buildingMap, recipeMap, onRecipeSelect,
        rawNodeSettings, onRawSettingsChange, conveyorLimit,
        collapsedPaths, onToggleCollapse,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainResult, itemMap, buildingMap, recipeMap, rawNodeSettings, conveyorLimit, collapsedPaths],
  )

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        key={chainResult.itemId}
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={() => {}}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        {/* dark 기본 배경(#141414) 대신 기존 배경 유지 */}
        <Background color="var(--border)" bgColor="transparent" gap={20} />
        <Controls showInteractive={false} />
        <DepthPanel root={chainResult} collapsedPaths={collapsedPaths} onChange={onCollapsedPathsChange} />
        <KeepAnchor nodes={nodes} anchor={anchor} />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'raw') return 'var(--success-border)'
            if (n.type === 'root') return 'var(--accent)'
            if (n.type === 'byproduct') return 'var(--border-strong)'
            return 'var(--border-strong)'
          }}
          style={{ background: 'var(--bg-app)' }}
        />
      </ReactFlow>
    </div>
  )
}
