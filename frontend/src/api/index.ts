export function getIconUrl(iconPath: string | null): string | undefined {
  if (!iconPath) return undefined
  return `/api/admin/icons/${iconPath}`
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`API ${url} failed: ${res.status}`)
  return res.json()
}
