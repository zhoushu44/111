import { ClipboardList, Printer, Shirt, Warehouse } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { fabrics, sampleRecords } from '@/data/mock'

const stats = [
  { label: '面料资料', value: fabrics.length, icon: Shirt, tone: 'bg-[#123c5a]' },
  { label: '本周选样', value: sampleRecords.length, icon: ClipboardList, tone: 'bg-[#1e8a7a]' },
  { label: '库存总量', value: fabrics.reduce((sum, item) => sum + item.stockQty, 0), icon: Warehouse, tone: 'bg-[#c9944a]' },
  { label: '待打印标签', value: 12, icon: Printer, tone: 'bg-slate-700' },
]

export default function Dashboard() {
  return (
    <div>
      <PageHeader title="工作台" description="面料录入、客户选样、导出表格、标签打印的日常入口。" />
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl text-white ${stat.tone}`}><Icon size={21} /></div>
              <div className="text-3xl font-black text-slate-900">{stat.value}</div>
              <div className="mt-1 text-sm text-slate-500">{stat.label}</div>
            </div>
          )
        })}
      </div>
      <div className="mt-5 grid grid-cols-[1fr_1fr] gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold">快捷操作</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {['新增面料资料', '客户选样管理', '打印标签', '导出选样 Excel'].map((item) => (
              <button key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold hover:border-[#1e8a7a] hover:bg-white">{item}</button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold">最近选样</h2>
          <div className="space-y-3">
            {sampleRecords.map((record) => (
              <div key={record.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <div>
                  <div className="font-semibold">{record.orderNo}</div>
                  <div className="text-xs text-slate-500">{record.customerName} · {record.itemCount} 款</div>
                </div>
                <span className="rounded-full bg-[#e8f5f2] px-3 py-1 text-xs font-semibold text-[#1e8a7a]">{record.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
