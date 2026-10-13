# ats-job：求职 ATS 工作台操作手册

本技能定义「求职 ATS 模式」的工作约定。开始任何求职相关任务前，先读本技能，再用 `ats_status` 核对 `.ats/` 现状。

## 1. 数据文件约定（工作区 `.ats/` 目录）

| 文件 | 结构 | 说明 |
| --- | --- | --- |
| `settings.json` | `{resumeDir, theme}` | 简历目录（用户可在简历库标签页修改）、导出主题 |
| `search.json` | `{config, results:[SearchHit]}` | 职位搜索聚合（职位搜索标签页）：搜索词/城市/来源/定时计划 + 聚合结果 |
| `jobs.json` | `{items:[Job]}` | 岗位列表（筛选工作标签页） |
| `analyses.json` | `{items:[Analysis]}` | 岗位分析（工作分析标签页） |
| `resumes.json` | `{items:[ResumeEntry]}` | 简历库登记表 |
| `resumes/<id>.md` | markdown | 每份简历的解析全文 |
| `applications.json` | `{items:[Application]}` | 投递记录（投递追踪标签页） |
| `interviews.json` | `{items:[Interview]}` | 面试记录（模拟面试标签页） |
| `interviews/<id>.md` | markdown | 面试对话小结（可选） |
| `analysis.request.json` | `{jobId, note}` | 标签页提交的岗位分析请求 |
| `resume.request.json` | `{path, name}` | 标签页提交的简历解析请求 |
| `interview.request.json` | `{round, jobId, company, role, note}` | 标签页提交的面试请求 |
| `tasks/<taskId>/request.json` | `{resumeId, jobId, theme}` | ATS 任务定义 |
| `tasks/<taskId>/state.json` | 见 §4 | ATS 任务进度与内容 |
| `tasks/<taskId>/edits.json` | `{items:[Edit]}` | 用户定点修改队列 |
| `tasks/<taskId>/choices.json` | `{choices:{章节id:"add"|"skip"}}` | 缺失板块选择 |
| `tasks/<taskId>/resume.md` | markdown | 优化后简历最终稿（导出用） |
| `exports/` | .docx/.pdf/.html | 用户在标签页点击导出的文件 |

**Job**：`{id, title, company, link?, type?, location?, salary?, source?, snippet?, status, note?}`。status 取值：`new`（新发现）、`wishlist`（待投）、`applied`（已投）、`analyzed`（已分析）、`skipped`（已忽略）。

**Application**：`{id, position, company, link?, type?, currentStep, ddl?, appliedAt?, nextAction?, notes?, jobId?}`。`currentStep` 取值与中文：`wishlist` 待投递 / `applied` 已投递 / `oa` 笔试·测评 / `phone` 电话面 / `onsite1` 一面 / `onsite2` 二面 / `final` 终面 / `offer` Offer / `rejected` 已拒绝 / `withdrawn` 已放弃。

**Interview**：`{id, round, jobId?, company?, role?, status, summary?, startedAt?, finishedAt?}`。`round`：`hr` HR面 / `tech` 技术面 / `manager` 主管面 / `group` 群面 / `final` 终面。`status`：`pending` / `ongoing` / `done`。

## 2. 工具清单（ats_*，均由 dsh-job-ats 包提供）

