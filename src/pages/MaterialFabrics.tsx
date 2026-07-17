import { ChangeEvent, useEffect, useState } from 'react'
import { Download, ImagePlus, Pencil, Power, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api, assetUrl, downloadBlob } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Material = { id: string; itemNo: string; name: string; specification?: string | null; composition?: string | null; construction?: string | null; width?: string | null; weight?: string | null; color?: string | null; unit: string; remark?: string | null; labelRemark?: string | null; categoryId: string; category: { name: string }; provider?: { id: string; name: string } | null; providerId?: string | null; cost?: number | null; status: 'ACTIVE' | 'DISABLED'; images: { id: string; url: string }[] }
type Option = { id: string; name: string }
type Draft = { itemNo: string; name: string; categoryId: string; specification: string; composition: string; construction: string; width: string; weight: string; color: string; unit: string; remark: string; labelRemark: string; providerId: string; cost: string }
const emptyDraft: Draft = { itemNo: '', name: '', categoryId: '', specification: '', composition: '', construction: '', width: '', weight: '', color: '', unit: '米', remark: '', labelRemark: '', providerId: '', cost: '' }

export default function MaterialFabrics() {
  const nav = useNavigate()
  const admin = useAuthStore((state) => state.user?.role === 'admin')
  const [list, setList] = useState<Material[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [providers, setProviders] = useState<Option[]>([])
  const [query, setQuery] = useState({ keyword: '', categoryId: '', status: '' })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [exporting, setExporting] = useState(false)
  const [includeImage, setIncludeImage] = useState(false)
  const pageSize = 20

  const load = async (nextPage = page) => {
    setLoading(true); setMessage('')
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) })
      Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
      const requests: [Promise<{ list: Material[]; total: number }>, Promise<{ list: Option[] }>, Promise<{ list: Option[] }> | null] = [api.get(`/materials?${params}`), api.get('/categories?pageSize=100&status=ACTIVE'), admin ? api.get('/providers?pageSize=100&status=ACTIVE') : null]
      const [materials, categoryResult, providerResult] = await Promise.all(requests)
      setList(materials.list); setTotal(materials.total); setCategories(categoryResult.list); setProviders(providerResult?.list ?? []); setPage(nextPage)
    } catch (error) { setMessage(error instanceof Error ? error.message : '加载失败') } finally { setLoading(false) }
  }
  useEffect(() => { void load(1) }, [admin])

  const toggle = async (row: Material) => { try { await api.post(`/materials/${row.id}/toggle`, { status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }); await load() } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败') } }
  const upload = async (id: string, event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; try { const form = new FormData(); form.append('image', file); await api.post(`/materials/${id}/images`, form); await load() } catch (error) { setMessage(error instanceof Error ? error.message : '上传失败') } finally { event.target.value = '' } }
  const openCreate = () => { setEditing(null); setDraft(emptyDraft); setMessage('') }
  const openEdit = (row: Material) => { setEditing(row); setDraft({ itemNo: row.itemNo, name: row.name, categoryId: row.categoryId, specification: row.specification ?? '', composition: row.composition ?? '', construction: row.construction ?? '', width: row.width ?? '', weight: row.weight ?? '', color: row.color ?? '', unit: row.unit, remark: row.remark ?? '', labelRemark: row.labelRemark ?? '', providerId: row.providerId ?? row.provider?.id ?? '', cost: row.cost == null ? '' : String(row.cost) }); setMessage('') }
  const save = async () => {
    if (!draft) return
    if (!draft.itemNo.trim() || !draft.name.trim() || !draft.categoryId || !draft.unit.trim()) { setMessage('请填写 Item No.、名称、类别和单位'); return }
    setSaving(true)
    try {
      const nullable = (value: string) => value.trim() || null
      const payload: Record<string, unknown> = { itemNo: draft.itemNo.trim(), name: draft.name.trim(), categoryId: draft.categoryId, specification: nullable(draft.specification), composition: nullable(draft.composition), construction: nullable(draft.construction), width: nullable(draft.width), weight: nullable(draft.weight), color: nullable(draft.color), unit: draft.unit.trim(), remark: nullable(draft.remark), labelRemark: nullable(draft.labelRemark) }
      if (admin) { payload.providerId = draft.providerId || null; payload.cost = draft.cost.trim() ? Number(draft.cost) : null }
      await (editing ? api.patch(`/materials/${editing.id}`, payload) : api.post('/materials', payload))
      setDraft(null); setEditing(null); await load(editing ? page : 1)
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败') } finally { setSaving(false) }
  }
  const exportExcel = async () => { try { const params = new URLSearchParams(); Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) }); if (includeImage) params.set('includeImage', 'true'); const blob = await api.download(`/exports/materials?${params}`); downloadBlob(blob, '面料资料.xlsx'); setExporting(false) } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败') } }

  return <div>
    <PageHeader title="面料资料维护" description="维护面料资料、状态和图片。" action="新增面料" onAction={openCreate} />
    <div className="mb-4 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4"><input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" placeholder="Item No. 或名称" value={query.keyword} onChange={(event) => setQuery({ ...query, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && void load(1)} /><select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.categoryId} onChange={(event) => setQuery({ ...query, categoryId: event.target.value })}><option value="">全部类别</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value })}><option value="">全部状态</option><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select><button className="rounded-lg bg-[#123c5a] px-5 text-sm font-semibold text-white" onClick={() => void load(1)}>查询</button><button className="flex items-center gap-1 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600" onClick={() => setExporting(true)}><Download size={16} />导出 Excel</button></div>
    {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}{message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}
    <DataTable data={list} columns={[{ title: '图片', render: (row) => row.images[0] ? <img className="h-12 w-12 object-cover" src={assetUrl(row.images[0].url)} alt="面料" /> : '-' }, { title: 'Item No.', render: (row) => row.itemNo }, { title: '名称', render: (row) => row.name }, { title: '类别', render: (row) => row.category.name }, { title: '状态', render: (row) => row.status === 'ACTIVE' ? '启用' : '停用' }, ...(admin ? [{ title: '供应商 / 成本', render: (row: Material) => `${row.provider?.name ?? '-'} / ¥${row.cost ?? '-'}` }] : []), { title: '操作', render: (row) => <div className="flex gap-2"><button title="编辑" onClick={() => openEdit(row)}><Pencil size={16} /></button><label title="上传图片" className="cursor-pointer"><ImagePlus size={16} /><input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={row.status !== 'ACTIVE'} onChange={(event) => void upload(row.id, event)} /></label><button title="标签打印" disabled={row.status !== 'ACTIVE'} onClick={() => nav(`/print/labels?materialIds=${row.id}`)}><Printer size={16} /></button><button title={row.status === 'ACTIVE' ? '停用' : '启用'} onClick={() => void toggle(row)}><Power size={16} /></button></div> }]} />
    <div className="mt-4 flex justify-end gap-3 text-sm"><span>共 {total} 条，第 {page} 页</span><button disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>上一页</button><button disabled={page * pageSize >= total || loading} onClick={() => void load(page + 1)}>下一页</button></div>
    {draft && <div className="fixed inset-0 z-40 overflow-auto bg-slate-900/40 p-6"><div className="mx-auto max-w-3xl rounded-2xl bg-white p-6"><h2 className="mb-4 text-lg font-bold">{editing ? '编辑面料' : '新增面料'}</h2><div className="grid gap-3 md:grid-cols-2">{([['itemNo', 'Item No.'], ['name', '名称'], ['specification', '规格'], ['composition', '成分'], ['construction', '组织'], ['width', '幅宽'], ['weight', '克重'], ['color', '颜色'], ['unit', '单位'], ['remark', '备注'], ['labelRemark', '标签备注']] as const).map(([key, label]) => <label key={key} className="block text-sm"><span>{label}{['itemNo', 'name', 'unit'].includes(key) ? ' *' : ''}</span><input className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}<label className="block text-sm"><span>类别 *</span><select className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">请选择类别</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{admin && <><label className="block text-sm"><span>供应商</span><select className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={draft.providerId} onChange={(event) => setDraft({ ...draft, providerId: event.target.value })}><option value="">未设置</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm"><span>成本</span><input min="0" step="0.01" type="number" className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} /></label></> }</div>{editing?.images.length ? <div className="mt-4"><p className="mb-2 text-sm">已有图片</p><div className="flex flex-wrap gap-2">{editing.images.map((image) => <img key={image.url} className="h-20 w-20 object-cover" src={assetUrl(image.url)} alt="面料" />)}</div></div> : null}{!editing && <p className="mt-4 text-sm text-slate-500">保存后可通过列表中的上传图片按钮添加图片。</p>}<div className="mt-5 flex gap-3"><button className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={() => setDraft(null)}>取消</button><button disabled={saving} className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm text-white disabled:opacity-50" onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button></div></div></div>}
    {exporting && <div className="fixed inset-0 z-40 bg-slate-900/40 p-6"><div className="mx-auto max-w-md rounded-2xl bg-white p-6"><h2 className="mb-4 text-lg font-bold">导出面料资料</h2><label className="block text-sm"><input type="checkbox" checked={includeImage} onChange={(event) => setIncludeImage(event.target.checked)} /> 包含图片</label><div className="mt-5 flex gap-3"><button className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={() => setExporting(false)}>取消</button><button className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm text-white" onClick={() => void exportExcel()}>下载 Excel</button></div></div></div>}
  </div>
}
