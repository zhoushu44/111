import { useCallback, useEffect, useRef, useState } from 'react'
import DataTable from '@/components/DataTable'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'

type Row = Record<string, unknown> & { id: string; status?: string }

export interface Field {
  key: string
  label: string
  type?: 'select'
  options?: { value: string; label: string }[]
  display?: (value: unknown) => string
  transform?: (value: string) => unknown
  readOnlyOnEdit?: boolean
  inputType?: string
  createOnly?: boolean
}

interface Props {
  title: string
  description: string
  endpoint: string
  fields: Field[]
  readOnly?: boolean
  /** 当后端直接返回数组而非 { list, total } 时设为 true */
  directArray?: boolean
}

export default function SimpleListPage({ title, description, endpoint, fields, readOnly, directArray }: Props) {
  const [list, setList] = useState<Row[]>([])
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  // 搜索、分页、状态筛选
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const pageSize = 20
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (p = page, kw = keyword, st = statusFilter) => {
    setLoading(true)
    setMessage('')
    try {
      if (directArray) {
        // 后端直接返回数组（如 /system/roles），不支持分页和搜索
        const result = await api.get<Row[]>(endpoint)
        setList(result)
        setTotal(result.length)
        setPage(1)
      } else {
        const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) })
        if (kw) params.set('keyword', kw)
        if (st) params.set('status', st)
        const result = await api.get<{ list: Row[]; total: number }>(`${endpoint}?${params}`)
        setList(result.list)
        setTotal(result.total)
        setPage(p)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [endpoint, page, keyword, statusFilter, directArray])

  useEffect(() => { void load(1) }, [endpoint])

  // 防抖搜索（300ms）
  const handleKeywordChange = (value: string) => {
    setKeyword(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void load(1, value, statusFilter) }, 300)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    void load(1, keyword, value)
  }

  const handleRefresh = () => { void load(page, keyword, statusFilter) }

  const save = async () => {
    if (!draft) return
    try {
      if (editing) await api.patch(`${endpoint}/${editing.id}`, draft)
      else await api.post(endpoint, draft)
      setDraft(null)
      setEditing(null)
      void load(page, keyword, statusFilter)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    }
  }

  const toggle = async (row: Row) => {
    try {
      await api.post(`${endpoint}/${row.id}/toggle`, { status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
      void load(page, keyword, statusFilter)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <PageHeader title={title} description={description} action={readOnly ? undefined : '新增'} onAction={() => { setEditing(null); setDraft({}) }} />

      {/* 搜索/筛选/刷新栏（directArray 模式下不支持搜索和状态筛选） */}
      {!directArray && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <input
            className="h-10 min-w-60 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]"
            placeholder="输入关键字搜索"
            value={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
          />
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1e8a7a]"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="ACTIVE">启用</option>
            <option value="DISABLED">停用</option>
          </select>
          <button
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={handleRefresh}
          >
            刷新
          </button>
        </div>
      )}
      {directArray && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <button
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={handleRefresh}
          >
            刷新
          </button>
        </div>
      )}

      {/* 加载和错误提示 */}
      {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
      {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}

      <DataTable data={list} columns={[
        ...fields.map((field) => ({
          title: field.label,
          render: (row: Row) => {
            const raw = row[field.key]
            if (field.display) return field.display(raw)
            if (field.type === 'select' && field.options) {
              const opt = field.options.find((o) => String(o.value) === String(raw))
              return opt?.label ?? String(raw ?? '')
            }
            return String(raw ?? '')
          },
        })),
        ...(!readOnly ? [{
          title: '操作',
          render: (row: Row) => (
            <div className="flex gap-2">
              <button onClick={() => { setEditing(row); setDraft(Object.fromEntries(fields.map((field) => [field.key, String(row[field.key] ?? '')]))) }}>编辑</button>
              {row.status && <button onClick={() => void toggle(row)}>{row.status === 'ACTIVE' ? '停用' : '启用'}</button>}
            </div>
          ),
        }] : []),
      ]} />

      {/* 分页（directArray 模式下不显示） */}
      {!directArray && (
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-slate-500">第 {page} 页 / 共 {totalPages} 页（{total} 条）</span>
          <button
            className="rounded-lg border border-slate-200 px-3 py-1 text-sm disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => void load(page - 1, keyword, statusFilter)}
          >上一页</button>
          <button
            className="rounded-lg border border-slate-200 px-3 py-1 text-sm disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => void load(page + 1, keyword, statusFilter)}
          >下一页</button>
        </div>
      )}

      {/* 编辑/新增弹窗 */}
      {draft && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 p-10">
          <div className="mx-auto max-w-xl rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-lg font-bold">{editing ? '编辑' : '新增'}</h2>
            {fields.filter((field) => field.key !== 'status').map((field) => {
              // status 字段使用下拉选择
              if (field.key === 'status') return null
              return (
                <label key={field.key} className="mb-3 block">
                  <span className="text-sm font-medium text-slate-700">{field.label}</span>
                  {field.type === 'select' && field.options ? (
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                      value={draft[field.key] ?? ''}
                      onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                    >
                      {field.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  ) : (
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                      type={field.inputType ?? 'text'}
                      value={draft[field.key] ?? ''}
                      onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                    />
                  )}
                </label>
              )
            })}
            {/* status 字段独立使用下拉 */}
            {fields.some((f) => f.key === 'status') && (
              <label className="mb-3 block">
                <span className="text-sm font-medium text-slate-700">状态</span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
                  value={draft['status'] ?? 'ACTIVE'}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                >
                  <option value="ACTIVE">启用</option>
                  <option value="DISABLED">停用</option>
                </select>
              </label>
            )}
            <div className="mt-4 flex gap-3">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm" onClick={() => setDraft(null)}>取消</button>
              <button className="rounded-lg bg-[#123c5a] px-4 py-2 text-sm text-white" onClick={() => void save()}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
