export function setCookie(name: string, value: string) {
  const exp = new Date()
  exp.setFullYear(exp.getFullYear() + 1)
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${exp.toUTCString()};path=/`
}

export function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}
