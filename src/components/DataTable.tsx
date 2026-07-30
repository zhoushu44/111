import type { ReactNode } from 'react'

interface Column<T> {
  title: string
  render: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  // 可选分页（不传则不显示分页条，向后兼容）
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
}

// 计算需要展示的页码窗口（当前页前后各 1 页 + 首页/末页 + 省略号）
function pageWindow(current: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const out: (number | '...')[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) out.push('...')
    out.push(p)
    prev = p
  }
  return out
}

export default function DataTable<T>({ columns, data, total, page = 1, pageSize, onPageChange }: DataTableProps<T>) {
  const showPager = total !== undefined && typeof onPageChange === 'function' && total > (pageSize ?? data.length)
  const totalPages = pageSize ? Math.max(1, Math.ceil(total! / pageSize)) : 1

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.title} className={`border-b border-slate-200 px-4 py-3 ${column.className ?? ''}`}>{column.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-400">暂无数据</td></tr> : data.map((row, index) => (
            <tr key={index} className="border-b border-slate-100 last:border-0 hover:bg-[#f8f4ec]">
              {columns.map((column) => (
                <td key={column.title} className={`px-4 py-3 align-middle ${column.className ?? ''}`}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {showPager && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <span className="text-slate-500">共 {total} 条</span>
          <div className="flex items-center gap-1">
            <button
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => onPageChange!(page - 1)}
            >
              上一页
            </button>
            {pageWindow(page, totalPages).map((p, i) =>
              p === '...'
                ? <span key={`e${i}`} className="px-2 text-slate-400">…</span>
                : <button
                    key={p}
                    className={`min-w-[34px] rounded-lg px-2.5 py-1.5 font-medium transition-colors ${p === page ? 'bg-[#123c5a] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    onClick={() => onPageChange!(p)}
                  >
                    {p}
                  </button>
            )}
            <button
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => onPageChange!(page + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
