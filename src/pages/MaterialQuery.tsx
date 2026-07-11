import { useEffect, useState } from 'react'
import { Plus, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api, assetUrl } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type M = { id: string; itemNo: string; name: string; specification?: string | null; composition?: string | null; construction?: string | null; width?: string | null; weight?: string | null; color?: string | null; unit?: string | null; remark?: string | null; labelRemark?: string | null; status: 'ACTIVE' | 'DISABLED'; images: { url: string }[]; category: { name: string }; provider?: { name: string } | null; cost?: number; stocks?: { quantity: number }[] }
type Option = { id: string; name: string }

export default function MaterialQuery() {
  const nav = useNavigate()
  const admin = useAuthStore((state) => state.user?.role === 'admin')
  const [query, setQuery] = useState({ keyword: '', categoryId: '', status: '', providerId: '' })
  const [categories, setCategories] = useState<Option[]>([])
  const [providers, setProviders] = useState<Option[]>([])
  const [list, setList] = useState<M[]>([])
  const [detail, setDetail] = useState<M | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const requests: Promise<void>[] = [api.get<{ list: Option[] }>('/categories?pageSize=100').then((result) => setCategories(result.list))]
    if (admin) requests.push(api.get<{ list: Option[] }>('/providers?pageSize=100').then((result) => setProviders(result.list)))
    void Promise.all(requests).catch((error: Error) => setMessage(error.message))
  }, [admin])

  const search = async () => {
    setLoading(true); setMessage('')
    try {
      const params = new URLSearchParams({ pageSize: '100' })
      Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
      const result = await api.get<{ list: M[] }>(`/materials?${params}`)
      setList(result.list); setSearched(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : '查询失败') } finally { setLoading(false) }
  }
  const viewDetail = async (id: string) => { try { setDetail(await api.get<M>(`/materials/${id}`)) } catch (error) { setMessage(error instanceof Error ? error.message : '详情加载失败') } }

  return <div>
    <PageHeader title="面料查询" description="按关键字、类别、启用状态和权限范围查询面料资料。" />
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.keyword} onChange={(event) => setQuery({ ...query, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && void search()} placeholder="Item No.、名称或规格" />
      <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.categoryId} onChange={(event) => setQuery({ ...query, categoryId: event.target.value })}><option value="">全部类别</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value })}><option value="">全部启用状态</option><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select>
      {admin && <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.providerId} onChange={(event) => setQuery({ ...query, providerId: event.target.value })}><option value="">全部供应商</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      <button className="rounded-lg bg-[#123c5a] px-5 text-sm font-semibold text-white" disabled={loading} onClick={() => void search()}>{loading ? '查询中…' : '查询'}</button>
    </div>
    {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
    {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}
    {!loading && searched && list.length === 0 && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">未找到匹配的面料记录。</p>}
    {!loading && !searched && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">请输入条件后点击查询。</p>}
    {list.length > 0 && <DataTable data={list} columns={[{ title: '图片', render: (row) => row.images[0] ? <img className="h-12 w-12 cursor-pointer object-cover" src={assetUrl(row.images[0].url)} alt="面料" onClick={() => void viewDetail(row.id)} /> : '-' }, { title: 'Item No.', render: (row) => row.itemNo }, { title: '名称', render: (row) => row.name }, { title: '类别', render: (row) => row.category.name }, { title: '状态', render: (row) => row.status === 'ACTIVE' ? '启用' : '停用' }, ...(admin ? [{ title: '供应商 / 成本', render: (row: M) => `${row.provider?.name ?? '-'} / ¥${row.cost ?? '-'}` }] : []), { title: '操作', render: (row) => <div className="flex gap-2"><button onClick={() => void viewDetail(row.id)}>查看详情</button><button title="加入选样" disabled={row.status !== 'ACTIVE'} onClick={() => nav(`/samples/choose?item=${row.itemNo}`)}><Plus size={16} /></button><button title="标签打印" disabled={row.status !== 'ACTIVE'} onClick={() => nav(`/print/labels?materialIds=${row.id}`)}><Printer size={16} /></button></div> }]} />}
    {detail && <div className="fixed inset-0 z-40 overflow-auto bg-slate-900/40 p-6"><div className="mx-auto max-w-3xl rounded-2xl bg-white p-6"><div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">{detail.itemNo} 详情</h2><button onClick={() => setDetail(null)}>关闭</button></div>{detail.images[0] && <img className="mb-4 max-h-96 w-full object-contain" src={assetUrl(detail.images[0].url)} alt="面料大图" />}<div className="grid grid-cols-2 gap-3 text-sm">{[['名称', detail.name], ['类别', detail.category.name], ['状态', detail.status === 'ACTIVE' ? '启用' : '停用'], ['规格', detail.specification], ['颜色', detail.color], ['单位', detail.unit], ...(admin ? [['供应商', detail.provider?.name], ['成本', detail.cost === undefined ? undefined : `¥${detail.cost}`]] : [])].map(([label, value]) => <p key={label}><b>{label}：</b>{value || '-'}</p>)}</div><div className="mt-5 flex gap-3"><button className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={detail.status !== 'ACTIVE'} onClick={() => nav(`/samples/choose?item=${detail.itemNo}`)}>加入选样</button><button className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50" disabled={detail.status !== 'ACTIVE'} onClick={() => nav(`/print/labels?materialIds=${detail.id}`)}>标签打印</button></div></div></div>}
  </div>
}
