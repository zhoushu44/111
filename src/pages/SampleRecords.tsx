import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api, assetUrl, downloadBlob } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import LabelPrintMenu from '@/components/LabelPrintMenu'

type RecordItem = { id: string; documentNo: string; customerName: string; status: 'ACTIVE' | 'VOIDED'; createdAt: string; createdBy?: { displayName: string; username: string } | null; _count: { items: number } }
type Detail = RecordItem & { customer: { name: string; code: string; fullName?: string | null }; createdBy: { displayName: string; username: string }; remark?: string | null; contact?: string | null; salesperson?: string | null; expressNo?: string | null; expressCompany?: string | null; sampleType?: string | null; unsampledType?: string | null; currency?: string | null; requirement?: string | null; printedAt?: string | null; items: { id: string; itemNoSnapshot: string; nameSnapshot: string; specSnapshot?: string | null; unitSnapshot?: string | null; compositionSnapshot?: string | null; widthSnapshot?: string | null; weightSnapshot?: string | null; factoryNoSnapshot?: string | null; quantity: number; remark?: string | null; material: { unit: string; color?: string | null; images: { url: string }[] } }[] }
type Query = { documentNo: string; customer: string; itemNo: string; createdById: string; status: string; dateFrom: string; dateTo: string }
type Operator = { id: string; displayName: string; username: string }

