import sharp from 'sharp'
import { app } from '../src/app.js'

type Result = { name: string; status: 'passed' | 'failed'; detail?: string }
const results: Result[] = []
const check = (condition: unknown, name: string, detail?: string) => {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`)
  results.push({ name, status: 'passed' })
}

async function main() {
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`
  const stamp = `验收${Date.now()}`
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, init)
    const contentType = response.headers.get('content-type') ?? ''
    const data = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer()
    return { response, data }
  }
  const json = (body: unknown) => body as { code: number; message: string; data: any }

  try {
    const health = await call('/health')
    check(health.response.status === 200, '健康检查')
    const bootstrap = await call('/api/auth/bootstrap-status')
    check(json(bootstrap.data).data.initialized === true, '系统初始化状态')

    const adminLogin = await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@123456' }) })
    check(adminLogin.response.status === 200, '管理员登录')
    let adminToken = json(adminLogin.data).data.accessToken as string
    const adminRefresh = json(adminLogin.data).data.refreshToken as string
    const adminHeaders = () => ({ Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' })
    const me = await call('/api/auth/me', { headers: adminHeaders() })
    check(json(me.data).data.username === 'admin', '登录会话读取')
    const refresh = await call('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: adminRefresh }) })
    check(refresh.response.status === 200, '令牌刷新')
    adminToken = json(refresh.data).data.accessToken

    const staffLogin = await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'staff', password: 'Staff@123456' }) })
    check(staffLogin.response.status === 200, '员工登录')
    const staffHeaders = { Authorization: `Bearer ${json(staffLogin.data).data.accessToken}` }
    const staffProviders = await call('/api/providers', { headers: staffHeaders })
    check(staffProviders.response.status === 403, '员工供应商越权拦截')

    const category = await call('/api/categories', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ name: `${stamp}类别`, sortOrder: 99 }) })
    check(category.response.status === 201, '新增面料类别')
    const categoryId = json(category.data).data.id as string
    const child = await call('/api/categories', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ name: `${stamp}子类`, parentId: categoryId, sortOrder: 1 }) })
    check(child.response.status === 201, '新增子类别')
    const childId = json(child.data).data.id as string
    check((await call(`/api/categories/${childId}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ name: `${stamp}子类已修改` }) })).response.status === 200, '修改面料类别')
    check((await call(`/api/categories/${childId}/toggle`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ status: 'DISABLED' }) })).response.status === 200, '停用面料类别')
    check((await call(`/api/categories/${childId}/toggle`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ status: 'ACTIVE' }) })).response.status === 200, '启用面料类别')

    const provider = await call('/api/providers', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ code: `P${Date.now()}`, name: `${stamp}供应商`, contact: '验收员', phone: '13800000000' }) })
    check(provider.response.status === 201, '新增供应商')
    const providerId = json(provider.data).data.id as string
    check((await call(`/api/providers/${providerId}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ contact: '验收员修改' }) })).response.status === 200, '修改供应商')

    const customer = await call('/api/customers', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ code: `C${Date.now()}`, name: `${stamp}客户`, contact: '验收员', phone: '13900000000' }) })
    check(customer.response.status === 201, '新增客户')
    const customerId = json(customer.data).data.id as string
    check((await call(`/api/customers/${customerId}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ contact: '验收员修改' }) })).response.status === 200, '修改客户')
    check((await call('/api/sample-customers?pageSize=100', { headers: staffHeaders })).response.status === 200, '员工读取选样客户')

    const material = await call('/api/materials', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ itemNo: `M${Date.now()}`, name: `${stamp}面料`, categoryId, providerId, cost: 12.5, composition: 'Cotton', construction: 'Knit', width: '58/60', weight: '180G', unit: '米', labelRemark: '验收标签' }) })
    check(material.response.status === 201, '新增面料')
    const materialId = json(material.data).data.id as string
    check((await call(`/api/materials/${materialId}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ color: '红色', remark: '验收修改' }) })).response.status === 200, '修改面料')
    const png = await sharp({ create: { width: 3, height: 3, channels: 3, background: { r: 220, g: 20, b: 60 } } }).png().toBuffer()
    const form = new FormData(); form.append('image', new Blob([png], { type: 'image/png' }), 'acceptance.png')
    const uploaded = await call(`/api/materials/${materialId}/images`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: form })
    check(uploaded.response.status === 201 && json(uploaded.data).data.url.endsWith('.webp'), '图片转换 WebP 上传')
    const imageId = json(uploaded.data).data.id as string
    const staffMaterial = await call(`/api/materials/${materialId}`, { headers: staffHeaders })
    check(staffMaterial.response.status === 200 && !('provider' in json(staffMaterial.data).data) && !('cost' in json(staffMaterial.data).data), '员工敏感面料字段隐藏')
    check((await call(`/api/materials/${materialId}/images/${imageId}`, { method: 'DELETE', headers: adminHeaders() })).response.status === 200, '删除 WebP 图片')
    check((await call(`/api/materials/${materialId}/toggle`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ status: 'DISABLED' }) })).response.status === 200, '停用面料')
    check((await call(`/api/materials/${materialId}/toggle`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ status: 'ACTIVE' }) })).response.status === 200, '启用面料')

    const choose = await call('/api/sample-chooses', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ customerId, items: [{ materialId, quantity: 2, remark: '验收选样' }] }) })
    check(choose.response.status === 201, '保存客户选样单')
    const chooseId = json(choose.data).data.id as string
    const chooseList = await call(`/api/sample-chooses?itemNo=${encodeURIComponent(json(material.data).data.itemNo)}`, { headers: { Authorization: `Bearer ${adminToken}` } })
    check(chooseList.response.status === 200 && json(chooseList.data).data.total >= 1, '客户选样查询')
    check((await call(`/api/sample-chooses/${chooseId}`, { headers: { Authorization: `Bearer ${adminToken}` } })).response.status === 200, '客户选样详情')
    check((await call('/api/sample-chooses/operators', { headers: { Authorization: `Bearer ${adminToken}` } })).response.status === 200, '客户选样操作人查询')
    check((await call(`/api/sample-chooses/${chooseId}/void`, { method: 'POST', headers: adminHeaders() })).response.status === 200, '作废客户选样单')
    check((await call(`/api/sample-chooses/${chooseId}/restore`, { method: 'POST', headers: adminHeaders() })).response.status === 200, '恢复客户选样单')

    const labelPreview = await call('/api/labels/preview', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ materialIds: [materialId], temporaryRemark: '临时备注', remarkMode: 'APPEND', copies: 2, mode: 'PREVIEW' }) })
    check(labelPreview.response.status === 200 && json(labelPreview.data).data.labels.length === 2, '单个标签预览')
    check((await call('/api/labels/preview', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ materialIds: [materialId], mode: 'PRINT' }) })).response.status === 200, '单个标签打印记录')
    check((await call(`/api/labels/sample-choose/${chooseId}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ mode: 'PRINT' }) })).response.status === 200, '批量标签打印记录')

    const materialExport = await call('/api/exports/materials?includeImage=true', { headers: { Authorization: `Bearer ${adminToken}` } })
    check(materialExport.response.status === 200 && materialExport.response.headers.get('content-type')?.includes('spreadsheetml'), '面料 Excel 导出')
    const chooseExport = await call(`/api/exports/sample-chooses/${chooseId}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ includeSpec: true, includeCost: true, includeImage: true }) })
    check(chooseExport.response.status === 200 && chooseExport.response.headers.get('content-type')?.includes('spreadsheetml'), '客户选样 Excel 导出')

    const dictionary = await call('/api/dictionaries', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ type: 'ACCEPTANCE', code: `D${Date.now()}`, label: `${stamp}字典`, value: '验收', sortOrder: 1 }) })
    check(dictionary.response.status === 201, '新增数据字典')
    const dictionaryId = json(dictionary.data).data.id as string
    check((await call(`/api/dictionaries/${dictionaryId}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ label: `${stamp}字典修改` }) })).response.status === 200, '修改数据字典')
    check((await call(`/api/dictionaries/${dictionaryId}/toggle`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ status: 'DISABLED' }) })).response.status === 200, '停用数据字典')
    check((await call('/api/dictionaries', { headers: staffHeaders })).response.status === 403, '员工数据字典越权拦截')

    const username = `verify${Date.now()}`
    const user = await call('/api/system/users', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ username, displayName: `${stamp}用户`, password: 'Verify@123456', role: 'STAFF' }) })
    check(user.response.status === 201, '新增用户')
    const userId = json(user.data).data.id as string
    check((await call(`/api/system/users/${userId}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ status: 'DISABLED' }) })).response.status === 200, '停用用户')
    check((await call(`/api/system/users/${userId}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ status: 'ACTIVE' }) })).response.status === 200, '启用用户')
    check((await call(`/api/system/users/${userId}/reset-password`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ password: 'Verify@654321' }) })).response.status === 200, '重置用户密码')
    const verifiedLogin = await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'Verify@654321' }) })
    check(verifiedLogin.response.status === 200, '重置密码后登录')
    check((await call('/api/system/roles', { headers: { Authorization: `Bearer ${adminToken}` } })).response.status === 200, '角色权限读取')
    const logs = await call('/api/system/operation-logs?pageSize=100', { headers: { Authorization: `Bearer ${adminToken}` } })
    check(logs.response.status === 200 && json(logs.data).data.total > 0, '操作日志读取')

    const logout = await call('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } })
    check(logout.response.status === 200, '退出登录')
    console.table(results)
    console.log(`FULL_SMOKE_TEST_PASS: ${results.length} 项`)
  } finally { server.close() }
}

main().catch((error) => { console.error(error); process.exit(1) })
