import { useState } from 'react'
import { Table, Input, Tag, Button, Modal, Descriptions, Space, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useBuildings, useBuildingDetail } from '../../api/admin'
import ItemIcon from '../../components/ItemIcon'
import type { Building } from '../../types'

const { Search } = Input

export default function BuildingsTab() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: buildings = [], isLoading } = useBuildings()
  const { data: detail, isLoading: detailLoading } = useBuildingDetail(selectedId)

  const filtered = buildings.filter((b) =>
    b.displayName.toLowerCase().includes(search.toLowerCase()),
  )

  const columns: ColumnsType<Building> = [
    { title: '아이콘', width: 60, render: (_, r) => <ItemIcon iconPath={r.iconPath} size={40} /> },
    { title: '이름', dataIndex: 'displayName', sorter: (a, b) => a.displayName.localeCompare(b.displayName) },
    { title: 'ID', dataIndex: 'id', render: (v) => <Typography.Text code style={{ fontSize: 11 }}>{v}</Typography.Text> },
    { title: '카테고리', dataIndex: 'buildingCategory', width: 130, render: (v) => v ? <Tag>{v}</Tag> : '-' },
    { title: '전력(MW)', dataIndex: 'powerConsumption', width: 100, render: (v) => v > 0 ? `${v} MW` : '-' },
    {
      title: '작업', width: 80,
      render: (_, r) => <Button size="small" onClick={() => setSelectedId(r.id)}>상세</Button>,
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Search placeholder="건물 검색" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} allowClear />
        <Typography.Text type="secondary">{filtered.length}개</Typography.Text>
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
        title={detail?.displayName ?? '건물 상세'}
        open={!!selectedId}
        onCancel={() => setSelectedId(null)}
        footer={null}
        width={600}
      >
        {detailLoading ? '로딩 중...' : detail && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <ItemIcon iconPath={detail.iconPath} size={64} />
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="카테고리">{detail.buildingCategory ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="전력">{detail.powerConsumption > 0 ? `${detail.powerConsumption} MW` : '-'}</Descriptions.Item>
              <Descriptions.Item label="소머슬룹 슬롯">{detail.somersloopSlots ?? 0}</Descriptions.Item>
              {detail.description && <Descriptions.Item label="설명">{detail.description}</Descriptions.Item>}
              {detail.usedInRecipes?.length > 0 && (
                <Descriptions.Item label="사용 레시피">
                  {detail.usedInRecipes.map((r) => <Tag key={r.id}>{r.displayName}</Tag>)}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Space>
        )}
      </Modal>
    </>
  )
}
