import { useState, useMemo, useEffect, useCallback, Fragment } from 'react'
import {
  Button,
  InputNumber,
  Spin,
  Alert,
  Modal,
  Input,
  message,
  Empty,
  Divider,
  Select,
  Tag,
  Checkbox,
} from 'antd'
import {
  SaveOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  MenuOutlined,
} from '@ant-design/icons'
import {
  useCraftableItems,
  useCalculate,
  usePlans,
  useSavePlan,
  useDeletePlan,
  useConveyors,
  useExtractors,
  useGameConstants,
  useGameItems,
  useGameRecipes,
  useGameBuildings,
} from '../../api/calculator'
import type {
  CalculationResult,
  ChainNode,
  Extractor,
  Plan,
  RawNodeSettings,
  NodeConfig,
  Purity,
} from '../../types'
import ChainTree from '../../components/ChainTree'
import ItemIcon from '../../components/ItemIcon'
import styles from './CalculatorPage.module.css'

function setCookie(name: string, value: string) {
  const exp = new Date()
  exp.setFullYear(exp.getFullYear() + 1)
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${exp.toUTCString()};path=/`
}

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

function aggregateBuildings(node: ChainNode, acc: Record<string, number> = {}): Record<string, number> {
  if (node.recipe) {
    const bid = node.recipe.producedIn?.[0]
    if (bid) acc[bid] = (acc[bid] ?? 0) + node.buildingCountCeil
  }
  node.children.forEach((c) => aggregateBuildings(c, acc))
  return acc
}

function trimToDepth(node: ChainNode, depth: number): ChainNode {
  if (depth <= 0) return { ...node, children: [], byproductOutputs: [] }
  return { ...node, children: node.children.map((c) => trimToDepth(c, depth - 1)) }
}

function collectRawDefaults(
  node: ChainNode,
  acc: Record<string, RawNodeSettings> = {},
  extractors: Record<string, Extractor> = {},
  purityMultipliers: Record<string, number> = {},
  extractorOverrides: Record<string, string> = {},
): Record<string, RawNodeSettings> {
  if (!node.recipe && node.extractorSuggestion) {
    const suggestion = node.extractorSuggestion
    const baseExt = extractors[suggestion.extractorId]
    const acqType = baseExt?.acquisitionType
    const overrideId = acqType ? extractorOverrides[acqType] : undefined
    const extractorId = overrideId ?? suggestion.extractorId
    const ext = extractors[extractorId]
    let count = suggestion.byPurity?.normal?.count ?? 1
    if (ext) {
      const ratePerNode = ext.baseRatePerMin * (purityMultipliers['normal'] ?? 1)
      count = Math.ceil(node.targetRate / ratePerNode)
    }
    const nodes: NodeConfig[] = Array.from({ length: count }, () => ({
      extractorId,
      purity: 'normal' as Purity,
      overclock: 100,
    }))
    acc[node.itemId] = { mode: 'nodes', nodes, manualRate: null }
  }
  node.children.forEach((c) =>
    collectRawDefaults(c, acc, extractors, purityMultipliers, extractorOverrides),
  )
  return acc
}

export default function CalculatorPage() {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [targetRate, setTargetRate] = useState<number>(60)
  const [recipeSelections, setRecipeSelections] = useState<Record<string, string>>({})
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [showFullChain, setShowFullChain] = useState(false)
  const [rawNodeSettings, setRawNodeSettings] = useState<Record<string, RawNodeSettings>>({})
  const [conveyorLimitValue, setConveyorLimitValue] = useState<number>(
    () => Number(getCookie('sc_conveyor') ?? '0'),
  )
  const [extractorLevel, setExtractorLevel] = useState<string>(
    () => getCookie('sc_extractor') ?? 'Build_MinerMk3_C',
  )
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [planName, setPlanName] = useState('')
  const [plansModalOpen, setPlansModalOpen] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const { data: craftable = [], isLoading: craftableLoading } = useCraftableItems()
  const { data: items = [] } = useGameItems()
  const { data: recipes = [] } = useGameRecipes()
  const { data: buildings = [] } = useGameBuildings()
  const { data: plans = [] } = usePlans()
  const { data: conveyors = [] } = useConveyors()
  const { data: extractors = {} } = useExtractors()
  const { data: gameConstants } = useGameConstants()

  const calculateMutation = useCalculate()
  const savePlanMutation = useSavePlan()
  const deletePlanMutation = useDeletePlan()

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

  const conveyorBelts = useMemo(
    () =>
      conveyors
        .filter((c) => c.type === 'belt')
        .sort((a, b) => a.itemsPerMin - b.itemsPerMin),
    [conveyors],
  )

  const minerExtractors = useMemo(
    () =>
      Object.values(extractors)
        .filter((e) => e.acquisitionType === 'miner')
        .sort((a, b) => a.baseRatePerMin - b.baseRatePerMin),
    [extractors],
  )

  const conveyorLimit = conveyorLimitValue === 0 ? Infinity : conveyorLimitValue

  const filteredCraftable = useMemo(() => {
    if (!sidebarSearch.trim()) return craftable
    const q = sidebarSearch.toLowerCase()
    return craftable.filter((c) => c.displayName.toLowerCase().includes(q))
  }, [craftable, sidebarSearch])

  const tieredCraftable = useMemo(() => {
    const groups = new Map<number, typeof filteredCraftable>()
    for (const item of filteredCraftable) {
      const tier = item.techTier ?? 99
      if (!groups.has(tier)) groups.set(tier, [])
      groups.get(tier)!.push(item)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b)
  }, [filteredCraftable])

  const selectedCraftable = craftable.find((c) => c.id === selectedItemId)

  useEffect(() => {
    if (!result) {
      setRawNodeSettings({})
      return
    }
    const pm = gameConstants?.purityMultipliers ?? {}
    setRawNodeSettings(
      collectRawDefaults(result.root, {}, extractors, pm, { miner: extractorLevel }),
    )
  }, [result, extractorLevel, extractors, gameConstants])

  useEffect(() => { setCookie('sc_conveyor', String(conveyorLimitValue)) }, [conveyorLimitValue])
  useEffect(() => { setCookie('sc_extractor', extractorLevel) }, [extractorLevel])

  const handleRawSettingsChange = useCallback(
    (itemId: string, settings: RawNodeSettings) => {
      setRawNodeSettings((prev) => ({ ...prev, [itemId]: settings }))
    },
    [],
  )

  function runCalculate(payload: { itemId: string; targetRate: number; recipeSelections: Record<string, string> }) {
    calculateMutation.mutate(payload, {
      onSuccess: (data) => setResult(data),
      onError: () => message.error('계산 실패'),
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedItemId) return
    const timer = setTimeout(() => {
      runCalculate({ itemId: selectedItemId, targetRate, recipeSelections })
    }, 500)
    return () => clearTimeout(timer)
  }, [targetRate])

  function handleItemSelect(itemId: string) {
    setSelectedItemId(itemId)
    setRecipeSelections({})
    setResult(null)
    setShowFullChain(false)
    runCalculate({ itemId, targetRate, recipeSelections: {} })
  }

  function handleToggleFullChain(checked: boolean) {
    setShowFullChain(checked)
  }

  function handleRecipeSelect(itemId: string, recipeId: string) {
    const next = { ...recipeSelections, [itemId]: recipeId }
    setRecipeSelections(next)
    if (selectedItemId) {
      calculateMutation.mutate(
        { itemId: selectedItemId, targetRate, recipeSelections: next },
        { onSuccess: (data) => setResult(data) },
      )
    }
  }

  function handleSavePlan() {
    if (!selectedItemId || !planName.trim()) return
    savePlanMutation.mutate(
      { name: planName.trim(), itemId: selectedItemId, targetRate, recipeSelections },
      {
        onSuccess: () => {
          message.success('플랜 저장됨')
          setSaveModalOpen(false)
          setPlanName('')
        },
        onError: () => message.error('저장 실패'),
      },
    )
  }

  function handleLoadPlan(plan: Plan) {
    setSelectedItemId(plan.itemId)
    setTargetRate(plan.targetRate)
    setRecipeSelections(plan.recipeSelections ?? {})
    setPlansModalOpen(false)
    calculateMutation.mutate(
      { itemId: plan.itemId, targetRate: plan.targetRate, recipeSelections: plan.recipeSelections ?? {} },
      {
        onSuccess: (data) => {
          setResult(data)
          setShowFullChain(true)
        },
      },
    )
  }

  const buildingSummary = useMemo(() => {
    if (!result) return []
    const root = showFullChain ? result.root : trimToDepth(result.root, 0)
    const agg = aggregateBuildings(root)
    return Object.entries(agg)
      .map(([id, count]) => ({ id, count, name: buildingMap[id]?.displayName ?? id }))
      .sort((a, b) => b.count - a.count)
  }, [result, buildingMap, showFullChain])

  const displayPowerMW = result
    ? showFullChain
      ? result.totalPowerMW
      : result.root.powerMW
    : 0

  const displayResources = useMemo(() => {
    if (!result) return []
    if (showFullChain) {
      return result.rawResources.map((r) => ({
        itemId: r.itemId,
        rate: r.rate,
        name: itemMap[r.itemId]?.displayName ?? r.itemId,
        iconPath: itemMap[r.itemId]?.iconPath ?? null,
      }))
    }
    return result.root.children.map((c) => ({
      itemId: c.itemId,
      rate: c.targetRate,
      name: itemMap[c.itemId]?.displayName ?? c.itemId,
      iconPath: itemMap[c.itemId]?.iconPath ?? null,
    }))
  }, [result, showFullChain, itemMap])

  return (
    <div className={styles.page}>
      {/* 좌측 사이드바 */}
      <div className={`${styles.sidebar} ${sidebarOpen ? '' : styles.sidebarCollapsed}`}>
        <div className={styles.sidebarTopBar}>
          <button className={styles.hamburger} onClick={() => setSidebarOpen((v) => !v)}>
            <MenuOutlined />
          </button>
          {sidebarOpen && <span className={styles.sidebarTitle}>아이템</span>}
        </div>
        {sidebarOpen && (
          <>
            <Input
              placeholder="검색..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              allowClear
              size="small"
              style={{ flexShrink: 0 }}
            />
            <div className={styles.itemList}>
              {craftableLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 24 }}>
                  <Spin size="small" />
                </div>
              )}
              {tieredCraftable.map(([tier, items], idx) => (
                <Fragment key={tier}>
                  <div className={`${styles.tierHeader} ${idx === 0 ? styles.tierHeaderFirst : ''}`}>
                    {tier === 99 ? (
                      <span className={styles.tierBadge}>기타</span>
                    ) : (
                      <>Tier <span className={styles.tierBadge}>{tier}</span></>
                    )}
                  </div>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`${styles.itemRow} ${selectedItemId === item.id ? styles.itemRowActive : ''}`}
                      onClick={() => handleItemSelect(item.id)}
                    >
                      <ItemIcon iconPath={item.iconPath} size={35} />
                      <span>{item.displayName}</span>
                    </div>
                  ))}
                </Fragment>
              ))}
              {!craftableLoading && filteredCraftable.length === 0 && (
                <div style={{ color: '#555', fontSize: 12, padding: '12px 8px' }}>결과 없음</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 메인 영역 */}
      <div className={styles.main}>
        {/* 컨트롤 바 */}
        <div className={styles.controls}>
          {selectedCraftable && (
            <div className={styles.selectedItemBadge}>
              <ItemIcon iconPath={selectedCraftable.iconPath} size={18} />
              <span>{selectedCraftable.displayName}</span>
            </div>
          )}
          <Checkbox
            checked={showFullChain}
            onChange={(e) => handleToggleFullChain(e.target.checked)}
            disabled={!selectedItemId}
          >
            전체 레시피 보기
          </Checkbox>
          <Select
            value={conveyorLimitValue}
            onChange={setConveyorLimitValue}
            size="small"
            style={{ width: 170 }}
            options={[
              { value: 0, label: '컨베이어: 무제한' },
              ...conveyorBelts.map((c) => ({
                value: c.itemsPerMin,
                label: `${c.displayName.replace('컨베이어 벨트 ', '')} — ${c.itemsPerMin}/min`,
              })),
            ]}
          />
          {minerExtractors.length > 0 && (
            <Select
              value={extractorLevel}
              onChange={setExtractorLevel}
              size="small"
              style={{ width: 130 }}
              options={minerExtractors.map((e) => ({ value: e.id, label: e.displayName }))}
            />
          )}
          <Button icon={<SaveOutlined />} disabled={!result || !selectedItemId} onClick={() => setSaveModalOpen(true)}>
            저장
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={() => setPlansModalOpen(true)}>
            불러오기{plans.length > 0 ? ` (${plans.length})` : ''}
          </Button>
        </div>

        {calculateMutation.isError && (
          <Alert type="error" message="계산 중 오류가 발생했습니다." style={{ marginBottom: 8 }} />
        )}

        {/* 아이템 미선택 */}
        {!selectedItemId && (
          <div className={styles.placeholder}>
            <Empty description="좌측에서 아이템을 선택하세요." />
          </div>
        )}

        {/* 레시피 뷰 (단일/전체 공통 — ChainTree 사용) */}
        {selectedItemId && (
          <div className={styles.body}>
            {/* 요약 패널 — 아이템 선택 시 항상 표시 */}
            <div className={styles.summary}>
              {selectedCraftable && (
                <div className={styles.summaryHeader}>
                  <ItemIcon iconPath={selectedCraftable.iconPath} size={35} />
                  <span className={styles.summaryTitle}>{selectedCraftable.displayName}</span>
                </div>
              )}

              {/* 생산량 입력 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
                <span style={{ fontSize: 14, color: '#888' }}>생산량</span>
                <InputNumber
                  value={targetRate}
                  onChange={(v) => setTargetRate(v ?? 1)}
                  min={0.001}
                  step={10}
                  addonAfter="/min"
                  size="small"
                  style={{ width: 130 }}
                />
              </div>

              {result && (
                <>
                  <div className={styles.statRow}>
                    <ThunderboltOutlined style={{ color: '#e8b84b' }} />
                    <span style={{ color: '#ccc', flex: 1, fontSize: 14 }}>총 전력</span>
                    <span style={{ color: '#e8b84b', fontWeight: 700, fontSize: 14 }}>
                      {displayPowerMW.toFixed(1)} MW
                    </span>
                  </div>

                  <Divider style={{ borderColor: '#1e1e30', margin: '10px 0' }} />

                  <div className={styles.rawLabel}>건물</div>
                  <div className={styles.summaryList}>
                    {buildingSummary.map((b) => (
                      <div key={b.id} className={styles.summaryRow}>
                        <span className={styles.summaryRowName}>{b.name}</span>
                        <Tag color="gold" style={{ margin: 0, fontSize: 13 }}>×{b.count}</Tag>
                      </div>
                    ))}
                  </div>

                  <Divider style={{ borderColor: '#1e1e30', margin: '10px 0' }} />

                  <div className={styles.rawLabel}>{showFullChain ? '원자재 (분당)' : '필요 재료 (분당)'}</div>
                  <div className={styles.summaryList}>
                    {displayResources.map((r) => (
                      <div key={r.itemId} className={styles.summaryRow}>
                        <ItemIcon iconPath={r.iconPath} size={32} />
                        <span className={styles.summaryRowName}>{r.name}</span>
                        <span style={{ color: '#7ab8b8', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                          {Number.isInteger(r.rate) ? r.rate : parseFloat(r.rate.toFixed(2))}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 체인 시각화 */}
            <div className={styles.chainArea}>
              {calculateMutation.isPending ? (
                <div className={styles.loadingCenter}>
                  <Spin size="large" />
                </div>
              ) : result ? (
                Object.keys(recipeMap).length > 0 ? (
                  <ChainTree
                    key={`${selectedItemId}_${showFullChain}_${targetRate}`}
                    chainResult={showFullChain ? result.root : trimToDepth(result.root, 1)}
                    itemMap={itemMap}
                    buildingMap={buildingMap}
                    recipeMap={recipeMap}
                    recipeSelections={recipeSelections}
                    onRecipeSelect={handleRecipeSelect}
                    rawNodeSettings={rawNodeSettings}
                    onRawSettingsChange={handleRawSettingsChange}
                    conveyorLimit={conveyorLimit}
                  />
                ) : (
                  <Empty description="레시피 데이터 로딩 중..." />
                )
              ) : (
                <Empty description="계산 중..." />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 저장 모달 */}
      <Modal
        title="플랜 저장"
        open={saveModalOpen}
        onOk={handleSavePlan}
        onCancel={() => setSaveModalOpen(false)}
        confirmLoading={savePlanMutation.isPending}
        okText="저장"
        cancelText="취소"
      >
        <Input
          placeholder="플랜 이름 입력..."
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          onPressEnter={handleSavePlan}
          autoFocus
        />
      </Modal>

      {/* 플랜 불러오기 모달 */}
      <Modal
        title="저장된 플랜"
        open={plansModalOpen}
        onCancel={() => setPlansModalOpen(false)}
        footer={null}
        width={520}
      >
        {plans.length === 0 ? (
          <Empty description="저장된 플랜이 없습니다." />
        ) : (
          <Table
            dataSource={plans}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              { dataIndex: 'name', title: '이름' },
              { dataIndex: 'itemId', title: '아이템', render: (id) => itemMap[id]?.displayName ?? id },
              { dataIndex: 'targetRate', title: '/min', width: 70, align: 'right' },
              {
                key: 'actions',
                width: 100,
                render: (_, plan: Plan) => (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button size="small" type="link" onClick={() => handleLoadPlan(plan)}>로드</Button>
                    <Button
                      size="small" type="link" danger
                      icon={<DeleteOutlined />}
                      loading={deletePlanMutation.isPending}
                      onClick={() => deletePlanMutation.mutate(plan.id, { onSuccess: () => message.success('삭제됨') })}
                    />
                  </div>
                ),
              },
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
