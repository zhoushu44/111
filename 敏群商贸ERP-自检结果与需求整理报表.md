# 敏群商贸 ERP · 自检 List 整理报表

> 来源：《敏群商贸(上海)有限公司-ERP （已确认）.md》之「自检list」
> 图例：✅ 通过　⭕️ 待处理

## 0. 总体结论

| 模块 | 检查项数 | 通过 | 待处理 | 状态 |
|---|---|---|---|---|
| 一、账号与权限 | 5 | 1 | 4 | ⭕️ |
| 二、面料类别维护 | 6 | 6 | 0 | ✅ |
| 三、面料资料维护及图片 | 18 | 18 | 0 | ✅ |
| 四、供应商维护 | 8 | 7 | 1 | ⭕️ |
| 五、客户资料维护 | 7 | 6 | 1 | ⭕️ |
| 六、客户选样管理 | 11 | 5 | 6 | ⭕️ |
| 七、客户选样查询 | 8 | 8 | 0（遗留显示问题） | ⭕️ |

**结论：2 个模块完全通过；其余 5 个模块的待办集中在「员工账号/权限」和「客户选样管理」两条线。**

---

## 一、账号与权限 —— 基础验收：⭕️

| # | 检查项 | 结果 | 备注 |
|---|---|---|---|
| 1 | 管理员能否登录 | ✅ | zhoushu 登录正常 |
| 2 | 员工能否登录 | ⭕️ | **待员工账号同步** |
| 3 | 管理员和员工能否同时在线 | ⭕️ | 待员工账号同步后验证 |
| 4 | 两个账号数据是否互通 | ⭕️ | 同上 |
| 5 | 员工不能查看「供应商维护」「客户资料维护」 | ⭕️ | 同上，联动四/五模块 |

问题汇总：待员工账号同步。

---

## 二、面料类别维护 —— 基础验收：✅ 全部通过

类别名称 ✅｜类别编码 ✅｜类别描述 ✅｜序号 ✅｜是否使用/启用停用 ✅｜新增、编辑、停用、删除 ✅

问题汇总：暂无

---

## 三、面料资料维护及图片 —— 基础验收：✅ 全部通过

Item No 及按 Item No 查询 ✅｜产品名称 ✅｜面料类别 ✅｜单位 ✅｜成分 ✅｜加工方式 ✅｜规格 ✅｜组织结构 ✅｜幅宽 ✅｜克重 ✅｜颜色 ✅｜工厂编码 ✅｜供应商 ✅｜成本 ✅｜备注 ✅｜产品图片 ✅｜颜色图片 ✅｜查询、编辑、停用、导出等原有功能 ✅

问题汇总：暂无

---

## 四、供应商维护 —— 基础验收：⭕️

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 供应商字段完整（基本资料/联系方式/开票资料） | ✅ |
| 2 | 查询、编辑、停用入口存在 | ✅ |
| 3 | 管理员可以访问 | ✅ |
| 4 | 查询、新增、编辑、停用、删除等原有功能 | ✅ |
| 5 | 管理员可见 | ✅ |
| 6 | **员工不可见或无权限** | ⭕️ 待员工账号同步 |

问题汇总：待员工账号同步。

---

## 五、客户资料维护 —— 基础验收：⭕️

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 基本资料（客户代码、简称、全称、类型、销售员、经营单位、品牌、国家、省市、地址等） | ✅ |
| 2 | 业务信息（月结、账期、授信额度、主要产品、备注） | ✅ |
| 3 | 联系方式（联系人、总经理、电话、手机、邮箱、传真、其他联系人） | ✅ |
| 4 | 表现记录（查看后续选样记录） | ✅ |
| 5 | 操作功能（查询、状态筛选、新增、编辑、启用/停用、保存） | ✅ |
| 6 | 管理员可见 | ✅ |
| 7 | **员工不可见或无权限** | ⭕️ 待员工账号同步 |

问题汇总：待员工账号同步。

---

## 六、客户选样管理 —— 基础验收：⭕️（问题集中区）

### 通过项

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 客户数据填写（与客户确认不做特殊要求） | ✅ |
| 2 | 手动输入编码添加产品 | ✅ |
| 3 | 多选产品 | ✅ |
| 4 | 保存选样 | ✅ |
| 5 | 选样记录生成 | ✅ |

### 待处理项

| # | 检查项 | 问题明细 | 参考 |
|---|---|---|---|
| P1 | 基础页面字段（选样单客户、联系人、币种、销售员、选样类型、来样类型、快递单号、快递公司、要求、备注） | **错别字：「未样类型」应为「来样类型」** | image 20 / image 11 |
| P2 | 扫码添加产品 | 扫码结果需提供截图取证 | — |
| P3 | 产品图片和字段带出 | ① 缺少「克重」；② 字段顺序：图片放最前，其余按旧系统原字段顺序（客户已确认） | image 6 / image 1 |
| P4 | 进入表格打印预览 | 预览页面缺少内容 | image 24 |
| P5 | 导出表格 | ① 缺公司 Logo、地址、电话、传真等抬头（客户确认必须完整保留）；② Composition 过长需自动换行展示。数据行方式与图片列已按新系统通过 ✅ | image 7 |
| P6 | 标签预览 + 打印标签自检 | ① 抬头由 `MINQUN TRADING…` 改回 `Mint Chance Textile Co.,Ltd`（客户已确认）✅ 8-30 已验证；② 标签内容基本为空 ✅ 8-30 已验证；③ 打印结果需实拍截图 | image 19 |

