import { useEffect, useRef, useState } from 'react'
import { Plus, Printer, Search, Image as ImageIcon, Upload, RefreshCw, Sparkles, Loader2, Clock, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api, assetUrl } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type M = { id: string; itemNo: string; name: string; specification?: string | null; composition?: string | null; construction?: string | null; width?: string | null; weight?: string | null; color?: string | null; unit?: string | null; remark?: string | null; labelRemark?: string | null; status: 'ACTIVE' | 'DISABLED'; images: { url: string }[]; category: { name: string }; provider?: { name: string } | null; cost?: number; stocks?: { quantity: number }[] }
type Option = { id: string; name: string }

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

  useEffect(() => {
    const requests: Promise<void>[] = [api.get<{ list: Option[] }>('/categories?pageSize=100').then((result) => setCategories(result.list))]
    if (admin) requests.push(api.get<{ list: Option[] }>('/providers?pageSize=100').then((result) => setProviders(result.list)))
    void Promise.all(requests).catch((error: Error) => setMessage(error.message))
  }, [admin])

  // 粘贴上传
  useEffect(() => {
    if (mode !== 'image') return
    const onPaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0]
      if (file && file.type.startsWith('image/')) { e.preventDefault(); void handleFile(file) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [mode])

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
    if (imgPreview) URL.revokeObjectURL(imgPreview)
    setImgFile(null); setImgPreview(''); setImgStage('idle'); setUploadProgress(0); setFeatures(null); setMatches([]); setImgError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFile = (file: File) => {
    if (!file.type.match(/image\/(jpe?g|png)/i)) { setImgError('仅支持 JPG / PNG 格式'); return }
    if (file.size > 10 * 1024 * 1024) { setImgError('图片大小不能超过 10MB'); return }
    setImgError('')
    if (imgPreview) URL.revokeObjectURL(imgPreview)
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
    void runImageSearch(file)
  }

  const runImageSearch = async (file: File) => {
    setImgStage('uploading'); setUploadProgress(0); setFeatures(null); setMatches([]); setImgError('')
    // 模拟上传进度（真实场景由后端返回或 xhr 进度）
    const timer = setInterval(() => setUploadProgress((p) => Math.min(p + Math.random() * 18, 92)), 160)
    try {
      const form = new FormData()
      form.append('file', file)
      // 上传完成 → 进入 AI 分析
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
  }

  const tabBase = 'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors'
  const tabActive = 'bg-[#123c5a] text-white'
  const tabInactive = 'text-slate-500 hover:bg-slate-50'

  return <div>
    <PageHeader title="面料查询" description="按关键字、类别、启用状态查询，或上传面料图片由 AI 智能识别匹配。" />
    {/* 模式切换 */}
    <div className="mb-4 flex gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5">
      <button className={`${tabBase} ${mode === 'text' ? tabActive : tabInactive}`} onClick={() => setMode('text')}>
        <Search size={16} /> 文字查询
      </button>
      <button className={`${tabBase} ${mode === 'image' ? tabActive : tabInactive}`} onClick={() => setMode('image')}>
        <Sparkles size={16} /> 图片智能查询
      </button>
    </div>

    {mode === 'text' ? (<>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.keyword} onChange={(event) => setQuery({ ...query, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && void search()} placeholder="Item No.、名称或规格" />
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.categoryId} onChange={(event) => setQuery({ ...query, categoryId: event.target.value })}><option value="">全部类别</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.status} onChange={(event) => setQuery({ ...query, status: event.target.value })}><option value="">全部启用状态</option><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select>
        {admin && <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm" value={query.providerId} onChange={(event) => setQuery({ ...query, providerId: event.target.value })}><option value="">全部供应商</option>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        <button className="rounded-lg bg-[#123c5a] px-5 text-sm font-semibold text-white" disabled={loading} onClick={() => void search()}>{loading ? '查询中…' : '查询'}</button>
      </div>
      {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
      {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}
      {!loading && searched && list.length === 0 && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">未找到匹配的面料记录。</p>}
      {!loading && !searched && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">请输入条件后点击查询。</p>}
      {list.length > 0 && (<>
        <p className="mb-3 text-sm text-slate-500">共 {total} 项面料</p>
        <DataTable data={list} total={total} page={page} pageSize={PAGE_SIZE} onPageChange={(p) => void search(p)} columns={[{ title: '图片', render: (row) => row.images[0] ? <img className="h-12 w-12 cursor-pointer object-cover" src={assetUrl(row.images[0].url)} alt="面料" onClick={() => void viewDetail(row.id)} /> : '-' }, { title: 'Item No.', render: (row) => row.itemNo }, { title: '名称', render: (row) => row.name }, { title: '类别', render: (row) => row.category.name }, { title: '状态', render: (row) => row.status === 'ACTIVE' ? '启用' : '停用' }, ...(admin ? [{ title: '供应商 / 成本', render: (row: M) => `${row.provider?.name ?? '-'} / ¥${row.cost ?? '-'}` }] : []), { title: '操作', render: (row) => <div className="flex gap-2"><button onClick={() => void viewDetail(row.id)}>查看详情</button><button title="加入选样" disabled={row.status !== 'ACTIVE'} onClick={() => nav(`/samples/choose?item=${row.itemNo}`)}><Plus size={16} /></button><button title="标签打印" disabled={row.status !== 'ACTIVE'} onClick={() => nav(`/print/labels?materialIds=${row.id}`)}><Printer size={16} /></button></div> }]} />
      </>)}
    </>) : (
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
              // 空状态：拖拽上传区
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
              // 已有图片：展示 + 状态浮标
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
              // 骨架屏
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
              // 空状态
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
              >
                重新识别
              </button>
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
                    {item.images[0] ? <img className="h-full w-full cursor-pointer object-cover" src={assetUrl(item.images[0].url)} alt={item.name} onClick={() => void viewDetail(item.id)} /> : <ImageIcon size={32} className="text-slate-300" />}
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

    {detail && <div className="fixed inset-0 z-40 overflow-auto bg-slate-900/40 p-6"><div className="mx-auto max-w-3xl rounded-2xl bg-white p-6"><div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">{detail.itemNo} 详情</h2><button onClick={() => setDetail(null)}>关闭</button></div>{detail.images[0] && <img className="mb-4 max-h-96 w-full object-contain" src={assetUrl(detail.images[0].url)} alt="面料大图" />}<div className="grid grid-cols-2 gap-3 text-sm">{[['名称', detail.name], ['类别', detail.category.name], ['状态', detail.status === 'ACTIVE' ? '启用' : '停用'], ['规格', detail.specification], ['颜色', detail.color], ['单位', detail.unit], ...(admin ? [['供应商', detail.provider?.name], ['成本', detail.cost === undefined ? undefined : `¥${detail.cost}`]] : [])].map(([label, value]) => <p key={label}><b>{label}：</b>{value || '-'}</p>)}</div><div className="mt-5 flex gap-3"><button className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={detail.status !== 'ACTIVE'} onClick={() => nav(`/samples/choose?item=${detail.itemNo}`)}>加入选样</button><button className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-50" disabled={detail.status !== 'ACTIVE'} onClick={() => nav(`/print/labels?materialIds=${detail.id}`)}>标签打印</button></div></div></div>}
  </div>
}
