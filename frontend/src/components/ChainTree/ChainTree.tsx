import { useMemo } from 'react'
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildFlowGraph } from './flowUtils'
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
  onRawSettingsChange: (itemId: string, settings: RawNodeSettings) => void
  conveyorLimit: number
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
}: ChainTreeProps) {
  const { nodes, edges } = useMemo(
    () =>
      buildFlowGraph(
        chainResult, itemMap, buildingMap, recipeMap, onRecipeSelect,
        rawNodeSettings, onRawSettingsChange, conveyorLimit,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainResult, itemMap, buildingMap, recipeMap, rawNodeSettings, conveyorLimit],
  )

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        key={`${chainResult.itemId}_${chainResult.targetRate}`}
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
        <Background color="#1e1e2e" bgColor="transparent" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'raw') return '#1e4a1e'
            if (n.type === 'root') return '#e8b84b'
            if (n.type === 'byproduct') return '#2a2a4a'
            return '#2a3a5a'
          }}
          style={{ background: '#0a0a14' }}
        />
      </ReactFlow>
    </div>
  )
}
