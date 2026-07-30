import { useEffect, useMemo, useState } from 'react'
import { Copy, Pencil, Plus, Power, Save, X } from 'lucide-react'
import { api } from '@/lib/api'
import PageHeader from '@/components/PageHeader'
import { useAuthStore } from '@/store/authStore'

/** 客户完整档案 */
type Customer = {
  id: string
  code: string
  name: string
  shortName?: string | null
  fullName?: string | null
  type?: string | null
  intermediary?: string | null
  businessType?: string | null
  salesman?: string | null
  businessUnit?: string | null
  brandName?: string | null
  registeredAt?: string | null
  monthlySettlement?: boolean | null
  paymentDays?: number | null
  creditLimit?: number | string | null
  mainProducts?: string | null
  remark?: string | null
  country?: string | null
  province?: string | null
  city?: string | null
  postalCode?: string | null
  address?: string | null
  shippingAddress?: string | null
  contact?: string | null
  generalManager?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  fax?: string | null
  otherContacts?: string | null
  status: 'ACTIVE' | 'DISABLED'
  createdAt: string
  updatedAt: string
}

/** 客户关联的业务指标（用于颜色标记） */
type CustomerMetrics = {
  everOrdered: boolean
  lastOrderAt: string | null
  outstanding: number
}

/** 表单草稿（所有字段都是字符串以简化受控输入） */
type Draft = Record<string, string>

const blankDraft: Draft = {
  code: '',
  name: '',
  shortName: '',
  fullName: '',
  type: '内销客户',
  intermediary: '',
  businessType: '',
  salesman: '',
  businessUnit: '',
  brandName: '',
  registeredAt: '',
  monthlySettlement: 'false',
  paymentDays: '',
  creditLimit: '',
  mainProducts: '',
  remark: '',
  country: '中国',
  province: '',
  city: '',
  postalCode: '',
  address: '',
  shippingAddress: '',
  contact: '',
  generalManager: '',
  phone: '',
  mobile: '',
  email: '',
  fax: '',
  otherContacts: '',
}

/** 把 Customer 转成表单草稿 */
function toDraft(c: Customer | null): Draft {
  if (!c) return { ...blankDraft }
  return {
    code: c.code ?? '',
    name: c.name ?? '',
    shortName: c.shortName ?? '',
    fullName: c.fullName ?? '',
    type: c.type ?? '内销客户',
    intermediary: c.intermediary ?? '',
    businessType: c.businessType ?? '',
    salesman: c.salesman ?? '',
    businessUnit: c.businessUnit ?? '',
    brandName: c.brandName ?? '',
    registeredAt: c.registeredAt ? c.registeredAt.slice(0, 10) : '',
    monthlySettlement: c.monthlySettlement ? 'true' : 'false',
    paymentDays: c.paymentDays == null ? '' : String(c.paymentDays),
    creditLimit: c.creditLimit == null ? '' : String(c.creditLimit),
    mainProducts: c.mainProducts ?? '',
    remark: c.remark ?? '',
    country: c.country ?? '中国',
    province: c.province ?? '',
    city: c.city ?? '',
    postalCode: c.postalCode ?? '',
    address: c.address ?? '',
    shippingAddress: c.shippingAddress ?? '',
    contact: c.contact ?? '',
    generalManager: c.generalManager ?? '',
    phone: c.phone ?? '',
    mobile: c.mobile ?? '',
    email: c.email ?? '',
    fax: c.fax ?? '',
    otherContacts: c.otherContacts ?? '',
  }
}

