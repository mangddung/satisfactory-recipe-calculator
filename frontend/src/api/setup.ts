import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './index'

export interface LanguageFile {
  code: string
  path: string
  bytes: number
}

// game-data tier (null = none) earlier than the earliest tier it can be automated
export interface TierMismatch {
  item: string
  from: number | null
  to: number
}

export interface SetupResult {
  languages: string[]
  defaultLanguage: string
  icons: { needed: number; copied: number; missing: string[] }
  tiers?: { fixed: boolean; mismatches: TierMismatch[] } // absent in setup.json written before tier correction existed
  generatedAt: string
}

export interface SetupStatus {
  configured: boolean
  gameData: { languageFiles: LanguageFile[]; iconSourceFound: boolean }
  setup: SetupResult | null
}

export interface CleanupPreview {
  languages: { files: LanguageFile[]; bytes: number }
  pngs: { count: number; bytes: number }
  other: { count: number; bytes: number; samples: string[] }
  totalCount: number
  totalBytes: number
}

export interface CleanupResult {
  deletedCount: number
  deletedBytes: number
}

// error body of POST /api/setup/run (ApiError.body)
export interface SetupRunError {
  error?: string
  log?: string
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup', 'status'],
    queryFn: () => apiFetch<SetupStatus>('/api/setup/status'),
  })
}

export function useRunSetup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { languages: string[]; defaultLanguage: string; fixTiers: boolean }) =>
      apiFetch<{ ok: true; setup: SetupResult }>('/api/setup/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.setup),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup'] }),
  })
}

export function useCleanupPreview() {
  return useQuery({
    queryKey: ['setup', 'cleanup'],
    queryFn: () => apiFetch<CleanupPreview>('/api/setup/cleanup'),
    gcTime: 0, // drop the cache when the step closes -> fresh scan (no stale list) each time it opens
  })
}

export function useCleanup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<CleanupResult>('/api/setup/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setup', 'status'] }),
  })
}
