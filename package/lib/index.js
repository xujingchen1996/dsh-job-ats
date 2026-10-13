// dsh-job-ats host half. One package, two config-driven roles:
//
// - mode: "api" (host composition row in the profile patch) serves
//   `/ats-api/*` so the browser tabs list/read/write the workspace's
//   `.ats/*` job-hunt state, submit analysis / resume-parse / interview
//   requests, queue targeted ATS edits, and export Word/PDF resumes. This
//   row is also the Loader entry that makes the `dsh.client` browser bundle
//   reach the boot graph.
//
// - mode: "tools" (job-ats preset row) registers the model-facing tools
//   (`ats_*`) into the preset's own tools layer, keeping the agent's view
//   of the job-hunt state consistent with the UI's.
//
// Nothing here publishes a service, so neither row needs an isolate realm.

import { join, dirname, basename } from "node:path"
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { unzipSync, strFromU8 } from "fflate"
import { THEMES, mdParse, buildDocx, buildHtml } from "./docx.js"

export const inject = [
  "fs",
  "tools",
  "web",
  "webServer",
  "sessions",
  "sessionPersistence",
  "sandboxPolicy",
]

const MAX_BODY_BYTES = 512 * 1024
const ATS_DIR = ".ats"

export const STEPS = ["wishlist", "applied", "oa", "phone", "onsite1", "onsite2", "final", "offer", "rejected", "withdrawn"]
export const STEP_LABELS = {
  wishlist: "待投递",
  applied: "已投递",
  oa: "笔试·测评",
  phone: "电话面",
  onsite1: "一面",
  onsite2: "二面",
  final: "终面",
  offer: "Offer",
  rejected: "已拒绝",
  withdrawn: "已放弃",
}
export const ROUNDS = ["hr", "tech", "manager", "group", "final"]
export const ROUND_LABELS = {
  hr: "HR 面",
  tech: "技术面",
  manager: "主管面",
  group: "群面",
  final: "终面",
}
export const OPS = ["rewrite", "irrelevant", "remove", "condense", "adapt", "quantify", "custom"]
export const OP_LABELS = {
  rewrite: "重写",
  irrelevant: "无关",
  remove: "直接消除",
  condense: "精简",
  adapt: "适配",
  quantify: "数据化",
  custom: "自定义",
}

// ── small helpers ───────────────────────────────────────────────────────────

function sendJson(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache",
  })
  res.end(JSON.stringify(value))
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error("request body too large"))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function makeId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function ensureDir(absPath) {
  const dir = dirname(absPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

async function readJson(ctx, cwd, relPath, signal) {
  const target = await ctx.fs.resolve(join(cwd, relPath))
  try {
    return JSON.parse(await ctx.fs.readText(target, signal))
  } catch (error) {
    if (error !== null && typeof error === "object" &&
      (error.code === "ENOENT" || /ENOENT|no such file|not found/i.test(error.message))) {
      return undefined
    }
    throw error
  }
}

async function writeJson(ctx, cwd, relPath, value, session, signal) {
  const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
  const target = await ctx.fs.resolve(join(cwd, relPath))
  ensureDir(ctx.fs.processPath(target))
  await ctx.fs.writeText(target, `${JSON.stringify(value, null, 2)}\n`, undefined, signal, policy)
}

async function resolveWorkspace(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined && typeof live.header.cwd === "string") {
    return { cwd: live.header.cwd, session: live }
  }
  let headers = []
  try {
    headers = await ctx.sessionPersistence.list()
  } catch {
    headers = []
  }
  // Persistence entries changed shape across dsh versions: older ones are the
  // header itself, newer ones wrap it as { header, revision, sizeBytes }.
  const metaEntry = headers.find((entry) => {
    const head = entry !== null && typeof entry === "object" && entry.header !== null && typeof entry.header === "object" ? entry.header : entry
    return head !== null && typeof head === "object" && head.id === sessionId
  })
  const metaCwd = metaEntry !== undefined && metaEntry !== null && typeof metaEntry === "object"
    ? (metaEntry.header !== null && typeof metaEntry.header === "object" && typeof metaEntry.header.cwd === "string" ? metaEntry.header.cwd : (typeof metaEntry.cwd === "string" ? metaEntry.cwd : undefined))
    : undefined
  if (typeof metaCwd === "string" && metaCwd.length > 0) {
    return { cwd: metaCwd, session: undefined }
  }
  return undefined
}

function cleanText(value, max) {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function cleanLink(value) {
  if (typeof value !== "string" || value.trim().length === 0) return ""
  const trimmed = value.trim().slice(0, 1000)
  return /^https?:\/\//i.test(trimmed) ? trimmed : ""
}

function cleanJob(item, id) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return undefined
  const title = cleanText(item.title, 200)
  const company = cleanText(item.company, 200)
  if (!title && !company) return undefined
  return {
    id: cleanText(item.id, 64) || id || makeId("job-"),
    title,
    company,
    link: cleanLink(item.link),
    type: cleanText(item.type, 50),
    location: cleanText(item.location, 100),
    salary: cleanText(item.salary, 100),
    source: cleanText(item.source, 200),
    snippet: cleanText(item.snippet, 5000),
    status: STEPS.includes(item.status) ? item.status : (item.status === "skipped" ? "skipped" : "new"),
    note: cleanText(item.note, 2000),
    createdAt: cleanText(item.createdAt, 40) || new Date().toISOString(),
  }
}

function cleanApplication(item, id) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return undefined
  const position = cleanText(item.position, 200)
  const company = cleanText(item.company, 200)
  if (!position && !company) return undefined
  return {
    id: cleanText(item.id, 64) || id || makeId("app-"),
    position,
    company,
    link: cleanLink(item.link),
    type: cleanText(item.type, 20) || "社招",
    currentStep: STEPS.includes(item.currentStep) ? item.currentStep : "wishlist",
    ddl: cleanText(item.ddl, 40),
    appliedAt: cleanText(item.appliedAt, 40),
    nextAction: cleanText(item.nextAction, 2000),
    notes: cleanText(item.notes, 5000),
    jobId: cleanText(item.jobId, 64),
    updatedAt: new Date().toISOString(),
  }
}

function cleanInterview(item, id) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return undefined
  const round = ROUNDS.includes(item.round) ? item.round : "hr"
  return {
    id: cleanText(item.id, 64) || id || makeId("iv-"),
    round,
    jobId: cleanText(item.jobId, 64),
    company: cleanText(item.company, 200),
    role: cleanText(item.role, 200),
    status: ["pending", "ongoing", "done"].includes(item.status) ? item.status : "pending",
    summary: cleanText(item.summary, 10000),
    startedAt: cleanText(item.startedAt, 40),
    finishedAt: cleanText(item.finishedAt, 40),
  }
}

function cleanResumeEntry(item, id) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return undefined
  return {
    id: cleanText(item.id, 64) || id || makeId("rs-"),
    name: cleanText(item.name, 200) || "未命名简历",
    path: cleanText(item.path, 1000),
    parsed: item.parsed === true,
    parsedAt: cleanText(item.parsedAt, 40),
    lang: cleanText(item.lang, 20),
    summary: cleanText(item.summary, 2000),
  }
}

async function readList(ctx, cwd, relPath, signal) {
  const value = await readJson(ctx, cwd, relPath, signal)
  return Array.isArray(value?.items) ? value.items : []
}

async function writeList(ctx, cwd, relPath, items, session, signal) {
  await writeJson(ctx, cwd, relPath, { items }, session, signal)
}

// ── api mode ────────────────────────────────────────────────────────────────

export function apply(ctx, config) {
  if (config !== null && typeof config === "object" && config.mode === "tools") {
    applyToolsMode(ctx)
  } else {
    applyApiMode(ctx)
  }
}

function applyApiMode(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: "/ats-api",
        handler: async (req, res) => {
          try {
            await handleApiRequest(ctx, req, res)
          } catch (error) {
            sendJson(res, 500, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        },
      }),
    "dsh-job-ats: /ats-api route",
  )
  // 定时搜索清扫器:每 60 秒检查一次已登记工作区的搜索计划,到期则自动执行。
  // 工作区在首次设置定时或手动搜索时登记(见 scheduledSearchCwds);宿主重启后
  // 登记为空,由下次打开「职位搜索」标签页或手动搜索恢复。
  ctx.effect(() => {
    const timer = setInterval(() => {
      sweepScheduledSearches(ctx).catch(() => {})
    }, 60_000)
    return () => clearInterval(timer)
  }, "dsh-job-ats: scheduled search sweep")
}

async function parseJsonBody(req) {
  return JSON.parse(await readBody(req, MAX_BODY_BYTES))
}

async function listDirNames(ctx, dir) {
  try {
    const target = await ctx.fs.resolve(dir)
    const entries = await ctx.fs.listDir(target)
    return entries.filter((entry) => entry.type === "file").map((entry) => ({ name: entry.name, size: entry.size ?? null }))
  } catch {
    return []
  }
}

async function getSettings(ctx, cwd, signal) {
  const settings = await readJson(ctx, cwd, join(ATS_DIR, "settings.json"), signal)
  return {
    resumeDir: typeof settings?.resumeDir === "string" && settings.resumeDir.length > 0 ? settings.resumeDir : null,
    theme: THEMES[settings?.theme] ? settings.theme : "minimal",
  }
}

async function listTasks(ctx, cwd, signal) {
  const tasks = []
  const dir = await ctx.fs.resolve(join(cwd, ATS_DIR, "tasks"))
  let entries = []
  try {
    entries = await ctx.fs.listDir(dir, signal)
  } catch {
    return tasks
  }
  for (const entry of entries) {
    if (entry.type !== "directory") continue
    const taskId = entry.name
    const state = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "state.json"), signal)
    const request = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "request.json"), signal)
    const edits = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "edits.json"), signal)
    const choices = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "choices.json"), signal)
    const pendingEdits = Array.isArray(edits?.items) ? edits.items.filter((e) => e.status === "pending") : []
    const pendingChoices = choices && typeof choices.choices === "object" && choices.choices !== null
      ? Object.keys(choices.choices).filter((k) => choices.choices[k] === "add" || choices.choices[k] === "skip")
      : []
    tasks.push({
      id: taskId,
      status: typeof state?.status === "string" ? state.status : "unknown",
      phase: typeof state?.phase === "string" ? state.phase : "",
      theme: THEMES[request?.theme] ? request.theme : "minimal",
      resumeId: cleanText(request?.resumeId, 64),
      jobId: cleanText(request?.jobId, 64),
      updatedAt: cleanText(state?.updatedAt, 40),
      pendingEdits: pendingEdits.length,
      pendingChoices: pendingChoices.length,
      logTail: Array.isArray(state?.log) ? state.log.slice(-6).map((entry) => (typeof entry === "string" ? entry : entry?.text ?? "")) : [],
    })
  }
  tasks.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
  return tasks.filter((task) => task.status !== "deleted")
}

// ── 职位搜索聚合(.ats/search.json)───────────────────────────────────────────
//
// 聚合方式:Boss直聘 / 实习僧 / OfferShow 没有公开 API,详情页有登录墙与反爬,
// 直接抓取不可靠。这里经 host 的 `web` 搜索服务按 site: 限定聚合公开索引
// (标题 / 链接 / 摘要),JD 详情按需抓取、失败则降级为打开链接。「一键代投」
// 为半自动:写入岗位库 + 投递追踪,返回打招呼语文本(浏览器端复制)并打开岗位页
// —— 各平台投递均需登录态与人工确认,无法也不应无人值守提交。

