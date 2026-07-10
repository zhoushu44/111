import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import AppLayout from '@/components/AppLayout'
import RequireRole from '@/components/RequireRole'
import { useAuthStore } from '@/store/authStore'
import Dashboard from '@/pages/Dashboard'
import LabelPrint from '@/pages/LabelPrint'
import Login from '@/pages/Login'
import MaterialFabrics from '@/pages/MaterialFabrics'
import MaterialQuery from '@/pages/MaterialQuery'
import SampleChoose from '@/pages/SampleChoose'
import SampleRecords from '@/pages/SampleRecords'
import SimpleListPage from '@/pages/SimpleListPage'
import { customers, fabrics, providers } from '@/data/mock'

function ProtectedLayout() {
  const user = useAuthStore((state) => state.user)
  if (!user) return <Navigate to="/login" replace />
  return <AppLayout />
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/materials/categories" element={<SimpleListPage title="面料类别维护" description="维护面料分类树，用于资料归类和查询筛选。" rows={[{ 类别编码: 'CT', 类别名称: '棉类面料', 上级类别: '/', 状态: '启用' }, { 类别编码: 'PL', 类别名称: '化纤面料', 上级类别: '/', 状态: '启用' }]} />} />
          <Route path="/materials/fabrics" element={<MaterialFabrics />} />
          <Route path="/partners/providers" element={<RequireRole roles={['admin']}><SimpleListPage title="供应商维护" description="维护供应商基础资料，仅管理员可见。" rows={providers.map((item) => ({ 编码: item.code, 供应商名称: item.name, 联系人: item.contact, 电话: item.phone, 地区: item.region, 状态: item.status }))} /></RequireRole>} />
          <Route path="/partners/customers" element={<RequireRole roles={['admin']}><SimpleListPage title="客户资料维护" description="维护客户资料，用于客户选样和导出。" rows={customers.map((item) => ({ 编码: item.code, 客户名称: item.name, 联系人: item.contact, 地区: item.region, 状态: item.status }))} /></RequireRole>} />
          <Route path="/samples/choose" element={<SampleChoose />} />
          <Route path="/samples/choose-records" element={<SampleRecords />} />
          <Route path="/samples/locations" element={<RequireRole roles={['admin']}><SimpleListPage title="样品库位维护" description="维护样品存放区域和库位编码。" rows={[{ 库位编码: 'A-01-03', 区域: 'A区', 说明: '棉类样品架', 状态: '启用' }, { 库位编码: 'B-02-11', 区域: 'B区', 说明: '化纤样品架', 状态: '启用' }]} /></RequireRole>} />
          <Route path="/samples/inbound" element={<SimpleListPage title="样品入库" description="记录样品入库流水并增加库存。" rows={fabrics.map((item) => ({ ItemNo: item.itemNo, 面料名称: item.name, 入库数量: 20, 库位: item.location, 状态: '已入库' }))} />} />
          <Route path="/samples/outbound" element={<SimpleListPage title="样品出库" description="记录样品出库流水并减少库存。" rows={fabrics.map((item) => ({ ItemNo: item.itemNo, 面料名称: item.name, 出库数量: 2, 库位: item.location, 状态: '已出库' }))} />} />
          <Route path="/samples/stock" element={<SimpleListPage title="样品库存查询" description="按面料、库位、类别查询当前库存。" rows={fabrics.map((item) => ({ ItemNo: item.itemNo, 面料名称: item.name, 类别: item.category, 库位: item.location, 库存: item.stockQty }))} action="导出库存" />} />
          <Route path="/info/material-query" element={<MaterialQuery />} />
          <Route path="/print/labels" element={<LabelPrint />} />
          <Route path="/system/users" element={<RequireRole roles={['admin']}><SimpleListPage title="用户管理" description="维护账号、角色、启用状态和密码重置。" rows={[{ 用户名: 'admin', 姓名: '管理员', 角色: '管理员', 状态: '启用' }, { 用户名: 'staff', 姓名: '业务员工', 角色: '员工', 状态: '启用' }]} /></RequireRole>} />
          <Route path="/system/dictionaries" element={<RequireRole roles={['admin']}><SimpleListPage title="数据字典" description="维护单位、地区、客户类型、出入库类型等基础字典。" rows={[{ 字典类型: '单位', 字典值: '米', 状态: '启用' }, { 字典类型: '地区', 字典值: '香港', 状态: '启用' }, { 字典类型: '客户类型', 字典值: '样衣公司', 状态: '启用' }]} /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}
