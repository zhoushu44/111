import { useEffect, useState } from 'react'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'

type Provider = {
  id: string
  code: string
  name: string
  chineseShortName?: string | null
  shortName?: string | null
  fullName?: string | null
  type?: string | null
  businessType?: string | null
  businessUnit?: string | null
  city?: string | null
  isMonthlySettlement?: boolean | null
  isSilkSupplier?: boolean | null
  merchandiser?: string | null
  paymentDays?: number | null
  invoiceDays?: number | null
  mainProducts?: string | null
  equipmentCapacity?: string | null
  contact?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  address?: string | null
  otherContacts?: string | null
  bankName?: string | null
  bankAccount?: string | null
  invoiceNo?: string | null
  taxId?: string | null
  invoiceRatio?: string | number | null
  invoiceNote?: string | null
  registeredAddress?: string | null
  status: 'ACTIVE' | 'DISABLED'
}

const PROVIDER_TYPES = [
  { value: '供应商', label: '供应商' },
  { value: '加工商', label: '加工商' },
  { value: '供应加工商', label: '供应加工商' },
]

type Draft = Record<string, string>
const emptyDraft: Draft = {
  code: '', name: '', chineseShortName: '', shortName: '', fullName: '', type: '', businessType: '',
  businessUnit: '', city: '',
  isMonthlySettlement: 'false', isSilkSupplier: 'false',
  merchandiser: '', paymentDays: '', invoiceDays: '', mainProducts: '', equipmentCapacity: '',
  contact: '', phone: '', mobile: '', email: '', address: '', otherContacts: '',
  bankName: '', bankAccount: '', invoiceNo: '', taxId: '', invoiceRatio: '', invoiceNote: '', registeredAddress: '',
  status: 'ACTIVE',
}

function toDraft(p: Provider): Draft {
  return {
    code: p.code ?? '',
    name: p.name ?? '',
    chineseShortName: p.chineseShortName ?? '',
    shortName: p.shortName ?? '',
    fullName: p.fullName ?? '',
    type: p.type ?? '',
    businessType: p.businessType ?? '',
    businessUnit: p.businessUnit ?? '',
    city: p.city ?? '',
    isMonthlySettlement: p.isMonthlySettlement ? 'true' : 'false',
    isSilkSupplier: p.isSilkSupplier ? 'true' : 'false',
    merchandiser: p.merchandiser ?? '',
    paymentDays: p.paymentDays == null ? '' : String(p.paymentDays),
    invoiceDays: p.invoiceDays == null ? '' : String(p.invoiceDays),
    mainProducts: p.mainProducts ?? '',
    equipmentCapacity: p.equipmentCapacity ?? '',
    contact: p.contact ?? '',
    phone: p.phone ?? '',
    mobile: p.mobile ?? '',
    email: p.email ?? '',
    address: p.address ?? '',
    otherContacts: p.otherContacts ?? '',
    bankName: p.bankName ?? '',
    bankAccount: p.bankAccount ?? '',
    invoiceNo: p.invoiceNo ?? '',
    taxId: p.taxId ?? '',
    invoiceRatio: p.invoiceRatio == null ? '' : String(p.invoiceRatio),
    invoiceNote: p.invoiceNote ?? '',
    registeredAddress: p.registeredAddress ?? '',
    status: p.status ?? 'ACTIVE',
  }
}

function buildPayload(draft: Draft, editing: Provider | null) {
  const nullable = (v: string) => (v.trim() === '' ? null : v.trim())
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const payload: Record<string, unknown> = {
    code: draft.code.trim(),
    name: draft.name.trim(),
    chineseShortName: nullable(draft.chineseShortName),
    shortName: nullable(draft.shortName),
    fullName: nullable(draft.fullName),
    type: nullable(draft.type),
    businessType: nullable(draft.businessType),
    businessUnit: nullable(draft.businessUnit),
    city: nullable(draft.city),
    isMonthlySettlement: draft.isMonthlySettlement === 'true',
    isSilkSupplier: draft.isSilkSupplier === 'true',
    merchandiser: nullable(draft.merchandiser),
    paymentDays: num(draft.paymentDays),
    invoiceDays: num(draft.invoiceDays),
    mainProducts: nullable(draft.mainProducts),
    equipmentCapacity: nullable(draft.equipmentCapacity),
    contact: nullable(draft.contact),
    phone: nullable(draft.phone),
    mobile: nullable(draft.mobile),
    email: nullable(draft.email),
    address: nullable(draft.address),
    otherContacts: nullable(draft.otherContacts),
    bankName: nullable(draft.bankName),
    bankAccount: nullable(draft.bankAccount),
    invoiceNo: nullable(draft.invoiceNo),
    taxId: nullable(draft.taxId),
    invoiceRatio: num(draft.invoiceRatio),
    invoiceNote: nullable(draft.invoiceNote),
    registeredAddress: nullable(draft.registeredAddress),
  }
  if (!editing) payload.status = draft.status
  return payload
}

