import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Input, Select, Tag, Button, Modal, Descriptions, Space, Typography, Card, Statistic, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useItems, useItemDetail, useClassify, useRecipes, useBuildings } from '../../api/admin'
import ItemIcon from '../../components/ItemIcon'
import { useLang, type TKey } from '../../i18n'
import type { Item } from '../../types'

const { Search } = Input

const ACQUISITION_OPTIONS: { value: string; label: TKey }[] = [
  { value: '', label: 'items.acq.all' },
  { value: 'miner', label: 'items.acq.miner' },
  { value: 'oil_extractor', label: 'items.acq.oil_extractor' },
  { value: 'water_extractor', label: 'items.acq.water_extractor' },
  { value: 'resource_well', label: 'items.acq.resource_well' },
  { value: 'natural', label: 'items.acq.natural' },
  { value: 'byproduct', label: 'items.acq.byproduct' },
  { value: 'manufactured', label: 'items.acq.manufactured' },
  { value: 'other', label: 'items.acq.other' },
  { value: 'unclassified', label: 'items.acq.unclassified' },
]

const ACQ_COLOR: Record<string, string> = {
  miner: 'blue', oil_extractor: 'orange', water_extractor: 'cyan',
  resource_well: 'purple', natural: 'green', byproduct: 'gold',
  manufactured: 'geekblue', other: 'default', unclassified: 'red',
}

// null 은 미분류로 취급
const acqOf = (it: { acquisition: string | null }) => it.acquisition ?? 'unclassified'

