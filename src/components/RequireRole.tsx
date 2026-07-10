import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { RoleCode } from '@/types'

interface RequireRoleProps {
  roles: RoleCode[]
  children: ReactNode
}

export default function RequireRole({ roles, children }: RequireRoleProps) {
  const user = useAuthStore((state) => state.user)

  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}
