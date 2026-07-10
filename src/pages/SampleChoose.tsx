import { useMemo, useState } from 'react'
import { FileDown, Plus, Printer, Save, ScanLine, Trash2 } from 'lucide-react'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { customers, fabrics } from '@/data/mock'
import type { MaterialFabric } from '@/types'

interface SelectedFabric extends MaterialFabric {
  quantity: number
  temporaryRemark: string
}

export default function SampleChoose() {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '')
  const [scanCode, setScanCode] = useState('')
  const [selected, setSelected] = useState<SelectedFabric[]>(fabrics.slice(0, 1).map((item) => ({ ...item, quantity: 1, temporaryRemark: '' })))
  const [message, setMessage] = useState('')

  const customer = useMemo(() => customers.find((item) => item.id === customerId), [customerId])

  const addFabric = (code?: string) => {
    const keyword = (code ?? scanCode).trim().toLowerCase()
    const target = fabrics.find((item) => item.itemNo.toLowerCase() === keyword) ?? fabrics.find((item) => !selected.some((row) => row.id === item.id))

    if (!target) {
      setMessage('没有可添加的面料')
      return
    }

    if (selected.some((item) => item.id === target.id)) {
      setMessage(`${target.itemNo} 已在选样清单中`)
      return
    }

    setSelected((list) => [...list, { ...target, quantity: 1, temporaryRemark: '' }])
    setScanCode('')
    setMessage(`已添加 ${target.itemNo}`)
  }

  const updateItem = (id: string, patch: Partial<SelectedFabric>) => {
    setSelected((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const removeItem = (id: string) => {
    setSelected((list) => list.filter((item) => item.id !== id))
    setMessage('已移除选样明细')
  }

  const saveChoose = () => {
    setMessage(`已保存 ${customer?.name ?? '客户'} 的选样单，共 ${selected.length} 款`)
  }

  return (
    <div>
      <PageHeader title="客户选样管理" description="选择客户后，通过手动编码、扫码枪或查询方式添加面料，生成选样单。" />
      <div className="mb-5 grid grid-cols-[360px_1fr] gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold">选样信息</h2>
          <label className="mb-2 block text-xs font-semibold text-slate-500">客户</label>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="mb-4 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]">
            {customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <label className="mb-2 block text-xs font-semibold text-slate-500">扫码/输入 Item No.</label>
          <div className="flex gap-2">
            <input value={scanCode} onChange={(event) => setScanCode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addFabric()} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]" placeholder="MQ-CT-24001" />
            <button onClick={() => addFabric()} className="rounded-lg bg-[#123c5a] px-3 text-white"><ScanLine size={18} /></button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> 规格</label>
            <label className="flex items-center gap-2"><input type="checkbox" /> 成本</label>
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> 图片</label>
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> 备注</label>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold">操作区</h2>
          <div className="grid grid-cols-4 gap-3">
            <button onClick={() => addFabric()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold hover:border-[#1e8a7a]"><Plus size={17} />添加面料</button>
            <button onClick={saveChoose} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold hover:border-[#1e8a7a]"><Save size={17} />保存选样</button>
            <button onClick={() => setMessage('已生成 Excel 导出任务')} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold hover:border-[#1e8a7a]"><FileDown size={17} />导出 Excel</button>
            <button onClick={() => setMessage('已进入批量标签打印流程')} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold hover:border-[#1e8a7a]"><Printer size={17} />打印标签</button>
          </div>
          <div className="mt-4 rounded-xl bg-[#f8f4ec] p-4 text-sm text-slate-600">
            当前客户：<b>{customer?.name}</b>；已选 <b>{selected.length}</b> 款。{message ? <span className="ml-2 text-[#1e8a7a]">{message}</span> : null}
          </div>
        </div>
      </div>
      <DataTable<SelectedFabric>
        data={selected}
        columns={[
          { title: 'Item No.', render: (row) => <span className="font-semibold text-[#123c5a]">{row.itemNo}</span> },
          { title: '图片', render: (row) => <img src={row.image} className="h-12 w-12 rounded-lg object-cover" /> },
          { title: '面料名称', render: (row) => row.name },
          { title: '规格', render: (row) => `${row.composition} / ${row.width} / ${row.weight}` },
          { title: '数量', render: (row) => <input type="number" min={1} className="h-8 w-20 rounded border border-slate-200 px-2" value={row.quantity} onChange={(event) => updateItem(row.id, { quantity: Number(event.target.value) })} /> },
          { title: '临时备注', render: (row) => <input className="h-8 w-full rounded border border-slate-200 px-2" value={row.temporaryRemark} onChange={(event) => updateItem(row.id, { temporaryRemark: event.target.value })} placeholder="本次打印备注" /> },
          { title: '操作', render: (row) => <button onClick={() => removeItem(row.id)} className="text-red-500"><Trash2 size={16} /></button> },
        ]}
      />
    </div>
  )
}
