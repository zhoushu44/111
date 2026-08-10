import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Printer, Search, Image as ImageIcon, Upload, RefreshCw, Sparkles, Loader2, Clock, Eye, X, ShoppingCart, Scan, ChevronRight, Minus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import { api, assetUrl } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type M = { id: string; itemNo: string; name: string; specification?: string | null; composition?: string | null; construction?: string | null; width?: string | null; weight?: string | null; color?: string | null; unit?: string | null; factoryNo?: string | null; remark?: string | null; labelRemark?: string | null; status: 'ACTIVE' | 'DISABLED'; images: { url: string; thumbnailUrl?: string | null }[]; category: { name: string }; provider?: { name: string } | null; cost?: number; stocks?: { quantity: number }[] }
type Option = { id: string; name: string }
type Customer = { id: string; code: string; name: string }

// 图片智能查询相关类型
type ImgStage = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'
type Features = { color: string; texture: string; composition: string; weight: string; width: string; gloss: string }
type MatchItem = M & { similarity: number }

const FEATURE_ROWS: { key: keyof Features; label: string }[] = [
  { key: 'color', label: '颜色' },
  { key: 'texture', label: '纹理' },
  { key: 'composition', label: '成分' },
  { key: 'weight', label: '克重' },
  { key: 'width', label: '门幅' },
  { key: 'gloss', label: '光泽' }
]

const simColor = (s: number) => (s >= 90 ? '#16A34A' : s >= 80 ? '#123C5A' : '#D97706')

type MaterialImageProps = { image?: M['images'][number]; alt: string; detail?: boolean; onClick?: () => void }
function MaterialImage({ image, alt, detail = false, onClick }: MaterialImageProps) {
  const [source, setSource] = useState<'thumbnail' | 'original' | 'failed'>(detail ? 'original' : image?.thumbnailUrl ? 'thumbnail' : 'original')
  if (!image || source === 'failed') return <div className="flex flex-col items-center gap-2 text-slate-300"><ImageIcon size={detail ? 40 : 32} />{image && <span className="text-xs">图片加载失败</span>}</div>
  const url = source === 'thumbnail' ? image.thumbnailUrl! : image.url
  return <img className={`${detail ? 'max-h-96 object-contain' : 'h-full object-cover'} w-full ${onClick ? 'cursor-pointer' : ''}`} src={assetUrl(url)} alt={alt} onClick={onClick} onError={() => setSource(source === 'thumbnail' ? 'original' : 'failed')} />
}

// 文字查询每页条数（后端上限 100）
const PAGE_SIZE = 20

