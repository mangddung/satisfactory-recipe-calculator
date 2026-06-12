import type { Extractor, RawNodeSettings } from '../types'

export function computeSupply(
  settings: RawNodeSettings,
  extractors: Record<string, Extractor>,
  purityMultipliers: Record<string, number>,
): number {
  if (settings.mode === 'manual') return settings.manualRate ?? 0
  return settings.nodes.reduce((sum, n) => {
    const ext = extractors[n.extractorId]
    if (!ext) return sum
    return sum + ext.baseRatePerMin * (purityMultipliers[n.purity] ?? 1) * (n.overclock / 100)
  }, 0)
}

export function defaultExtractorId(
  acquisitionType: string,
  extractors: Record<string, Extractor>,
): string {
  const candidates = Object.values(extractors).filter(
    (e) => e.acquisitionType === acquisitionType,
  )
  if (candidates.length === 0) return ''
  return candidates.reduce((best, e) =>
    e.baseRatePerMin > best.baseRatePerMin ? e : best,
  ).id
}
