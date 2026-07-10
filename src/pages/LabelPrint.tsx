import { useState } from 'react'
import { Printer } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { fabrics } from '@/data/mock'

export default function LabelPrint() {
  const item = fabrics[0]
  const [remark, setRemark] = useState('临时备注不回写资料')

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #label-print-area, #label-print-area * { visibility: visible; }
          #label-print-area {
            position: fixed;
            left: 0;
            top: 0;
            width: 70mm;
            height: 40mm;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          @page { size: 70mm 40mm; margin: 0; }
        }
      `}</style>
      <PageHeader title="标签打印" description="适配 Argox 立象 CP-2140M/3140，标签尺寸 70mm × 40mm。" />
      <div className="grid grid-cols-[1fr_360px] gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div id="label-print-area" className="mx-auto h-[40mm] w-[70mm] rounded-xl border-2 border-dashed border-slate-300 bg-white p-[3mm] text-black shadow-inner">
            <div className="mb-[2mm] border-b border-black pb-[1mm] text-center text-[11px] font-black tracking-wide">MING QUN TEXTILE</div>
            <div className="grid grid-cols-[1fr_18mm] gap-[3mm] text-[8px] leading-[1.45]">
              <div className="min-w-0">
                <p><b>Item No.:</b> {item.itemNo}</p>
                <p><b>Composition:</b> {item.composition}</p>
                <p><b>Construction:</b> {item.construction}</p>
                <p><b>Width:</b> {item.width}</p>
                <p><b>Weight:</b> {item.weight}</p>
                <p className="line-clamp-2"><b>Remark:</b> {remark || '/'}</p>
              </div>
              <div className="flex h-[18mm] w-[18mm] items-center justify-center border border-black bg-white text-center text-[6px] font-bold leading-tight">QR<br />{item.itemNo}</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold">打印设置</h2>
          <label className="mb-2 block text-xs font-semibold text-slate-500">临时备注</label>
          <textarea value={remark} onChange={(event) => setRemark(event.target.value)} className="h-24 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-[#1e8a7a]" placeholder="仅本次打印使用" />
          <button onClick={() => window.print()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#123c5a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0e314b]"><Printer size={17} />打印当前标签</button>
          <div className="mt-4 space-y-2 rounded-xl bg-[#f8f4ec] p-4 text-sm text-slate-600">
            <div>纸张：70mm × 40mm</div>
            <div>二维码内容：Item No.</div>
            <div>备注规则：临时备注只影响本次打印</div>
            <div>后续可接入 Argox 指令或本地打印服务</div>
          </div>
        </div>
      </div>
    </div>
  )
}
