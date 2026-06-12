import type { ChainNode, Item, Recipe } from '../../types'

export interface ChainTreeProps {
  chainResult: ChainNode
  itemMap: Record<string, Item>
  buildingMap: Record<string, { displayName: string }>
  recipeMap: Record<string, Recipe>
  recipeSelections: Record<string, string>
  onRecipeSelect: (itemId: string, recipeId: string) => void
}
