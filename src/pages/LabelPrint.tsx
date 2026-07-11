import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import { api, assetUrl } from '@/lib/api'

type Label = { qrValue: string; data: { materialId: string; itemNo: string; name: string; specification?: string | null; composition?: string | null; width?: string | null; weight?: string | null; quantity?: number; remark?: string | null; imageUrl?: string | null } }

export default function LabelPrint() {
  const [params] = useSearchParams()
  const materialIds = useMemo(() => params.get('materialIds')?.split(',').filter(Boolean) ?? [], [params])
  const sampleChooseId = params.get('sampleChooseId')
  const hasParams = materialIds.length > 0 || !!sampleChooseId
  const [labels, setLabels] = useState<Label[]>([])
  const [copies, setCopies] = useState(1)
  const [temporaryRemark, setTemporaryRemark] = useState('')
  const [remarkMode, setRemarkMode] = useState<'REPLACE' | 'APPEND'>('REPLACE')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const callLabels = async (mode: 'PREVIEW' | 'PRINT') => {
    if (!hasParams) return
    setLoading(true); setMessage('')
    try {
      const payload = { temporaryRemark: temporaryRemark || null, remarkMode, copies, mode }
      const result = sampleChooseId
        ? await api.post<{ labels: Label[] }>(`/labels/sample-choose/${sampleChooseId}`, payload)
        : await api.post<{ labels: Label[] }>('/labels/preview', { materialIds, ...payload })
      setLabels(result.labels)
      if (mode === 'PRINT') setTimeout(() => window.print(), 0)
    } catch (error) { setMessage(error instanceof Error ? error.message : '标签生成失败') } finally { setLoading(false) }
  }

  useEffect(() => { if (hasParams) void callLabels('PREVIEW') }, [sampleChooseId, materialIds.join(',')])
  if (!hasParams) return <div><PageHeader title="标签打印" description="从面料、选样单或 URL 参数进入标签打印。" /><div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-16 text-center"><p className="mb-2 text-lg font-medium text-slate-400">暂无可打印标签</p><p className="text-sm text-slate-400">请从面料资料、选样清单或选样记录中点击&quot;标签/预览&quot;进入本页。</p></div></div>

  return <div>
    <style>{'@media print { body * { visibility:hidden } #label-print-area, #label-print-area * { visibility:visible } #label-print-area{position:fixed;left:0;top:0} .print-label{margin:0!important;border:0!important;page-break-after:always} @page{size:70mm 40mm;margin:0} }'}</style>
    <PageHeader title="标签打印" description="二维码载荷为 Item No.；预览和打印均通过正式标签 API。" />
    <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4"><label>临时备注<input className="ml-2 rounded-lg border border-slate-200 p-2 text-sm" value={temporaryRemark} onChange={(event) => setTemporaryRemark(event.target.value)} /></label><label><input type="radio" checked={remarkMode === 'REPLACE'} onChange={() => setRemarkMode('REPLACE')} /> 覆盖</label><label><input type="radio" checked={remarkMode === 'APPEND'} onChange={() => setRemarkMode('APPEND')} /> 追加</label><label>份数<input className="ml-2 w-16 rounded-lg border border-slate-200 p-2 text-sm" type="number" min="1" max="100" value={copies} onChange={(event) => setCopies(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} /></label><button className="rounded-lg bg-slate-100 px-3 py-1 text-sm" disabled={loading} onClick={() => void callLabels('PREVIEW')}>{loading ? '处理中…' : '预览'}</button><button className="rounded-lg bg-slate-100 px-3 py-1 text-sm" disabled={loading || !labels.length} onClick={() => void callLabels('PRINT')}><Printer size={16} className="inline" /> 打印</button></div>
    {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}{message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}{!loading && !labels.length && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">未获取到可打印标签。</p>}
    <div id="label-print-area">{labels.map((label, index) => <div key={`${label.data.materialId}-${index}`} className="print-label m-3 flex h-[40mm] w-[70mm] gap-2 rounded border border-slate-200 p-2 text-[10px] leading-4"><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><b>FABRIC ERP</b>{label.data.imageUrl && <img className="h-9 w-9 object-cover" src={assetUrl(label.data.imageUrl)} alt="面料图片" />}</div><p>Item No.: {label.data.itemNo}</p><p>名称: {label.data.name}</p><p>规格: {label.data.specification || '-'}</p><p>成分: {label.data.composition || '-'}</p><p>幅宽/克重: {label.data.width || '-'} / {label.data.weight || '-'}</p><p>备注: {label.data.remark || '-'}</p></div><div className="shrink-0 bg-white p-[1mm]"><QRCodeSVG value={label.qrValue} size={72} level="M" includeMargin={false} /></div></div>)}</div>
  </div>
}