const SEARCH_FILE = join(ATS_DIR, "search.json")
const SEARCH_SOURCES = {
  boss: { label: "Boss直聘", query: (kw, city) => ["site:zhipin.com", kw, city, "招聘"].filter(Boolean).join(" ") },
  shixiseng: { label: "实习僧", query: (kw, city) => ["site:shixiseng.com", kw, city, "实习"].filter(Boolean).join(" ") },
  offershow: { label: "OfferShow", query: (kw, city) => ["offershow", kw, city, "薪资 岗位"].filter(Boolean).join(" ") },
  web: { label: "全网", query: (kw, city) => [kw, city, "招聘 岗位"].filter(Boolean).join(" ") },
}
const SEARCH_DEFAULT_SOURCES = ["boss", "shixiseng", "offershow", "web"]
const SEARCH_MAX_RESULTS = 600
// 每次查询保留的条目上限。DeepSeek 搜索 provider 内部是带 web_search 工具的
// LLM 调用(max_uses 次内部搜索后按 URL 去重),单次调用就可能返回几十条。
const SEARCH_MAX_PER_QUERY = 30
// 深度档位:每个来源发几个查询变体。变体 = 基础查询 + 后缀,用来扩大召回面
// (同义词 / 时间性 / 内容形态)。来源之间并行、变体串行。
const SEARCH_DEPTHS = {
  fast: { label: "快", variants: 1 },
  standard: { label: "标准", variants: 2 },
  deep: { label: "深度", variants: 4 },
}
const SEARCH_QUERY_SUFFIXES = [
  "",
  " 2026 招聘信息",
  " 薪资 待遇",
  " 岗位要求 任职条件",
]
// 自动代抓 JD:搜索完成后按排名给头部结果抓详情,「搜到就有」;其余结果在
// 用户点开时由浏览器自动触发补抓。已知登录墙站点(Boss直聘对未登录返回
// 验证页)直接标记跳过 —— 服务器没有用户登录态,代抓必然失败,不浪费请求。
const SEARCH_JD_AUTO_LIMIT = { fast: 6, standard: 12, deep: 18 }
const SEARCH_JD_CONCURRENCY = 5
const SEARCH_JD_SKIP_HOST = /(^|\.)zhipin\.com$/i
const CITY_POOL = [
  "北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉", "西安", "苏州",
  "天津", "长沙", "重庆", "合肥", "郑州", "厦门", "福州", "济南", "青岛", "大连",
  "宁波", "无锡", "佛山", "东莞", "沈阳", "哈尔滨", "昆明", "远程",
]

// 已登记定时搜索的工作区(cwd)。宿主重启后为空,首次设置定时/手动搜索时恢复。
const scheduledSearchCwds = new Set()

async function sweepScheduledSearches(ctx) {
  for (const cwd of [...scheduledSearchCwds]) {
    try {
      const data = await readJson(ctx, cwd, SEARCH_FILE, undefined)
      const cfg = data && data.config && typeof data.config === "object" ? data.config : null
      if (!cfg || cfg.scheduleEnabled !== true) {
        scheduledSearchCwds.delete(cwd)
        continue
      }
      const due = typeof cfg.nextRunAt !== "number" || Date.now() >= cfg.nextRunAt
      if (!due) continue
      await runSearchNow(ctx, cwd, undefined, {
        keywords: cfg.keywords,
        city: cfg.city,
        sources: cfg.sources,
        depth: cfg.depth,
        fallbackDepth: "standard",
        by: "schedule",
      }, undefined)
    } catch {
      // 单个工作区失败不影响其他;留给下次清扫重试
    }
  }
}

function searchResultId(url) {
  // djb2 → base36:只做去重键,不需要密码学强度
  let h = 5381
  const text = String(url || "")
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return "s" + (h >>> 0).toString(36)
}

function extractSalary(text) {
  const m = String(text || "").match(
    /(\d+\s*[-~～]\s*\d+\s*[KkW万]|\d+\s*[KkW万]\s*[-~～]\s*\d+\s*[KkW万]|\d+\s*元\s*\/\s*天|\d+\s*万?\s*\/\s*年|\d+\s*[-~～]\s*\d+\s*元\s*\/\s*天)/,
  )
  return m ? m[1].replace(/\s+/g, "") : null
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function guessCompany(title) {
  const m = String(title || "").match(/【(.+?)】|(.+?)招聘|(.+?)直聘|(.+?)诚聘/)
  const hit = m && (m[1] || m[2] || m[3] || m[4])
  return typeof hit === "string" && hit.length > 1 && hit.length <= 40 ? hit.trim() : null
}

function defaultSearchConfig() {
  return {
    keywords: "",
    city: "",
    sources: SEARCH_DEFAULT_SOURCES,
    depth: "standard",
    scheduleEnabled: false,
    intervalMinutes: 30,
    lastRunAt: null,
    nextRunAt: null,
  }
}

// 归一化用于去重与展示:去 fragment、去跟踪参数(utm_* / spm);不动业务参数
// (如 zhipin 的 securityId/lid 是打开岗位页必需的)。
function normalizeJobUrl(raw) {
  try {
    const u = new URL(String(raw))
    u.hash = ""
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_[a-z_]*|spm)$/i.test(key)) u.searchParams.delete(key)
    }
    let s = u.toString()
    if (s.endsWith("?")) s = s.slice(0, -1)
    return s
  } catch {
    return null
  }
}

function isJdSkipHost(url) {
  try {
    return SEARCH_JD_SKIP_HOST.test(new URL(String(url)).hostname)
  } catch {
    return false
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items]
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      try {
        await worker(item)
      } catch {
        // worker 内部已兜底;这里只为不让单个失败打断整批
      }
    }
  })
  await Promise.all(runners)
}

// 批量代抓 JD:成功写 item.jd;失败写 item.jdUnavailable(原因),客户端据此
// 显示诚实提示而不是无限重试。返回 {fetched, skipped, failed}。
async function autoFetchJds(ctx, cwd, session, results, limit, signal) {
  const pending = results.filter((r) => !r.jd && !r.jdUnavailable).slice(0, limit)
  let fetched = 0
  let skipped = 0
  let failed = 0
  await mapWithConcurrency(pending, SEARCH_JD_CONCURRENCY, async (item) => {
    if (signal !== undefined && signal.aborted) return
    if (isJdSkipHost(item.url)) {
      item.jdUnavailable = "该站点(Boss直聘)详情页需要登录,服务器无法代抓"
      skipped++
      return
    }
    try {
      const out = await ctx.web.fetch({ url: item.url }, signal)
      if (out.statusCode >= 400) throw new Error(`页面返回 ${out.statusCode}`)
      const content = out.body && typeof out.body.content === "string" ? out.body.content : ""
      const text = stripHtml(content).slice(0, 20000)
      if (text.length < 80) throw new Error("页面内容过短,可能需要登录后才能看到 JD")
      item.jd = text
      fetched++
    } catch (error) {
      item.jdUnavailable = error instanceof Error ? error.message : String(error)
      failed++
    }
  })
  return { fetched, skipped, failed }
}

async function readSearchData(ctx, cwd, signal) {
  const data = await readJson(ctx, cwd, SEARCH_FILE, signal)
  return {
    config: data && data.config && typeof data.config === "object" ? { ...defaultSearchConfig(), ...data.config } : defaultSearchConfig(),
    results: data && Array.isArray(data.results) ? data.results : [],
  }
}

