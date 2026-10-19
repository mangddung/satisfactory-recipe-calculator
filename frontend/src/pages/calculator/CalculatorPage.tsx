import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from 'react'
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
  Drawer,
  Select,
  Tag,
  Table,
} from 'antd'
import {
  SaveOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  MenuOutlined,
  RightOutlined,
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
import { collapsedPathsAtDepth, countNodesToDepth } from '../../components/ChainTree/flowUtils'
import ItemIcon from '../../components/ItemIcon'
import LanguageSelect from '../../components/LanguageSelect'
import { useLang } from '../../i18n'
import { getCookie, setCookie } from '../../utils/cookie'
import styles from './CalculatorPage.module.css'

function aggregateBuildings(node: ChainNode, acc: Record<string, number> = {}): Record<string, number> {
  if (node.recipe) {
    const bid = node.recipe.producedIn?.[0]
    if (bid) acc[bid] = (acc[bid] ?? 0) + node.buildingCountCeil
  }
  node.children.forEach((c) => aggregateBuildings(c, acc))
  return acc
}

// 체인 노드가 이보다 많으면 처음엔 1단계까지만 펼침
const AUTO_EXPAND_MAX_NODES = 20

function initialCollapsedPaths(root: ChainNode): Set<string> {
  return countNodesToDepth(root, Infinity) <= AUTO_EXPAND_MAX_NODES
    ? new Set()
    : collapsedPathsAtDepth(root, 1)
}

// 원자재 노드별 기본 설정. 같은 자원이 여러 곳에 나와도 필요량이 달라서 키는 노드 경로(pathKey)
function collectRawDefaults(
  node: ChainNode,
  acc: Record<string, RawNodeSettings> = {},
  extractors: Record<string, Extractor> = {},
  purityMultipliers: Record<string, number> = {},
  extractorOverrides: Record<string, string> = {},
  path: string = node.itemId,
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
    acc[path] = { mode: 'nodes', nodes, manualRate: null }
  }
  node.children.forEach((c) =>
    collectRawDefaults(c, acc, extractors, purityMultipliers, extractorOverrides, `${path}>${c.itemId}`),
  )
  return acc
}

