import { useEffect, useState } from 'react'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'

type Role = 'ADMIN' | 'STAFF'
type Status = 'ACTIVE' | 'DISABLED'
type User = { id: string; username: string; displayName: string; status: Status; createdAt: string; role: { code: Role; name: string } }
type Form = { username: string; displayName: string; password: string; role: Role; status: Status }
const emptyForm: Form = { username: '', displayName: '', password: '', role: 'STAFF', status: 'ACTIVE' }

export default function UserManagement() {
  const [list, setList] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [editing, setEditing] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const pageSize = 20

  const load = async (targetPage = page) => {
    setLoading(true); setMessage('')
    try {
      const query = new URLSearchParams({ page: String(targetPage), pageSize: String(pageSize) })
      if (keyword.trim()) query.set('keyword', keyword.trim())
      if (status) query.set('status', status)
      if (role) query.set('role', role)
      const result = await api.get<{ list: User[]; total: number }>(`/system/users?${query}`)
      setList(result.list); setTotal(result.total); setPage(targetPage)
    } catch (error) { setMessage(error instanceof Error ? error.message : '加载用户失败') } finally { setLoading(false) }
  }
  useEffect(() => { void load(1) }, [])
  const openCreate = () => { setEditing(null); setForm(emptyForm) }
  const openEdit = (user: User) => { setEditing(user); setForm({ username: user.username, displayName: user.displayName, password: '', role: user.role.code, status: user.status }) }
  const save = async () => {
    if (!form) return
    try {
      if (editing) await api.patch(`/system/users/${editing.id}`, { displayName: form.displayName, role: form.role, status: form.status })
      else await api.post('/system/users', form)
      setForm(null); setMessage(editing ? '用户已修改' : '用户已创建'); await load(editing ? page : 1)
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败') }
  }
  const toggle = async (user: User) => {
    try { await api.patch(`/system/users/${user.id}`, { status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }); setMessage(user.status === 'ACTIVE' ? '用户已停用' : '用户已启用'); await load() } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败') }
  }
  const resetPassword = async () => {
    if (!resetting) return
    try { await api.post(`/system/users/${resetting.id}/reset-password`, { password: newPassword }); setResetting(null); setNewPassword(''); setMessage('密码已重置，原会话已失效') } catch (error) { setMessage(error instanceof Error ? error.message : '重置失败') }
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return <div>
    <PageHeader title="用户管理" description="管理用户账号、显示名、角色和启用状态。" action="新增用户" onAction={openCreate} />
    <div className="mb-4 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4"><input className="rounded-lg border border-slate-200 p-2 text-sm" placeholder="用户名或显示名" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(1) }} /><select className="rounded-lg border border-slate-200 p-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">全部状态</option><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select><select className="rounded-lg border border-slate-200 p-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}><option value="">全部角色</option><option value="ADMIN">管理员</option><option value="STAFF">员工</option></select><button className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm text-white" onClick={() => void load(1)} disabled={loading}>{loading ? '加载中…' : '查询'}</button></div>
    {message && <p className={`mb-3 rounded-lg p-3 text-sm ${message.includes('已') || message.includes('创建') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{message}</p>}
    <DataTable data={list} columns={[{ title: '用户名', render: (u) => u.username }, { title: '显示名', render: (u) => u.displayName }, { title: '角色', render: (u) => u.role.name }, { title: '状态', render: (u) => u.status === 'ACTIVE' ? '启用' : '停用' }, { title: '创建时间', render: (u) => new Date(u.createdAt).toLocaleString() }, { title: '操作', render: (u) => <div className="flex gap-3"><button onClick={() => openEdit(u)}>编辑</button><button onClick={() => void toggle(u)}>{u.status === 'ACTIVE' ? '停用' : '启用'}</button><button onClick={() => { setResetting(u); setNewPassword('') }}>重置密码</button></div> }]} />
    <div className="mt-4 flex items-center justify-end gap-3 text-sm"><span>共 {total} 条，第 {page}/{totalPages} 页</span><button disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>上一页</button><button disabled={page >= totalPages || loading} onClick={() => void load(page + 1)}>下一页</button></div>
    {form && <div className="fixed inset-0 z-40 bg-slate-900/40 p-10"><div className="mx-auto max-w-md rounded-2xl bg-white p-6"><h2 className="mb-4 font-bold">{editing ? '编辑用户' : '新增用户'}</h2><div className="grid gap-3"><label>用户名<input disabled={!!editing} className="mt-1 w-full rounded-lg border border-slate-200 p-2 disabled:bg-slate-100" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label><label>显示名<input className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>{!editing && <label>初始密码<input type="password" className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>}<label>角色<select className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}><option value="ADMIN">管理员</option><option value="STAFF">员工</option></select></label><label>状态<select className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select></label></div><div className="mt-5 flex gap-3"><button className="rounded-lg border px-4 py-2" onClick={() => setForm(null)}>取消</button><button className="rounded-lg bg-[#123c5a] px-4 py-2 text-white" onClick={() => void save()}>保存</button></div></div></div>}
    {resetting && <div className="fixed inset-0 z-40 bg-slate-900/40 p-10"><div className="mx-auto max-w-md rounded-2xl bg-white p-6"><h2 className="mb-2 font-bold">重置密码</h2><p className="mb-4 text-sm text-slate-500">为“{resetting.displayName}”设置新密码，原有登录会话将立即失效。</p><input type="password" className="w-full rounded-lg border border-slate-200 p-2" placeholder="至少 8 位密码" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><div className="mt-5 flex gap-3"><button className="rounded-lg border px-4 py-2" onClick={() => setResetting(null)}>取消</button><button className="rounded-lg bg-[#123c5a] px-4 py-2 text-white" onClick={() => void resetPassword()}>确认重置</button></div></div></div>}
  </div>
}
