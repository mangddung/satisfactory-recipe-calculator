import { graphlib, layout } from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { ChainNode, ExtractorSuggestion, Item, Recipe, RawNodeSettings } from '../../types'

const NODE_W = 210
const NODE_H = 140
const RAW_H = 90
const RAW_H_SIMPLE = 75
const BYPRODUCT_H = 56

export type FlowNodeType = 'raw' | 'production' | 'root'

export interface FlowNodeData extends Record<string, unknown> {
  itemId: string
  displayName: string
  iconPath: string | null
  targetRate: number
  buildingCount: number
  buildingCountCeil: number
  clockSpeed: number
  powerMW: number
  buildingName: string
  recipe: Recipe | null
  altRecipes: Recipe[]
  byproductOutputs: { itemId: string; rate: number }[]
  onRecipeSelect: (itemId: string, recipeId: string) => void
  extractorSuggestion: ExtractorSuggestion | null
  rawSettings: RawNodeSettings | null
  onRawSettingsChange: ((itemId: string, settings: RawNodeSettings) => void) | null
  itemAcquisition: string
}

export type FlowNode = Node<FlowNodeData, FlowNodeType>

function fmtRate(r: number): string {
  if (r === 0) return '0'
  if (r === Math.floor(r)) return r.toString()
  return parseFloat(r.toFixed(2)).toString()
}

function getAltRecipes(itemId: string, recipeMap: Record<string, Recipe>): Recipe[] {
  return Object.values(recipeMap).filter(
    (r) =>
      r.recipeType === 'production' &&
      !r.id.toLowerCase().includes('unpackage') &&
      r.products.some((p) => p.item === itemId),
  )
}

function traverse(
  node: ChainNode,
  parentId: string | null,
  isRoot: boolean,
  itemMap: Record<string, Item>,
  buildingMap: Record<string, { displayName: string }>,
  recipeMap: Record<string, Recipe>,
  onRecipeSelect: (itemId: string, recipeId: string) => void,
  rawNodeSettings: Record<string, RawNodeSettings>,
  onRawSettingsChange: (itemId: string, settings: RawNodeSettings) => void,
  conveyorLimit: number,
  nodes: FlowNode[],
  edges: Edge[],
  counter: Map<string, number>,
): string {
  const cnt = (counter.get(node.itemId) ?? 0) + 1
  counter.set(node.itemId, cnt)
  const nodeId = cnt === 1 ? node.itemId : `${node.itemId}__${cnt}`

  const item = itemMap[node.itemId]
  const isRaw = !node.recipe
  const nodeType: FlowNodeType = isRoot ? 'root' : isRaw ? 'raw' : 'production'

  const buildingId = (node.recipe?.producedIn ?? [])[0] ?? null
  const buildingName = buildingId ? (buildingMap[buildingId]?.displayName ?? buildingId) : ''

  nodes.push({
    id: nodeId,
    type: nodeType,
    position: { x: 0, y: 0 },
    data: {
      itemId: node.itemId,
      displayName: item?.displayName ?? node.itemId,
      iconPath: item?.iconPath ?? null,
      targetRate: node.targetRate,
      buildingCount: node.buildingCount,
      buildingCountCeil: node.buildingCountCeil,
      clockSpeed: node.clockSpeed,
      powerMW: node.powerMW,
      buildingName,
      recipe: node.recipe,
      altRecipes: getAltRecipes(node.itemId, recipeMap),
      byproductOutputs: node.byproductOutputs,
      onRecipeSelect,
      extractorSuggestion: node.extractorSuggestion ?? null,
      rawSettings: rawNodeSettings[node.itemId] ?? null,
      onRawSettingsChange,
      itemAcquisition: item?.acquisition ?? 'miner',
    },
  })

  if (parentId !== null) {
    edges.push({
      id: `e_${nodeId}_${parentId}`,
      source: nodeId,
      target: parentId,
      type: 'conveyor',
      data: {
        throughput: node.targetRate,
        conveyorLimit,
        label: `${fmtRate(node.targetRate)}/min`,
      },
    })
  }

  for (const child of node.children) {
    traverse(
      child, nodeId, false,
      itemMap, buildingMap, recipeMap, onRecipeSelect,
      rawNodeSettings, onRawSettingsChange,
      conveyorLimit, nodes, edges, counter,
    )
  }

  return nodeId
}

export function buildFlowGraph(
  chainRoot: ChainNode,
  itemMap: Record<string, Item>,
  buildingMap: Record<string, { displayName: string }>,
  recipeMap: Record<string, Recipe>,
  onRecipeSelect: (itemId: string, recipeId: string) => void,
  rawNodeSettings: Record<string, RawNodeSettings>,
  onRawSettingsChange: (itemId: string, settings: RawNodeSettings) => void,
  conveyorLimit: number,
): { nodes: Node[]; edges: Edge[] } {
  const mainNodes: FlowNode[] = []
  const mainEdges: Edge[] = []

  traverse(
    chainRoot, null, true,
    itemMap, buildingMap, recipeMap, onRecipeSelect,
    rawNodeSettings, onRawSettingsChange,
    conveyorLimit, mainNodes, mainEdges, new Map(),
  )

  const g = new graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 50 })

  for (const n of mainNodes) {
    const h = n.type === 'raw'
      ? (n.data.extractorSuggestion ? RAW_H : RAW_H_SIMPLE)
      : NODE_H
    g.setNode(n.id, { width: NODE_W, height: h })
  }
  for (const e of mainEdges) {
    g.setEdge(e.source, e.target)
  }

  layout(g)

  const positionedMain: FlowNode[] = mainNodes.map((n) => {
    const { x, y } = g.node(n.id)
    const h = n.type === 'raw'
      ? (n.data.extractorSuggestion ? RAW_H : RAW_H_SIMPLE)
      : NODE_H
    return { ...n, position: { x: x - NODE_W / 2, y: y - h / 2 } }
  })

  // 부산물 노드 — 부모 노드 위에 수동 배치
  const byproductNodes: Node[] = []
  const byproductEdges: Edge[] = []

  for (const n of positionedMain) {
    if (n.type !== 'production' && n.type !== 'root') continue
    const byproducts = n.data.byproductOutputs
    if (!byproducts || byproducts.length === 0) continue

    byproducts.forEach((bp, i) => {
      const bpId = `byproduct_${n.id}_${bp.itemId}`
      const bpItem = itemMap[bp.itemId]
      byproductNodes.push({
        id: bpId,
        type: 'byproduct',
        position: {
          x: n.position.x,
          y: n.position.y - BYPRODUCT_H - 12 - i * (BYPRODUCT_H + 8),
        },
        data: {
          itemId: bp.itemId,
          displayName: bpItem?.displayName ?? bp.itemId,
          iconPath: bpItem?.iconPath ?? null,
          rate: bp.rate,
        },
      })
      byproductEdges.push({
        id: `e_bp_${bpId}`,
        source: n.id,
        target: bpId,
        type: 'conveyor',
        data: {
          throughput: bp.rate,
          conveyorLimit: Infinity,
          isDashed: true,
        },
      })
    })
  }

  return {
    nodes: [...positionedMain, ...byproductNodes],
    edges: [...mainEdges, ...byproductEdges],
  }
}