type TabKey = 'basic' | 'contact' | 'invoice'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'basic', label: '基本资料' },
  { key: 'contact', label: '联系方式' },
  { key: 'invoice', label: '开票资料' },
]

// 表单字段定义（按标签页分组）
type FieldType = 'text' | 'number' | 'select' | 'checkbox' | 'textarea'
interface FieldDef { key: string; label: string; type?: FieldType; options?: { value: string; label: string }[]; required?: boolean; full?: boolean; placeholder?: string }
const BASIC_FIELDS: FieldDef[] = [
  { key: 'code', label: '供应商编号', required: true },
  { key: 'name', label: '中文名称', required: true },
  { key: 'chineseShortName', label: '中文简称' },
  { key: 'shortName', label: '英文简称' },
  { key: 'fullName', label: '英文全称', full: true },
  { key: 'type', label: '类型', type: 'select', options: [{ value: '', label: '请选择' }, ...PROVIDER_TYPES] },
  { key: 'businessType', label: '商业类型' },
  { key: 'businessUnit', label: '经营单位' },
  { key: 'city', label: '城市' },
  { key: 'isMonthlySettlement', label: '是否月结', type: 'checkbox' },
  { key: 'isSilkSupplier', label: '是否供应链', type: 'checkbox' },
  { key: 'merchandiser', label: '跟单员' },
  { key: 'paymentDays', label: '收款天数', type: 'number', placeholder: '数字' },
  { key: 'invoiceDays', label: '发票天数', type: 'number', placeholder: '数字' },
  { key: 'mainProducts', label: '经营产品', type: 'textarea', full: true },
  { key: 'equipmentCapacity', label: '设备产量', type: 'textarea', full: true },
]
const CONTACT_FIELDS: FieldDef[] = [
  { key: 'contact', label: '联系人' },
  { key: 'phone', label: '公司电话' },
  { key: 'mobile', label: '手机' },
  { key: 'email', label: '邮箱' },
  { key: 'address', label: '地址', full: true },
  { key: 'otherContacts', label: '其他联系人', type: 'textarea', full: true },
]
const INVOICE_FIELDS: FieldDef[] = [
  { key: 'bankName', label: '开户行', full: true },
  { key: 'bankAccount', label: '账号', full: true },
  { key: 'invoiceNo', label: '票号' },
  { key: 'taxId', label: '税务号' },
  { key: 'invoiceRatio', label: '开票比例 (%)', type: 'number', placeholder: '0 - 100' },
  { key: 'registeredAddress', label: '登记地址', full: true },
  { key: 'invoiceNote', label: '开票注意', type: 'textarea', full: true },
]

function FieldInput({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const cls = 'mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm outline-none focus:border-[#1e8a7a]'
  const gridCls = def.full ? 'sm:col-span-2' : ''
  const label = (
    <span className="text-sm font-medium text-slate-700">
      {def.label}{def.required ? <span className="text-red-500"> *</span> : null}
    </span>
  )
  let input
  if (def.type === 'select' && def.options) {
    input = (
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        {def.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  } else if (def.type === 'checkbox') {
    input = (
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : 'false')} className="h-4 w-4 rounded border-slate-300 text-[#1e8a7a] focus:ring-[#1e8a7a]" />
        <span className="text-slate-600">{value === 'true' ? '是' : '否'}</span>
      </label>
    )
  } else if (def.type === 'textarea') {
    input = <textarea className={cls} rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} />
  } else if (def.type === 'number') {
    input = <input type="number" className={cls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} />
  } else {
    input = <input type="text" className={cls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} />
  }
  return (
    <label key={def.key} className={`block ${gridCls}`}>
      {label}
      {input}
    </label>
  )
}