### ★ B 类问题 · 原始系统参考依据（源自 E:\…Desktop\HSTIP_SHMQ）

> 原始系统为 Delphi 桌面程序，无源码，以下结论提取自其模块 DLL 的表单字符串资源与 Excel 模板文件。

| 问题 | 原始系统证据 | 开发落点 |
|---|---|---|
| B1 来样类型错别字 | `HS_Trade_MM_SAMPLE_frmmmSampleChoose.dll`（客户选样管理主模块）表单标签原文为「**来样**」「类型」二字串 | 文案改回「来样类型」 |
| B2 缺克重 | 面料样品资料模块 `HS_Trade_MM_frmmmMaterialFabricSample.dll` 含「**克重**」字段；旧系统选样表格截图（image 6）亦带克重列 | 新系统选样带出字段补「克重」，取数沿用面料资料同名字段 |
| B3 字段顺序 | 主模块 DLL 基础页标签序列：国家→省/市→联系人→快递→币种→备注→销售员→要求→来样…；表格列以旧系统截图为准 | 图片列置最前，其余严格照旧系统列序（image 21 / image 15 对照） |
| B4 打印预览缺内容 | 主模块 DLL 含「**打印时间**」标签及「选样空白」占位逻辑 | 对照旧系统 image 24 补齐预览元素（含打印时间等） |
| B5 导出抬头 + Composition 换行 | 原始 Excel 模板 `报价单.xls` 中提取到完整抬头块（见下）；抬头数据源为「本地公司维护」模块 `HS_Trade_SM_frmsmLocalCompany.dll`（简称/地址/电话/传真/选择图片=Logo） | 导出表头逐字复刻抬头块；Composition 列设自动换行 |
| B6 标签抬头与空白 | 抬头公司与导出一致，用 `Mint Chance Textile Co.,Ltd`；标签栏位数据取自选样记录（Item No、品名、成分、规格、克重、颜色等）；标签格式见 image 13 | 抬头替换；各栏绑定实际数据非空校验 |

**原始抬头块原文（从 报价单.xls 提取，可直接复制使用）：**

```
Mint Chance Textile Co.,Ltd
Room 401-402  No 2, Lane 288 Tongxie Road , Changning District, Shanghai 200335, China
TEL : 86-21-51879008   FAX : 86-21-52045389
```

> 注：原系统的打印/标签/导出报表模板存放于数据库端（huansi.ini：ServerName=ts2.huansi.net，Port=4090，ServiceName=SHMQ；SQL.log 为加密日志）。如需 1:1 还原模板版式，可从该库报表模板表中导出原始模板。

---

## 七、客户选样查询 —— 基础验收：⭕️（功能全过，遗留显示问题）

功能检查全部通过：查到已保存选样单 ✅｜按单号/客户/Item No./状态/日期查询 ✅｜查看详情 ✅｜编辑 ✅｜作废 ✅｜恢复 ✅｜作废后不能打印导出 ✅｜有效单可打印导出 ✅

遗留问题：
- 内容显示不全（同模块六 P4/P5 联动）；
- 企业名称有歧义（同模块六标签抬头问题，统一为 `Mint Chance Textile Co.,Ltd`）。参考 image 23 / image 25

---

## 八、客户选样管理 6 项问题 · 代码修复记录（2026-08-26）

> 状态：代码已改，前后端 typecheck 通过；需在 192.6.121.16:7776 实际环境复验并补充实拍截图。