/** 把空字符串标准化为 null，便于后端 schema 接收 */
function normalize(draft: Draft): Record<string, unknown> {
  const nullable = (v: string) => (v.trim() ? v.trim() : null)
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const bool = (v: string) => v === 'true'
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    shortName: nullable(draft.shortName),
    fullName: nullable(draft.fullName),
    type: nullable(draft.type),
    intermediary: nullable(draft.intermediary),
    businessType: nullable(draft.businessType),
    salesman: nullable(draft.salesman),
    businessUnit: nullable(draft.businessUnit),
    brandName: nullable(draft.brandName),
    registeredAt: nullable(draft.registeredAt),
    monthlySettlement: bool(draft.monthlySettlement),
    paymentDays: num(draft.paymentDays),
    creditLimit: num(draft.creditLimit),
    mainProducts: nullable(draft.mainProducts),
    remark: nullable(draft.remark),
    country: nullable(draft.country),
    province: nullable(draft.province),
    city: nullable(draft.city),
    postalCode: nullable(draft.postalCode),
    address: nullable(draft.address),
    shippingAddress: nullable(draft.shippingAddress),
    contact: nullable(draft.contact),
    generalManager: nullable(draft.generalManager),
    phone: nullable(draft.phone),
    mobile: nullable(draft.mobile),
    email: nullable(draft.email),
    fax: nullable(draft.fax),
    otherContacts: nullable(draft.otherContacts),
  }
}

const TABS = [
  { key: 'basic', label: '基本资料' },
  { key: 'business', label: '业务信息' },
  { key: 'contact', label: '联系人' },
  { key: 'history', label: '表现记录' },
] as const

type TabKey = (typeof TABS)[number]['key']

/** 客户类型下拉（与老式 ERP 客户资料页一致） */
const CUSTOMER_TYPES = ['内销客户', '外销客户', '内销加工', '外销加工', '中间商', '其他']
/** 商业类型 */
const BUSINESS_TYPES = ['服装厂', '贸易公司', '品牌商', '零售', '加工户', '其他']
/** 国家/省份常见值（示例） */
const COUNTRIES = ['中国', '中国香港', '中国台湾', '韩国', '日本', '美国', '其他']
const PROVINCES = ['上海', '江苏', '浙江', '广东', '北京', '福建', '山东', '河北', '其他']

