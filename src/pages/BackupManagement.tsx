import { useCallback, useEffect, useState } from 'react'
import {
  ArchiveRestore, Database, FileText, Download, Trash2, Play, Loader2, RefreshCw,
  CheckCircle2, AlertCircle, Clock, ShieldAlert, Lock, Unlock, HardDrive, X,
  Cloud, CloudOff, CloudUpload, Settings2, Eye, EyeOff, Plug, Save,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import DataTable from '@/components/DataTable'
import { api, downloadBlob } from '@/lib/api'

type BackupType = 'FULL' | 'DATABASE' | 'MANIFEST'
type BackupStatus = 'RUNNING' | 'SUCCESS' | 'FAILED'
type BackupTrigger = 'AUTO' | 'MANUAL'

interface BackupRecord {
  id: string
  type: BackupType
  trigger: BackupTrigger
  status: BackupStatus
  fileName: string
  fileSize: number
  encrypted: boolean
  tableStats: Record<string, number> | null
  errorMessage: string | null
  storageKey: string | null
  uploaded: boolean
  uploadError: string | null
  protected: boolean
  startedAt: string
  finishedAt: string | null
}

interface DiskUsage { fileCount: number; totalBytes: number }

interface ListResult {
  list: BackupRecord[]
  total: number
  page: number
  pageSize: number
  disk: DiskUsage
}

interface VerifyRow { table: string; backupCount: number; currentCount: number; diff: number }
interface VerifyResult { backupAt: string; currentAt: string; comparison: VerifyRow[]; blocked: boolean }
interface RestoreGuide { backupAt: string; fileName: string; encrypted: boolean; tableStats: Record<string, number> | null; steps: string }

// 对象存储（腾讯云 COS）配置
interface StorageConfig {
  enabled: boolean
  region: string
  bucket: string
  maskedSecretId: string
  maskedSecretKey: string
  domain: string
  configured: boolean
}
interface StorageTestResult { ok: boolean; message: string }

const TYPE_LABEL: Record<BackupType, string> = { FULL: '完整备份', DATABASE: '数据库备份', MANIFEST: '图片清单' }
const STATUS_LABEL: Record<BackupStatus, string> = { RUNNING: '执行中', SUCCESS: '成功', FAILED: '失败' }
const TRIGGER_LABEL: Record<BackupTrigger, string> = { AUTO: '自动', MANUAL: '手动' }

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const formatTime = (value: string | null) => {
  if (!value) return '—'
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function BackupManagement() {
  const [data, setData] = useState<ListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [typeFilter, setTypeFilter] = useState<'' | BackupType>('')
  const [statusFilter, setStatusFilter] = useState<'' | BackupStatus>('')
  const [page, setPage] = useState(1)

  // 恢复/比对对话框
  const [verifyTarget, setVerifyTarget] = useState<BackupRecord | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [guide, setGuide] = useState<RestoreGuide | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [showGuide, setShowGuide] = useState(false)

  // 对象存储配置
  const [showStorage, setShowStorage] = useState(false)
  const [storage, setStorage] = useState<StorageConfig | null>(null)
  const [storageLoading, setStorageLoading] = useState(false)
  const [storageSaving, setStorageSaving] = useState(false)
  const [storageTesting, setStorageTesting] = useState(false)
  const [storageForm, setStorageForm] = useState({ enabled: false, region: '', bucket: '', secretId: '', secretKey: '', domain: '' })
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [storageTest, setStorageTest] = useState<StorageTestResult | null>(null)
  const [uploadingId, setUploadingId] = useState('')

  // 自动备份定时配置
  const [schedule, setSchedule] = useState<{ enabled: boolean; time: string }>({ enabled: false, time: '03:00' })
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (typeFilter) query.set('type', typeFilter)
      if (statusFilter) query.set('status', statusFilter)
      const result = await api.get<ListResult>(`/system/backups?${query.toString()}`)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally { setLoading(false) }
  }, [page, typeFilter, statusFilter])

  useEffect(() => { void load() }, [load])

  // 单独加载存储配置状态，用于列表展示云端列与工具栏按钮态
  useEffect(() => {
    void api.get<StorageConfig>('/system/backups/storage/config')
      .then(setStorage)
      .catch(() => setStorage(null))
  }, [])

  // 加载自动备份定时配置
  useEffect(() => {
    void api.get<{ enabled: boolean; time: string }>('/system/backups/schedule')
      .then((result) => setSchedule({ enabled: result.enabled, time: result.time }))
      .catch(() => undefined)
  }, [])

  const handleScheduleSave = async () => {
    setScheduleSaving(true)
    try {
      const saved = await api.put<{ enabled: boolean; time: string }>('/system/backups/schedule', { enabled: schedule.enabled, time: schedule.time })
      setSchedule({ enabled: saved.enabled, time: saved.time })
      setShowSchedule(false)
      notify(saved.enabled ? `自动备份已开启：每天 ${saved.time} 执行` : '自动备份已关闭')
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', true)
    } finally { setScheduleSaving(false) }
  }

  const notify = (text: string, isError = false) => {
    if (isError) { setError(text); setMessage('') } else { setMessage(text); setError('') }
    window.setTimeout(() => { setMessage(''); setError('') }, 5000)
  }

  const hasRunning = Boolean(data?.list.some((item) => item.status === 'RUNNING'))

  const handleRun = async (type: BackupType) => {
    setBusy(true)
    try {
      await api.post('/system/backups/run', { type })
      notify(`${TYPE_LABEL[type]}执行完成`)
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : '备份失败', true)
      await load()
    } finally { setBusy(false) }
  }

  const handleDownload = async (record: BackupRecord) => {
    try {
      if (record.encrypted && !window.confirm('该备份已加密且包含敏感数据（含明文 AI 密钥的数据库快照），请妥善保管。确认下载？')) return
      const blob = await api.download(`/system/backups/${record.id}/download`)
      downloadBlob(blob, record.fileName)
      notify('下载已开始')
    } catch (err) {
      notify(err instanceof Error ? err.message : '下载失败', true)
    }
  }

  const handleDelete = async (record: BackupRecord) => {
    if (!window.confirm(`确认删除备份「${record.fileName}」？删除后不可恢复。`)) return
    try {
      await api.delete(`/system/backups/${record.id}`)
      notify('已删除')
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : '删除失败', true)
    }
  }

  const handleCleanup = async () => {
    setBusy(true)
    try {
      const result = await api.post<{ removedCount: number }>('/system/backups/cleanup')
      notify(`已清理 ${result.removedCount} 个过期备份`)
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : '清理失败', true)
    } finally { setBusy(false) }
  }

  // 重新上传本地已存在的备份到对象存储
  const handleUpload = async (record: BackupRecord) => {
    setUploadingId(record.id)
    try {
      await api.post(`/system/backups/${record.id}/upload`)
      notify('已上传到对象存储')
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : '上传失败', true)
    } finally { setUploadingId('') }
  }

  // 打开对象存储配置：拉取已保存配置（密钥为脱敏占位）
  const openStorage = async () => {
    setShowStorage(true)
    setStorageTest(null)
    setShowSecretKey(false)
    setStorageLoading(true)
    try {
      const cfg = await api.get<StorageConfig>('/system/backups/storage/config')
      setStorage(cfg)
      setStorageForm({
        enabled: cfg.enabled,
        region: cfg.region,
        bucket: cfg.bucket,
        secretId: cfg.maskedSecretId,
        secretKey: cfg.maskedSecretKey,
        domain: cfg.domain,
      })
    } catch (err) {
      notify(err instanceof Error ? err.message : '读取对象存储配置失败', true)
    } finally { setStorageLoading(false) }
  }

  const handleStorageTest = async () => {
    setStorageTesting(true)
    setStorageTest(null)
    try {
      const result = await api.post<StorageTestResult>('/system/backups/storage/test', storageForm)
      setStorageTest(result)
    } catch (err) {
      setStorageTest({ ok: false, message: err instanceof Error ? err.message : '测试失败' })
    } finally { setStorageTesting(false) }
  }

  const handleStorageSave = async () => {
    setStorageSaving(true)
    try {
      await api.put('/system/backups/storage/config', storageForm)
      notify('对象存储配置已保存')
      await openStorage()
      await load()
    } catch (err) {
      notify(err instanceof Error ? err.message : '保存失败', true)
    } finally { setStorageSaving(false) }
  }

  const openVerify = async (record: BackupRecord) => {
    setVerifyTarget(record)
    setVerifyResult(null)
    setGuide(null)
    setConfirmText('')
    setShowGuide(false)
    setVerifyLoading(true)
    try {
      const result = await api.get<VerifyResult>(`/system/backups/${record.id}/verify`)
      setVerifyResult(result)
    } catch (err) {
      notify(err instanceof Error ? err.message : '比对失败', true)
    } finally { setVerifyLoading(false) }
  }

  const handleShowGuide = async () => {
    if (!verifyTarget) return
    try {
      const result = await api.get<RestoreGuide>(`/system/backups/${verifyTarget.id}/restore-guide`)
      setGuide(result)
      setShowGuide(true)
    } catch (err) {
      notify(err instanceof Error ? err.message : '获取恢复指引失败', true)
    }
  }

  const columns = [
    {
      title: '备份时间',
      render: (row: BackupRecord) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-700">{formatTime(row.startedAt)}</span>
          <span className="text-xs text-slate-400">来源：{TRIGGER_LABEL[row.trigger]}</span>
        </div>
      ),
    },
    {
      title: '类型',
      render: (row: BackupRecord) => (
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          {row.type === 'DATABASE' ? <Database size={14} /> : <FileText size={14} />}
          {TYPE_LABEL[row.type]}
        </span>
      ),
    },
    {
      title: '文件',
      render: (row: BackupRecord) => (
        <div className="flex flex-col">
          <span className="text-xs text-slate-500 break-all">{row.fileName}</span>
          <span className="text-xs text-slate-400">{formatSize(row.fileSize)}</span>
        </div>
      ),
    },
    {
      title: '加密',
      render: (row: BackupRecord) => row.encrypted
        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><Lock size={12} /> 已加密</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"><Unlock size={12} /> 未加密</span>,
    },
    {
      title: '状态',
      render: (row: BackupRecord) => {
        if (row.status === 'SUCCESS') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={12} /> 成功</span>
        if (row.status === 'RUNNING') return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"><Loader2 size={12} className="animate-spin" /> 执行中</span>
        return (
          <span className="group relative inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
            <AlertCircle size={12} /> 失败
            {row.errorMessage && (
              <span className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-72 rounded-lg bg-slate-800 p-2 text-xs font-normal text-white group-hover:block">
                {row.errorMessage}
              </span>
            )}
          </span>
        )
      },
    },
    {
      title: '云端',
      render: (row: BackupRecord) => {
        // 未成功或未启用对象存储时不展示上传动作
        if (row.status !== 'SUCCESS') return <span className="text-xs text-slate-300">—</span>
        if (row.uploaded) {
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700" title={row.storageKey ?? ''}>
              <Cloud size={12} /> 已上传
            </span>
          )
        }
        if (storage?.enabled) {
          return (
            <button
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              disabled={uploadingId === row.id}
              title={row.uploadError ? `上次上传失败：${row.uploadError}` : '上传到对象存储'}
              onClick={() => void handleUpload(row)}
            >
              {uploadingId === row.id ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
              {row.uploadError ? '重传' : '上传'}
            </button>
          )
        }
        return <span className="inline-flex items-center gap-1 text-xs text-slate-400"><CloudOff size={12} /> 未启用</span>
      },
    },
    {
      title: '操作',
      className: 'whitespace-nowrap',
      render: (row: BackupRecord) => (
        <div className="flex items-center gap-2">
          {(row.type === 'DATABASE' || row.type === 'FULL') && row.status === 'SUCCESS' && (
            <button className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-[#123c5a] hover:bg-slate-50" onClick={() => void openVerify(row)}>
              <ArchiveRestore size={13} /> 恢复
            </button>
          )}
          <button
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            disabled={row.status !== 'SUCCESS'}
            onClick={() => void handleDownload(row)}
          >
            <Download size={13} /> 下载
          </button>
          <button
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            disabled={row.protected || row.status === 'RUNNING'}
            title={row.protected ? '手动触发的备份受保护，不可删除' : undefined}
            onClick={() => void handleDelete(row)}
          >
            <Trash2 size={13} /> 删除
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="备份管理" description="查看备份记录、手动触发备份，并在需要时按备份时间点恢复数据。" />

      {/* 概览条 */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <HardDrive size={18} className="text-slate-400" />
          <div>
            <div className="text-xs text-slate-400">备份文件占用</div>
            <div className="text-sm font-semibold text-slate-700">{data ? formatSize(data.disk.totalBytes) : '—'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <FileText size={18} className="text-slate-400" />
          <div>
            <div className="text-xs text-slate-400">备份文件数</div>
            <div className="text-sm font-semibold text-slate-700">{data ? data.disk.fileCount : '—'}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <Clock size={18} className="text-slate-400" />
          <div>
            <div className="text-xs text-slate-400">保留策略</div>
            <div className="text-sm font-semibold text-slate-700">本地保留 7 天</div>
          </div>
        </div>
      </div>

      {message && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {/* 工具栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <button
          className="flex items-center gap-2 rounded-lg bg-[#123c5a] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          disabled={busy || hasRunning}
          onClick={() => void handleRun('FULL')}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          立即备份（数据库 + 图片清单）
        </button>
        <button
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => void handleCleanup()}
        >
          <Trash2 size={16} /> 清理过期备份
        </button>
        <button
          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${
            schedule.enabled ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          onClick={() => setShowSchedule(true)}
        >
          <Clock size={16} /> 自动备份{schedule.enabled ? ` · 每天 ${schedule.time}` : ''}
        </button>
        <button
          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${
            storage?.enabled && storage.configured
              ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          onClick={() => void openStorage()}
        >
          {storage?.enabled && storage.configured ? <Cloud size={16} /> : <CloudOff size={16} />}
          对象存储
        </button>
        <button
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          onClick={() => void load()}
        >
          <RefreshCw size={16} /> 刷新
        </button>

        <div className="ml-auto flex items-center gap-2">
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 outline-none focus:border-[#123c5a]"
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as '' | BackupType); setPage(1) }}
          >
            <option value="">全部类型</option>
            <option value="FULL">完整备份</option>
            <option value="DATABASE">数据库备份</option>
            <option value="MANIFEST">图片清单</option>
          </select>
          <select
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 outline-none focus:border-[#123c5a]"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as '' | BackupStatus); setPage(1) }}
          >
            <option value="">全部状态</option>
            <option value="SUCCESS">成功</option>
            <option value="FAILED">失败</option>
            <option value="RUNNING">执行中</option>
          </select>
        </div>
      </div>

      {hasRunning && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
          <Loader2 size={15} className="animate-spin" /> 备份任务执行中，完成前不可重复触发。
        </p>
      )}

      {loading ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>
      ) : (
        <DataTable
          columns={columns}
          data={data?.list ?? []}
          total={data?.total}
          page={page}
          pageSize={20}
          onPageChange={setPage}
        />
      )}

      {/* 自动备份定时配置对话框 */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                  <Clock size={18} /> 自动备份
                </h3>
                <p className="mt-1 text-xs text-slate-400">到点自动执行数据库备份 + 图片清单，并上传对象存储（如已启用）。</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowSchedule(false)}><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={schedule.enabled}
                  onChange={(e) => setSchedule((s) => ({ ...s, enabled: e.target.checked }))}
                />
                <div>
                  <p className="text-sm font-medium text-slate-700">开启自动备份</p>
                  <p className="text-xs text-slate-400">建议设在业务空闲时段，如凌晨 3 点。</p>
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-600">备份时间（每天）</span>
                <input
                  type="time"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#123c5a] disabled:bg-slate-100"
                  value={schedule.time}
                  disabled={!schedule.enabled}
                  onChange={(e) => setSchedule((s) => ({ ...s, time: e.target.value }))}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setShowSchedule(false)}>
                  取消
                </button>
                <button
                  className="flex items-center gap-2 rounded-lg bg-[#123c5a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  disabled={scheduleSaving}
                  onClick={() => void handleScheduleSave()}
                >
                  {scheduleSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 对象存储配置对话框 */}
      {showStorage && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                  <Settings2 size={18} /> 对象存储配置
                </h3>
                <p className="mt-1 text-xs text-slate-400">备份完成后自动上传到腾讯云 COS，实现异地留存。</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowStorage(false)}><X size={18} /></button>
            </div>

            {storageLoading ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>
            ) : (
              <div className="space-y-4">
                {/* 开关 */}
                <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={storageForm.enabled}
                    onChange={(e) => setStorageForm({ ...storageForm, enabled: e.target.checked })}
                  />
                  <span className="text-sm font-medium text-slate-700">启用对象存储</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {storage?.configured ? '配置完整' : '尚未配置完整'}
                  </span>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">地域 Region <span className="text-red-500">*</span></label>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#123c5a]"
                      value={storageForm.region}
                      onChange={(e) => setStorageForm({ ...storageForm, region: e.target.value })}
                      placeholder="ap-shanghai"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">存储桶 Bucket <span className="text-red-500">*</span></label>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#123c5a]"
                      onChange={(e) => setStorageForm({ ...storageForm, bucket: e.target.value })}
                      value={storageForm.bucket}
                      placeholder="my-bucket-1250000000"
                    />
                    <p className="mt-1 text-xs text-slate-400">需包含 AppId 后缀，如 name-1250000000。</p>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">SecretId <span className="text-red-500">*</span></label>
                  <input
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#123c5a]"
                    value={storageForm.secretId}
                    onChange={(e) => setStorageForm({ ...storageForm, secretId: e.target.value })}
                    placeholder="AKIDxxxxxxxxxxxxxxxx"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">SecretKey <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      type={showSecretKey ? 'text' : 'password'}
                      className="h-11 w-full rounded-lg border border-slate-200 pl-3 pr-11 text-sm outline-none focus:border-[#123c5a]"
                      value={storageForm.secretKey}
                      onChange={(e) => setStorageForm({ ...storageForm, secretKey: e.target.value })}
                      placeholder="请输入完整的 SecretKey"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                    >
                      {showSecretKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">密钥脱敏存储与回显，保存时若未改动（仍为脱敏占位）将保留原值。</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">访问域名（可选）</label>
                  <input
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#123c5a]"
                    value={storageForm.domain}
                    onChange={(e) => setStorageForm({ ...storageForm, domain: e.target.value })}
                    placeholder="留空则使用 COS 默认域名"
                  />
                  <p className="mt-1 text-xs text-slate-400">填写 CDN 加速域名可提升下载速度，后续图片迁移也会复用此配置。</p>
                </div>

                {storageTest && (
                  <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${storageTest.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {storageTest.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span className="break-all">{storageTest.message}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    disabled={storageTesting || storageSaving}
                    onClick={() => void handleStorageTest()}
                  >
                    {storageTesting ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
                    测试连接
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-lg bg-[#123c5a] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    disabled={storageTesting || storageSaving}
                    onClick={() => void handleStorageSave()}
                  >
                    {storageSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    保存配置
                  </button>
                  <span className="text-xs text-slate-400">测试会写入并立即删除一个探测对象</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 恢复引导对话框：不提供一键恢复，避免误操作覆盖生产数据 */}
      {verifyTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                  <ArchiveRestore size={18} /> 恢复数据
                </h3>
                <p className="mt-1 text-xs text-slate-400">备份时间：{formatTime(verifyTarget.startedAt)}　文件：{verifyTarget.fileName}</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setVerifyTarget(null)}><X size={18} /></button>
            </div>

            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <span>
                恢复会用备份覆盖当前数据库，属于不可逆操作。请务必先<b>在测试环境验证</b>，并对当前数据做一次备份。
                本页面不提供一键恢复，恢复需由运维按指引在服务器执行。
              </span>
            </div>

            {verifyLoading && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">正在比对数据…</p>}

            {verifyResult && (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">数据比对（备份时 vs 当前）</span>
                  {verifyResult.blocked && (
                    <span className="text-xs text-red-600">服务端未配置备份加密口令，无法解密该备份</span>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">表</th>
                        <th className="px-3 py-2 text-right">备份时</th>
                        <th className="px-3 py-2 text-right">当前</th>
                        <th className="px-3 py-2 text-right">差异</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verifyResult.comparison.map((row) => (
                        <tr key={row.table} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.table}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{row.backupCount}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{row.currentCount}</td>
                          <td className={`px-3 py-2 text-right font-medium ${row.diff === 0 ? 'text-slate-400' : row.diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {row.diff > 0 ? `+${row.diff}` : row.diff}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  差异为正值表示备份中的数据多于当前（恢复后这部分数据会回来）；负值表示备份比当前少。
                </p>
              </div>
            )}

            {!showGuide ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    如确认继续，请输入 <span className="font-mono font-bold text-red-600">确认恢复</span> 以查看执行指引
                  </label>
                  <input
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#123c5a]"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="确认恢复"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50" onClick={() => setVerifyTarget(null)}>取消</button>
                  <button
                    className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                    disabled={confirmText.trim() !== '确认恢复'}
                    onClick={() => void handleShowGuide()}
                  >
                    查看恢复指引
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">服务器执行步骤</div>
                <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">{guide?.steps}</pre>
                <div className="mt-4 flex justify-end">
                  <button className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50" onClick={() => setVerifyTarget(null)}>关闭</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
