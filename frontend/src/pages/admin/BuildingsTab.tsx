import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Input, Tag, Button, Modal, Descriptions, Space, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useBuildings, useBuildingDetail } from '../../api/admin'
import ItemIcon from '../../components/ItemIcon'
import { useLang } from '../../i18n'
import type { Building } from '../../types'

const { Search } = Input

export default function BuildingsTab() {
  const { t } = useLang()
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: buildings = [], isLoading } = useBuildings()
  const { data: detail, isLoading: detailLoading } = useBuildingDetail(selectedId)

  const filtered = buildings.filter((b) =>
    b.displayName.toLowerCase().includes(search.toLowerCase()),
  )

  const columns: ColumnsType<Building> = [
    { title: t('common.icon'), width: 60, render: (_, r) => <ItemIcon iconPath={r.iconPath} size={40} /> },
    { title: t('common.name'), dataIndex: 'displayName', sorter: (a, b) => a.displayName.localeCompare(b.displayName) },
    { title: 'ID', dataIndex: 'id', render: (v) => <Typography.Text code style={{ fontSize: 11 }}>{v}</Typography.Text> },
    { title: t('common.category'), dataIndex: 'buildingCategory', width: 130, render: (v) => v ? <Tag>{v}</Tag> : '-' },
    { title: t('buildings.powerMW'), dataIndex: 'powerConsumption', width: 100, render: (v) => v > 0 ? `${v} MW` : '-' },
    { title: t('buildings.somersloopSlots'), dataIndex: 'somersloopSlots', width: 120, sorter: (a, b) => a.somersloopSlots - b.somersloopSlots, render: (v) => v > 0 ? v : '-' },
    {
      title: t('common.actions'), width: 80,
      render: (_, r) => <Button size="small" onClick={() => setSelectedId(r.id)}>{t('common.detail')}</Button>,
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Search placeholder={t('buildings.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} allowClear />
        <Typography.Text type="secondary">{t('common.count', { count: filtered.length })}</Typography.Text>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={isLoading}
        size="small"
        pagination={{ pageSize: 50 }}
        onRow={(r) => ({ onClick: () => setSelectedId(r.id) })}
      />

      <Modal
        title={detail?.displayName ?? t('buildings.detailTitle')}
        open={!!selectedId}
        onCancel={() => setSelectedId(null)}
        footer={null}
        width={600}
      >
        {detailLoading ? t('common.loading') : detail && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <ItemIcon iconPath={detail.iconPath} size={64} />
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label={t('common.category')}>{detail.buildingCategory ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t('common.power')}>{detail.powerConsumption > 0 ? `${detail.powerConsumption} MW` : '-'}</Descriptions.Item>
              <Descriptions.Item label={t('buildings.somersloopSlots')}>{detail.somersloopSlots ?? 0}</Descriptions.Item>
              {detail.description && <Descriptions.Item label={t('common.description')}>{detail.description}</Descriptions.Item>}
              {detail.usedInRecipes?.length > 0 && (
                <Descriptions.Item label={t('common.usedInRecipes')}>
                  {detail.usedInRecipes.map((r) => (
                    <Tag key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/recipes?recipe=${encodeURIComponent(r.id)}`)}>{r.displayName}</Tag>
                  ))}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Space>
        )}
      </Modal>
    </>
  )
}
