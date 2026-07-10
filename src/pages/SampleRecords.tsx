import DataTable from '@/components/DataTable'
import FilterBar from '@/components/FilterBar'
import PageHeader from '@/components/PageHeader'
import { sampleRecords } from '@/data/mock'
import type { SampleChooseRecord } from '@/types'

export default function SampleRecords() {
  return (
    <div>
      <PageHeader title="客户选样查询" description="按客户、时间、Item No. 查询历史选样单，并支持重新导出和打印。" />
      <FilterBar placeholder="输入选样单号 / 客户名称 / Item No." />
      <DataTable
        data={sampleRecords}
        columns={[
          { title: '选样单号', render: (row: SampleChooseRecord) => <span className="font-semibold text-[#123c5a]">{row.orderNo}</span> },
          { title: '客户', render: (row: SampleChooseRecord) => row.customerName },
          { title: '选样日期', render: (row: SampleChooseRecord) => row.chooseDate },
          { title: '操作人', render: (row: SampleChooseRecord) => row.operator },
          { title: '款数', render: (row: SampleChooseRecord) => row.itemCount },
          { title: '状态', render: (row: SampleChooseRecord) => <span className="rounded-full bg-[#e8f5f2] px-3 py-1 text-xs font-semibold text-[#1e8a7a]">{row.status}</span> },
          { title: '操作', render: () => <div className="space-x-2 text-[#1e8a7a]"><button>详情</button><button>导出</button><button>打印</button></div> },
        ]}
      />
    </div>
  )
}
