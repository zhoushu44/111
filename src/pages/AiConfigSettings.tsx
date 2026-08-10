import { useEffect, useState } from 'react'
import { Sparkles, Eye, EyeOff, Save, Loader2, Plug, CheckCircle2, AlertCircle } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'

type Config = { maskedKey: string; baseUrl: string; model: string; configured: boolean }
type TestResult = { ok: boolean; message: string }

export default function AiConfigSettings() {
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [model, setModel] = useState('gpt-4o')
  const [configured, setConfigured] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  useEffect(() => {
    void api.get<Config>('/system/ai-config').then((cfg) => {
      setApiKey(cfg.maskedKey || '')
      setBaseUrl(cfg.baseUrl || 'https://api.openai.com/v1')
      setModel(cfg.model || 'gpt-4o')
      setConfigured(cfg.configured)
    }).catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false))
  }, [])

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setMessage('')
    try {
      const result = await api.post<TestResult>('/system/ai-config/test', { apiKey, baseUrl, model })
      setTestResult(result)
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : '测试失败' })
    } finally { setTesting(false) }
  }

  const handleSave = async () => {
    setSaving(true); setMessage(''); setTestResult(null)
    try {
      await api.put('/system/ai-config', { apiKey, baseUrl, model })
      setMessage('保存成功，配置已生效')
      // 重新加载以刷新脱敏值与 configured 状态
      const cfg = await api.get<Config>('/system/ai-config')
      setApiKey(cfg.maskedKey || '')
      setConfigured(cfg.configured)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <PageHeader title="AI 识别设置" description="配置图片智能查询所用的 AI 视觉识别服务（OpenAI 兼容接口）。" />

      {/* 状态条 */}
      <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-4">
        <Sparkles size={18} className={configured ? 'text-emerald-500' : 'text-slate-400'} />
        <span className="text-sm font-medium text-slate-700">当前状态：</span>
        {configured ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={13} /> 已配置可用
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            <AlertCircle size={13} /> 未配置密钥，图片识别将不可用
          </span>
        )}
      </div>

      {loading && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
      {message && <p className={`mb-4 rounded-lg p-3 text-sm ${message.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{message}</p>}

      {!loading && (
        <div className="max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
          {/* API Key */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              API Key <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                className="h-11 w-full rounded-lg border border-slate-200 pl-3 pr-11 text-sm outline-none focus:border-[#123c5a]"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={configured ? '已配置（脱敏显示），如需修改请输入完整 Key' : '请输入 AI 服务的 API Key'}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">密钥脱敏存储与回显，保存时若未改动（仍为脱敏占位）将保留原值。</p>
          </div>

          {/* 接口地址 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              接口地址（Base URL） <span className="text-red-500">*</span>
            </label>
            <input
              className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#123c5a]"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
            <p className="mt-1 text-xs text-slate-400">OpenAI 兼容接口根地址，系统会自动拼接 <code className="rounded bg-slate-100 px-1">/chat/completions</code>。</p>
          </div>

          {/* 模型 */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              模型名称 <span className="text-red-500">*</span>
            </label>
            <input
              className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#123c5a]"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o"
            />
            <p className="mt-1 text-xs text-slate-400">需为支持视觉（image_url）的模型，如 gpt-4o、gpt-4o-mini。</p>
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span className="break-all">{testResult.message}</span>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-3 pt-1">
            <button
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={testing || saving}
              onClick={() => void handleTest()}
            >
              {testing ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
              测试连接
            </button>
            <button
              className="flex items-center gap-2 rounded-lg bg-[#123c5a] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              disabled={testing || saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              保存配置
            </button>
            <span className="text-xs text-slate-400">测试时需填写完整 API Key（脱敏占位无法测试）</span>
          </div>
        </div>
      )}
    </div>
  )
}
