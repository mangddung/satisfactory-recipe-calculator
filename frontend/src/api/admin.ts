import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './index'
import type { Item, ItemDetail, Recipe, Building, BuildingDetail } from '../types'

// ── Items ──────────────────────────────────────────────────────────────────

export function useItems(filter?: string) {
  return useQuery({
    queryKey: ['admin', 'items', filter],
    queryFn: () =>
      apiFetch<{ items: Item[]; total: number }>(
        `/api/admin/items${filter ? `?filter=${filter}` : ''}`,
      ).then((r) => r.items),
  })
}

export function useItemDetail(itemId: string | null) {
  return useQuery({
    // 'detail' 필수: 없으면 useItems() 키 ['admin','items',undefined]와 해시가 같아짐(undefined→null)
    queryKey: ['admin', 'items', 'detail', itemId],
    queryFn: () => apiFetch<ItemDetail>(`/api/admin/items/${itemId}`),
    enabled: !!itemId,
  })
}

// 일괄 저장: 백엔드는 1건씩만 받음 → 순서대로 보내고, 목록은 끝난 뒤 한 번만 다시 불러옴
export function useClassify() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entries: { item_id: string; acquisition: string }[]) => {
      const saved: string[] = []
      let failed = 0
      for (const body of entries) {
        try {
          await apiFetch('/api/admin/classify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          saved.push(body.item_id)
        } catch {
          failed++
        }
      }
      return { saved, failed }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'items'] }),
  })
}

// ── Recipes ────────────────────────────────────────────────────────────────

export function useRecipes() {
  return useQuery({
    queryKey: ['admin', 'recipes'],
    queryFn: () =>
      apiFetch<{ recipes: Recipe[]; total: number }>('/api/admin/recipes').then(
        (r) => r.recipes,
      ),
  })
}

// ── Buildings ──────────────────────────────────────────────────────────────

export function useBuildings() {
  return useQuery({
    queryKey: ['admin', 'buildings'],
    queryFn: () =>
      apiFetch<{ buildings: Building[]; total: number }>('/api/admin/buildings').then(
        (r) => r.buildings,
      ),
  })
}

export function useBuildingDetail(buildingId: string | null) {
  return useQuery({
    queryKey: ['admin', 'buildings', buildingId],
    queryFn: () => apiFetch<BuildingDetail>(`/api/admin/buildings/${buildingId}`),
    enabled: !!buildingId,
  })
}

// ── Pipeline ───────────────────────────────────────────────────────────────

export function usePipelineRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; stdout: string; stderr: string }>(
        '/api/admin/pipeline/run',
        { method: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useValidate() {
  return useQuery({
    queryKey: ['admin', 'validate'],
    queryFn: () =>
      apiFetch<{ valid: boolean; errors: string[]; warnings: string[] }>(
        '/api/admin/validate',
      ),
  })
}
