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
| 2 | 员工能否登录 | ✅ | staff 已可登录（Staff@123456） |
| 3 | 管理员和员工能否同时在线 | ✅ | 已实测：zhoushu 与 staff 先后登录后，两个 accessToken 均能通过 `/auth/me`，会话并存 |
| 4 | 两个账号数据是否互通 | ⭕️ | 待继续验证 |
| 5 | 员工不能查看「供应商维护」「客户资料维护」 | ⭕️ | 待继续验证，联动四/五模块 |

问题汇总：员工账号已同步并验证登录/同时在线；剩余数据互通与员工菜单权限待继续验证。

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
| P4 | 进入表格打印预览 | ✅ 8-30 代码已修复并本地端到端验证（真实库 XZ202608225451 / CN263061154）：Construction 显示 `MR30*MR40 / 94*74`、Weight 显示 `132G/SM`，与原系统 image 24 一致；抬头为 Logo + 地址 + TEL/FAX + 星号线 + QUOTATION LIST + Customer/Document No./ATTN/DATE。明细快照为空时自动回退面料主数据取值；另补详情接口 cost 返回使「包含成本」列真正生效（该面料 cost 为空故默认不显示，与原系统一致）。**此前 8-22 截图缺列的根因是线上 7776 仍为旧镜像（接口 material 无 construction/weight 字段），非数据缺失**（待重新部署 + 复验截图） | image 24 |
| P5 | 导出表格 | ✅ 8-30 代码已修复并本地导出验证：① 抬头补齐——Logo（提取自原始 `报价单.xls` 抬头原图，seed 预置 `/uploads/company-logo.png`）+ 地址 + TEL/FAX（粗体居中）+ 整行星号分隔线 + ATTN 行，与原系统输出一致；② Composition 开启自动换行完整展示。数据行方式与图片列此前已按新系统通过 ✅（待 192.6.121.16 环境重新部署 + 复验截图） | image 7 |
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

### ★ 遗留问题 · 代码修复记录（2026-08-30）

> 状态：代码已改，前后端 typecheck 通过；与模块六共用打印预览/导出/标签链路，需随 7.0 镜像重新部署并复验截图。

| # | 问题 | 改动文件 | 关键修改 |
|---|---|---|---|
| C1 | 详情内容显示不全 | `src/pages/SampleRecords.tsx`、`api/src/routes/sample-chooses.ts` | ① 详情弹窗明细列对齐老系统已确认列序：图片→Item No.→名称→工厂编号→颜色→数量→单位→成分→规格→幅宽→克重→备注（补 颜色/单位/克重/图片，后端详情接口补 color/cost 返回）；② 详情表头字段全量展示：选样日期/客户代码/客户（简称+全称，消除名称歧义）/制单人/状态/打印时间/联系人/币种/销售员/选样类型/来样类型/快递/要求/备注，空值显示「-」不再整行隐藏；③ 列表补「操作人」列（后端列表接口带 createdBy），与操作人筛选项呼应 |
| C2 | 打印/导出内容显示不全 | 复用模块六 B4/B5 修复 | 打印预览（`SampleChoosePreview.tsx`）与导出（`exports.ts`）抬头统一为：Logo（seed 预置 `/uploads/company-logo.png`，取自原始 报价单.xls 抬头原图）+ 地址 + TEL/FAX + 整行星号线 + QUOTATION LIST + Customer/Document No./ATTN/DATE；Composition 自动换行 |
| C3 | 企业名称歧义 | `api/prisma/seed.ts`、预览/导出/标签链路 | 全链路统一取 `CompanyInfo`（GET `/system/company-info`），缺省回退 `Mint Chance Textile Co.,Ltd`；seed 每次执行都会把公司信息校正为 Mint Chance（Lane 288 Tongxie / TEL 86-21-51879008 / FAX 86-21-52045389）；两个 Dockerfile 均已打包 seed-assets |

> ⚠️ 部署注意：compose 的 migrate 服务只执行 `prisma migrate deploy`，**不会自动跑 seed**。192.6.121.16 环境若公司名仍显示旧值，需在 api 容器内手动执行一次 `npm run seed`（幂等，会更新已有公司信息行），或重新部署后复验。

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

## 十、面料资料字段缺失 · 修复记录（2026-09-08）

> 状态：数据库迁移 + 4.4 万条回填已完成（真实库）；代码已改，前后端构建通过；需重新部署镜像后复验截图。

### 用户反馈

