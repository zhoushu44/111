import { useEffect, useState } from 'react'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api, downloadBlob } from '@/lib/api'

type Location = { id: string; code: string; name: string }
type Stock = { id: string; quantity: number; material: { itemNo: string; name: string; specification?: string | null; unit: string }; location: Location }
type Query = { keyword: string; locationId: string; stockStatus: string }

export default function StockQuery() {
  const [locations, setLocations] = useState<Location[]>([])
  const [list, setList] = useState<Stock[]>([])
  const [query, setQuery] = useState<Query>({ keyword: '', locationId: '', stockStatus: '' })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const pageSize = 20

  const search = (withPage = page) => {
    const params = new URLSearchParams({ page: String(withPage), pageSize: String(pageSize) })
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
    return params
  }

  const load = async (nextPage = page) => {
    setLoading(true)
    setMessage('')
    try {
      const result = await api.get<{ list: Stock[]; total: number }>(`/sample-stocks?${search(nextPage)}`)
      setList(result.list); setTotal(result.total); setPage(nextPage)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void api.get<{ list: Location[] }>('/sample-locations?pageSize=100&status=ACTIVE').then((result) => setLocations(result.list)).catch((error: Error) => setMessage(error.message))
    void load(1)
  }, [])

  const reset = () => {
    const empty = { keyword: '', locationId: '', stockStatus: '' }
    setQuery(empty)
    setTimeout(() => void api.get<{ list: Stock[]; total: number }>(`/sample-stocks?page=1&pageSize=${pageSize}`).then((result) => { setList(result.list); setTotal(result.total); setPage(1) }), 0)
  }

  const exportStocks = async () => {
    try { downloadBlob(await api.download(`/exports/stocks?${search(1)}`), '样品库存.xlsx') } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败') }
  }

  return (
    <div>
      <PageHeader title="样品库存查询" description="按关键词、库位和库存状态查询实际库存。" />
      <div className="mb-4 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input placeholder="Item No. / 名称" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.keyword} onChange={(event) => setQuery({ ...query, keyword: event.target.value })} />
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.locationId} onChange={(event) => setQuery({ ...query, locationId: event.target.value })}>
          <option value="">全部库位</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.code} - {location.name}</option>)}
        </select>
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.stockStatus} onChange={(event) => setQuery({ ...query, stockStatus: event.target.value })}>
          <option value="">全部库存状态</option>
          <option value="IN_STOCK">有库存</option>
          <option value="OUT_OF_STOCK">零库存</option>
        </select>
        <button className="rounded-lg bg-[#123c5a] px-5 text-sm font-semibold text-white" onClick={() => void load(1)}>查询</button>
        <button className="rounded-lg border border-slate-200 px-5 text-sm font-semibold text-slate-600" onClick={reset}>重置</button>
        <button className="rounded-lg border border-slate-200 px-5 text-sm font-semibold text-slate-600" onClick={() => void exportStocks()}>导出</button>
      </div>

      {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
      {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}

      <DataTable data={list} columns={[
        { title: 'Item No.', render: (row) => row.material.itemNo },
        { title: '名称', render: (row) => row.material.name },
        { title: '规格', render: (row) => row.material.specification || '-' },
        { title: '库位', render: (row) => `${row.location.code} - ${row.location.name}` },
        { title: '库存数量', render: (row) => `${row.quantity} ${row.material.unit}` },
      ]} />

      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm text-slate-500">共 {total} 条</span>
        <button className="rounded-lg border border-slate-200 px-3 py-1 text-sm disabled:opacity-40" disabled={page === 1} onClick={() => void load(page - 1)}>上一页</button>
        <span className="text-sm text-slate-500">第 {page} 页</span>
        <button className="rounded-lg border border-slate-200 px-3 py-1 text-sm disabled:opacity-40" disabled={page * pageSize >= total} onClick={() => void load(page + 1)}>下一页</button>
      </div>
    </div>
  )
}
