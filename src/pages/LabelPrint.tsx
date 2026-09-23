import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { type LabelVariant } from '@/components/LabelPrintMenu'

type Label = { qrValue: string; variant?: LabelVariant; header?: boolean; copies?: number; data: { materialId: string; itemNo: string; name: string; specification?: string | null; composition?: string | null; construction?: string | null; width?: string | null; weight?: string | null; quantity?: number; remark?: string | null; imageUrl?: string | null } }

// 标签 Remark 过滤价格类内容（USD/CNY 等报价不上标签），与本地代理 ZPL 渲染规则一致
function displayRemark(remark: string | null | undefined) {
  if (!remark) return '-'
  const s = String(remark).replace(/(?:USD|US\$|CNY|RMB|JPY|EUR|GBP|TWD|HKD|NT\$|\$|￥|¥)\s*\d[\d.,]*/gi, ' ').replace(/[#＃]\s*\d[\d.,]*/g, ' ').replace(/[\s；;、,，-]{2,}/g, '；').replace(/^[；;、,，-\s]+|[；;、,，-\s]+$/g, '').trim()
  return s || '-'
}

/* ===== 标签版式：与 print-agent/lib/zpl.js 完全一致（单位定义、缩字号档位、行高、版心边距）。
   两边必须同步修改，否则浏览器预览与标签机实机输出会不一致。 ===== */
const LABEL_DPI = 203
const PAD_MM = 2
const GAP_MM = 1
/** 缩字号档位：从原字号逐档缩小，取第一个能整体放下的 */
const SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6]
// 备注专属档位：备注过长时优先只缩备注字号，其他行保持不变
const REMARK_SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5]
/** 各元素基准字号/行高（dots @203dpi，随档位等比缩放） */
const BASE = { rowFont: 20, rowLine: 22, itemFont: 24, itemLine: 30, headerFont: 30, headerLine: 36 }
const MIN_UNITS_PER_LINE = 6
const MM_PER_DOT = 25.4 / LABEL_DPI

const dots = (mm: number) => Math.round((mm * LABEL_DPI) / 25.4)
const dotToMm = (d: number) => d * MM_PER_DOT

/** 全角字符（中文、全角标点等）占 2 个字宽单位，其余占 1 个 */
function charUnits(code: number) {
  return (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd) ? 2 : 1
}

function textUnits(str: string) {
  let total = 0
  for (const ch of String(str)) total += charUnits(ch.codePointAt(0) as number)
  return total
}

/** 按字宽单位折行，只返回内容本身（不含字段名前缀） */
function wrapUnits(value: string | null | undefined, cap: number) {
  const text = String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/\n/g, ' ').trim() || '-'
  const out: string[] = []
  let cur = ''
  let used = 0
  for (const ch of text) {
    const u = charUnits(ch.codePointAt(0) as number)
    if (used + u > cap && cur) { out.push(cur); cur = ''; used = 0 }
    cur += ch
    used += u
  }
  out.push(cur)
  return out
}

type LaidRow = { k: string; indent: number; fontScale: number; lines: string[] }
type LabelLayout = {
  pad: number; gap: number; qrSize: number; textW: number; contentH: number
  rowFont: number; rowLine: number; itemFont: number; itemLine: number
  headerFont: number; headerLine: number; headerLines: number; headerText: string[]
  withHeader: boolean; header: string; itemNo: string; rows: LaidRow[]
}

