export type Acquisition =
  | 'miner'
  | 'oil_extractor'
  | 'water_extractor'
  | 'resource_well'
  | 'natural'
  | 'byproduct'
  | 'manufactured'
  | 'other'
  | 'unclassified'

export const RAW_ACQUISITIONS = new Set<Acquisition>([
  'miner',
  'oil_extractor',
  'water_extractor',
  'resource_well',
])

export interface Item {
  id: string
  displayName: string
  isFluid: boolean
  acquisition: Acquisition | null
  iconPath: string | null
  producedBy: string | null
}

export interface CraftableItem {
  id: string
  displayName: string
  iconPath: string | null
  recipeCount: number
  techTier: number | null
}

export interface RecipeIngredient {
  item: string
  amount: number
}

export interface Recipe {
  id: string
  displayName: string
  recipeType: 'production' | 'construction' | string
  producedIn: string[]
  manufactoringDuration: number
  ingredients: RecipeIngredient[]
  products: RecipeIngredient[]
  byproducts: RecipeIngredient[]
}

export interface Building {
  id: string
  displayName: string
  buildingCategory: string | null
  powerConsumption: number
  somersloopSlots: number
  iconPath: string | null
}

export interface BuildingDetail extends Building {
  className: string
  slug: string
  description: string | null
  usedInRecipes: { id: string; displayName: string }[]
}

export interface ItemDetail extends Item {
  className: string
  slug: string
  description: string | null
  stackSize: number | null
  rawHints: Record<string, unknown>
  usedInRecipes: { id: string; displayName: string }[]
  producedByRecipes: { id: string; displayName: string }[]
}

export interface ExtractorSuggestion {
  extractorId: string
  displayName: string
  baseRatePerMin: number
  powerConsumptionMW: number
  byPurity: Record<string, { count: number; ratePerNode: number }>
}

export interface Extractor {
  id: string
  displayName: string
  acquisitionType: string
  allowedResources: string[]   // 비어 있으면 acquisitionType 이 같은 자원 전부 (채굴기)
  hasPurity: boolean           // 물 추출기는 순도 없음
  isFluid: boolean
  baseRatePerMin: number       // 0 = 직접 뽑지 않음 (자원정 가압기)
  powerConsumption: number
}

export interface Conveyor {
  id: string
  displayName: string
  type: 'belt' | 'lift'
  itemsPerMin: number
}

export interface GameConstants {
  purityMultipliers: Record<string, number>
}

export type Purity = 'impure' | 'normal' | 'pure'

export interface NodeConfig {
  extractorId: string
  purity: Purity
  overclock: number   // 25–250
}

export interface RawNodeSettings {
  mode: 'nodes' | 'manual'
  nodes: NodeConfig[]
  manualRate: number | null
}

// 계산기 결과 트리
export interface ChainNode {
  itemId: string
  targetRate: number
  recipe: Recipe | null
  defaultRecipeId: string | null   // 선택 안 했을 때 쓰는 레시피
  buildingCount: number
  buildingCountCeil: number
  clockSpeed: number
  powerMW: number
  children: ChainNode[]
  byproductOutputs: { itemId: string; rate: number }[]
  extractorSuggestion: ExtractorSuggestion | null
}

export interface CalculationResult {
  root: ChainNode
  rawResources: { itemId: string; rate: number }[]
  totalPowerMW: number
}

export interface Plan {
  id: string
  name: string
  itemId: string
  targetRate: number
  recipeSelections: Record<string, string>
  createdAt: string
}
