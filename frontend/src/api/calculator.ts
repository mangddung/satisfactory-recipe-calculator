import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './index'
import type { CraftableItem, CalculationResult, Item, Recipe, Building, Plan, Conveyor, GameConstants, Extractor } from '../types'

export function useCraftableItems() {
  return useQuery({
    queryKey: ['craftable'],
    queryFn: () =>
      apiFetch<{ items: CraftableItem[] }>('/api/items/craftable').then(
        (r) => r.items,
      ),
  })
}

export function useCalculate() {
  return useMutation({
    mutationFn: (body: {
      itemId: string
      targetRate: number
      recipeSelections: Record<string, string>
    }) =>
      apiFetch<CalculationResult>('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  })
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: () =>
      apiFetch<{ plans: Plan[] }>('/api/plans').then((r) => r.plans),
  })
}

export function useSavePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Omit<Plan, 'id' | 'createdAt'>) =>
      apiFetch<Plan>('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  })
}

export function useDeletePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  })
}

export function useExtractors() {
  return useQuery({
    queryKey: ['extractors'],
    queryFn: () =>
      apiFetch<{ extractors: Record<string, Extractor> }>('/api/extractors').then(
        (r) => r.extractors,
      ),
  })
}

export function useConveyors() {
  return useQuery({
    queryKey: ['conveyors'],
    queryFn: () =>
      apiFetch<{ conveyors: Conveyor[] }>('/api/conveyors').then((r) => r.conveyors),
  })
}

export function useGameConstants() {
  return useQuery({
    queryKey: ['game-constants'],
    queryFn: () => apiFetch<GameConstants>('/api/game-constants'),
  })
}

export function useGameItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: () =>
      apiFetch<{ items: Item[] }>('/api/items').then((r) => r.items),
  })
}

export function useGameRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: () =>
      apiFetch<{ recipes: Recipe[] }>('/api/recipes').then((r) => r.recipes),
  })
}

export function useGameBuildings() {
  return useQuery({
    queryKey: ['buildings'],
    queryFn: () =>
      apiFetch<{ buildings: Building[] }>('/api/buildings').then((r) => r.buildings),
  })
}