export default function CalculatorPage() {
  const { t } = useLang()
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [targetRate, setTargetRate] = useState<number>(60)
  const [recipeSelections, setRecipeSelections] = useState<Record<string, string>>({})
  const [result, setResult] = useState<CalculationResult | null>(null)
  const [rawNodeSettings, setRawNodeSettings] = useState<Record<string, RawNodeSettings>>({})
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set())
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
  const [collapsedTiers, setCollapsedTiers] = useState<Set<number>>(
    () => new Set((getCookie('sc_collapsed_tiers') ?? '').split(',').filter(Boolean).map(Number)),
  )
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // 모바일 전용: 아이템·설정 서랍, 요약 상세(건물·원자재) 펼침
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

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
  const searching = sidebarSearch.trim() !== ''

  function toggleTier(tier: number) {
    setCollapsedTiers((prev) => {
      const next = new Set(prev)
      if (!next.delete(tier)) next.add(tier)
      return next
    })
  }

  // 결과가 바뀌거나 채굴기 등급을 바꿀 때 원자재 노드 설정을 기본값으로 되돌림
  function rawDefaultsFor(data: CalculationResult, minerId = extractorLevel) {
    const pm = gameConstants?.purityMultipliers ?? {}
    return collectRawDefaults(data.root, {}, extractors, pm, { miner: minerId })
  }

  function handleExtractorLevelChange(minerId: string) {
    setExtractorLevel(minerId)
    if (result) setRawNodeSettings(rawDefaultsFor(result, minerId))
  }

  useEffect(() => { setCookie('sc_conveyor', String(conveyorLimitValue)) }, [conveyorLimitValue])
  useEffect(() => { setCookie('sc_extractor', extractorLevel) }, [extractorLevel])
  useEffect(() => { setCookie('sc_collapsed_tiers', [...collapsedTiers].join(',')) }, [collapsedTiers])

  const handleRawSettingsChange = useCallback(
    (pathKey: string, settings: RawNodeSettings) => {
      setRawNodeSettings((prev) => ({ ...prev, [pathKey]: settings }))
    },
    [],
  )

  function runCalculate(
    payload: { itemId: string; targetRate: number; recipeSelections: Record<string, string> },
    resetCollapse = false,
  ) {
    calculateMutation.mutate(payload, {
      onSuccess: (data) => {
        setResult(data)
        setRawNodeSettings(rawDefaultsFor(data))
        if (resetCollapse) setCollapsedPaths(initialCollapsedPaths(data.root))
      },
      onError: () => message.error(t('calc.calculateFailed')),
    })
  }

  const skipRateRecalc = useRef(false)
  useEffect(() => {
    if (skipRateRecalc.current) {
      skipRateRecalc.current = false
      return
    }
    if (!selectedItemId) return
    const timer = setTimeout(() => {
      runCalculate({ itemId: selectedItemId, targetRate, recipeSelections })
    }, 500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRate])

  function handleItemSelect(itemId: string) {
    setSelectedItemId(itemId)
    setRecipeSelections({})
    setResult(null)
    setCollapsedPaths(new Set())
    runCalculate({ itemId, targetRate, recipeSelections: {} }, true)
  }

  function handleRecipeSelect(itemId: string, recipeId: string) {
    const next = { ...recipeSelections, [itemId]: recipeId }
    setRecipeSelections(next)
    if (selectedItemId) runCalculate({ itemId: selectedItemId, targetRate, recipeSelections: next })
  }

  function handleSavePlan() {
    if (!selectedItemId || !planName.trim()) return
    savePlanMutation.mutate(
      {
        name: planName.trim(),
        itemId: selectedItemId,
        targetRate,
        recipeSelections,
        rawNodeSettings,
        collapsedPaths: [...collapsedPaths],
      },
      {
        onSuccess: () => {
          message.success(t('calc.planSaved'))
          setSaveModalOpen(false)
          setPlanName('')
        },
        onError: () => message.error(t('calc.saveFailed')),
      },
    )
  }

  function handleLoadPlan(plan: Plan) {
    // 여기서 바로 계산하므로 targetRate 변경 디바운스 재계산은 건너뜀 (돌면 원자재 설정이 기본값으로 덮임)
    if (plan.targetRate !== targetRate) skipRateRecalc.current = true
    setSelectedItemId(plan.itemId)
    setTargetRate(plan.targetRate)
    setRecipeSelections(plan.recipeSelections ?? {})
    setCollapsedPaths(new Set())
    setPlansModalOpen(false)
    calculateMutation.mutate(
      { itemId: plan.itemId, targetRate: plan.targetRate, recipeSelections: plan.recipeSelections ?? {} },
      {
        onSuccess: (data) => {
          setResult(data)
          // 저장 후 게임 데이터가 바뀌어 새로 생긴 원자재 노드는 기본값
          setRawNodeSettings({ ...rawDefaultsFor(data), ...plan.rawNodeSettings })
          setCollapsedPaths(plan.collapsedPaths ? new Set(plan.collapsedPaths) : initialCollapsedPaths(data.root))
        },
        onError: () => message.error(t('calc.calculateFailed')),
      },
    )
  }

  const buildingSummary = useMemo(() => {
    if (!result) return []
    const agg = aggregateBuildings(result.root)
    return Object.entries(agg)
      .map(([id, count]) => ({
        id,
        count,
        name: buildingMap[id]?.displayName ?? id,
        iconPath: buildingMap[id]?.iconPath ?? null,
      }))
      .sort((a, b) => b.count - a.count)
  }, [result, buildingMap])

  const displayPowerMW = result ? result.totalPowerMW : 0

  const displayResources = useMemo(() => {
    if (!result) return []
    return result.rawResources.map((r) => ({
      itemId: r.itemId,
      rate: r.rate,
      name: itemMap[r.itemId]?.displayName ?? r.itemId,
      iconPath: itemMap[r.itemId]?.iconPath ?? null,
    }))
  }, [result, itemMap])

  // 데스크톱 사이드바와 모바일 서랍이 같이 씀
  const itemPicker = (
    <>
      <Input
        placeholder={t('calc.searchPlaceholder')}
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
        {tieredCraftable.map(([tier, items], idx) => {
          const open = searching || !collapsedTiers.has(tier) // 검색 중엔 결과를 숨기지 않게 전부 펼침
          return (
            <Fragment key={tier}>
              <button
                type="button"
                className={`${styles.tierHeader} ${idx === 0 ? styles.tierHeaderFirst : ''}`}
                aria-expanded={open}
                disabled={searching}
                onClick={() => toggleTier(tier)}
              >
                <RightOutlined className={`${styles.tierCaret} ${open ? styles.tierCaretOpen : ''}`} />
                {tier === 99 ? (
                  <span className={styles.tierBadge}>{t('calc.tierOther')}</span>
                ) : (
                  <>Tier <span className={styles.tierBadge}>{tier}</span></>
                )}
                <span className={styles.tierCount}>{items.length}</span>
              </button>
              {open && items.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.itemRow} ${selectedItemId === item.id ? styles.itemRowActive : ''}`}
                  onClick={() => {
                    handleItemSelect(item.id)
                    setDrawerOpen(false)
                  }}
                >
                  <ItemIcon iconPath={item.iconPath} size={35} />
                  <span>{item.displayName}</span>
                </div>
              ))}
            </Fragment>
          )
        })}
        {!craftableLoading && filteredCraftable.length === 0 && (
          <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '12px 8px' }}>{t('calc.noResults')}</div>
        )}
      </div>
    </>
  )

  // 계산 설정 | 앱 설정 — 데스크톱은 컨트롤 바 오른쪽, 모바일은 서랍 위쪽
  const settingsControls = (
    <>
      <Select
        value={conveyorLimitValue}
        onChange={setConveyorLimitValue}
        size="small"
        style={{ width: 170 }}
        popupMatchSelectWidth={false}
        options={[
          { value: 0, label: t('calc.conveyorUnlimited') },
          ...conveyorBelts.map((c) => ({
            value: c.itemsPerMin,
            label: `${c.displayName} — ${c.itemsPerMin}/min`,
          })),
        ]}
      />
      {minerExtractors.length > 0 && (
        <Select
          value={extractorLevel}
          onChange={handleExtractorLevelChange}
          size="small"
          style={{ width: 130 }}
          options={minerExtractors.map((e) => ({ value: e.id, label: e.displayName }))}
        />
      )}
      <Divider orientation="vertical" style={{ borderColor: 'var(--border-strong)', height: 20, margin: '0 4px' }} />
      <LanguageSelect />
    </>
  )

  return (
    <div className={styles.page}>
      {/* 좌측 사이드바 (데스크톱) */}
      <div className={`${styles.sidebar} ${sidebarOpen ? '' : styles.sidebarCollapsed}`}>
        <div className={styles.sidebarTopBar}>
          <button className={styles.hamburger} onClick={() => setSidebarOpen((v) => !v)}>
            <MenuOutlined />
          </button>
          {sidebarOpen && <span className={styles.sidebarTitle}>{t('common.items')}</span>}
        </div>
        {sidebarOpen && itemPicker}
      </div>

      {/* 아이템·설정 서랍 (모바일) */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="left"
        size={300}
        title={t('common.items')}
        styles={{
          section: { background: 'var(--bg-panel)' },
          body: { display: 'flex', flexDirection: 'column', gap: 10, padding: 12 },
        }}
      >
        <div className={styles.drawerSettings}>{settingsControls}</div>
        {itemPicker}
      </Drawer>

      {/* 메인 영역 */}
      <div className={styles.main}>
        {/* 컨트롤 바 — 모바일에선 서랍 버튼 + 선택 아이템 + 작업 아이콘만 */}
        <div className={styles.controls}>
          <button className={`${styles.hamburger} ${styles.mobileOnly}`} onClick={() => setDrawerOpen(true)}>
            <MenuOutlined />
          </button>
          <div className={`${styles.mobileTitle} ${styles.mobileOnly}`}>
            {selectedCraftable && (
              <>
                <ItemIcon iconPath={selectedCraftable.iconPath} size={22} />
                <span>{selectedCraftable.displayName}</span>
              </>
            )}
          </div>
          {/* 작업 */}
          <Button icon={<SaveOutlined />} disabled={!result || !selectedItemId} onClick={() => setSaveModalOpen(true)}>
            <span className={styles.btnLabel}>{t('calc.save')}</span>
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={() => setPlansModalOpen(true)}>
            <span className={styles.btnLabel}>{t('calc.load')}{plans.length > 0 ? ` (${plans.length})` : ''}</span>
          </Button>
          <div className={`${styles.controlsRight} ${styles.desktopOnly}`}>{settingsControls}</div>
        </div>

        {calculateMutation.isError && (
          <Alert type="error" message={t('calc.calculateError')} style={{ marginBottom: 8 }} />
        )}

        {/* 아이템 미선택 */}
        {!selectedItemId && (
          <div className={styles.placeholder}>
            <Empty description={t('calc.selectItem')}>
              <Button className={styles.mobileOnly} onClick={() => setDrawerOpen(true)}>
                {t('calc.openItems')}
              </Button>
            </Empty>
          </div>
        )}

        {/* 레시피 뷰 (단일/전체 공통 — ChainTree 사용) */}
        {selectedItemId && (
          <div className={styles.body}>
            {/* 요약 패널 — 아이템 선택 시 항상 표시 */}
            <div className={`${styles.summary} ${detailsOpen ? styles.summaryOpen : ''}`}>
              {selectedCraftable && (
                <div className={styles.summaryHeader}>
                  <ItemIcon iconPath={selectedCraftable.iconPath} size={35} />
                  <span className={styles.summaryTitle}>{selectedCraftable.displayName}</span>
                </div>
              )}

              {/* 생산량 입력 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('calc.targetRate')}</span>
                <InputNumber
                  value={targetRate}
                  onChange={(v) => setTargetRate(v ?? 1)}
                  min={0.001}
                  step={10}
                  suffix="/min"
                  size="small"
                  style={{ width: 130 }}
                />
              </div>

              {result && (
                <>
                  <div className={styles.statRow}>
                    <ThunderboltOutlined style={{ color: 'var(--accent)' }} />
                    <span style={{ color: 'var(--text)', flex: 1, fontSize: 14 }}>{t('calc.totalPower')}</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}>
                      {displayPowerMW.toFixed(1)} MW
                    </span>
                    <Button
                      type="link"
                      size="small"
                      className={styles.mobileOnly}
                      onClick={() => setDetailsOpen((v) => !v)}
                    >
                      {detailsOpen ? t('calc.hideDetails') : t('calc.showDetails')}
                    </Button>
                  </div>

                  {/* 모바일에선 접혀 있다가 상세 버튼으로 펼침 */}
                  <div className={styles.summaryDetails}>
                    <Divider style={{ borderColor: 'var(--border)', margin: '10px 0' }} />

                    <div className={styles.rawLabel}>{t('common.buildings')}</div>
                    <div className={styles.summaryList}>
                      {buildingSummary.map((b) => (
                        <div key={b.id} className={styles.summaryRow}>
                          <ItemIcon iconPath={b.iconPath} size={32} />
                          <span className={styles.summaryRowName}>{b.name}</span>
                          <Tag color="gold" style={{ margin: 0, fontSize: 13 }}>×{b.count}</Tag>
                        </div>
                      ))}
                    </div>

                    <Divider style={{ borderColor: 'var(--border)', margin: '10px 0' }} />

                    <div className={styles.rawLabel}>{t('calc.rawResources')}</div>
                    <div className={styles.summaryList}>
                      {displayResources.map((r) => (
                        <div key={r.itemId} className={styles.summaryRow}>
                          <ItemIcon iconPath={r.iconPath} size={32} />
                          <span className={styles.summaryRowName}>{r.name}</span>
                          <span style={{ color: 'var(--rate)', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                            {Number.isInteger(r.rate) ? r.rate : parseFloat(r.rate.toFixed(2))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 체인 시각화 */}
            <div className={styles.chainArea}>
              {/* 첫 계산만 전체 스피너. 재계산 중엔 기존 그래프를 두고 우상단 스피너만 — 다시 그리면 줌/위치가 초기화됨 */}
              {!result && calculateMutation.isPending ? (
                <div className={styles.loadingCenter}>
                  <Spin size="large" />
                </div>
              ) : result ? (
                Object.keys(recipeMap).length > 0 ? (
                  <>
                    {calculateMutation.isPending && <Spin className={styles.recalcSpin} />}
                    <ChainTree
                      key={result.root.itemId}
                      chainResult={result.root}
                      itemMap={itemMap}
                      buildingMap={buildingMap}
                      recipeMap={recipeMap}
                      recipeSelections={recipeSelections}
                      onRecipeSelect={handleRecipeSelect}
                      rawNodeSettings={rawNodeSettings}
                      onRawSettingsChange={handleRawSettingsChange}
                      conveyorLimit={conveyorLimit}
                      collapsedPaths={collapsedPaths}
                      onCollapsedPathsChange={setCollapsedPaths}
                    />
                  </>
                ) : (
                  <Empty description={t('calc.loadingRecipes')} />
                )
              ) : (
                <Empty description={t('calc.calculating')} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 저장 모달 */}
      <Modal
        title={t('calc.savePlan')}
        open={saveModalOpen}
        onOk={handleSavePlan}
        onCancel={() => setSaveModalOpen(false)}
        confirmLoading={savePlanMutation.isPending}
        okText={t('calc.save')}
        cancelText={t('common.cancel')}
      >
        <Input
          placeholder={t('calc.planNamePlaceholder')}
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          onPressEnter={handleSavePlan}
          autoFocus
        />
      </Modal>

      {/* 플랜 불러오기 모달 */}
      <Modal
        title={t('calc.savedPlans')}
        open={plansModalOpen}
        onCancel={() => setPlansModalOpen(false)}
        footer={null}
        width={520}
      >
        {plans.length === 0 ? (
          <Empty description={t('calc.noPlans')} />
        ) : (
          <Table
            dataSource={plans}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              { dataIndex: 'name', title: t('common.name') },
              {
                dataIndex: 'itemId',
                title: t('calc.item'),
                render: (id) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ItemIcon iconPath={itemMap[id]?.iconPath ?? null} size={24} />
                    <span>{itemMap[id]?.displayName ?? id}</span>
                  </div>
                ),
              },
              { dataIndex: 'targetRate', title: '/min', width: 70, align: 'right' },
              {
                key: 'actions',
                width: 100,
                render: (_, plan: Plan) => (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button size="small" type="link" onClick={() => handleLoadPlan(plan)}>{t('calc.loadPlan')}</Button>
                    <Button
                      size="small" type="link" danger
                      icon={<DeleteOutlined />}
                      loading={deletePlanMutation.isPending}
                      onClick={() => deletePlanMutation.mutate(plan.id, { onSuccess: () => message.success(t('calc.deleted')) })}
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
