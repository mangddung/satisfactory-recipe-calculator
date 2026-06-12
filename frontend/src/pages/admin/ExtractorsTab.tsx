import { useState, useMemo } from 'react'
import { Table, Input, Tag } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import type { Extractor } from '../../types'

const ACQUISITION_COLORS: Record<string, string> = {
  miner: 'blue',
  oil_extractor: 'orange',
  water_extractor: 'cyan',
  resource_well: 'purple',
}

const ACQUISITION_LABELS: Record<string, string> = {
  miner: '광부',
  oil_extractor: '원유 추출기',
  water_extractor: '수원 추출기',
  resource_well: '자원 정제기',
}

export default function ExtractorsTab() {
  const [search, setSearch] = useState('')

  const { data: extractorMap = {}, isLoading } = useQuery({
    queryKey: ['extractors'],
    queryFn: () =>
      apiFetch<{ extractors: Record<string, Extractor> }>('/api/extractors').then(
        (r) => r.extractors,
      ),
  })

  const extractors = useMemo(
    () => Object.values(extractorMap).sort((a, b) => a.baseRatePerMin - b.baseRatePerMin),
    [extractorMap],
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return extractors
    const q = search.toLowerCase()
    return extractors.filter(
      (e) => e.displayName.toLowerCase().includes(q) || e.acquisitionType.includes(q),
    )
  }, [extractors, search])

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ color: '#e8b84b', fontWeight: 700, fontSize: 16 }}>추출기 시설</span>
        <Input
          placeholder="이름 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 240 }}
        />
      </div>

      <Table
        dataSource={filtered}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="small"
        columns={[
          {
            title: '이름',
            dataIndex: 'displayName',
            render: (name: string) => (
              <span style={{ color: '#ddd', fontWeight: 500 }}>{name}</span>
            ),
          },
          {
            title: '유형',
            dataIndex: 'acquisitionType',
            width: 160,
            render: (t: string) => (
              <Tag color={ACQUISITION_COLORS[t] ?? 'default'}>
                {ACQUISITION_LABELS[t] ?? t}
              </Tag>
            ),
          },
          {
            title: '기본 속도 (/min)',
            dataIndex: 'baseRatePerMin',
            width: 140,
            align: 'right',
            render: (v: number) => (
              <span style={{ color: '#7ab8b8', fontWeight: 600 }}>{v}</span>
            ),
          },
          {
            title: '소비 전력 (MW)',
            dataIndex: 'powerConsumption',
            width: 140,
            align: 'right',
            render: (v: number) => (
              <span style={{ color: '#e8b84b' }}>{v}</span>
            ),
          },
          {
            title: 'ID',
            dataIndex: 'id',
            ellipsis: true,
            render: (id: string) => (
              <span style={{ color: '#555', fontSize: 11, fontFamily: 'monospace' }}>{id}</span>
            ),
          },
        ]}
      />
    </div>
  )
}
