import { createContext, useContext } from 'react'
import ko from './ko'
import en from './en'

export type TKey = keyof typeof ko
export type TFunc = (key: TKey, params?: Record<string, string | number>) => string

// UI dictionary: ko for 'ko', en for every other language (game-data names come localized from the backend)
export function makeT(lang: string): TFunc {
  const dict: Record<TKey, string> = lang === 'ko' ? ko : en
  return (key, params) =>
    dict[key].replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m,
    )
}

// UI language from the browser alone: Korean if any preferred language is Korean, else English
export const BROWSER_UI_LANG = navigator.languages.some((l) => l.toLowerCase().startsWith('ko')) ? 'ko' : 'en-US'

// language name in its own language ('ja' -> '日本語'). Browsers lack locale data for some
// languages (eo, lb, mt, kw, vo, ...) and would silently answer in the browser's language instead,
// so those get their English name ('Esperanto'), or the code if even that is unknown.
export function nativeName(code: string): string {
  try {
    if (Intl.DisplayNames.supportedLocalesOf([code]).length) {
      return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
    }
    return new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(code) ?? code
  } catch {
    return code
  }
}

// tag with CLDR likely subtags filled in: 'ko' -> 'ko-kore-kr', 'zh-CN' -> 'zh-hans-cn', 'en' -> 'en-latn-us'
function fullTag(tag: string): string {
  try {
    return new Intl.Locale(tag).maximize().toString().toLowerCase()
  } catch {
    return tag.toLowerCase()
  }
}

// codes matching the browser's preferred languages, in preference order: same tag, or the same
// language/script/region once defaults are filled in ('ko-KR' = 'ko', 'zh-CN' = 'zh-Hans').
// Regional variants never match loosely: 'en' (= en-US) does not pick 'en-AE'.
export function matchBrowserLanguages(codes: string[]): string[] {
  const found: string[] = []
  for (const nav of navigator.languages) {
    const match =
      codes.find((c) => c.toLowerCase() === nav.toLowerCase()) ??
      codes.find((c) => fullTag(c) === fullTag(nav))
    if (match && !found.includes(match)) found.push(match)
  }
  return found
}

export interface LangContextValue {
  lang: string
  setLang: (lang: string) => void
  languages: string[]
  t: TFunc
}

export const LangContext = createContext<LangContextValue>({
  lang: 'ko',
  setLang: () => {},
  languages: ['ko'],
  t: makeT('ko'),
})

export function useLang() {
  return useContext(LangContext)
}
