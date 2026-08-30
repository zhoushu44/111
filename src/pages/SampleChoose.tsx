import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api, assetUrl } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import LabelPrintMenu from '@/components/LabelPrintMenu'

type Material = { id: string; itemNo: string; name: string; specification?: string | null; composition?: string | null; width?: string | null; weight?: string | null; construction?: string | null; color?: string | null; unit?: string | null; factoryNo?: string | null; images: { url: string }[] }
type Customer = { id: string; code: string; name: string }
type Selected = Material & { quantity: number; remark: string }
type Detail = { id: string; documentNo: string; customerId: string; customerName: string; status: 'ACTIVE' | 'VOIDED'; remark?: string | null; contact?: string | null; currency?: string | null; requirement?: string | null; expressNo?: string | null; expressCompany?: string | null; salesperson?: string | null; sampleType?: string | null; unsampledType?: string | null; printedAt?: string | null; createdAt: string; items: { id: string; materialId: string; itemNoSnapshot: string; nameSnapshot: string; specSnapshot?: string | null; unitSnapshot?: string | null; compositionSnapshot?: string | null; widthSnapshot?: string | null; weightSnapshot?: string | null; constructionSnapshot?: string | null; factoryNoSnapshot?: string | null; quantity: number; remark?: string | null }[] }

const emptyExtra = { contact: '', currency: 'CNY', requirement: '', expressNo: '', expressCompany: '', salesperson: '', sampleType: '', unsampledType: '', remark: '' }