export default function SampleRecords() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const admin = useAuthStore((state) => state.user?.role === 'admin')
  const [query, setQuery] = useState<Query>({ documentNo: params.get('documentNo') ?? '', customer: '', itemNo: '', createdById: '', status: '', dateFrom: '', dateTo: '' })
  const [operators, setOperators] = useState<Operator[]>([])
  const [list, setList] = useState<RecordItem[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [exporting, setExporting] = useState<RecordItem | null>(null)
  const [exportOptions, setExportOptions] = useState({ includeSpec: true, includeImage: false, includeCost: false })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const search = new URLSearchParams({ pageSize: '100' })
      Object.entries(query).forEach(([key, value]) => { if (value) search.set(key, value) })
      const result = await api.get<{ list: RecordItem[] }>('/sample-chooses?' + search)
      setList(result.list)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void Promise.all([load(), api.get<Operator[]>('/sample-chooses/operators').then(setOperators).catch((error: Error) => setMessage(error.message))]) }, [])

  const viewDetail = async (id: string) => {
    try { setDetail(await api.get<Detail>(`/sample-chooses/${id}`)) } catch (error) { setMessage(error instanceof Error ? error.message : '详情加载失败') }
  }
  const toggle = async (row: RecordItem) => {
    const action = row.status === 'ACTIVE' ? '作废' : '恢复'
    if (!window.confirm(`确认${action}选样单 ${row.documentNo} 吗？`)) return
    try { await api.post(`/sample-chooses/${row.id}/${row.status === 'ACTIVE' ? 'void' : 'restore'}`); await load() } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败') }
  }
  const exportExcel = async () => {
    if (!exporting) return
    try {
      const blob = await api.download(`/exports/sample-chooses/${exporting.id}`, { method: 'POST', body: JSON.stringify(exportOptions) })
      downloadBlob(blob, `${exporting.documentNo}.xlsx`)
      setExporting(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败') }
  }
  const reset = () => {
    const empty = { documentNo: '', customer: '', itemNo: '', createdById: '', status: '', dateFrom: '', dateTo: '' }
    setQuery(empty)
    // 重置后立即重新加载
    setTimeout(() => {
      void api.get<{ list: RecordItem[] }>('/sample-chooses?pageSize=100').then((result) => setList(result.list)).catch((error: Error) => setMessage(error.message))
    }, 0)
  }

  return (
    <div>
      <PageHeader title="客户选样查询" description="按单号、客户、Item No. 和状态查询真实选样单。" />
      <div className="mb-4 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input placeholder="单号" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.documentNo} onChange={(event) => setQuery({ ...query, documentNo: event.target.value })} />
        <input placeholder="客户名/代码" title="支持客户代码或客户名查询" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.customer} onChange={(event) => setQuery({ ...query, customer: event.target.value })} />
        <input placeholder="Item No." className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.itemNo} onChange={(event) => setQuery({ ...query, itemNo: event.target.value })} />
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.createdById} onChange={(event) => setQuery({ ...query, createdById: event.target.value })}><option value="">全部操作人</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.displayName || operator.username}（{operator.username}）</option>)}</select>
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value })}>
          <option value="">全部状态</option>
          <option value="ACTIVE">有效</option>
          <option value="VOIDED">已作废</option>
        </select>
        <input type="date" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.dateFrom} onChange={(event) => setQuery({ ...query, dateFrom: event.target.value })} title="起始日期" />
        <input type="date" className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.dateTo} onChange={(event) => setQuery({ ...query, dateTo: event.target.value })} title="结束日期" />
        <button className="rounded-lg bg-[#123c5a] px-5 text-sm font-semibold text-white" onClick={() => void load()}>查询</button>
        <button className="rounded-lg border border-slate-200 px-5 text-sm font-semibold text-slate-600" onClick={reset}>重置</button>
      </div>

      {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
      {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}

      {!loading && list.length === 0 && (
        <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">暂无选样记录，请调整筛选条件后查询。</p>
      )}

      <DataTable data={list} columns={[
        { title: '单号', render: (row) => row.documentNo },
        { title: '客户', render: (row) => row.customerName },
        { title: '操作人', render: (row) => row.createdBy ? (row.createdBy.displayName || row.createdBy.username) : '-' },
        { title: '日期', render: (row) => new Date(row.createdAt).toLocaleString() },
        { title: '款数', render: (row) => row._count.items },
        { title: '状态', render: (row) => row.status === 'ACTIVE' ? '有效' : '已作废' },
        { title: '操作', render: (row) => (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void viewDetail(row.id)}>详情</button>
            <button disabled={row.status !== 'ACTIVE'} onClick={() => navigate(`/samples/choose?id=${row.id}`)}>编辑</button>
            <LabelPrintMenu sampleChooseId={row.id} disabled={row.status !== 'ACTIVE'} />
            <button disabled={row.status !== 'ACTIVE'} onClick={() => navigate(`/print/sample-choose/${row.id}`)} className="inline-flex items-center gap-1"><Printer size={12} />打印</button>
            <button disabled={row.status !== 'ACTIVE'} onClick={() => setExporting(row)}>导出</button>
            {admin && <button onClick={() => void toggle(row)}>{row.status === 'ACTIVE' ? '作废' : '恢复'}</button>}
          </div>
        ) },
      ]} />

      {/* 详情弹窗 */}
      {detail && (
        <div className="fixed inset-0 z-40 overflow-auto bg-slate-900/40 p-6">
          <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6">
            <div className="mb-4 flex justify-between">
              <h2 className="text-lg font-bold">选样单详情：{detail.documentNo}</h2>
              <button onClick={() => setDetail(null)}>关闭</button>
            </div>
            {/* 表头字段全量展示（对齐老系统选样单基础页），空值显示 - 不再整行隐藏 */}
            <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-3">
              <div><span className="text-slate-500">选样日期：</span>{new Date(detail.createdAt).toLocaleDateString()}</div>
              <div><span className="text-slate-500">客户代码：</span>{detail.customer.code || '-'}</div>
              <div><span className="text-slate-500">客户：</span>{detail.customer.name}{detail.customer.fullName ? `（${detail.customer.fullName}）` : ''}</div>
              <div><span className="text-slate-500">制单人：</span>{detail.createdBy.displayName || detail.createdBy.username}</div>
              <div><span className="text-slate-500">状态：</span>{detail.status === 'ACTIVE' ? '有效' : '已作废'}</div>
              <div><span className="text-slate-500">打印时间：</span>{detail.printedAt ? new Date(detail.printedAt).toLocaleString() : '-'}</div>
              <div><span className="text-slate-500">联系人：</span>{detail.contact || '-'}</div>
              <div><span className="text-slate-500">币种：</span>{detail.currency || '-'}</div>
              <div><span className="text-slate-500">销售员：</span>{detail.salesperson || '-'}</div>
              <div><span className="text-slate-500">选样类型：</span>{detail.sampleType || '-'}</div>
              <div><span className="text-slate-500">来样类型：</span>{detail.unsampledType || '-'}</div>
              <div><span className="text-slate-500">快递：</span>{[detail.expressCompany, detail.expressNo].filter(Boolean).join(' ') || '-'}</div>
              <div className="col-span-2 md:col-span-3"><span className="text-slate-500">要求：</span>{detail.requirement || '-'}</div>
              <div className="col-span-2 md:col-span-3"><span className="text-slate-500">备注：</span>{detail.remark || '-'}</div>
            </div>
            {/* 明细列顺序对齐老系统选样单（客户已确认）：图片置首，其余按原字段顺序 产品编码/产品名称/工厂编号/颜色/数量/单位/成份/产品规格/幅宽/克重 */}
            <DataTable data={detail.items} columns={[
              { title: '图片', render: (item) => item.material.images[0]?.url ? <img className="h-12 w-12 object-cover" src={assetUrl(item.material.images[0].url)} alt="面料" /> : '-' },
              { title: 'Item No.', render: (item) => item.itemNoSnapshot },
              { title: '名称', render: (item) => item.nameSnapshot },
              { title: '工厂编号', render: (item) => item.factoryNoSnapshot || '-' },
              { title: '颜色', render: (item) => item.material.color || '-' },
              { title: '数量', render: (item) => item.quantity },
              { title: '单位', render: (item) => item.unitSnapshot || item.material.unit },
              { title: '成分', render: (item) => item.compositionSnapshot || '-' },
              { title: '规格', render: (item) => item.specSnapshot || '-' },
              { title: '幅宽', render: (item) => item.widthSnapshot || '-' },
              { title: '克重', render: (item) => item.weightSnapshot || '-' },
              { title: '备注', render: (item) => item.remark || '-' },
            ]} />
          </div>
        </div>
      )}

      {/* 导出弹窗 */}
      {exporting && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 p-6">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-lg font-bold">导出 {exporting.documentNo}</h2>
            <div className="mb-4 space-y-2 text-sm"><label className="block"><input type="checkbox" checked={exportOptions.includeSpec} onChange={(event) => setExportOptions({ ...exportOptions, includeSpec: event.target.checked })} /> 包含规格</label><label className="block"><input type="checkbox" checked={exportOptions.includeImage} onChange={(event) => setExportOptions({ ...exportOptions, includeImage: event.target.checked })} /> 包含图片</label>{admin && <label className="block"><input type="checkbox" checked={exportOptions.includeCost} onChange={(event) => setExportOptions({ ...exportOptions, includeCost: event.target.checked })} /> 包含成本</label>}</div>
            <div className="flex gap-3">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={() => setExporting(null)}>取消</button>
              <button className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm text-white" onClick={() => void exportExcel()}>下载 Excel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
