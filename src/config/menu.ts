import { BookOpen, ClipboardList, FileSearch, Home, Printer, ScrollText, Settings, ShieldCheck, Shirt, Tags, Truck, UserCog, Users } from 'lucide-react'
import type { MenuItem } from '@/types'

export const menuItems: MenuItem[] = [
  { path: '/dashboard', label: '工作台', icon: Home, roles: ['admin', 'staff'], group: '首页' },
  { path: '/materials/categories', label: '面料类别维护', icon: Tags, roles: ['admin', 'staff'], group: '前期管理' },
  { path: '/materials/fabrics', label: '面料资料维护', icon: Shirt, roles: ['admin', 'staff'], group: '前期管理' },
  { path: '/partners/providers', label: '供应商维护', icon: Truck, roles: ['admin'], group: '前期管理' },
  { path: '/partners/customers', label: '客户资料维护', icon: Users, roles: ['admin'], group: '前期管理' },
  { path: '/samples/choose', label: '客户选样管理', icon: ClipboardList, roles: ['admin', 'staff'], group: '样品管理' },
  { path: '/samples/choose-records', label: '客户选样查询', icon: FileSearch, roles: ['admin', 'staff'], group: '样品管理' },
  { path: '/info/material-query', label: '面料查询', icon: BookOpen, roles: ['admin', 'staff'], group: '信息中心' },
  { path: '/print/labels', label: '标签打印', icon: Printer, roles: ['admin', 'staff'], group: '打印' },
  { path: '/system/users', label: '用户管理', icon: UserCog, roles: ['admin'], group: '系统管理' },
  { path: '/system/roles', label: '角色权限', icon: ShieldCheck, roles: ['admin'], group: '系统管理' },
  { path: '/system/dictionaries', label: '数据字典', icon: Settings, roles: ['admin'], group: '系统管理' },
  { path: '/system/logs', label: '操作日志', icon: ScrollText, roles: ['admin'], group: '系统管理' },
]
