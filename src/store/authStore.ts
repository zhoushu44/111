import { create } from 'zustand'
import { api, clearAuth, setTokens } from '@/lib/api'
import type { UserAccount } from '@/types'

type ApiUser = Omit<UserAccount, 'role'> & { role: { code: 'ADMIN' | 'STAFF'; name: string } }
type AuthResult = { user: ApiUser; accessToken: string; refreshToken: string }
const toUser = (user: ApiUser): UserAccount => ({ ...user, role: user.role.code === 'ADMIN' ? 'admin' : 'staff' })
const applyAuth = (set: (state: Partial<AuthState>) => void, data: AuthResult) => { const user = toUser(data.user); setTokens(data.accessToken, data.refreshToken); localStorage.setItem('user', JSON.stringify(user)); set({ user }) }
interface AuthState { user: UserAccount | null; loading: boolean; login: (username: string, password: string) => Promise<void>; bootstrapAdmin: (username: string, displayName: string, password: string, confirmPassword: string) => Promise<void>; initialize: () => Promise<void>; logout: () => Promise<void> }
export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'), loading: true,
  login: async (username, password) => { applyAuth(set, await api.post<AuthResult>('/auth/login', { username, password })) },
  bootstrapAdmin: async (username, displayName, password, confirmPassword) => { applyAuth(set, await api.post<AuthResult>('/auth/bootstrap-admin', { username, displayName, password, confirmPassword })) },
  initialize: async () => { if (!localStorage.getItem('accessToken')) return set({ user: null, loading: false }); try { const user = toUser(await api.get<ApiUser>('/auth/me')); localStorage.setItem('user', JSON.stringify(user)); set({ user }) } catch { clearAuth(); set({ user: null }) } finally { set({ loading: false }) } },
  logout: async () => { try { await api.post('/auth/logout') } catch { /* token may already be invalid */ } finally { clearAuth(); set({ user: null }) } },
}))