/** 折行 + 自动缩字号，返回各元素最终字号（dots）与逐行文本 */
function layoutLabel(label: Label, variantOf: LabelVariant, headerOf: boolean, companyName: string): LabelLayout {
  const W = dots(70)
  const H = dots(40)
  const pad = dots(PAD_MM)
  const gap = dots(GAP_MM)
  // 二维码固定右下角，文本列宽度需让出二维码及其间距，避免文字压到码上
  const qrSize = Math.min(Math.round(H * 0.58), Math.round(W * 0.28))
  const textW = Math.max(40, W - pad * 2 - gap - qrSize)
  const contentH = H - pad * 2
  const d = label.data
  const withHeader = headerOf
  const header = companyName || 'Mint Chance Textile Co.,Ltd'
  const itemNo = String(d.itemNo == null || d.itemNo === '' ? '-' : d.itemNo)
  const rows = variantOf === 'SPEC'
    ? [{ k: 'Specification', v: d.specification }]
    : [
      { k: 'Composition', v: d.composition },
      { k: 'Construction', v: d.construction },
      { k: 'Width', v: d.width },
      { k: 'Weight', v: d.weight },
      { k: 'Remark', v: displayRemark(d.remark) },
    ]

  let last: LabelLayout | null = null
  for (const scale of SCALES) {
    const rowFont = Math.max(8, Math.round(BASE.rowFont * scale))
    const rowLine = Math.round(BASE.rowLine * scale)
    const itemFont = Math.round(BASE.itemFont * scale)
    const itemLine = Math.round(BASE.itemLine * scale)
    const headerFont = Math.round(BASE.headerFont * scale)
    const headerLine = Math.round(BASE.headerLine * scale)

    // 备注（最后一个字段）过长时优先只缩备注字号，其他行保持当前档位不变
    const remarkIdx = rows.length - 1
    const remarkRow = rows[remarkIdx]
    const subRows = rows.slice(0, -1)

    for (const rs of REMARK_SCALES) {
      const rRowFont = Math.max(6, Math.round(rowFont * rs))
      const rRowLine = Math.max(8, Math.round(rowLine * rs))
      const cap = Math.max(MIN_UNITS_PER_LINE, Math.floor((textW * 2) / rRowFont))
      // 每行都要容纳悬挂缩进（首行「字段名: 」、续行等宽空白），故内容上限先减去缩进占宽
      const laid: LaidRow[] = subRows.map((row) => {
        const indent = textUnits(row.k) + 2
        return { k: row.k, indent, fontScale: 1, lines: wrapUnits(row.v, Math.max(MIN_UNITS_PER_LINE, cap - indent)) }
      })
      const remarkIndent = textUnits(remarkRow.k) + 2
      laid.push({ k: remarkRow.k, indent: remarkIndent, fontScale: rs, lines: wrapUnits(remarkRow.v, Math.max(MIN_UNITS_PER_LINE, cap - remarkIndent)) })

      const headerCap = Math.max(MIN_UNITS_PER_LINE, Math.floor((W * 2) / headerFont))
      // 标题真正按宽度拆行（与 exe 渲染、ZPL ^FB 行为一致），最多 2 行
      const headerWrapped = withHeader ? wrapUnits(header, headerCap) : []
      const headerText = headerWrapped.length > 2 ? [headerWrapped[0], headerWrapped[1] + '…'] : headerWrapped
      const headerLines = withHeader ? Math.max(1, headerText.length) : 0
      const height = headerLines * headerLine + itemLine + laid.reduce((sum, row) => {
        const line = row.fontScale === 1 ? rowLine : rRowLine
        return sum + row.lines.length * line
      }, 0)
      last = { pad, gap, qrSize, textW, contentH, rowFont, rowLine, itemFont, itemLine, headerFont, headerLine, headerLines, headerText, header, withHeader, itemNo, rows: laid }
      if (height <= contentH) return last
    }
  }

  // 兜底：最小字号仍放不下，按版面容量截取并在末行加 …（正常长度不会走到这里）
  const base = last as LabelLayout
  const budget = Math.max(1, Math.floor((base.contentH - base.headerLines * base.headerLine - base.itemLine) / base.rowLine))
  const kept: LaidRow[] = []
  let left = budget
  for (const row of base.rows) {
    if (left <= 0) break
    const take = Math.min(left, row.lines.length)
    const lines = row.lines.slice(0, take)
    if (take < row.lines.length) lines[take - 1] = lines[take - 1].slice(0, -1) + '…'
    kept.push({ k: row.k, indent: row.indent, lines })
    left -= take
  }
  base.rows = kept
  return base
}