async function runSearchNow(ctx, cwd, session, opts, signal) {
  const keywords = cleanText(opts.keywords, 120)
  if (!keywords) throw new Error("缺少搜索关键词(keywords)")
  const city = cleanText(opts.city, 40)
  const requested = Array.isArray(opts.sources) && opts.sources.length > 0 ? opts.sources : SEARCH_DEFAULT_SOURCES
  const useSources = requested.filter((s) => SEARCH_SOURCES[s])
  const finalSources = useSources.length > 0 ? useSources : SEARCH_DEFAULT_SOURCES
  // 深度档位决定每个来源发几个查询变体;定时任务用上次保存的档位
  const depthKey = SEARCH_DEPTHS[opts.depth] ? opts.depth : (SEARCH_DEPTHS[opts.fallbackDepth] ? opts.fallbackDepth : "standard")
  const variantCount = SEARCH_DEPTHS[depthKey].variants

  const data = await readSearchData(ctx, cwd, signal)
  const results = data.results
  const seenUrls = new Set(results.map((r) => r.url))

  const fresh = []
  const perSource = {}
  const startedAt = Date.now()

  // 每个来源内部串行跑自己的查询变体,来源之间并行 —— 墙钟时间 ≈ 最慢来源
  async function runSource(sid) {
    const src = SEARCH_SOURCES[sid]
    let added = 0
    const errors = []
    for (const suffix of SEARCH_QUERY_SUFFIXES.slice(0, variantCount)) {
      if (signal !== undefined && signal.aborted) break
      try {
        const query = src.query(keywords, city) + suffix
        const out = await ctx.web.search({ query, maxResults: SEARCH_MAX_PER_QUERY })
        for (const s of out?.sources ?? []) {
          if (!s.url) continue
          const url = normalizeJobUrl(s.url)
          if (!url || seenUrls.has(url)) continue
          seenUrls.add(url)
          const text = `${s.title || ""} ${s.snippet || ""}`
          fresh.push({
            id: searchResultId(url),
            title: cleanText(s.title, 160) || "(无标题)",
            company: guessCompany(s.title) || src.label,
            url,
            source: sid,
            sourceLabel: src.label,
            city: city || CITY_POOL.find((c) => text.includes(c)) || null,
            salary: extractSalary(text),
            snippet: cleanText(s.snippet, 300) || null,
            publishedAt: typeof s.publishedAt === "string" ? s.publishedAt : null,
            fetchedAt: new Date().toISOString(),
            jd: null,
            applied: false,
          })
          added++
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
    perSource[sid] = { ok: errors.length === 0, added, errors: errors.slice(0, 2) }
  }

  await Promise.all(finalSources.map(runSource))

  const merged = [...fresh, ...results].slice(0, SEARCH_MAX_RESULTS)
  const cfg = data.config
  cfg.keywords = keywords
  cfg.city = city
  cfg.sources = finalSources
  cfg.depth = depthKey
  cfg.lastRunAt = Date.now()
  if (opts.by === "schedule" && cfg.scheduleEnabled === true) {
    cfg.nextRunAt = Date.now() + Math.max(5, Number(cfg.intervalMinutes) || 30) * 60_000
  }
  // 「搜到就有」:合并后新结果排前,自动代抓头部结果的 JD(登录墙站点标记跳过)
  const jdStats = await autoFetchJds(ctx, cwd, session, merged, SEARCH_JD_AUTO_LIMIT[depthKey] ?? 12, signal)
  await writeJson(ctx, cwd, SEARCH_FILE, { config: cfg, results: merged }, session, signal)
  scheduledSearchCwds.add(cwd)
  return {
    added: fresh.length,
    total: merged.length,
    perSource,
    depth: depthKey,
    queries: finalSources.length * variantCount,
    elapsedMs: Date.now() - startedAt,
    jdAuto: jdStats,
  }
}

// 一键代投的共同实现(路由与模型工具共用):收录进岗位库 → 写投递追踪 →
// 标记结果已投 → 返回链接与打招呼语。
async function applySearchItem(ctx, cwd, session, id, greeting, signal) {
  const data = await readSearchData(ctx, cwd, signal)
  const item = data.results.find((r) => String(r.id) === String(id))
  if (item === undefined) return undefined

  const jobs = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
  let job = jobs.find((j) => cleanLink(j.link) === cleanLink(item.url))
  if (job === undefined) {
    const isIntern = /实习/.test(`${item.title} ${item.snippet || ""}`)
    job = cleanJob(
      {
        title: item.title,
        company: item.company,
        link: item.url,
        type: isIntern ? "实习" : "社招",
        location: item.city ?? "",
        salary: item.salary ?? "",
        source: `搜索·${item.sourceLabel}`,
        snippet: item.snippet ?? "",
        status: "applied",
      },
      makeId("job-"),
    )
    if (job !== undefined) {
      jobs.push(job)
      await writeList(ctx, cwd, join(ATS_DIR, "jobs.json"), jobs, session, signal)
    }
  }

  const applications = await readList(ctx, cwd, join(ATS_DIR, "applications.json"), signal)
  const exists = applications.find((a) => cleanLink(a.link) === cleanLink(item.url))
  if (exists === undefined) {
    const app = cleanApplication(
      {
        position: item.title,
        company: item.company,
        link: item.url,
        type: job?.type || "社招",
        currentStep: "applied",
        note: "职位搜索·一键代投",
      },
      makeId("app-"),
    )
    if (app !== undefined) {
      applications.unshift(app)
      await writeList(ctx, cwd, join(ATS_DIR, "applications.json"), applications, session, signal)
    }
  }

  item.applied = true
  await writeJson(ctx, cwd, SEARCH_FILE, data, session, signal)

  const finalGreeting =
    cleanText(greeting, 500) ||
    `您好!看到贵司发布的「${item.title}」岗位,与我的背景很匹配,非常感兴趣,期待与您进一步沟通!`
  return { url: item.url, greeting: finalGreeting, company: item.company, position: item.title }
}

async function handleApiRequest(ctx, req, res) {
  let url
  try {
    url = new URL(req.url ?? "/", "http://localhost")
  } catch {
    sendJson(res, 400, { ok: false, error: "malformed request url" })
    return
  }
  const route = url.pathname
  if (route === "/ats-api/ping") {
    sendJson(res, 200, { ok: true })
    return
  }
  const sessionId = url.searchParams.get("sessionId")
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 200) {
    sendJson(res, 400, { ok: false, error: "missing or invalid sessionId" })
    return
  }
  const resolved = await resolveWorkspace(ctx, sessionId)
  if (resolved === undefined) {
    sendJson(res, 404, { ok: false, error: "session not found" })
    return
  }
  const { cwd, session } = resolved
  const signal = undefined

  // ── state ──
  if (route === "/ats-api/state" && req.method === "GET") {
    const settings = await getSettings(ctx, cwd, signal)
    const jobs = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
    const analyses = await readList(ctx, cwd, join(ATS_DIR, "analyses.json"), signal)
    const resumes = await readList(ctx, cwd, join(ATS_DIR, "resumes.json"), signal)
    const applications = await readList(ctx, cwd, join(ATS_DIR, "applications.json"), signal)
    const interviews = await readList(ctx, cwd, join(ATS_DIR, "interviews.json"), signal)
    const analysisRequest = await readJson(ctx, cwd, join(ATS_DIR, "analysis.request.json"), signal)
    const resumeRequest = await readJson(ctx, cwd, join(ATS_DIR, "resume.request.json"), signal)
    const interviewRequest = await readJson(ctx, cwd, join(ATS_DIR, "interview.request.json"), signal)
    const tasks = await listTasks(ctx, cwd, signal)
    const resumeDir = settings.resumeDir ? settings.resumeDir : cwd
    const resumeFiles = await listDirNames(ctx, resumeDir)
    const exports = await listDirNames(ctx, join(cwd, ATS_DIR, "exports"))
    const jobsById = new Map(jobs.map((job) => [job.id, job]))
    const resumesById = new Map(resumes.map((rs) => [rs.id, rs]))
    const taskRows = tasks.map((task) => ({
      ...task,
      resumeName: task.resumeId && resumesById.has(task.resumeId) ? resumesById.get(task.resumeId).name : "",
      jobTitle: task.jobId && jobsById.has(task.jobId) ? `${jobsById.get(task.jobId).title || ""} @ ${jobsById.get(task.jobId).company || ""}` : "",
    }))
    sendJson(res, 200, {
      ok: true,
      workspace: cwd,
      settings,
      jobs,
      analyses,
      analysisRequest: analysisRequest ?? null,
      resumeRequest: resumeRequest ?? null,
      resumes,
      resumeFiles: resumeFiles.filter((f) => /\.(pdf|docx|doc|md|markdown|txt)$/i.test(f.name)),
      applications,
      interviews,
      interviewRequest: interviewRequest ?? null,
      tasks: taskRows,
      exports: exports.filter((f) => /\.(docx|pdf|html?)$/i.test(f.name)),
    })
    return
  }

  // ── 职位搜索聚合 ──
  if (route === "/ats-api/search" && req.method === "GET") {
    const data = await readSearchData(ctx, cwd, signal)
    sendJson(res, 200, {
      ok: true,
      config: data.config,
      results: data.results,
      sources: Object.entries(SEARCH_SOURCES).map(([id, s]) => ({ id, label: s.label })),
    })
    return
  }

  if (route === "/ats-api/search/run" && req.method === "POST") {
    const body = await parseJsonBody(req)
    const out = await runSearchNow(ctx, cwd, session, {
      keywords: body?.keywords,
      city: body?.city,
      sources: body?.sources,
      depth: body?.depth,
      fallbackDepth: "standard",
      by: "manual",
    }, signal)
    sendJson(res, 200, { ok: true, ...out })
    return
  }

  if (route === "/ats-api/search/schedule" && req.method === "POST") {
    const body = await parseJsonBody(req)
    const data = await readSearchData(ctx, cwd, signal)
    const cfg = data.config
    cfg.scheduleEnabled = body?.enabled === true
    cfg.intervalMinutes = Math.max(5, Math.min(720, Number(body?.intervalMinutes) || 30))
    if (typeof body?.keywords === "string") cfg.keywords = cleanText(body.keywords, 120)
    if (typeof body?.city === "string") cfg.city = cleanText(body.city, 40)
    if (Array.isArray(body?.sources)) {
      const filtered = body.sources.filter((s) => SEARCH_SOURCES[s])
      if (filtered.length > 0) cfg.sources = filtered
    }
    if (typeof body?.depth === "string" && SEARCH_DEPTHS[body.depth]) cfg.depth = body.depth
    cfg.nextRunAt = cfg.scheduleEnabled ? Date.now() + cfg.intervalMinutes * 60_000 : null
    await writeJson(ctx, cwd, SEARCH_FILE, data, session, signal)
    if (cfg.scheduleEnabled) scheduledSearchCwds.add(cwd)
    else scheduledSearchCwds.delete(cwd)
    sendJson(res, 200, { ok: true, config: cfg })
    return
  }

  if (route === "/ats-api/search/jd" && req.method === "POST") {
    const body = await parseJsonBody(req)
    const data = await readSearchData(ctx, cwd, signal)
    const item = data.results.find((r) => String(r.id) === String(body?.id))
    if (item === undefined) {
      sendJson(res, 404, { ok: false, error: "找不到该搜索结果" })
      return
    }
    if (typeof item.jd === "string" && item.jd.length > 0) {
      sendJson(res, 200, { ok: true, jd: item.jd, cached: true })
      return
    }
    try {
      const out = await ctx.web.fetch({ url: item.url })
      if (out.statusCode >= 400) throw new Error(`页面返回 ${out.statusCode}(该站点可能需要登录)`)
      const content = out.body && typeof out.body.content === "string" ? out.body.content : ""
      const text = stripHtml(content).slice(0, 20000)
      if (text.length < 80) throw new Error("页面内容过短,可能需要登录后才能看到 JD")
      item.jd = text
      await writeJson(ctx, cwd, SEARCH_FILE, data, session, signal)
      sendJson(res, 200, { ok: true, jd: text })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      sendJson(res, 200, { ok: false, error: `${msg};请直接打开链接查看 JD`, url: item.url })
    }
    return
  }

  if (route === "/ats-api/search/apply" && req.method === "POST") {
    const body = await parseJsonBody(req)
    const out = await applySearchItem(ctx, cwd, session, body?.id, body?.greeting, signal)
    if (out === undefined) {
      sendJson(res, 404, { ok: false, error: "找不到该搜索结果" })
      return
    }
    sendJson(res, 200, { ok: true, ...out })
    return
  }

  // ── settings ──
  if (route === "/ats-api/settings" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    const current = await getSettings(ctx, cwd, signal)
    const next = { ...current }
    if (body && typeof body === "object" && THEMES[body.theme]) next.theme = body.theme
    if (body && typeof body === "object" && typeof body.resumeDir === "string" && body.resumeDir.trim().length > 0 && body.resumeDir.trim().length <= 1000) {
      next.resumeDir = body.resumeDir.trim()
    }
    try {
      await writeJson(ctx, cwd, join(ATS_DIR, "settings.json"), next, session, signal)
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `无法保存设置：${error instanceof Error ? error.message : String(error)}` })
      return
    }
    sendJson(res, 200, { ok: true, settings: next })
    return
  }

  // ── jobs CRUD ──
  if (route === "/ats-api/jobs" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    const action = body?.action
    if (action === "remove") {
      const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String))
      const items = (await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)).filter((job) => !ids.has(String(job.id)))
      await writeList(ctx, cwd, join(ATS_DIR, "jobs.json"), items, session, signal)
      sendJson(res, 200, { ok: true, items })
      return
    }
    const clean = cleanJob(body?.item)
    if (clean === undefined) {
      sendJson(res, 400, { ok: false, error: "item 需要至少包含 title 或 company" })
      return
    }
    const items = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
    const idx = items.findIndex((job) => String(job.id) === String(clean.id))
    if (idx >= 0) items[idx] = clean
    else items.push(clean)
    await writeList(ctx, cwd, join(ATS_DIR, "jobs.json"), items, session, signal)
    sendJson(res, 200, { ok: true, item: clean })
    return
  }

  // ── analysis request ──
  if (route === "/ats-api/job-analyze" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    const jobId = cleanText(body?.jobId, 64)
    const jobs = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
    if (!jobs.some((job) => String(job.id) === jobId)) {
      sendJson(res, 400, { ok: false, error: "jobId 不在岗位列表中" })
      return
    }
    const request = { jobId, note: cleanText(body?.note, 500), createdAt: new Date().toISOString() }
    await writeJson(ctx, cwd, join(ATS_DIR, "analysis.request.json"), request, session, signal)
    sendJson(res, 200, { ok: true, request })
    return
  }

  // ── resume parse request ──
  if (route === "/ats-api/resume-parse" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    const name = cleanText(body?.name, 200)
    if (!name || name.includes("/") || name.includes("..") || !/\.(pdf|docx|doc|md|markdown|txt)$/i.test(name)) {
      sendJson(res, 400, { ok: false, error: "name 必须是简历目录内的文件名（.pdf/.docx/.doc/.md/.txt）" })
      return
    }
    const settings = await getSettings(ctx, cwd, signal)
    const dir = settings.resumeDir || cwd
    const path = join(dir, name)
    const request = { path, name, createdAt: new Date().toISOString() }
    await writeJson(ctx, cwd, join(ATS_DIR, "resume.request.json"), request, session, signal)
    sendJson(res, 200, { ok: true, request })
    return
  }

  // ── resumes CRUD ──
  if (route === "/ats-api/resumes" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    if (body?.action === "remove") {
      const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String))
      const items = (await readList(ctx, cwd, join(ATS_DIR, "resumes.json"), signal)).filter((rs) => !ids.has(String(rs.id)))
      await writeList(ctx, cwd, join(ATS_DIR, "resumes.json"), items, session, signal)
      sendJson(res, 200, { ok: true, items })
      return
    }
    sendJson(res, 400, { ok: false, error: "unsupported action" })
    return
  }

  // ── task create / remove ──
  if (route === "/ats-api/task" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    if (body?.action === "remove") {
      const taskId = cleanText(body.taskId, 64)
      if (!taskId) {
        sendJson(res, 400, { ok: false, error: "missing taskId" })
        return
      }
      const base = join(ATS_DIR, "tasks", taskId)
      const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
      if (request !== undefined) {
        await writeJson(ctx, cwd, join(base, "state.json"), {
          status: "deleted",
          phase: "deleted",
          message: "任务已删除",
          log: [{ ts: new Date().toISOString(), text: "用户在标签页删除了任务" }],
          sections: [],
          missing: [],
          updatedAt: new Date().toISOString(),
        }, session, signal)
      }
      sendJson(res, 200, { ok: true, removed: taskId })
      return
    }
    if (body?.action === "create") {
      const resumeId = cleanText(body.resumeId, 64)
      if (!resumeId) {
        sendJson(res, 400, { ok: false, error: "请先选择一份简历（在「简历库」标签页解析后使用）" })
        return
      }
      const resumes = await readList(ctx, cwd, join(ATS_DIR, "resumes.json"), signal)
      if (!resumes.some((rs) => String(rs.id) === resumeId)) {
        sendJson(res, 400, { ok: false, error: "resumeId 不在简历库中" })
        return
      }
      const jobId = cleanText(body.jobId, 64)
      if (jobId) {
        const jobs = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
        if (!jobs.some((job) => String(job.id) === jobId)) {
          sendJson(res, 400, { ok: false, error: "jobId 不在岗位列表中" })
          return
        }
      }
      const theme = THEMES[body.theme] ? body.theme : "minimal"
      const taskId = makeId("task-")
      const request = { resumeId, jobId, theme, createdAt: new Date().toISOString() }
      await writeJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "request.json"), request, session, signal)
      await writeJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "state.json"), {
        status: "requested",
        phase: "created",
        message: "等待助手开始优化",
        log: [{ ts: new Date().toISOString(), text: "任务已创建，等待助手处理" }],
        sections: [],
        missing: [],
        updatedAt: new Date().toISOString(),
      }, session, signal)
      await writeJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "edits.json"), { items: [] }, session, signal)
      await writeJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "choices.json"), { choices: {}, updatedAt: new Date().toISOString() }, session, signal)
      sendJson(res, 200, { ok: true, taskId, request })
      return
    }
    sendJson(res, 400, { ok: false, error: "action 必须是 create 或 remove" })
    return
  }

  if (route === "/ats-api/task" && req.method === "GET") {
    const taskId = cleanText(url.searchParams.get("taskId"), 64)
    if (!taskId) {
      sendJson(res, 400, { ok: false, error: "missing taskId" })
      return
    }
    const base = join(ATS_DIR, "tasks", taskId)
    const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
    if (request === undefined) {
      sendJson(res, 404, { ok: false, error: "task not found" })
      return
    }
    const state = await readJson(ctx, cwd, join(base, "state.json"), signal)
    const edits = await readJson(ctx, cwd, join(base, "edits.json"), signal)
    const choices = await readJson(ctx, cwd, join(base, "choices.json"), signal)
    const letterRequest = await readJson(ctx, cwd, join(base, "letter.request.json"), signal)
    let markdown = ""
    try {
      markdown = await ctx.fs.readText(await ctx.fs.resolve(join(cwd, base, "resume.md")), signal)
    } catch {
      markdown = ""
    }
    markdown = sanitizeResumeMarkdown(markdown)
    let letter = ""
    try {
      letter = await ctx.fs.readText(await ctx.fs.resolve(join(cwd, base, "letter.md")), signal)
    } catch {
      letter = ""
    }
    letter = sanitizeResumeMarkdown(letter)
    sendJson(res, 200, {
      ok: true,
      taskId,
      request,
      state: state ?? null,
      edits: edits ?? { items: [] },
      choices: choices ?? { choices: {} },
      markdown,
      letter,
      letterRequest: letterRequest ?? null,
    })
    return
  }

  // ── cover letter request ──
  if (route === "/ats-api/task/letter" && req.method === "POST") {
    const taskId = cleanText(url.searchParams.get("taskId"), 64)
    if (!taskId) {
      sendJson(res, 400, { ok: false, error: "missing taskId" })
      return
    }
    const base = join(ATS_DIR, "tasks", taskId)
    const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
    if (request === undefined) {
      sendJson(res, 404, { ok: false, error: "task not found" })
      return
    }
    const letterRequest = { createdAt: new Date().toISOString() }
    await writeJson(ctx, cwd, join(base, "letter.request.json"), letterRequest, session, signal)
    sendJson(res, 200, { ok: true, letterRequest })
    return
  }

  // ── targeted edits queue ──
  if (route === "/ats-api/task/edits" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    const taskId = cleanText(body?.taskId, 64)
    if (!taskId) {
      sendJson(res, 400, { ok: false, error: "missing taskId" })
      return
    }
    const base = join(ATS_DIR, "tasks", taskId)
    const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
    if (request === undefined) {
      sendJson(res, 404, { ok: false, error: "task not found" })
      return
    }
    const rawItems = Array.isArray(body?.items) ? body.items : []
    if (rawItems.length === 0 || rawItems.length > 50) {
      sendJson(res, 400, { ok: false, error: "items 必须是非空数组（最多 50 条）" })
      return
    }
    const edits = (await readJson(ctx, cwd, join(base, "edits.json"), signal)) ?? { items: [] }
    if (!Array.isArray(edits.items)) edits.items = []
    for (const item of rawItems) {
      const text = cleanText(item?.text, 4000)
      if (!text) continue
      const op = OPS.includes(item?.op) ? item.op : "rewrite"
      edits.items.push({
        id: makeId("ed-"),
        sectionId: cleanText(item?.sectionId, 64),
        text,
        op,
        note: cleanText(item?.note, 500),
        status: "pending",
        createdAt: new Date().toISOString(),
      })
    }
    await writeJson(ctx, cwd, join(base, "edits.json"), edits, session, signal)
    sendJson(res, 200, { ok: true, edits })
    return
  }

  // ── targeted edits: update / remove a queued entry ──
  if (route === "/ats-api/task/edits/remove" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    const taskId = cleanText(body?.taskId, 64)
    const editId = cleanText(body?.editId, 64)
    if (!taskId || !editId) {
      sendJson(res, 400, { ok: false, error: "missing taskId or editId" })
      return
    }
    const base = join(ATS_DIR, "tasks", taskId)
    const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
    if (request === undefined) {
      sendJson(res, 404, { ok: false, error: "task not found" })
      return
    }
    const edits = (await readJson(ctx, cwd, join(base, "edits.json"), signal)) ?? { items: [] }
    if (!Array.isArray(edits.items)) edits.items = []
    const before = edits.items.length
    edits.items = edits.items.filter((item) => String(item?.id) !== editId)
    if (edits.items.length === before) {
      sendJson(res, 404, { ok: false, error: "edit not found" })
      return
    }
    await writeJson(ctx, cwd, join(base, "edits.json"), edits, session, signal)
    sendJson(res, 200, { ok: true, edits })
    return
  }

  if (route === "/ats-api/task/edits/update" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    const taskId = cleanText(body?.taskId, 64)
    const editId = cleanText(body?.editId, 64)
    if (!taskId || !editId) {
      sendJson(res, 400, { ok: false, error: "missing taskId or editId" })
      return
    }
    const base = join(ATS_DIR, "tasks", taskId)
    const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
    if (request === undefined) {
      sendJson(res, 404, { ok: false, error: "task not found" })
      return
    }
    const edits = (await readJson(ctx, cwd, join(base, "edits.json"), signal)) ?? { items: [] }
    if (!Array.isArray(edits.items)) edits.items = []
    const item = edits.items.find((entry) => String(entry?.id) === editId)
    if (item === undefined) {
      sendJson(res, 404, { ok: false, error: "edit not found" })
      return
    }
    if (typeof body.text === "string" && body.text.trim().length > 0) {
      item.text = cleanText(body.text, 4000)
    }
    if (typeof body.op === "string" && OPS.includes(body.op)) {
      item.op = body.op
    }
    if (typeof body.note === "string") {
      item.note = cleanText(body.note, 500)
    }
    item.updatedAt = new Date().toISOString()
    if (!item.text) {
      sendJson(res, 400, { ok: false, error: "text 不能为空" })
      return
    }
    await writeJson(ctx, cwd, join(base, "edits.json"), edits, session, signal)
    sendJson(res, 200, { ok: true, edits })
    return
  }

  // ── missing-section choices ──
  if (route === "/ats-api/task/choices" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    const taskId = cleanText(body?.taskId, 64)
    if (!taskId) {
      sendJson(res, 400, { ok: false, error: "missing taskId" })
      return
    }
    const base = join(ATS_DIR, "tasks", taskId)
    const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
    if (request === undefined) {
      sendJson(res, 404, { ok: false, error: "task not found" })
      return
    }
    const choices = (await readJson(ctx, cwd, join(base, "choices.json"), signal)) ?? { choices: {} }
    if (typeof choices.choices !== "object" || choices.choices === null) choices.choices = {}
    const incoming = body?.choices
    if (incoming === null || typeof incoming !== "object" || Array.isArray(incoming)) {
      sendJson(res, 400, { ok: false, error: "choices 必须是 {章节id: 'add'|'skip'} 对象" })
      return
    }
    let changed = 0
    for (const key of Object.keys(incoming)) {
      if (key.length > 64) continue
      if (incoming[key] === "add" || incoming[key] === "skip") {
        choices.choices[key] = incoming[key]
        changed++
      }
    }
    choices.updatedAt = new Date().toISOString()
    await writeJson(ctx, cwd, join(base, "choices.json"), choices, session, signal)
    sendJson(res, 200, { ok: true, changed, choices })
    return
  }

  // ── export ──
  if (route === "/ats-api/export" && req.method === "GET") {
    const taskId = cleanText(url.searchParams.get("taskId"), 64)
    const format = url.searchParams.get("format")
    const themeId = url.searchParams.get("theme")
    if (!taskId) {
      sendJson(res, 400, { ok: false, error: "missing taskId" })
      return
    }
    if (!["docx", "pdf", "html"].includes(format)) {
      sendJson(res, 400, { ok: false, error: "format 必须是 docx / pdf / html" })
      return
    }
    const theme = THEMES[themeId] ? THEMES[themeId] : THEMES.minimal
    const base = join(ATS_DIR, "tasks", taskId)
    const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
    if (request === undefined) {
      sendJson(res, 404, { ok: false, error: "task not found" })
      return
    }
    const state = await readJson(ctx, cwd, join(base, "state.json"), signal)
    let markdown = ""
    try {
      markdown = await ctx.fs.readText(await ctx.fs.resolve(join(cwd, base, "resume.md")), signal)
    } catch {
      markdown = ""
    }
    if (!markdown && Array.isArray(state?.sections)) {
      markdown = state.sections
        .filter((section) => section && section.status !== "missing" && typeof section.content === "string" && section.content.length > 0)
        .map((section) => `## ${section.title || ""}\n\n${section.content}`)
        .join("\n\n")
    }
    markdown = sanitizeResumeMarkdown(markdown)
    if (!markdown.trim()) {
      sendJson(res, 404, { ok: false, error: "简历内容为空：先在「ATS 优化」标签页等待助手生成简历" })
      return
    }
    let letter = ""
    if (url.searchParams.get("includeLetter") === "1") {
      try {
        letter = await ctx.fs.readText(await ctx.fs.resolve(join(cwd, base, "letter.md")), signal)
      } catch {
        letter = ""
      }
    }
    letter = sanitizeResumeMarkdown(letter)
    const firstH1 = mdParse(markdown).find((block) => block.type === "h1")
    const jobs = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
    const job = jobs.find((entry) => String(entry.id) === String(request.jobId))
    const company = job?.company ? String(job.company) : ""
    const meta = { title: firstH1 ? firstH1.text : company ? `简历 - ${company}` : "简历", company }
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "").replace("T", "-")
    const safeCompany = company.replace(/[\\/:*?"<>|\s]+/g, "").slice(0, 30)
    const stem = `简历_${safeCompany || "通用"}_${letter.trim() ? "含求职信_" : ""}${theme.id}_${stamp}`
    const exportsDir = join(cwd, ATS_DIR, "exports")
    const exportTarget = await ctx.fs.resolve(exportsDir)

    if (format === "docx") {
      const bytes = buildDocx(markdown, meta, theme, letter || undefined)
      const name = `${stem}.docx`
      const filePath = join(ctx.fs.processPath(exportTarget), name)
      ensureDir(filePath)
      writeFileSync(filePath, bytes)
      sendJson(res, 200, { ok: true, url: `/ats-api/download?sessionId=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(name)}`, name, format: "docx" })
      return
    }
    const html = buildHtml(markdown, meta, theme, letter || undefined)
    const htmlName = `${stem}.html`
    const htmlPath = join(ctx.fs.processPath(exportTarget), htmlName)
    ensureDir(htmlPath)
    writeFileSync(htmlPath, html, "utf8")
    if (format === "html") {
      sendJson(res, 200, { ok: true, url: `/ats-api/download?sessionId=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(htmlName)}`, name: htmlName, format: "html" })
      return
    }
    const chrome = findChrome()
    if (chrome === undefined) {
      sendJson(res, 501, {
        ok: false,
        error: "未找到 Chrome/Edge 浏览器用于生成 PDF。可先导出 HTML，再用浏览器「打印 → 另存为 PDF」。",
        htmlUrl: `/ats-api/download?sessionId=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(htmlName)}`,
      })
      return
    }
    const pdfName = `${stem}.pdf`
    const pdfPath = join(ctx.fs.processPath(exportTarget), pdfName)
    try {
      await chromePrintToPdf(chrome, htmlPath, pdfPath)
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: `PDF 生成失败：${error instanceof Error ? error.message : String(error)}。可先导出 HTML，再用浏览器「打印 → 另存为 PDF」。`,
        htmlUrl: `/ats-api/download?sessionId=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(htmlName)}`,
      })
      return
    }
    if (!existsSync(pdfPath)) {
      sendJson(res, 500, { ok: false, error: "PDF 文件未生成。可先导出 HTML，再用浏览器「打印 → 另存为 PDF」。" })
      return
    }
    sendJson(res, 200, { ok: true, url: `/ats-api/download?sessionId=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(pdfName)}`, name: pdfName, format: "pdf" })
    return
  }

  // ── ATS parseability check (simulate a text-extracting ATS) ──
  if (route === "/ats-api/ats-check" && req.method === "GET") {
    const taskId = cleanText(url.searchParams.get("taskId"), 64)
    if (!taskId) {
      sendJson(res, 400, { ok: false, error: "missing taskId" })
      return
    }
    const base = join(ATS_DIR, "tasks", taskId)
    const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
    if (request === undefined) {
      sendJson(res, 404, { ok: false, error: "task not found" })
      return
    }
    const state = await readJson(ctx, cwd, join(base, "state.json"), signal)
    let markdown = ""
    try {
      markdown = await ctx.fs.readText(await ctx.fs.resolve(join(cwd, base, "resume.md")), signal)
    } catch {
      markdown = ""
    }
    if (!markdown && Array.isArray(state?.sections)) {
      markdown = state.sections
        .filter((section) => section && section.status !== "missing" && typeof section.content === "string" && section.content.length > 0)
        .map((section) => `## ${section.title || ""}\n\n${section.content}`)
        .join("\n\n")
    }
    if (!markdown.trim()) {
      sendJson(res, 404, { ok: false, error: "简历内容为空" })
      return
    }
    const annotationHits = detectStrategyAnnotations(markdown)
    markdown = sanitizeResumeMarkdown(markdown)
    const bytes = buildDocx(markdown, { title: "ats-check" }, THEMES.minimal)
    const extracted = docxExtractText(bytes)
    const lines = extracted.split("\n").map((line) => line.trim()).filter(Boolean)
    const chars = lines.join("").length
    const controlChars = (extracted.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length
    const sections = mdParse(markdown).filter((block) => block.type === "h1" || block.type === "h2").map((block) => block.text)
    const analyses = await readList(ctx, cwd, join(ATS_DIR, "analyses.json"), signal)
    const analysis = analyses.find((a) => String(a.jobId) === String(request.jobId))
    const jdKeywords = [...(analysis?.keywordHits || []), ...(analysis?.keywordMissing || [])]
    const found = jdKeywords.filter((keyword) => extracted.includes(keyword))
    const missing = jdKeywords.filter((keyword) => !extracted.includes(keyword))
    const warnings = []
    if (controlChars > 0) warnings.push(`发现 ${controlChars} 个不可见/控制字符，部分 ATS 可能解析异常`)
    if (chars < 200) warnings.push("正文过短（不足 200 字符），ATS 可能提取不到足够信息")
    if (chars > 4500) warnings.push("正文超过 4500 字符（约 2 页以上），HR 阅读率会下降")
    if (missing.length > 0) warnings.push(`JD 关键词缺失 ${missing.length} 个：${missing.slice(0, 10).join("、")}`)
    if (sections.length === 0) warnings.push("未识别出任何简历区块标题，ATS 分段可能失败")
    if (annotationHits.length > 0) warnings.push(`检测到 ${annotationHits.length} 处 ATS 优化标注（如「${annotationHits[0]}」）：导出时会自动剔除（已在净化），建议让助手把标注从区块标题里清掉`)
    sendJson(res, 200, {
      ok: true,
      stats: { chars, lines: lines.length, sections, controlChars },
      keywords: { checked: jdKeywords.length, found, missing },
      warnings,
      hint: "校验基于导出 Word 文件的纯文本提取（模拟 ATS 解析行为），不代表任何具体 ATS 的结果。",
    })
    return
  }

  // ── download ──
  if (route === "/ats-api/download" && req.method === "GET") {
    const name = url.searchParams.get("name")
    if (typeof name !== "string" || name.length === 0 || name.length > 200 || name.includes("/") || name.includes("..")) {
      sendJson(res, 400, { ok: false, error: "invalid name" })
      return
    }
    let bytes
    try {
      const target = await ctx.fs.resolve(join(cwd, ATS_DIR, "exports", name))
      bytes = await ctx.fs.readBytes(target, signal, 64 * 1024 * 1024)
    } catch {
      sendJson(res, 404, { ok: false, error: "file not found" })
      return
    }
    const ext = name.toLowerCase().endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : name.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "text/html; charset=utf-8"
    res.writeHead(200, {
      "content-type": ext,
      "content-length": bytes.length,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-cache",
    })
    res.end(Buffer.from(bytes))
    return
  }

  // ── file preview ──
  if (route === "/ats-api/file" && req.method === "GET") {
    const kind = url.searchParams.get("kind")
    const name = url.searchParams.get("name")
    if (typeof name !== "string" || name.length === 0 || name.length > 300) {
      sendJson(res, 400, { ok: false, error: "invalid name" })
      return
    }
    if (kind === "workspace") {
      if (name.includes("..") || name.startsWith("/")) {
        sendJson(res, 400, { ok: false, error: "invalid path" })
        return
      }
      let text
      try {
        const target = await ctx.fs.resolve(join(cwd, name))
        text = await ctx.fs.readText(target, signal)
      } catch {
        sendJson(res, 404, { ok: false, error: "file not found" })
        return
      }
      sendJson(res, 200, { ok: true, name, text: text.slice(0, 400000) })
      return
    }
    if (kind === "resumeDir") {
      const safeName = basename(name)
      if (safeName !== name || !/\.(md|markdown|txt)$/i.test(name)) {
        sendJson(res, 415, { ok: false, error: "仅支持直接预览 .md/.txt；.pdf/.docx 请点「解析」交给助手处理" })
        return
      }
      const settings = await getSettings(ctx, cwd, signal)
      const dir = settings.resumeDir || cwd
      let text
      try {
        const target = await ctx.fs.resolve(join(dir, safeName))
        text = await ctx.fs.readText(target, signal)
      } catch {
        sendJson(res, 404, { ok: false, error: "file not found" })
        return
      }
      sendJson(res, 200, { ok: true, name: safeName, text: text.slice(0, 400000) })
      return
    }
    sendJson(res, 400, { ok: false, error: "kind 必须是 workspace 或 resumeDir" })
    return
  }

  // ── applications CRUD ──
  if (route === "/ats-api/applications" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    if (body?.action === "remove") {
      const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String))
      const items = (await readList(ctx, cwd, join(ATS_DIR, "applications.json"), signal)).filter((app) => !ids.has(String(app.id)))
      await writeList(ctx, cwd, join(ATS_DIR, "applications.json"), items, session, signal)
      sendJson(res, 200, { ok: true, items })
      return
    }
    const clean = cleanApplication(body?.item)
    if (clean === undefined) {
      sendJson(res, 400, { ok: false, error: "item 需要至少包含 position 或 company" })
      return
    }
    const items = await readList(ctx, cwd, join(ATS_DIR, "applications.json"), signal)
    const idx = items.findIndex((app) => String(app.id) === String(clean.id))
    if (idx >= 0) items[idx] = clean
    else items.push(clean)
    await writeList(ctx, cwd, join(ATS_DIR, "applications.json"), items, session, signal)
    sendJson(res, 200, { ok: true, item: clean })
    return
  }

  // ── interviews ──
  if (route === "/ats-api/interviews" && req.method === "POST") {
    let body
    try {
      body = await parseJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, error: "body is not valid JSON" })
      return
    }
    if (body?.action === "remove") {
      const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String))
      const items = (await readList(ctx, cwd, join(ATS_DIR, "interviews.json"), signal)).filter((iv) => !ids.has(String(iv.id)))
      await writeList(ctx, cwd, join(ATS_DIR, "interviews.json"), items, session, signal)
      sendJson(res, 200, { ok: true, items })
      return
    }
    if (body?.action === "start") {
      const round = ROUNDS.includes(body?.round) ? body.round : "hr"
      const item = cleanInterview({
        round,
        jobId: cleanText(body?.jobId, 64),
        company: cleanText(body?.company, 200),
        role: cleanText(body?.role, 200),
        status: "pending",
        startedAt: new Date().toISOString(),
      })
      const request = {
        round,
        jobId: item.jobId,
        company: item.company,
        role: item.role,
        note: cleanText(body?.note, 1000),
        createdAt: new Date().toISOString(),
      }
      await writeJson(ctx, cwd, join(ATS_DIR, "interview.request.json"), request, session, signal)
      const items = await readList(ctx, cwd, join(ATS_DIR, "interviews.json"), signal)
      items.push(item)
      await writeList(ctx, cwd, join(ATS_DIR, "interviews.json"), items, session, signal)
      sendJson(res, 200, { ok: true, item, request })
      return
    }
    const clean = cleanInterview(body?.item)
    if (clean === undefined) {
      sendJson(res, 400, { ok: false, error: "item 必须是面试记录对象" })
      return
    }
    const items = await readList(ctx, cwd, join(ATS_DIR, "interviews.json"), signal)
    const idx = items.findIndex((iv) => String(iv.id) === String(clean.id))
    if (idx >= 0) items[idx] = clean
    else items.push(clean)
    await writeList(ctx, cwd, join(ATS_DIR, "interviews.json"), items, session, signal)
    sendJson(res, 200, { ok: true, item: clean })
    return
  }

  sendJson(res, 404, { ok: false, error: "unknown endpoint" })
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0 && existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Extract plain text from an in-memory .docx (the way a text-extracting ATS
 * would see it): unzip word/document.xml, drop tags, decode entities.
 */
