import { create } from 'zustand'
import type { RoleCode, UserAccount } from '@/types'

interface AuthState {
  user: UserAccount | null
  login: (role: RoleCode) => void
  logout: () => void
}

const users: Record<RoleCode, UserAccount> = {
  admin: { id: 'u001', username: 'admin', displayName: '管理员', role: 'admin' },
  staff: { id: 'u002', username: 'staff', displayName: '业务员工', role: 'staff' },
}

export const useAuthStore = create<AuthState>((set) => ({
  user: users.admin,
  login: (role) => set({ user: users[role] }),
  logout: () => set({ user: null }),
}))
