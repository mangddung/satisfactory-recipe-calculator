import { useState, useMemo } from 'react'
import { Select, Empty, Tag } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import ItemIcon from '../ItemIcon'
import type { Item, Recipe, Building } from '../../types'

function fmtRate(amount: number, duration: number) {
  const rate = (amount / duration) * 60
  if (rate === Math.floor(rate)) return rate.toString()
  return parseFloat(rate.toFixed(2)).toString()
}

interface Props {
  selectedItemId: string
  recipes: Recipe[]
  itemMap: Record<string, Item>
  buildingMap: Record<string, Building>
}

export default function SimpleRecipeView({ selectedItemId, recipes, itemMap, buildingMap }: Props) {
  const itemRecipes = useMemo(
    () =>
      recipes.filter(
        (r) =>
          r.recipeType === 'production' &&
          !r.id.toLowerCase().includes('unpackage') &&
          r.products.some((p) => p.item === selectedItemId),
      ),
    [recipes, selectedItemId],
  )

  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)

  const recipe = useMemo(() => {
    if (itemRecipes.length === 0) return null
    if (selectedRecipeId) {
      return itemRecipes.find((r) => r.id === selectedRecipeId) ?? itemRecipes[0]
    }
    return itemRecipes[0]
  }, [itemRecipes, selectedRecipeId])

  const selectedItem = itemMap[selectedItemId]

  if (itemRecipes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          description={
            <span style={{ color: '#666' }}>
              {selectedItem?.displayName ?? selectedItemId}은(는) 레시피가 없습니다 (채굴/자연 획득)
            </span>
          }
        />
      </div>
    )
  }

  const building = recipe ? buildingMap[recipe.producedIn?.[0]] : null
  const duration = recipe?.manufactoringDuration ?? 1

  const isAlt = recipe?.displayName?.toLowerCase().includes('alternate') ||
    recipe?.id?.toLowerCase().includes('alternate') ||
    recipe?.displayName?.startsWith('대체')

  return (
    <div style={{ flex: 1, padding: '20px 24px', overflow: 'auto' }}>
      {/* 레시피 선택 */}
      {itemRecipes.length > 1 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>레시피</span>
          <Select
            value={recipe?.id}
            onChange={setSelectedRecipeId}
            style={{ width: 280 }}
            options={itemRecipes.map((r) => ({
              value: r.id,
              label: r.displayName,
            }))}
          />
        </div>
      )}

      {/* 레시피 카드 */}
      {recipe && (
        <div style={{
          background: '#0d0d1a',
          border: '1px solid #1e1e2e',
          borderRadius: 10,
          padding: '18px 20px',
          maxWidth: 700,
        }}>
          {/* 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#ddd' }}>{recipe.displayName}</span>
            {isAlt && <Tag color="gold">대체</Tag>}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#555' }}>
              주기 {duration}초
            </span>
          </div>

          {/* 재료 → 건물 → 생산물 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* 재료 */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>재료</div>
              {recipe.ingredients.map((ing) => {
                const item = itemMap[ing.item]
                return (
                  <div key={ing.item} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <ItemIcon iconPath={item?.iconPath ?? null} size={22} />
                    <div>
                      <div style={{ fontSize: 12, color: '#ccc' }}>{item?.displayName ?? ing.item}</div>
                      <div style={{ fontSize: 11, color: '#7ab8b8' }}>{fmtRate(ing.amount, duration)}/min</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 화살표 + 건물 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <ArrowRightOutlined style={{ color: '#444', fontSize: 20 }} />
              {building && (
                <div style={{ fontSize: 11, color: '#888', textAlign: 'center', maxWidth: 80 }}>
                  {building.displayName}
                </div>
              )}
            </div>

            {/* 생산물 */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>생산물</div>
              {recipe.products.map((prod) => {
                const item = itemMap[prod.item]
                const isMain = prod.item === selectedItemId
                return (
                  <div key={prod.item} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <ItemIcon iconPath={item?.iconPath ?? null} size={22} />
                    <div>
                      <div style={{ fontSize: 12, color: isMain ? '#e8b84b' : '#ccc', fontWeight: isMain ? 700 : 400 }}>
                        {item?.displayName ?? prod.item}
                      </div>
                      <div style={{ fontSize: 11, color: '#7ab8b8' }}>{fmtRate(prod.amount, duration)}/min</div>
                    </div>
                  </div>
                )
              })}
              {/* 부산물 */}
              {recipe.byproducts && recipe.byproducts.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: '#555', marginTop: 8, marginBottom: 4 }}>부산물</div>
                  {recipe.byproducts.map((bp) => {
                    const item = itemMap[bp.item]
                    return (
                      <div key={bp.item} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, opacity: 0.7 }}>
                        <ItemIcon iconPath={item?.iconPath ?? null} size={18} />
                        <div>
                          <div style={{ fontSize: 11, color: '#7ab8b8' }}>{item?.displayName ?? bp.item}</div>
                          <div style={{ fontSize: 10, color: '#556' }}>{fmtRate(bp.amount, duration)}/min</div>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {/* 건물 정보 (전력 등) */}
          {building && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #1a1a2a', display: 'flex', gap: 20, fontSize: 11, color: '#666' }}>
              <span>⚡ {building.powerConsumption} MW</span>
              {building.somersloopSlots > 0 && <span>슬롯 ×{building.somersloopSlots}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
