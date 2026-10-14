import type { Extractor, NodeConfig, RawNodeSettings } from '../types'

// 추출기 1대 공급량. 순도는 자원 노드 위에 짓는 추출기만 적용
export function nodeSupply(
  ext: Extractor,
  node: NodeConfig,
  purityMultipliers: Record<string, number>,
): number {
  const purity = ext.hasPurity ? (purityMultipliers[node.purity] ?? 1) : 1
  return ext.baseRatePerMin * purity * (node.overclock / 100)
}

// 게임 데이터의 허용 자원 목록으로 판단, 목록이 없으면(채굴기) acquisitionType
export function canExtract(ext: Extractor, itemId: string, acquisitionType: string): boolean {
  return ext.allowedResources.length
    ? ext.allowedResources.includes(itemId)
    : ext.acquisitionType === acquisitionType
}

export function computeSupply(
  settings: RawNodeSettings,
  extractors: Record<string, Extractor>,
  purityMultipliers: Record<string, number>,
): number {
  if (settings.mode === 'manual') return settings.manualRate ?? 0
  return settings.nodes.reduce((sum, n) => {
    const ext = extractors[n.extractorId]
    if (!ext) return sum
    return sum + nodeSupply(ext, n, purityMultipliers)
  }, 0)
}
