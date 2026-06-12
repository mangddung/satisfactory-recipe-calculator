import { useState } from 'react'
import { Table, Input, Select, Tag, Button, Modal, Descriptions, Space, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useItems, useItemDetail, useClassify } from '../../api/admin'
import ItemIcon from '../../components/ItemIcon'
import type { Item } from '../../types'

const { Search } = Input

const ACQUISITION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'miner', label: '채굴기' },
  { value: 'oil_extractor', label: '원유 추출기' },
  { value: 'water_extractor', label: '물 추출기' },
  { value: 'resource_well', label: '자원 정제소' },
  { value: 'natural', label: '자연 채집' },
  { value: 'byproduct', label: '부산물' },
  { value: 'manufactured', label: '제조' },
  { value: 'other', label: '기타' },
  { value: 'unclassified', label: '미분류' },
]

const ACQ_COLOR: Record<string, string> = {
  miner: 'blue', oil_extractor: 'orange', water_extractor: 'cyan',
  resource_well: 'purple', natural: 'green', byproduct: 'gold',
  manufactured: 'geekblue', other: 'default', unclassified: 'red',
}

export default function ItemsTab() {
  const [search, setSearch] = useState('')
  const [acqFilter, setAcqFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [classifyTarget, setClassifyTarget] = useState<Item | null>(null)
  const [classifyValue, setClassifyValue] = useState<string>('')

  const { data: items = [], isLoading } = useItems()
  const { data: detail, isLoading: detailLoading } = useItemDetail(selectedId)
  const classify = useClassify()

  const filtered = items.filter((it) => {
    const matchSearch = it.displayName.toLowerCase().includes(search.toLowerCase())
    const matchAcq = !acqFilter || it.acquisition === acqFilter
    return matchSearch && matchAcq
  })

  const columns: ColumnsType<Item> = [
    {
      title: '아이콘', width: 60, render: (_, r) => <ItemIcon iconPath={r.iconPath} size={36} />,
    },
    { title: '이름', dataIndex: 'displayName', sorter: (a, b) => a.displayName.localeCompare(b.displayName) },
    { title: 'ID', dataIndex: 'id', render: (v) => <Typography.Text code copyable style={{ fontSize: 11 }}>{v}</Typography.Text> },
    {
      title: '분류', dataIndex: 'acquisition', width: 130,
      render: (v) => v ? <Tag color={ACQ_COLOR[v] ?? 'default'}>{v}</Tag> : <Tag color="red">미분류</Tag>,
    },
    {
      title: '유체', dataIndex: 'isFluid', width: 70,
      render: (v) => v ? <Tag color="cyan">유체</Tag> : null,
    },
    {
      title: '작업', width: 120,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" onClick={() => setSelectedId(r.id)}>상세</Button>
          <Button size="small" type="dashed" onClick={() => { setClassifyTarget(r); setClassifyValue(r.acquisition ?? '') }}>분류</Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Search placeholder="아이템 검색" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} allowClear />
        <Select options={ACQUISITION_OPTIONS} value={acqFilter} onChange={setAcqFilter} style={{ width: 160 }} placeholder="분류 필터" />
        <Typography.Text type="secondary">{filtered.length}개</Typography.Text>
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
        title={detail?.displayName ?? '아이템 상세'}
        open={!!selectedId}
        onCancel={() => setSelectedId(null)}
        footer={null}
        width={640}
      >
        {detailLoading ? '로딩 중...' : detail && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
            <Descriptions.Item label="분류">
              <Tag color={ACQ_COLOR[detail.acquisition ?? ''] ?? 'default'}>{detail.acquisition ?? '미분류'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="유체">{detail.isFluid ? '예' : '아니오'}</Descriptions.Item>
            <Descriptions.Item label="스택 크기">{detail.stackSize ?? '-'}</Descriptions.Item>
            {detail.description && <Descriptions.Item label="설명">{detail.description}</Descriptions.Item>}
            {detail.usedInRecipes?.length > 0 && (
              <Descriptions.Item label="사용 레시피">
                {detail.usedInRecipes.map((r) => <Tag key={r.id}>{r.displayName}</Tag>)}
              </Descriptions.Item>
            )}
            {detail.producedByRecipes?.length > 0 && (
              <Descriptions.Item label="생산 레시피">
                {detail.producedByRecipes.map((r) => <Tag key={r.id} color="green">{r.displayName}</Tag>)}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* 분류 지정 모달 */}
      <Modal
        title={`분류 지정 — ${classifyTarget?.displayName}`}
        open={!!classifyTarget}
        onCancel={() => setClassifyTarget(null)}
        onOk={async () => {
          if (!classifyTarget || !classifyValue) return
          await classify.mutateAsync({ item_id: classifyTarget.id, acquisition: classifyValue })
          setClassifyTarget(null)
        }}
        confirmLoading={classify.isPending}
      >
        <Select
          value={classifyValue}
          onChange={setClassifyValue}
          style={{ width: '100%' }}
          options={ACQUISITION_OPTIONS.filter((o) => o.value)}
        />
      </Modal>
    </>
  )
}
