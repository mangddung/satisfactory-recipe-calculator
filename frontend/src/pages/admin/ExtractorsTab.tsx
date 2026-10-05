import { useState, useMemo } from 'react'
import { Table, Input, Tag } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api'
import { useLang, type TKey } from '../../i18n'
import type { Extractor } from '../../types'

const ACQUISITION_COLORS: Record<string, string> = {
  miner: 'blue',
  oil_extractor: 'orange',
  water_extractor: 'cyan',
  resource_well: 'purple',
}

const ACQUISITION_LABELS: Record<string, TKey> = {
  miner: 'extractors.acq.miner',
  oil_extractor: 'extractors.acq.oil_extractor',
  water_extractor: 'extractors.acq.water_extractor',
  resource_well: 'extractors.acq.resource_well',
}

export default function ExtractorsTab() {
  const { t } = useLang()
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
        <span style={{ color: '#e8b84b', fontWeight: 700, fontSize: 16 }}>{t('extractors.title')}</span>
        <Input
          placeholder={t('extractors.searchPlaceholder')}
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
            title: t('common.name'),
            dataIndex: 'displayName',
            render: (name: string) => (
              <span style={{ color: '#ddd', fontWeight: 500 }}>{name}</span>
            ),
          },
          {
            title: t('extractors.type'),
            dataIndex: 'acquisitionType',
            width: 160,
            render: (type: string) => (
              <Tag color={ACQUISITION_COLORS[type] ?? 'default'}>
                {ACQUISITION_LABELS[type] ? t(ACQUISITION_LABELS[type]) : type}
              </Tag>
            ),
          },
          {
            title: t('extractors.baseRate'),
            dataIndex: 'baseRatePerMin',
            width: 140,
            align: 'right',
            render: (v: number) => (
              <span style={{ color: '#7ab8b8', fontWeight: 600 }}>{v}</span>
            ),
          },
          {
            title: t('extractors.powerConsumption'),
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
