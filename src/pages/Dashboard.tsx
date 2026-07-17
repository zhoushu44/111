import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { api } from '@/lib/api'

export default function Dashboard() {
  const [stats, setStats] = useState({ materials: 0, chooses: 0 })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<{ total: number }>('/materials?pageSize=1'),
      api.get<{ total: number }>('/sample-chooses?pageSize=1'),
    ]).then(([a, b]) => {
      setStats({
        materials: a.total,
        chooses: b.total,
      })
    }).catch((e) => {
      setMessage(e instanceof Error ? e.message : '加载统计数据失败')
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="工作台" description="实时业务数据概览。" />
      {loading && <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">加载中…</p>}
      {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{message}</p>}
      <div className="grid grid-cols-2 gap-4">
        {([
          ['面料资料', stats.materials],
          ['选样单', stats.chooses],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6">
            <b className="text-3xl">{value}</b>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
