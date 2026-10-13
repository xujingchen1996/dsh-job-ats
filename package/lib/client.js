// dsh-job-ats browser bundle.
//
// Hand-written classic-script bundle in the ClientModuleLoader envelope:
// registers seven view tabs in the `conversation.view` slot (职位搜索 / 筛选工作
// / 工作分析 / ATS 优化 / 简历库 / 投递追踪 / 模拟面试) and reads/writes the
// workspace `.ats/*` job-hunt state through the host half's `/ats-api/*` routes.
window.__ModuleLoader__.load({
  id: "dsh-job-ats",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })

    const React = require("react")

function sessionPreset(row) {
      if (row == null) return undefined
      if (typeof row.agentPreset === "string" && row.agentPreset.length > 0) return row.agentPreset
      const pv = row.projectionValues
      if (pv && typeof pv.agentPreset === "string" && pv.agentPreset.length > 0) return pv.agentPreset
      return undefined
    }


    const h = React.createElement

    // ── constants ───────────────────────────────────────────────────────────

    const STEP_ORDER = ["wishlist", "applied", "oa", "phone", "onsite1", "onsite2", "final", "offer", "rejected", "withdrawn"]
    const STEP_LABELS = {
      wishlist: "待投递", applied: "已投递", oa: "笔试·测评", phone: "电话面",
      onsite1: "一面", onsite2: "二面", final: "终面", offer: "Offer",
      rejected: "已拒绝", withdrawn: "已放弃",
    }
    const STEP_COLORS = {
      wishlist: "gray", applied: "blue", oa: "violet", phone: "cyan",
      onsite1: "green", onsite2: "green", final: "orange", offer: "gold",
      rejected: "red", withdrawn: "gray",
    }
    const ROUNDS = ["hr", "tech", "manager", "group", "final"]
    const ROUND_LABELS = { hr: "HR 面", tech: "技术面", manager: "主管面", group: "群面", final: "终面" }
    const OPS = [
      { op: "rewrite", label: "重写", icon: "✍️", hint: "保持原意重新表达，更专业更有力" },
      { op: "irrelevant", label: "无关", icon: "🚫", hint: "与目标岗位无关：分析后改写或建议删除" },
      { op: "remove", label: "直接消除", icon: "🗑️", hint: "删除所选内容" },
      { op: "condense", label: "精简", icon: "✂️", hint: "压缩字数，只保留关键信息" },
      { op: "adapt", label: "适配", icon: "🎯", hint: "向 JD 的关键词与要求靠拢（不编造）" },
      { op: "quantify", label: "数据化", icon: "📊", hint: "用数字/百分比/规模量化成果" },
      { op: "custom", label: "自定义", icon: "⚙️", hint: "按你自己的指令修改" },
    ]
    const THEME_ORDER = ["minimal", "modern", "classic", "compact", "academic"]
    const THEME_LABELS = { minimal: "简洁", modern: "现代", classic: "经典", compact: "紧凑", academic: "学术" }
    const THEME_META = {
      minimal: { label: "简洁", font: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif', heading: "#1a1a1a", accent: "#444444", body: "#222222", h1: 22, h2: 14, bodySize: 10.5, lineH: 1.45, rule: false },
      modern: { label: "现代", font: '"SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif', heading: "#1d4ed8", accent: "#2563eb", body: "#1f2937", h1: 23, h2: 14, bodySize: 10.5, lineH: 1.45, rule: true },
      classic: { label: "经典", font: 'Georgia, "Songti SC", "SimSun", serif', heading: "#333333", accent: "#8a6d3b", body: "#1a1a1a", h1: 22, h2: 14.5, bodySize: 11, lineH: 1.5, rule: false },
      compact: { label: "紧凑", font: '"Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif', heading: "#111111", accent: "#333333", body: "#1f1f1f", h1: 20, h2: 13, bodySize: 9.5, lineH: 1.25, rule: false },
      academic: { label: "学术", font: 'Palatino, "Songti SC", "SimSun", serif', heading: "#14532d", accent: "#166534", body: "#1f2937", h1: 22, h2: 14, bodySize: 10.5, lineH: 1.5, rule: true },
    }
    const SAMPLE_RESUME_MD = [
      "# 张三｜后端开发工程师",
      "",
      "- 电话：138-0000-0000 | 邮箱：zhangsan@example.com | GitHub：github.com/zhangsan",
      "",
      "## 教育背景",
      "",
      "- **某某大学** · 计算机科学与技术 本科（2021-2025）",
      "",
      "## 工作 / 实习经历",
      "",
      "- **字节跳动** · 后端开发实习生（2024.06 - 2024.12）",
      "- 参与推荐系统服务重构，核心接口 QPS 提升 40%",
      "- 2024.06 - 2024.09 获团队季度之星",
      "",
      "## 项目经历",
      "",
      "- **校园二手交易平台**（Python / Django / MySQL）",
      "- 独立完成订单与支付模块，上线后日均订单 800+",
      "- 服务全校 3000+ 用户，获校内创新赛一等奖",
      "",
      "## 技能",
      "",
      "- Python / Go / MySQL / Redis / Docker / Linux",
    ].join("\n")

    // ── api bridge ──────────────────────────────────────────────────────────

    // 10s timeout so a hung / intercepted request (stale PWA Service Worker,
    // dead proxy) surfaces as an explicit error instead of "loading" forever.
    async function fetchWithTimeout(url, options, ms) {
      const timeoutMs = typeof ms === "number" ? ms : 10000
      let controller = null
      let timer = null
      const opts = Object.assign({}, options || {})
      try {
        if (typeof AbortController === "function") {
          controller = new AbortController()
          opts.signal = controller.signal
          timer = setTimeout(() => controller.abort(), timeoutMs)
        }
        return await fetch(url, opts)
      } catch (err) {
        if (err && (err.name === "AbortError" || /aborted/i.test(String(err.message || "")))) {
          throw new Error("请求超时（" + Math.round(timeoutMs / 1000) + " 秒无响应）。可能是浏览器缓存 / PWA Service Worker 拦截了请求：请硬刷新（Cmd+Shift+R），或在浏览器里用 http://127.0.0.1:3080 重新打开本页面。")
        }
        throw err
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
    }

    async function apiGet(sessionId, path) {
      const res = await fetchWithTimeout("/ats-api" + path + (path.includes("?") ? "&" : "?") + "sessionId=" + encodeURIComponent(sessionId))
      return await res.json()
    }

    async function apiPost(sessionId, path, body, ms) {
      const res = await fetchWithTimeout("/ats-api" + path + (path.includes("?") ? "&" : "?") + "sessionId=" + encodeURIComponent(sessionId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }, ms)
      return await res.json()
    }

    function downloadUrl(url) {
      const a = document.createElement("a")
      a.href = url
      a.download = ""
      document.body.appendChild(a)
      a.click()
      setTimeout(() => a.remove(), 500)
    }

    // ── shared state store (one poller per mounted tab) ─────────────────────

    function useAtsStore(sessionId) {
      // window.__ATS_TEST__ is only set by offline render tests; undefined in production.
      const testSeed = typeof window.__ATS_TEST__ === "object" && window.__ATS_TEST__ !== null ? window.__ATS_TEST__.state : null
      const [state, setState] = React.useState(testSeed)
      const [error, setError] = React.useState(null)
      const refresh = React.useCallback(async () => {
        if (!sessionId) return
        try {
          const json = await apiGet(sessionId, "/state")
          if (json && json.ok) {
            setState((prev) => (JSON.stringify(prev) === JSON.stringify(json) ? prev : json))
            setError(null)
          } else {
            setError((json && json.error) || "加载失败")
          }
        } catch (err) {
          setError(String((err && err.message) || err))
        }
      }, [sessionId])
      React.useEffect(() => {
        if (!sessionId) return
        setState(null)
        setError(null)
        refresh()
        const timer = setInterval(() => {
          apiGet(sessionId, "/state")
            .then((json) => {
              if (json && json.ok) {
                setState((prev) => (JSON.stringify(prev) === JSON.stringify(json) ? prev : json))
                setError(null)
              }
            })
            .catch(() => {})
        }, 3000)
        return () => clearInterval(timer)
      }, [sessionId, refresh])
      return { state, error, refresh }
    }

    // ── UI atoms ────────────────────────────────────────────────────────────

    function Panel({ title, hint, actions, children }) {
      return h(
        "div",
        { className: "ats-root" },
        h(
          "div",
          { className: "ats-header" },
          h("div", { className: "ats-header-text" },
            h("h3", { className: "ats-title" }, title),
            hint ? h("p", { className: "ats-hint" }, hint) : null),
          actions && actions.length ? h("div", { className: "ats-header-actions" }, actions) : null,
        ),
        children,
      )
    }

    function Status({ text, tone }) {
      // 「加载中…」超过 8 秒自动给出诊断与刷新入口，避免永远转圈无信息。
      const [slow, setSlow] = React.useState(false)
      React.useEffect(() => {
        if (typeof text !== "string" || !text.startsWith("加载中")) {
          setSlow(false)
          return undefined
        }
        const timer = setTimeout(() => setSlow(true), 8000)
        return () => clearTimeout(timer)
      }, [text])
      if (tone === "error") return h("div", { className: "ats-status ats-status-error" }, text)
      return h(
        "div",
        { className: "ats-status" },
        text,
        slow
          ? h(
            "div",
            { className: "ats-status-slow" },
            "超过 8 秒仍未响应。后端接口本身正常（已实测毫秒级返回），常见原因是浏览器缓存或 PWA / Service Worker 拦截了请求。",
            h("div", { style: { marginTop: "8px" } },
              h("button", { className: "ats-btn", type: "button", onClick: () => { try { location.reload() } catch {} } }, "硬刷新试试（Cmd+Shift+R）")),
          )
          : null,
      )
    }

    function Btn({ children, onClick, kind, disabled, title }) {
      return h(
        "button",
        {
          className: "ats-btn" + (kind === "primary" ? " ats-btn-primary" : kind === "danger" ? " ats-btn-danger" : ""),
          onClick,
          disabled: !!disabled,
          title: title || "",
          type: "button",
        },
        children,
      )
    }

    function Badge({ text, tone, title }) {
      return h("span", { className: "ats-badge ats-badge-" + (tone || "gray"), title: title || "" }, text)
    }

    function Chip({ text, tone, onClick, active }) {
      return h(
        "button",
        { className: "ats-chip" + (active ? " ats-chip-active" : "") + (tone ? " ats-chip-" + tone : ""), onClick, type: "button" },
        text,
      )
    }

    function Field({ label, children }) {
      return h("div", { className: "ats-field" }, h("label", { className: "ats-label" }, label), children)
    }

    function Modal({ title, onClose, children, wide }) {
      return h(
        "div",
        { className: "ats-modal-backdrop", onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
        h(
          "div",
          { className: "ats-modal" + (wide ? " ats-modal-wide" : "") },
          h("div", { className: "ats-modal-head" },
            h("span", { className: "ats-modal-title" }, title),
            h("button", { className: "ats-btn", onClick: onClose, type: "button" }, "✕")),
          children,
        ),
      )
    }

    function useToast() {
      const [toast, setToast] = React.useState(null)
      const flash = React.useCallback((text, tone) => {
        setToast({ text, tone: tone || "ok" })
        setTimeout(() => setToast(null), 3200)
      }, [])
      return { toast, flash }
    }

    function ToastView({ toast }) {
      if (!toast) return null
      return h("div", { className: "ats-toast" + (toast.tone === "error" ? " ats-toast-error" : "") }, toast.text)
    }

    function emptyHint(text) {
      return h("div", { className: "ats-status" }, text)
    }

    // ── markdown-lite (React elements, no innerHTML) ────────────────────────

    function inlineRuns(text) {
      const runs = []
      const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
      for (const part of parts) {
        if (part.length === 0) continue
        if (/^\*\*[^*]+\*\*$/.test(part)) runs.push({ text: part.slice(2, -2), bold: true })
        else runs.push({ text: part, bold: false })
      }
      return runs
    }

    function runsToNodes(runs, keyBase) {
      return runs.map((run, i) => run.bold
        ? h("strong", { key: keyBase + "-b" + i }, run.text)
        : run.text)
    }

    function parseMdBlocks(markdown) {
      const blocks = []
      for (const raw of String(markdown || "").replace(/\r\n?/g, "\n").split("\n")) {
        const line = raw.trimEnd()
        if (/^#\s+/.test(line)) blocks.push({ type: "h1", text: line.replace(/^#\s+/, "").trim() })
        else if (/^##\s+/.test(line)) blocks.push({ type: "h2", text: line.replace(/^##\s+/, "").trim() })
        else if (/^[-*•]\s+/.test(line)) blocks.push({ type: "li", text: line.replace(/^[-*•]\s+/, "") })
        else if (line.trim().length === 0) blocks.push({ type: "blank", text: "" })
        else blocks.push({ type: "p", text: line.trim() })
      }
      return blocks
    }

    // ── Tab 1: 筛选工作 ─────────────────────────────────────────────────────

    function JobsPanel({ store, sessionId }) {
      const { toast, flash } = useToast()
      const [adding, setAdding] = React.useState(false)
      const [draft, setDraft] = React.useState(null)
      const [sortBy, setSortBy] = React.useState("new")

      const state = store.state
      if (state === null) return h(Panel, { title: "筛选工作", children: h(Status, { text: "加载中…" }) })
      if (store.error) return h(Panel, { title: "筛选工作", children: h(Status, { text: "加载失败：" + store.error, tone: "error" }) })
      const jobs = state.jobs || []
      const scoreByJob = new Map((state.analyses || []).map((a) => [String(a.jobId), a.score]))
      const sortedJobs = sortBy === "score"
        ? jobs.slice().sort((a, b) => (scoreByJob.get(String(b.id)) ?? -1) - (scoreByJob.get(String(a.id)) ?? -1))
        : jobs

      async function analyze(job) {
        const json = await apiPost(sessionId, "/job-analyze", { jobId: job.id })
        if (json && json.ok) flash(`已把「${job.title || job.company}」加入分析队列，去对话里让助手分析吧 ✍️`)
        else flash((json && json.error) || "提交失败", "error")
        store.refresh()
      }

      async function markApplied(job) {
        const json = await apiPost(sessionId, "/applications", {
          action: "add",
          item: { position: job.title, company: job.company, link: job.link, type: job.type || "社招", currentStep: "applied", jobId: job.id },
        })
        if (json && json.ok) {
          flash("已加入「投递追踪」（已投递）✓")
          const json2 = await apiPost(sessionId, "/jobs", { action: "add", item: Object.assign({}, job, { status: "applied" }) })
          if (json2 && json2.ok) store.refresh()
        } else flash((json && json.error) || "提交失败", "error")
      }

      async function markSkipped(job) {
        const json = await apiPost(sessionId, "/jobs", { action: "add", item: Object.assign({}, job, { status: "skipped" }) })
        if (json && json.ok) { flash("已标记忽略"); store.refresh() }
        else flash((json && json.error) || "提交失败", "error")
      }

      async function removeJob(job) {
        if (!window.confirm(`确定删除「${job.title || job.company}」吗？`)) return
        const json = await apiPost(sessionId, "/jobs", { action: "remove", ids: [job.id] })
        if (json && json.ok) store.refresh()
        else flash((json && json.error) || "删除失败", "error")
      }

      async function submitAdd() {
        if (!draft || (!draft.title && !draft.company)) {
          flash("至少填写职位或公司", "error")
          return
        }
        const json = await apiPost(sessionId, "/jobs", { action: "add", item: draft })
        if (json && json.ok) {
          flash("已添加岗位 ✓")
          setAdding(false)
          setDraft(null)
          store.refresh()
        } else flash((json && json.error) || "添加失败", "error")
      }

      const statusText = { new: "新发现", wishlist: "待投", applied: "已投", analyzed: "已分析", skipped: "已忽略" }

      return h(
        Panel,
        {
          title: "筛选工作",
          hint: "让助手在对话里帮你联网搜索岗位（“帮我找 5 个 XX 岗位”），找到后会自动列在这里。也可以手动添加。",
          actions: [
            h(Btn, { key: "add", kind: "primary", onClick: () => { setDraft({ title: "", company: "", link: "", type: "" }); setAdding(true) } }, "＋ 手动添加"),
            h(Btn, { key: "refresh", onClick: store.refresh }, "刷新"),
          ],
        },
        h("div", { className: "ats-toast-wrap" }, h(ToastView, { toast })),
        jobs.length === 0
          ? emptyHint("暂无岗位。去对话里让助手帮你找吧，例如：「帮我找 10 个北京的后端开发实习岗位，要求 Python」")
          : h(
            "div",
            null,
            h(
              "div",
              { className: "ats-mode-row" },
              h("span", { className: "ats-dim" }, "排序："),
              h("select", { className: "ats-input", style: { width: "auto" }, value: sortBy, onChange: (e) => setSortBy(e.target.value) },
                h("option", { value: "new" }, "最新添加"),
                h("option", { value: "score" }, "匹配度从高到低")),
              h("span", { className: "ats-dim" }, "匹配度来自「工作分析」，未分析的排在最后"),
            ),
            h(
              "div",
              { className: "ats-card-list" },
              sortedJobs.map((job) => {
                const analyzed = (state.analyses || []).some((a) => String(a.jobId) === String(job.id))
                const score = scoreByJob.get(String(job.id))
                return h(
                "div",
                { key: job.id, className: "ats-card" },
                h(
                  "div",
                  { className: "ats-card-main" },
                  h("div", { className: "ats-card-title" },
                    job.title || "（未命名职位）",
                    job.company ? ` @ ${job.company}` : "",
                    h(Badge, { text: statusText[job.status] || job.status, tone: job.status === "applied" ? "blue" : job.status === "analyzed" ? "green" : job.status === "skipped" ? "gray" : "gold" }),
                    typeof score === "number" ? h(Badge, { text: "匹配 " + score, tone: score >= 80 ? "green" : score >= 60 ? "blue" : score >= 40 ? "orange" : "red" }) : null),
                  h(
                    "div",
                    { className: "ats-card-tags" },
                    job.type ? h(Badge, { text: job.type, tone: "violet" }) : null,
                    job.location ? h(Badge, { text: job.location, tone: "cyan" }) : null,
                    job.salary ? h(Badge, { text: job.salary, tone: "green" }) : null,
                    job.source ? h(Badge, { text: job.source, tone: "gray" }) : null,
                    analyzed ? h(Badge, { text: "已分析 ✓", tone: "green" }) : null,
                  ),
                  job.snippet
                    ? h("div", { className: "ats-card-snippet" }, job.snippet.slice(0, 220) + (job.snippet.length > 220 ? "…" : ""))
                    : null,
                ),
                h(
                  "div",
                  { className: "ats-card-actions" },
                  job.link ? h("a", { className: "ats-btn", href: job.link, target: "_blank", rel: "noreferrer noopener" }, "打开链接 ↗") : null,
                  h(Btn, { onClick: () => analyze(job) }, analyzed ? "重新分析" : "去分析"),
                  h(Btn, { onClick: () => markApplied(job), disabled: job.status === "applied" }, job.status === "applied" ? "已投递 ✓" : "标记已投"),
                  h(Btn, { onClick: () => markSkipped(job), disabled: job.status === "skipped" }, "忽略"),
                  h(Btn, { kind: "danger", onClick: () => removeJob(job) }, "删除"),
                ),
              )
            }),
            ),
          ),
        adding
          ? h(
            Modal,
            { title: "手动添加岗位", onClose: () => setAdding(false) },
            h(Field, { label: "职位 *" }, h("input", { className: "ats-input", value: draft.title, placeholder: "如：后端开发工程师", onChange: (e) => setDraft(Object.assign({}, draft, { title: e.target.value })) })),
            h(Field, { label: "公司 *" }, h("input", { className: "ats-input", value: draft.company, placeholder: "如：字节跳动", onChange: (e) => setDraft(Object.assign({}, draft, { company: e.target.value })) })),
            h(Field, { label: "链接" }, h("input", { className: "ats-input", value: draft.link, placeholder: "https://…", onChange: (e) => setDraft(Object.assign({}, draft, { link: e.target.value })) })),
            h(Field, { label: "类型" }, h("select", { className: "ats-input", value: draft.type, onChange: (e) => setDraft(Object.assign({}, draft, { type: e.target.value })) },
              ["", "校招", "社招", "实习", "内推", "远程"].map((t) => h("option", { key: t, value: t }, t || "—")))),
            h("div", { className: "ats-editor-actions" },
              h(Btn, { kind: "primary", onClick: submitAdd }, "添加"),
              h(Btn, { onClick: () => setAdding(false) }, "取消")),
          )
          : null,
      )
    }

    // ── Tab 2: 工作分析 ─────────────────────────────────────────────────────

    // Module-level so 展开/收起 状态 survives polling re-renders and tab switches.
    let expandedAnalyses = new Set()

    function AnalysisPanel({ store, sessionId }) {
      const { toast, flash } = useToast()
      const [atsDraft, setAtsDraft] = React.useState(null)
      const [expandedJobs, setExpandedJobs] = React.useState(expandedAnalyses)

      function toggleJob(jobId) {
        const next = new Set(expandedAnalyses)
        if (next.has(jobId)) next.delete(jobId)
        else next.add(jobId)
        expandedAnalyses = next
        setExpandedJobs(next)
      }

      function expandAll() {
        const next = new Set(analyzedJobs ? analyzedJobs.map((job) => String(job.id)) : [])
        expandedAnalyses = next
        setExpandedJobs(next)
      }

      function collapseAll() {
        expandedAnalyses = new Set()
        setExpandedJobs(new Set())
      }
      const state = store.state
      if (state === null) return h(Panel, { title: "工作分析", children: h(Status, { text: "加载中…" }) })
      if (store.error) return h(Panel, { title: "工作分析", children: h(Status, { text: "加载失败：" + store.error, tone: "error" }) })

      const jobs = state.jobs || []
      const analyses = state.analyses || []
      const byJob = new Map(analyses.map((a) => [String(a.jobId), a]))
      const pending = state.analysisRequest
      const analyzedJobs = jobs.filter((job) => byJob.has(String(job.id)))
      const unanalyzed = jobs.filter((job) => !byJob.has(String(job.id)))
      const parsedResumes = (state.resumes || []).filter((rs) => rs.parsed)

      async function requestAnalysis(job) {
        const json = await apiPost(sessionId, "/job-analyze", { jobId: job.id })
        if (json && json.ok) flash(`已把「${job.title || job.company}」加入分析队列，去对话里让助手分析吧 ✍️`)
        else flash((json && json.error) || "提交失败", "error")
        store.refresh()
      }

      function startAts(job) {
        if (parsedResumes.length === 0) {
          flash("请先在「简历库」标签页解析一份简历", "error")
          return
        }
        // 让用户明确选择用哪份简历，而不是默认选第一份
        setAtsDraft({ job, resumeId: parsedResumes[0] ? parsedResumes[0].id : "" })
      }

      async function confirmAts() {
        if (!atsDraft || !atsDraft.resumeId) {
          flash("请先选择简历", "error")
          return
        }
        const json = await apiPost(sessionId, "/task", { action: "create", resumeId: atsDraft.resumeId, jobId: atsDraft.job.id })
        if (json && json.ok) {
          flash("已创建 ATS 优化任务 ✓ 请切换到「ATS 优化」标签页查看")
          window.dispatchEvent(new CustomEvent("dsh-job-ats:task-created", { detail: { taskId: json.taskId, jobId: atsDraft.job.id } }))
          setAtsDraft(null)
          store.refresh()
        } else flash((json && json.error) || "创建失败", "error")
      }

      function scoreTone(score) {
        if (score >= 80) return "green"
        if (score >= 60) return "blue"
        if (score >= 40) return "orange"
        return "red"
      }

      return h(
        Panel,
        {
          title: "工作分析",
          hint: "分析你与每个岗位的匹配度与不匹配度：匹配点 = 你简历里能打的牌，缺口 = 面试前要补的功课。卡片默认收起，点击展开详情。",
          actions: [
            h(Btn, { key: "expand", onClick: expandAll }, "全部展开"),
            h(Btn, { key: "collapse", onClick: collapseAll }, "全部收起"),
            h(Btn, { key: "refresh", onClick: store.refresh }, "刷新"),
          ],
        },
        h("div", { className: "ats-toast-wrap" }, h(ToastView, { toast })),
        pending
          ? h("div", { className: "ats-notice" }, "分析请求已提交（" + (jobs.find((j) => String(j.id) === pending.jobId)?.title || pending.jobId) + "），去对话里让助手开始分析。")
          : null,
        analyzedJobs.length === 0 && unanalyzed.length === 0
          ? emptyHint("暂无岗位。先去「筛选工作」标签页添加岗位，或让助手帮你搜索。")
          : null,
        analyzedJobs.length > 0
          ? h("div", { className: "ats-card-list" }, analyzedJobs.map((job) => {
            const a = byJob.get(String(job.id))
            const isOpen = expandedJobs.has(String(job.id))
            return h(
              "div",
              { key: job.id, className: "ats-card ats-analysis" },
              h(
                "div",
                { className: "ats-analysis-head ats-analysis-head-click", onClick: () => toggleJob(job.id), title: isOpen ? "点击收起" : "点击展开详情" },
                h("div", { className: "ats-card-title" },
                  job.title || "（未命名职位）", job.company ? ` @ ${job.company}` : ""),
                h("div", { className: "ats-score-box" },
                  h("div", { className: "ats-score-num", style: { color: scoreTone(a.score) === "red" ? "#e5534b" : scoreTone(a.score) === "green" ? "#2ea043" : scoreTone(a.score) === "orange" ? "#d29922" : "#3b82f6" } }, a.score),
                  h("div", { className: "ats-score-label" }, "匹配度 / 100")),
                h("span", { className: "ats-toggle" }, isOpen ? "▾ 收起" : "▸ 展开详情"),
              ),
              h("div", { className: "ats-score-bar" },
                h("div", { className: "ats-score-fill ats-score-" + scoreTone(a.score), style: { width: Math.max(2, Math.min(100, a.score)) + "%" } })),
              a.summary ? h("p", { className: "ats-analysis-summary" }, a.summary.slice(0, isOpen ? 500 : 120) + (a.summary.length > (isOpen ? 500 : 120) ? "…" : "")) : null,
              !isOpen
                ? h("div", { className: "ats-dim" },
                  "✓ 匹配点 " + (a.match || []).length + " · ✗ 缺口 " + (a.gaps || []).length +
                  (a.keywordMissing && a.keywordMissing.length ? " · 缺关键词 " + a.keywordMissing.length + " 个" : "") +
                  " —— 点击卡片展开详情")
                : [
                  h(
                    "div",
                    { key: "cols", className: "ats-analysis-cols" },
                    h(
                      "div",
                      { className: "ats-analysis-col" },
                      h("div", { className: "ats-analysis-col-title ats-match" }, "✓ 匹配点（" + (a.match || []).length + "）"),
                      (a.match || []).length === 0
                        ? h("div", { className: "ats-status" }, "无明显匹配点")
                        : h("ul", { className: "ats-point-list" }, (a.match || []).map((point, i) =>
                          h("li", { key: "m" + i, className: "ats-point ats-point-match" },
                            point.point,
                            point.evidence ? h("span", { className: "ats-evidence" }, " — " + point.evidence) : null))),
                    ),
                    h(
                      "div",
                      { className: "ats-analysis-col" },
                      h("div", { className: "ats-analysis-col-title ats-gap" }, "✗ 不匹配 / 缺口（" + (a.gaps || []).length + "）"),
                      (a.gaps || []).length === 0
                        ? h("div", { className: "ats-status" }, "没有明显缺口，冲！")
                        : h("ul", { className: "ats-point-list" }, (a.gaps || []).map((point, i) =>
                          h("li", { key: "g" + i, className: "ats-point ats-point-gap" },
                            point.point,
                            point.evidence ? h("span", { className: "ats-evidence" }, " — " + point.evidence) : null))),
                    ),
                  ),
                  (a.keywordHits || []).length > 0 || (a.keywordMissing || []).length > 0
                    ? h(
                      "div",
                      { key: "kw", className: "ats-kw-row" },
                      h("div", { className: "ats-kw-group" },
                        h("span", { className: "ats-kw-label" }, "关键词命中："),
                        (a.keywordHits || []).map((kw) => h(Chip, { key: kw, text: kw, tone: "green" }))),
                      h("div", { className: "ats-kw-group" },
                        h("span", { className: "ats-kw-label" }, "缺少关键词："),
                        (a.keywordMissing || []).map((kw) => h(Chip, { key: kw, text: kw, tone: "red" }))),
                    )
                    : null,
                  (a.suggestions || []).length > 0
                    ? h(
                      "div",
                      { key: "sg", className: "ats-suggest" },
                      h("div", { className: "ats-analysis-col-title" }, "行动建议"),
                      h("ul", { className: "ats-point-list" }, (a.suggestions || []).map((s, i) => h("li", { key: "s" + i, className: "ats-point" }, s))),
                    )
                    : null,
                  h(
                    "div",
                    { key: "acts", className: "ats-card-actions" },
                    h("div", { className: "ats-dim" }, "分析于 " + (a.analyzedAt || "").slice(0, 16).replace("T", " ")),
                    h(Btn, { onClick: () => requestAnalysis(job) }, "重新分析"),
                    h(Btn, { kind: "primary", onClick: () => startAts(job) }, "ATS 优化这份简历 →"),
                  ),
                ],
            )
          }))
          : null,
        unanalyzed.length > 0
          ? h(
            "div",
            { className: "ats-sub-section" },
            h("div", { className: "ats-sub-title" }, "未分析的岗位（" + unanalyzed.length + "）"),
            h("div", { className: "ats-card-list" }, unanalyzed.map((job) =>
              h(
                "div",
                { key: job.id, className: "ats-card ats-card-row" },
                h("div", { className: "ats-card-main" },
                  h("div", { className: "ats-card-title" }, job.title || "（未命名职位）", job.company ? ` @ ${job.company}` : "")),
                h("div", { className: "ats-card-actions" },
                  h(Btn, { kind: "primary", onClick: () => requestAnalysis(job) }, "发起分析"))))),
          )
          : null,
        atsDraft
          ? h(
            Modal,
            { title: "为「" + (atsDraft.job.title || atsDraft.job.company || "该岗位") + "」创建 ATS 优化任务", onClose: () => setAtsDraft(null) },
            h("p", { className: "ats-dim", style: { marginTop: 0 } }, "选一份简历作为优化底稿（目标岗位会用于关键词适配）。"),
            h(Field, { label: "使用哪份简历 *" },
              h("select", { className: "ats-input", value: atsDraft.resumeId, onChange: (e) => setAtsDraft(Object.assign({}, atsDraft, { resumeId: e.target.value })) },
                parsedResumes.map((rs) => h("option", { key: rs.id, value: rs.id }, rs.name + (rs.lang ? "（" + rs.lang + "）" : ""))))),
            h("div", { className: "ats-editor-actions" },
              h(Btn, { kind: "primary", onClick: confirmAts }, "创建任务"),
              h(Btn, { onClick: () => setAtsDraft(null) }, "取消")),
          )
          : null,
      )
    }

    // ── Tab 3: ATS 优化 ─────────────────────────────────────────────────────

    function splitSentences(line) {
      const parts = String(line).split(/(?<=[。！？；!?;.])/)
      const out = parts.filter((s) => s.trim().length > 0)
      return out.length ? out : [line]
    }

    function PendingEditRow({ edit, onRemove, onUpdate }) {
      const [editing, setEditing] = React.useState(false)
      const [draft, setDraft] = React.useState(null)

      function startEdit() {
        setDraft({ text: edit.text, op: edit.op, note: edit.note || "" })
        setEditing(true)
      }

      async function save() {
        if (!draft || !draft.text.trim()) return
        const ok = await onUpdate(edit.id, draft)
        if (ok) setEditing(false)
      }

      const opLabel = OPS.find((o) => o.op === edit.op)?.label || edit.op

      if (editing) {
        return h(
          "div",
          { className: "ats-card ats-edit-pending" },
          h("div", { className: "ats-edit-form" },
            h(Field, { label: "操作类型" },
              h("select", { className: "ats-input", value: draft.op, onChange: (e) => setDraft(Object.assign({}, draft, { op: e.target.value })) },
                OPS.map((o) => h("option", { key: o.op, value: o.op }, o.icon + " " + o.label + " —— " + o.hint)))),
            h(Field, { label: "修改目标（选中文本，可手动调整）" },
              h("textarea", { className: "ats-input ats-textarea", rows: 2, value: draft.text, onChange: (e) => setDraft(Object.assign({}, draft, { text: e.target.value })) })),
            h(Field, { label: "补充要求（可选）" },
              h("input", { className: "ats-input", value: draft.note, placeholder: "如：改成 STAR 结构 / 对齐 JD 里的 Docker 要求…", onChange: (e) => setDraft(Object.assign({}, draft, { note: e.target.value })) })),
            h("div", { className: "ats-editor-actions" },
              h(Btn, { kind: "primary", onClick: save, disabled: !draft.text.trim() }, "保存修改"),
              h(Btn, { onClick: () => setEditing(false) }, "取消"))),
        )
      }

      return h(
        "div",
        { className: "ats-card ats-edit-pending ats-edit-row" },
        h(Badge, { text: opLabel, tone: "gold" }),
        h("span", { className: "ats-edit-text", title: edit.text },
          edit.text.length > 80 ? edit.text.slice(0, 80) + "…" : edit.text),
        edit.note ? h("span", { className: "ats-edit-note", title: edit.note }, "︙" + edit.note) : null,
        h("span", { className: "ats-edit-spacer" }),
        h(Btn, { onClick: startEdit }, "修改"),
        h(Btn, { kind: "danger", onClick: () => onRemove(edit.id) }, "删除"),
      )
    }

    function ResumeEditor({ task, sessionId, flash, onDetailChange }) {
      const [sel, setSel] = React.useState(null)
      const [toolbar, setToolbar] = React.useState(null)
      const [customNote, setCustomNote] = React.useState("")
      const [submittedChoices, setSubmittedChoices] = React.useState({})
      const containerRef = React.useRef(null)

      const state = (task && task.state) || {}
      const markdown = task ? task.markdown : ""
      // resume.md 是助手维护的“完整最终稿”，预览一律以它为准（sections 可能只含助手
      // 最近一次改动的区块，不能作为完整视图）；markdown 为空时才退回 sections 渲染。
      const hasMarkdown = typeof markdown === "string" && markdown.trim().length > 0
      const sections = !hasMarkdown && Array.isArray(state.sections) && state.sections.length > 0
        ? state.sections
        : null
      const missingIds = new Set(Array.isArray(state.missing) ? state.missing.map(String) : [])
      const missingSections = (state.sections || []).filter((section) => section.status === "missing" || missingIds.has(String(section.id)))
      const pendingEdits = ((task && task.edits && task.edits.items) || []).filter((edit) => edit.status === "pending")
      const doneEdits = ((task && task.edits && task.edits.items) || []).filter((edit) => edit.status === "done").slice(-8)

      function clearSel() {
        setSel(null)
        setToolbar(null)
        try {
          const selection = window.getSelection()
          if (selection) selection.removeAllRanges()
        } catch {}
      }

      function openToolbar(kind, sectionId, text) {
        const trimmed = String(text || "").trim()
        if (!trimmed) return
        setSel({ kind, sectionId, text: trimmed.slice(0, 4000) })
        setToolbar({ x: null, y: null })
        setCustomNote("")
      }

      function handleMouseUp(e) {
        let selection
        try {
          selection = window.getSelection()
        } catch {
          return
        }
        if (!selection || selection.isCollapsed) return
        const container = containerRef.current
        if (!container || !container.contains(selection.anchorNode)) return
        const text = selection.toString().trim()
        if (!text) return
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const rootRect = container.getBoundingClientRect()
        setSel({ kind: "text", sectionId: "", text: text.slice(0, 4000) })
        setToolbar({
          x: Math.max(rootRect.left, Math.min(rect.left, rootRect.right - 420)),
          y: rect.bottom + 8,
        })
        setCustomNote("")
      }

      async function submitEdit(op, note) {
        if (!sel || !task) return
        const json = await apiPost(sessionId, "/task/edits", {
          taskId: task.taskId,
          items: [{ sectionId: sel.sectionId, text: sel.text, op, note: note || "" }],
        })
        if (json && json.ok) {
          flash("已提交「" + (OPS.find((o) => o.op === op)?.label || op) + "」修改请求 ✓ 去对话里让助手处理")
          clearSel()
          onDetailChange()
        } else {
          flash((json && json.error) || "提交失败", "error")
        }
      }

      async function submitChoice(section, choice) {
        const json = await apiPost(sessionId, "/task/choices", { taskId: task.taskId, choices: { [section.id]: choice } })
        if (json && json.ok) {
          flash(choice === "add" ? "已提交「补上」请求 ✓ 去对话里让助手起草" : "已提交「不补」✓")
          setSubmittedChoices((prev) => Object.assign({}, prev, { [section.id]: choice }))
          onDetailChange()
        } else flash((json && json.error) || "提交失败", "error")
      }

      async function removeEdit(editId) {
        if (!window.confirm("从队列中删除这条修改吗？（助手将不再处理它）")) return
        const json = await apiPost(sessionId, "/task/edits/remove", { taskId: task.taskId, editId })
        if (json && json.ok) {
          flash("已从队列删除 ✓")
          onDetailChange()
        } else flash((json && json.error) || "删除失败", "error")
      }

      async function updateEdit(editId, patch) {
        const json = await apiPost(sessionId, "/task/edits/update", { taskId: task.taskId, editId, text: patch.text, op: patch.op, note: patch.note })
        if (json && json.ok) {
          flash("队列条目已更新 ✓")
          onDetailChange()
          return true
        }
        flash((json && json.error) || "更新失败", "error")
        return false
      }

      async function reapplyEdit(edit) {
        const json = await apiPost(sessionId, "/task/edits", {
          taskId: task.taskId,
          items: [{ sectionId: edit.sectionId || "", text: edit.text, op: edit.op, note: edit.note || "" }],
        })
        if (json && json.ok) {
          flash("已把这条修改重新加入队列 ✓ 可在上面修改后让助手处理，或直接去对话说「处理修改」")
          onDetailChange()
        } else flash((json && json.error) || "提交失败", "error")
      }

      function renderLineText(line, sectionId, lineIdx) {
        return splitSentences(line).map((sentence, sentIdx) =>
          h(
            "span",
            {
              key: lineIdx + "-" + sentIdx,
              className: "ats-sentence",
              title: "点击选中这句话",
              onClick: (e) => {
                e.stopPropagation()
                openToolbar("sentence", sectionId, sentence)
              },
            },
            runsToNodes(inlineRuns(sentence), lineIdx + "-" + sentIdx),
          ),
        )
      }

      function renderContent(content, sectionId, keyBase) {
        const lines = String(content || "").split("\n")
        return h(
          "div",
          { className: "ats-sec-content" },
          lines.map((line, lineIdx) => {
            const key = keyBase + "-l" + lineIdx
            if (/^[-*•]\s+/.test(line)) {
              return h(
                "div",
                { key, className: "ats-bullet" },
                h("span", { className: "ats-bullet-dot" }, "• "),
                renderLineText(line.replace(/^[-*•]\s+/, ""), sectionId, lineIdx),
              )
            }
            if (/^#+\s+/.test(line)) {
              return h("div", { key, className: "ats-sec-subhead" }, runsToNodes(inlineRuns(line.replace(/^#+\s+/, "")), key))
            }
            if (line.trim().length === 0) return h("div", { key, className: "ats-line-gap" })
            return h("div", { key, className: "ats-line" }, renderLineText(line, sectionId, lineIdx))
          }),
        )
      }

      function sectionCard(section) {
        const key = section.id
        const tone = section.status === "missing" ? "missing" : section.status === "done" ? "done" : "pending"
        const chosen = submittedChoices[section.id]
        return h(
          "div",
          {
            key,
            className: "ats-sec ats-sec-" + tone,
            onClick: (e) => {
              if (e.target.closest("button, input, textarea, .ats-sec-gap-actions")) return
              openToolbar("block", section.id, section.content)
            },
          },
          h(
            "div",
            { className: "ats-sec-head" },
            h("span", { className: "ats-sec-title" }, section.title),
            h(Badge, { text: tone === "done" ? "完成" : tone === "missing" ? "缺失" : "待处理", tone: tone === "done" ? "green" : tone === "missing" ? "red" : "orange" }),
            h("span", { className: "ats-sec-hint" }, "点击区块 / 句子可选中修改"),
          ),
          tone === "missing" || missingIds.has(key)
            ? h(
              "div",
              { className: "ats-sec-gap" },
              h("div", { className: "ats-sec-gap-text" }, "简历缺少这个板块。"),
              h(
                "div",
                { className: "ats-sec-gap-actions" },
                chosen
                  ? h(Badge, { text: chosen === "add" ? "已请求补上，等待助手…" : "已选择不补", tone: chosen === "add" ? "blue" : "gray" })
                  : [
                    h(Btn, { key: "add", kind: "primary", onClick: () => submitChoice(section, "add") }, "补上"),
                    h(Btn, { key: "skip", onClick: () => submitChoice(section, "skip") }, "不补"),
                  ],
              ),
              section.content ? renderContent(section.content, section.id, key) : null,
            )
            : renderContent(section.content, section.id, key),
        )
      }

      function markdownCards() {
        const blocks = parseMdBlocks(markdown)
        const cards = []
        let current = null
        let idx = 0
        for (const block of blocks) {
          if (block.type === "h1") {
            cards.push({ id: "md-h1", title: block.text, status: "done", content: "" })
            current = null
          } else if (block.type === "h2") {
            idx++
            current = { id: "md-" + idx, title: block.text, status: "done", content: "" }
            cards.push(current)
          } else if (current === null) {
            cards.push({ id: "md-top", title: "简历头部", status: "done", content: block.text })
          } else if (block.type !== "blank") {
            current.content += (current.content ? "\n" : "") + (block.type === "li" ? "- " : "") + block.text
          }
        }
        return cards.filter((card) => card.title !== "简历头部" || card.content)
      }

      const toolbarNode = sel && toolbar
        ? h(
          "div",
          {
            className: "ats-toolbar",
            style: toolbar.x !== null && toolbar.y !== null ? { left: toolbar.x, top: toolbar.y } : { left: 24, bottom: 24 },
          },
          h("div", { className: "ats-toolbar-head" },
            h("span", { className: "ats-toolbar-label" }, "对选中内容："),
            h("span", { className: "ats-toolbar-selected" }, "“" + (sel.text.length > 60 ? sel.text.slice(0, 60) + "…" : sel.text) + "”"),
            h("button", { className: "ats-toolbar-close", onClick: clearSel, type: "button" }, "✕")),
          h(
            "div",
            { className: "ats-toolbar-ops" },
            OPS.map((o) =>
              h(
                "button",
                { key: o.op, className: "ats-toolbar-op", title: o.hint, onClick: () => submitEdit(o.op, o.op === "custom" ? customNote : ""), type: "button" },
                h("span", { className: "ats-toolbar-icon" }, o.icon),
                h("span", null, o.label),
              ),
            ),
          ),
          h("div", { className: "ats-toolbar-note" },
            h("input", {
              className: "ats-input",
              placeholder: "补充要求（可选，配合「自定义」必填）：例如“改成 STAR 结构”“语气更自信”“对齐 JD 里的 Docker 要求”…",
              value: customNote,
              onChange: (e) => setCustomNote(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter" && customNote.trim()) {
                  const op = OPS.find((o) => o.op === "custom")
                  submitEdit(op.op, customNote)
                }
              },
            })),
        )
        : null

      return h(
        "div",
        { className: "ats-editor", ref: containerRef, onMouseUp: handleMouseUp },
        toolbarNode,
        sections
          ? h("div", { className: "ats-sec-list" }, sections.map(sectionCard))
          : h(
            "div",
            { className: "ats-sec-list" },
            markdownCards().map((card) => sectionCard({ id: card.id, title: card.title, status: card.status, content: card.content })),
            missingSections.map((section) => sectionCard(section)),
          ),
        missingSections.length === 0 && (!sections || sections.length === 0)
          ? null
          : null,
        pendingEdits.length > 0
          ? h(
            "div",
            { className: "ats-sub-section" },
            h("div", { className: "ats-sub-title" }, "待处理修改队列（" + pendingEdits.length + " 条）—— 可在这里修改 / 删除，或去对话里让助手一次性处理"),
            h(
              "div",
              { className: "ats-card-list" },
              pendingEdits.map((edit) =>
                h(PendingEditRow, {
                  key: edit.id,
                  edit,
                  onRemove: removeEdit,
                  onUpdate: updateEdit,
                })),
            ),
          )
          : null,
        doneEdits.length > 0
          ? h(
            "div",
            { className: "ats-sub-section" },
            h("div", { className: "ats-sub-title" }, "最近的修改结果（" + doneEdits.length + "）"),
            h("div", { className: "ats-card-list" }, doneEdits.map((edit) =>
              h(
                "div",
                { key: edit.id, className: "ats-card ats-edit-done" },
                h("div", { className: "ats-card-title" },
                  h(Badge, { text: OPS.find((o) => o.op === edit.op)?.label || edit.op, tone: "green" }),
                  " ",
                  (edit.text.length > 40 ? edit.text.slice(0, 40) + "…" : edit.text)),
                edit.result ? h("div", { className: "ats-edit-result" }, edit.result.slice(0, 300) + (edit.result.length > 300 ? "…" : "")) : null,
                h(
                  "div",
                  { className: "ats-card-actions", style: { justifyContent: "flex-start" } },
                  h(Btn, { onClick: () => reapplyEdit(edit) }, "♻️ 再次修改（重新入队）"),
                ),
              ))),
          )
          : null,
      )
    }

    function AtsPanel({ store, sessionId }) {
      const { toast, flash } = useToast()
      const testSeed = typeof window.__ATS_TEST__ === "object" && window.__ATS_TEST__ !== null ? window.__ATS_TEST__.task : null
      const [taskId, setTaskId] = React.useState(testSeed && testSeed.taskId ? testSeed.taskId : "")
      const [task, setTask] = React.useState(testSeed)
      const [creating, setCreating] = React.useState(false)
      const [draft, setDraft] = React.useState(null)
      const [theme, setTheme] = React.useState("minimal")
      const [exporting, setExporting] = React.useState(false)
      const [exports, setExports] = React.useState([])
      const [includeLetter, setIncludeLetter] = React.useState(false)
      const [atsReport, setAtsReport] = React.useState(null)
      const [checking, setChecking] = React.useState(false)
      const [previewTheme, setPreviewTheme] = React.useState(null)

      const state = store.state

      const loadDetail = React.useCallback(async (id) => {
        if (!sessionId || !id) { setTask(null); return }
        const json = await apiGet(sessionId, "/task?taskId=" + encodeURIComponent(id))
        if (json && json.ok) setTask(json)
      }, [sessionId])

      React.useEffect(() => {
        if (!taskId) return
        loadDetail(taskId)
        const timer = setInterval(() => loadDetail(taskId), 3000)
        return () => clearInterval(timer)
      }, [taskId, loadDetail])

      React.useEffect(() => {
        if (!state) return
        if (taskId && !(state.tasks || []).some((t) => String(t.id) === String(taskId))) {
          setTaskId("")
          setTask(null)
        }
      }, [state, taskId])

      React.useEffect(() => {
        const onCreated = (e) => {
          if (e.detail && e.detail.taskId) {
            setTaskId(e.detail.taskId)
            loadDetail(e.detail.taskId)
          }
        }
        window.addEventListener("dsh-job-ats:task-created", onCreated)
        return () => window.removeEventListener("dsh-job-ats:task-created", onCreated)
      }, [loadDetail])

      if (state === null) return h(Panel, { title: "ATS 优化", children: h(Status, { text: "加载中…" }) })
      if (store.error) return h(Panel, { title: "ATS 优化", children: h(Status, { text: "加载失败：" + store.error, tone: "error" }) })

      const tasks = state.tasks || []
      const resumes = (state.resumes || []).filter((rs) => rs.parsed)
      const jobs = state.jobs || []
      const currentTask = tasks.find((t) => String(t.id) === String(taskId))
      const activeTheme = theme || (currentTask && currentTask.theme) || "minimal"

      async function createTask() {
        const json = await apiPost(sessionId, "/task", { action: "create", resumeId: draft.resumeId, jobId: draft.jobId || "", theme: draft.theme || "minimal" })
        if (json && json.ok) {
          flash("任务已创建 ✓ 去对话里让助手开始优化（发送“开始优化”或任意消息）")
          setCreating(false)
          setDraft(null)
          store.refresh()
          setTaskId(json.taskId)
          loadDetail(json.taskId)
        } else flash((json && json.error) || "创建失败", "error")
      }

      async function removeTask(id) {
        if (!window.confirm("确定删除这个优化任务吗？（不会删除简历与导出文件）")) return
        const json = await apiPost(sessionId, "/task", { action: "remove", taskId: id })
        if (json && json.ok) {
          flash("任务已标记删除")
          if (String(id) === String(taskId)) { setTaskId(""); setTask(null) }
          store.refresh()
        } else flash((json && json.error) || "删除失败", "error")
      }

      async function doExport(format) {
        if (!taskId) return
        setExporting(true)
        try {
          const withLetter = includeLetter && task && typeof task.letter === "string" && task.letter.trim().length > 0 ? "&includeLetter=1" : ""
          const json = await apiGet(sessionId, "/export?taskId=" + encodeURIComponent(taskId) + "&format=" + format + "&theme=" + encodeURIComponent(activeTheme) + withLetter)
          if (json && json.ok && json.url) {
            downloadUrl(json.url)
            flash("已开始下载 " + (format === "docx" ? "Word" : format === "pdf" ? "PDF" : "HTML") + (withLetter ? "（含求职信）" : "") + " ✓")
            store.refresh()
          } else if (json && json.htmlUrl) {
            flash("PDF 生成失败，但已生成 HTML：" + (json.error || ""), "error")
            downloadUrl(json.htmlUrl)
          } else {
            flash((json && json.error) || "导出失败", "error")
          }
        } catch (err) {
          flash(String((err && err.message) || err), "error")
        } finally {
          setExporting(false)
        }
      }

      async function requestLetter() {
        if (!taskId) return
        const json = await apiPost(sessionId, "/task/letter?taskId=" + encodeURIComponent(taskId), {})
        if (json && json.ok) {
          flash("已请求生成求职信 ✓ 去对话里让助手起草")
          loadDetail(taskId)
        } else flash((json && json.error) || "提交失败", "error")
      }

      async function runAtsCheck() {
        if (!taskId) return
        setChecking(true)
        try {
          const json = await apiGet(sessionId, "/ats-check?taskId=" + encodeURIComponent(taskId))
          if (json && json.ok) setAtsReport(json)
          else flash((json && json.error) || "校验失败", "error")
        } catch (err) {
          flash(String((err && err.message) || err), "error")
        } finally {
          setChecking(false)
        }
      }

      const statusText = {
        requested: "待开始", working: "优化中", review: "待你复核", done: "已完成",
      }

      return h(
        Panel,
        {
          title: "ATS 优化",
          hint: "选中任意区块、句子，或直接用鼠标拖选文字，会弹出操作菜单（重写 / 无关 / 直接消除 / 精简 / 适配 / 数据化 / 自定义）。修改请求由对话里的助手处理。",
          actions: [
            h(Btn, { key: "create", kind: "primary", onClick: () => { setDraft({ resumeId: resumes[0]?.id || "", jobId: "", theme: "minimal" }); setCreating(true) } }, "＋ 新建任务"),
            h(Btn, { key: "refresh", onClick: store.refresh }, "刷新"),
          ],
        },
        h("div", { className: "ats-toast-wrap" }, h(ToastView, { toast })),
        tasks.length === 0
          ? h("div", { className: "ats-empty-card" },
            h("h4", null, "还没有优化任务"),
            h("p", null, "流程：① 在「简历库」解析简历 → ② 点这里「新建任务」选简历与目标岗位 → ③ 去对话里让助手开始优化 → ④ 回到这里定点修改、补缺、导出 Word/PDF。"),
            h(Btn, { kind: "primary", onClick: () => { setDraft({ resumeId: resumes[0]?.id || "", jobId: "", theme: "minimal" }); setCreating(true) } }, "＋ 新建任务"),
          )
          : [
            h(
              "div",
              { key: "bar", className: "ats-task-bar" },
              h("select", { className: "ats-input ats-task-select", value: taskId, onChange: (e) => setTaskId(e.target.value) },
                h("option", { value: "" }, "选择任务…"),
                tasks.map((t) => h("option", { key: t.id, value: t.id },
                  (t.jobTitle ? t.jobTitle + " · " : "") + (t.resumeName || t.resumeId || t.id) + "（" + (statusText[t.status] || t.status) + "）"))),
              currentTask
                ? [
                  h(Badge, { key: "st", text: statusText[currentTask.status] || currentTask.status, tone: currentTask.status === "done" ? "green" : currentTask.status === "review" ? "gold" : "blue" }),
                  h(Badge, { key: "pe", text: pendingEditsBadge(currentTask), tone: currentTask.pendingEdits > 0 ? "gold" : "gray" }),
                  h(Btn, { key: "del", kind: "danger", onClick: () => removeTask(currentTask.id) }, "删除任务"),
                ]
                : null,
            ),
            taskId && task
              ? h(
                "div",
                { key: "task", className: "ats-task-body" },
                h(
                  "div",
                  { className: "ats-phase-row" },
                  phaseOrder.map((phase) => {
                    const reached = phaseReached(task, phase)
                    return h(
                      "div",
                      { key: phase, className: "ats-phase" + (reached ? " ats-phase-done" : "") + (phase === (task.state && task.state.phase) ? " ats-phase-current" : "") },
                      h("span", { className: "ats-phase-dot" }),
                      h("span", { className: "ats-phase-text" }, phaseText[phase] || phase),
                    )
                  }),
                ),
                task.state && task.state.message
                  ? h("div", { className: "ats-notice" }, task.state.message)
                  : null,
                task.state && task.state.status === "requested"
                  ? h("div", { className: "ats-notice ats-notice-amber" },
                    "⏭ 下一步：切换到「对话」标签页，对助手说「开始优化」或「处理标签页里的任务」。助手会读取简历、起草优化稿并写入这里，进度条会随任务推进。")
                  : null,
                h(ResumeEditor, { task, sessionId, flash, onDetailChange: () => loadDetail(taskId) }),
                h(
                  "div",
                  { className: "ats-letter-bar" },
                  h("div", { className: "ats-export-title" }, "求职信"),
                  task.letterRequest
                    ? h("span", { className: "ats-dim" }, "已请求生成，去对话里让助手起草…")
                    : typeof task.letter === "string" && task.letter.trim().length > 0
                      ? [
                        h(Badge, { key: "ok", text: "已生成", tone: "green" }),
                        h("details", { key: "d", className: "ats-log" },
                          h("summary", null, "预览求职信"),
                          h("pre", { className: "ats-pre ats-letter-pre" }, task.letter)),
                      ]
                      : h("span", { className: "ats-dim" }, "还没有求职信。可让助手针对目标岗位写一封，导出时随简历一起打包。"),
                  h("span", { className: "ats-letter-spacer" }),
                  typeof task.letter === "string" && task.letter.trim().length > 0
                    ? h(Btn, { onClick: requestLetter }, "重新生成")
                    : h(Btn, { kind: "primary", onClick: requestLetter }, "生成求职信"),
                ),
                h(
                  "div",
                  { className: "ats-export-bar" },
                  h("div", { className: "ats-export-title" }, "导出简历"),
                  h("select", { className: "ats-input ats-export-theme", value: activeTheme, onChange: (e) => setTheme(e.target.value) },
                    THEME_ORDER.map((id) => h("option", { key: id, value: id }, THEME_LABELS[id] + " 风格"))),
                  h(Btn, { onClick: () => setPreviewTheme(activeTheme) }, "🎨 预览风格"),
                  THEME_ORDER.filter((id) => id === activeTheme).map((id) => h("span", { key: "desc", className: "ats-dim" }, themeDesc(id))),
                  h(Btn, { kind: "primary", onClick: () => doExport("docx"), disabled: exporting }, exporting ? "生成中…" : "导出 Word (.docx)"),
                  h(Btn, { kind: "primary", onClick: () => doExport("pdf"), disabled: exporting }, "导出 PDF"),
                  h(Btn, { onClick: () => doExport("html"), disabled: exporting }, "导出 HTML"),
                  h(Btn, { onClick: runAtsCheck, disabled: checking }, checking ? "校验中…" : "🔍 ATS 解析校验"),
                  h(
                    "label",
                    { className: "ats-checkbox" + (typeof task.letter === "string" && task.letter.trim().length > 0 ? "" : " ats-checkbox-disabled") },
                    h("input", {
                      type: "checkbox",
                      checked: includeLetter,
                      disabled: !(typeof task.letter === "string" && task.letter.trim().length > 0),
                      onChange: (e) => setIncludeLetter(e.target.checked),
                    }),
                    " 含求职信导出"),
                  h(
                    "div",
                    { className: "ats-export-list" },
                    (state.exports || []).length > 0
                      ? [
                        h("span", { key: "l", className: "ats-dim" }, "已导出："),
                        (state.exports || []).map((file) =>
                          h("a", {
                            key: file.name,
                            className: "ats-link",
                            href: "/ats-api/download?sessionId=" + encodeURIComponent(sessionId) + "&name=" + encodeURIComponent(file.name),
                            download: "",
                          }, file.name + " ")),
                      ]
                      : h("span", { className: "ats-dim" }, "还没有导出文件"),
                  ),
                  (task.state || {}).log && (task.state.log || []).length
                    ? h(
                      "details",
                      { className: "ats-log" },
                      h("summary", null, "任务日志（" + task.state.log.length + " 条）"),
                      (task.state.log || []).slice(-12).map((entry, i) =>
                        h("div", { key: "log" + i, className: "ats-log-line" },
                          h("span", { className: "ats-dim" }, (entry.ts || "").slice(11, 19) + " "),
                          entry.text || String(entry))),
                    )
                    : null,
                ),
              )
              : taskId
                ? h(Status, { key: "loading", text: "加载任务详情…" })
                : emptyHint("从上方选择任务，或新建一个优化任务。"),
          ],
        creating
          ? h(
            Modal,
            { title: "新建 ATS 优化任务", onClose: () => setCreating(false) },
            h(Field, { label: "使用哪份简历 *" },
              resumes.length === 0
                ? h("div", { className: "ats-notice ats-notice-amber" }, "简历库还没有解析过的简历 —— 先去「简历库」标签页点「解析」")
                : h("select", { className: "ats-input", value: draft.resumeId, onChange: (e) => setDraft(Object.assign({}, draft, { resumeId: e.target.value })) },
                  resumes.map((rs) => h("option", { key: rs.id, value: rs.id }, rs.name + (rs.lang ? "（" + rs.lang + "）" : ""))))),
            h(Field, { label: "目标岗位（可选，适配 JD）" },
              h("select", { className: "ats-input", value: draft.jobId, onChange: (e) => setDraft(Object.assign({}, draft, { jobId: e.target.value })) },
                h("option", { value: "" }, "— 不指定（通用优化）"),
                jobs.map((job) => h("option", { key: job.id, value: job.id }, (job.title || "") + (job.company ? " @ " + job.company : ""))))),
            h(Field, { label: "导出风格" },
              h("select", { className: "ats-input", value: draft.theme, onChange: (e) => setDraft(Object.assign({}, draft, { theme: e.target.value })) },
                THEME_ORDER.map((id) => h("option", { key: id, value: id }, THEME_LABELS[id] + "风格"))),
              h("div", { className: "ats-dim" }, "风格只影响导出文件与预览排版，随时可换。")),
            h("div", { className: "ats-editor-actions" },
              h(Btn, { kind: "primary", onClick: createTask, disabled: !draft.resumeId }, "创建任务"),
              h(Btn, { onClick: () => setCreating(false) }, "取消")),
          )
          : null,
        atsReport
          ? h(
            Modal,
            { title: "🔍 ATS 解析校验报告", onClose: () => setAtsReport(null), wide: true },
            h("div", { className: "ats-report" },
              h("div", { className: "ats-report-stats" },
                h("div", { className: "ats-report-stat" }, h("span", { className: "ats-report-num" }, atsReport.stats.chars), h("span", { className: "ats-dim" }, "提取字符数")),
                h("div", { className: "ats-report-stat" }, h("span", { className: "ats-report-num" }, atsReport.stats.lines), h("span", { className: "ats-dim" }, "文本行数")),
                h("div", { className: "ats-report-stat" }, h("span", { className: "ats-report-num" }, atsReport.stats.sections.length), h("span", { className: "ats-dim" }, "识别区块")),
                h("div", { className: "ats-report-stat" }, h("span", { className: "ats-report-num" + (atsReport.stats.controlChars > 0 ? " ats-report-bad" : "") }, atsReport.stats.controlChars), h("span", { className: "ats-dim" }, "不可见字符"))),
              atsReport.stats.sections.length > 0
                ? h("div", { className: "ats-report-row" },
                  h("span", { className: "ats-kw-label" }, "识别到的区块："),
                  atsReport.stats.sections.map((s) => h(Badge, { key: s, text: s, tone: "blue" })))
                : null,
              atsReport.keywords.checked > 0
                ? h("div", { className: "ats-report-row" },
                  h("span", { className: "ats-kw-label" }, "JD 关键词命中 " + atsReport.keywords.found.length + "/" + atsReport.keywords.checked + "："),
                  atsReport.keywords.found.map((kw) => h(Badge, { key: "f" + kw, text: kw, tone: "green" })),
                  atsReport.keywords.missing.map((kw) => h(Badge, { key: "m" + kw, text: kw + "（缺）", tone: "red" })))
                : null,
              atsReport.warnings.length > 0
                ? h("div", { className: "ats-report-warns" },
                  atsReport.warnings.map((w, i) => h("div", { key: i, className: "ats-report-warn" }, "⚠️ " + w)))
                : h("div", { className: "ats-notice" }, "未发现明显问题，简历可放心投递 ✓"),
              h("div", { className: "ats-dim", style: { marginTop: 10 } }, atsReport.hint)),
          )
          : null,
        previewTheme
          ? h(
            Modal,
            { title: "🎨 导出风格预览（所见即所得）", onClose: () => setPreviewTheme(null), wide: true },
            h(ThemePreview, { markdown: task ? task.markdown : "", themeId: previewTheme, onThemeChange: setPreviewTheme }),
          )
          : null,
      )
    }

    function pendingEditsBadge(task) {
      if (task.pendingEdits > 0) return "待处理修改 " + task.pendingEdits
      if (task.pendingChoices > 0) return "待处理补缺 " + task.pendingChoices
      return "无待处理修改"
    }

    function ThemePreview({ markdown, themeId, onThemeChange }) {
      const meta = THEME_META[themeId] || THEME_META.minimal
      const isSample = !markdown || !String(markdown).trim()
      const blocks = parseMdBlocks(isSample ? SAMPLE_RESUME_MD : markdown)

      function inlineRunsHtml(text, keyBase) {
        return inlineRuns(text).map((run, i) => run.bold
          ? h("strong", { key: keyBase + i }, run.text)
          : run.text)
      }

      return h(
        "div",
        { className: "ats-preview" },
        h(
          "div",
          { className: "ats-preview-tabs" },
          THEME_ORDER.map((id) =>
            h(Chip, { key: id, text: THEME_LABELS[id], active: id === themeId, onClick: () => onThemeChange(id) })),
        ),
        h("p", { className: "ats-dim", style: { margin: "4px 0 10px" } },
          themeDesc(themeId) + (isSample ? "（当前任务还没有简历内容，展示的是示例数据；助手生成后预览会换成你真实的简历）" : "（直接用你当前任务的简历内容渲染）")),
        h(
          "div",
          {
            className: "ats-preview-paper",
            style: { fontFamily: meta.font, color: meta.body, fontSize: meta.bodySize + "pt", lineHeight: meta.lineH },
          },
          blocks.map((block, i) => {
            const key = "b" + i
            if (block.type === "h1") {
              return h("div", { key, style: { textAlign: "center", fontSize: meta.h1 + "pt", fontWeight: 700, color: meta.heading, margin: "0 0 12pt", letterSpacing: ".5px" } }, inlineRunsHtml(block.text, key))
            }
            if (block.type === "h2") {
              return h("div", { key, style: { fontSize: meta.h2 + "pt", fontWeight: 600, color: meta.heading, margin: "14pt 0 5pt", paddingBottom: "3pt", borderBottom: meta.rule ? "1.2pt solid " + meta.accent : ".6pt solid rgba(0,0,0,.22)" } }, inlineRunsHtml(block.text, key))
            }
            if (block.type === "li") {
              return h("div", { key, style: { display: "flex", gap: "6pt", margin: "0 0 2pt" } },
                h("span", { style: { color: meta.accent, flex: "none" } }, "•"),
                h("span", null, inlineRunsHtml(block.text, key)))
            }
            return h("p", { key, style: { margin: "0 0 4pt" } }, inlineRunsHtml(block.text, key))
          }),
        ),
      )
    }

    const phaseOrder = ["created", "extracting", "drafting", "review", "editing", "export-ready", "done"]
    const phaseText = {
      created: "已创建", extracting: "解析简历", drafting: "起草优化稿", review: "人工复核",
      editing: "定点修改", "export-ready": "可导出", done: "完成",
    }

    function phaseReached(task, phase) {
      const current = task.state && task.state.phase
      if (!current) return phase === "created"
      const alias = {
        created: 0, requested: 0, extracting: 1, extracted: 1, parsing: 1,
        drafting: 2, drafted: 2, review: 3, reviewing: 3,
        editing: 4, "export-ready": 5, exporting: 5, done: 6, finished: 6,
      }
      const idx = alias[current] ?? -1
      return phaseOrder.indexOf(phase) <= idx
    }

    function themeDesc(id) {
      const descs = {
        minimal: "黑白灰、留白多，最稳妥的默认风格。",
        modern: "蓝色点缀、清爽有科技感，适合互联网岗位。",
        classic: "衬线宋体、传统稳重，适合国企/传统行业。",
        compact: "行距字号偏小，一页塞下更多内容。",
        academic: "深绿标题、疏朗版式，适合研究/技术岗。",
      }
      return descs[id] || ""
    }

    // ── Tab 4: 简历库 ────────────────────────────────────────────────────────

    function ResumesPanel({ store, sessionId }) {
      const { toast, flash } = useToast()
      const [dirDraft, setDirDraft] = React.useState("")
      const [viewing, setViewing] = React.useState(null)
      const [viewText, setViewText] = React.useState(null)
      const [viewError, setViewError] = React.useState(null)

      const state = store.state
      React.useEffect(() => {
        if (state && state.settings && dirDraft === "") setDirDraft(state.settings.resumeDir || "")
      }, [state, dirDraft])

      if (state === null) return h(Panel, { title: "简历库", children: h(Status, { text: "加载中…" }) })
      if (store.error) return h(Panel, { title: "简历库", children: h(Status, { text: "加载失败：" + store.error, tone: "error" }) })

      const resumes = state.resumes || []
      const files = state.resumeFiles || []
      const parsedByPath = new Map(resumes.filter((rs) => rs.path).map((rs) => [rs.path.split("/").pop(), rs]))

      async function saveDir() {
        const json = await apiPost(sessionId, "/settings", { resumeDir: dirDraft })
        if (json && json.ok) {
          flash("简历目录已保存 ✓")
          store.refresh()
        } else flash((json && json.error) || "保存失败", "error")
      }

      async function requestParse(name) {
        const json = await apiPost(sessionId, "/resume-parse", { name })
        if (json && json.ok) {
          flash("已提交解析请求 ✓ 去对话里让助手解析「" + name + "」")
          store.refresh()
        } else flash((json && json.error) || "提交失败", "error")
      }

      async function previewResumeDir(name) {
        setViewing({ kind: "resumeDir", name })
        setViewText(null)
        setViewError(null)
        const json = await apiGet(sessionId, "/file?kind=resumeDir&name=" + encodeURIComponent(name))
        if (json && json.ok) setViewText(json.text)
        else setViewError((json && json.error) || "读取失败")
      }

      async function previewParsed(rs) {
        setViewing({ kind: "parsed", name: rs.name, id: rs.id })
        setViewText(null)
        setViewError(null)
        const json = await apiGet(sessionId, "/file?kind=workspace&name=" + encodeURIComponent(".ats/resumes/" + rs.id + ".md"))
        if (json && json.ok) setViewText(json.text)
        else setViewError((json && json.error) || "读取失败")
      }

      async function startAts(rs) {
        const json = await apiPost(sessionId, "/task", { action: "create", resumeId: rs.id })
        if (json && json.ok) {
          flash("已创建 ATS 优化任务 ✓ 请切换到「ATS 优化」标签页")
          window.dispatchEvent(new CustomEvent("dsh-job-ats:task-created", { detail: { taskId: json.taskId } }))
          store.refresh()
        } else flash((json && json.error) || "创建失败", "error")
      }

      async function removeResume(rs) {
        if (!window.confirm(`从简历库移除「${rs.name}」？（不会删除原文件）`)) return
        const json = await apiPost(sessionId, "/resumes", { action: "remove", ids: [rs.id] })
        if (json && json.ok) store.refresh()
        else flash((json && json.error) || "移除失败", "error")
      }

      function extOf(name) {
        const match = /\.([a-z0-9]+)$/i.exec(name || "")
        return match ? match[1].toLowerCase() : ""
      }

      return h(
        Panel,
        {
          title: "简历库",
          hint: "简历目录里的文件会列在下方；点「解析」后由助手提取内容并登记入库，之后就能用于 ATS 优化与岗位匹配分析。",
          actions: [h(Btn, { key: "refresh", onClick: store.refresh }, "刷新")],
        },
        h("div", { className: "ats-toast-wrap" }, h(ToastView, { toast })),
        state.resumeRequest
          ? h("div", { className: "ats-notice" }, "解析请求已提交（" + state.resumeRequest.name + "），去对话里让助手开始解析。")
          : null,
        h(
          "div",
          { className: "ats-settings-row" },
          h("div", { className: "ats-field ats-field-grow" },
            h("label", { className: "ats-label" }, "简历文件夹（绝对路径，留空 = 当前工作区根目录）"),
            h("input", {
              className: "ats-input",
              placeholder: "如 ~/Documents/简历 或 /Users/你的用户名/Documents/简历",
              value: dirDraft,
              onChange: (e) => setDirDraft(e.target.value),
            })),
          h("div", { className: "ats-settings-actions" },
            h(Btn, { kind: "primary", onClick: saveDir }, "保存目录")),
        ),
        h(
          "div",
          { className: "ats-sub-section" },
          h("div", { className: "ats-sub-title" }, "简历文件（" + files.length + "）"),
          files.length === 0
            ? h("div", { className: "ats-status" }, "目录里没有 .pdf/.docx/.md/.txt 文件")
            : h(
              "div",
              { className: "ats-card-list" },
              files.map((file) => {
                const parsed = parsedByPath.get(file.name)
                const ext = extOf(file.name)
                return h(
                  "div",
                  { key: file.name, className: "ats-card ats-card-row" },
                  h(
                    "div",
                    { className: "ats-card-main" },
                    h("div", { className: "ats-card-title" },
                      file.name,
                      h(Badge, { text: ext.toUpperCase(), tone: "gray" }),
                      parsed ? h(Badge, { text: "已解析 ✓", tone: "green" }) : null,
                      parsed && parsed.lang ? h(Badge, { text: parsed.lang, tone: "violet" }) : null),
                    file.size ? h("div", { className: "ats-dim" }, Math.round(file.size / 1024) + " KB") : null,
                  ),
                  h(
                    "div",
                    { className: "ats-card-actions" },
                    parsed
                      ? [h(Btn, { key: "view", onClick: () => previewParsed(parsed) }, "查阅"), h(Btn, { key: "ats", kind: "primary", onClick: () => startAts(parsed) }, "ATS 优化 →")]
                      : ext === "md" || ext === "txt"
                        ? h(Btn, { onClick: () => previewResumeDir(file.name) }, "预览")
                        : h(Btn, { kind: "primary", onClick: () => requestParse(file.name) }, "解析入库"),
                  ),
                )
              }),
            ),
        ),
        h(
          "div",
          { className: "ats-sub-section" },
          h("div", { className: "ats-sub-title" }, "已入库简历（" + resumes.length + "）"),
          resumes.length === 0
            ? emptyHint("还没有解析过的简历。在上面点「解析入库」，然后去对话里让助手解析。")
            : h(
              "div",
              { className: "ats-card-list" },
              resumes.map((rs) =>
                h(
                  "div",
                  { key: rs.id, className: "ats-card ats-card-row" },
                  h(
                    "div",
                    { className: "ats-card-main" },
                    h("div", { className: "ats-card-title" },
                      rs.name,
                      rs.lang ? h(Badge, { text: rs.lang, tone: "violet" }) : null,
                      rs.parsed ? h(Badge, { text: "已解析", tone: "green" }) : h(Badge, { text: "未解析", tone: "gray" })),
                    rs.parsedAt ? h("div", { className: "ats-dim" }, "解析于 " + rs.parsedAt.slice(0, 16).replace("T", " ")) : null,
                    rs.summary ? h("div", { className: "ats-card-snippet" }, rs.summary) : null,
                  ),
                  h(
                    "div",
                    { className: "ats-card-actions" },
                    rs.parsed ? h(Btn, { onClick: () => previewParsed(rs) }, "查阅") : null,
                    rs.parsed ? h(Btn, { kind: "primary", onClick: () => startAts(rs) }, "ATS 优化 →") : null,
                    h(Btn, { kind: "danger", onClick: () => removeResume(rs) }, "移除"),
                  ),
                ),
              ),
            ),
        ),
        viewing
          ? h(
            Modal,
            { title: viewing.name, onClose: () => setViewing(null), wide: true },
            viewError
              ? h(Status, { text: viewError, tone: "error" })
              : viewText === null
                ? h(Status, { text: "加载中…" })
                : h("pre", { className: "ats-pre" }, viewText),
          )
          : null,
      )
    }

    // ── Tab 5: 投递追踪 ──────────────────────────────────────────────────────

    // Module-level so the 表格/看板 preference survives polling re-renders and
    // tab switches (component remounts).
    let applicationsMode = "table"

    function ApplicationsPanel({ store, sessionId }) {
      const { toast, flash } = useToast()
      const [mode, setModeState] = React.useState(applicationsMode)
      const [editing, setEditing] = React.useState(null)
      const [dragId, setDragId] = React.useState(null)
      function setMode(next) {
        applicationsMode = next
        setModeState(next)
      }

      const state = store.state
      if (state === null) return h(Panel, { title: "投递追踪", children: h(Status, { text: "加载中…" }) })
      if (store.error) return h(Panel, { title: "投递追踪", children: h(Status, { text: "加载失败：" + store.error, tone: "error" }) })

      const apps = state.applications || []

      async function saveItem(item) {
        const json = await apiPost(sessionId, "/applications", { action: "add", item })
        if (json && json.ok) {
          flash("已保存 ✓")
          setEditing(null)
          store.refresh()
        } else flash((json && json.error) || "保存失败", "error")
      }

      async function removeItem(item) {
        if (!window.confirm(`删除「${item.position || ""} @ ${item.company || ""}」这条记录？`)) return
        const json = await apiPost(sessionId, "/applications", { action: "remove", ids: [item.id] })
        if (json && json.ok) store.refresh()
        else flash((json && json.error) || "删除失败", "error")
      }

      async function changeStep(item, step) {
        const json = await apiPost(sessionId, "/applications", { action: "add", item: Object.assign({}, item, { currentStep: step }) })
        if (json && json.ok) store.refresh()
        else flash((json && json.error) || "更新失败", "error")
      }

      function ddlTone(item) {
        if (!item.ddl) return "gray"
        const date = new Date(item.ddl.replace(/\./g, "-"))
        if (isNaN(date.getTime())) return "gray"
        const diff = Math.floor((date.getTime() - Date.now()) / 86400000)
        if (diff < 0) return "red"
        if (diff <= 3) return "gold"
        return "gray"
      }

      const tableNode = h(
        "div",
        { className: "ats-table-wrap" },
        h(
          "table",
          { className: "ats-table" },
          h("thead", null,
            h("tr", null,
              ["职位", "公司", "类型", "链接", "当前步骤", "DDL", "下一步行动", "操作"].map((col) => h("th", { key: col }, col)))),
          h("tbody", null,
            apps.length === 0
              ? h("tr", null, h("td", { colSpan: 8, className: "ats-status" }, "还没有投递记录。点右上角「＋ 新增投递」"))
              : apps.map((item) =>
                h("tr", { key: item.id },
                  h("td", null, item.position || "—"),
                  h("td", null, item.company || "—"),
                  h("td", null, item.type ? h(Badge, { text: item.type, tone: "violet" }) : "—"),
                  h("td", null, item.link ? h("a", { href: item.link, target: "_blank", rel: "noreferrer noopener", className: "ats-link" }, "打开 ↗") : "—"),
                  h("td", null,
                    h("select", { className: "ats-input ats-step-select", value: item.currentStep || "wishlist", onChange: (e) => changeStep(item, e.target.value) },
                      STEP_ORDER.map((step) => h("option", { key: step, value: step }, STEP_LABELS[step])))),
                  h("td", null, item.ddl ? h(Badge, { text: item.ddl, tone: ddlTone(item) }) : "—"),
                  h("td", { className: "ats-table-next" }, item.nextAction || "—"),
                  h("td", null,
                    h(Btn, { onClick: () => setEditing(Object.assign({}, item)) }, "编辑"),
                    " ",
                    h(Btn, { kind: "danger", onClick: () => removeItem(item) }, "删")),
                ),
              ),
          ),
        ),
      )

      const kanbanNode = h(
        "div",
        { className: "ats-kanban" },
        STEP_ORDER.map((step) => {
          const items = apps.filter((item) => (item.currentStep || "wishlist") === step)
          return h(
            "div",
            {
              key: step,
              className: "ats-kanban-col" + (dragId ? " ats-kanban-col-drop" : ""),
              onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" },
              onDrop: (e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData("text/plain")
                const item = apps.find((app) => String(app.id) === id)
                if (item) changeStep(item, step)
                setDragId(null)
              },
            },
            h("div", { className: "ats-kanban-head" },
              h(Badge, { text: STEP_LABELS[step], tone: STEP_COLORS[step] }),
              h("span", { className: "ats-dim" }, items.length)),
            items.map((item) =>
              h(
                "div",
                {
                  key: item.id,
                  className: "ats-kanban-card",
                  draggable: true,
                  onDragStart: (e) => { e.dataTransfer.setData("text/plain", String(item.id)); setDragId(item.id) },
                  onDragEnd: () => setDragId(null),
                  onClick: () => setEditing(Object.assign({}, item)),
                },
                h("div", { className: "ats-kanban-card-title" }, item.position || "（未命名）"),
                h("div", { className: "ats-kanban-card-company" }, item.company || ""),
                item.type ? h(Badge, { text: item.type, tone: "violet" }) : null,
                item.ddl ? h(Badge, { text: "DDL " + item.ddl, tone: ddlTone(item) }) : null,
                item.nextAction ? h("div", { className: "ats-kanban-card-next" }, "下一步：" + item.nextAction) : null,
              ),
            ),
          )
        }),
      )

      return h(
        Panel,
        {
          title: "投递追踪",
          hint: "记录每一条投递：职位、公司、链接、类型、当前步骤、DDL…… 拖动看板卡片即可更新进度；助手也会在对话里帮你维护。",
          actions: [
            h(Btn, { key: "add", kind: "primary", onClick: () => setEditing({ position: "", company: "", link: "", type: "社招", currentStep: "wishlist", ddl: "", nextAction: "", notes: "" }) }, "＋ 新增投递"),
            h(Btn, { key: "refresh", onClick: store.refresh }, "刷新"),
          ],
        },
        h(
          "div",
          { className: "ats-mode-row" },
          h("span", { className: "ats-dim" }, "视图："),
          h("div", { className: "ats-seg" },
            h("button", { className: "ats-seg-btn" + (mode === "table" ? " ats-seg-active" : ""), onClick: () => setMode("table"), type: "button" }, "表格"),
            h("button", { className: "ats-seg-btn" + (mode === "kanban" ? " ats-seg-active" : ""), onClick: () => setMode("kanban"), type: "button" }, "看板")),
          mode === "kanban" ? h("span", { className: "ats-dim" }, "拖动卡片到目标列即可更新步骤，点击卡片可编辑") : null,
        ),
        h("div", { className: "ats-toast-wrap" }, h(ToastView, { toast })),
        mode === "table" ? tableNode : kanbanNode,
        editing
          ? h(
            Modal,
            { title: editing.id ? "编辑投递" : "新增投递", onClose: () => setEditing(null) },
            h(Field, { label: "职位 *" }, h("input", { className: "ats-input", value: editing.position, placeholder: "如：后端开发工程师", onChange: (e) => setEditing(Object.assign({}, editing, { position: e.target.value })) })),
            h(Field, { label: "公司 *" }, h("input", { className: "ats-input", value: editing.company, placeholder: "如：字节跳动", onChange: (e) => setEditing(Object.assign({}, editing, { company: e.target.value })) })),
            h(Field, { label: "链接" }, h("input", { className: "ats-input", value: editing.link, placeholder: "https://…", onChange: (e) => setEditing(Object.assign({}, editing, { link: e.target.value })) })),
            h(Field, { label: "类型" }, h("select", { className: "ats-input", value: editing.type, onChange: (e) => setEditing(Object.assign({}, editing, { type: e.target.value })) },
              ["校招", "社招", "实习", "内推", "其他"].map((t) => h("option", { key: t, value: t }, t)))),
            h(Field, { label: "当前步骤" }, h("select", { className: "ats-input", value: editing.currentStep, onChange: (e) => setEditing(Object.assign({}, editing, { currentStep: e.target.value })) },
              STEP_ORDER.map((step) => h("option", { key: step, value: step }, STEP_LABELS[step])))),
            h("div", { className: "ats-two-col" },
              h(Field, { label: "DDL" }, h("input", { className: "ats-input", placeholder: "如 2026-09-10", value: editing.ddl, onChange: (e) => setEditing(Object.assign({}, editing, { ddl: e.target.value })) })),
              h(Field, { label: "投递日期" }, h("input", { className: "ats-input", placeholder: "如 2026-09-01", value: editing.appliedAt, onChange: (e) => setEditing(Object.assign({}, editing, { appliedAt: e.target.value })) }))),
            h(Field, { label: "下一步行动" }, h("textarea", { className: "ats-input ats-textarea", rows: 2, placeholder: "如：准备八股文，刷题，找内推人", value: editing.nextAction, onChange: (e) => setEditing(Object.assign({}, editing, { nextAction: e.target.value })) })),
            h(Field, { label: "备注" }, h("textarea", { className: "ats-input ats-textarea", rows: 3, value: editing.notes, onChange: (e) => setEditing(Object.assign({}, editing, { notes: e.target.value })) })),
            h("div", { className: "ats-editor-actions" },
              h(Btn, { kind: "primary", onClick: () => saveItem(editing) }, "保存"),
              h(Btn, { onClick: () => setEditing(null) }, "取消")),
          )
          : null,
      )
    }

    // ── Tab 6: 模拟面试 ──────────────────────────────────────────────────────

    const FAQ = {
      hr: [
        "请先做个自我介绍。",
        "为什么想来我们公司？为什么是这个岗位？",
        "你最大的优点和缺点是什么？",
        "你未来 3-5 年的职业规划？",
        "期望薪资是多少？你怎么看加班？",
        "你有什么想问我的吗？",
      ],
      tech: [
        "讲讲你简历上最有挑战的一个项目，你负责什么、遇到什么难点、怎么解决的？",
        "针对岗位核心技术栈提问（算法/八股/系统设计，由面试官临场发挥）。",
        "手写算法题：给一道中等难度题目并点评思路。",
        "项目深挖：为什么用这个技术选型？有没有更好的方案？",
        "反问环节：你对我们团队有什么想问的？",
      ],
      manager: [
        "讲讲你和同事/上级意见冲突的一次经历，你怎么处理？",
        "你如何排优先级？手头有多个任务同时催怎么办？",
        "描述一次你推动别人/项目落地的经历。",
        "你怎么理解这个岗位对团队的价值？",
        "如果入职，前三个月你打算怎么开展工作？",
      ],
      group: [
        "无领导小组讨论：面试官给出话题，多位候选人（AI 扮演）一起讨论并总结。",
        "观点辩论：围绕一个行业话题正反方辩论。",
        "团队方案设计：给一个业务场景，小组共同产出方案。",
      ],
      final: [
        "综合考察：职业稳定性、价值观匹配、薪资期望。",
        "深挖简历细节与项目细节（防止包装）。",
        "情景题：给你一个实际业务问题，现场给方案。",
        "CEO/VP 面常见：你对行业趋势怎么看？",
      ],
    }

    function InterviewPanel({ store, sessionId, inputActions }) {
      const { toast, flash } = useToast()
      const [round, setRound] = React.useState("hr")
      const [company, setCompany] = React.useState("")
      const [role, setRole] = React.useState("")
      const [speaking, setSpeaking] = React.useState(false)

      const state = store.state
      if (state === null) return h(Panel, { title: "模拟面试", children: h(Status, { text: "加载中…" }) })
      if (store.error) return h(Panel, { title: "模拟面试", children: h(Status, { text: "加载失败：" + store.error, tone: "error" }) })

      const interviews = state.interviews || []
      const jobs = state.jobs || []
      const pending = state.interviewRequest

      async function startInterview() {
        const json = await apiPost(sessionId, "/interviews", { action: "start", round, company, role })
        if (!json || !json.ok) {
          flash((json && json.error) || "提交失败", "error")
          return
        }
        let prompt
        if (round === "group") {
          prompt = `开始一场模拟群面（小组面试）：你担任面试官主持，用 subagent 工具派出 3-4 位性格与观点各异的候选人（明确各自的姓名与风格），围绕${role ? "「" + role + "」岗位相关话题" : "一个行业话题"}进行 20 分钟的无领导小组讨论。流程：宣布规则 → 给出题目 → 让组员依次发言并互相交锋 → 最后由一位组员总结。期间你可以插话推进。结束后请给我个人的表现反馈与改进建议。${company ? "目标公司：" + company : ""}`
        } else {
          prompt = `请对我进行一场模拟${ROUND_LABELS[round]}（${company ? "目标公司：" + company + "，" : ""}${role ? "目标岗位：" + role : "通用"}）。要求：完全按真实面试节奏，一次只问一个问题，根据我的回答追问或进入下一题，不要一次抛多个问题。面试结束后给我结构化反馈：表现亮点、待改进点、每个问题的参考答案要点，并给一个综合评分。`
        }
        flash("面试已开始 ✓ 已把开场指令填入输入框，直接发送即可")
        if (inputActions && typeof inputActions.setDraft === "function") {
          inputActions.setDraft(prompt)
        }
        store.refresh()
      }

      async function removeInterview(item) {
        if (!window.confirm("删除这条面试记录？")) return
        const json = await apiPost(sessionId, "/interviews", { action: "remove", ids: [item.id] })
        if (json && json.ok) store.refresh()
        else flash((json && json.error) || "删除失败", "error")
      }

      function speak(text) {
        try {
          if (!("speechSynthesis" in window)) {
            flash("浏览器不支持语音朗读", "error")
            return
          }
          window.speechSynthesis.cancel()
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.lang = "zh-CN"
          utterance.rate = 1
          const voices = window.speechSynthesis.getVoices()
          const zh = voices.find((voice) => /zh[-_]CN|Chinese/i.test(voice.lang + " " + voice.name))
          if (zh) utterance.voice = zh
          setSpeaking(true)
          utterance.onend = () => setSpeaking(false)
          utterance.onerror = () => setSpeaking(false)
          window.speechSynthesis.speak(utterance)
        } catch {
          setSpeaking(false)
        }
      }

      return h(
        Panel,
        {
          title: "模拟面试",
          hint: "从 HR 面一路练到终面；群面会用多个 AI 组员陪你讨论。点击「开始面试」会把开场指令填进输入框，发送后助手立刻以面试官身份开始（右侧喇叭可朗读常见问题，模拟 HR 电话感）。",
          actions: [h(Btn, { key: "refresh", onClick: store.refresh }, "刷新")],
        },
        h("div", { className: "ats-toast-wrap" }, h(ToastView, { toast })),
        pending
          ? h("div", { className: "ats-notice" }, "面试请求已提交（" + ROUND_LABELS[pending.round] + "），去对话里发送消息开始面试。")
          : null,
        h(
          "div",
          { className: "ats-interview-start" },
          h("div", { className: "ats-field" },
            h("label", { className: "ats-label" }, "面试轮次"),
            h("div", { className: "ats-chips" },
              ROUNDS.map((r) => h(Chip, { key: r, text: ROUND_LABELS[r], active: round === r, onClick: () => setRound(r) })))),
          h("div", { className: "ats-two-col" },
            h(Field, { label: "目标公司（可选）" },
              h("select", { className: "ats-input", value: company, onChange: (e) => setCompany(e.target.value) },
                h("option", { value: "" }, "— 通用"),
                jobs.filter((job) => job.company).map((job) => h("option", { key: job.id, value: job.company }, job.company + (job.title ? " · " + job.title : ""))))),
            h(Field, { label: "目标岗位（可选）" }, h("input", { className: "ats-input", placeholder: "如：后端开发工程师", value: role, onChange: (e) => setRole(e.target.value) }))),
          h("div", { className: "ats-editor-actions" },
            h(Btn, { kind: "primary", onClick: startInterview }, "🎤 开始模拟面试"),
            h("span", { className: "ats-dim" }, "开始后请在对话里发送消息（开场指令已自动填入输入框）")),
        ),
        h(
          "div",
          { className: "ats-sub-section" },
          h("div", { className: "ats-sub-title" }, "面试记录（" + interviews.length + "）"),
          interviews.length === 0
            ? emptyHint("还没有面试记录。上面选好轮次点「开始模拟面试」。")
            : h(
              "div",
              { className: "ats-card-list" },
              interviews.map((item) =>
                h(
                  "div",
                  { key: item.id, className: "ats-card" },
                  h(
                    "div",
                    { className: "ats-card-main" },
                    h("div", { className: "ats-card-title" },
                      h(Badge, { text: ROUND_LABELS[item.round] || item.round, tone: item.round === "group" ? "violet" : item.round === "final" ? "gold" : "blue" }),
                      " ",
                      item.role || item.company || "通用",
                      item.company && item.company !== item.role ? h("span", { className: "ats-dim" }, " @ " + item.company) : null,
                      h(Badge, { text: item.status === "done" ? "已完成" : item.status === "ongoing" ? "进行中" : "待开始", tone: item.status === "done" ? "green" : item.status === "ongoing" ? "blue" : "gray" })),
                    item.startedAt ? h("div", { className: "ats-dim" }, "开始于 " + item.startedAt.slice(0, 16).replace("T", " ")) : null,
                    item.summary ? h("div", { className: "ats-card-snippet" }, item.summary.slice(0, 400) + (item.summary.length > 400 ? "…" : "")) : null,
                  ),
                  h("div", { className: "ats-card-actions" },
                    h(Btn, { kind: "danger", onClick: () => removeInterview(item) }, "删除")),
                ),
              ),
            ),
        ),
        h(
          "div",
          { className: "ats-sub-section" },
          h("div", { className: "ats-sub-title" }, "常见问题速查（点喇叭朗读，模拟 HR 电话）"),
          h(
            "div",
            { className: "ats-faq" },
            ROUNDS.map((r) =>
              h(
                "div",
                { key: r, className: "ats-faq-col" },
                h("div", { className: "ats-analysis-col-title" }, ROUND_LABELS[r]),
                (FAQ[r] || []).map((question, i) =>
                  h(
                    "div",
                    { key: i, className: "ats-faq-item" },
                    h("span", { className: "ats-faq-text" }, question),
                    h("button", { className: "ats-faq-speak", title: "朗读", onClick: () => speak(question), type: "button" }, speaking ? "🔊…" : "🔊"),
                  ),
                ),
              ),
            ),
          ),
        ),
      )
    }

    // ── 职位搜索 ────────────────────────────────────────────────────────────

    const SEARCH_SOURCES_UI = [
      { id: "boss", label: "Boss直聘" },
      { id: "shixiseng", label: "实习僧" },
      { id: "offershow", label: "OfferShow" },
      { id: "web", label: "全网" },
    ]

    // 深度档位:每个来源的查询变体数(与 host 侧 SEARCH_DEPTHS 对应)。
    // 聚合搜索 = 多个查询变体,慢档召回显著更多;前端超时按档位放宽。
    const SEARCH_DEPTHS_UI = [
      { id: "fast", label: "快", hint: "1 变体/源 · 约 15s · 数十条" },
      { id: "standard", label: "标准", hint: "2 变体/源 · 约 40s · 上百条" },
      { id: "deep", label: "深度", hint: "4 变体/源 · 约 1-2 分钟 · 数百条" },
    ]
    const SEARCH_TIMEOUT_MS = { fast: 30_000, standard: 75_000, deep: 180_000 }

    function fmtClock(ts) {
      if (!ts) return "—"
      const d = new Date(ts)
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    }

    function useSearchStore(sessionId) {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)
      const refresh = React.useCallback(async () => {
        if (!sessionId) return
        try {
          const json = await apiGet(sessionId, "/search")
          if (json && json.ok) { setData(json); setError(null) }
          else setError((json && json.error) || "加载失败")
        } catch (err) {
          setError(String((err && err.message) || err))
        }
      }, [sessionId])
      React.useEffect(() => {
        if (sessionId) refresh()
      }, [sessionId, refresh])
      return { data, error, refresh }
    }

    function SearchPanel({ store, sessionId }) {
      const { toast, flash } = useToast()
      const search = useSearchStore(sessionId)
      const cfg = (search.data && search.data.config) || {}
      const results = (search.data && search.data.results) || []
      const [keywords, setKeywords] = React.useState("")
      const [city, setCity] = React.useState("")
      const [sources, setSources] = React.useState(SEARCH_SOURCES_UI.map((s) => s.id))
      const [depth, setDepth] = React.useState("standard")
      const [formSeeded, setFormSeeded] = React.useState(false)
      const [showSchedule, setShowSchedule] = React.useState(false)
      const [intervalMinutes, setIntervalMinutes] = React.useState(30)
      const [running, setRunning] = React.useState(false)
      const [selectedId, setSelectedId] = React.useState(null)
      const [jd, setJd] = React.useState(null) // null=未加载;{loading}|{text}|{error,url}

      React.useEffect(() => {
        if (search.data && !formSeeded) {
          setFormSeeded(true)
          if (cfg.keywords) setKeywords(cfg.keywords)
          if (cfg.city) setCity(cfg.city)
          if (Array.isArray(cfg.sources) && cfg.sources.length > 0) setSources(cfg.sources)
          if (cfg.depth && SEARCH_DEPTHS_UI.some((d) => d.id === cfg.depth)) setDepth(cfg.depth)
          if (cfg.intervalMinutes) setIntervalMinutes(cfg.intervalMinutes)
        }
      }, [search.data, formSeeded])

      const selected = results.find((r) => r.id === selectedId) || null
      const scheduleOn = cfg.scheduleEnabled === true

      // 点开即自动抓取 JD:host 搜索时已代抓头部结果(selected.jd 直接有),
      // 其余在这里补抓;登录墙站点(host 标记 jdUnavailable)不重复请求。
      React.useEffect(() => {
        if (selected && !selected.jd && !selected.jdUnavailable && jd === null) {
          loadJd(selected)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [selectedId])

      async function runSearch() {
        if (!keywords.trim()) { flash("先填写搜索关键词(岗位 / 技能)", "error"); return }
        setRunning(true)
        try {
          const depthHint = SEARCH_DEPTHS_UI.find((d) => d.id === depth)
          flash(`开始${depthHint ? depthHint.label : ""}搜索(${depthHint ? depthHint.hint : ""}),完成后列表自动刷新…`)
          const json = await apiPost(sessionId, "/search/run", { keywords, city, sources, depth }, SEARCH_TIMEOUT_MS[depth] || 75_000)
          if (json && json.ok) {
            const failed = Object.entries(json.perSource || {}).filter(([, v]) => v.ok === false).map(([k]) => k)
            const jdInfo = json.jdAuto ? ` · 已自动抓取 ${json.jdAuto.fetched} 条 JD` : ""
            flash(`搜索完成:${json.depth === "deep" ? "深度" : json.depth === "standard" ? "标准" : "快"}档 · ${json.queries} 个查询 · 耗时 ${Math.round((json.elapsedMs || 0) / 1000)}s,新增 ${json.added} 条(共 ${json.total} 条)${jdInfo}` + (failed.length ? ` · 失败来源:${failed.join("/")}` : ""))
            await search.refresh()
          } else flash((json && json.error) || "搜索失败", "error")
        } catch (err) {
          flash(String((err && err.message) || err), "error")
        } finally {
          setRunning(false)
        }
      }

      async function saveSchedule(enabled) {
        const json = await apiPost(sessionId, "/search/schedule", { enabled, intervalMinutes, keywords, city, sources })
        if (json && json.ok) {
          flash(enabled ? `定时刷新已开启:每 ${json.config.intervalMinutes} 分钟自动搜索一次` : "定时刷新已关闭")
          await search.refresh()
        } else flash((json && json.error) || "保存失败", "error")
      }

      async function loadJd(item) {
        setJd({ loading: true })
        const json = await apiPost(sessionId, "/search/jd", { id: item.id })
        if (json && json.ok) setJd({ text: json.jd })
        else setJd({ error: (json && json.error) || "抓取失败", url: (json && json.url) || item.url })
      }

      async function applyOne(item) {
        const json = await apiPost(sessionId, "/search/apply", { id: item.id })
        if (json && json.ok) {
          try { await navigator.clipboard.writeText(json.greeting) } catch {}
          window.open(json.url, "_blank", "noopener")
          flash("打招呼语已复制、岗位页已打开:粘贴发送即完成投递;已同步写入投递追踪 ✓")
          await search.refresh()
          store.refresh()
        } else flash((json && json.error) || "代投失败", "error")
      }

      async function collectOne(item) {
        const json = await apiPost(sessionId, "/jobs", {
          action: "add",
          item: {
            title: item.title,
            company: item.company,
            link: item.url,
            type: /实习/.test(`${item.title} ${item.snippet || ""}`) ? "实习" : "社招",
            location: item.city || "",
            salary: item.salary || "",
            source: `搜索·${item.sourceLabel}`,
            snippet: item.snippet || "",
          },
        })
        if (json && json.ok) { flash("已收录到岗位库,去「筛选工作」查看 ✓"); store.refresh() }
        else flash((json && json.error) || "收录失败", "error")
      }

      function toggleSource(id) {
        setSources((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
      }

      return h(Panel, {
        title: "职位搜索",
        hint: "聚合 Boss直聘 / 实习僧 / OfferShow 与全网公开岗位索引(经搜索引擎 site: 限定;详情页有登录墙时以摘要与链接为准)。一键代投为半自动:复制打招呼语并打开岗位页,粘贴发送即完成投递,同时写入投递追踪。",
        actions: [
          h("button", { key: "sched", className: "ats-btn" + (scheduleOn ? " ats-btn-primary" : ""), onClick: () => setShowSchedule((v) => !v) },
            scheduleOn ? `⏱ 定时中·每 ${cfg.intervalMinutes} 分钟` : "⏱ 定时刷新"),
          h("button", { key: "run", className: "ats-btn ats-btn-primary", disabled: running, onClick: runSearch, title: (SEARCH_DEPTHS_UI.find((d) => d.id === depth) || {}).hint || "" },
            running ? `搜索中(${(SEARCH_DEPTHS_UI.find((d) => d.id === depth) || {}).label || ""})…` : `🔍 搜索·${(SEARCH_DEPTHS_UI.find((d) => d.id === depth) || {}).label || ""}`),
        ],
      },
        h("div", { className: "ats-search-formrow" },
          h("input", { className: "ats-input", style: { flex: 2, minWidth: 180 }, placeholder: "岗位 / 技能关键词,如:Java 后端、产品实习", value: keywords, onChange: (e) => setKeywords(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") runSearch() } }),
          h("input", { className: "ats-input", style: { flex: 1, minWidth: 100 }, placeholder: "城市(可空)", value: city, onChange: (e) => setCity(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") runSearch() } }),
        ),
        h("div", null,
          SEARCH_SOURCES_UI.map((s) =>
            h("button", {
              key: s.id,
              className: "ats-chip" + (sources.includes(s.id) ? " ats-chip-active" : ""),
              onClick: () => toggleSource(s.id),
            }, s.label),
          ),
          h("span", { className: "ats-dim", style: { margin: "0 2px" } }, "│"),
          SEARCH_DEPTHS_UI.map((d) =>
            h("button", {
              key: d.id,
              title: d.hint,
              className: "ats-chip" + (depth === d.id ? " ats-chip-active" : ""),
              onClick: () => setDepth(d.id),
            }, d.label),
          ),
        ),
        showSchedule && h("div", { className: "ats-export-bar", style: { marginTop: 12 } },
          h("span", { className: "ats-checkbox" },
            h("input", { type: "checkbox", checked: scheduleOn, onChange: (e) => saveSchedule(e.target.checked) }),
            "启用定时刷新",
          ),
          h("select", { className: "ats-input", style: { width: 150 }, value: intervalMinutes, onChange: (e) => setIntervalMinutes(Number(e.target.value)) },
            [15, 30, 60, 120, 240].map((m) => h("option", { key: m, value: m }, `每 ${m} 分钟`)),
          ),
          h("button", { className: "ats-btn ats-btn-primary", onClick: () => saveSchedule(true) }, "保存并开启"),
          scheduleOn && h("button", { className: "ats-btn ats-btn-danger", onClick: () => saveSchedule(false) }, "关闭定时"),
          h("span", { className: "ats-dim" },
            `上次刷新 ${fmtClock(cfg.lastRunAt)}` + (scheduleOn && cfg.nextRunAt ? ` · 下次 ${fmtClock(cfg.nextRunAt)}` : "")),
        ),
        h("div", { className: "ats-dim", style: { margin: "10px 0 12px" } },
          `共 ${results.length} 条` +
          (results.some((r) => r.applied) ? ` · 已代投 ${results.filter((r) => r.applied).length} 条` : "") +
          (scheduleOn ? " · 定时刷新运行中" : "")),
        h("div", { className: "ats-search-grid" },
          h("div", { className: "ats-search-side" },
            search.error && h("div", { className: "ats-status-error" }, "加载失败:" + search.error),
            results.length === 0
              ? h("div", { className: "ats-empty-card" },
                  h("h4", null, "还没有搜索结果"),
                  h("p", null, "填写关键词与城市、选择来源后点「搜索」。开启定时刷新后,会按间隔自动搜索并去重合并。"),
                )
              : results.map((item) =>
                  h("div", {
                    key: item.id,
                    className: "ats-search-item" + (item.id === selectedId ? " ats-search-item-active" : "") + (item.applied ? " ats-search-applied" : ""),
                    onClick: () => { setSelectedId(item.id); setJd(null) },
                  },
                    h("div", { className: "ats-search-item-title" }, (item.applied ? "✅ " : "") + item.title),
                    h("div", { className: "ats-search-item-meta" },
                      h("span", { className: "ats-badge ats-badge-blue" }, item.sourceLabel || item.source),
                      item.salary && h("span", { className: "ats-badge ats-badge-gold" }, item.salary),
                      item.city && h("span", { className: "ats-badge" }, item.city),
                      item.company && h("span", { className: "ats-dim" }, item.company),
                    ),
                    item.snippet && h("div", { className: "ats-search-item-snippet" }, item.snippet),
                  ),
                ),
          ),
          h("div", { className: "ats-search-main" },
            !selected
              ? h("div", { className: "ats-status" }, "← 从左侧选择一个岗位查看详情")
              : h("div", null,
                  h("div", { className: "ats-card-title", style: { fontSize: 15 } }, selected.title),
                  h("div", { className: "ats-card-tags", style: { marginTop: 6 } },
                    h("span", { className: "ats-badge ats-badge-blue" }, selected.sourceLabel || selected.source),
                    selected.company && h("span", { className: "ats-badge" }, selected.company),
                    selected.salary && h("span", { className: "ats-badge ats-badge-gold" }, selected.salary),
                    selected.city && h("span", { className: "ats-badge" }, selected.city),
                    selected.applied && h("span", { className: "ats-badge ats-badge-green" }, "已代投"),
                  ),
                  h("div", { className: "ats-card-actions", style: { marginTop: 10 } },
                    h("button", { className: "ats-btn ats-btn-primary", onClick: () => applyOne(selected) }, "🚀 一键代投"),
                    h("button", { className: "ats-btn", onClick: () => collectOne(selected) }, "📥 收录到岗位库"),
                    h("button", { className: "ats-btn", onClick: () => loadJd(selected) }, ((jd && jd.text) || selected.jd) ? "🔄 重新抓取 JD" : "📄 抓取 JD"),
                    h("button", { className: "ats-btn", onClick: () => { navigator.clipboard.writeText(selected.url).then(() => flash("链接已复制")) } }, "复制链接"),
                    h("a", { className: "ats-btn", href: selected.url, target: "_blank", rel: "noopener" }, "打开原页 ↗"),
                  ),
                  h("div", { className: "ats-search-jd" },
                    ((jd && jd.text) || selected.jd)
                      ? ((jd && jd.text) || selected.jd)
                      : jd && jd.loading
                        ? "正在自动抓取 JD…"
                        : jd && jd.error
                          ? h("span", null, h("span", { className: "ats-status-error" }, jd.error), " ",
                              h("a", { href: jd.url || selected.url, target: "_blank", rel: "noopener" }, "打开原页 ↗"))
                          : selected.jdUnavailable
                            ? h("span", null, h("span", { className: "ats-status-error" }, selected.jdUnavailable), " ",
                                h("a", { href: selected.url, target: "_blank", rel: "noopener" }, "打开原页 ↗"))
                            : "正在自动抓取 JD…",
                  ),
                ),
          ),
        ),
      )
    }

    // ── gate + tab definitions ──────────────────────────────────────────────

    function EmptyHint() {
      return h(
        "div",
        { className: "ats-root" },
        h("div", { className: "ats-empty" },
          h("h3", null, "此会话未启用「求职 ATS 模式」"),
          h("p", null, "新建会话时在预设选择器中选择「求职 ATS 模式」，即可在这里使用职位搜索、筛选工作、工作分析、ATS 简历优化、简历库、投递追踪与模拟面试七个工作台。"),
        ),
      )
    }

    function GateView(props) {
      const sessions = props.useSessions ? props.useSessions((s) => s) : null
      const row = sessions && sessions.byId ? sessions.byId[props.sessionId] : undefined
      const preset = sessionPreset(row)
      const isForeign = typeof preset !== "string" || preset !== "job-ats"
      const store = useAtsStore(isForeign ? null : props.sessionId)
      if (isForeign) return h(EmptyHint)
      return h(props.panel, { store, sessionId: props.sessionId, inputActions: props.inputActions })
    }

    const TABS = [
      { id: "ats-search", order: 39, label: "职位搜索", panel: SearchPanel },
      { id: "ats-jobs", order: 40, label: "筛选工作", panel: JobsPanel },
      { id: "ats-analysis", order: 41, label: "工作分析", panel: AnalysisPanel },
      { id: "ats-ats", order: 42, label: "ATS 优化", panel: AtsPanel },
      { id: "ats-resumes", order: 43, label: "简历库", panel: ResumesPanel },
      { id: "ats-applications", order: 44, label: "投递追踪", panel: ApplicationsPanel },
      { id: "ats-interview", order: 45, label: "模拟面试", panel: InterviewPanel },
    ]

    // ── styles ───────────────────────────────────────────────────────────────

    const CSS = `
.ats-root { padding: 20px 24px; max-width: 1240px; margin: 0 auto; font-size: 14px; line-height: 1.55; }
.ats-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.ats-title { margin: 0 0 4px; font-size: 17px; font-weight: 600; }
.ats-hint { margin: 0; font-size: 12.5px; opacity: .62; max-width: 760px; }
.ats-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.ats-btn { background: rgba(128,128,128,.14); color: inherit; border: 1px solid rgba(128,128,128,.3); border-radius: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer; text-decoration: none; display: inline-block; }
.ats-btn:hover { background: rgba(128,128,128,.24); }
.ats-btn:disabled { opacity: .5; cursor: default; }
.ats-btn-primary { background: rgba(59,130,246,.18); border-color: rgba(59,130,246,.45); }
.ats-btn-primary:hover { background: rgba(59,130,246,.28); }
.ats-btn-danger { color: #e5534b; border-color: rgba(229,83,75,.4); background: rgba(229,83,75,.1); }
.ats-input, .ats-textarea, .ats-input select { width: 100%; box-sizing: border-box; background: rgba(128,128,128,.07); border: 1px solid rgba(128,128,128,.28); border-radius: 6px; padding: 7px 10px; font: inherit; color: inherit; }
.ats-input:focus, .ats-textarea:focus { outline: 1px solid rgba(59,130,246,.6); }
.ats-textarea { resize: vertical; }
.ats-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.ats-field-grow { flex: 1; margin-bottom: 0; }
.ats-label { font-size: 12.5px; opacity: .72; }
.ats-status { padding: 32px 12px; text-align: center; opacity: .6; }
.ats-status-slow { margin-top: 10px; font-size: 12.5px; opacity: .85; max-width: 560px; margin-left: auto; margin-right: auto; line-height: 1.6; }
.ats-status-error { color: #e5534b; opacity: 1; }
.ats-notice { margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; background: rgba(46,160,67,.14); border: 1px solid rgba(46,160,67,.35); font-size: 13px; }
.ats-notice-amber { background: rgba(210,153,34,.14); border-color: rgba(210,153,34,.4); }
.ats-dim { opacity: .6; font-size: 12.5px; }
.ats-badge { font-size: 11.5px; border-radius: 999px; padding: 1px 9px; background: rgba(128,128,128,.16); margin: 0 4px; display: inline-block; white-space: nowrap; }
.ats-badge-blue { background: rgba(59,130,246,.18); }
.ats-badge-green { background: rgba(46,160,67,.18); }
.ats-badge-red { background: rgba(229,83,75,.16); }
.ats-badge-gold { background: rgba(210,153,34,.2); }
.ats-badge-violet { background: rgba(139,92,246,.18); }
.ats-badge-cyan { background: rgba(6,182,212,.16); }
.ats-badge-orange { background: rgba(249,115,22,.18); }
.ats-badge-gray { background: rgba(128,128,128,.14); }
.ats-chip { background: rgba(128,128,128,.08); border: 1px solid rgba(128,128,128,.25); color: inherit; border-radius: 999px; padding: 3px 11px; font-size: 12.5px; cursor: pointer; margin: 0 4px 4px 0; }
.ats-chip-active { background: rgba(59,130,246,.2); border-color: rgba(59,130,246,.5); }
.ats-chip-green { background: rgba(46,160,67,.14); border-color: rgba(46,160,67,.35); }
.ats-chip-red { background: rgba(229,83,75,.12); border-color: rgba(229,83,75,.35); }
.ats-card-list { display: flex; flex-direction: column; gap: 10px; }
.ats-card { border: 1px solid rgba(128,128,128,.2); border-radius: 10px; padding: 12px 16px; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; background: rgba(128,128,128,.04); }
.ats-card-row { align-items: center; }
.ats-card-main { flex: 1; min-width: 0; }
.ats-card-title { font-weight: 600; display: flex; align-items: center; flex-wrap: wrap; }
.ats-card-tags { display: flex; flex-wrap: wrap; margin-top: 4px; }
.ats-card-snippet { margin-top: 6px; font-size: 12.5px; opacity: .72; }
.ats-card-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; align-items: center; flex-shrink: 0; }
.ats-sub-section { margin-top: 22px; }
.ats-sub-title { font-weight: 600; font-size: 14px; margin-bottom: 10px; }
.ats-settings-row { display: flex; gap: 12px; align-items: flex-end; margin-bottom: 18px; }
.ats-settings-actions { flex-shrink: 0; }
.ats-editor-actions { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.ats-two-col { display: flex; gap: 12px; }
.ats-two-col > .ats-field { flex: 1; }
.ats-toast-wrap { position: relative; }
.ats-toast { position: fixed; right: 24px; top: 24px; z-index: 999; background: rgba(46,160,67,.95); color: #fff; border-radius: 10px; padding: 10px 16px; font-size: 13px; box-shadow: 0 6px 24px rgba(0,0,0,.25); max-width: 420px; pointer-events: none; }
.ats-toast-error { background: rgba(229,83,75,.95); }
.ats-mode-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.ats-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 900; padding: 24px; }
.ats-modal { background: var(--dsw-alias-bg-base, #1e1e1e); border: 1px solid rgba(128,128,128,.35); border-radius: 14px; padding: 18px 20px; width: 480px; max-width: 100%; max-height: 86vh; overflow: auto; box-shadow: 0 12px 48px rgba(0,0,0,.4); }
.ats-modal-wide { width: 860px; }
.ats-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.ats-modal-title { font-weight: 600; font-size: 15px; }
.ats-pre { white-space: pre-wrap; font: inherit; font-size: 13px; max-height: 70vh; overflow: auto; margin: 0; }
.ats-empty-card { border: 1px dashed rgba(128,128,128,.35); border-radius: 10px; padding: 48px 20px; text-align: center; }
.ats-empty-card h4 { margin: 0 0 8px; }
.ats-empty-card p { margin: 0 0 16px; opacity: .7; font-size: 13px; }
.ats-empty { text-align: center; padding: 60px 20px; opacity: .75; }
.ats-empty h3 { margin: 0 0 8px; }
.ats-empty p { margin: 0; font-size: 13px; }
.ats-analysis-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.ats-analysis-head-click { cursor: pointer; }
.ats-analysis-head-click:hover .ats-card-title { color: #3b82f6; }
.ats-toggle { font-size: 12px; opacity: .7; flex-shrink: 0; margin-top: 4px; user-select: none; }
.ats-score-box { text-align: center; flex-shrink: 0; }
.ats-score-num { font-size: 30px; font-weight: 700; line-height: 1.1; }
.ats-score-label { font-size: 11px; opacity: .6; }
.ats-score-bar { height: 8px; border-radius: 999px; background: rgba(128,128,128,.14); overflow: hidden; margin: 8px 0; }
.ats-score-fill { height: 100%; border-radius: 999px; }
.ats-score-green { background: #2ea043; }
.ats-score-blue { background: #3b82f6; }
.ats-score-orange { background: #d29922; }
.ats-score-red { background: #e5534b; }
.ats-analysis-summary { margin: 8px 0; opacity: .85; }
.ats-analysis-cols { display: flex; gap: 16px; margin-top: 8px; }
.ats-analysis-col { flex: 1; min-width: 0; }
.ats-analysis-col-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.ats-match { color: #2ea043; }
.ats-gap { color: #e5534b; }
.ats-point-list { margin: 0; padding-left: 18px; }
.ats-point { margin-bottom: 5px; font-size: 13px; }
.ats-evidence { opacity: .6; font-size: 12px; }
.ats-kw-row { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.ats-kw-group { display: flex; align-items: center; flex-wrap: wrap; }
.ats-kw-label { font-size: 12px; opacity: .7; margin-right: 2px; }
.ats-suggest { margin-top: 10px; background: rgba(59,130,246,.07); border: 1px solid rgba(59,130,246,.25); border-radius: 8px; padding: 10px 12px; }
.ats-link { color: #3b82f6; text-decoration: none; }
.ats-task-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
.ats-task-select { width: auto; min-width: 320px; flex: 1; }
.ats-phase-row { display: flex; gap: 6px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
.ats-phase { display: flex; align-items: center; gap: 5px; font-size: 12px; opacity: .45; }
.ats-phase-dot { width: 8px; height: 8px; border-radius: 999px; background: currentColor; }
.ats-phase-done { opacity: .9; color: #2ea043; }
.ats-phase-current { opacity: 1; color: #3b82f6; font-weight: 600; }
.ats-editor { position: relative; }
.ats-sec-list { display: flex; flex-direction: column; gap: 10px; }
.ats-sec { border: 1px solid rgba(128,128,128,.2); border-radius: 10px; padding: 12px 16px; cursor: pointer; background: rgba(128,128,128,.04); transition: border-color .12s; }
.ats-sec:hover { border-color: rgba(59,130,246,.4); }
.ats-sec-missing { border-style: dashed; border-color: rgba(229,83,75,.45); background: rgba(229,83,75,.05); }
.ats-sec-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ats-sec-title { font-weight: 600; }
.ats-sec-hint { margin-left: auto; font-size: 11.5px; opacity: .45; }
.ats-sec-content { font-size: 13.5px; }
.ats-line { margin-bottom: 4px; }
.ats-line-gap { height: 6px; }
.ats-bullet { display: flex; gap: 6px; margin-bottom: 3px; }
.ats-bullet-dot { flex: none; opacity: .55; }
.ats-sentence { border-radius: 3px; padding: 0 1px; }
.ats-sentence:hover { background: rgba(59,130,246,.14); outline: 1px solid rgba(59,130,246,.3); }
.ats-sec-subhead { font-weight: 600; margin: 6px 0 2px; }
.ats-sec-gap { margin-top: 8px; padding: 10px 12px; border-radius: 8px; background: rgba(229,83,75,.08); display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.ats-sec-gap-actions { display: flex; gap: 8px; }
.ats-toolbar { position: fixed; z-index: 850; background: var(--dsw-alias-bg-base, #1e1e1e); border: 1px solid rgba(59,130,246,.5); border-radius: 12px; padding: 12px 14px; box-shadow: 0 10px 40px rgba(0,0,0,.4); width: 400px; max-width: calc(100vw - 32px); }
.ats-toolbar-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.ats-toolbar-label { font-weight: 600; font-size: 13px; }
.ats-toolbar-selected { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; opacity: .75; }
.ats-toolbar-close { background: none; border: none; color: inherit; cursor: pointer; font-size: 13px; }
.ats-toolbar-ops { display: flex; gap: 6px; flex-wrap: wrap; }
.ats-toolbar-op { display: flex; flex-direction: column; align-items: center; gap: 2px; background: rgba(128,128,128,.1); border: 1px solid rgba(128,128,128,.3); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12px; color: inherit; cursor: pointer; min-width: 62px; }
.ats-toolbar-op:hover { border-color: rgba(59,130,246,.6); background: rgba(59,130,246,.14); }
.ats-toolbar-icon { font-size: 15px; }
.ats-toolbar-note { margin-top: 10px; }
.ats-export-bar { margin-top: 20px; border: 1px solid rgba(128,128,128,.25); border-radius: 12px; padding: 14px 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: rgba(128,128,128,.05); }
.ats-export-title { font-weight: 600; }
.ats-export-theme { width: 150px; }
.ats-letter-bar { margin-top: 14px; border: 1px solid rgba(128,128,128,.25); border-radius: 12px; padding: 12px 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; background: rgba(128,128,128,.05); }
.ats-letter-spacer { flex: 1; }
.ats-letter-pre { max-height: 300px; overflow: auto; background: rgba(128,128,128,.06); border-radius: 8px; padding: 10px 12px; }
.ats-checkbox { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.ats-checkbox input { accent-color: #3b82f6; }
.ats-checkbox-disabled { opacity: .45; cursor: default; }
.ats-report-stats { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
.ats-report-stat { display: flex; flex-direction: column; align-items: center; background: rgba(128,128,128,.06); border: 1px solid rgba(128,128,128,.2); border-radius: 10px; padding: 10px 18px; min-width: 96px; }
.ats-report-num { font-size: 22px; font-weight: 700; }
.ats-report-bad { color: #e5534b; }
.ats-report-row { margin-bottom: 8px; display: flex; align-items: center; flex-wrap: wrap; }
.ats-report-warns { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.ats-report-warn { padding: 8px 12px; border-radius: 8px; background: rgba(210,153,34,.12); border: 1px solid rgba(210,153,34,.35); font-size: 13px; }
.ats-preview-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.ats-preview-paper { background: #ffffff; color: #1f1f1f; border-radius: 10px; padding: 38px 44px; max-width: 780px; margin: 10px auto 0; box-shadow: 0 6px 28px rgba(0,0,0,.25); text-align: left; }
.ats-preview-paper p, .ats-preview-paper div { box-sizing: border-box; }
.ats-log { width: 100%; margin-top: 8px; font-size: 12px; }
.ats-log summary { cursor: pointer; opacity: .7; }
.ats-log-line { margin: 2px 0; }
.ats-table-wrap { overflow-x: auto; }
.ats-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ats-table th, .ats-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(128,128,128,.18); vertical-align: top; }
.ats-table th { opacity: .65; font-weight: 600; font-size: 12px; }
.ats-step-select { width: 110px; padding: 4px 8px; }
.ats-table-next { max-width: 260px; }
.ats-seg { display: flex; border: 1px solid rgba(128,128,128,.3); border-radius: 8px; overflow: hidden; }
.ats-seg-btn { background: transparent; border: none; color: inherit; font: inherit; font-size: 13px; padding: 5px 14px; cursor: pointer; }
.ats-seg-active { background: rgba(59,130,246,.22); }
.ats-kanban { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 12px; align-items: flex-start; }
.ats-kanban-col { flex: 1; min-width: 190px; background: rgba(128,128,128,.05); border: 1px solid rgba(128,128,128,.18); border-radius: 10px; padding: 10px; min-height: 140px; }
.ats-kanban-col-drop { border-color: rgba(59,130,246,.55); }
.ats-kanban-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.ats-kanban-card { background: var(--dsw-alias-bg-base, #1e1e1e); border: 1px solid rgba(128,128,128,.25); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; cursor: grab; display: flex; flex-direction: column; gap: 4px; }
.ats-kanban-card:hover { border-color: rgba(59,130,246,.5); }
.ats-kanban-card-title { font-weight: 600; font-size: 13px; }
.ats-kanban-card-company { font-size: 12.5px; opacity: .8; }
.ats-kanban-card-next { font-size: 11.5px; opacity: .6; }
.ats-interview-start { border: 1px solid rgba(128,128,128,.25); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; background: rgba(128,128,128,.05); }
.ats-chips { display: flex; flex-wrap: wrap; gap: 2px; }
.ats-faq { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; }
.ats-faq-col { flex: 1; min-width: 220px; }
.ats-faq-item { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 8px; font-size: 12.5px; }
.ats-faq-item:hover { background: rgba(128,128,128,.08); }
.ats-faq-text { flex: 1; }
.ats-faq-speak { background: none; border: none; cursor: pointer; font-size: 13px; opacity: .65; }
.ats-faq-speak:hover { opacity: 1; }
.ats-edit-done { display: block; }
.ats-edit-result { margin-top: 6px; font-size: 12.5px; opacity: .8; background: rgba(46,160,67,.08); border-radius: 6px; padding: 6px 10px; }
.ats-edit-pending { align-items: center; gap: 8px; }
.ats-edit-row { flex-wrap: wrap; }
.ats-edit-text { font-size: 13px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46%; }
.ats-edit-note { font-size: 12px; opacity: .6; max-width: 26%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ats-edit-spacer { flex: 1; }
.ats-edit-form { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.ats-analysis .ats-card-actions { flex-direction: column; align-items: flex-end; }
.ats-search-grid { display: grid; grid-template-columns: minmax(320px, 5fr) 7fr; gap: 16px; align-items: start; }
.ats-search-side { display: flex; flex-direction: column; gap: 10px; max-height: 72vh; overflow: auto; padding-right: 2px; }
.ats-search-item { border: 1px solid rgba(128,128,128,.22); border-radius: 10px; padding: 10px 12px; cursor: pointer; background: rgba(128,128,128,.04); }
.ats-search-item:hover { border-color: rgba(59,130,246,.5); }
.ats-search-item-active { border-color: rgba(59,130,246,.8); background: rgba(59,130,246,.1); }
.ats-search-applied { opacity: .62; }
.ats-search-item-title { font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ats-search-item-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; align-items: center; }
.ats-search-item-snippet { margin-top: 5px; font-size: 12px; opacity: .65; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ats-search-main { border: 1px solid rgba(128,128,128,.22); border-radius: 10px; padding: 14px 16px; min-height: 320px; }
.ats-search-jd { margin-top: 12px; white-space: pre-wrap; font-size: 13px; line-height: 1.6; max-height: 46vh; overflow: auto; background: rgba(128,128,128,.05); border-radius: 8px; padding: 12px; }
.ats-search-formrow { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
.ats-search-formrow .ats-input { width: auto; }
`

    // ── plugin body ─────────────────────────────────────────────────────────

    const inject = ["slots", "sessions", "uiSession"]

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement("style")
        style.setAttribute("data-dsh-job-ats", "")
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, "dsh-job-ats: styles")

      let showing = false
      let injectDisposers = []
      let registerDisposers = []

      function disposeAll() {
        while (registerDisposers.length) registerDisposers.pop()()
        while (injectDisposers.length) injectDisposers.pop()()
      }

      function registerAll() {
        for (const tab of TABS) {
          injectDisposers.push(
            ctx.slots.inject("conversation.view", () => {
              registerDisposers.push(
                ctx.slots.register(
                  { name: "conversation.view", id: tab.id, order: tab.order, label: () => tab.label },
                  (props) => h(GateView, Object.assign({}, props, { tab, panel: tab.panel })),
                ),
              )
            }),
          )
        }
      }

      function sync() {
        const list = ctx.sessions.list.getSnapshot()
        const sessionId = ctx.uiSession.adapter.current.getSnapshot().props?.sessionId
        const row = sessionId === undefined ? undefined : list.byId[sessionId]
        const preset = sessionPreset(row)
        // 主会话绑定切换或会话清单更新时，按该会话的预设显示对应工作台标签。
        const shouldShow = preset === "job-ats"
        if (shouldShow === showing) return
        showing = shouldShow
        if (shouldShow) registerAll()
        else disposeAll()
      }

      const unsubscribe = ctx.sessions.list.subscribe(sync)
      const unsubscribeMain = ctx.uiSession.adapter.current.subscribe(sync)
      sync()
      ctx.effect(() => () => {
        unsubscribe()
        unsubscribeMain()
        disposeAll()
      }, "dsh-job-ats: tab lifecycle")
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
