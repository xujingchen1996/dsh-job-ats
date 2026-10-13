# 求职 ATS 模式 · DeepSeek Harness 预设

一个跑在 [DeepSeek Harness](https://deepseek.com)（dsh）上的**求职全流程工作台**：七个浏览器标签页 + 对话助手协作，覆盖找工作到拿 offer 的全链路。

> 求职 ATS 模式 = 一个 **agent preset**（人格 + 模型工具 + 技能手册）+ 一个 **web 包**（七个 Tab UI + `/ats-api` 接口 + Word/PDF 导出引擎）。

## 功能

| 标签页 | 能做什么 |
|---|---|
| **职位搜索** | 聚合 **Boss直聘 / 实习僧 / OfferShow / 全网** 公开岗位索引（经搜索引擎 site: 限定）；关键词+城市+来源筛选；**三档深度**（快/标准/深度 = 每来源 1/2/4 个查询变体，深度档 16 个查询、数百条）；**JD 自动抓取**（搜索完自动代抓头部结果、点开即看，其余点开自动补抓；Boss 等登录墙站点诚实标注并引导原页）；**定时刷新**（15-240 分钟自动搜索、去重合并）；左列表右详情，点开看 **JD + 薪资/城市/来源标签**；**🚀 一键代投**（生成打招呼语自动复制 + 打开岗位页 + 写入投递追踪）；可一键收录进岗位库 |
| **筛选工作** | 让助手联网搜索岗位（不限门户、支持中英文），自动去重后列出；可手动增删、标记已投/忽略；支持按**匹配度排序** |
| **工作分析** | 逐岗位分析**匹配度评分（0-100）**、✓ 匹配点（附简历证据）、✗ 不匹配/缺口、JD 关键词命中与缺失、行动建议；卡片默认收起、点击展开，可一键全部展开/收起 |
| **ATS 优化** | 简历分块预览；**点区块 / 点句子 / 鼠标拖选** → 覆盖菜单（**重写 / 无关 / 直接消除 / 精简 / 适配 / 数据化 / 自定义**）；待处理修改队列支持**逐条修改/删除**；缺失板块提示「补上/不补」；**🔍 ATS 解析校验**（模拟 ATS 纯文本提取，报告关键词命中/缺失）；**求职信生成**与「含求职信导出」；**🎨 五种风格预览**（简洁/现代/经典/紧凑/学术）；导出 **Word / PDF / HTML** |
| **简历库** | 列出简历文件夹里的 PDF/Word/Markdown，交给助手解析入库；多份简历管理、查阅、一键发起 ATS 优化 |
| **投递追踪** | **表格 / 看板双模式**；字段含职位、公司、链接、类型、当前步骤、DDL、下一步行动、备注；看板卡片**拖动即更新进度**；DDL 临近自动变色 |
| **模拟面试** | HR 面 → 技术面 → 主管面 → 终面；**群面**由多个 AI 组员（subagent）参与讨论；常见问题速查 + 🔊 朗读（模拟 HR 电话） |

设计上参考了 [interviewstreet/hiring-agent](https://github.com/interviewstreet/hiring-agent) 的评分思路（证据化评分、公平性规则）与 [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) 的工作流（求职信、ATS 可解析性校验、草稿-评审管线、去重排序）。

## 安装

### 一键安装（推荐）

```bash
bash install.sh
```

脚本自动完成 5 处接线（幂等，可重复运行）：

1. 预设 → `~/.dsh/.agent-presets/job-ats/`
2. 包 → `~/.dsh/profiles/web/packages/dsh-job-ats/`
3. 挂载注册 → `~/.dsh/profiles/web/cordis.patch.yml`
4. 工作区清单 → `~/.dsh/profiles/web/pnpm-workspace.yaml`
5. 加载器符号链接 → `~/.dsh/profiles/node_modules/dsh-job-ats`

安装后**重启 dsh web 服务**，新建会话时在预设选择器里选「求职 ATS 模式」即可。

### 手动安装

```bash
DSH=~/.dsh
cp -R preset "$DSH/.agent-presets/job-ats"
cp -R package "$DSH/profiles/web/packages/dsh-job-ats"
mkdir -p "$DSH/profiles/node_modules"
ln -sfn ../web/packages/dsh-job-ats "$DSH/profiles/node_modules/dsh-job-ats"
# 然后在 $DSH/profiles/web/cordis.patch.yml 追加：
#   - insert:
#       - id: job-ats-studio
#         name: dsh-job-ats
#         config:
#           mode: api
# 并在 pnpm-workspace.yaml 的 packages 列表加入 packages/dsh-job-ats
```

## 使用流程

1. **解析简历**：把简历（PDF/Word/MD）放进一个文件夹，在「简历库」填路径 → 点「解析入库」→ 对话里让助手解析；
2. **找岗位**：「职位搜索」里设关键词一键聚合（或对话里说「帮我找 10 个 XX 岗位」）→ 结果在「职位搜索」/「筛选工作」；看中的点 **🚀 一键代投**（打招呼语自动复制 + 打开岗位页粘贴发送，同时写入投递追踪）；
3. **做分析**：点「去分析」→ 对话里让助手分析 → 「工作分析」看匹配度与缺口；
4. **优化简历**：新建 ATS 任务（选简历 + 目标岗位）→ 对话里说「开始优化」→ 回标签页复核、**选区修改**、补缺 → 先跑「ATS 解析校验」→ 导出 Word/PDF；
5. **投递追踪**：「投递追踪」记录进度（看板拖动更新）；
6. **模拟面试**：选轮次 → 开始面试 → 对话里实战演练。

> 核心机制：**网页负责展示与交互，助手负责干活**；两边通过工作区 `.ats/` 目录的数据文件保持一致。

## 环境要求

| 项目 | 要求 |
|---|---|
| 系统 | macOS（PDF 导出依赖本机 Google Chrome；Windows/Linux 无 Chrome 时自动降级为 HTML 导出） |
| dsh | 0.2.x（本版本针对 **0.2.0-rc.2** 适配；职位搜索依赖 host 的 `web` 服务与 DeepSeek 搜索 provider） |
| 可选 | Google Chrome（PDF 导出）、Python 3（解析 PDF/DOCX 简历时助手会用） |

## 目录结构

```
preset/            # agent preset（挂到 ~/.dsh/.agent-presets/job-ats/）
├── preset.yml         # 预设显示名与描述
├── agent.cordis.yml   # 模式组成：persona + 模型工具行（dsh-job-ats mode: tools）
└── skills/ats-job/    # 助手工作手册（数据约定、各标签页工作流、铁律）
package/           # web 包（挂到 ~/.dsh/profiles/web/packages/dsh-job-ats/）
├── package.json
└── lib/
    ├── index.js       # host 半边：/ats-api 路由 + 18 个 ats_* 模型工具 + 导出净化
    ├── client.js      # 浏览器半边：七个 Tab UI
    └── docx.js        # 导出引擎：DOCX（纯 JS 打包）+ 主题化 HTML（供 Chrome 转 PDF）
```

## 数据安全

- 所有求职数据（岗位、分析、简历、投递、面试）都存在**各自会话工作区的 `.ats/` 目录**，本仓库不含任何个人数据；
- 助手遵循「**绝不编造**」铁律：数据化/适配只能基于简历已有事实或用户补充信息；
- 导出前自动净化：误写进标题的优化标注（如「工作经历（服务导向表述）」）会被剔除，合法括号（日期、技术栈）保留。

## 已知限制

- 岗位搜索走通用 web 搜索 + 搜索引擎 site: 限定聚合（不做特定招聘网站爬虫、不绕过登录墙），深度取决于目标站点的公开索引质量；Boss直聘等站点详情页需登录，JD 以摘要与原页为准；
- **一键代投是半自动**（合规与账号安全考虑）：自动完成「生成打招呼语 → 复制 → 打开岗位页 → 登记投递追踪」，粘贴发送由用户完成；不存在无人值守的自动提交；
- 群面模拟依赖 subagent 能力，会消耗更多 token。

## License

MIT