| # | 问题 | 改动文件 | 关键修改 |
|---|---|---|---|
| B1 | 「未样类型」错别字 | `src/pages/SampleChoose.tsx` | 标签/占位符改「来样类型」/「来样分类」（DB 字段 `unsampled_type` 不变） |
| B2+B3 | 缺克重 + 字段顺序 | `src/pages/SampleChoose.tsx`、`api/src/routes/sample-chooses.ts` | 网格按旧系统顺序：图片→Item No.→名称→工厂编号→颜色→数量→单位→成分→规格→幅宽→**克重**→备注；后端补 weight/construction 快照与物料查询字段 |
| B4 | 打印预览缺内容 | `src/pages/SampleChoosePreview.tsx`、`system.ts` | 抬头改为公司信息（Mint Chance + 地址/TEL/FAX）而非客户信息；补 选样单号 行；成分/组织/幅宽/克重经快照回填显示 |
| B5 | 导出抬头 + Composition 换行 | `api/src/routes/exports.ts`、`seed.ts` | 抬头改取 `CompanyInfo`（Mint Chance…）；Composition 等文本列开启自动换行；seed 公司信息按原始 报价单.xls 校正（Lane 288 Tongxie / TEL 86-21-51879008 / FAX 86-21-52045389） |
| B6 | 标签抬头 + 内容空白 | `src/pages/LabelPrint.tsx`、`api/src/routes/labels.ts`、`print-agent/lib/zpl.js` | 标签抬头改 `Mint Chance Textile Co.,Ltd`（从 /system/company-info 取，代理打印亦带公司名）；FULL 版式改为 Item No./Composition/Construction/Width/Weight/Remark，补全选样单标签的 composition/construction/width/weight 数据 |
| 接口 | 公司信息端点 | `api/src/routes/system.ts` | 新增 `GET /system/company-info`（员工/管理员可读），标签与预览统一取数 |

> 注：打印代理（print-agent）ZPL 同步修正了硬编码 `MINQUN TRADING` 与缺 Construction/Width 的问题。

---

## 九、B6 标签问题 · 2026-08-30 复验与上线记录

**8-26 修复未见效的根因**：代码只改在工作区，从未构建部署——线上 7776 的 JS bundle 仍是旧版（含硬编码 `MINQUN TRADING`、旧「Width / Weight」合并版式、无 company-info 调用），并非数据缺失。

本次补充与验证：

1. **Remark 回退**：`api/src/routes/labels.ts` 选样标签 remark 增加 `item.remark ?? material.remark` 回退（老系统标签 Remark 即面料备注，已用 CN19669051 的 `PD+WR+CIRE` 比对确认）。
2. **数据库公司信息刷新**：`CompanyInfo` 地址/TEL/FAX 更新为原始 报价单.xls 抬头（Lane 288 Tongxie / 86-21-51879008 / 86-21-52045389），companyName 原本已是 Mint Chance。
3. **端到端验证**（本地起后端连真实库）：
   - `GET /system/company-info` → Mint Chance + 正确地址/TEL/FAX；
   - `POST /labels/sample-choose/:id`（真实有效单 XZ202608226367）→ 返回 composition/construction/width/weight/remark 全部有值，与老系统标签逐字段一致；
   - 浏览器实测标签预览页：抬头 `Mint Chance Textile Co.,Ltd`，内容完整（截图留存于会话）。
4. **前后端 typecheck、vite build 均通过**；新 bundle 已确认含新代码标记、0 处 MINQUN 硬编码。

**上线步骤（服务器 192.6.121.16 上执行）**：推送 master 后 CI 自动构建 `fabric-erp:7.0` + `latest` 镜像；构建完成后在服务器执行：

```bash
docker pull <DOCKER_HUB_USERNAME>/fabric-erp:latest
docker rm -f fabric-erp
docker run -d --name fabric-erp --env-file /path/to/api/.env -p 7776:3000 -v fabric-erp-uploads:/app/uploads <DOCKER_HUB_USERNAME>/fabric-erp:latest
```

若使用本地打印代理（localhost:8790），需在打印机所在电脑用更新后的 `print-agent/` 重启代理（ZPL 抬头与字段同步修正过）。

---

## 附：修复优先级与复验顺序

| 优先级 | 事项 | 解锁范围 |
|---|---|---|
| P0 | 同步员工账号 → 验证登录/同时在线/数据互通/菜单权限 | 解锁模块一、四、五共 3 个模块验收 |
| P1 | 客户选样管理 6 项（错别字→字段→预览→导出→标签） | 解锁模块六、七验收 |
| P2 | 取证材料：扫码步骤+截图、标签打印实拍 | 完成模块六收尾 |

---

## 附2：原始项目（HSTIP_SHMQ）模块对照表

| 新系统模块 | 原始 DLL（E:\…HSTIP_SHMQ\libs\） | 最近修改 |
|---|---|---|
| 客户选样管理 | HS_Trade_MM_SAMPLE_frmmmSampleChoose.dll | 2022-09-16 |
| 客户选样查询 | HS_Trade_MM_SAMPLE_frmmmSampleChooseQuery.dll | 2016-07-20 |
| 面料资料维护 | HS_Trade_MM_frmmmMaterialFabricSample.dll / frmmmMaterialFabric.dll | 2019-08-23 |
| 面料类别维护 | HS_Trade_MM_frmmmMaterialType.dll | 2017-07-13 |
| 供应商维护 | HS_Trade_PB_frmpbProvider.dll | 2018-04-26 |
| 客户资料维护 | HS_Trade_PB_frmpbCustomerEx.dll | 2018-12-22 |
| 本地公司信息（导出抬头/Logo 来源） | HS_Trade_SM_frmsmLocalCompany.dll | 2017-06-09 |

全部完成后即可满足「9 月 27 日前测试完成可正常使用」的验收条件。
