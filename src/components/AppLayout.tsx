import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Search } from 'lucide-react'
import { menuItems } from '@/config/menu'
import { useAuthStore } from '@/store/authStore'

export default function AppLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const availableMenus = menuItems.filter((item) => user && item.roles.includes(user.role))
  const groups = Array.from(new Set(availableMenus.map((item) => item.group)))

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#f4f0e8] text-slate-800">
      <aside className="fixed left-0 top-0 z-20 h-screen w-64 border-r border-slate-200 bg-[#123c5a] text-white shadow-xl">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c9944a] font-bold text-[#123c5a]">MQ</div>
          <div>
            <div className="text-sm font-semibold tracking-wide">面料 ERP</div>
            <div className="text-xs text-white/60">面料样品管理系统</div>
          </div>
        </div>
        <nav className="h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-white/45">{group}</div>
              <div className="space-y-1">
                {availableMenus.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-white text-[#123c5a] shadow-sm' : 'text-white/78 hover:bg-white/10 hover:text-white'}`
                      }
                    >
                      <Icon size={17} />
                      <span>{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
          <div className="flex items-center gap-4">
            <Menu size={20} className="text-slate-500" />
            <div className="relative w-80">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#1e8a7a]" placeholder="搜索 Item No. / 客户 / 选样单" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-semibold">{user?.displayName}</div>
              <div className="text-xs text-slate-500">{user?.role === 'admin' ? '管理员' : '员工'}</div>
            </div>
            <button onClick={handleLogout} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900">
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
