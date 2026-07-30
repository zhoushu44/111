import { useEffect, useMemo, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import { api, assetUrl } from '@/lib/api'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { type LabelVariant } from '@/components/LabelPrintMenu'

type Label = { qrValue: string; data: { materialId: string; itemNo: string; name: string; specification?: string | null; composition?: string | null; width?: string | null; weight?: string | null; quantity?: number; remark?: string | null; imageUrl?: string | null } }

export default function LabelPrint() {
  const [params] = useSearchParams()
  const materialIds = useMemo(() => params.get('materialIds')?.split(',').filter(Boolean) ?? [], [params])
  const sampleChooseId = params.get('sampleChooseId')
  const hasParams = materialIds.length > 0 || !!sampleChooseId
  // 标签版式：仅规格(SPEC) / 全(FULL)；是否带公司抬头(header)
  const variant: LabelVariant = (params.get('variant') as LabelVariant | null) ?? 'FULL'
  const header = params.get('header') !== 'false'
  const [labels, setLabels] = useState<Label[]>([])
  const [copies, setCopies] = useState(1)
  const [temporaryRemark, setTemporaryRemark] = useState('')
  const [remarkMode, setRemarkMode] = useState<'REPLACE' | 'APPEND'>('REPLACE')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [scannedIds, setScannedIds] = useState<string[]>([])
  const [materialIndex, setMaterialIndex] = useState<Record<string, string>>({})
  const [scanHint, setScanHint] = useState('')
  // 本地打印代理（software，复刻老系统经 HUANSI 服务直连打印机）
  // 自动识别：本机代理在线则走代理直连打印机，否则退回浏览器打印
  const [agentMode, setAgentMode] = useState<'auto' | 'agent' | 'browser'>('auto')
  const [agentUrl, setAgentUrl] = useState('http://localhost:8790')
  const [agentOnline, setAgentOnline] = useState(false)
  const [agentCheck, setAgentCheck] = useState<'checking' | 'ok' | 'err'>('checking')
  const [agentMsg, setAgentMsg] = useState('')
  const useAgent = agentMode === 'agent' || (agentMode === 'auto' && agentOnline)

  const callLabels = async (mode: 'PREVIEW' | 'PRINT') => {
    if (!hasParams) return
    setLoading(true); setMessage('')
    try {
      const payload = { temporaryRemark: temporaryRemark || null, remarkMode, copies, mode, variant, header }
      const effectiveIds = [...materialIds, ...scannedIds]
      const result = sampleChooseId ? await api.post<{ labels: Label[] }>(`/labels/sample-choose/${sampleChooseId}`, payload) : await api.post<{ labels: Label[] }>('/labels/preview', { materialIds: effectiveIds, ...payload })
      setLabels(result.labels)
      if (mode === 'PRINT') {
        if (useAgent) {
          // 发送到本地打印代理（software），由它真正输出到标签打印机，等价于老系统经 HUANSI 服务打印
          try {
            const resp = await fetch(`${agentUrl.replace(/\/$/, '')}/api/print/label`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ labels: result.labels }),
            })
            const data = await resp.json()
            if (!resp.ok || !data.ok) throw new Error((data.errors && data.errors.join('；')) || '打印代理返回错误')
            setMessage(`已通过本地打印代理发送 ${data.printed ?? result.labels.length} 张到标签打印机。`)
          } catch (error) {
            setMessage('打印代理发送失败：' + (error instanceof Error ? error.message : String(error)) + '（可改回浏览器打印，或检查代理是否启动）')
          }
        } else {
          setMessage('请在系统打印窗口选择 “Argox CP-2140M/3140”，纸张设为 70 × 40 mm、缩放 100%、边距“无”。')
          window.setTimeout(() => window.print(), 80)
        }
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '标签生成失败') } finally { setLoading(false) }
  }

  useEffect(() => { if (hasParams) void callLabels('PREVIEW') }, [sampleChooseId, materialIds.join(',')])

  // 建立 Item No. → 面料ID 索引，供扫码追加标签使用（仅物料标签路线）
  useEffect(() => {
    if (sampleChooseId || !materialIds.length) return
    void api.get<{ list: { id: string; itemNo: string }[] }>('/materials?pageSize=1000&status=ACTIVE')
      .then((res) => {
        const idx: Record<string, string> = {}
        res.list.forEach((m) => { idx[m.itemNo.trim().toLowerCase()] = m.id })
        setMaterialIndex(idx)
      })
      .catch(() => {})
  }, [sampleChooseId, materialIds.length])

  // 本地打印代理在线检测（自动识别）：始终探测，决定是否走代理
  useEffect(() => {
    let alive = true
    const check = () => fetch(`${agentUrl.replace(/\/$/, '')}/api/status`, { headers: { 'Content-Type': 'application/json' } })
      .then((r) => {
        if (!alive) return
        setAgentOnline(r.ok)
        setAgentCheck(r.ok ? 'ok' : 'err')
        setAgentMsg(r.ok ? '本地代理在线' : '未检测到本地代理')
      })
      .catch(() => {
        if (!alive) return
        setAgentOnline(false)
        setAgentCheck('err')
        setAgentMsg('未检测到本地代理（将使用浏览器打印）')
      })
    check()
    const t = window.setInterval(check, 8000)
    return () => { alive = false; window.clearInterval(t) }
  }, [agentUrl])

  // 扫描器输入：复刻老系统"扫面料 → 打标签"流程；扫描 Item No. 追加到打印批次
  const handleScan = (scanned: string) => {
    const itemNo = scanned.trim().toLowerCase()
    const id = materialIndex[itemNo]
    if (!id) { setScanHint(`未找到 Item No.：${scanned.trim()}`); window.setTimeout(() => setScanHint(''), 2600); return }
    setScannedIds((cur) => (cur.includes(id) ? cur : [...cur, id]))
    setScanHint(`已扫码加入：${scanned.trim()}`); window.setTimeout(() => setScanHint(''), 2200)
  }
  const { scanning } = useBarcodeScanner({ enabled: !sampleChooseId && materialIds.length > 0, onScan: handleScan })
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
    <PageHeader title="标签打印" description={`当前版式：标签(${variant === 'SPEC' ? '仅规格' : '全'})${header ? '' : '·无抬头'} ｜ Argox CP-2140M/3140：70 × 40 mm 标签；二维码内容为 Item No.。`} />
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">本页会自动识别本机打印代理（软件）：检测到即用代理直连标签打印机（等价老系统经 HUANSI 服务打印），未检测到则自动退回浏览器打印。也可手动指定打印方式。<br />首次用浏览器打印请先在 Windows 安装 Argox 官方驱动，纸张设为 <b>70 × 40 mm</b>、缩放 <b>100%</b>、边距 <b>无</b>。</div>
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label className="flex items-center gap-2 text-sm text-slate-700">打印方式
        <select value={agentMode} onChange={(e) => setAgentMode(e.target.value as 'auto' | 'agent' | 'browser')} className="rounded-lg border border-slate-200 p-2 text-sm">
          <option value="auto">自动识别</option>
          <option value="agent">本地代理（软件）</option>
          <option value="browser">浏览器打印</option>
        </select>
      </label>
      {agentMode !== 'browser' && <input className="w-56 rounded-lg border border-slate-200 p-2 text-sm" value={agentUrl} onChange={(e) => setAgentUrl(e.target.value)} placeholder="http://localhost:8790" />}
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${agentOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${agentOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />{agentMode === 'auto' ? (agentOnline ? '已自动识别：走本地代理' : '已自动识别：走浏览器打印') : (agentMode === 'agent' ? '已指定本地代理' : '已指定浏览器打印')}</span>
      {agentMsg && <span className="text-xs text-slate-500">{agentMsg}</span>}
    </div>
    <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      {!sampleChooseId && materialIds.length > 0 && (
        <label>扫码追加<input
          className="ml-2 rounded-lg border border-slate-200 p-2 text-sm"
          placeholder="扫面料 Item No. 追加标签"
          onKeyDown={(event) => { if (event.key === 'Enter') { handleScan((event.target as HTMLInputElement).value); (event.target as HTMLInputElement).value = '' } }}
        /><span className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${scanning ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${scanning ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />{scanning ? '扫描中…' : '扫描器就绪'}</span></label>
      )}
      <label>临时备注<input className="ml-2 rounded-lg border border-slate-200 p-2 text-sm" value={temporaryRemark} onChange={(event) => setTemporaryRemark(event.target.value)} /></label><label><input type="radio" checked={remarkMode === 'REPLACE'} onChange={() => setRemarkMode('REPLACE')} /> 覆盖</label><label><input type="radio" checked={remarkMode === 'APPEND'} onChange={() => setRemarkMode('APPEND')} /> 追加</label><label>份数<input className="ml-2 w-16 rounded-lg border border-slate-200 p-2 text-sm" type="number" min="1" max="100" value={copies} onChange={(event) => setCopies(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} /></label><button className="rounded-lg bg-slate-100 px-3 py-1 text-sm" disabled={loading} onClick={() => void callLabels('PREVIEW')}>{loading ? '处理中…' : '更新预览'}</button><button className="rounded-lg bg-[#123c5a] px-3 py-1 text-sm text-white disabled:opacity-50" disabled={loading || !labels.length} onClick={() => void callLabels('PRINT')}><Printer size={16} className="mr-1 inline" />{useAgent ? '打印到标签打印机（代理）' : '打印到 Argox'}</button>
    </div>
    {!sampleChooseId && scannedIds.length > 0 && (
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>已扫码追加 {scannedIds.length} 个：</span>
        {scannedIds.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">…{id.slice(-4)}<button className="text-slate-400 hover:text-red-500" onClick={() => setScannedIds((cur) => cur.filter((x) => x !== id))}><X size={12} /></button></span>)}
        <button className="text-slate-400 underline" onClick={() => setScannedIds([])}>清空</button>
        {scanHint && <span className={scanHint.startsWith('未找到') ? 'text-red-600' : 'text-emerald-600'}>{scanHint}</span>}
      </div>
    )}
    {!sampleChooseId && scannedIds.length === 0 && scanHint && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{scanHint}</p>}
    {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}{message && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}{!loading && !labels.length && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">未获取到可打印标签。</p>}
    <div id="label-print-area">{labels.map((label, index) => <div key={`${label.data.materialId}-${index}`} className="print-label m-3 flex h-[40mm] w-[70mm] gap-[2mm] overflow-hidden rounded border border-slate-200 bg-white p-[2mm] text-[9px] leading-[1.35]"><div className="min-w-0 flex-1">{header && <div className="mb-[1mm] flex items-start justify-between gap-2"><b className="text-[10px]">敏群商贸（上海）有限公司</b>{label.data.imageUrl && <img className="h-8 w-8 object-cover" src={assetUrl(label.data.imageUrl)} alt="面料图片" />}</div>}{variant === 'SPEC' ? (<><p className="truncate"><b>货号:</b> {label.data.itemNo}</p><p className="truncate"><b>规格:</b> {label.data.specification || '-'}</p></>) : (<><p className="truncate"><b>货号:</b> {label.data.itemNo}</p><p className="truncate"><b>名称:</b> {label.data.name}</p><p className="truncate"><b>规格:</b> {label.data.specification || '-'}</p><p className="truncate"><b>成分:</b> {label.data.composition || '-'}</p><p><b>幅宽/克重:</b> {label.data.width || '-'} / {label.data.weight || '-'}</p><p className="line-clamp-2"><b>备注:</b> {label.data.remark || '-'}</p></>)}</div><div className="shrink-0 bg-white pt-[1mm]"><QRCodeSVG value={label.qrValue} size={78} level="M" includeMargin={false} /></div></div>)}</div>
  </div>
}
