import { useState, useMemo } from 'react'
import { Table, Input, Select, Tag, Button, Modal, Descriptions, Space, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRecipes, useBuildings, useItems } from '../../api/admin'
import type { Recipe } from '../../types'
import ItemIcon from '../../components/ItemIcon'
import ChainModal from './ChainModal'

const { Search } = Input

export default function RecipesTab() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [buildingFilter, setBuildingFilter] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [chainRecipe, setChainRecipe] = useState<Recipe | null>(null)

  const { data: recipes = [], isLoading } = useRecipes()
  const { data: buildings = [] } = useBuildings()
  const { data: items = [] } = useItems()

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
    return [{ value: '', label: '전체 건물' }, ...opts]
  }, [buildings])

  const filtered = recipes.filter((r) => {
    const matchSearch = r.displayName.toLowerCase().includes(search.toLowerCase())
    const matchType = !typeFilter || r.recipeType === typeFilter
    const matchBuilding = !buildingFilter || (r.producedIn ?? []).includes(buildingFilter)
    return matchSearch && matchType && matchBuilding
  })

  const columns: ColumnsType<Recipe> = [
    {
      title: '산물 아이콘', width: 100,
      render: (_, r) => {
        const firstProduct = r.products?.[0]
        return firstProduct
          ? <ItemIcon iconPath={itemMap[firstProduct.item]?.iconPath ?? null} size={56} />
          : null
      },
    },
    { title: '레시피명', dataIndex: 'displayName', sorter: (a, b) => a.displayName.localeCompare(b.displayName) },
    {
      title: '타입', dataIndex: 'recipeType', width: 110,
      render: (v) => <Tag color={v === 'production' ? 'green' : 'default'}>{v}</Tag>,
    },
    {
      title: '건물', width: 160,
      render: (_, r) => (r.producedIn ?? []).map((id) => (
        <Tag key={id}>{buildingMap[id]?.displayName ?? id}</Tag>
      )),
    },
    {
      title: '시간', dataIndex: 'manufactoringDuration', width: 80,
      render: (v) => v ? `${v}s` : '-',
    },
    {
      title: '작업', width: 130,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" onClick={() => setSelectedRecipe(r)}>상세</Button>
          {r.recipeType === 'production' && (
            <Button size="small" type="primary" ghost onClick={() => setChainRecipe(r)}>체인</Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Search placeholder="레시피 검색" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} allowClear />
        <Select
          value={typeFilter} onChange={setTypeFilter} style={{ width: 160 }}
          options={[{ value: '', label: '전체 타입' }, { value: 'production', label: 'production' }, { value: 'construction', label: 'construction' }]}
        />
        <Select value={buildingFilter} onChange={setBuildingFilter} style={{ width: 180 }} options={buildingOptions} />
        <Typography.Text type="secondary">{filtered.length}개</Typography.Text>
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
            <Descriptions.Item label="타입">
              <Tag color={selectedRecipe.recipeType === 'production' ? 'green' : 'default'}>{selectedRecipe.recipeType}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="건물">
              {(selectedRecipe.producedIn ?? []).map((id) => (
                <Tag key={id}>{buildingMap[id]?.displayName ?? id}</Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="제조 시간">{selectedRecipe.manufactoringDuration}초</Descriptions.Item>
            <Descriptions.Item label="재료">
              {selectedRecipe.ingredients.map((ing) => (
                <Tag key={ing.item}>{ing.item} ×{ing.amount}</Tag>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="산물">
              {selectedRecipe.products.map((p) => (
                <Tag key={p.item} color="green">{p.item} ×{p.amount}</Tag>
              ))}
            </Descriptions.Item>
            {selectedRecipe.byproducts?.length > 0 && (
              <Descriptions.Item label="부산물">
                {selectedRecipe.byproducts.map((p) => (
                  <Tag key={p.item} color="gold">{p.item} ×{p.amount}</Tag>
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