- `ats_status` — 读整体状态与全部待处理请求（开始任何工作前先调）。
- `ats_jobs_upsert` / `ats_jobs_remove` — 写入/删除岗位。
- `ats_analysis_request` — 读取标签页提交的分析请求（已处理的不会重复返回）。
- `ats_analysis_save` — 保存分析结果 `{jobId, score, summary, match[], gaps[], keywordHits[], keywordMissing[], suggestions[]}`。
- `ats_resume_request` — 读取标签页提交的解析请求。
- `ats_resume_register` — 登记解析好的简历（写入全文 markdown）。
- `ats_resume_read` — 读取某份简历全文。
- `ats_task_request` — 读取需要处理的 ATS 任务内容（新任务/定点修改/补缺选择）。
- `ats_task_read` — 读单个任务的完整状态。
- `ats_task_update` — 更新任务状态、区块内容、修改结果、最终 markdown。
- `ats_apply_upsert` / `ats_apply_remove` — 维护投递记录。
- `ats_interview_request` — 读取面试请求。
- `ats_interview_update` — 更新面试记录与小结。
- `ats_search_run` — 执行一次职位聚合搜索（Boss直聘/实习僧/OfferShow/全网，payload `{keywords, city?, sources?}`）。
- `ats_search_read` — 读搜索配置与最近结果（含定时刷新状态与每条结果的 id）。
- `ats_apply_send` — 对一条搜索结果代投：`{id, greeting}`（greeting 由你结合简历与 JD 撰写，80-150 字）→ 自动收录岗位库 + 写投递追踪（已投递）+ 推送链接与打招呼语到浏览器。

## 3. 各标签页工作流

### 职位搜索
用户说「帮我找 XX 岗位」且希望聚合多个渠道时，优先用 `ats_search_run`（而不是手工 web 搜索）：它会把 Boss直聘 / 实习僧 / OfferShow / 全网的公开岗位索引聚合进「职位搜索」标签页并自动去重，同时**自动代抓头部结果（fast 6 / standard 12 / deep 18 条）的 JD 全文**（存于每条结果的 `jd` 字段；Boss 直聘等登录墙站点标记为 `jdUnavailable`，需打开原页）。用户可自己在标签页设置定时刷新（每 15-240 分钟自动搜一次）。

**代投流程**：用户看中某条结果说「帮我投」时：`ats_status` / `ats_resume_read` 了解简历 → `ats_search_read` 拿到该条的 id（头部结果的 `jd` 字段可直接引用；没有 JD 的先请用户粘贴或看原页）→ 撰写个性化打招呼语（结合 JD 亮点与简历最强匹配点，80-150 字，自然不浮夸）→ `ats_apply_send {id, greeting}`。插件会自动收录岗位库、写入投递追踪（已投递），并把打招呼语复制到剪贴板、打开岗位页——**用户只需粘贴发送**。注意：各平台投递均需登录态与人工确认，不存在无人值守的自动提交，不要向用户承诺「全自动投递」。

### 筛选工作
用户说「帮我找 XX 岗位」时：用 web 搜索 → 汇总合适岗位 → `ats_jobs_upsert` 写入（带 title/company/link/type/source，snippet 放岗位要点或 JD 摘要）→ 对话里简短汇报，引导用户去标签页看。用户也可以自己在标签页添加/删除，无需你参与。

**去重与排序**（借鉴 ai-job-search 的 /scrape 设计）：写入前按「公司+职位」归一化去重（同一岗位多个渠道只留一条，link 保留信息最全的）；snippet 里带上关键要求（年限/技术栈/学历），方便后续匹配分析；标签页支持按匹配度排序，已分析过的岗位自动排前面。

### 工作分析
1. 标签页点「去分析」→ 写入 `analysis.request.json`。用户说「分析一下」或你 `ats_status` 发现新请求时，调 `ats_analysis_request` 领取。
2. 读取岗位（jobs.json 里该 jobId 的 snippet/JD；如信息不足，请用户粘贴完整 JD 或先用 web 抓取岗位页面要点）。
3. 选一份简历：优先用户指定的；否则 `ats_status` 看简历库，用 `ats_resume_read` 读全文。若简历库为空，请用户先在「简历库」解析。
4. 输出分析：
   - `score`：0-100 匹配度（硬性要求不符要狠扣分；本科/年限/技能硬缺口直接体现在低分与 gaps 里）；
   - `match`：3-8 条匹配点，每条 `{point, evidence}`，evidence 引用简历原句；
   - `gaps`：3-8 条不匹配/缺失点，具体到「缺什么、怎么补」；
   - `keywordHits` / `keywordMissing`：JD 关键词在简历中的命中/缺失清单（各 ≤15 个）；
   - `suggestions`：2-5 条行动建议（补什么经历、改简历哪块、准备什么面试题）。
