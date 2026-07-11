export interface ApiResponse<T> { code: number; message: string; data: T }

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
let accessToken = localStorage.getItem('accessToken')
let refreshToken = localStorage.getItem('refreshToken')
let refreshing: Promise<boolean> | null = null

export class ApiError extends Error { constructor(message: string, public status = 0) { super(message) } }
export const getAccessToken = () => accessToken
export const setTokens = (access: string | null, refresh: string | null) => {
  accessToken = access; refreshToken = refresh
  if (access) localStorage.setItem('accessToken', access); else localStorage.removeItem('accessToken')
  if (refresh) localStorage.setItem('refreshToken', refresh); else localStorage.removeItem('refreshToken')
}
export const clearAuth = () => { setTokens(null, null); localStorage.removeItem('user') }
export const assetUrl = (url?: string | null) => {
  if (!url || /^https?:\/\//i.test(url) || !url.startsWith('/')) return url ?? ''
  if (baseUrl.startsWith('/')) return url
  return `${new URL(baseUrl).origin}${url}`
}

async function refresh() {
  if (!refreshToken) return false
  if (!refreshing) refreshing = fetch(`${baseUrl}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) })
    .then(async (response) => {
      const result = await response.json() as ApiResponse<{ accessToken: string; refreshToken: string }>
      if (!response.ok || result.code >= 400) throw new Error(result.message)
      setTokens(result.data.accessToken, result.data.refreshToken); return true
    }).catch(() => { clearAuth(); return false }).finally(() => { refreshing = null })
  return refreshing
}

export async function request<T>(path: string, options: RequestInit & { responseType?: 'blob'; skipRefresh?: boolean } = {}): Promise<T> {
  const { responseType, skipRefresh, headers, body, ...init } = options
  const requestHeaders = new Headers(headers)
  if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`)
  if (body && !(body instanceof FormData) && !requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json')
  let response: Response
  try { response = await fetch(`${baseUrl}${path}`, { ...init, headers: requestHeaders, body }) } catch { throw new ApiError('网络连接失败，请检查服务是否启动') }
  if (response.status === 401 && !skipRefresh && await refresh()) return request<T>(path, { ...options, skipRefresh: true })
  if (response.status === 401) { clearAuth(); if (location.pathname !== '/login') location.replace('/login'); throw new ApiError('登录已失效，请重新登录', 401) }
  if (responseType === 'blob') { if (!response.ok) { const data = await response.json().catch(() => null) as ApiResponse<null> | null; throw new ApiError(data?.message || '下载失败', response.status) }; return await response.blob() as T }
  const result = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !result || result.code >= 400) throw new ApiError(result?.message || '请求失败，请稍后重试', response.status)
  return result.data
}
export const api = { get: <T>(path: string) => request<T>(path), post: <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: data instanceof FormData ? data : JSON.stringify(data ?? {}) }), patch: <T>(path: string, data: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }), download: (path: string, options: RequestInit = {}) => request<Blob>(path, { ...options, responseType: 'blob' }) }
export const downloadBlob = (blob: Blob, filename: string) => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url) }
