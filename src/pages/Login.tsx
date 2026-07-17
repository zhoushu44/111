import { FormEvent, useEffect, useState } from 'react'
import { ShieldCheck, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const bootstrapAdmin = useAuthStore((state) => state.bootstrapAdmin)
  const [initialized, setInitialized] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => { api.get<{ initialized: boolean }>('/auth/bootstrap-status').then(({ initialized }) => setInitialized(initialized)).catch((error) => setMessage(error instanceof Error ? error.message : '无法检查系统初始化状态')) }, [])
  const submit = async (event: FormEvent) => { event.preventDefault(); setPending(true); setMessage(''); try { await login(username, password); navigate('/dashboard') } catch (error) { setMessage(error instanceof Error ? error.message : '登录失败') } finally { setPending(false) } }
  const submitBootstrap = async (event: FormEvent) => { event.preventDefault(); if (password !== confirmPassword) return setMessage('两次输入的密码不一致'); setPending(true); setMessage(''); try { await bootstrapAdmin(username, displayName, password, confirmPassword); navigate('/dashboard') } catch (error) { setMessage(error instanceof Error ? error.message : '管理员初始化失败') } finally { setPending(false) } }
  const isBootstrap = initialized === false

  return <div className="min-h-screen bg-[#123c5a] p-8 text-white"><div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl grid-cols-[1.15fr_0.85fr] overflow-hidden rounded-[2rem] bg-white shadow-2xl"><section className="bg-[#123c5a] p-12"><div className="flex h-full flex-col justify-between"><div><div className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/80"><ShieldCheck size={16} />面料样品贸易 ERP</div><h1 className="max-w-xl text-5xl font-black leading-tight">面料 ERP</h1><p className="mt-6 max-w-lg leading-8 text-white/72">覆盖面料资料、客户选样、Excel 导出、标签打印和角色权限控制。</p></div></div></section><section className="flex items-center justify-center bg-[#f5efe4] p-10 text-slate-900">{initialized === null ? <div className="text-center text-slate-500">{message || '正在检查系统初始化状态…'}</div> : <form onSubmit={isBootstrap ? submitBootstrap : submit} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-xl"><div className="mb-7 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#123c5a] text-white"><UserRound size={22} /></div><div><h2 className="text-xl font-bold">{isBootstrap ? '初始化管理员' : '系统登录'}</h2><p className="text-sm text-slate-500">{isBootstrap ? '请创建系统首个管理员账号' : '系统已初始化，请登录'}</p></div></div><div className="space-y-4"><input required minLength={isBootstrap ? 3 : 1} maxLength={50} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="管理员账号" className="h-11 w-full rounded-xl border border-slate-200 px-3" />{isBootstrap && <input required minLength={1} maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="显示名称" className="h-11 w-full rounded-xl border border-slate-200 px-3" />}<input required type="password" minLength={isBootstrap ? 8 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码" className="h-11 w-full rounded-xl border border-slate-200 px-3" />{isBootstrap && <input required type="password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="确认密码" className="h-11 w-full rounded-xl border border-slate-200 px-3" />}<button disabled={pending} className="w-full rounded-xl bg-[#123c5a] px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-400">{pending ? (isBootstrap ? '初始化中…' : '登录中…') : (isBootstrap ? '初始化并登录' : '登录')}</button>{message && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{message}</p>}</div></form>}</section></div></div>
}
