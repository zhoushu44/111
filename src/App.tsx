import { useEffect } from 'react'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom'
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
import SimpleListPage, { type Field } from '@/pages/SimpleListPage'
import CategoryTree from '@/pages/CategoryTree'
import RolePermissions from '@/pages/RolePermissions'
import UserManagement from '@/pages/UserManagement'

const fields: Record<string, Field[]> = {
  categories: [{ key: 'name', label: '类别名称' }, { key: 'parentId', label: '上级 ID' }, { key: 'sortOrder', label: '排序', transform: Number }],
  partners: [{ key: 'code', label: '编码' }, { key: 'name', label: '名称' }, { key: 'contact', label: '联系人' }, { key: 'phone', label: '电话' }, { key: 'address', label: '地址' }],
  dictionaries: [{ key: 'type', label: '类型' }, { key: 'code', label: '编码' }, { key: 'label', label: '标签' }, { key: 'value', label: '值' }, { key: 'sortOrder', label: '排序', transform: Number }],
  users: [{ key: 'username', label: '用户名', readOnlyOnEdit: true }, { key: 'displayName', label: '姓名' }, { key: 'password', label: '密码', inputType: 'password', createOnly: true }, { key: 'role', label: '角色', type: 'select', options: [{ value: 'ADMIN', label: '管理员' }, { value: 'STAFF', label: '员工' }], display: (value) => typeof value === 'object' && value ? String((value as { code?: string }).code ?? '') : String(value ?? '') }],
}
function Protected() { const user = useAuthStore((state) => state.user), loading = useAuthStore((state) => state.loading); if (loading) return <div className="p-10 text-center">正在校验登录状态…</div>; return user ? <AppLayout /> : <Navigate to="/login" replace /> }
function Bootstrap() { const init = useAuthStore((state) => state.initialize); useEffect(() => { void init() }, [init]); return <Routes><Route path="/login" element={<Login />} /><Route element={<Protected />}><Route path="/dashboard" element={<Dashboard />} /><Route path="/materials/categories" element={<CategoryTree />} /><Route path="/materials/fabrics" element={<MaterialFabrics />} /><Route path="/partners/providers" element={<RequireRole roles={['admin']}><SimpleListPage title="供应商维护" description="通过 API 维护供应商。" endpoint="/providers" fields={fields.partners} /></RequireRole>} /><Route path="/partners/customers" element={<RequireRole roles={['admin']}><SimpleListPage title="客户资料维护" description="通过 API 维护客户。" endpoint="/customers" fields={fields.partners} /></RequireRole>} /><Route path="/samples/choose" element={<SampleChoose />} /><Route path="/samples/choose-records" element={<SampleRecords />} /><Route path="/info/material-query" element={<MaterialQuery />} /><Route path="/print/labels" element={<LabelPrint />} /><Route path="/system/users" element={<RequireRole roles={['admin']}><UserManagement /></RequireRole>} /><Route path="/system/roles" element={<RequireRole roles={['admin']}><RolePermissions /></RequireRole>} /><Route path="/system/dictionaries" element={<RequireRole roles={['admin']}><SimpleListPage title="数据字典" description="通过 API 维护数据字典。" endpoint="/dictionaries" fields={fields.dictionaries} /></RequireRole>} /><Route path="/system/logs" element={<RequireRole roles={['admin']}><SimpleListPage title="操作日志" description="操作日志来自 API。" endpoint="/system/operation-logs" fields={[{ key: 'action', label: '操作' }, { key: 'resource', label: '资源' }, { key: 'user', label: '操作人', display: (value) => typeof value === 'object' && value ? String((value as { displayName?: string; username?: string }).displayName || (value as { username?: string }).username || '-') : '-' }, { key: 'detail', label: '详情', display: (value) => value ? JSON.stringify(value) : '-' }, { key: 'createdAt', label: '时间', display: (value) => value ? new Date(String(value)).toLocaleString() : '-' }]} readOnly /></RequireRole>} /><Route path="/" element={<Navigate to="/dashboard" replace />} /></Route><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes> }
export default function App() { return <Router><Bootstrap /></Router> }