export default function LabelPrint() {
  const [params] = useSearchParams()
  const materialIds = useMemo(() => params.get('materialIds')?.split(',').filter(Boolean) ?? [], [params])
  const sampleChooseId = params.get('sampleChooseId')
  const hasParams = materialIds.length > 0 || !!sampleChooseId
  // 标签版式：仅规格(SPEC) / 全(FULL)；是否带公司抬头(header)
  const variant: LabelVariant = (params.get('variant') as LabelVariant | null) ?? 'FULL'
  const header = params.get('header') !== 'false'
  const [labels, setLabels] = useState<Label[]>([])
  const [companyName, setCompanyName] = useState('Mint Chance Textile Co.,Ltd')
  const [copies, setCopies] = useState(1)
  const [temporaryRemark, setTemporaryRemark] = useState('')
  const [remarkMode, setRemarkMode] = useState<'REPLACE' | 'APPEND'>('REPLACE')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [scannedIds, setScannedIds] = useState<string[]>([])
  const scannedIdsRef = useRef<string[]>([])
  const [scanHint, setScanHint] = useState('')
  const scanQueue = useRef(Promise.resolve())
  // 本地打印代理（labelrender.exe 直发）：网页点击打印 → 本机代理 → 标签打印机
  // 版式/纸张/字体全部固定在 exe 内，无需任何打印设置，所有电脑输出一致
  const agentUrl = 'http://localhost:8790'
  const [agentOnline, setAgentOnline] = useState(false)
  const [agentMsg, setAgentMsg] = useState('')

  const requestLabels = async (mode: 'PREVIEW' | 'PRINT', scanIds = scannedIds) => {
    const payload = { temporaryRemark: temporaryRemark || null, remarkMode, copies, mode, variant, header }
    if (sampleChooseId) return (await api.post<{ labels: Label[] }>(`/labels/sample-choose/${sampleChooseId}`, payload)).labels

    const requests: Promise<{ labels: Label[] }>[] = []
    if (materialIds.length) requests.push(api.post('/labels/preview', { materialIds, ...payload }))
    scanIds.forEach((id) => requests.push(api.post('/labels/preview', { materialIds: [id], ...payload })))
    return (await Promise.all(requests)).flatMap((result) => result.labels)
  }

  const callLabels = async (mode: 'PREVIEW' | 'PRINT') => {
    if (!sampleChooseId && !materialIds.length && !scannedIds.length) return
    setLoading(true); setMessage('')
    try {
      const nextLabels = await requestLabels(mode)
      setLabels(nextLabels)
      if (mode === 'PRINT') {
        // 固定走本地打印代理（labelrender.exe RAW 直发），不走浏览器打印
        try {
          const agentLabels = nextLabels.map((label) => ({ ...label, variant: label.variant ?? variant, header: label.header ?? header, data: { ...label.data, companyName } }))
          const resp = await fetch(`${agentUrl.replace(/\/$/, '')}/api/print/label`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labels: agentLabels }),
          })
          const data = await resp.json()
          if (!resp.ok || !data.ok) throw new Error(data.error || '打印代理返回错误')
          const totalCopies = nextLabels.reduce((sum, l) => sum + (l.copies ?? copies), 0)
          setMessage(`已直接发送 ${totalCopies} 张到标签打印机（固定版式 70×40mm，无需任何打印设置）。`)
        } catch (error) {
          setMessage('打印失败：' + (error instanceof Error ? error.message : String(error)) + '（请确认本机打印代理已启动）')
        }
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '标签生成失败') } finally { setLoading(false) }
  }

  useEffect(() => { if (hasParams) void callLabels('PREVIEW') }, [sampleChooseId, materialIds.join(',')])

  // 标签抬头：统一取系统「公司信息」，与老系统一致；失败回退到品牌名
  useEffect(() => {
    api.get<{ companyName: string }>('/system/company-info')
      .then((info) => { if (info.companyName) setCompanyName(info.companyName) })
      .catch(() => undefined)
  }, [])

  // 本地打印代理在线检测（自动识别）：始终探测，决定是否走代理
  useEffect(() => {
    let alive = true
    const check = () => fetch(`${agentUrl.replace(/\/$/, '')}/api/status`, { headers: { 'Content-Type': 'application/json' } })
      .then((r) => {
        if (!alive) return
        setAgentOnline(r.ok)
        setAgentMsg(r.ok ? '本地代理在线' : '未检测到本地代理')
      })
      .catch(() => {
        if (!alive) return
        setAgentOnline(false)
        setAgentMsg('未检测到本地代理（请启动 MQPrintAgent.exe）')
      })
    check()
    const t = window.setInterval(check, 8000)
    return () => { alive = false; window.clearInterval(t) }
  }, [agentUrl])

  // 扫描器输入：每次按 Item No. 查询并按扫描顺序追加；重复扫码保留为独立标签。
  const handleScan = (scanned: string) => {
    const itemNo = scanned.trim()
    if (!itemNo) return
    scanQueue.current = scanQueue.current.then(async () => {
      setLoading(true)
      setScanHint(`正在查询 Item No.：${itemNo}`)
      try {
        const result = await api.get<{ list: { id: string; itemNo: string }[] }>(`/materials?pageSize=1&itemNo=${encodeURIComponent(itemNo)}&status=ACTIVE`)
        const material = result.list[0]
        if (!material) { setScanHint(`未找到 Item No.：${itemNo}`); return }
        const nextIds = [...scannedIdsRef.current, material.id]
        scannedIdsRef.current = nextIds
        setScannedIds(nextIds)
        setLabels(await requestLabels('PREVIEW', nextIds))
        setScanHint(`已扫码加入并更新预览：${material.itemNo}`)
      } catch (error) {
        setScanHint(error instanceof Error ? error.message : `查询 Item No. 失败：${itemNo}`)
      } finally {
        setLoading(false)
      }
    })
  }
  const { scanning } = useBarcodeScanner({ enabled: !sampleChooseId, onScan: handleScan })

  return <div>
    <style>{`@media print {
      @page { size: 70mm 40mm; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body * { visibility: hidden !important; }
      #label-print-area, #label-print-area * { visibility: visible !important; }
      /* 只保留 #label-print-area 及其祖先链参与排版，其余节点 display:none 彻底退出文档流。
         这样标签区回到正常流顶部，才能按 break-after 逐张分页（fixed 不会跨页，会导致 N 张标签叠在同一页）。 */
      body *:not(#label-print-area):not(#label-print-area *):not(:has(#label-print-area)) { display: none !important; }
      body *:has(#label-print-area) { height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; }
      #label-print-area { display: block !important; width: 70mm !important; margin: 0 !important; padding: 0 !important; }
      .print-label { width: 70mm !important; height: 40mm !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; box-sizing: border-box !important; overflow: hidden !important; break-after: page; page-break-after: always; break-inside: avoid; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-label:last-child { break-after: auto; page-break-after: auto; }
    }`}</style>
    <PageHeader title="标签打印" description={`当前版式：标签(${variant === 'SPEC' ? '仅规格' : '全'})${header ? '' : '·无抬头'} ｜ Argox CP-2140M/3140：70 × 40 mm 标签；二维码内容为 Item No.。`} />
    <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">本页通过本机打印代理直接驱动标签打印机（固定 70 × 40 mm 版式，无需选择打印机或设置纸张，所有电脑打印效果一致）。请保持本机打印代理（mq-print-agent）处于运行状态。</div>
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${agentOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}><span className={`h-2 w-2 rounded-full ${agentOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />{agentOnline ? '打印代理在线' : '打印代理未启动'}</span>
      {agentMsg && <span className="text-xs text-slate-500">{agentMsg}</span>}
    </div>
    <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      {!sampleChooseId && (
        <label>扫码追加<input
          className="ml-2 rounded-lg border border-slate-200 p-2 text-sm"
          placeholder="扫面料 Item No. 追加标签"
          onKeyDown={(event) => { if (event.key === 'Enter') { handleScan((event.target as HTMLInputElement).value); (event.target as HTMLInputElement).value = '' } }}
        /><span className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${scanning ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${scanning ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />{scanning ? '扫描中…' : '扫描器就绪'}</span></label>
      )}
      <label>临时备注<input className="ml-2 rounded-lg border border-slate-200 p-2 text-sm" value={temporaryRemark} onChange={(event) => setTemporaryRemark(event.target.value)} /></label><label><input type="radio" checked={remarkMode === 'REPLACE'} onChange={() => setRemarkMode('REPLACE')} /> 覆盖</label><label><input type="radio" checked={remarkMode === 'APPEND'} onChange={() => setRemarkMode('APPEND')} /> 追加</label><label>份数<input className="ml-2 w-16 rounded-lg border border-slate-200 p-2 text-sm" type="number" min="1" max="100" value={copies} onChange={(event) => setCopies(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} /></label><button className="rounded-lg bg-slate-100 px-3 py-1 text-sm" disabled={loading} onClick={() => void callLabels('PREVIEW')}>{loading ? '处理中…' : '更新预览'}</button><button className="rounded-lg bg-[#123c5a] px-3 py-1 text-sm text-white disabled:opacity-50" disabled={loading || !labels.length} onClick={() => void callLabels('PRINT')}><Printer size={16} className="mr-1 inline" />直接打印（exe）</button>
    </div>
    {!sampleChooseId && scannedIds.length > 0 && (
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>已扫码追加 {scannedIds.length} 个：</span>
        {scannedIds.map((id, index) => <span key={`${id}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">…{id.slice(-4)}<button className="text-slate-400 hover:text-red-500" onClick={() => { const next = scannedIds.filter((_, i) => i !== index); scannedIdsRef.current = next; setScannedIds(next); void requestLabels('PREVIEW', next).then(setLabels) }}><X size={12} /></button></span>)}
        <button className="text-slate-400 underline" onClick={() => { scannedIdsRef.current = []; setScannedIds([]); void requestLabels('PREVIEW', []).then(setLabels) }}>清空</button>
        {scanHint && <span className={scanHint.startsWith('未找到') ? 'text-red-600' : 'text-emerald-600'}>{scanHint}</span>}
      </div>
    )}
    {!sampleChooseId && scannedIds.length === 0 && scanHint && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{scanHint}</p>}
    {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}{message && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}{!loading && !labels.length && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">未获取到可打印标签。</p>}
    <div id="label-print-area">{labels.flatMap((label, index) => Array.from({ length: label.copies ?? copies }, (_, copyIdx) => ({ label, key: `${label.data.materialId}-${index}-${copyIdx}` }))).map(({ label, key }) => {
      const variantOf = label.variant ?? variant
      const headerOf = label.header ?? header
      const L = layoutLabel(label, variantOf, headerOf, companyName)
      return (
        <div key={key} className="print-label relative m-3 flex flex-col overflow-hidden rounded border border-slate-200 bg-white text-black" style={{ width: '70mm', height: '40mm', padding: `${PAD_MM}mm` }}>
          {L.withHeader && L.headerText.map((hl, hi) => (
            <div key={`hdr-${hi}`} className="shrink-0 font-bold" style={{ fontSize: `${dotToMm(L.headerFont)}mm`, lineHeight: `${dotToMm(L.headerLine)}mm`, textAlign: 'center', whiteSpace: 'pre' }}>{hl}</div>
          ))}
          <div style={{ width: `${dotToMm(L.textW)}mm` }}>
            <div style={{ fontSize: `${dotToMm(L.itemFont)}mm`, lineHeight: `${dotToMm(L.itemLine)}mm`, whiteSpace: 'pre' }}><b>Item No.:</b> {L.itemNo}</div>
            {L.rows.map((row) => {
              const rowFont = row.fontScale === 1 ? L.rowFont : Math.max(6, Math.round(L.rowFont * row.fontScale))
              const rowLine = row.fontScale === 1 ? L.rowLine : Math.max(8, Math.round(L.rowLine * row.fontScale))
              return row.lines.map((line, lineIndex) => (
                <div key={`${row.k}-${lineIndex}`} style={{ fontSize: `${dotToMm(rowFont)}mm`, lineHeight: `${dotToMm(rowLine)}mm`, whiteSpace: 'pre' }}>{lineIndex === 0 ? `${row.k}: ` : ' '.repeat(row.indent)}{line}</div>
              ))
            })}
          </div>
          <div style={{ position: 'absolute', right: `${PAD_MM}mm`, bottom: `${PAD_MM}mm` }}>
            <QRCodeSVG value={label.qrValue} size={Math.round((dotToMm(L.qrSize) * 96) / 25.4)} level="M" includeMargin={false} />
          </div>
        </div>
      )
    })}</div>
  </div>
}