export default function ItemsTab() {
  const { t } = useLang()
  const navigate = useNavigate()
  const acquisitionOptions = ACQUISITION_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))
  const [search, setSearch] = useState('')
  const [acqFilter, setAcqFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, string>>({})

  const { data: items = [], isLoading } = useItems()
  const { data: detail, isLoading: detailLoading } = useItemDetail(selectedId)
  const classify = useClassify()
  const { data: recipes = [] } = useRecipes()
  const { data: buildings = [] } = useBuildings()
  const unclassifiedCount = items.filter((it) => acqOf(it) === 'unclassified').length
  const pendingCount = Object.keys(pending).length

  const q = search.toLowerCase()
  const filtered = items.filter((it) => {
    const matchSearch = it.displayName.toLowerCase().includes(q) || it.id.toLowerCase().includes(q)
    const matchAcq = !acqFilter || acqOf(it) === acqFilter
    return matchSearch && matchAcq
  })

  function changeClassification(it: Item, value: string) {
    setPending((prev) => {
      const next = { ...prev }
      if (value === acqOf(it)) delete next[it.id]
      else next[it.id] = value
      return next
    })
  }

  async function saveAll() {
    const entries = Object.entries(pending).map(([item_id, acquisition]) => ({ item_id, acquisition }))
    const { saved, failed } = await classify.mutateAsync(entries)
    setPending((prev) => {
      const next = { ...prev }
      saved.forEach((id) => delete next[id])
      return next
    })
    if (failed === 0) message.success(t('items.savedHint', { count: saved.length }))
    else message.error(t('items.saveFailed', { saved: saved.length, failed }))
  }

  function openRecipe(recipeId: string) {
    navigate(`/admin/recipes?recipe=${encodeURIComponent(recipeId)}`)
  }

  const columns: ColumnsType<Item> = [
    {
      title: t('common.icon'), width: 60, render: (_, r) => <ItemIcon iconPath={r.iconPath} size={36} />,
    },
    { title: t('common.name'), dataIndex: 'displayName', sorter: (a, b) => a.displayName.localeCompare(b.displayName) },
    { title: 'ID', dataIndex: 'id', render: (v) => <Typography.Text code copyable style={{ fontSize: 11 }}>{v}</Typography.Text> },
    {
      title: t('items.classification'), width: 170,
      render: (_, r) => (
        <Select
          size="small"
          style={{ width: 150 }}
          value={pending[r.id] ?? acqOf(r)}
          status={pending[r.id] ? 'warning' : undefined}
          onChange={(v) => changeClassification(r, v)}
          options={acquisitionOptions.filter((o) => o.value)}
        />
      ),
    },
    {
      title: t('items.fluid'), dataIndex: 'isFluid', width: 70,
      render: (v) => v ? <Tag color="cyan">{t('items.fluid')}</Tag> : null,
    },
    {
      title: t('common.actions'), width: 80,
      render: (_, r) => <Button size="small" onClick={() => setSelectedId(r.id)}>{t('common.detail')}</Button>,
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Card size="small">
          <Statistic
            title={t('items.acq.unclassified')}
            value={unclassifiedCount}
            valueStyle={{ color: unclassifiedCount > 0 ? '#e74c3c' : undefined }}
          />
        </Card>
        <Card size="small"><Statistic title={t('admin.totalItems')} value={items.length} /></Card>
        <Card size="small"><Statistic title={t('admin.recipes')} value={recipes.length} /></Card>
        <Card size="small"><Statistic title={t('common.buildings')} value={buildings.length} /></Card>
      </Space>

      <Space style={{ marginBottom: 16, display: 'flex' }} wrap>
        <Search placeholder={t('items.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} allowClear />
        <Select options={acquisitionOptions} value={acqFilter} onChange={setAcqFilter} style={{ width: 160 }} placeholder={t('items.filterPlaceholder')} />
        <Button type="primary" disabled={pendingCount === 0} loading={classify.isPending} onClick={saveAll}>
          {t('items.saveChanges')}
        </Button>
        {pendingCount > 0 && <Typography.Text type="warning">{t('items.pendingCount', { count: pendingCount })}</Typography.Text>}
        <Typography.Text type="secondary">{t('common.count', { count: filtered.length })}</Typography.Text>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 50, showSizeChanger: true }}
        onRow={(r) => ({ onDoubleClick: () => setSelectedId(r.id) })}
      />

      {/* 상세 모달 */}
      <Modal
        title={detail?.displayName ?? t('items.detailTitle')}
        open={!!selectedId}
        onCancel={() => setSelectedId(null)}
        footer={null}
        width={680}
      >
        {detailLoading ? t('common.loading') : detail && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <ItemIcon iconPath={detail.iconPath} size={64} />
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label={t('items.classification')}>
                <Tag color={ACQ_COLOR[acqOf(detail)] ?? 'default'}>{acqOf(detail)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('items.fluid')}>{detail.isFluid ? t('common.yes') : t('common.no')}</Descriptions.Item>
              <Descriptions.Item label={t('items.stackSize')}>{detail.stackSize ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="className">{detail.className ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="slug">{detail.slug ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="producedBy">{detail.producedBy ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="iconPath">{detail.iconPath ?? '-'}</Descriptions.Item>
              {detail.description && <Descriptions.Item label={t('common.description')}>{detail.description}</Descriptions.Item>}
              {detail.usedInRecipes?.length > 0 && (
                <Descriptions.Item label={t('common.usedInRecipes')}>
                  {detail.usedInRecipes.map((r) => (
                    <Tag key={r.id} style={{ cursor: 'pointer' }} onClick={() => openRecipe(r.id)}>{r.displayName}</Tag>
                  ))}
                </Descriptions.Item>
              )}
              {detail.producedByRecipes?.length > 0 && (
                <Descriptions.Item label={t('items.producedByRecipes')}>
                  {detail.producedByRecipes.map((r) => (
                    <Tag key={r.id} color="green" style={{ cursor: 'pointer' }} onClick={() => openRecipe(r.id)}>{r.displayName}</Tag>
                  ))}
                </Descriptions.Item>
              )}
            </Descriptions>
            <Typography.Text type="secondary">{t('items.rawHints')}</Typography.Text>
            <Descriptions bordered size="small" column={1}>
              {Object.entries(detail.rawHints ?? {}).map(([k, v]) => (
                <Descriptions.Item key={k} label={k}>
                  <Typography.Text code style={{ fontSize: 11 }}>{typeof v === 'string' ? v : JSON.stringify(v)}</Typography.Text>
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Space>
        )}
      </Modal>
    </>
  )
}
