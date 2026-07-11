interface PageHeaderProps {
  title: string
  description: string
  action?: string
  onAction?: () => void
}

export default function PageHeader({ title, description, action, onAction }: PageHeaderProps) {
  return (
    <div className="mb-5 flex items-end justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action ? <button onClick={onAction} className="rounded-lg bg-[#1e8a7a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#166f63]">{action}</button> : null}
    </div>
  )
}
