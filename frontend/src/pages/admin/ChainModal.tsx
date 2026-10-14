import { useState, useMemo, useEffect } from 'react'
import { Modal, Spin } from 'antd'
import { useRecipes, useBuildings, useItems } from '../../api/admin'
import { useCalculate } from '../../api/calculator'
import ChainTree from '../../components/ChainTree'
import { useLang } from '../../i18n'
import type { Recipe, RawNodeSettings } from '../../types'

// 관리자 체인 보기는 채굴 설정 없음. 렌더마다 새 객체면 ChainTree useMemo가 매번 다시 계산함
const NO_RAW_SETTINGS: Record<string, RawNodeSettings> = {}

interface Props {
  recipe: Recipe
  onClose: () => void
}

export default function ChainModal({ recipe, onClose }: Props) {
  const { t } = useLang()
  const [recipeSelections, setRecipeSelections] = useState<Record<string, string>>({})
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set())

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
      title={t('chain.title', { name: recipe.displayName })}
      open
      onCancel={onClose}
      footer={null}
      width="96vw"
      style={{ top: 20 }}
      styles={{ body: { height: '70vh', padding: '12px 8px', display: 'flex', flexDirection: 'column' } }}
    >
      <div style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: 13, flexShrink: 0 }}>
        {buildingNames} · {t('common.seconds', { value: recipe.manufactoringDuration })}
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
            rawNodeSettings={NO_RAW_SETTINGS}
            onRawSettingsChange={() => {}}
            conveyorLimit={Infinity}
            collapsedPaths={collapsedPaths}
            onCollapsedPathsChange={setCollapsedPaths}
          />
        </div>
      )}
    </Modal>
  )
}