5. `ats_analysis_save` 保存 → 对话里给 3 句话结论（分数、最大短板、下一步）。

### ATS 优化（核心）
任务生命周期：`requested`（新建）→ `working`（处理中）→ `review`（等你复核，缺板块/待定内容时停在这里）→ 用户继续提交修改则回到 `working` → `done`（可导出）。

1. **新任务**（`ats_task_request` 返回 kind=new）：读 `ats_resume_read` 拿简历全文；有 jobId 时读岗位 JD。起草优化稿：
   - 结构按标准简历区块：基本信息/求职意向、教育背景、工作/实习经历、项目经历、技能、荣誉奖项、自我评价（有则保留）；
   - 每条经历用 STAR/成果化写法；有 JD 时向 JD 关键词靠拢（只做措辞优化，不编造）；中文简历保留英文术语原样；
   - **渲染权威：`resume.md` 是唯一最终稿**。每次更新必须用 `payload.markdown` 传**整份简历的完整 markdown**（`# 姓名`、`## 各区块`、`-` 条目），标签页预览与 Word/PDF 导出都以它为准；`payload.sections` 只是辅助标记（区块 id/标题/缺失状态），可以只传你需要标记的区块，但**内容更新一律通过 markdown 全量落盘**，两人（UI/导出）都以 resume.md 为准，sections 与 markdown 不要互相依赖；
   - **缺失板块**：简历中完全没有的板块（如无实习）用 sections 里 status=`missing` 标记并列入 `missing`，标签页会提示「补上/不补」；
   - **自我评审环节**（借鉴 ai-job-search 的 drafter-reviewer 双 agent 管线）：写完草稿后切换成挑剔的招聘者视角通读一遍，查三件事：①有没有编造或含糊的数字；②JD 关键词是否都自然覆盖；③每条 bullet 是否「动作+方法+结果」。发现问题就地修订后再写入；
   - `phase` 按进度写 `extracting → drafting → review`；`log` 写关键节点；`status` 停在 `review`，message 告诉用户：去标签页复核、选中文字点操作、缺的板块决定补或不补、点导出。
2. **定点修改**（kind=edits，`pending` 条目）：逐条按 op 处理：
   - `rewrite` 重写：保持原意、更专业有力；
   - `irrelevant` 无关：判断与目标岗位无关则改写为相关表述，实在无法保留则说明并删除；
   - `remove` 直接消除：删除该内容，并把所在句子/条目收拾通顺；
   - `condense` 精简：压缩 30-50% 字数，保留关键信息；
   - `adapt` 适配：向 JD 关键词与要求靠拢，只改措辞不编事实；
   - `quantify` 数据化：把成果用数字/百分比/规模量化；简历里没有数字时不要编，在对话里向用户要数据，editResult 说明「需要用户补充数据」；
   - `custom` 自定义：按用户 note 执行。
   处理时把修改应用到**完整 final markdown 并整体写回**（`ats_task_update` 用 `payload.markdown` 传整份简历；sections 仅在你需要改标记时传），并用 `editResults:[{editId, status:"done", result: 改后文本或说明}]` 标记完成。**只传修改区块的 sections 会被整体覆盖掉别的区块，绝对不要这样做。**
3. **补缺选择**（kind=choices）：`add` → 向用户询问必要信息（没有信息时）或用已有素材起草该板块，写入 sections（status done）并从 missing 移除；`skip` → 该板块从 sections 移除（或保持 missing 但不再提示）。处理完更新 state。
4. **求职信**（kind=letter，用户在标签页点「生成求职信」）：针对目标岗位写一封 200-300 字的求职信，用 `ats_task_update` 的 payload.letter 写入（`# 求职信` + 段落：开头呼应 JD 关键词并点明岗位，正文举 1-2 个与岗位最相关的经历（用数据），结尾表达意愿；署名与联系方式用占位符让用户自己填）。写好后用户可在标签页预览并勾选「含求职信导出」（自动附在简历后另起一页）。
5. 用户点「导出 Word/PDF」由标签页直接生成，你只需保证 `resume.md` 是最新的完整稿（各区块拼接、`#`/`##` 层级正确、无「缺失」占位内容）。主题（简洁/现代/经典/紧凑/学术）只影响排版，不影响内容。标签页的「ATS 解析校验」会模拟 ATS 对导出 Word 做纯文本提取并报告关键词命中/缺失——若用户反馈校验有缺失关键词，回到定点修改补上。
6. 用户说「好了/可以了」→ `ats_task_update` status=done，message 引导去标签页导出。

