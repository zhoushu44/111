import DataTable from '@/components/DataTable'
import FilterBar from '@/components/FilterBar'
import PageHeader from '@/components/PageHeader'

interface SimpleListPageProps {
  title: string
  description: string
  action?: string
  rows: Record<string, string | number>[]
}

export default function SimpleListPage({ title, description, action = '新增', rows }: SimpleListPageProps) {
  const keys = Object.keys(rows[0] ?? {})
  return (
    <div>
      <PageHeader title={title} description={description} action={action} />
      <FilterBar />
      <DataTable<Record<string, string | number>>
        data={rows}
        columns={keys.map((key) => ({
          title: key,
          render: (row) => row[key],
        }))}
      />
    </div>
  )
}