export default function MaterialQuery() {
  const nav = useNavigate()
  const admin = useAuthStore((state) => state.user?.role === 'admin')
  const [query, setQuery] = useState({ keyword: '', categoryId: '', status: '', providerId: '' })
  const [categories, setCategories] = useState<Option[]>([])
  const [providers, setProviders] = useState<Option[]>([])
  const [list, setList] = useState<M[]>([])
  const [detail, setDetail] = useState<M | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  // 模式切换：文字查询 / 图片智能查询
  const [mode, setMode] = useState<'text' | 'image'>('text')

  // 图片智能查询状态
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState('')
  const [imgStage, setImgStage] = useState<ImgStage>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [features, setFeatures] = useState<Features | null>(null)
  const [matches, setMatches] = useState<MatchItem[]>([])
  const [imgError, setImgError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef('')

  // 批量选样状态
  const [selectedItems, setSelectedItems] = useState<{ material: M; quantity: number }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [scanCode, setScanCode] = useState('')
  const [scanHint, setScanHint] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [showSelectedPanel, setShowSelectedPanel] = useState(false)
  const [saving, setSaving] = useState(false)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const scanQueueRef = useRef(Promise.resolve())

  useEffect(() => {
    const requests: Promise<void>[] = [
      api.get<{ list: Option[] }>('/categories?pageSize=100').then((result) => setCategories(result.list)),
      api.get<{ list: Customer[] }>('/sample-customers?pageSize=100').then((result) => {
        setCustomers(result.list)
        if (result.list.length > 0) setSelectedCustomerId(result.list[0].id)
      })
    ]
    if (admin) requests.push(api.get<{ list: Option[] }>('/providers?pageSize=100').then((result) => setProviders(result.list)))
    void Promise.all(requests).catch((error: Error) => setMessage(error.message))
  }, [admin])

  const search = async (targetPage = 1) => {
    setLoading(true); setMessage('')
    try {
      const params = new URLSearchParams({ pageSize: String(PAGE_SIZE), page: String(targetPage) })
      Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value) })
      const result = await api.get<{ list: M[]; total: number; page: number; pageSize: number }>(`/materials?${params}`)
      setList(result.list); setTotal(result.total); setPage(result.page ?? targetPage); setSearched(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : '查询失败') } finally { setLoading(false) }
  }
  const viewDetail = async (id: string) => { try { setDetail(await api.get<M>(`/materials/${id}`)) } catch (error) { setMessage(error instanceof Error ? error.message : '详情加载失败') } }

  const resetImage = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
    setImgFile(null); setImgPreview(''); setImgStage('idle'); setUploadProgress(0); setFeatures(null); setMatches([]); setImgError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const runImageSearch = useCallback(async (file: File) => {
    setImgStage('uploading'); setUploadProgress(0); setFeatures(null); setMatches([]); setImgError('')
    const timer = setInterval(() => setUploadProgress((p) => Math.min(p + Math.random() * 18, 92)), 160)
    try {
      const form = new FormData()
      form.append('file', file)
      await new Promise((r) => setTimeout(r, 900))
      clearInterval(timer); setUploadProgress(100)
      setImgStage('analyzing')
      const result = await api.post<{ features: Features; matches: MatchItem[] }>('/materials/image-search', form)
      setFeatures(result.features); setMatches(result.matches); setImgStage('done')
    } catch (error) {
      clearInterval(timer)
      setImgError(error instanceof Error ? error.message : 'AI 识别失败，请重试')
      setImgStage('error')
    }
  }, [])

  const handleFile = useCallback((file: File) => {
    if (!file.type.match(/image\/(jpe?g|png)/i)) { setImgError('仅支持 JPG / PNG 格式'); return }
    if (file.size > 10 * 1024 * 1024) { setImgError('图片大小不能超过 10MB'); return }
    setImgError('')
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl
    setImgFile(file)
    setImgPreview(previewUrl)
    void runImageSearch(file)
  }, [runImageSearch])

  useEffect(() => {
    if (mode !== 'image') return
    const onPaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0]
      if (file && file.type.startsWith('image/')) { e.preventDefault(); handleFile(file) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile, mode])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  // ---- 批量选样逻辑 ----

  const refocusScan = () => { setTimeout(() => scanInputRef.current?.focus(), 50) }

  const processScan = async (code: string) => {
    const lower = code.toLowerCase()
    let material = list.find((m) => m.status === 'ACTIVE' && m.itemNo.toLowerCase() === lower)
    if (!material) {
      try {
        setScanHint('搜索中…')
        const res = await api.get<{ list: M[] }>(`/materials?pageSize=1&itemNo=${encodeURIComponent(code)}&status=ACTIVE`)
        material = res.list[0]
      } catch {
        setScanHint(`查询失败: ${code}`)
        setTimeout(() => setScanHint(''), 2000)
        return
      }
    }
    if (material) addToSelected(material)
    else {
      setScanHint(`未找到或已停用: ${code}`)
      setTimeout(() => setScanHint(''), 2000)
    }
  }

  const handleScan = () => {
    const code = scanCode.trim()
    setScanCode('')
    refocusScan()
    if (!code) return
    scanQueueRef.current = scanQueueRef.current.then(() => processScan(code))
  }

  const addToSelected = (material: M) => {
    if (material.status !== 'ACTIVE') {
      setScanHint(`无法加入：${material.itemNo} 已停用`)
      setTimeout(() => setScanHint(''), 2000)
      return
    }
    setSelectedItems((prev) => {
      const existing = prev.find((item) => item.material.id === material.id)
      if (existing) {
        return prev.map((item) => item.material.id === material.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...prev, { material, quantity: 1 }]
    })
    setSelectedIds((prev) => new Set([...prev, material.id]))
    setScanHint(`已加入: ${material.itemNo}`)
    setTimeout(() => setScanHint(''), 1500)
    setShowSelectedPanel(true)
  }

  const toggleSelected = (material: M) => {
    if (material.status !== 'ACTIVE' && !selectedIds.has(material.id)) {
      setScanHint(`无法加入：${material.itemNo} 已停用`)
      setTimeout(() => setScanHint(''), 2000)
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(material.id)) {
        next.delete(material.id)
        setSelectedItems((items) => items.filter((item) => item.material.id !== material.id))
      } else {
        next.add(material.id)
        setSelectedItems((items) => [...items, { material, quantity: 1 }])
      }
      return next
    })
  }

  const removeSelected = (materialId: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.material.id !== materialId))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(materialId)
      return next
    })
  }

  const updateQuantity = (materialId: string, quantity: number) => {
    setSelectedItems((prev) => prev.map((item) =>
      item.material.id === materialId ? { ...item, quantity: Math.max(1, quantity) } : item
    ))
  }

  const clearAllSelected = () => {
    setSelectedItems([])
    setSelectedIds(new Set())
  }

  const saveSampleChoose = async () => {
    if (!selectedCustomerId) return setMessage('请先选择客户')
    if (!selectedItems.length) return setMessage('已选清单为空')
    setSaving(true)
    try {
      const result = await api.post<{ documentNo: string }>('/sample-chooses', {
        customerId: selectedCustomerId,
        items: selectedItems.map((item) => ({
          materialId: item.material.id,
          quantity: item.quantity,
          remark: ''
        }))
      })
      setMessage(`选样单 ${result.documentNo} 已创建`)
      clearAllSelected()
      setShowSelectedPanel(false)
      nav(`/samples/choose-records?documentNo=${encodeURIComponent(result.documentNo)}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const tabBase = 'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors'
  const tabActive = 'bg-[#123c5a] text-white'
  const tabInactive = 'text-slate-500 hover:bg-slate-50'

  return <div>
    <PageHeader title="面料查询" description="按关键字、类别、启用状态查询，或上传面料图片由 AI 智能识别匹配。支持批量扫码选样。" />
    {/* 模式切换 */}
    <div className="mb-4 flex gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5">
      <button className={`${tabBase} ${mode === 'text' ? tabActive : tabInactive}`} onClick={() => setMode('text')}>
        <Search size={16} /> 文字查询
      </button>
      <button className={`${tabBase} ${mode === 'image' ? tabActive : tabInactive}`} onClick={() => setMode('image')}>
        <Sparkles size={16} /> 图片智能查询
      </button>
    </div>

    {mode === 'text' ? (
      <div className="flex gap-4">
        {/* 主内容区 */}
        <div className="min-w-0 flex-1">
          {/* 筛选栏 */}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.keyword} onChange={(event) => setQuery({ ...query, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && void search()} placeholder="Item No.、名称、成分、规格…" />
            <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.categoryId} onChange={(event) => setQuery({ ...query, categoryId: event.target.value })}><option value="">全部类别</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value })}><option value="">全部状态</option><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select>
            {admin && <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.providerId} onChange={(event) => setQuery({ ...query, providerId: event.target.value })}><option value="">全部供应商</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            <button className="rounded-lg bg-[#123c5a] px-5 text-sm font-semibold text-white" disabled={loading} onClick={() => void search()}>{loading ? '查询中…' : '查询'}</button>
          </div>

          {/* 扫码录入栏 */}
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <Scan size={18} className="text-slate-400" />
            <input
              ref={scanInputRef}
              className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleScan() }}
              placeholder="扫码/输入 Item No.，回车连续加入选样清单…"
              autoFocus
            />
            <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700" onClick={handleScan}>加入清单</button>
            {scanHint && <span className={`text-xs ${scanHint.startsWith('未找到') || scanHint.startsWith('查询失败') ? 'text-red-600' : 'text-emerald-600'}`}>{scanHint}</span>}
            {selectedItems.length > 0 && (
              <button className="flex items-center gap-1.5 rounded-lg bg-[#123c5a] px-3 py-1.5 text-xs font-medium text-white" onClick={() => setShowSelectedPanel(!showSelectedPanel)}>
                <ShoppingCart size={14} /> 已选 {selectedItems.length}
              </button>
            )}
          </div>

          {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
          {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}
          {!loading && searched && list.length === 0 && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">未找到匹配的面料记录。</p>}
          {!loading && !searched && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">请输入条件后点击查询。</p>}

          {list.length > 0 && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-slate-500">共 {total} 项面料</p>
                {selectedItems.length > 0 && (
                  <button className="text-xs text-slate-400 hover:text-red-500" onClick={clearAllSelected}>清空已选</button>
                )}
              </div>
              {/* 大图卡片网格 */}
              <div className="grid grid-cols-2 gap-4">
                {list.map((item) => {
                  const isSelected = selectedIds.has(item.id)
                  return (
                    <div
                      key={item.id}
                      className={`overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-md ${isSelected ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'}`}
                    >
                      {/* 图片区 */}
                      <div className="relative">
                        <div
                          className="flex h-[200px] cursor-pointer items-center justify-center bg-slate-100"
                          onClick={() => void viewDetail(item.id)}
                        >
                          <MaterialImage image={item.images[0]} alt={item.name} />
                        </div>
                        {/* 复选框 */}
                        <button
                          className={`absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white shadow-sm transition-colors ${isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-slate-400'}`}
                          onClick={() => toggleSelected(item)}
                        >
                          {isSelected && <CheckIcon size={14} />}
                        </button>
                        {/* 状态徽标 */}
                        {item.status === 'DISABLED' && (
                          <span className="absolute right-3 top-3 rounded-full bg-slate-900/70 px-2 py-0.5 text-xs text-white">停用</span>
                        )}
                      </div>
                      {/* 信息区 */}
                      <div className="space-y-2 p-4">
                        {/* 第一行：Item No. */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-[#123c5a]">{item.itemNo}</span>
                          <span className="text-xs text-slate-400">{item.category.name}</span>
                        </div>
                        {/* 名称 */}
                        <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                        {/* 字段网格 */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          {item.composition && (
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">成分</span>
                              <span className="font-medium text-slate-700">{item.composition}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">克重</span>
                            <span className="font-medium text-slate-700">{item.weight || '-'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">幅宽</span>
                            <span className="font-medium text-slate-700">{item.width || '-'}</span>
                          </div>
                          {item.factoryNo && (
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">厂编</span>
                              <span className="font-medium text-slate-700">{item.factoryNo}</span>
                            </div>
                          )}
                        </div>
                        {/* 第二行横向字段 */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {admin && item.provider && (
                            <span className="text-slate-500">供应商: {item.provider.name}</span>
                          )}
                          {admin && item.cost !== undefined && item.cost !== null && (
                            <span className="text-slate-500">成本: ¥{Number(item.cost).toFixed(2)}</span>
                          )}
                          {item.specification && (
                            <span className="text-slate-500">规格: {item.specification}</span>
                          )}
                          {item.unit && <span className="text-slate-500">单位: {item.unit}</span>}
                        </div>
                        {/* 操作按钮 */}
                        <div className="flex items-center gap-2 pt-1.5">
                          <button className="flex items-center gap-1 rounded-lg bg-[#123c5a] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90" onClick={() => void viewDetail(item.id)}>
                            <Eye size={13} /> 详情
                          </button>
                          <button className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={item.status !== 'ACTIVE'} onClick={() => nav(`/samples/choose?item=${item.itemNo}`)}>
                            <Plus size={13} /> 选样
                          </button>
                          <button className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={item.status !== 'ACTIVE'} onClick={() => nav(`/print/labels?materialIds=${item.id}`)}>
                            <Printer size={13} /> 标签
                          </button>
                          <button
                            className={`ml-auto flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${item.status !== 'ACTIVE' && !isSelected ? 'cursor-not-allowed opacity-40' : ''} ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                            onClick={() => {
                              if (isSelected) {
                                removeSelected(item.id)
                              } else {
                                addToSelected(item)
                              }
                            }}
                          >
                            {isSelected ? <X size={13} /> : <Plus size={13} />}
                            {isSelected ? '取消' : '选样'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* 分页 */}
              {total > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <span className="text-slate-500">共 {total} 条</span>
                  <div className="flex items-center gap-1">
                    <button
                      className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={page <= 1}
                      onClick={() => void search(page - 1)}
                    >上一页</button>
                    <span className="px-2 text-slate-600">第 {page} / {Math.ceil(total / PAGE_SIZE)} 页</span>
                    <button
                      className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={page >= Math.ceil(total / PAGE_SIZE)}
                      onClick={() => void search(page + 1)}
                    >下一页</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 已选清单侧边栏 */}
        {showSelectedPanel && selectedItems.length > 0 && (
          <div className="w-[320px] shrink-0">
            <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <ShoppingCart size={16} /> 已选清单 ({selectedItems.length})
                </h3>
                <button className="text-xs text-slate-400 hover:text-red-500" onClick={clearAllSelected}>清空</button>
              </div>

              <div className="max-h-[400px] overflow-y-auto p-3">
                {selectedItems.map((item) => (
                  <div key={item.material.id} className="mb-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#123c5a]">{item.material.itemNo}</span>
                      <button className="text-slate-400 hover:text-red-500" onClick={() => removeSelected(item.material.id)}>
                        <X size={14} />
                      </button>
                    </div>
                    <p className="mb-1.5 text-xs text-slate-600">{item.material.name}</p>
                    <div className="mb-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                      {item.material.composition && <span>成分: {item.material.composition}</span>}
                      {item.material.weight && <span>克重: {item.material.weight}</span>}
                      {item.material.width && <span>幅宽: {item.material.width}</span>}
                      {item.material.factoryNo && <span>厂编: {item.material.factoryNo}</span>}
                      {admin && item.material.cost !== undefined && item.material.cost !== null && (
                        <span>¥{Number(item.material.cost).toFixed(2)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">数量:</span>
                      <div className="flex items-center gap-1">
                        <button
                          className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                          onClick={() => updateQuantity(item.material.id, item.quantity - 1)}
                        ><Minus size={12} /></button>
                        <span className="min-w-[24px] text-center text-xs font-medium">{item.quantity}</span>
                        <button
                          className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                          onClick={() => updateQuantity(item.material.id, item.quantity + 1)}
                        ><Plus size={12} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 p-4">
                <label className="mb-1.5 block text-xs text-slate-500">选择客户</label>
                <select
                  className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  {customers.length ? customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                  )) : <option>暂无可用客户</option>}
                </select>
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#123c5a] py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  disabled={saving || !selectedCustomerId || !selectedItems.length}
                  onClick={() => void saveSampleChoose()}
                >
                  {saving ? '保存中…' : <><ChevronRight size={16} /> 生成选样单</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    ) : (
      <div className="flex items-start gap-6">
        {/* 左栏：上传 + 识别特征 */}
        <div className="w-[440px] shrink-0 space-y-5">
          {/* 上传卡 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">上传面料图片</h3>
              <span className="text-xs text-slate-400">支持 JPG / PNG · ≤10MB</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
            {imgError && <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{imgError}</p>}

            {imgStage === 'idle' ? (
              <div
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition-colors ${dragging ? 'border-[#123c5a] bg-blue-50' : 'border-blue-200 bg-slate-50 hover:border-[#123c5a]'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f) }}
              >
                <Upload size={36} className="text-[#123c5a]" />
                <p className="text-sm font-medium text-slate-700">拖拽图片到此处，或点击上传</p>
                <p className="text-xs text-slate-400">也可按 Ctrl+V 粘贴</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl">
                  <img className="h-[200px] w-full object-cover" src={imgPreview} alt="面料" />
                  {imgStage === 'uploading' && (
                    <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-white">
                      <Loader2 size={12} className="animate-spin" /> 上传中 {Math.round(uploadProgress)}%
                    </div>
                  )}
                  {imgStage === 'analyzing' && (
                    <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#123c5a] px-2.5 py-1 text-xs font-semibold text-white">
                      <Sparkles size={12} /> AI 分析中…
                    </div>
                  )}
                  {imgStage === 'done' && (
                    <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#123c5a] px-2.5 py-1 text-xs font-semibold text-white">
                      <Sparkles size={12} /> AI 识别完成
                    </div>
                  )}
                </div>
                {imgStage === 'uploading' && (
                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-[#123c5a] transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <p className="text-xs text-slate-500">正在上传 {imgFile?.name}</p>
                  </div>
                )}
                {imgStage === 'analyzing' && <p className="text-xs text-slate-500">正在分析颜色、纹理、成分…</p>}
                {imgStage !== 'uploading' && (
                  <div className="flex items-center justify-between">
                    <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50" onClick={resetImage}>
                      <RefreshCw size={14} /> 重新上传
                    </button>
                    {imgStage === 'done' && <span className="text-xs text-slate-400">拖拽、点击或粘贴可替换</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI 识别特征卡 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">AI 识别特征</h3>
              <span className="text-xs text-slate-400">{imgStage === 'done' ? '点击可修正' : imgStage === 'analyzing' ? '识别中…' : '等待识别'}</span>
            </div>
            {imgStage === 'analyzing' ? (
              <div className="space-y-2">
                {FEATURE_ROWS.map((row) => (
                  <div key={row.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-3">
                    <div className="h-3 w-9 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : imgStage === 'done' && features ? (
              <div className="space-y-2">
                {FEATURE_ROWS.map((row) => (
                  <div key={row.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-3">
                    <span className="text-[13px] text-slate-500">{row.label}</span>
                    <input
                      className="bg-transparent text-right text-[13px] font-medium text-slate-800 focus:outline-none focus:text-[#123c5a]"
                      defaultValue={features[row.key]}
                      onChange={(e) => setFeatures({ ...features, [row.key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 py-9">
                <Clock size={26} className="text-slate-300" />
                <p className="text-[13px] text-slate-400">上传完成后自动开始 AI 识别</p>
              </div>
            )}
          </div>
        </div>

        {/* 右栏：匹配结果 */}
        <div className="flex-1 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-slate-800">匹配面料</h3>
              <span className="text-[13px] text-slate-500">共 {matches.length} 项</span>
            </div>
            {matches.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600">
                相似度从高到低
              </div>
            )}
          </div>

          {imgStage === 'error' ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50/50 py-20">
              <ImageIcon size={32} className="text-red-400" />
              <p className="text-sm text-red-600">{imgError || 'AI 识别失败，请重试'}</p>
              <button
                className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                onClick={() => imgFile && void runImageSearch(imgFile)}
              >重新识别</button>
            </div>
          ) : imgStage !== 'done' ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-20">
              <ImageIcon size={32} className="text-slate-300" />
              <p className="text-sm text-slate-400">{imgStage === 'idle' ? '上传图片后查看匹配结果' : imgStage === 'uploading' ? '上传中…' : 'AI 正在识别，请稍候'}</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">未找到相似面料，可调整识别特征后重试。</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {matches.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex h-[170px] items-center justify-center bg-slate-100">
                    <MaterialImage image={item.images[0]} alt={item.name} onClick={() => void viewDetail(item.id)} />
                  </div>
                  <div className="space-y-2.5 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-[#123c5a]">{item.itemNo}</span>
                      <span className="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ backgroundColor: simColor(item.similarity) }}>{item.similarity}% 匹配</span>
                    </div>
                    <p className="text-[15px] font-bold text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.category.name} · {item.status === 'ACTIVE' ? '启用' : '停用'}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <button className="flex items-center gap-1.5 rounded-lg bg-[#123c5a] px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90" onClick={() => void viewDetail(item.id)}>
                        <Eye size={14} /> 查看详情
                      </button>
                      <button title="加入选样" disabled={item.status !== 'ACTIVE'} className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40" onClick={() => nav(`/samples/choose?item=${item.itemNo}`)}>
                        <Plus size={16} />
                      </button>
                      <button title="标签打印" disabled={item.status !== 'ACTIVE'} className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40" onClick={() => nav(`/print/labels?materialIds=${item.id}`)}>
                        <Printer size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}

    {detail && <div className="fixed inset-0 z-40 overflow-auto bg-slate-900/40 p-6"><div className="mx-auto max-w-3xl rounded-2xl bg-white p-6"><div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">{detail.itemNo} 详情</h2><button onClick={() => setDetail(null)}>关闭</button></div><div className="mb-4 flex min-h-40 items-center justify-center bg-slate-50"><MaterialImage image={detail.images[0]} alt="面料大图" detail /></div><div className="grid grid-cols-2 gap-3 text-sm">{[['名称', detail.name], ['类别', detail.category.name], ['状态', detail.status === 'ACTIVE' ? '启用' : '停用'], ['规格', detail.specification], ['成分', detail.composition], ['克重', detail.weight], ['幅宽', detail.width], ['颜色', detail.color], ['工厂编号', detail.factoryNo], ['单位', detail.unit], ...(admin ? [['供应商', detail.provider?.name], ['成本', detail.cost === undefined ? undefined : `¥${detail.cost}`]] : [])].map(([label, value]) => <p key={label}><b>{label}：</b>{value || '-'}</p>)}</div><div className="mt-5 flex gap-3"><button className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={detail.status !== 'ACTIVE'} onClick={() => nav(`/samples/choose?item=${detail.itemNo}`)}>加入选样</button><button className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50" disabled={detail.status !== 'ACTIVE'} onClick={() => nav(`/print/labels?materialIds=${detail.id}`)}>标签打印</button></div></div></div>}
  </div>
}

// 简易勾选图标（避免额外依赖）
function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}