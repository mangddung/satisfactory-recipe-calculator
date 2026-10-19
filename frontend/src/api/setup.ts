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
