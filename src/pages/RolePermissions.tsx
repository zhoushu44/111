import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'

type Role = { code: 'ADMIN' | 'STAFF'; name: string; permissions: string[] }

const modules: { key: string; label: string }[] = [
  { key: 'dashboard', label: '工作台' },
  { key: 'materials.categories', label: '面料类别维护' },
  { key: 'materials.fabrics', label: '面料资料维护' },
  { key: 'partners.providers', label: '供应商维护' },
  { key: 'partners.customers', label: '客户资料维护' },
  { key: 'samples.choose', label: '客户选样管理' },
  { key: 'samples.records', label: '客户选样查询' },
  { key: 'info.material-query', label: '面料查询' },
  { key: 'print.labels', label: '标签打印' },
  { key: 'system.users', label: '用户管理' },
  { key: 'system.roles', label: '角色权限' },
  { key: 'system.dictionaries', label: '数据字典' },
  { key: 'system.logs', label: '操作日志' },
]

export default function RolePermissions() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void api.get<Role[]>('/system/roles').then(setRoles).catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false))
  }, [])

  return <div>
    <PageHeader title="角色权限" description="系统内置角色的只读权限说明。" />
    {loading && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
    {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}
    {!loading && !message && <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="min-w-full text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 text-left font-semibold">功能模块</th>{roles.map((role) => <th key={role.code} className="px-4 py-3 text-center font-semibold">{role.name}</th>)}</tr></thead><tbody>{modules.map((module) => <tr key={module.key} className="border-t border-slate-100"><td className="px-4 py-3 text-slate-700">{module.label}</td>{roles.map((role) => <td key={role.code} className="px-4 py-3 text-center">{role.permissions.includes(module.key) ? <span className="font-medium text-emerald-600">可访问</span> : <span className="text-slate-400">无权限</span>}</td>)}</tr>)}</tbody></table>
    </div>}
  </div>
}