function docxExtractText(bytes) {
  let xml
  try {
    xml = strFromU8(unzipSync(bytes)["word/document.xml"])
  } catch {
    return ""
  }
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
}

/**
 * 导出净化：把助手误写进简历的“ATS 优化标注”剔除。
 *  1) 删除整块说明性区块（## 优化说明 / 修改说明 / 处理说明 / 修改备注…）；
 *  2) 清洗标题行里的括号策略注释（如「工作经历（服务导向表述）」→「工作经历」）；
 * 只对标题/区块作用，正文里的合法括号（日期、技术栈）不受影响。
 */
const STRATEGY_NOTE_PAT = /[（(]([^（()）]*?(?:定位|表述|场景|压缩|前置|优化|说明|版本|策略|适配|导向|方向)[^（()）]*?)[）)]/g
// 无 /g 的检测正则：test() 不带 lastIndex 副作用
const STRATEGY_NOTE_SINGLE = /[（(]([^（()）]*?(?:定位|表述|场景|压缩|前置|优化|说明|版本|策略|适配|导向|方向)[^（()）]*?)[）)]/
const NOTE_BLOCK_TITLE_PAT = /^#{2,}\s*.*?(?:优化说明|修改说明|处理说明|操作说明|修改备注|使用说明)/

export function detectStrategyAnnotations(markdown) {
  const hits = []
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n")
  for (const line of lines) {
    if (/^#{2,}\s*/.test(line)) {
      if (NOTE_BLOCK_TITLE_PAT.test(line)) hits.push(line.trim().slice(0, 60))
      else if (STRATEGY_NOTE_SINGLE.test(line)) hits.push(line.trim().slice(0, 60))
    }
  }
  return hits
}