export default function Providers() {
  const [list, setList] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [tab, setTab] = useState<TabKey>('basic')

  // 搜索 / 分页
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  const load = async (p = page) => {
    setLoading(true); setMessage('')
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
      if (keyword) params.set('keyword', keyword)
      if (statusFilter) params.set('status', statusFilter)
      const result = await api.get<{ list: Provider[]; total: number }>(`/providers?${params}`)
      let items = result.list
      if (typeFilter) items = items.filter((i) => i.type === typeFilter)
      setList(items); setTotal(typeFilter ? items.length : result.total); setPage(p)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load(1) }, [])

  const openCreate = () => { setEditing(null); setDraft({ ...emptyDraft }); setTab('basic'); setMessage('') }
  const openEdit = (row: Provider) => { setEditing(row); setDraft(toDraft(row)); setTab('basic'); setMessage('') }
  const close = () => { setDraft(null); setEditing(null) }

  const save = async () => {
    if (!draft) return
    if (!draft.code.trim() || !draft.name.trim()) { setMessage('请填写供应商编号和中文名称'); return }
    setSaving(true)
    try {
      const payload = buildPayload(draft, editing)
      if (editing) await api.patch(`/providers/${editing.id}`, payload)
      else await api.post('/providers', payload)
      close(); await load(editing ? page : 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally { setSaving(false) }
  }

  const toggle = async (row: Provider) => {
    try {
      await api.post(`/providers/${row.id}/toggle`, { status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <PageHeader title="供应商维护" description="维护供应商档案、联系方式与开票资料。" action="新增供应商" onAction={openCreate} />

      {/* 搜索筛选栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input
          className="h-10 min-w-60 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]"
          placeholder="编号 / 中文简称 / 英文简称 / 全称 / 名称 / 联系人 / 跟单员 / 城市 / 经营单位"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void load(1)}
        />
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">全部类型</option>
          {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="ACTIVE">启用</option>
          <option value="DISABLED">停用</option>
        </select>
        <button className="rounded-lg bg-[#123c5a] px-5 text-sm font-semibold text-white" onClick={() => void load(1)}>查询</button>
        <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => void load()}>刷新</button>
      </div>

      {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
      {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}

      <DataTable<Provider> data={list} columns={[
        { title: '编号', render: (r) => r.code },
        { title: '中文简称', render: (r) => r.chineseShortName ?? '-' },
        { title: '英文简称', render: (r) => r.shortName ?? '-' },
        { title: '英文全称', render: (r) => r.fullName ?? '-' },
        { title: '名称', render: (r) => r.name },
        { title: '类型', render: (r) => r.type ?? '-' },
        { title: '跟单员', render: (r) => r.merchandiser ?? '-' },
        { title: '联系人', render: (r) => r.contact ?? '-' },
        { title: '电话', render: (r) => r.phone ?? r.mobile ?? '-' },
        { title: '状态', render: (r) => (
          <span className={r.status === 'ACTIVE' ? 'rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700' : 'rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500'}>
            {r.status === 'ACTIVE' ? '启用' : '停用'}
          </span>
        ) },
        { title: '操作', render: (r) => (
          <div className="flex gap-2">
            <button className="text-sm text-[#1e8a7a] hover:underline" onClick={() => openEdit(r)}>编辑</button>
            <button className="text-sm text-slate-600 hover:underline" onClick={() => void toggle(r)}>{r.status === 'ACTIVE' ? '停用' : '启用'}</button>
          </div>
        ) },
      ]} />

      <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
        <span>共 {total} 条，第 {page} 页 / 共 {totalPages} 页</span>
        <button className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40" disabled={page <= 1 || loading} onClick={() => void load(page - 1)}>上一页</button>
        <button className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)}>下一页</button>
      </div>

      {/* 编辑/新增弹窗：三个标签页 */}
      {draft && (
        <div className="fixed inset-0 z-40 overflow-auto bg-slate-900/40 p-6">
          <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editing ? '编辑供应商' : '新增供应商'}</h2>
              <button className="text-slate-400 hover:text-slate-600" onClick={close}>✕</button>
            </div>

            {/* 标签页 */}
            <div className="mb-4 flex gap-1 border-b border-slate-200">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? 'border-[#1e8a7a] text-[#1e8a7a]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* 字段区 */}
            <div className="grid gap-3 sm:grid-cols-2">
              {(tab === 'basic' ? BASIC_FIELDS : tab === 'contact' ? CONTACT_FIELDS : INVOICE_FIELDS).map((def) => (
                <FieldInput
                  key={def.key}
                  def={def}
                  value={draft[def.key] ?? ''}
                  onChange={(v) => setDraft({ ...draft, [def.key]: v })}
                />
              ))}
            </div>

            {/* 状态选择（仅新增时） */}
            {!editing && (
              <label className="mt-3 block">
                <span className="text-sm font-medium text-slate-700">状态</span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                >
                  <option value="ACTIVE">启用</option>
                  <option value="DISABLED">停用</option>
                </select>
              </label>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={close}>取消</button>
              <button className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} onClick={() => void save()}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
