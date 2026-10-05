let currentLang = 'ko'

export function setApiLang(lang: string) {
  currentLang = lang
}

export function getIconUrl(iconPath: string | null): string | undefined {
  if (!iconPath) return undefined
  return `/api/admin/icons/${iconPath}`
}

// thrown on non-2xx; body = parsed JSON error response (null if not JSON)
export type ApiError = Error & { status: number; body: unknown }

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const sep = url.includes('?') ? '&' : '?'
  const res = await fetch(`${url}${sep}lang=${encodeURIComponent(currentLang)}`, options)
  if (!res.ok) {
    const err = new Error(`API ${url} failed: ${res.status}`) as ApiError
    err.status = res.status
    err.body = await res.json().catch(() => null)
    throw err
  }
  return res.json()
}
