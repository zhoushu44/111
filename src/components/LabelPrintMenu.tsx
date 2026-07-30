import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export type LabelVariant = 'SPEC' | 'FULL'

type Option = {
  key: string
  label: string
  /** 标签类选项：决定标签版式 */
  variant?: LabelVariant
  header?: boolean
  /** 选样单（默认）打印，不走标签页 */
  sheet?: boolean
}

// 老系统（HSTIP）里的「密度」在本系统即「规格」，故选项统一显示「规格」。
const OPTIONS: Option[] = [
  { key: 'spec', label: '标签(仅规格)', variant: 'SPEC', header: true },
  { key: 'full', label: '标签(全)', variant: 'FULL', header: true },
  { key: 'spec-noheader', label: '标签(无抬头.规格)', variant: 'SPEC', header: false },
  { key: 'full-noheader', label: '标签(无抬头.全)', variant: 'FULL', header: false },
  { key: 'sheet', label: '选样单(默认)', sheet: true },
]

type Props = {
  /** 选样单 id（来自选样记录），用于标签与选样单打印 */
  sampleChooseId?: string
  /** 面料 id 列表（来自选样编辑/预览），用于标签打印 */
  materialIds?: string[]
  disabled?: boolean
  className?: string
  /** 触发按钮文字，默认「标签」 */
  label?: string
}

export default function LabelPrintMenu({ sampleChooseId, materialIds, disabled, className, label = '标签' }: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const pick = (option: Option) => {
    setOpen(false)
    if (option.sheet) {
      // 选样单打印需要已保存的选样单
      if (sampleChooseId) navigate(`/print/sample-choose/${sampleChooseId}`)
      return
    }
    const params = new URLSearchParams()
    if (sampleChooseId) params.set('sampleChooseId', sampleChooseId)
    if (materialIds && materialIds.length) params.set('materialIds', materialIds.join(','))
    params.set('variant', option.variant ?? 'FULL')
    params.set('header', String(option.header ?? true))
    navigate(`/print/labels?${params.toString()}`)
  }

  // 未保存的选样（只有 materialIds）没有选样单可打印，隐藏「选样单(默认)」
  const visibleOptions = sampleChooseId ? OPTIONS : OPTIONS.filter((o) => !o.sheet)

  return (
    <>
      <button
        type="button"
        className={className ?? 'rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50'}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">选择打印方式</h2>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>关闭</button>
            </div>
            <div className="space-y-2">
              {visibleOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-[#123c5a] hover:bg-[#123c5a]/5"
                  onClick={() => pick(option)}
                >
                  <span>{option.label}</span>
                  <span className="text-xs text-slate-400">{option.sheet ? '跳转到选样单打印' : '进入标签打印'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
