import { useEffect, useState } from 'react'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'

type Transaction = { id: string; documentNo: string; type: 'IN' | 'OUT'; remark?: string | null; createdAt: string; createdBy: { displayName: string; username: string }; items: { id: string; quantity: number; material: { itemNo: string; name: string; unit: string }; location: { code: string; name: string } }[] }
type Option = { id: string; name: string; code?: string }
const pageSize = 20

export default function StockTransactions() {
  const [query, setQuery] = useState({ type: '', dateFrom: '', dateTo: '', keyword: '', materialId: '', locationId: '' })
  const [list, setList] = useState<Transaction[]>([])
  const [materials, setMaterials] = useState<Option[]>([])
  const [locations, setLocations] = useState<Option[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async (nextPage = page) => {
    setLoading(true); setMessage('')
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) })
      Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
      const result = await api.get<{ list: Transaction[]; total: number }>(`/sample-transactions?${params}`)
      setList(result.list); setTotal(result.total); setPage(nextPage)
    } catch (error) { setMessage(error instanceof Error ? error.message : '加载失败') } finally { setLoading(false) }
  }

  useEffect(() => {
    void Promise.all([api.get<{ list: Option[] }>('/materials?pageSize=100'), api.get<{ list: Option[] }>('/sample-locations?pageSize=100')])
      .then(([materialResult, locationResult]) => { setMaterials(materialResult.list); setLocations(locationResult.list) })
      .catch((error: Error) => setMessage(error.message))
    void load(1)
  }, [])

  return <div>
    <PageHeader title="库存流水" description="按条件查看样品入库、出库的只读流水。" />
    <div className="mb-4 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <input type="date" title="起始日期" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.dateFrom} onChange={(event) => setQuery({ ...query, dateFrom: event.target.value })} />
      <input type="date" title="结束日期" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.dateTo} onChange={(event) => setQuery({ ...query, dateTo: event.target.value })} />
      <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.type} onChange={(event) => setQuery({ ...query, type: event.target.value })}><option value="">全部类型</option><option value="IN">入库</option><option value="OUT">出库</option></select>
      <input placeholder="单据号、Item No. 或名称" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.keyword} onChange={(event) => setQuery({ ...query, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && void load(1)} />
      <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.materialId} onChange={(event) => setQuery({ ...query, materialId: event.target.value })}><option value="">全部面料</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.locationId} onChange={(event) => setQuery({ ...query, locationId: event.target.value })}><option value="">全部库位</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} - ` : ''}{item.name}</option>)}</select>
      <button className="rounded-lg bg-[#123c5a] px-5 text-sm font-semibold text-white" disabled={loading} onClick={() => void load(1)}>查询</button>
    </div>
    {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
    {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}
    {!loading && !message && list.length === 0 && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">暂无符合条件的库存流水。</p>}
    <DataTable data={list} columns={[
      { title: '单据号', render: (row) => row.documentNo },
      { title: '入/出库', render: (row) => <span className={row.type === 'IN' ? 'text-emerald-600' : 'text-amber-600'}>{row.type === 'IN' ? '入库' : '出库'}</span> },
      { title: '面料 / 库位明细', render: (row) => <div className="space-y-1">{row.items.map((item) => <p key={item.id}>{item.material.itemNo} {item.material.name} · {item.location.code} {item.location.name}</p>)}</div> },
      { title: '数量', render: (row) => <div className="space-y-1">{row.items.map((item) => <p key={item.id}>{item.quantity} {item.material.unit}</p>)}</div> },
      { title: '备注', render: (row) => row.remark || '-' },
      { title: '操作人', render: (row) => row.createdBy.displayName || row.createdBy.username },
      { title: '时间', render: (row) => new Date(row.createdAt).toLocaleString() },
    ]} />
    <div className="mt-4 flex items-center justify-end gap-3 text-sm"><span>共 {total} 条，第 {page} 页</span><button disabled={loading || page <= 1} onClick={() => void load(page - 1)}>上一页</button><button disabled={loading || page * pageSize >= total} onClick={() => void load(page + 1)}>下一页</button></div>
  </div>
}
