import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Table, Input, Select, Tag, Button, Modal, Descriptions, Space, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRecipes, useBuildings, useItems } from '../../api/admin'
import type { Recipe } from '../../types'
import ItemIcon from '../../components/ItemIcon'
import { useLang } from '../../i18n'
import ChainModal from './ChainModal'

const { Search } = Input

// 분당 생산량, 소수 2자리까지
function perMin(amount: number, duration: number): string {
  return duration > 0 ? `${parseFloat(((amount / duration) * 60).toFixed(2))}/min` : ''
}

export default function RecipesTab() {
  const { t } = useLang()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('')
  // 상세는 ?recipe=<id> 로 열림 → 아이템·건물 상세의 레시피 태그에서 바로 이동 가능
  const [searchParams, setSearchParams] = useSearchParams()
  const [chainRecipe, setChainRecipe] = useState<Recipe | null>(null)

  const { data: recipes = [], isLoading } = useRecipes()
  const { data: buildings = [] } = useBuildings()
  const { data: items = [] } = useItems()
  const selectedRecipe = recipes.find((r) => r.id === searchParams.get('recipe')) ?? null
  const setSelectedRecipe = (r: Recipe | null) => setSearchParams(r ? { recipe: r.id } : {})

  const buildingMap = useMemo(
    () => Object.fromEntries(buildings.map((b) => [b.id, b])),
    [buildings],
  )
  const itemMap = useMemo(
    () => Object.fromEntries(items.map((it) => [it.id, it])),
    [items],
  )

  const buildingOptions = useMemo(() => {
    const opts = buildings.map((b) => ({ value: b.id, label: b.displayName }))
    return [{ value: '', label: t('recipes.allBuildings') }, ...opts]
  }, [buildings, t])

  const q = search.toLowerCase()
  const filtered = recipes.filter((r) => {
    const matchSearch = r.displayName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
    const matchType = !typeFilter || r.recipeType === typeFilter
    const matchBuilding = !buildingFilter || (r.producedIn ?? []).includes(buildingFilter)
    return matchSearch && matchType && matchBuilding
  })

  const columns: ColumnsType<Recipe> = [
    {
      title: t('recipes.productIcon'), width: 100,
      render: (_, r) => {
        const firstProduct = r.products?.[0]
        return firstProduct
          ? <ItemIcon iconPath={itemMap[firstProduct.item]?.iconPath ?? null} size={56} />
          : null
      },
    },
    { title: t('recipes.name'), dataIndex: 'displayName', sorter: (a, b) => a.displayName.localeCompare(b.displayName) },
    {
      title: t('recipes.type'), dataIndex: 'recipeType', width: 110,
      render: (v) => <Tag color={v === 'production' ? 'green' : 'default'}>{v}</Tag>,
    },
    {
      title: t('common.buildings'), width: 160,
      render: (_, r) => (r.producedIn ?? []).map((id) => (
        <Tag key={id}>{buildingMap[id]?.displayName ?? id}</Tag>
      )),
    },
    {
      title: t('recipes.time'), dataIndex: 'manufactoringDuration', width: 80,
      render: (v) => v ? `${v}s` : '-',
    },
    {
      title: t('recipes.ingredients'),
      render: (_, r) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {r.ingredients.map((i) => itemMap[i.item]?.displayName ?? i.item).join(', ')}
        </Typography.Text>
      ),
    },
    {
      title: t('recipes.products'),
      render: (_, r) => r.products.map((p) => (
        <div key={p.item} style={{ fontSize: 12 }}>
          {itemMap[p.item]?.displayName ?? p.item} ×{p.amount}{' '}
          <span style={{ color: '#7ab8b8' }}>{perMin(p.amount, r.manufactoringDuration)}</span>
        </div>
      )),
    },
    {
      title: t('common.actions'), width: 130,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" onClick={() => setSelectedRecipe(r)}>{t('common.detail')}</Button>
          {r.recipeType === 'production' && (
            <Button size="small" type="primary" ghost onClick={() => setChainRecipe(r)}>{t('recipes.chain')}</Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Search placeholder={t('recipes.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} allowClear />
        <Select
          value={typeFilter} onChange={setTypeFilter} style={{ width: 160 }}
          options={[{ value: '', label: t('recipes.allTypes') }, { value: 'production', label: 'production' }, { value: 'construction', label: 'construction' }, { value: 'manual', label: 'manual' }]}
        />
        <Select value={buildingFilter} onChange={setBuildingFilter} style={{ width: 180 }} options={buildingOptions} />
        <Typography.Text type="secondary">{t('common.count', { count: filtered.length })}</Typography.Text>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />

      <Modal
        title={selectedRecipe?.displayName}
        open={!!selectedRecipe}
        onCancel={() => setSelectedRecipe(null)}
        footer={null}
        width={600}
      >
        {selectedRecipe && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label={t('recipes.type')}>
              <Tag color={selectedRecipe.recipeType === 'production' ? 'green' : 'default'}>{selectedRecipe.recipeType}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('common.buildings')}>
              {(selectedRecipe.producedIn ?? []).map((id) => (
                <Tag key={id}>{buildingMap[id]?.displayName ?? id}</Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label={t('recipes.craftTime')}>{t('common.seconds', { value: selectedRecipe.manufactoringDuration })}</Descriptions.Item>
            <Descriptions.Item label={t('recipes.ingredients')}>
              {selectedRecipe.ingredients.map((ing) => (
                <Tag key={ing.item}>{itemMap[ing.item]?.displayName ?? ing.item} ×{ing.amount}</Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label={t('recipes.products')}>
              {selectedRecipe.products.map((p) => (
                <Tag key={p.item} color="green">{itemMap[p.item]?.displayName ?? p.item} ×{p.amount}</Tag>
              ))}
            </Descriptions.Item>
            {selectedRecipe.byproducts?.length > 0 && (
              <Descriptions.Item label={t('recipes.byproducts')}>
                {selectedRecipe.byproducts.map((p) => (
                  <Tag key={p.item} color="gold">{itemMap[p.item]?.displayName ?? p.item} ×{p.amount}</Tag>
                ))}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {chainRecipe && (
        <ChainModal recipe={chainRecipe} onClose={() => setChainRecipe(null)} />
      )}
    </>
  )
}
