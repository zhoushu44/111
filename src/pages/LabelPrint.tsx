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
      const result = sampleChooseId ? await api.post<{ labels: Label[] }>(`/labels/sample-choose/${sampleChooseId}`, payload) : await api.post<{ labels: Label[] }>('/labels/preview', { materialIds, ...payload })
      setLabels(result.labels)
      if (mode === 'PRINT') {
        setMessage('请在系统打印窗口选择 “Argox CP-2140M/3140”，纸张设为 70 × 40 mm、缩放 100%、边距“无”。')
        window.setTimeout(() => window.print(), 80)
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '标签生成失败') } finally { setLoading(false) }
  }

  useEffect(() => { if (hasParams) void callLabels('PREVIEW') }, [sampleChooseId, materialIds.join(',')])
  if (!hasParams) return <div><PageHeader title="标签打印" description="从面料、选样单或 URL 参数进入标签打印。" /><div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-16 text-center"><p className="mb-2 text-lg font-medium text-slate-400">暂无可打印标签</p><p className="text-sm text-slate-400">请从面料资料、选样清单或选样记录中点击“标签/预览”进入本页。</p></div></div>

  return <div>
    <style>{`@media print {
      @page { size: 70mm 40mm; margin: 0; }
      html, body { width: 70mm; height: 40mm; margin: 0; padding: 0; }
      body * { visibility: hidden; }
      #label-print-area, #label-print-area * { visibility: visible; }
      #label-print-area { position: fixed; inset: 0; width: 70mm; }
      .print-label { width: 70mm !important; height: 40mm !important; margin: 0 !important; border: 0 !important; box-sizing: border-box; break-after: page; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-label:last-child { break-after: auto; page-break-after: auto; }
    }`}</style>
    <PageHeader title="标签打印" description="Argox CP-2140M/3140：70 × 40 mm 标签；二维码内容为 Item No.。" />
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">首次打印请先在 Windows 中安装 Argox 官方驱动。点击“打印”后，在系统窗口选择 Argox 打印机，纸张设为 <b>70 × 40 mm</b>，缩放 <b>100%</b>，边距选择 <b>无</b>；先使用一张空白标签校正上下、左右偏移。</div>
    <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4"><label>临时备注<input className="ml-2 rounded-lg border border-slate-200 p-2 text-sm" value={temporaryRemark} onChange={(event) => setTemporaryRemark(event.target.value)} /></label><label><input type="radio" checked={remarkMode === 'REPLACE'} onChange={() => setRemarkMode('REPLACE')} /> 覆盖</label><label><input type="radio" checked={remarkMode === 'APPEND'} onChange={() => setRemarkMode('APPEND')} /> 追加</label><label>份数<input className="ml-2 w-16 rounded-lg border border-slate-200 p-2 text-sm" type="number" min="1" max="100" value={copies} onChange={(event) => setCopies(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} /></label><button className="rounded-lg bg-slate-100 px-3 py-1 text-sm" disabled={loading} onClick={() => void callLabels('PREVIEW')}>{loading ? '处理中…' : '更新预览'}</button><button className="rounded-lg bg-[#123c5a] px-3 py-1 text-sm text-white disabled:opacity-50" disabled={loading || !labels.length} onClick={() => void callLabels('PRINT')}><Printer size={16} className="mr-1 inline" />打印到 Argox</button></div>
    {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}{message && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}{!loading && !labels.length && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">未获取到可打印标签。</p>}
    <div id="label-print-area">{labels.map((label, index) => <div key={`${label.data.materialId}-${index}`} className="print-label m-3 flex h-[40mm] w-[70mm] gap-[2mm] overflow-hidden rounded border border-slate-200 bg-white p-[2mm] text-[9px] leading-[1.35]"><div className="min-w-0 flex-1"><div className="mb-[1mm] flex items-start justify-between gap-2"><b className="text-[10px]">敏群商贸（上海）有限公司</b>{label.data.imageUrl && <img className="h-8 w-8 object-cover" src={assetUrl(label.data.imageUrl)} alt="面料图片" />}</div><p className="truncate"><b>Item No.:</b> {label.data.itemNo}</p><p className="truncate"><b>Name:</b> {label.data.name}</p><p className="truncate"><b>Spec:</b> {label.data.specification || '-'}</p><p className="truncate"><b>Composition:</b> {label.data.composition || '-'}</p><p><b>Width / Weight:</b> {label.data.width || '-'} / {label.data.weight || '-'}</p><p className="line-clamp-2"><b>Remark:</b> {label.data.remark || '-'}</p></div><div className="shrink-0 bg-white pt-[1mm]"><QRCodeSVG value={label.qrValue} size={78} level="M" includeMargin={false} /></div></div>)}</div>
  </div>
}
