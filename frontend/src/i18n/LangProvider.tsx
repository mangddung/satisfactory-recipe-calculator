import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Spin } from 'antd'
import { apiFetch, setApiLang } from '../api'
import { getCookie, setCookie } from '../utils/cookie'
import { BROWSER_UI_LANG, LangContext, makeT, matchBrowserLanguages } from './index'

interface LanguagesResponse {
  languages: string[]
  default: string
}

// before first setup (no generated languages): UI follows the browser
const FALLBACK: LanguagesResponse = { languages: [BROWSER_UI_LANG], default: BROWSER_UI_LANG }

function pickInitialLang(languages: string[], fallback: string): string {
  const saved = getCookie('sc_lang')
  if (saved && languages.includes(saved)) return saved
  return matchBrowserLanguages(languages)[0] ?? fallback
}

function LangState({ languages, fallback, children }: { languages: string[]; fallback: string; children: ReactNode }) {
  const queryClient = useQueryClient()
  const [lang, setLangState] = useState(() => {
    const initial = pickInitialLang(languages, fallback)
    setApiLang(initial) // set before children's first queries fire
    return initial
  })

  const setLang = useCallback(
    (next: string) => {
      setApiLang(next)
      setCookie('sc_lang', next)
      setLangState(next)
      queryClient.invalidateQueries()
    },
    [queryClient],
  )

  const value = useMemo(
    () => ({ lang, setLang, languages, t: makeT(lang) }),
    [lang, setLang, languages],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export default function LangProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = useQuery({
    queryKey: ['languages'],
    queryFn: () => apiFetch<LanguagesResponse>('/api/languages'),
    retry: false,
    staleTime: Infinity,
  })

  if (isPending) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a12' }}>
        <Spin />
      </div>
    )
  }

  // endpoint missing (404) or empty list (setup not done yet) -> browser language
  const { languages, default: fallback } = data?.languages?.length ? data : FALLBACK
  return <LangState languages={languages} fallback={fallback}>{children}</LangState>
}