export default function SampleChoose() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const admin = useAuthStore((state) => state.user?.role === 'admin')
  const autoAdded = useRef(false)
  const editId = params.get('id')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [customerId, setCustomerId] = useState('')
  const [extra, setExtra] = useState({ ...emptyExtra })
  const [code, setCode] = useState(params.get('item') ?? '')
  const [items, setItems] = useState<Selected[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerKeyword, setPickerKeyword] = useState('')
  const [pickerList, setPickerList] = useState<Material[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [documentNo, setDocumentNo] = useState('')
  const [scanHint, setScanHint] = useState('')

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      api.get<{ list: Customer[] }>('/sample-customers?pageSize=100'),
      api.get<{ list: Material[] }>('/materials?pageSize=100&status=ACTIVE'),
    ]).then(([customerResult, materialResult]) => {
      setCustomers(customerResult.list)
      setMaterials(materialResult.list)
      if (!editId) setCustomerId(customerResult.list[0]?.id ?? '')
    }).catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false))
  }, [])

  // 编辑模式：加载已有选样单
  useEffect(() => {
    if (!editId || !customers.length) return
    void api.get<Detail>(`/sample-chooses/${editId}`).then((detail) => {
      setDocumentNo(detail.documentNo)
      setCustomerId(detail.customerId)
      setExtra({
        contact: detail.contact ?? '', currency: detail.currency ?? 'CNY', requirement: detail.requirement ?? '',
        expressNo: detail.expressNo ?? '', expressCompany: detail.expressCompany ?? '', salesperson: detail.salesperson ?? '',
        sampleType: detail.sampleType ?? '', unsampledType: detail.unsampledType ?? '', remark: detail.remark ?? '',
      })
       setItems(detail.items.map((item) => ({
         id: item.materialId, itemNo: item.itemNoSnapshot, name: item.nameSnapshot, specification: item.specSnapshot,
         composition: item.compositionSnapshot, width: item.widthSnapshot, weight: item.weightSnapshot, construction: item.constructionSnapshot, unit: item.unitSnapshot, factoryNo: item.factoryNoSnapshot,
         images: [], quantity: item.quantity, remark: item.remark ?? '',
       })))
    }).catch((error: Error) => setMessage(error.message))
  }, [editId, customers])

  useEffect(() => {
    const itemNo = params.get('item')
    if (!itemNo || !materials.length || autoAdded.current || editId) return
    autoAdded.current = true
    const material = materials.find((item) => item.itemNo.toLowerCase() === itemNo.trim().toLowerCase())
    if (!material) return setMessage('未找到启用面料')
    setItems([{ ...material, quantity: 1, remark: '' }])
    setCode('')
  }, [materials, params, editId])

  const add = async () => {
    const key = code.trim()
    if (!key) return
    const lower = key.toLowerCase()
    let material = materials.find((item) => item.itemNo.toLowerCase() === lower)
    if (!material) {
      try {
        const res = await api.get<{ list: Material[] }>(`/materials?pageSize=100&status=ACTIVE&keyword=${encodeURIComponent(key)}`)
        material = res.list.find((item) => item.itemNo.toLowerCase() === lower)
      } catch { /* 保留 null，下方统一提示 */ }
    }
    if (!material) return setMessage('未找到启用面料')
    setItems((current) => current.some((item) => item.id === material!.id)
      ? current.map((item) => item.id === material!.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { ...material!, quantity: 1, remark: '' }])
    setCode('')
    setMessage('')
  }

  // 扫描器输入：复刻老系统"扫码 Item No. 写入选样单"行为；编辑模式关闭。
  const handleScan = (scanned: string) => {
    const itemNo = scanned.trim()
    const material = materials.find((item) => item.itemNo.toLowerCase() === itemNo.toLowerCase())
    if (!material) {
      setScanHint(`未找到 Item No.：${itemNo}`)
      window.setTimeout(() => setScanHint(''), 2600)
      return
    }
    setItems((current) => current.some((item) => item.id === material.id)
      ? current.map((item) => item.id === material.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { ...material, quantity: 1, remark: '' }])
    setScanHint(`已扫码加入：${material.itemNo}`)
    window.setTimeout(() => setScanHint(''), 2200)
  }
  const { scanning } = useBarcodeScanner({ enabled: !editId, onScan: handleScan })

  // 多选面料弹窗：按关键字向服务端检索，避免受本地 100 条缓存限制而“查不到”
  useEffect(() => {
    if (!pickerOpen) return
    const timer = window.setTimeout(() => {
      setPickerLoading(true)
      const keyword = pickerKeyword.trim()
      api.get<{ list: Material[] }>(`/materials?pageSize=100&status=ACTIVE${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}`)
        .then((res) => setPickerList(res.list))
        .catch((error: Error) => setMessage(error.message))
        .finally(() => setPickerLoading(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [pickerOpen, pickerKeyword])

  const addPicked = () => {
    const selected = pickerList.filter((material) => pickedIds.includes(material.id))
    if (!selected.length) return setMessage('请至少选择一条面料')
    setItems((current) => {
      const existing = new Map(current.map((item) => [item.id, item]))
      selected.forEach((material) => { const item = existing.get(material.id); existing.set(material.id, item ? { ...item, quantity: item.quantity + 1 } : { ...material, quantity: 1, remark: '' }) })
      return [...existing.values()]
    })
    setPickedIds([]); setPickerKeyword(''); setPickerOpen(false); setMessage('')
  }

  const save = async () => {
    if (!customerId) return setMessage('当前没有可选客户，请先维护并启用客户资料')
    if (!items.length) return setMessage('选样清单为空，请先添加面料')
    setSaving(true)
    setMessage(editId ? '正在保存修改…' : '正在保存选样单…')
    const payload = {
      customerId,
      contact: extra.contact || null, currency: extra.currency || null, requirement: extra.requirement || null,
      expressNo: extra.expressNo || null, expressCompany: extra.expressCompany || null, salesperson: extra.salesperson || null,
      sampleType: extra.sampleType || null, unsampledType: extra.unsampledType || null, remark: extra.remark || null,
      items: items.map((item) => ({ materialId: item.id, quantity: item.quantity, remark: item.remark || null })),
    }
    try {
      if (editId) {
        await api.put<{ documentNo: string }>(`/sample-chooses/${editId}`, payload)
        navigate(`/samples/choose-records?documentNo=${encodeURIComponent(documentNo)}`)
      } else {
        const result = await api.post<{ documentNo: string }>('/sample-chooses', payload)
        navigate(`/samples/choose-records?documentNo=${encodeURIComponent(result.documentNo)}`)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const print = async () => {
    if (!editId) return
    setPrinting(true)
    try {
      await api.post(`/sample-chooses/${editId}/print`)
      setMessage('已记录打印时间')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '打印失败')
    } finally {
      setPrinting(false)
    }
  }

  const fieldCls = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#123c5a]/30'
  const labelCls = 'block text-xs text-slate-500 mb-1'
  return <div>
    <PageHeader title={editId ? `编辑选样单 ${documentNo}` : '客户选样管理'} description={editId ? '修改选样单表头信息与面料明细' : '选择客户，通过手输或扫码添加启用面料。'} />
    {/* 表头表单 */}
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className={labelCls}>客户 *</label>
          <select className={`${fieldCls} w-full`} value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!customers.length || (!!editId && !admin)}>
            {customers.length ? customers.map((item) => <option value={item.id} key={item.id}>{item.code} - {item.name}</option>) : <option>暂无启用客户</option>}
          </select>
        </div>
        <div>
          <label className={labelCls}>联系人</label>
          <input className={`${fieldCls} w-full`} value={extra.contact} onChange={(e) => setExtra({ ...extra, contact: e.target.value })} placeholder="客户联系人" />
        </div>
        <div>
          <label className={labelCls}>币种</label>
          <input className={`${fieldCls} w-full`} value={extra.currency} onChange={(e) => setExtra({ ...extra, currency: e.target.value })} placeholder="CNY / USD / EUR" />
        </div>
        <div>
          <label className={labelCls}>销售员</label>
          <input className={`${fieldCls} w-full`} value={extra.salesperson} onChange={(e) => setExtra({ ...extra, salesperson: e.target.value })} placeholder="销售员姓名" />
        </div>
        <div>
          <label className={labelCls}>选样类型</label>
          <input className={`${fieldCls} w-full`} value={extra.sampleType} onChange={(e) => setExtra({ ...extra, sampleType: e.target.value })} placeholder="如：新样 / 翻单" />
        </div>
         <div>
          <label className={labelCls}>来样类型</label>
          <input className={`${fieldCls} w-full`} value={extra.unsampledType} onChange={(e) => setExtra({ ...extra, unsampledType: e.target.value })} placeholder="来样分类" />
        </div>
        <div>
          <label className={labelCls}>快递单号</label>
          <input className={`${fieldCls} w-full`} value={extra.expressNo} onChange={(e) => setExtra({ ...extra, expressNo: e.target.value })} placeholder="快递单号" />
        </div>
        <div>
          <label className={labelCls}>快递公司</label>
          <input className={`${fieldCls} w-full`} value={extra.expressCompany} onChange={(e) => setExtra({ ...extra, expressCompany: e.target.value })} placeholder="如：顺丰 / DHL / FedEx" />
        </div>
        <div>
          <label className={labelCls}>要求</label>
          <input className={`${fieldCls} w-full`} value={extra.requirement} onChange={(e) => setExtra({ ...extra, requirement: e.target.value })} placeholder="客户要求" />
        </div>
      </div>
      <div className="mt-3">
        <label className={labelCls}>备注</label>
        <input className={`${fieldCls} w-full`} value={extra.remark} onChange={(e) => setExtra({ ...extra, remark: e.target.value })} placeholder="选样单备注" />
      </div>
    </div>
    {/* 扫码录入 + 操作 */}
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label>Item No.
        <input className="ml-2 border border-slate-300 rounded-lg px-3 py-2 text-sm" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="扫码/输入 Item No." disabled={!!editId} />
      </label>
      {!editId && (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${scanning ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          <span className={`h-2 w-2 rounded-full ${scanning ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />
          {scanning ? '扫描中…' : '扫描器就绪'}
        </span>
      )}
      {scanHint && <span className={`text-xs ${scanHint.startsWith('未找到') ? 'text-red-600' : 'text-emerald-600'}`}>{scanHint}</span>}
      <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" onClick={() => void add()}>添加面料</button>
      <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" onClick={() => setPickerOpen(true)}>查询多选面料</button>
      <LabelPrintMenu materialIds={items.map((item) => item.id)} disabled={!items.length} label="预览/标签" />
      {editId && <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" disabled={printing || !items.length} onClick={() => void print()}>{printing ? '记录中…' : '记录打印'}</button>}
      <button className="bg-[#123c5a] px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : (editId ? '保存修改' : '保存选样')}</button>
      <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50" onClick={() => navigate('/samples/choose-records')}>返回</button>
    </div>
    {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}
    {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
    {!customers.length && <p className="mb-3 rounded bg-amber-50 p-3 text-amber-800">暂无可选客户，请先在客户资料维护中创建并启用客户。</p>}
    {!items.length && <p className="mb-3 rounded bg-slate-50 p-3 text-slate-500">选样清单为空，输入 Item No. 后点击"添加面料"。</p>}
    <DataTable data={items} columns={[
      { title: '图片', render: (row) => row.images[0] ? <img className="h-12 w-12 object-cover" src={assetUrl(row.images[0].url)} alt="面料" /> : '-' },
      { title: 'Item No.', render: (row) => row.itemNo },
      { title: '面料名称', render: (row) => row.name },
      { title: '工厂编号', render: (row) => row.factoryNo || '-' },
      { title: '颜色', render: (row) => row.color || '-' },
      { title: '数量', render: (row) => <input type="number" min="1" value={row.quantity} onChange={(event) => setItems((current) => current.map((item) => item.id === row.id ? { ...item, quantity: Math.max(1, Number(event.target.value) || 1) } : item))} /> },
      { title: '单位', render: (row) => row.unit || '-' },
      { title: '成分', render: (row) => row.composition || '-' },
      { title: '规格', render: (row) => row.specification || '-' },
      { title: '幅宽', render: (row) => row.width || '-' },
      { title: '克重', render: (row) => row.weight || '-' },
      { title: '备注', render: (row) => <input value={row.remark} onChange={(event) => setItems((current) => current.map((item) => item.id === row.id ? { ...item, remark: event.target.value } : item))} /> },
      { title: '操作', render: (row) => <button className="text-red-600 hover:underline" onClick={() => setItems((current) => current.filter((item) => item.id !== row.id))}>删除</button> },
    ]} />
    {pickerOpen && <div className="fixed inset-0 z-40 overflow-auto bg-slate-900/40 p-6"><div className="mx-auto max-w-3xl rounded-2xl bg-white p-6"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">选择面料</h2><button onClick={() => setPickerOpen(false)}>关闭</button></div><input className="mb-4 w-full rounded-lg border border-slate-200 p-2" autoFocus placeholder="按 Item No.、名称或规格查询" value={pickerKeyword} onChange={(event) => setPickerKeyword(event.target.value)} /> <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">{pickerLoading ? <p className="p-4 text-sm text-slate-500">加载中…</p> : !pickerList.length ? <p className="p-4 text-sm text-slate-500">无匹配面料</p> : pickerList.map((material) => <label key={material.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 p-3"><input type="checkbox" checked={pickedIds.includes(material.id)} onChange={(event) => setPickedIds((current) => event.target.checked ? [...current, material.id] : current.filter((id) => id !== material.id))} /><span className="font-medium">{material.itemNo}</span><span>{material.name}</span><span className="text-slate-500">{material.specification || '/'}</span></label>)}</div><div className="mt-5 flex justify-end gap-3"><button className="rounded-lg border border-slate-200 px-4 py-2" onClick={() => setPickerOpen(false)}>取消</button><button className="rounded-lg bg-[#123c5a] px-4 py-2 text-white" onClick={addPicked}>加入选样清单</button></div></div></div>}
    {admin && <p className="mt-3 text-xs text-slate-500">选样导出时可选择包含规格、成本和图片。</p>}
  </div>
}