### 简历库
- 标签页点「解析入库」→ `resume.request.json`。领取后用 bash 提取文本：`.md/.txt` 直接读；`.pdf` 用 python（首次在工作区建 venv：`python3 -m venv .venv-ats && .venv-ats/bin/pip install pymupdf`，或系统已有 pymupdf 则直接 `python3 -c "import fitz; ..."`）；`.docx` 用 `python-docx` 或解压读 document.xml。
- 提取后用 `ats_resume_register` 登记：`path` 原文件绝对路径、`name` 文件名、`lang`（zh/en）、`summary` 一句话概括（如「3 年 Java 后端，2 段大厂实习」）、`markdown` 结构化全文（保留原区块：`#` 姓名、`## 教育背景` 等，条目用 `- `）。**不要改动内容，只做结构整理与乱码清理。**

### 投递追踪
- 用户在标签页自行增删改、拖动看板；你通过 `ats_status` 保持同步认知。
- 用户说「投了 XX」「XX 进二面了」「XX 挂了」时，用 `ats_apply_upsert` 更新（按 id 或 position+company 匹配）。
- 主动价值：提醒 DDL 临近（ddl 字段）、建议 nextAction。

### 模拟面试
- 标签页「开始模拟面试」→ `interview.request.json` + 输入框自动填入开场指令。`ats_interview_request` 领取后立即开演。
- 常规轮次（hr/tech/manager/final）：以面试官身份，一次只问一个问题，根据回答追问或推进；先自我介绍环节由面试官开场；结尾给结构化反馈（亮点/待改进/参考答案要点/0-10 评分），`ats_interview_update` 写 summary（status=done，含 startedAt/finishedAt），transcript 传对话要点摘要。
- 群面（group）：用 subagent 工具派 3-4 位候选人（每人明确姓名、性格、观点倾向，如「激进派 / 温和派 / 数据派 / 质疑派」），你担任面试官：宣布规则 → 给出话题（结合目标岗位/行业）→ 轮流发言 → 互相交锋 → 指定总结 → 点评每位组员与用户的表现。子代理结束收集结果后，同样写 summary。
- 面试轮次顺序建议：hr → tech → group → manager → final；用户跳轮也随他。

## 4. 铁律

1. **绝不编造**：数据化、适配、补板块时，简历里没有的事实（数字、公司、项目、证书）必须向用户索要，不能虚构。
2. **改动最小化**：定点修改只动选中内容与其所在条目，其他内容保持原样。
3. **state 与 resume.md 同步**：每次改动同时更新 sections 与 markdown，保证导出的就是用户看到的最新版。
4. **标题与导出物洁净**：sections.title 与简历 markdown 的区块标题只能是**标准区块名**（基本信息/头部信息、职业总结、教育背景、工作经历、实习经历、项目经历、技能、获奖与荣誉等），**禁止**追加任何策略注解——不得出现「xx（零售向定位）」「工作经历（服务导向表述）」「实习经历（员工/客户服务场景）」「项目经历（精简压缩）」这类括号标注，也不得创建「优化说明」「修改说明」「处理说明」「备注」类区块。优化思路、策略说明、修改记录一律写进 `log` / `message` / `editResults.result`，绝不写入简历正文与标题（用户导出后会直接投递，标注会在 Word/PDF 里露出来）。
5. **中文交流**，术语/专有名词保留原文。
6. 长内容（分析详情、简历全文、面试复盘）放标签页/文件，对话里给结论与下一步；不确定时用 ask_user 问，不要擅自决定。