export function sanitizeResumeMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n")
  const out = []
  let skip = false
  for (const line of lines) {
    if (/^#{2,}\s*/.test(line)) {
      if (NOTE_BLOCK_TITLE_PAT.test(line)) {
        skip = true
        continue
      }
      skip = false
      out.push(line.replace(STRATEGY_NOTE_PAT, "").trimEnd())
      continue
    }
    if (skip) continue
    out.push(line)
  }
  return out.join("\n")
}

/**
 * Print HTML to PDF with headless Chrome. Chrome on some macOS setups never
 * exits after writing the PDF, so we poll for a stable output file and then
 * force-kill the process instead of waiting for exit.
 */
function chromePrintToPdf(chrome, htmlPath, pdfPath) {
  return new Promise((resolve, reject) => {
    const userDataDir = join(tmpdir(), makeId("ats-chrome-"))
    let child
    try {
      child = spawn(chrome, [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-pdf-header-footer",
        `--user-data-dir=${userDataDir}`,
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ], { stdio: "ignore" })
    } catch (error) {
      reject(error)
      return
    }
    let settled = false
    let lastSize = -1
    let stablePolls = 0
    const cleanup = () => {
      try {
        rmSync(userDataDir, { recursive: true, force: true })
      } catch {}
    }
    const finish = (error) => {
      if (settled) return
      settled = true
      clearInterval(poller)
      clearTimeout(deadline)
      try {
        child.kill("SIGKILL")
      } catch {}
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const poller = setInterval(() => {
      let size = -1
      try {
        size = statSync(pdfPath).size
      } catch {
        return
      }
      if (size > 0 && size === lastSize) {
        stablePolls++
        if (stablePolls >= 2) finish()
      } else {
        lastSize = size
        stablePolls = 0
      }
    }, 500)
    const deadline = setTimeout(() => finish(new Error("PDF 生成超时（90s）")), 90000)
    child.on("error", (error) => finish(error))
    child.on("exit", () => {
      try {
        if (existsSync(pdfPath) && statSync(pdfPath).size > 0) finish()
        else finish(new Error("Chrome 提前退出且未生成 PDF"))
      } catch (error) {
        finish(error)
      }
    })
  })
}

// ── tools mode ──────────────────────────────────────────────────────────────

function workspaceOf(exec) {
  const session = exec.agent?.session
  const cwd = session?.header?.cwd
  if (typeof cwd !== "string" || cwd.length === 0) {
    throw new Error("无法确定当前会话的工作目录（session 没有 workspace）")
  }
  return { cwd, session }
}

function applyToolsMode(ctx) {
  ctx.effect(
    () => {
      const disposers = [
        ctx.tools.register(atsStatusTool(ctx)),
        ctx.tools.register(atsJobsUpsertTool(ctx)),
        ctx.tools.register(atsJobsRemoveTool(ctx)),
        ctx.tools.register(atsAnalysisRequestTool(ctx)),
        ctx.tools.register(atsAnalysisSaveTool(ctx)),
        ctx.tools.register(atsResumeRequestTool(ctx)),
        ctx.tools.register(atsResumeRegisterTool(ctx)),
        ctx.tools.register(atsResumeReadTool(ctx)),
        ctx.tools.register(atsTaskRequestTool(ctx)),
        ctx.tools.register(atsTaskReadTool(ctx)),
        ctx.tools.register(atsTaskUpdateTool(ctx)),
        ctx.tools.register(atsApplyUpsertTool(ctx)),
        ctx.tools.register(atsApplyRemoveTool(ctx)),
        ctx.tools.register(atsInterviewRequestTool(ctx)),
        ctx.tools.register(atsInterviewUpdateTool(ctx)),
        ctx.tools.register(atsSearchRunTool(ctx)),
        ctx.tools.register(atsSearchReadTool(ctx)),
        ctx.tools.register(atsApplySendTool(ctx)),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
    "dsh-job-ats: model tools",
  )
}

const TEXT_OUTPUT = {
  schema: { type: "string" },
  render: (_args, value) => [{ type: "text", text: value }],
}

function payloadObject(args, label) {
  if (typeof args.payload !== "string") {
    throw new Error(`${label} 需要 payload（JSON 字符串）`)
  }
  let parsed
  try {
    parsed = JSON.parse(args.payload)
  } catch {
    throw new Error(`${label} 的 payload 不是合法 JSON 字符串`)
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} 的 payload 必须是 JSON 对象`)
  }
  return parsed
}

function atsStatusTool(ctx) {
  return defineTool({
    name: "ats_status",
    description:
      "读取求职工作台（.ats 目录）的整体状态：设置、岗位、分析结果、简历库、投递记录、面试记录、ATS 优化任务，以及来自浏览器标签页的待处理请求（岗位分析 / 简历解析 / 模拟面试 / 新优化任务 / 待处理修改与补缺选择）。回复用户求职进展、开始处理标签页请求前使用。",
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const { cwd } = workspaceOf(exec)
      const signal = exec.signal
      const settings = await getSettings(ctx, cwd, signal)
      const jobs = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
      const analyses = await readList(ctx, cwd, join(ATS_DIR, "analyses.json"), signal)
      const resumes = await readList(ctx, cwd, join(ATS_DIR, "resumes.json"), signal)
      const applications = await readList(ctx, cwd, join(ATS_DIR, "applications.json"), signal)
      const interviews = await readList(ctx, cwd, join(ATS_DIR, "interviews.json"), signal)
      const analysisRequest = await readJson(ctx, cwd, join(ATS_DIR, "analysis.request.json"), signal)
      const resumeRequest = await readJson(ctx, cwd, join(ATS_DIR, "resume.request.json"), signal)
      const interviewRequest = await readJson(ctx, cwd, join(ATS_DIR, "interview.request.json"), signal)
      const tasks = await listTasks(ctx, cwd, signal)
      return JSON.stringify({
        设置: settings,
        岗位: jobs.map((job) => ({ id: job.id, title: job.title, company: job.company, status: job.status, link: job.link })),
        分析: analyses.map((a) => ({ jobId: a.jobId, score: a.score })),
        简历库: resumes.map((rs) => ({ id: rs.id, name: rs.name, parsed: rs.parsed, path: rs.path })),
        投递: applications.map((app) => ({ id: app.id, position: app.position, company: app.company, currentStep: app.currentStep, ddl: app.ddl })),
        面试: interviews.map((iv) => ({ id: iv.id, round: iv.round, company: iv.company, status: iv.status })),
        待处理请求: {
          岗位分析: analysisRequest ?? null,
          简历解析: resumeRequest ?? null,
          模拟面试: interviewRequest ?? null,
        },
        ATS任务: tasks,
      }, null, 2)
    },
  })
}

function atsJobsUpsertTool(ctx) {
  return defineTool({
    name: "ats_jobs_upsert",
    description:
      "把搜索到/用户提供的岗位写入工作台（.ats/jobs.json），「筛选工作」标签页会立即显示。payload 为 JSON 字符串：{items:[{id?, title, company, link?, type?, location?, salary?, source?, snippet?, status?, note?}]}，按 id 匹配（无 id 则新增）。status 可选：new（新发现）/ wishlist / applied / skipped。写完后用一句话告诉用户已更新，引导其去标签页查看。",
    parameters: {
      payload: { type: "string", required: true, description: "JSON 字符串：{items:[岗位对象]}" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const payload = payloadObject(args, "ats_jobs_upsert")
      const raw = Array.isArray(payload.items) ? payload.items : []
      const items = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
      let changed = 0
      for (const rawItem of raw) {
        const clean = cleanJob(rawItem)
        if (clean === undefined) continue
        const idx = items.findIndex((job) => String(job.id) === String(clean.id))
        if (idx >= 0) items[idx] = clean
        else items.push(clean)
        changed++
      }
      await writeList(ctx, cwd, join(ATS_DIR, "jobs.json"), items, session, signal)
      return `已写入 ${changed} 条岗位（当前共 ${items.length} 条）。用户可在「筛选工作」标签页查看。`
    },
  })
}

function atsJobsRemoveTool(ctx) {
  return defineTool({
    name: "ats_jobs_remove",
    description: "从工作台删除岗位（.ats/jobs.json），按 id 删除。",
    parameters: {
      ids: { type: "array", required: true, description: "要删除的岗位 id 列表", items: { type: "string" } },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const ids = new Set((Array.isArray(args.ids) ? args.ids : []).map(String))
      const items = (await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)).filter((job) => !ids.has(String(job.id)))
      await writeList(ctx, cwd, join(ATS_DIR, "jobs.json"), items, session, signal)
      return `已删除 ${ids.size} 条岗位（剩余 ${items.length} 条）。`
    },
  })
}

function atsAnalysisRequestTool(ctx) {
  return defineTool({
    name: "ats_analysis_request",
    description:
      "读取「工作分析」标签页提交的岗位分析请求（.ats/analysis.request.json：{jobId, note}）。若与上次已处理内容相同则返回'无新请求'。返回新请求时应：读取该岗位（jobs.json）→ 用 ats_resume_read 读取简历 → 分析匹配度与不匹配度 → 用 ats_analysis_save 保存结果。",
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const request = await readJson(ctx, cwd, join(ATS_DIR, "analysis.request.json"), signal)
      if (request === undefined) return "无待处理的岗位分析请求。"
      const handled = await readJson(ctx, cwd, join(ATS_DIR, "analysis.request.handled.json"), signal)
      if (handled !== undefined && JSON.stringify(handled) === JSON.stringify(request)) {
        return "无新请求（analysis.request.json 与上次已处理内容相同）。"
      }
      const jobs = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
      const job = jobs.find((entry) => String(entry.id) === String(request.jobId))
      const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
      const target = await ctx.fs.resolve(join(cwd, ATS_DIR, "analysis.request.handled.json"))
      ensureDir(ctx.fs.processPath(target))
      await ctx.fs.writeText(target, `${JSON.stringify(request, null, 2)}\n`, undefined, signal, policy)
      return JSON.stringify({ 分析请求: request, 岗位: job ?? null }, null, 2)
    },
  })
}

function atsAnalysisSaveTool(ctx) {
  return defineTool({
    name: "ats_analysis_save",
    description:
      "保存岗位匹配分析结果（.ats/analyses.json），「工作分析」标签页会显示。payload 为 JSON 字符串：{jobId, score(0-100整数), summary, match:[{point, evidence?}], gaps:[{point, evidence?}], keywordHits:[字符串], keywordMissing:[字符串], suggestions:[字符串]}。match=与岗位匹配的点，gaps=不匹配/缺失的点（具体、可执行）。",
    parameters: {
      payload: { type: "string", required: true, description: "JSON 字符串：分析结果对象" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const payload = payloadObject(args, "ats_analysis_save")
      const jobId = cleanText(payload.jobId, 64)
      if (!jobId) throw new Error("payload.jobId 缺失")
      const score = Math.max(0, Math.min(100, Math.round(Number(payload.score) || 0)))
      const cleanPoints = (value) => (Array.isArray(value) ? value
        .map((point) => (typeof point === "string"
          ? { point: point.slice(0, 1000), evidence: "" }
          : point && typeof point === "object"
            ? { point: cleanText(point.point, 1000), evidence: cleanText(point.evidence, 2000) }
            : null))
        .filter((point) => point !== null && point.point.length > 0) : [])
      const cleanStrings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === "string").map((v) => v.slice(0, 500)).slice(0, 40) : [])
      const analysis = {
        jobId,
        score,
        summary: cleanText(payload.summary, 4000),
        match: cleanPoints(payload.match),
        gaps: cleanPoints(payload.gaps),
        keywordHits: cleanStrings(payload.keywordHits),
        keywordMissing: cleanStrings(payload.keywordMissing),
        suggestions: cleanStrings(payload.suggestions),
        analyzedAt: new Date().toISOString(),
      }
      const analyses = await readList(ctx, cwd, join(ATS_DIR, "analyses.json"), signal)
      const idx = analyses.findIndex((a) => String(a.jobId) === jobId)
      if (idx >= 0) analyses[idx] = analysis
      else analyses.push(analysis)
      await writeList(ctx, cwd, join(ATS_DIR, "analyses.json"), analyses, session, signal)
      const jobs = await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)
      const jobIdx = jobs.findIndex((job) => String(job.id) === jobId)
      if (jobIdx >= 0) {
        jobs[jobIdx] = { ...jobs[jobIdx], status: "analyzed" }
        await writeList(ctx, cwd, join(ATS_DIR, "jobs.json"), jobs, session, signal)
      }
      return `已保存岗位 ${jobId} 的分析（匹配度 ${score}/100）。用户可在「工作分析」标签页查看。`
    },
  })
}

function atsResumeRequestTool(ctx) {
  return defineTool({
    name: "ats_resume_request",
    description:
      "读取「简历库」标签页提交的简历解析请求（.ats/resume.request.json：{path, name}）。若与上次已处理内容相同则返回'无新请求'。返回新请求时应：读取该文件（.pdf/.docx 可用 python 提取文本，.md/.txt 直接读）→ 用 ats_resume_register 登记解析后的简历。",
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const request = await readJson(ctx, cwd, join(ATS_DIR, "resume.request.json"), signal)
      if (request === undefined) return "无待处理的简历解析请求。"
      const handled = await readJson(ctx, cwd, join(ATS_DIR, "resume.request.handled.json"), signal)
      if (handled !== undefined && JSON.stringify(handled) === JSON.stringify(request)) {
        return "无新请求（resume.request.json 与上次已处理内容相同）。"
      }
      const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
      const target = await ctx.fs.resolve(join(cwd, ATS_DIR, "resume.request.handled.json"))
      ensureDir(ctx.fs.processPath(target))
      await ctx.fs.writeText(target, `${JSON.stringify(request, null, 2)}\n`, undefined, signal, policy)
      return JSON.stringify({ 解析请求: request }, null, 2)
    },
  })
}

function atsResumeRegisterTool(ctx) {
  return defineTool({
    name: "ats_resume_register",
    description:
      "把解析完成的简历登记进简历库（写入 .ats/resumes/<id>.md 并更新 .ats/resumes.json），「简历库」标签页会显示，之后可用它创建 ATS 优化任务。payload 为 JSON 字符串：{path, name?, id?, lang?, summary?, markdown}。markdown 为解析出的简历全文（尽量保留原有结构：# 姓名、## 各区块标题、- 条目）。",
    parameters: {
      payload: { type: "string", required: true, description: "JSON 字符串：{path, name?, id?, lang?, summary?, markdown}" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const payload = payloadObject(args, "ats_resume_register")
      const markdown = cleanText(payload.markdown, 400000)
      if (!markdown) throw new Error("payload.markdown 缺失（简历全文）")
      const items = await readList(ctx, cwd, join(ATS_DIR, "resumes.json"), signal)
      const path = cleanText(payload.path, 1000)
      let entry
      if (path) {
        entry = items.find((rs) => rs.path === path)
      }
      if (entry === undefined && payload.id) {
        entry = items.find((rs) => String(rs.id) === String(payload.id))
      }
      if (entry === undefined) {
        entry = cleanResumeEntry({ path, name: payload.name, lang: payload.lang, summary: payload.summary })
        items.push(entry)
      } else {
        entry.path = path || entry.path
        if (payload.name) entry.name = cleanText(payload.name, 200)
        if (payload.lang) entry.lang = cleanText(payload.lang, 20)
        if (payload.summary) entry.summary = cleanText(payload.summary, 2000)
      }
      entry.parsed = true
      entry.parsedAt = new Date().toISOString()
      const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
      const mdTarget = await ctx.fs.resolve(join(cwd, ATS_DIR, "resumes", `${entry.id}.md`))
      ensureDir(ctx.fs.processPath(mdTarget))
      await ctx.fs.writeText(mdTarget, `${markdown}\n`, undefined, signal, policy)
      await writeList(ctx, cwd, join(ATS_DIR, "resumes.json"), items, session, signal)
      return `已登记简历「${entry.name}」（id: ${entry.id}）。用户可在「简历库」标签页查看，并可创建 ATS 优化任务。`
    },
  })
}

function atsResumeReadTool(ctx) {
  return defineTool({
    name: "ats_resume_read",
    description: "读取简历库中某份简历的解析全文（.ats/resumes/<id>.md）。做岗位分析、ATS 优化前使用。",
    parameters: {
      id: { type: "string", required: true, description: "简历 id（见 ats_status 的简历库列表）" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd } = workspaceOf(exec)
      const signal = exec.signal
      const items = await readList(ctx, cwd, join(ATS_DIR, "resumes.json"), signal)
      const entry = items.find((rs) => String(rs.id) === String(args.id))
      if (entry === undefined) return `简历库中没有 id 为 ${args.id} 的简历。先用 ats_status 查看列表。`
      let markdown
      try {
        markdown = await ctx.fs.readText(await ctx.fs.resolve(join(cwd, ATS_DIR, "resumes", `${entry.id}.md`)), signal)
      } catch {
        return `简历「${entry.name}」尚未解析（没有解析文本）。`
      }
      return `简历 id: ${entry.id}；名称: ${entry.name}\n\n${markdown}`
    },
  })
}

async function readTaskEdits(ctx, cwd, taskId, signal) {
  const edits = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "edits.json"), signal)
  return Array.isArray(edits?.items) ? edits.items : []
}

async function readTaskChoices(ctx, cwd, taskId, signal) {
  const choices = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "choices.json"), signal)
  const map = choices && typeof choices.choices === "object" && choices.choices !== null ? choices.choices : {}
  const pending = {}
  for (const key of Object.keys(map)) {
    if (map[key] === "add" || map[key] === "skip") pending[key] = map[key]
  }
  return { file: choices, pending }
}

function atsTaskRequestTool(ctx) {
  return defineTool({
    name: "ats_task_request",
    description:
      "读取 ATS 优化任务队列（.ats/tasks/*）中需要你处理的内容：新建任务（status=requested）、用户提交的定点修改（edits.json 中 status=pending 的条目）、缺失章节的补写选择（choices.json）、求职信生成请求（letter.request.json，kind=letter）。返回后按顺序处理：1) 新任务→读简历+岗位，起草优化简历；2) 定点修改→按 op 语义处理选中文本并写回；3) 补写选择→起草或跳过缺失章节；4) 求职信→针对目标岗位起草求职信（先简历后信：信的开头呼应 JD 关键词，正文举 1-2 个与岗位最相关的经历，结尾表达意愿+可到岗时间占位）。全部用 ats_task_update 写回状态（求职信用 payload.letter）。",
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const tasks = []
      const dir = await ctx.fs.resolve(join(cwd, ATS_DIR, "tasks"))
      let entries = []
      try {
        entries = await ctx.fs.listDir(dir, signal)
      } catch {
        return "暂无 ATS 优化任务（.ats/tasks 不存在）。"
      }
      for (const entry of entries) {
        if (entry.type !== "directory") continue
        const taskId = entry.name
        const state = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "state.json"), signal)
        const request = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "request.json"), signal)
        if (state?.status === "requested") {
          tasks.push({ taskId, kind: "new", request, state })
        }
        const edits = await readTaskEdits(ctx, cwd, taskId, signal)
        const pending = edits.filter((edit) => edit.status === "pending")
        if (pending.length > 0) {
          tasks.push({ taskId, kind: "edits", request, pending })
        }
        const { pending: pendingChoices } = await readTaskChoices(ctx, cwd, taskId, signal)
        if (Object.keys(pendingChoices).length > 0) {
          tasks.push({ taskId, kind: "choices", request, pendingChoices })
        }
        const letterRequest = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "letter.request.json"), signal)
        const letterHandled = await readJson(ctx, cwd, join(ATS_DIR, "tasks", taskId, "letter.request.handled.json"), signal)
        if (letterRequest !== undefined && (letterHandled === undefined || JSON.stringify(letterHandled) !== JSON.stringify(letterRequest))) {
          tasks.push({ taskId, kind: "letter", request, letterRequest })
        }
      }
      if (tasks.length === 0) return "暂无需要处理的 ATS 任务内容。"
      return JSON.stringify({ 待处理: tasks }, null, 2)
    },
  })
}

function atsTaskReadTool(ctx) {
  return defineTool({
    name: "ats_task_read",
    description: "读取某个 ATS 优化任务的完整状态（request/state/edits/choices/resume.md 全文）。继续中断任务、向用户汇报任务进度前使用。",
    parameters: {
      taskId: { type: "string", required: true, description: "任务 id" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd } = workspaceOf(exec)
      const signal = exec.signal
      const base = join(ATS_DIR, "tasks", String(args.taskId))
      const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
      if (request === undefined) return `任务 ${args.taskId} 不存在。`
      const state = await readJson(ctx, cwd, join(base, "state.json"), signal)
      const edits = await readTaskEdits(ctx, cwd, String(args.taskId), signal)
      const { file: choices } = await readTaskChoices(ctx, cwd, String(args.taskId), signal)
      let markdown = ""
      try {
        markdown = await ctx.fs.readText(await ctx.fs.resolve(join(cwd, base, "resume.md")), signal)
      } catch {
        markdown = ""
      }
      let letter = ""
      try {
        letter = await ctx.fs.readText(await ctx.fs.resolve(join(cwd, base, "letter.md")), signal)
      } catch {
        letter = ""
      }
      return JSON.stringify({ request, state, edits, choices, resumeMd: markdown, letterMd: letter }, null, 2)
    },
  })
}

function atsTaskUpdateTool(ctx) {
  return defineTool({
    name: "ats_task_update",
    description:
      "更新 ATS 优化任务的状态与内容（.ats/tasks/<taskId>/）。payload 为 JSON 字符串：{status?, phase?, message?, sections?, missing?, log?, editResults?, markdown?, letter?}。status：requested→working→review→done（用户复核中可用 review）；phase：任意短标签（如 drafted/editing/export-ready）；sections：[{id, title, status: done|pending|missing, content}]（content 为 markdown 轻格式：允许 - 列表与 **加粗**）；missing：[章节id]；log：[进度文本]；editResults：[{editId, status: done, result?}]（把对应修改标记为完成，result 为改后文本或说明）；markdown：整份简历的完整 markdown（各区块拼接后的最终版，导出 Word/PDF 用）；letter：求职信 markdown（# 求职信标题 + 段落，针对目标岗位定制，写好后标签页可含信导出）。只传需要更新的字段。",
    parameters: {
      taskId: { type: "string", required: true, description: "任务 id" },
      payload: { type: "string", required: true, description: "JSON 字符串：状态更新对象" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const taskId = cleanText(args.taskId, 64)
      const payload = payloadObject(args, "ats_task_update")
      const base = join(ATS_DIR, "tasks", taskId)
      const request = await readJson(ctx, cwd, join(base, "request.json"), signal)
      if (request === undefined) return `任务 ${taskId} 不存在。`
      const state = (await readJson(ctx, cwd, join(base, "state.json"), signal)) ?? {
        status: "requested", phase: "", log: [], sections: [], missing: [], message: "",
      }
      if (typeof state.status === "string" && payload.status) state.status = cleanText(payload.status, 40)
      if (typeof payload.phase === "string") state.phase = cleanText(payload.phase, 60)
      if (typeof payload.message === "string") state.message = cleanText(payload.message, 4000)
      if (Array.isArray(state.log) === false) state.log = []
      if (Array.isArray(payload.log)) {
        for (const text of payload.log.slice(0, 40)) {
          if (typeof text === "string" && text.trim()) {
            state.log.push({ ts: new Date().toISOString(), text: text.slice(0, 1000) })
          }
        }
      }
      if (state.log.length > 60) state.log = state.log.slice(-60)
      if (Array.isArray(payload.sections)) {
        state.sections = payload.sections
          .filter((section) => section && typeof section === "object" && cleanText(section.title, 200).length > 0)
          .map((section) => ({
            id: cleanText(section.id, 64) || makeId("sec-"),
            title: cleanText(section.title, 200),
            status: ["done", "pending", "missing"].includes(section.status) ? section.status : "pending",
            content: cleanText(section.content, 60000),
          }))
      }
      if (Array.isArray(payload.missing)) {
        state.missing = payload.missing.map((id) => cleanText(id, 64)).filter(Boolean).slice(0, 30)
      }
      state.updatedAt = new Date().toISOString()
      await writeJson(ctx, cwd, join(base, "state.json"), state, session, signal)

      if (Array.isArray(payload.editResults) && payload.editResults.length > 0) {
        const edits = { items: await readTaskEdits(ctx, cwd, taskId, signal) }
        for (const result of payload.editResults.slice(0, 100)) {
          if (result === null || typeof result !== "object") continue
          const item = edits.items.find((edit) => String(edit.id) === String(result.editId))
          if (item !== undefined) {
            item.status = "done"
            item.result = cleanText(result.result, 10000)
            item.doneAt = new Date().toISOString()
          }
        }
        await writeJson(ctx, cwd, join(base, "edits.json"), edits, session, signal)
      }

      if (typeof payload.markdown === "string") {
        const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
        const mdTarget = await ctx.fs.resolve(join(cwd, base, "resume.md"))
        ensureDir(ctx.fs.processPath(mdTarget))
        await ctx.fs.writeText(mdTarget, `${payload.markdown}\n`, undefined, signal, policy)
      }
      if (typeof payload.letter === "string") {
        const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
        const letterTarget = await ctx.fs.resolve(join(cwd, base, "letter.md"))
        ensureDir(ctx.fs.processPath(letterTarget))
        await ctx.fs.writeText(letterTarget, `${payload.letter}\n`, undefined, signal, policy)
        const letterRequest = await readJson(ctx, cwd, join(base, "letter.request.json"), signal)
        if (letterRequest !== undefined) {
          await writeJson(ctx, cwd, join(base, "letter.request.handled.json"), letterRequest, session, signal)
        }
      }
      const pendingEdits = (await readTaskEdits(ctx, cwd, taskId, signal)).filter((edit) => edit.status === "pending").length
      return `已更新任务 ${taskId}（status=${state.status}, phase=${state.phase || "-"}，剩余待处理修改 ${pendingEdits} 条）。`
    },
  })
}

function atsApplyUpsertTool(ctx) {
  return defineTool({
    name: "ats_apply_upsert",
    description:
      "新增或更新投递记录（.ats/applications.json），「投递追踪」标签页会显示。payload 为 JSON 字符串：{items:[{id?, position, company, link?, type?, currentStep?, ddl?, appliedAt?, nextAction?, notes?, jobId?}]}，按 id 匹配。currentStep 取值：wishlist/applied/oa/phone/onsite1/onsite2/final/offer/rejected/withdrawn（待投递/已投递/笔试测评/电话面/一面/二面/终面/Offer/已拒绝/已放弃）。用户告知面试进展时主动更新。",
    parameters: {
      payload: { type: "string", required: true, description: "JSON 字符串：{items:[投递记录]}" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const payload = payloadObject(args, "ats_apply_upsert")
      const raw = Array.isArray(payload.items) ? payload.items : []
      const items = await readList(ctx, cwd, join(ATS_DIR, "applications.json"), signal)
      let changed = 0
      for (const rawItem of raw) {
        const clean = cleanApplication(rawItem)
        if (clean === undefined) continue
        const idx = items.findIndex((app) => String(app.id) === String(clean.id))
        if (idx >= 0) items[idx] = clean
        else items.push(clean)
        changed++
      }
      await writeList(ctx, cwd, join(ATS_DIR, "applications.json"), items, session, signal)
      return `已更新 ${changed} 条投递记录（当前共 ${items.length} 条）。`
    },
  })
}

function atsApplyRemoveTool(ctx) {
  return defineTool({
    name: "ats_apply_remove",
    description: "删除投递记录（.ats/applications.json），按 id 删除。",
    parameters: {
      ids: { type: "array", required: true, description: "要删除的投递记录 id 列表", items: { type: "string" } },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const ids = new Set((Array.isArray(args.ids) ? args.ids : []).map(String))
      const items = (await readList(ctx, cwd, join(ATS_DIR, "applications.json"), signal)).filter((app) => !ids.has(String(app.id)))
      await writeList(ctx, cwd, join(ATS_DIR, "applications.json"), items, session, signal)
      return `已删除 ${ids.size} 条投递记录（剩余 ${items.length} 条）。`
    },
  })
}

function atsInterviewRequestTool(ctx) {
  return defineTool({
    name: "ats_interview_request",
    description:
      "读取「模拟面试」标签页提交的面试请求（.ats/interview.request.json：{round, jobId?, company?, role?, note?}）。若与上次已处理内容相同则返回'无新请求'。round：hr（HR面）/tech（技术面）/manager（主管面）/group（群面）/final（终面）。返回新请求时应立即以面试官身份开始面试（群面：用 subagent 工具派 3-4 个不同性格的组员 + 你主持，先宣布规则再展开讨论）。面试结束后用 ats_interview_update 保存小结。",
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const request = await readJson(ctx, cwd, join(ATS_DIR, "interview.request.json"), signal)
      if (request === undefined) return "无待处理的模拟面试请求。"
      const handled = await readJson(ctx, cwd, join(ATS_DIR, "interview.request.handled.json"), signal)
      if (handled !== undefined && JSON.stringify(handled) === JSON.stringify(request)) {
        return "无新请求（interview.request.json 与上次已处理内容相同）。"
      }
      const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
      const target = await ctx.fs.resolve(join(cwd, ATS_DIR, "interview.request.handled.json"))
      ensureDir(ctx.fs.processPath(target))
      await ctx.fs.writeText(target, `${JSON.stringify(request, null, 2)}\n`, undefined, signal, policy)
      const interviews = await readList(ctx, cwd, join(ATS_DIR, "interviews.json"), signal)
      const pending = interviews.find((iv) => iv.status === "pending" && iv.round === request.round &&
        (request.company ? iv.company === request.company : true) &&
        (request.role ? iv.role === request.role : true))
      const jobId = request.jobId ?? pending?.jobId ?? ""
      const job = jobId ? (await readList(ctx, cwd, join(ATS_DIR, "jobs.json"), signal)).find((entry) => String(entry.id) === jobId) : undefined
      return JSON.stringify({ 面试请求: request, 岗位: job ?? null }, null, 2)
    },
  })
}

function atsInterviewUpdateTool(ctx) {
  return defineTool({
    name: "ats_interview_update",
    description:
      "更新模拟面试记录（.ats/interviews.json）。payload 为 JSON 字符串：{item:{id?, round?, jobId?, company?, role?, status?, summary?, startedAt?, finishedAt?}, transcript?}。面试开始前把状态改为 ongoing；结束后 status=done 并写 summary（表现亮点/待改进/建议），transcript 为完整对话摘要（可选，会保存到 .ats/interviews/<id>.md）。",
    parameters: {
      payload: { type: "string", required: true, description: "JSON 字符串：{item: 面试记录, transcript?}" },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const signal = exec.signal
      const payload = payloadObject(args, "ats_interview_update")
      const clean = cleanInterview(payload.item)
      if (clean === undefined) throw new Error("payload.item 必须是面试记录对象")
      const items = await readList(ctx, cwd, join(ATS_DIR, "interviews.json"), signal)
      const idx = items.findIndex((iv) => String(iv.id) === String(clean.id))
      if (idx >= 0) items[idx] = clean
      else items.push(clean)
      await writeList(ctx, cwd, join(ATS_DIR, "interviews.json"), items, session, signal)
      if (typeof payload.transcript === "string" && payload.transcript.trim().length > 0) {
        const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
        const target = await ctx.fs.resolve(join(cwd, ATS_DIR, "interviews", `${clean.id}.md`))
        ensureDir(ctx.fs.processPath(target))
        await ctx.fs.writeText(target, payload.transcript.slice(0, 200000), undefined, signal, policy)
      }
      return `已更新面试记录 ${clean.id}（${ROUND_LABELS[clean.round] || clean.round}，status=${clean.status}）。`
    },
  })
}

function atsSearchRunTool(ctx) {
  return defineTool({
    name: "ats_search_run",
    description:
      "执行一次职位聚合搜索(Boss直聘 / 实习僧 / OfferShow / 全网;经搜索引擎 site: 限定聚合公开岗位索引),结果写入「职位搜索」标签页并持久化到 .ats/search.json。payload 为 JSON 字符串:{keywords:\"Java 后端\", city?:\"上海\", sources?:[\"boss\",\"shixiseng\",\"offershow\",\"web\"], depth?:\"fast\"|\"standard\"|\"deep\"}。depth 控制每个来源的查询变体数(fast=1/standard=2/deep=4),deep 召回最多但最慢(约 1-2 分钟)。用户想找岗位、看机会、比选项时使用;搜完提醒用户去「职位搜索」标签页浏览,可对心仪岗位用 ats_apply_send 代投。",
    parameters: {
      payload: { type: "string", required: true, description: 'JSON 字符串:{keywords:"关键词", city:"城市(可省)", sources?:["boss","web"], depth?:"fast"|"standard"|"deep"}' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const payload = payloadObject(args, "ats_search_run")
      const out = await runSearchNow(ctx, cwd, session, {
        keywords: payload.keywords,
        city: payload.city,
        sources: payload.sources,
        depth: payload.depth,
        fallbackDepth: "standard",
        by: "manual",
      }, exec.signal)
      const failed = Object.entries(out.perSource).filter(([, v]) => v.ok === false).map(([k, v]) => `${k}:${(v.errors ?? [v.error])[0] ?? ""}`)
      return `搜索完成(${out.depth} 档,${out.queries} 个查询,耗时 ${Math.round(out.elapsedMs / 1000)}s):新增 ${out.added} 条(总计 ${out.total} 条),用户可在「职位搜索」标签页查看。` +
        (out.added === 0 ? "没有新结果,建议换关键词或扩展来源重试。" : "心仪的岗位可以用 ats_apply_send 生成个性化打招呼语并一键代投。") +
        (failed.length > 0 ? `\n部分来源失败:${failed.join(";")}` : "")
    },
  })
}

function atsSearchReadTool(ctx) {
  return defineTool({
    name: "ats_search_read",
    description:
      "读取「职位搜索」的配置与聚合结果(.ats/search.json):搜索关键词、定时刷新计划、最近 40 条结果(标题/公司/来源/薪资/链接/是否已投)。用户问「搜到了什么」「定时刷新开了吗」时使用。",
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const { cwd } = workspaceOf(exec)
      const data = await readSearchData(ctx, cwd, exec.signal)
      const cfg = data.config
      return JSON.stringify({
        搜索词: cfg.keywords,
        城市: cfg.city,
        来源: cfg.sources,
        定时刷新: cfg.scheduleEnabled ? `每 ${cfg.intervalMinutes} 分钟` : "未启用",
        上次刷新: cfg.lastRunAt ? new Date(cfg.lastRunAt).toLocaleString() : null,
        下次自动刷新: cfg.nextRunAt ? new Date(cfg.nextRunAt).toLocaleString() : null,
        总数: data.results.length,
        最近结果: data.results.slice(0, 40).map((r) => ({
          id: r.id, title: r.title, company: r.company, source: r.sourceLabel,
          salary: r.salary, applied: r.applied, url: r.url,
        })),
      }, null, 2)
    },
  })
}

function atsApplySendTool(ctx) {
  return defineTool({
    name: "ats_apply_send",
    description:
      "为一 条「职位搜索」结果生成个性化打招呼语并登记代投:自动收录进岗位库、写入投递追踪(已投递),返回岗位链接与打招呼语文本(浏览器端会自动复制并打开岗位页)。payload 为 JSON 字符串:{id, greeting}。greeting 应结合用户简历(先 ats_status / ats_resume_read 了解背景)与该岗位亮点,80-150 字,口吻自然不浮夸;写完用一句话说明已代投并提醒用户去岗位页粘贴发送。",
    parameters: {
      payload: { type: "string", required: true, description: 'JSON 字符串:{id:"sxxxx", greeting:"打招呼语"}' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const { cwd, session } = workspaceOf(exec)
      const payload = payloadObject(args, "ats_apply_send")
      const out = await applySearchItem(ctx, cwd, session, payload.id, payload.greeting, exec.signal)
      if (out === undefined) return "没有找到这条搜索结果,请先用 ats_search_read 查看 id。"
      return `已代投「${out.position}」@ ${out.company}:岗位链接与打招呼语已推送到浏览器(自动复制,粘贴发送即完成投递),投递追踪已同步(已投递)。打招呼语:${out.greeting}`
    },
  })
}
