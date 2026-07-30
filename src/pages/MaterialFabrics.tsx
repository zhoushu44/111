import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { History, Copy, Download, ImagePlus, Pencil, Plus, Power, Printer, Save, Search, Tag, Trash2, Upload, X, ScanSearch, FileSearch, RotateCcw, Hash, Layers, Image as ImageIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api, assetUrl, downloadBlob } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Material = {
  id: string
  itemNo: string
  name: string
  specification?: string | null
  composition?: string | null
  construction?: string | null
  width?: string | null
  weight?: string | null
  color?: string | null
  unit: string
  factoryNo?: string | null
  fabricSource?: string | null
  processingMethod?: string | null
  remark?: string | null
  labelRemark?: string | null
  categoryId: string
  category: { name: string }
  provider?: { id: string; name: string } | null
  providerId?: string | null
  cost?: number | null
  status: 'ACTIVE' | 'DISABLED'
  images: { id: string; url: string }[]
  createdAt: string
  updatedAt: string
}
type Option = { id: string; name: string }
type ColorRecord = {
  id: string
  customerColorNo?: string | null
  color?: string | null
  processingColorNo?: string | null
  colorOverview?: string | null
  colorWeight?: string | null
  designer?: string | null
  providerFactory?: string | null
  orderCustomer?: string | null
  processingFee?: string | null
  product?: string | null
  image?: string | null
  sortOrder?: number
}
type Draft = {
  itemNo: string
  name: string
  categoryId: string
  specification: string
  composition: string
  construction: string
  width: string
  weight: string
  color: string
  unit: string
  factoryNo: string
  fabricSource: string
  processingMethod: string
  remark: string
  labelRemark: string
  providerId: string
  cost: string
}
const emptyDraft: Draft = {
  itemNo: '', name: '', categoryId: '',
  specification: '', composition: '', construction: '',
  width: '', weight: '', color: '',
  unit: '米', remark: '', labelRemark: '',
  factoryNo: '', fabricSource: '', processingMethod: '',
  providerId: '', cost: ''
}

type Tab = 'main' | 'extra' | 'image' | 'history'
type SidebarTab = 'type' | 'source' | 'code'

type ChangeRow = {
  id: string
  action: string
  field: string | null
  fieldLabel: string | null
  oldValue: string | null
  newValue: string | null
  userDisplayName: string | null
  createdAt: string
}
const ACTION_STYLE: Record<string, { label: string; cls: string }> = {
  CREATE: { label: '创建', cls: 'bg-green-50 text-green-700' },
  UPDATE: { label: '修改', cls: 'bg-blue-50 text-blue-700' },
  TOGGLE: { label: '状态变更', cls: 'bg-amber-50 text-amber-700' },
  UPLOAD_IMAGE: { label: '上传图片', cls: 'bg-purple-50 text-purple-700' },
  DELETE_IMAGE: { label: '删除图片', cls: 'bg-rose-50 text-rose-700' }
}

