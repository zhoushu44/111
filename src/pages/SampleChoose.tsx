import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type Material = { id: string; itemNo: string; name: string; specification?: string | null }
type Customer = { id: string; code: string; name: string }
type Selected = Material & { quantity: number; remark: string }

export default function SampleChoose() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const admin = useAuthStore((state) => state.user?.role === 'admin')
  const autoAdded = useRef(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [customerId, setCustomerId] = useState('')
  const [code, setCode] = useState(params.get('item') ?? '')
  const [items, setItems] = useState<Selected[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      api.get<{ list: Customer[] }>('/sample-customers?pageSize=100'),
      api.get<{ list: Material[] }>('/materials?pageSize=100&status=ACTIVE'),
    ]).then(([customerResult, materialResult]) => {
      setCustomers(customerResult.list)
      setCustomerId(customerResult.list[0]?.id ?? '')
      setMaterials(materialResult.list)
    }).catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const itemNo = params.get('item')
    if (!itemNo || !materials.length || autoAdded.current) return
    autoAdded.current = true
    const material = materials.find((item) => item.itemNo.toLowerCase() === itemNo.trim().toLowerCase())
    if (!material) return setMessage('未找到启用面料')
    setItems([{ ...material, quantity: 1, remark: '' }])
    setCode('')
  }, [materials, params])

  const add = () => {
    const material = materials.find((item) => item.itemNo.toLowerCase() === code.trim().toLowerCase())
    if (!material) return setMessage('未找到启用面料')
    setItems((current) => current.some((item) => item.id === material.id)
      ? current.map((item) => item.id === material.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { ...material, quantity: 1, remark: '' }])
    setCode('')
    setMessage('')
  }

  const save = async () => {
    if (!customerId) return setMessage('当前没有可选客户，请先维护并启用客户资料')
    if (!items.length) return setMessage('选样清单为空，请先添加面料')
    setSaving(true)
    setMessage('正在保存选样单…')
    try {
      const result = await api.post<{ documentNo: string }>('/sample-chooses', {
        customerId,
        items: items.map((item) => ({ materialId: item.id, quantity: item.quantity, remark: item.remark || null })),
      })
      navigate(`/samples/choose-records?documentNo=${encodeURIComponent(result.documentNo)}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const labelUrl = `/print/labels?materialIds=${items.map((item) => item.id).join(',')}`
  return <div>
    <PageHeader title="客户选样管理" description="选择客户，通过手输或扫码添加启用面料。" />
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label>客户
        <select className="ml-2 border p-2" value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={!customers.length}>
          {customers.length ? customers.map((item) => <option value={item.id} key={item.id}>{item.code} - {item.name}</option>) : <option>暂无启用客户</option>}
        </select>
      </label>
      <label>Item No.
        <input className="ml-2 border p-2" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} placeholder="扫码/输入 Item No." />
      </label>
      <button onClick={add}>添加面料</button>
      <button disabled={!items.length} onClick={() => navigate(labelUrl)}>预览/标签</button>
      <button className="bg-[#123c5a] px-4 py-2 text-white disabled:opacity-50" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存选样'}</button>
    </div>
    {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}
    {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
    {!customers.length && <p className="mb-3 rounded bg-amber-50 p-3 text-amber-800">暂无可选客户，请先在客户资料维护中创建并启用客户。</p>}
    {!items.length && <p className="mb-3 rounded bg-slate-50 p-3 text-slate-500">选样清单为空，输入 Item No. 后点击“添加面料”。</p>}
    <DataTable data={items} columns={[
      { title: 'Item No.', render: (row) => row.itemNo },
      { title: '面料名称', render: (row) => row.name },
      { title: '规格', render: (row) => row.specification || '-' },
      { title: '数量', render: (row) => <input type="number" min="1" value={row.quantity} onChange={(event) => setItems((current) => current.map((item) => item.id === row.id ? { ...item, quantity: Math.max(1, Number(event.target.value) || 1) } : item))} /> },
      { title: '备注', render: (row) => <input value={row.remark} onChange={(event) => setItems((current) => current.map((item) => item.id === row.id ? { ...item, remark: event.target.value } : item))} /> },
      { title: '操作', render: (row) => <button onClick={() => setItems((current) => current.filter((item) => item.id !== row.id))}>删除</button> },
    ]} />
    {admin && <p className="mt-3 text-xs text-slate-500">选样导出时可选择包含规格、成本和图片。</p>}
  </div>
}
