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
  defaultRecipeId: string | null
  altRecipes: Recipe[]
  byproductOutputs: { itemId: string; rate: number }[]
  onRecipeSelect: (itemId: string, recipeId: string) => void
  extractorSuggestion: ExtractorSuggestion | null
  rawSettings: RawNodeSettings | null
  onRawSettingsChange: ((itemId: string, settings: RawNodeSettings) => void) | null
  itemAcquisition: string
  isCycle: boolean   // 상위 단계와 같은 아이템이라 백엔드가 전개를 멈춘 노드
  pathKey: string    // 루트부터 itemId 를 '>' 로 이은 트리 경로 — 접힘 상태 키
  canCollapse: boolean
  collapsed: boolean
  hiddenCount: number
  onToggleCollapse: (pathKey: string) => void
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

function countDescendants(node: ChainNode): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0)
}

function collectDescendantIds(node: ChainNode, acc: Set<string>): Set<string> {
  for (const c of node.children) {
    acc.add(c.itemId)
    collectDescendantIds(c, acc)
  }
  return acc
}

function traverse(
  node: ChainNode,
  parentId: string | null,
  parentPath: string | null,
  isRoot: boolean,
  itemMap: Record<string, Item>,
  buildingMap: Record<string, { displayName: string }>,
  recipeMap: Record<string, Recipe>,
  onRecipeSelect: (itemId: string, recipeId: string) => void,
  rawNodeSettings: Record<string, RawNodeSettings>,
  onRawSettingsChange: (itemId: string, settings: RawNodeSettings) => void,
  conveyorLimit: number,
  collapsedPaths: Set<string>,
  onToggleCollapse: (pathKey: string) => void,
  nodes: FlowNode[],
  edges: Edge[],
  counter: Map<string, number>,
  ancestors: Set<string>,
): string {
  const cnt = (counter.get(node.itemId) ?? 0) + 1
  counter.set(node.itemId, cnt)
  const nodeId = cnt === 1 ? node.itemId : `${node.itemId}__${cnt}`

  const item = itemMap[node.itemId]
  const isRaw = !node.recipe
  const nodeType: FlowNodeType = isRoot ? 'root' : isRaw ? 'raw' : 'production'

  const pathKey = parentPath === null ? node.itemId : `${parentPath}>${node.itemId}`
  const canCollapse = nodeType === 'production' && node.children.length > 0
  const collapsed = canCollapse && collapsedPaths.has(pathKey)

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
      defaultRecipeId: node.defaultRecipeId ?? null,
      altRecipes: getAltRecipes(node.itemId, recipeMap),
      byproductOutputs: node.byproductOutputs,
      onRecipeSelect,
      extractorSuggestion: node.extractorSuggestion ?? null,
      rawSettings: rawNodeSettings[node.itemId] ?? null,
      onRawSettingsChange,
      itemAcquisition: item?.acquisition ?? 'miner',
      isCycle: isRaw && ancestors.has(node.itemId),
      pathKey,
      canCollapse,
      collapsed,
      hiddenCount: collapsed ? countDescendants(node) : 0,
      onToggleCollapse,
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

  if (collapsed) return nodeId

  const childAncestors = new Set(ancestors).add(node.itemId)
  for (const child of node.children) {
    traverse(
      child, nodeId, pathKey, false,
      itemMap, buildingMap, recipeMap, onRecipeSelect,
      rawNodeSettings, onRawSettingsChange,
      conveyorLimit, collapsedPaths, onToggleCollapse,
      nodes, edges, counter, childAncestors,
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
  collapsedPaths: Set<string>,
  onToggleCollapse: (pathKey: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const mainNodes: FlowNode[] = []
  const mainEdges: Edge[] = []

  traverse(
    chainRoot, null, null, true,
    itemMap, buildingMap, recipeMap, onRecipeSelect,
    rawNodeSettings, onRawSettingsChange,
    conveyorLimit, collapsedPaths, onToggleCollapse,
    mainNodes, mainEdges, new Map(), new Set(),
  )

  // 루트를 뺀 모든 노드 = 체인 어딘가의 재료 (접혀서 안 보이는 노드 포함)
  const chainIngredients = collectDescendantIds(chainRoot, new Set())

  const g = new graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 50 })

  for (const n of mainNodes) {
    const h = n.type === 'raw'
      ? (n.data.extractorSuggestion || n.data.isCycle ? RAW_H : RAW_H_SIMPLE)
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
      ? (n.data.extractorSuggestion || n.data.isCycle ? RAW_H : RAW_H_SIMPLE)
      : NODE_H
    // initialWidth/Height: nodes가 제어 모드라 측정값이 userNode에 안 들어감 → 없으면 MiniMap이 노드를 안 그림
    return { ...n, position: { x: x - NODE_W / 2, y: y - h / 2 }, initialWidth: NODE_W, initialHeight: h }
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
        initialWidth: 160,   // ByproductNode width
        initialHeight: BYPRODUCT_H,
        data: {
          itemId: bp.itemId,
          displayName: bpItem?.displayName ?? bp.itemId,
          iconPath: bpItem?.iconPath ?? null,
          rate: bp.rate,
          usedInChain: chainIngredients.has(bp.itemId),
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