export default function MaterialFabrics() {
  const nav = useNavigate()
  const admin = useAuthStore((state) => state.user?.role === 'admin')

  // 数据
  const [list, setList] = useState<Material[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [categories, setCategories] = useState<Option[]>([])
  const [providers, setProviders] = useState<Option[]>([])
  const [dictOptions, setDictOptions] = useState<Record<string, Option[]>>({})

  // 状态
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [filter, setFilter] = useState({ categoryId: '', status: '' })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Material | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('main')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('type')
  const [exporting, setExporting] = useState(false)
  const [includeImage, setIncludeImage] = useState(false)
  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [changeLoading, setChangeLoading] = useState(false)
  const pageSize = 50

  // 公司颜色色（子表）
  const [colors, setColors] = useState<ColorRecord[]>([])
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null)
  const [colorLoading, setColorLoading] = useState(false)

  // 加载数据字典选项（对应老系统 HSTIP 的选项输入）
  const loadDictionaries = async () => {
    const types = [
      { type: 'unit', label: '单位' },
      { type: 'composition', label: '面料成份' },
      { type: 'fabric_source', label: '面料来源' },
      { type: 'processing_method', label: '加工方式' }
    ]
    try {
      const results = await Promise.all(
        types.map((t) => api.get<{ list: { code: string; label: string }[] }>(`/dictionaries?type=${t.type}&pageSize=100&status=ACTIVE`))
      )
      const map: Record<string, Option[]> = {}
      types.forEach((t, i) => {
        map[t.type] = (results[i].list ?? []).map((d) => ({ id: d.label, name: d.label }))
      })
      setDictOptions(map)
    } catch (error) {
      // 字典读取失败不影响主流程，字段降级为普通文本输入
      setDictOptions({})
    }
  }

  // 加载
  const load = async (nextPage = 1) => {
    setLoading(true); setMessage('')
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) })
      if (sidebarQuery.trim()) params.set('keyword', sidebarQuery.trim())
      if (filter.categoryId) params.set('categoryId', filter.categoryId)
      if (filter.status) params.set('status', filter.status)
      const requests: [Promise<{ list: Material[]; total: number }>, Promise<{ list: Option[] }>, Promise<{ list: Option[] }> | null] = [
        api.get(`/materials?${params}`),
        api.get('/categories?pageSize=100&status=ACTIVE'),
        admin ? api.get('/providers?pageSize=100&status=ACTIVE') : null
      ]
      const [materials, categoryResult, providerResult] = await Promise.all(requests)
      setList(materials.list); setTotal(materials.total)
      setCategories(categoryResult.list); setProviders(providerResult?.list ?? [])
      setPage(nextPage)
      // 默认选中第一条
      if (materials.list.length > 0 && !activeId) setActiveId(materials.list[0].id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load(1); void loadDictionaries() }, [admin])

  // 当前选中的记录
  const active = useMemo(() => list.find((m) => m.id === activeId) ?? null, [list, activeId])

  // 操作
  const openCreate = () => { setEditing(null); setDraft({ ...emptyDraft }); setActiveId(null); setTab('main') }
  const openEdit = (row: Material) => {
    setEditing(row)
    setDraft({
      itemNo: row.itemNo, name: row.name, categoryId: row.categoryId,
      specification: row.specification ?? '', composition: row.composition ?? '', construction: row.construction ?? '',
      width: row.width ?? '', weight: row.weight ?? '', color: row.color ?? '',
      unit: row.unit, remark: row.remark ?? '', labelRemark: row.labelRemark ?? '',
      factoryNo: row.factoryNo ?? '', fabricSource: row.fabricSource ?? '', processingMethod: row.processingMethod ?? '',
      providerId: row.providerId ?? row.provider?.id ?? '', cost: row.cost == null ? '' : String(row.cost)
    })
    setTab('main')
  }
  const cancelEdit = () => { setEditing(null); setDraft(null) }
  const copyRecord = (row: Material) => {
    setEditing(null)
    setDraft({
      itemNo: `${row.itemNo}-COPY`, name: row.name, categoryId: row.categoryId,
      specification: row.specification ?? '', composition: row.composition ?? '', construction: row.construction ?? '',
      width: row.width ?? '', weight: row.weight ?? '', color: row.color ?? '',
      unit: row.unit, remark: row.remark ?? '', labelRemark: row.labelRemark ?? '',
      factoryNo: row.factoryNo ?? '', fabricSource: row.fabricSource ?? '', processingMethod: row.processingMethod ?? '',
      providerId: row.providerId ?? row.provider?.id ?? '', cost: row.cost == null ? '' : String(row.cost)
    })
    setActiveId(null)
    setTab('main')
  }
  const save = async () => {
    if (!draft) return
    if (!draft.itemNo.trim() || !draft.name.trim() || !draft.categoryId || !draft.unit.trim()) {
      setMessage('请填写 Item No.、名称、类别和单位'); return
    }
    setSaving(true)
    try {
      const nullable = (v: string) => v.trim() || null
      const payload: Record<string, unknown> = {
        itemNo: draft.itemNo.trim(), name: draft.name.trim(), categoryId: draft.categoryId,
        specification: nullable(draft.specification), composition: nullable(draft.composition),
        construction: nullable(draft.construction), width: nullable(draft.width),
        weight: nullable(draft.weight), color: nullable(draft.color),
        unit: draft.unit.trim(), remark: nullable(draft.remark), labelRemark: nullable(draft.labelRemark),
        factoryNo: nullable(draft.factoryNo), fabricSource: nullable(draft.fabricSource),
        processingMethod: nullable(draft.processingMethod)
      }
      if (admin) {
        payload.providerId = draft.providerId || null
        payload.cost = draft.cost.trim() ? Number(draft.cost) : null
      }
      const saved = editing
        ? await api.patch<Material>(`/materials/${editing.id}`, payload)
        : await api.post<Material>('/materials', payload)
      cancelEdit()
      await load(1)
      setActiveId(saved.id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally { setSaving(false) }
  }
  const toggle = async (row: Material) => {
    try {
      await api.post(`/materials/${row.id}/toggle`, { status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
      await load(page)
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败') }
  }
  const upload = async (id: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return
    try {
      const form = new FormData(); form.append('image', file)
      const image = await api.post<{ id: string; url: string }>(`/materials/${id}/images`, form)
      if (active && active.id === id) {
        // 重新拉单条
        const refreshed = await api.get<Material>(`/materials/${id}`)
        setList((prev) => prev.map((m) => m.id === id ? refreshed : m))
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '上传失败') } finally { event.target.value = '' }
  }
  const deleteImage = async (materialId: string, imageId: string) => {
    try {
      await api.delete(`/materials/${materialId}/images/${imageId}`)
      const refreshed = await api.get<Material>(`/materials/${materialId}`)
      setList((prev) => prev.map((m) => m.id === materialId ? refreshed : m))
    } catch (error) { setMessage(error instanceof Error ? error.message : '删除失败') }
  }
  const exportExcel = async () => {
    try {
      const params = new URLSearchParams()
      if (sidebarQuery.trim()) params.set('keyword', sidebarQuery.trim())
      if (filter.categoryId) params.set('categoryId', filter.categoryId)
      if (filter.status) params.set('status', filter.status)
      if (includeImage) params.set('includeImage', 'true')
      const blob = await api.download(`/exports/materials?${params}`)
      downloadBlob(blob, '面料资料.xlsx')
      setExporting(false)
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败') }
  }
  const loadChanges = async (materialId: string) => {
    setChangeLoading(true)
    try {
      const data = await api.get<{ list: ChangeRow[] }>(`/materials/${materialId}/changes`)
      setChanges(data.list)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载更改记录失败')
    } finally {
      setChangeLoading(false)
    }
  }
  useEffect(() => { if (tab === 'history' && activeId) void loadChanges(activeId) }, [tab, activeId])

  // 公司颜色色子表
  const loadColors = async (materialId: string) => {
    setColorLoading(true)
    try {
      const data = await api.get<{ list: ColorRecord[] }>(`/materials/${materialId}/colors`)
      setColors(data.list)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '颜色记录加载失败')
    } finally {
      setColorLoading(false)
    }
  }
  useEffect(() => {
    if (activeId && !draft) { setSelectedColorId(null); void loadColors(activeId) }
    else { setColors([]); setSelectedColorId(null) }
  }, [activeId, draft])
  const colorFields: (keyof ColorRecord)[] = ['customerColorNo', 'color', 'processingColorNo', 'colorOverview', 'colorWeight', 'designer', 'providerFactory', 'orderCustomer', 'processingFee', 'product']
  const updateColorField = (id: string, field: keyof ColorRecord, value: string) => {
    setColors((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value || null } : c)))
  }
  const saveColor = async (color: ColorRecord) => {
    if (!active) return
    try {
      const payload: Record<string, unknown> = {}
      for (const f of colorFields) payload[f] = color[f] ?? null
      await api.patch(`/materials/${active.id}/colors/${color.id}`, payload)
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存颜色失败') }
  }
  const addColor = async () => {
    if (!active) return
    try {
      const created = await api.post<ColorRecord>(`/materials/${active.id}/colors`, {})
      await loadColors(active.id)
      setSelectedColorId(created.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : '新增颜色失败') }
  }
  const copyColor = async () => {
    if (!active || !selectedColorId) { setMessage('请先选中一行再复制'); return }
    const src = colors.find((c) => c.id === selectedColorId)
    if (!src) return
    try {
      const payload: Record<string, unknown> = {}
      for (const f of colorFields) payload[f] = src[f] ?? null
      const created = await api.post<ColorRecord>(`/materials/${active.id}/colors`, payload)
      await loadColors(active.id)
      setSelectedColorId(created.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : '复制颜色失败') }
  }
  const deleteColor = async (explicitId?: string) => {
    const target = explicitId ?? selectedColorId
    if (!active || !target) { setMessage('请先选中一行再删除'); return }
    try {
      await api.delete(`/materials/${active.id}/colors/${target}`)
      await loadColors(active.id)
      setSelectedColorId((prev) => (prev === target ? null : prev))
    } catch (error) { setMessage(error instanceof Error ? error.message : '删除颜色失败') }
  }
  const uploadColorImage = async (colorId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !active) return
    try {
      const form = new FormData(); form.append('image', file)
      await api.post(`/materials/${active.id}/colors/${colorId}/image`, form)
      await loadColors(active.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : '颜色图片上传失败') } finally { event.target.value = '' }
  }
  const deleteColorImage = async (colorId: string) => {
    if (!active) return
    try {
      await api.delete(`/materials/${active.id}/colors/${colorId}/image`)
      await loadColors(active.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : '删除颜色图片失败') }
  }

  // 左侧边栏按当前标签分组/排序
  const groupedList = useMemo(() => {
    if (sidebarTab === 'code') {
      // 产品编码：按 itemNo 升序排列，单列展示
      const sorted = [...list].sort((a, b) => a.itemNo.localeCompare(b.itemNo, 'zh-CN'))
      return [['产品编码', sorted] as [string, Material[]]]
    }
    const map = new Map<string, Material[]>()
    list.forEach((m) => {
      const key = sidebarTab === 'source'
        ? (m.fabricSource?.trim() || '未设置面料来源')
        : m.category.name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
  }, [list, sidebarTab])

  // 将更改记录按「操作批次」分组（同一次保存/修改产生的多条记录归为一组）
  const groupedChanges = useMemo(() => {
    const groups: { key: string; action: string; userDisplayName: string | null; createdAt: string; rows: ChangeRow[] }[] = []
    for (const r of changes) {
      const key = `${r.createdAt}|${r.action}|${r.userDisplayName ?? ''}`
      let g = groups.find((x) => x.key === key)
      if (!g) { g = { key, action: r.action, userDisplayName: r.userDisplayName, createdAt: r.createdAt, rows: [] }; groups.push(g) }
      g.rows.push(r)
    }
    return groups
  }, [changes])

  // 输入字段定义
  const mainFields: { key: keyof Draft; label: string; required?: boolean; type?: 'text' | 'select' | 'combobox'; options?: Option[]; adminOnly?: boolean }[] = [
    { key: 'itemNo', label: 'Item No. (编码)', required: true },
    { key: 'name', label: '产品名称', required: true },
    { key: 'categoryId', label: '物料类别', required: true, type: 'select', options: categories },
    { key: 'unit', label: '单位', required: true, type: 'combobox', options: dictOptions.unit ?? [] },
    { key: 'composition', label: '面料成份', type: 'combobox', options: dictOptions.composition ?? [] },
    { key: 'processingMethod', label: '加工方式', type: 'combobox', options: dictOptions.processing_method ?? [] },
    { key: 'specification', label: '规格' },
    { key: 'construction', label: '组织结构' },
    { key: 'width', label: '幅宽' },
    { key: 'weight', label: '克重' },
    { key: 'color', label: '颜色' },
    { key: 'factoryNo', label: '工厂编码' },
    { key: 'providerId', label: '供应商', type: 'select', options: providers, adminOnly: true },
    { key: 'cost', label: '成本 (¥)', adminOnly: true }
  ]

  const tabBtn = (key: Tab, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${tab === key ? 'text-[#123c5a]' : 'text-slate-500 hover:text-slate-700'}`}
    >
      {label}
      {tab === key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#123c5a]" />}
    </button>
  )

  return (
    <div className="space-y-4">
      {/* 页面标题 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">面料资料维护</h1>
          <p className="mt-1 text-sm text-slate-500">维护面料资料、状态、图片，支持多条件查询与导出。</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-2.5 py-1">共 {total} 条</span>
          {active && <span className="rounded-full bg-[#e6f1f5] px-2.5 py-1 text-[#123c5a]">当前: {active.itemNo}</span>}
        </div>
      </div>

      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button onClick={() => nav('/materials/query')} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <ScanSearch size={15} /> 找货
        </button>
        <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-[#1e8a7a] px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#166f63]">
          <Plus size={15} /> 新增
        </button>
        {active && !draft && (
          <button onClick={() => copyRecord(active)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Copy size={15} /> 复制
          </button>
        )}
        {active && !draft && (
          <button onClick={() => openEdit(active)} disabled={!admin && active.status === 'DISABLED'} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <Pencil size={15} /> 编辑
          </button>
        )}
        {draft && (
          <>
            <button onClick={cancelEdit} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <X size={15} /> 取消
            </button>
            <button onClick={() => void save()} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-[#123c5a] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#0e314b] disabled:opacity-50">
              <Save size={15} /> {saving ? '保存中…' : '保存'}
            </button>
          </>
        )}
        {active && !draft && (
          <>
            <button onClick={() => nav(`/print/labels?materialIds=${active.id}`)} disabled={active.status !== 'ACTIVE'} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              <Tag size={15} /> 打印标签
            </button>
            <button onClick={() => void toggle(active)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <Power size={15} /> {active.status === 'ACTIVE' ? '停用' : '启用'}
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setExporting(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Download size={15} /> 导出 Excel
          </button>
          <button onClick={() => void load(page)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <RotateCcw size={15} /> 刷新
          </button>
        </div>
      </div>

      {message && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{message}</p>}

      {/* 主体：左侧列表 + 右侧表单 */}
      <div className="grid grid-cols-12 gap-4">
        {/* 左：列表 + 搜索 */}
        <div className="col-span-4 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-2.5 border-b border-slate-100 p-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                <input
                  value={sidebarQuery}
                  onChange={(e) => setSidebarQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void load(1)}
                  placeholder="编码 / 名称"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#1e8a7a] focus:bg-white"
                />
              </div>
              <div className="flex gap-2">
                <select value={filter.categoryId} onChange={(e) => { setFilter({ ...filter, categoryId: e.target.value }); setTimeout(() => void load(1), 0) }} className="h-9 flex-1 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-[#1e8a7a]">
                  <option value="">全部类别</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={filter.status} onChange={(e) => { setFilter({ ...filter, status: e.target.value }); setTimeout(() => void load(1), 0) }} className="h-9 rounded-lg border border-slate-200 px-2 text-xs outline-none focus:border-[#1e8a7a]">
                  <option value="">全部状态</option>
                  <option value="ACTIVE">启用</option>
                  <option value="DISABLED">停用</option>
                </select>
              </div>
              <div className="flex gap-1 rounded-lg bg-slate-50 p-1">
                {([
                  { k: 'type' as SidebarTab, label: '产品类型' },
                  { k: 'source' as SidebarTab, label: '面料来源' },
                  { k: 'code' as SidebarTab, label: '产品编码' }
                ]).map((t) => (
                  <button key={t.k} onClick={() => setSidebarTab(t.k)} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${sidebarTab === t.k ? 'bg-white text-[#123c5a] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {loading && <p className="p-4 text-center text-sm text-slate-400">加载中…</p>}
              {!loading && list.length === 0 && <p className="p-8 text-center text-sm text-slate-400">未找到匹配记录</p>}
              {!loading && groupedList.map(([group, items]) => (
                <div key={group} className="border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-1.5 bg-slate-50/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <Layers size={12} /> {group} <span className="text-slate-400">({items.length})</span>
                  </div>
                  {items.map((row) => (
                    <button
                      key={row.id}
                      onClick={() => { setActiveId(row.id); if (!draft) setTab('main') }}
                      className={`flex w-full flex-col gap-1.5 border-l-2 px-3 py-2.5 text-left transition-colors ${activeId === row.id ? 'border-[#1e8a7a] bg-[#eef7f5]' : 'border-transparent hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                          {row.images[0] ? <img src={assetUrl(row.images[0].url)} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><ImageIcon size={16} /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-slate-800">{row.name}</span>
                            {row.status === 'DISABLED' && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">停用</span>}
                            {row.color && <span className="truncate text-[11px] text-slate-400">· {row.color}</span>}
                          </div>
                        </div>
                      </div>
                      {/* 3 列：类型 / 来源 / 编码 */}
                      <div className="grid grid-cols-3 gap-2 pl-[52px] text-[11px]">
                        <div className="min-w-0">
                          <p className="text-slate-400">类型</p>
                          <p className="truncate text-slate-600">{row.category.name}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-slate-400">来源</p>
                          <p className="truncate text-slate-600">{row.fabricSource || '—'}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-slate-400">编码</p>
                          <p className="truncate font-mono text-slate-600">{row.itemNo}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {list.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                <span>第 {page} 页 · 共 {total} 条</span>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => void load(page - 1)} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40">上一页</button>
                  <button disabled={page * pageSize >= total} onClick={() => void load(page + 1)} className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40">下一页</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右：详情 / 编辑 */}
        <div className="col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Tab 头 */}
            <div className="flex items-center justify-between border-b border-slate-100 px-2">
              <div className="flex">
                {tabBtn('main', '主信息')}
                {tabBtn('extra', '附加信息')}
                {tabBtn('image', '颜色图片')}
                {tabBtn('history', '更改记录')}
              </div>
              {active && !draft && (
                <span className="px-3 text-xs text-slate-400">最后更新: {new Date(active.updatedAt).toLocaleString('zh-CN')}</span>
              )}
            </div>

            {/* Tab 内容 */}
            {!active && !draft ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-slate-400">
                <FileSearch size={36} />
                <p className="text-sm">请在左侧选择一条面料，或点击「新增」创建</p>
              </div>
            ) : tab === 'main' ? (
              <div className="p-5">
                {/* 表头：直接显示对应数值（只读，不做成下拉选择） */}
                {(active || draft) && (() => {
                  const head = (draft ?? active) as any
                  const catName = draft
                    ? (categories.find((c) => c.id === draft.categoryId)?.name ?? '—')
                    : (active?.category.name ?? '—')
                  const items: [string, string, boolean][] = [
                    ['产品编码', head.itemNo ?? '', true],
                    ['产品名称', head.name ?? '', false],
                    ['面料来源', head.fabricSource ?? '', false],
                    ['物料类别', catName, false],
                    ['单位', head.unit ?? '', false],
                  ]
                  return (
                    <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
                      {items.map(([k, v, isCode]) => (
                        <div key={k}>
                          <p className="text-[11px] text-slate-500">{k}</p>
                          <p className={`mt-0.5 truncate text-sm font-medium ${isCode ? 'font-mono text-slate-800' : 'text-slate-800'}`}>{v || '—'}</p>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                <div className="grid grid-cols-12 gap-x-4 gap-y-3">
                  {mainFields.map((f) => {
                    if (f.adminOnly && !admin) return null
                    const value = draft ? draft[f.key] : (active as any)?.[f.key] ?? ''
                    const display = draft ? value : (f.key === 'categoryId' ? active?.category.name : f.key === 'providerId' ? active?.provider?.name ?? '-' : value)
                    return (
                      <div key={f.key} className="col-span-4">
                        <label className="mb-1 block text-xs font-medium text-slate-500">
                          {f.label}{f.required && <span className="text-red-500"> *</span>}
                        </label>
                        {draft ? (
                          f.type === 'select' ? (
                            <select
                              value={String(value)}
                              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-[#1e8a7a]"
                            >
                              <option value="">{f.key === 'providerId' ? '未设置' : '请选择'}</option>
                              {f.options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                          ) : f.type === 'combobox' ? (
                            <>
                              <input
                                list={`list-${f.key}`}
                                value={String(value)}
                                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                                placeholder="请选择或输入"
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-[#1e8a7a]"
                              />
                              <datalist id={`list-${f.key}`}>
                                {f.options?.map((o) => <option key={o.id} value={o.name} />)}
                              </datalist>
                            </>
                          ) : (
                            <input
                              value={String(value)}
                              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                              type={f.key === 'cost' ? 'number' : 'text'}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-[#1e8a7a]"
                            />
                          )
                        ) : (
                          <div className={`flex h-9 items-center rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 text-sm ${f.key === 'cost' ? 'font-mono text-[#123c5a]' : 'text-slate-700'}`}>
                            {display || <span className="text-slate-300">—</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-5 grid grid-cols-12 gap-4">
                  <div className="col-span-6">
                    <label className="mb-1 block text-xs font-medium text-slate-500">备注</label>
                    {draft ? (
                      <textarea
                        value={draft.remark}
                        onChange={(e) => setDraft({ ...draft, remark: e.target.value })}
                        rows={3}
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-[#1e8a7a]"
                      />
                    ) : (
                      <div className="min-h-[76px] rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-sm text-slate-700">{active?.remark || <span className="text-slate-300">—</span>}</div>
                    )}
                  </div>
                  <div className="col-span-6">
                    <label className="mb-1 block text-xs font-medium text-slate-500">标签备注</label>
                    {draft ? (
                      <textarea
                        value={draft.labelRemark}
                        onChange={(e) => setDraft({ ...draft, labelRemark: e.target.value })}
                        rows={3}
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-[#1e8a7a]"
                      />
                    ) : (
                      <div className="min-h-[76px] rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-sm text-slate-700">{active?.labelRemark || <span className="text-slate-300">—</span>}</div>
                    )}
                  </div>
                </div>

                {active && !draft && (
                  <div className="mt-5 flex items-center gap-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-3 text-xs text-slate-500">
                    <Hash size={14} className="text-slate-400" />
                    <span>创建：{new Date(active.createdAt).toLocaleDateString('zh-CN')}</span>
                    <span className="ml-auto">更新：{new Date(active.updatedAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                )}
              </div>
            ) : tab === 'extra' ? (
              <div className="p-5">
                {active && !draft ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-12 gap-4">
                      {[
                        ['Item No.', active.itemNo],
                        ['类别', active.category.name],
                        ['单位', active.unit],
                        ['规格', active.specification],
                        ['成分', active.composition],
                        ['组织结构', active.construction],
                        ['幅宽', active.width],
                        ['克重', active.weight],
                        ['颜色', active.color],
                        ['工厂编码', active.factoryNo],
                        ['面料来源', active.fabricSource],
                        ['加工方式', active.processingMethod],
                        ['供应商', admin ? (active.provider?.name ?? '-') : '***'],
                        ['成本', admin ? (active.cost != null ? `¥ ${active.cost}` : '-') : '***'],
                        ['状态', active.status === 'ACTIVE' ? '启用' : '停用']
                      ].map(([k, v]) => (
                        <div key={k} className="col-span-4">
                          <p className="text-xs text-slate-500">{k}</p>
                          <p className="mt-1 text-sm font-medium text-slate-800">{v || '-'}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-4 text-center text-xs text-slate-500">
                      提示：附加信息字段用于补充业务说明，如需新增字段请联系管理员配置
                    </div>
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-400">请先在主信息中保存基础资料</p>
                )}
              </div>
            ) : tab === 'image' ? (
              <div className="p-5 space-y-5">
                {/* 主图区 */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">面料图片</h3>
                    {active && !draft && active.status === 'ACTIVE' && (
                      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                        <Upload size={13} /> 上传图片
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void upload(active.id, e)} />
                      </label>
                    )}
                  </div>
                  {!active ? (
                    <p className="py-8 text-center text-sm text-slate-400">请先选择或新增一条面料</p>
                  ) : active.images.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
                      <ImageIcon size={28} />
                      <p className="mt-1 text-xs">暂无图片</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-6 gap-3">
                      {active.images.map((img) => (
                        <div key={img.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                          <img src={assetUrl(img.url)} alt="" className="h-24 w-full object-cover" />
                          {!draft && (
                            <button onClick={() => void deleteImage(active.id, img.id)} className="absolute right-1 top-1 hidden rounded-full bg-slate-900/70 p-1 text-white group-hover:block">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 公司颜色色子表 */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">公司颜色色</h3>
                    {active && !draft && (
                      <div className="flex gap-1.5">
                        <button onClick={() => void addColor()} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                          <Plus size={12} /> 新增
                        </button>
                        <button onClick={() => void copyColor()} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                          <Copy size={12} /> 复制
                        </button>
                        <button onClick={() => void deleteColor()} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                          <Trash2 size={12} /> 删除
                        </button>
                      </div>
                    )}
                  </div>
                  {!active ? (
                    <p className="py-6 text-center text-sm text-slate-400">请先选择或新增一条面料</p>
                  ) : colorLoading ? (
                    <p className="py-6 text-center text-sm text-slate-400">加载中…</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            {['序号', '客户色号/花号', '颜色', '加工色号/花号', '颜色概况', '颜色克重', '设计人', '供应/加工厂', '订单客户', '加工费用', '产品', '图片', '操作'].map((h) => (
                              <th key={h} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {colors.length === 0 ? (
                            <tr>
                              <td colSpan={13} className="px-3 py-6 text-center text-slate-400">
                                暂无颜色记录，点击「新增」添加
                              </td>
                            </tr>
                          ) : (
                            colors.map((c, idx) => (
                              <tr
                                key={c.id}
                                onClick={() => setSelectedColorId(c.id)}
                                className={selectedColorId === c.id ? 'cursor-pointer bg-blue-50' : 'cursor-pointer hover:bg-slate-50'}
                              >
                                <td className="border-b border-slate-200 px-2 py-1.5 text-slate-400">{idx + 1}</td>
                                {colorFields.map((f) => (
                                  <td key={f} className="border-b border-slate-200 px-1.5 py-1.5">
                                    <input
                                      value={c[f] ?? ''}
                                      onChange={(e) => updateColorField(c.id, f, e.target.value)}
                                      onBlur={() => void saveColor(c)}
                                      className="w-full min-w-[72px] rounded border border-transparent px-1.5 py-1 text-xs outline-none hover:border-slate-200 focus:border-slate-400"
                                    />
                                  </td>
                                ))}
                                <td className="border-b border-slate-200 px-2 py-1.5">
                                  <div className="flex items-center gap-1">
                                    {c.image ? (
                                      <div className="group relative h-10 w-10 overflow-hidden rounded border border-slate-200">
                                        <img src={assetUrl(c.image)} alt="" className="h-full w-full object-cover" />
                                        <button
                                          onClick={(e) => { e.stopPropagation(); void deleteColorImage(c.id) }}
                                          className="absolute right-0.5 top-0.5 hidden rounded-full bg-slate-900/70 p-0.5 text-white group-hover:block"
                                          title="删除图片"
                                        >
                                          <Trash2 size={10} />
                                        </button>
                                      </div>
                                    ) : null}
                                    <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50" title="上传颜色图片">
                                      <ImagePlus size={13} />
                                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadColorImage(c.id, e)} />
                                    </label>
                                  </div>
                                </td>
                                <td className="border-b border-slate-200 px-2 py-1.5 text-center">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); void deleteColor(c.id) }}
                                    className="text-slate-400 hover:text-rose-600"
                                    title="删除此行"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-5">
                {!active ? (
                  <p className="py-8 text-center text-sm text-slate-400">请先在左侧选择一条面料，再查看更改记录</p>
                ) : changeLoading ? (
                  <p className="py-8 text-center text-sm text-slate-400">加载中…</p>
                ) : changes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
                    <History size={32} />
                    <p className="text-sm">暂无更改记录</p>
                    <p className="text-xs text-slate-300">保存、修改或调整状态后，这里会自动记录每一次变更</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <History size={14} className="text-slate-400" />
                      <span>共 {changes.length} 条变更，按时间倒序展示</span>
                    </div>
                    {groupedChanges.map((group, gi) => {
                      const style = ACTION_STYLE[group.action] ?? { label: group.action, cls: 'bg-slate-100 text-slate-600' }
                      return (
                        <div key={gi} className="relative rounded-xl border border-slate-200 bg-white shadow-sm">
                          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.cls}`}>{style.label}</span>
                              <span className="text-sm font-medium text-slate-700">{group.userDisplayName || '系统'}</span>
                            </div>
                            <span className="text-xs text-slate-400">{new Date(group.createdAt).toLocaleString('zh-CN')}</span>
                          </div>
                          <ul className="divide-y divide-slate-50">
                            {group.rows.map((r) => (
                              <li key={r.id} className="flex items-start gap-2 px-4 py-2 text-sm">
                                <span className="mt-1.5 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-[#1e8a7a]" />
                                <span className="text-slate-700">
                                  <span className="font-medium text-slate-800">{r.fieldLabel}</span>
                                  {r.action === 'CREATE' || !r.oldValue ? (
                                    <span className="text-slate-600">：{r.newValue || '（空）'}</span>
                                  ) : (
                                    <span className="text-slate-600">：<span className="text-slate-400 line-through">{r.oldValue}</span> <span className="mx-1 text-slate-300">→</span> <span className="font-medium text-[#123c5a]">{r.newValue || '（空）'}</span></span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 导出 */}
      {exporting && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-slate-900">导出面料资料</h2>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={includeImage} onChange={(e) => setIncludeImage(e.target.checked)} className="h-4 w-4 accent-[#123c5a]" />
              包含图片
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setExporting(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">取消</button>
              <button onClick={() => void exportExcel()} className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e314b]">下载 Excel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
