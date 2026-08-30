import { useEffect, useState } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, assetUrl } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Item = { id: string; itemNoSnapshot: string; nameSnapshot: string; specSnapshot?: string | null; unitSnapshot?: string | null; compositionSnapshot?: string | null; constructionSnapshot?: string | null; widthSnapshot?: string | null; weightSnapshot?: string | null; factoryNoSnapshot?: string | null; quantity: number; remark?: string | null; material: { itemNo: string; name: string; specification?: string | null; unit: string; composition?: string | null; construction?: string | null; width?: string | null; weight?: string | null; images?: { url: string }[]; cost?: number | string | null } }
type CustomerDetail = { name: string; fullName?: string | null; address?: string | null; phone?: string | null; fax?: string | null }
type Detail = { id: string; documentNo: string; customerName: string; contact?: string | null; createdAt: string; remark?: string | null; customer: CustomerDetail; createdBy: { displayName: string; username: string }; items: Item[] }

const EMPTY_ROWS = 20
// 抬头星号分隔线（与导出一致，老系统 报价单.xls 为整行星号），超宽部分打印时隐藏
const HEADER_ASTERISKS = '*'.repeat(110)

export default function SampleChoosePreview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const admin = useAuthStore((state) => state.user?.role === 'admin')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [company, setCompany] = useState<{ companyName: string; address: string; phone: string; fax: string; logoUrl?: string | null } | null>(null)
  const [showSpec, setShowSpec] = useState(true)
  const [showImage, setShowImage] = useState(false)
  const [showCost, setShowCost] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!id) return
    setLoading(true); setMessage('')
    void Promise.all([
      api.get<Detail>(`/sample-chooses/${id}`),
      api.get<{ companyName: string; address: string; phone: string; fax: string; logoUrl?: string | null }>('/system/company-info'),
    ]).then(([d, info]) => {
      setDetail(d)
      setCompany(info)
      const hasCost = d.items.some((item) => item.material.cost != null)
      setShowSpec(true); setShowImage(false); setShowCost(admin && hasCost)
    })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false))
  }, [id, admin])

  if (loading) return <div className="p-10 text-center text-slate-500">加载中…</div>
  if (message) return <div className="p-10 text-center text-red-600">{message}</div>
  if (!detail) return <div className="p-10 text-center text-slate-400">未找到选样单</div>

  const date = new Date(detail.createdAt)
  const dateText = `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}.${date.getFullYear()}`
  const costVisible = admin && showCost
  const dataRows = detail.items.length
  const blankRows = Math.max(0, EMPTY_ROWS - dataRows)

  const renderImage = (item: Item) => {
    const url = item.material.images?.[0]?.url
    if (!url) return <span className="text-slate-300">—</span>
    return <img src={assetUrl(url)} alt="" className="h-14 w-14 rounded object-contain" />
  }

  return (
    <div>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 14mm; }
          html, body { margin: 0; padding: 0; background: #fff; }
          body * { visibility: hidden; }
          #quotation-print-area, #quotation-print-area * { visibility: visible; }
          #quotation-print-area { position: fixed; inset: 0; padding: 0 8mm; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* 工具栏：屏幕可见，打印隐藏 */}
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <ArrowLeft size={15} /> 返回
        </button>
        <div className="text-sm text-slate-600">
          <b>{detail.documentNo}</b> · {detail.customerName} · 共 {dataRows} 条明细
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showSpec} onChange={(event) => setShowSpec(event.target.checked)} className="h-4 w-4 accent-[#123c5a]" />
            包含规格
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showImage} onChange={(event) => setShowImage(event.target.checked)} className="h-4 w-4 accent-[#123c5a]" />
            包含图片
          </label>
          {admin && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={showCost} onChange={(event) => setShowCost(event.target.checked)} className="h-4 w-4 accent-[#123c5a]" />
              包含成本
            </label>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-[#123c5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0e314b]">
            <Printer size={15} /> 打印
          </button>
        </div>
      </div>

      <div id="quotation-print-area" className="mx-auto max-w-[210mm] bg-white px-2 text-[11pt] text-black">
        {/* 公司抬头（与老系统 报价单.xls 输出一致：Logo 图 + 地址 + TEL/FAX，公司名含在 Logo 内） */}
        <div className="relative flex min-h-[52px] items-center justify-center">
          {company?.logoUrl ? (
            <img src={assetUrl(company.logoUrl)} alt="" className="absolute left-0 top-0 h-[50px] w-auto" />
          ) : (
            <div className="absolute left-0 top-0 text-[13pt] font-bold leading-tight">{company?.companyName || 'Mint Chance Textile Co.,Ltd'}</div>
          )}
          <div className="text-center">
            <div className="text-[9pt] font-bold leading-snug">{company?.address ?? ''}</div>
            <div className="text-[9pt] font-bold leading-snug">TEL : {company?.phone ?? ''}&nbsp;&nbsp; FAX : {company?.fax ?? ''}</div>
          </div>
        </div>
        <div className="overflow-hidden whitespace-nowrap text-center text-[12pt] font-bold leading-none">{HEADER_ASTERISKS}</div>

        {/* 主标题 */}
        <div className="my-3 text-center text-[24pt] font-bold tracking-wider">QUOTATION LIST</div>

        {/* 元数据：左 Customer/ATTN，右 DATE */}
        <div className="mb-3 flex items-start text-[10.5pt]">
          <div className="flex-1 space-y-1">
            <div>Customer: {detail.customerName}</div>
            <div>Document No.: {detail.documentNo}</div>
            <div>ATTN: {detail.contact ?? ''}</div>
          </div>
          <div className="w-44 text-right">
            DATE: {dateText}
          </div>
        </div>

        {/* 表格 */}
        <table className="w-full border-collapse text-[10pt]">
          <thead>
            <tr className="border-b-2 border-[#123c5a] bg-[#123c5a] text-center text-[10.5pt] font-bold text-white">
              <th className="py-1.5">Item no</th>
              {showSpec && (<><th>Composition</th><th>Construction</th><th>Width</th><th>Weight</th></>)}
              {showImage && <th>图片</th>}
              {costVisible && <th>COST PRICE</th>}
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item) => {
              const cost = item.material.cost == null ? '' : (typeof item.material.cost === 'number' ? item.material.cost.toFixed(2) : item.material.cost)
              return (
                <tr key={item.id} className="border-b border-slate-300 align-top">
                  <td className="px-1 py-1.5 font-mono text-[9.5pt]">{item.itemNoSnapshot}</td>
                  {showSpec && (
                    <>
                      <td className="px-1 py-1.5">{item.compositionSnapshot ?? item.material.composition ?? ''}</td>
                      <td className="px-1 py-1.5">{item.constructionSnapshot ?? item.material.construction ?? ''}</td>
                      <td className="px-1 py-1.5">{item.widthSnapshot ?? item.material.width ?? ''}</td>
                      <td className="px-1 py-1.5">{item.weightSnapshot ?? item.material.weight ?? ''}</td>
                    </>
                  )}
                  {showImage && <td className="px-1 py-1.5 text-center">{renderImage(item)}</td>}
                  {costVisible && <td className="px-1 py-1.5 text-right">{cost}</td>}
                  <td className="px-1 py-1.5">{item.remark ?? ''}</td>
                </tr>
              )
            })}
            {Array.from({ length: blankRows }).map((_, index) => (
              <tr key={`blank-${index}`} className="border-b border-slate-300">
                <td className="px-1 py-3">&nbsp;</td>
                {showSpec && (<><td className="px-1 py-3">&nbsp;</td><td className="px-1 py-3">&nbsp;</td><td className="px-1 py-3">&nbsp;</td><td className="px-1 py-3">&nbsp;</td></>)}
                {showImage && <td className="px-1 py-3">&nbsp;</td>}
                {costVisible && <td className="px-1 py-3">&nbsp;</td>}
                <td className="px-1 py-3">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 页脚 */}
        <div className="mt-4 text-[8.5pt] text-slate-500">1/1</div>
      </div>
    </div>
  )
}