export default function CustomerInfo() {
  const admin = useAuthStore((state) => state.user?.role === 'admin')
  const [list, setList] = useState<Customer[]>([])
  const [metrics, setMetrics] = useState<Record<string, CustomerMetrics>>({})
  const [query, setQuery] = useState({ keyword: '', status: '' })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /** 当前选中的客户 ID（null 表示新增中） */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** 当前选中的客户（从列表中读取） */
  const selected = useMemo(() => list.find((c) => c.id === selectedId) ?? null, [list, selectedId])
  /** 是否处于编辑/新增模式 */
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view')
  /** 表单草稿 */
  const [draft, setDraft] = useState<Draft>({ ...blankDraft })
  /** 当前 Tab */
  const [activeTab, setActiveTab] = useState<TabKey>('basic')

  const pageSize = 20

  /** 加载客户列表 */
  const load = async (p = page, kw = query.keyword, st = query.status) => {
    if (!admin) return
    setLoading(true)
    setMessage('')
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
      if (kw) params.set('keyword', kw)
      if (st) params.set('status', st)
      const data = await api.get<{ list: Customer[]; total: number }>(`/customers?${params}`)
      setList(data.list)
      setTotal(data.total)
      setPage(p)
      // 异步加载每个客户的业务指标（用于颜色标记）
      void loadMetrics(data.list)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  /** 加载每个客户的业务指标（仅看 SampleChoose 的最近一次） */
  const loadMetrics = async (rows: Customer[]) => {
    const entries = await Promise.all(
      rows.map(async (c) => {
        try {
          const result = await api.get<{ list: { createdAt: string }[] }>(
            `/sample-chooses?customerId=${c.id}&pageSize=1`,
          )
          const first = result.list[0]
          return [c.id, { everOrdered: result.list.length > 0, lastOrderAt: first?.createdAt ?? null, outstanding: 0 }] as const
        } catch {
          return [c.id, { everOrdered: false, lastOrderAt: null, outstanding: 0 }] as const
        }
      }),
    )
    setMetrics(Object.fromEntries(entries))
  }

  useEffect(() => {
    if (admin) void load(1)
  }, [admin])

  /** 选中某一行 */
  const selectRow = (id: string) => {
    setSelectedId(id)
    setMode('view')
    setActiveTab('basic')
  }

  /** 新增 */
  const openCreate = () => {
    setSelectedId(null)
    setDraft({ ...blankDraft })
    setMode('create')
    setActiveTab('basic')
  }

  /** 编辑 */
  const openEdit = () => {
    if (!selected) return
    setDraft(toDraft(selected))
    setMode('edit')
  }

  /** 取消 */
  const cancelEdit = () => {
    if (mode === 'create') {
      setMode('view')
      setDraft({ ...blankDraft })
      setSelectedId(null)
    } else if (mode === 'edit' && selected) {
      setDraft(toDraft(selected))
      setMode('view')
    }
  }

  /** 复制（在编辑之前把当前数据复制进草稿，作为新记录） */
  const copyRow = () => {
    if (!selected) return
    const next = toDraft(selected)
    next.code = `${next.code}-COPY`
    next.name = `${next.name}（副本）`
    setDraft(next)
    setSelectedId(null)
    setMode('create')
    setActiveTab('basic')
  }

  /** 保存 */
  const save = async () => {
    if (!draft.code.trim() || !draft.name.trim()) {
      setMessage('请填写客户代码和客户名称')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const payload = normalize(draft)
      if (mode === 'create') {
        const created = await api.post<Customer>('/customers', payload)
        setMessage('已新增')
        setMode('view')
        setSelectedId(created.id)
        await load(1)
      } else if (mode === 'edit' && selected) {
        await api.patch(`/customers/${selected.id}`, payload)
        setMessage('已保存')
        setMode('view')
        await load(page)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  /** 删除（软删除：仅停用，避免历史选样单失效） */
  const disableRow = async () => {
    if (!selected) return
    if (!window.confirm(`确认停用「${selected.name}」？已停用客户不会出现在选样单中。`)) return
    try {
      await api.post(`/customers/${selected.id}/toggle`, { status: 'DISABLED' })
      setMessage('已停用')
      await load(page)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败')
    }
  }

  /** 重新启用 */
  const enableRow = async () => {
    if (!selected) return
    try {
      await api.post(`/customers/${selected.id}/toggle`, { status: 'ACTIVE' })
      setMessage('已启用')
      await load(page)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败')
    }
  }

  /** 关闭（取消选中） */
  const closeDetail = () => {
    setSelectedId(null)
    setMode('view')
    setDraft({ ...blankDraft })
  }

  /** 颜色标记：用于行内显示 */
  const colorTag = (row: Customer): { color: 'red' | 'blue' | 'magenta' | 'yellow' | null; tip: string } => {
    if (row.status === 'DISABLED') return { color: 'red', tip: '已删除未使用' }
    const m = metrics[row.id]
    if (!m) return { color: null, tip: '' }
    if (!m.everOrdered) return { color: 'blue', tip: '从未下单' }
    if (m.lastOrderAt) {
      const days = (Date.now() - new Date(m.lastOrderAt).getTime()) / 86400000
      if (days > 180) return { color: 'magenta', tip: '近六个月未下单' }
    }
    if (row.creditLimit && Number(row.creditLimit) > 0 && m.outstanding > Number(row.creditLimit)) {
      return { color: 'yellow', tip: '欠款超出额度' }
    }
    return { color: null, tip: '' }
  }

  const colorClass: Record<'red' | 'blue' | 'magenta' | 'yellow', string> = {
    red: 'text-red-600 font-semibold',
    blue: 'text-blue-600 font-semibold',
    magenta: 'text-fuchsia-600 font-semibold',
    yellow: 'text-amber-600 font-semibold',
  }

  if (!admin) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">您没有访问客户资料维护的权限。</div>
  }

  return (
    <div className="space-y-4">
      <PageHeader title="客户资料维护" description="维护客户档案、业务信息、联系人和选样历史。" />

      {/* 顶部工具栏（仿老式 ERP 的「新增/复制/编辑…」按钮排） */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <ToolButton icon={<Plus size={15} />} label="新增" shortcut="A" onClick={openCreate} disabled={mode === 'create'} />
        <ToolButton icon={<Copy size={15} />} label="复制" shortcut="C" onClick={copyRow} disabled={!selected} />
        <ToolButton icon={<Pencil size={15} />} label="编辑" shortcut="E" onClick={openEdit} disabled={!selected || mode !== 'view'} />
        <ToolButton icon={<X size={15} />} label="取消" shortcut="Q" onClick={cancelEdit} disabled={mode === 'view'} />
        <ToolButton
          icon={selected?.status === 'ACTIVE' ? <Power size={15} /> : <Power size={15} />}
          label={selected?.status === 'ACTIVE' ? '停用' : '启用'}
          onClick={selected?.status === 'ACTIVE' ? disableRow : enableRow}
          disabled={!selected}
          tone={selected?.status === 'ACTIVE' ? 'warn' : 'ok'}
        />
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <ToolButton icon={<Save size={15} />} label="保存" shortcut="S" onClick={() => void save()} disabled={mode === 'view'} primary />
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <ToolButton icon={<X size={15} />} label="关闭" onClick={closeDetail} />
        <div className="ml-auto text-xs text-slate-500">
          共 <span className="font-semibold text-slate-800">{total}</span> 个客户
        </div>
      </div>

      {/* 状态条 */}
      {loading && <p className="rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-500">加载中…</p>}
      {message && <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">{message}</p>}

      {/* 表单卡片（tabs + 字段网格） */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50 px-4">
          <div className="flex">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`relative -mb-px border-b-2 px-5 py-3 text-sm font-medium transition ${
                  activeTab === t.key
                    ? 'border-[#123c5a] text-[#123c5a]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* 「是否使用」状态 */}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">是否使用</span>
            <input
              type="checkbox"
              checked={draft.code ? (mode === 'create' ? true : selected?.status === 'ACTIVE') : false}
              disabled={mode === 'view' || mode === 'create'}
              onChange={(e) => {
                if (!selected) return
                if (e.target.checked) void enableRow()
                else void disableRow()
              }}
            />
            <span className={selected?.status === 'DISABLED' ? 'text-red-600' : 'text-emerald-600'}>
              {selected?.status === 'DISABLED' ? '已停用' : '使用中'}
            </span>
          </label>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-3">
          {activeTab === 'basic' && (
            <>
              <Field label="客户代码" required disabled={mode === 'view'}>
                <input className={inputCls} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="客户简称" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.shortName} onChange={(e) => setDraft({ ...draft, shortName: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="客户全称" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="客户类型" disabled={mode === 'view'}>
                <select className={inputCls} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} disabled={mode === 'view'}>
                  <option value="">未设置</option>
                  {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="中间商" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.intermediary} onChange={(e) => setDraft({ ...draft, intermediary: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="商业类型" disabled={mode === 'view'}>
                <select className={inputCls} value={draft.businessType} onChange={(e) => setDraft({ ...draft, businessType: e.target.value })} disabled={mode === 'view'}>
                  <option value="">未设置</option>
                  {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="销售员" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.salesman} onChange={(e) => setDraft({ ...draft, salesman: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="经营单位" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.businessUnit} onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="品牌名称" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.brandName} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="注册时间" disabled={mode === 'view'}>
                <input type="date" className={inputCls} value={draft.registeredAt} onChange={(e) => setDraft({ ...draft, registeredAt: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="国家" disabled={mode === 'view'}>
                <select className={inputCls} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} disabled={mode === 'view'}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="省份" disabled={mode === 'view'}>
                <select className={inputCls} value={draft.province} onChange={(e) => setDraft({ ...draft, province: e.target.value })} disabled={mode === 'view'}>
                  <option value="">未设置</option>
                  {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="城市" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="邮编" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.postalCode} onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="公司地址" full disabled={mode === 'view'}>
                <input className={inputCls} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="发货地址" full disabled={mode === 'view'}>
                <input className={inputCls} value={draft.shippingAddress} onChange={(e) => setDraft({ ...draft, shippingAddress: e.target.value })} disabled={mode === 'view'} />
              </Field>
            </>
          )}

          {activeTab === 'business' && (
            <>
              <Field label="月结客户" disabled={mode === 'view'}>
                <select className={inputCls} value={draft.monthlySettlement} onChange={(e) => setDraft({ ...draft, monthlySettlement: e.target.value })} disabled={mode === 'view'}>
                  <option value="false">否</option>
                  <option value="true">是</option>
                </select>
              </Field>
              <Field label="账期（天）" disabled={mode === 'view'}>
                <input type="number" min="0" className={inputCls} value={draft.paymentDays} onChange={(e) => setDraft({ ...draft, paymentDays: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="授信额度" disabled={mode === 'view'}>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-slate-500">¥</span>
                  <input type="number" min="0" step="0.01" className={inputCls} value={draft.creditLimit} onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value })} disabled={mode === 'view'} />
                </div>
              </Field>
              <Field label="主要产品" full disabled={mode === 'view'}>
                <textarea rows={2} className={inputCls} value={draft.mainProducts} onChange={(e) => setDraft({ ...draft, mainProducts: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="备注" full disabled={mode === 'view'}>
                <textarea rows={3} className={inputCls} value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} disabled={mode === 'view'} />
              </Field>
            </>
          )}

          {activeTab === 'contact' && (
            <>
              <Field label="联系人" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="总经理" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.generalManager} onChange={(e) => setDraft({ ...draft, generalManager: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="公司电话" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="手机" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.mobile} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="Email" disabled={mode === 'view'}>
                <input type="email" className={inputCls} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="公司传真" disabled={mode === 'view'}>
                <input className={inputCls} value={draft.fax} onChange={(e) => setDraft({ ...draft, fax: e.target.value })} disabled={mode === 'view'} />
              </Field>
              <Field label="其他联系人" full disabled={mode === 'view'}>
                <textarea rows={3} className={inputCls} value={draft.otherContacts} onChange={(e) => setDraft({ ...draft, otherContacts: e.target.value })} disabled={mode === 'view'} placeholder="姓名 / 职务 / 电话，逗号或换行分隔" />
              </Field>
            </>
          )}

          {activeTab === 'history' && selected && (
            <div className="md:col-span-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Stat label="客户代码" value={selected.code} />
                <Stat label="客户名称" value={selected.name} />
                <Stat label="首次建档" value={new Date(selected.createdAt).toLocaleString()} />
                <Stat label="最近更新" value={new Date(selected.updatedAt).toLocaleString()} />
                <Stat label="最近下单" value={metrics[selected.id]?.lastOrderAt ? new Date(metrics[selected.id]!.lastOrderAt!).toLocaleDateString() : '尚无下单'} />
                <Stat label="状态" value={selected.status === 'ACTIVE' ? '使用中' : '已停用'} />
              </div>
              <p className="mt-4 text-xs text-slate-500">表现记录由选样单自动汇总，包括下单频次、最近选样、最近试样等。如需查看完整选样明细，请在「客户选样查询」页按客户代码筛选。</p>
            </div>
          )}
          {activeTab === 'history' && !selected && (
            <p className="md:col-span-3 py-8 text-center text-sm text-slate-400">请先在下方列表中选择一位客户，再查看表现记录。</p>
          )}
        </div>
      </div>

      {/* 筛选 + 表格 */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          className="h-10 min-w-60 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]"
          placeholder="搜索客户代码/名称/销售员…"
          value={query.keyword}
          onChange={(e) => setQuery({ ...query, keyword: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && void load(1, query.keyword, query.status)}
        />
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]"
          value={query.status}
          onChange={(e) => { setQuery({ ...query, status: e.target.value }); void load(1, query.keyword, e.target.value) }}
        >
          <option value="">全部状态</option>
          <option value="ACTIVE">使用中</option>
          <option value="DISABLED">已停用</option>
        </select>
        <button className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm font-semibold text-white" onClick={() => void load(1)}>查询</button>
        <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" onClick={() => { setQuery({ keyword: '', status: '' }); void load(1, '', '') }}>重置</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-3">经营单位</th>
                <th className="border-b border-slate-200 px-3 py-3">客户代码</th>
                <th className="border-b border-slate-200 px-3 py-3">客户简称</th>
                <th className="border-b border-slate-200 px-3 py-3">客户全称</th>
                <th className="border-b border-slate-200 px-3 py-3">客户类型</th>
                <th className="border-b border-slate-200 px-3 py-3">销售员</th>
                <th className="border-b border-slate-200 px-3 py-3">总经理</th>
                <th className="border-b border-slate-200 px-3 py-3">联系人</th>
                <th className="border-b border-slate-200 px-3 py-3">公司电话</th>
                <th className="border-b border-slate-200 px-3 py-3">手机</th>
                <th className="border-b border-slate-200 px-3 py-3">Email</th>
                <th className="border-b border-slate-200 px-3 py-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-slate-400">暂无数据</td></tr>
              ) : list.map((row) => {
                const tag = colorTag(row)
                return (
                  <tr
                    key={row.id}
                    onClick={() => selectRow(row.id)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 ${selectedId === row.id ? 'bg-[#f8f4ec]' : 'hover:bg-slate-50'}`}
                  >
                    <td className={`px-3 py-2 ${tag.color ? colorClass[tag.color] : ''}`} title={tag.tip}>{row.businessUnit ?? '-'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.code}</td>
                    <td className="px-3 py-2">{row.shortName ?? row.name}</td>
                    <td className="px-3 py-2">{row.fullName ?? row.name}</td>
                    <td className="px-3 py-2">{row.type ?? '-'}</td>
                    <td className="px-3 py-2">{row.salesman ?? '-'}</td>
                    <td className="px-3 py-2">{row.generalManager ?? '-'}</td>
                    <td className="px-3 py-2">{row.contact ?? '-'}</td>
                    <td className="px-3 py-2">{row.phone ?? '-'}</td>
                    <td className="px-3 py-2">{row.mobile ?? '-'}</td>
                    <td className="px-3 py-2 text-xs">{row.email ?? '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${row.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {row.status === 'ACTIVE' ? '使用中' : '已停用'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">第 {page} 页 / 共 {Math.max(1, Math.ceil(total / pageSize))} 页（{total} 条）</span>
        <div className="flex gap-2">
          <button className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => void load(page - 1)}>上一页</button>
          <button className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40" disabled={page * pageSize >= total} onClick={() => void load(page + 1)}>下一页</button>
        </div>
      </div>

      {/* 颜色图例（与老式 ERP 客户资料页一致） */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm">
        <Legend color="red" label="已删除未使用" />
        <Legend color="blue" label="从未下单" />
        <Legend color="magenta" label="近六个月未下单" />
        <Legend color="yellow" label="欠款超出额度" />
        <span className="ml-auto text-slate-500">颜色按客户最近选样记录自动判定</span>
      </div>
    </div>
  )
}

const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#1e8a7a] disabled:bg-slate-50 disabled:text-slate-500'

function Field({ label, required, full, disabled, children }: { label: string; required?: boolean; full?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${full ? 'md:col-span-3' : ''} ${disabled ? 'opacity-90' : ''}`}>
      <span className="text-slate-600">{label}{required ? <span className="ml-0.5 text-red-500">*</span> : null}</span>
      {children}
    </label>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function ToolButton({ icon, label, shortcut, onClick, disabled, primary, tone }: { icon: React.ReactNode; label: string; shortcut?: string; onClick: () => void; disabled?: boolean; primary?: boolean; tone?: 'ok' | 'warn' }) {
  const base = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40'
  const toneCls = primary
    ? 'border-[#1e8a7a] bg-[#1e8a7a] text-white hover:bg-[#166f63]'
    : tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
      : tone === 'ok'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${toneCls}`}>
      {icon}
      <span>{label}</span>
      {shortcut && <span className="ml-1 rounded bg-white/30 px-1 text-[10px] font-mono">{shortcut}</span>}
    </button>
  )
}

function Legend({ color, label }: { color: 'red' | 'blue' | 'magenta' | 'yellow'; label: string }) {
  const map: Record<string, string> = {
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    magenta: 'bg-fuchsia-500',
    yellow: 'bg-amber-500',
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${map[color]}`} />
      <span className="text-slate-700">{label}</span>
    </span>
  )
}