面料页面：① 没有「工厂编号」② 没有「纱支 & 密度 & 幅宽 & 克重」③ 没有「原产品备注」④ 成份看不到，内容不见了。

### 根因（对照原版《敏群面料资料截至20260701（最终版）(2).xlsx》与 HSTIP）

Excel 表头（20 列）：产品类别｜敏群编码｜成分｜幅宽｜**纱支**｜**密度**｜成品克重｜**产品备注**｜成本单价｜工厂编码｜产品名称｜**色号**｜颜色｜产品规格｜加工方式｜**产品描述**｜单位｜创建人｜创建日期｜产品色号。

1. **纱支(E)、密度(F)、色号(L)、产品描述(P)** 在早期建模时未建独立字段（旧导入把 纱支+密度 合并写进了 `construction`，色号/描述被丢弃），面料页自然没有这些内容。
2. 工厂编码/幅宽/克重/成分/产品备注在库里**一直有数据**（44738 条中：成分 44736、幅宽 44737、克重 44737、工厂编码 40927、产品备注 13662 非空）。用户看不到是因为**线上跑的是旧镜像**（8-30 报表已记载 7776 长期未重部署的问题），且查询页成分/厂编为空时整行隐藏。
3. 产品备注被新页面标签为「备注」且放在「标签备注」旁边，原版叫法「产品备注」+「产品描述」未体现。

### 改动清单

| # | 内容 | 文件 |
|---|---|---|
| 1 | `MaterialFabric` 新增 4 列：`color_no` 色号、`yarn_count` 纱支、`density` 密度、`product_description` 产品描述；备注字段注释明确为「产品备注」 | `api/prisma/schema.prisma`、`api/prisma/migrations/20260908010000_add_yarn_density_colorno_proddesc/migration.sql` |
| 2 | 回填 44,602 条：E→纱支、F→密度、L→色号、P→产品描述（按敏群编码精确匹配，重复编码保留首行）；32 条 Excel 之外旧编码按 `construction "纱支 / 密度"` 拆分兜底 | `api/scripts/backfill-fabric-fields.ts`（已执行） |
| 3 | 后端：创建/修改校验、员工可见字段、关键字搜索（新增 色号/纱支/密度/产品描述/产品备注）、更改记录字段中文名 | `api/src/routes/materials.ts` |
| 4 | 面料资料导出补列：纱支、密度、色号、产品描述、产品备注 | `api/src/routes/exports.ts` |
| 5 | 面料资料维护：主信息编辑/新增字段 纱支·密度·色号；底部三栏 产品备注｜产品描述｜标签备注；附加信息 Tab 全字段展示 | `src/pages/MaterialFabrics.tsx` |
| 6 | 面料查询：卡片常显 成分/幅宽/纱支/密度/克重/厂编/色号（空值显示「—」不再整行隐藏）；详情弹窗补 组织结构/纱支/密度/色号/加工方式/产品描述/产品备注 | `src/pages/MaterialQuery.tsx` |

### 数据验证（真实库 44,738 条）

- 纱支非空 **22,770**｜密度 **18,355**｜色号 **41,240**｜产品描述 **14,226**（回填前全为 0）。
- 抽查：CN263061155 → 纱支 `MR40//*MR30`、密度 `92*80`、成分 `100% VISCOSE (MILKSKIN®)`、幅宽 `56/57"`、克重 `126G/SM`、工厂 `VY1215937-01`、产品备注 `NATURAL PROTEIN FINISH`，与原 Excel 一致 ✅；CN26F81023A 同理 ✅。
- 2 条 HSTIP 老记录（CN19669050/51）Excel 行存在错位脏数据（keyin 日志串），已从产品描述/色号清理 ✅。
- 端到端：登录 → 列表/详情均返回新字段；POST 建样条（纱支/密度/色号/描述）成功并落库，测试数据已删除 ✅。
- API typecheck、前端 tsc、vite build 全部通过 ✅。

### 上线步骤

```bash
git add -A && git commit && git push            # CI 自动构建 fabric-erp:7.0 + latest
# 服务器（DB 迁移已由本地对真实库执行并记录，镜像内 migrate 服务幂等无副作用）：
docker compose --profile migrate run --rm migrate
docker pull <DOCKER_HUB_USERNAME>/fabric-erp:latest
docker rm -f fabric-erp
docker run -d --name fabric-erp --env-file ./api.env -p 7776:3000 -v fabric-erp-uploads:/app/uploads <DOCKER_HUB_USERNAME>/fabric-erp:latest
```

