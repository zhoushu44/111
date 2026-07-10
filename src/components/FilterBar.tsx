interface FilterBarProps {
  placeholder?: string
  primary?: string
}

export default function FilterBar({ placeholder = '输入关键字查询', primary = '查询' }: FilterBarProps) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-3">
        <input className="h-10 min-w-72 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]" placeholder={placeholder} />
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]">
          <option>全部状态</option>
          <option>启用</option>
          <option>停用</option>
        </select>
        <button className="rounded-lg bg-[#123c5a] px-5 text-sm font-semibold text-white hover:bg-[#0e314b]">{primary}</button>
        <button className="rounded-lg border border-slate-200 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50">重置</button>
      </div>
    </div>
  )
}
