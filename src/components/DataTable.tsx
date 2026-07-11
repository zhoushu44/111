import type { ReactNode } from 'react'

interface Column<T> {
  title: string
  render: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
}

export default function DataTable<T>({ columns, data }: DataTableProps<T>) {
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
    </div>
  )
}
