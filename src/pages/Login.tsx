import { useNavigate } from 'react-router-dom'
import { ShieldCheck, UserRound } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import type { RoleCode } from '@/types'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  const handleLogin = (role: RoleCode) => {
    login(role)
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#123c5a] p-8 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl grid-cols-[1.15fr_0.85fr] overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <section className="relative overflow-hidden bg-[#123c5a] p-12">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,#c9944a_0,transparent_32%),radial-gradient(circle_at_85%_70%,#1e8a7a_0,transparent_28%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/80">
                <ShieldCheck size={16} />
                面料样品贸易 ERP
              </div>
              <h1 className="max-w-xl text-5xl font-black leading-tight tracking-tight">敏群商贸数字化样品管理平台</h1>
              <p className="mt-6 max-w-lg text-base leading-8 text-white/72">覆盖面料资料、客户选样、样品库存、Excel 导出、70×40 标签打印和角色权限控制。</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {['面料建档', '扫码选样', '标签打印'].map((item) => (
                <div key={item} className="rounded-2xl border border-white/12 bg-white/10 p-4 backdrop-blur">
                  <div className="text-lg font-bold text-[#f0c06a]">{item}</div>
                  <div className="mt-1 text-xs text-white/60">首期核心链路</div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="flex items-center justify-center bg-[#f5efe4] p-10 text-slate-900">
          <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white/80 p-7 shadow-xl backdrop-blur">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#123c5a] text-white">
                <UserRound size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold">系统登录</h2>
                <p className="text-sm text-slate-500">选择演示账号进入系统</p>
              </div>
            </div>
            <div className="space-y-3">
              <button onClick={() => handleLogin('admin')} className="w-full rounded-xl bg-[#123c5a] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#0e314b]">管理员登录</button>
              <button onClick={() => handleLogin('staff')} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">员工登录</button>
            </div>
            <div className="mt-6 rounded-2xl bg-[#f8f4ec] p-4 text-xs leading-6 text-slate-500">
              管理员可见供应商、客户资料和系统管理；员工默认隐藏敏感菜单和成本/供应商字段。
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
