import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'

interface Props { type: 'inbound' | 'outbound' }

type MaterialOption = { id: string; itemNo?: string; code?: string; name: string }
type LocationOption = { id: string; itemNo?: string; code?: string; name: string }

interface LineItem {
  key: number // 唯一标识，用于 React key
  materialId: string
  locationId: string
  quantity: string
}

let lineKeyCounter = 0

export default function StockOperation({ type }: Props) {
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [lines, setLines] = useState<LineItem[]>([{ key: lineKeyCounter++, materialId: '', locationId: '', quantity: '' }])
  const [remark, setRemark] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<{ list: MaterialOption[] }>('/materials?pageSize=100&status=ACTIVE'),
      api.get<{ list: LocationOption[] }>('/sample-locations?pageSize=100&status=ACTIVE'),
    ]).then(([a, b]) => {
      setMaterials(a.list)
      setLocations(b.list)
    }).catch((e) => setMsg(e instanceof Error ? e.message : '加载失败')).finally(() => setLoading(false))
  }, [])

  // 更新某一行明细
  const updateLine = (key: number, field: keyof Omit<LineItem, 'key'>, value: string) => {
    setLines((prev) => prev.map((line) => line.key === key ? { ...line, [field]: value } : line))
  }

  // 增加一行
  const addLine = () => {
    setLines((prev) => [...prev, { key: lineKeyCounter++, materialId: '', locationId: '', quantity: '' }])
  }

  // 删除一行
  const removeLine = (key: number) => {
    setLines((prev) => prev.length <= 1 ? prev : prev.filter((line) => line.key !== key))
  }

  // 提交
  const submit = async () => {
    // 校验：所有行必须填写完整
    const validLines = lines.filter((l) => l.materialId && l.locationId && l.quantity && Number(l.quantity) > 0)
    if (!validLines.length) {
      return setMsg('请至少填写一行完整的面料/库位/数量信息')
    }
    // 检查是否有未填完的行
    const incompleteLines = lines.filter((l) => (l.materialId || l.locationId || l.quantity) && !validLines.includes(l))
    if (incompleteLines.length > 0) {
      return setMsg('存在未填写完整的明细行，请补全或删除')
    }

    setLoading(true)
    setMsg('')
    try {
      const items = validLines.map((l) => ({ materialId: l.materialId, locationId: l.locationId, quantity: Number(l.quantity) }))
      await api.post(type === 'inbound' ? '/sample-inbounds' : '/sample-outbounds', { remark, items })
      setMsg('提交成功')
      // 提交后清空明细
      setLines([{ key: lineKeyCounter++, materialId: '', locationId: '', quantity: '' }])
      setRemark('')
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : '提交失败'
      setMsg(errMsg)
      // 出库时库存不足提示
      if (type === 'outbound' && errMsg.includes('库存不足')) {
        setMsg('库存不足，请检查出库数量是否超出当前库存')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader title={type === 'inbound' ? '样品入库' : '样品出库'} description="使用实际启用面料与库位提交库存单据。" />
      {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
      {msg && (
        <p className={`mb-3 rounded-lg p-3 text-sm ${msg.includes('成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {msg}
        </p>
      )}

      {/* 明细行 */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">明细行</h3>
          <button className="rounded-lg bg-[#123c5a] px-3 py-1 text-sm text-white" onClick={addLine}>+ 增加一行</button>
        </div>
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-3">
              <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={line.materialId} onChange={(e) => updateLine(line.key, 'materialId', e.target.value)}>
                <option value="">选择面料</option>
                {materials.map((x) => <option value={x.id} key={x.id}>{x.itemNo} · {x.name}</option>)}
              </select>
              <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={line.locationId} onChange={(e) => updateLine(line.key, 'locationId', e.target.value)}>
                <option value="">选择库位</option>
                {locations.map((x) => <option value={x.id} key={x.id}>{x.code} · {x.name}</option>)}
              </select>
              <input type="number" min="1" className="h-10 w-28 rounded-lg border border-slate-200 px-3 text-sm" value={line.quantity} onChange={(e) => updateLine(line.key, 'quantity', e.target.value)} placeholder="数量" />
              <button className="rounded-lg border border-red-200 px-2 py-1 text-sm text-red-500 hover:bg-red-50" onClick={() => removeLine(line.key)} disabled={lines.length <= 1}>删除</button>
            </div>
          ))}
        </div>
      </div>

      {/* 备注 */}
      <div className="mb-4 flex items-center gap-3">
        <input className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="备注（选填）" />
        <button className="rounded-lg bg-[#123c5a] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading} onClick={() => void submit()}>
          {loading ? '提交中…' : '提交'}
        </button>
      </div>

      {type === 'outbound' && (
        <p className="text-xs text-slate-500">出库操作会检查库存余额，如库存不足将提示错误。</p>
      )}
    </div>
  )
}
