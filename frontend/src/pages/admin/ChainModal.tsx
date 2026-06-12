import { useState, useMemo, useEffect } from 'react'
import { Modal, Spin } from 'antd'
import { useRecipes, useBuildings, useItems } from '../../api/admin'
import { useCalculate } from '../../api/calculator'
import ChainTree from '../../components/ChainTree'
import type { Recipe } from '../../types'

interface Props {
  recipe: Recipe
  onClose: () => void
}

export default function ChainModal({ recipe, onClose }: Props) {
  const [recipeSelections, setRecipeSelections] = useState<Record<string, string>>({})

  const { data: items = [] } = useItems()
  const { data: recipes = [] } = useRecipes()
  const { data: buildings = [] } = useBuildings()
  const calculateMutation = useCalculate()

  const productItemId = recipe.products[0]?.item

  const itemMap = useMemo(
    () => Object.fromEntries(items.map((it) => [it.id, it])),
    [items],
  )
  const recipeMap = useMemo(
    () => Object.fromEntries(recipes.map((r) => [r.id, r])),
    [recipes],
  )
  const buildingMap = useMemo(
    () => Object.fromEntries(buildings.map((b) => [b.id, b])),
    [buildings],
  )

  useEffect(() => {
    if (!productItemId) return
    calculateMutation.mutate({
      itemId: productItemId,
      targetRate: 60,
      recipeSelections: { [productItemId]: recipe.id },
    })
  }, [productItemId, recipe.id]) // calculateMutation.mutate is stable

  function handleRecipeSelect(itemId: string, recipeId: string) {
    if (!productItemId) return
    const next = { ...recipeSelections, [itemId]: recipeId }
    setRecipeSelections(next)
    calculateMutation.mutate({
      itemId: productItemId,
      targetRate: 60,
      recipeSelections: { ...next, [productItemId]: recipe.id },
    })
  }

  const buildingNames = (recipe.producedIn ?? [])
    .map((id) => buildingMap[id]?.displayName ?? id)
    .filter(Boolean)
    .join(' / ')

  return (
    <Modal
      title={`${recipe.displayName} — 재료 체인`}
      open
      onCancel={onClose}
      footer={null}
      width="96vw"
      style={{ top: 20 }}
      styles={{ body: { height: '70vh', padding: '12px 8px', display: 'flex', flexDirection: 'column' } }}
    >
      <div style={{ marginBottom: 8, color: '#aaa', fontSize: 13, flexShrink: 0 }}>
        {buildingNames} · {recipe.manufactoringDuration}초
      </div>
      {calculateMutation.isPending && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin />
        </div>
      )}
      {calculateMutation.data && Object.keys(recipeMap).length > 0 && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChainTree
            chainResult={calculateMutation.data.root}
            itemMap={itemMap}
            buildingMap={buildingMap}
            recipeMap={recipeMap}
            recipeSelections={recipeSelections}
            onRecipeSelect={handleRecipeSelect}
          />
        </div>
      )}
    </Modal>
  )
}