复验：面料资料维护/面料查询任选记录 → 纱支、密度、色号、产品描述、产品备注、成分、幅宽、克重、工厂编号均有内容；导出 Excel 多出 5 列。

---

## 十一、下载 Excel 抬头（Logo/地址/电话/传真）未完整保留 · 客户反馈核查（2026-09-08）

> 客户反馈原文：**下载的 excel 旧系统有公司 Logo、地址、电话、传真等抬头信息，新系统目前没有完整保留。（已与客户确认，原有内容需完整保留）**
> 影响范围经确认为：**客户选样单（报价单）导出 Excel**（模块六/七）。

### 核查结论（本地连真实库端到端验证，2026-09-08）

| # | 核查项 | 结果 |
|---|---|---|
| 1 | `GET /system/company-info`（真实库） | ✅ 返回老系统权威抬头：`Mint Chance Textile Co.,Ltd` / `Room 401-402  No 2, Lane 288 Tongxie Road…` / `TEL 86-21-51879008` / `FAX 86-21-52045389` / `logoUrl=/uploads/company-logo.png`（与 HSTIP_SHMQ\报价单.xls 模板原文一致） |
| 2 | 导出真实有效单 XZ202609078305（含规格/图片/成本） | ✅ 抬头完整：R1 地址、R2 `TEL : … FAX : …`、R3 整行星号线、R5 `QUOTATION LIST`、R7 `Customer/DATE`、R8 `ATTN`、R10 列表头；左上角嵌入公司 Logo 图（128×66，锚点 A1） |
| 3 | 线上 192.6.121.16 下载仍无整块抬头 | ⭕ **部署滞后**：8-30 之前的镜像（7.0=8-20 之前版本）无 Logo/新版抬头；uploads 卷未执行 seed 时亦无 `company-logo.png`（容器镜像内已内置 `seed-assets/`，但运行时不自动复制） |

> 依据「老系统」裁决公司信息：老系统导出/打印模板为 `HSTIP_SHMQ\报价单.xls`（2020-04-08，其 sheet 顶部：Logo 图形 Picture1 + 公司名 Arial24 + 地址 + TEL/FAX + 星号线 + QUOTATION LIST 宋体24 + Customer/DATE/ATTN），即代码与 seed 采用的 Lane 288 Tongxie 值。
> ⚠️ 注意：工作区根目录 `客户选样单_XZ202607302091.xlsx` **不是老系统导出件**——其抬头数值（Lane 298 Tongtao / +86-21-51876888 / +86-21-52845389）、客户「上海示例客户」与 MQ-0001 等与 2.0 版 seed 完全一致，属早期新系统（7-30~8 月上旬）构建输出，勿再作比对基准。

### 本次加固（代码）

`api/src/routes/exports.ts`：公司 Logo 文件解析增加回退链——优先 DB `logoUrl` 的 `/uploads/company-logo.png`；文件不存在（容器 uploads 卷未 seed / 新装环境）时**自动回退镜像内置 `seed-assets/company-logo.png`**（两个 Dockerfile 均已 COPY 该目录），保证任意环境导出都不丢 Logo。api typecheck 通过。

### 上线与复验（服务器 192.6.121.16）

```bash
git add -A && git commit && git push            # CI 自动构建 fabric-erp:7.0 + latest
docker compose --profile migrate run --rm migrate
# 关键：compose migrate 不跑 seed；需在容器内执行一次（幂等），
# 作用：① CompanyInfo 校正为 Lane 288 Tongxie / 51879008 / 52045389 ② 把 company-logo.png 复制进 uploads 卷
docker exec -it fabric-erp npm run seed
docker pull <DOCKER_HUB_USERNAME>/fabric-erp:latest
docker rm -f fabric-erp
docker run -d --name fabric-erp --env-file ./api.env -p 7776:3000 -v fabric-erp-uploads:/app/uploads <DOCKER_HUB_USERNAME>/fabric-erp:latest
```

复验：客户选样查询 → 任一有效单 → 导出 → 打开 Excel 核对 R1 地址 / R2 TEL:FAX / R3 星号线 / R5 QUOTATION LIST / 左上 Logo 图均存在；`GET /system/company-info` 返回 Tongxie 值。已生成的本地对照件：`.dbg/real-export-check.xlsx`（真实库 2026-09-08 导出，13 行×8 列）。

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
