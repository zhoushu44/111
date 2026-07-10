import { useMemo, useState } from 'react'
import { Printer, Search, X } from 'lucide-react'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { fabrics as initialFabrics } from '@/data/mock'
import { useAuthStore } from '@/store/authStore'
import type { MaterialFabric } from '@/types'

type FabricForm = Pick<MaterialFabric, 'itemNo' | 'name' | 'category' | 'composition' | 'construction' | 'width' | 'weight' | 'color' | 'provider' | 'location'> & {
  costPrice: string
  stockQty: string
}

const emptyForm: FabricForm = {
  itemNo: '',
  name: '',
  category: '棉类面料',
  composition: '',
  construction: '',
  width: '',
  weight: '',
  color: '',
  provider: '',
  location: '',
  costPrice: '',
  stockQty: '',
}

export default function MaterialFabrics() {
  const role = useAuthStore((state) => state.user?.role)
  const isAdmin = role === 'admin'
  const [items, setItems] = useState<MaterialFabric[]>(initialFabrics)
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('全部类别')
  const [selected, setSelected] = useState<MaterialFabric | null>(null)
  const [editing, setEditing] = useState<MaterialFabric | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FabricForm>(emptyForm)
  const [message, setMessage] = useState('')

  const categories = ['全部类别', ...Array.from(new Set(items.map((item) => item.category)))]
  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return items.filter((item) => {
      const matchKeyword = !normalized || [item.itemNo, item.name, item.composition, item.color].some((value) => value.toLowerCase().includes(normalized))
      const matchCategory = category === '全部类别' || item.category === category
      return matchKeyword && matchCategory
    })
  }, [category, items, keyword])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  const openEdit = (item: MaterialFabric) => {
    setEditing(item)
    setForm({
      itemNo: item.itemNo,
      name: item.name,
      category: item.category,
      composition: item.composition,
      construction: item.construction,
      width: item.width,
      weight: item.weight,
      color: item.color,
      provider: item.provider,
      location: item.location,
      costPrice: String(item.costPrice),
      stockQty: String(item.stockQty),
    })
    setFormOpen(true)
  }

  const closeForm = () => {
    setEditing(null)
    setForm(emptyForm)
  }

  const saveForm = () => {
    if (!form.itemNo.trim() || !form.name.trim()) {
      setMessage('Item No. 和面料名称必填')
      return
    }

    const exists = items.some((item) => item.itemNo === form.itemNo && item.id !== editing?.id)
    if (exists) {
      setMessage('Item No. 已存在')
      return
    }

    const nextItem: MaterialFabric = {
      id: editing?.id ?? `m${Date.now()}`,
      itemNo: form.itemNo,
      name: form.name,
      category: form.category,
      composition: form.composition,
      construction: form.construction,
      width: form.width,
      weight: form.weight,
      color: form.color,
      costPrice: Number(form.costPrice || 0),
      provider: form.provider,
      location: form.location,
      stockQty: Number(form.stockQty || 0),
      image: editing?.image ?? initialFabrics[0].image,
      enabled: true,
    }

    setItems((list) => editing ? list.map((item) => item.id === editing.id ? nextItem : item) : [nextItem, ...list])
    setMessage(editing ? '面料资料已更新' : '面料资料已新增')
    closeForm()
  }

  const columns = [
    { title: '图片', render: (row: MaterialFabric) => <img src={row.image} className="h-12 w-12 rounded-lg object-cover" /> },
    { title: 'Item No.', render: (row: MaterialFabric) => <button onClick={() => setSelected(row)} className="font-semibold text-[#123c5a] hover:underline">{row.itemNo}</button> },
    { title: '面料名称', render: (row: MaterialFabric) => row.name },
    { title: '类别', render: (row: MaterialFabric) => row.category },
    { title: '成分', render: (row: MaterialFabric) => row.composition },
    { title: '规格', render: (row: MaterialFabric) => `${row.construction} / ${row.width} / ${row.weight}` },
    ...(isAdmin ? [{ title: '供应商/成本', render: (row: MaterialFabric) => <div>{row.provider}<div className="text-xs text-slate-500">¥{row.costPrice}</div></div> }] : []),
    { title: '库位/库存', render: (row: MaterialFabric) => <span>{row.location} · {row.stockQty}</span> },
    { title: '操作', render: (row: MaterialFabric) => <div className="space-x-2 text-[#1e8a7a]"><button onClick={() => setSelected(row)}>详情</button><button onClick={() => openEdit(row)}>编辑</button><button>打印</button></div> },
  ]

  return (
    <div>
      <PageHeader title="面料资料维护" description="维护 Item No.、成分、组织、幅宽、克重、图片、库存和标签信息。" action="新增面料" />
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-[#1e8a7a]" placeholder="输入 Item No. / 面料名称 / 成分 / 颜色" />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]">
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button onClick={() => { setKeyword(''); setCategory('全部类别') }} className="rounded-lg border border-slate-200 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50">重置</button>
          <button onClick={openCreate} className="rounded-lg bg-[#1e8a7a] px-5 text-sm font-semibold text-white hover:bg-[#166f63]">新增面料</button>
          <div className="ml-auto flex items-center text-sm text-slate-500">共 {filtered.length} 条 {message ? <span className="ml-3 text-[#1e8a7a]">{message}</span> : null}</div>
        </div>
      </div>
      <DataTable columns={columns} data={filtered} />

      {selected ? (
        <div className="fixed inset-0 z-30 bg-slate-900/35" onClick={() => setSelected(null)}>
          <aside className="absolute right-0 top-0 h-full w-[460px] overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between">
              <div><h2 className="text-xl font-bold text-slate-900">{selected.itemNo}</h2><p className="text-sm text-slate-500">{selected.name}</p></div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <img src={selected.image} className="mb-5 h-56 w-full rounded-2xl object-cover" />
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['类别', selected.category], ['成分', selected.composition], ['组织', selected.construction], ['幅宽', selected.width], ['克重', selected.weight], ['颜色', selected.color], ['库位', selected.location], ['库存', selected.stockQty],
                ...(isAdmin ? [['供应商', selected.provider], ['成本价', `¥${selected.costPrice}`]] : []),
              ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-800">{value}</div></div>)}
            </div>
            <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#123c5a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0e314b]"><Printer size={17} />打印标签</button>
          </aside>
        </div>
      ) : null}

      {formOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6">
          <div className="w-[760px] rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div><h2 className="text-xl font-bold">{editing ? '编辑面料资料' : '新增面料资料'}</h2><p className="text-sm text-slate-500">Item No. 和面料名称为必填项</p></div>
              <button onClick={closeForm} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {[
                ['itemNo', 'Item No. *'], ['name', '面料名称 *'], ['category', '类别'], ['composition', '成分'], ['construction', '组织'], ['width', '幅宽'], ['weight', '克重'], ['color', '颜色'], ['location', '库位'], ['stockQty', '库存数量'],
                ...(isAdmin ? [['provider', '供应商'], ['costPrice', '成本价']] : []),
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
                  <input value={String(form[key as keyof FabricForm])} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-[#1e8a7a]" />
                </label>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">图片上传模拟：当前 Demo 使用默认面料图片，后续接入真实上传接口。</div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeForm} className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">取消</button>
              <button onClick={saveForm} className="rounded-lg bg-[#123c5a] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0e314b]">保存</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
