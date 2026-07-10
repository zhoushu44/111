import type { LucideIcon } from 'lucide-react'

export type RoleCode = 'admin' | 'staff'

export interface UserAccount {
  id: string
  username: string
  displayName: string
  role: RoleCode
}

export interface MenuItem {
  path: string
  label: string
  icon: LucideIcon
  roles: RoleCode[]
  group: string
}

export interface MaterialFabric {
  id: string
  itemNo: string
  name: string
  category: string
  composition: string
  construction: string
  width: string
  weight: string
  color: string
  costPrice: number
  provider: string
  location: string
  stockQty: number
  image: string
  enabled: boolean
}

export interface Customer {
  id: string
  code: string
  name: string
  contact: string
  region: string
  status: string
}

export interface Provider {
  id: string
  code: string
  name: string
  contact: string
  phone: string
  region: string
  status: string
}

export interface SampleChooseRecord {
  id: string
  orderNo: string
  customerName: string
  chooseDate: string
  operator: string
  itemCount: number
  status: string
}
