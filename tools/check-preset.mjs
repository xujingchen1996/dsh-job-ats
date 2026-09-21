#!/usr/bin/env node
/**
 * 校验 dsh 预设的插件行能否解析 —— 防止「包名写错/臆造」导致会话无法打开。
 *
 * 会话 resume 失败最常见的根因：preset 的某一行 name 指向一个不存在的包
 * （例如把 dsh-workflow-worker-thread 写成不存在的 dsh-workflow-ptc）。
 *
 * 用法：
 *   node tools/check-preset.mjs                 # 自动探测本仓库 preset/ 与 dsh 安装位置
 *   node tools/check-preset.mjs <preset目录>
 *   node tools/check-preset.mjs <preset目录> <dsh包根目录>
 */
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { execSync } from "node:child_process"

const here = dirname(fileURLToPath(import.meta.url))
const presetDir = resolve(process.argv[2] || join(here, "..", "preset"))

function candidateRoots() {
  const roots = []
  if (process.argv[3]) roots.push(resolve(process.argv[3]))
  // 常见 dsh 安装位置
  roots.push("/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules")
  roots.push("/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules")
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim()
    roots.push(join(globalRoot, "@deepseek-ai", "dsh", "node_modules"))
  } catch {}
  // profile 的依赖农场（本地插件包在这里）
  const home = process.env.HOME || ""
  if (home) roots.push(join(home, ".dsh", "profiles", "node_modules"))
  return roots.filter((r) => existsSync(r))
}

/** 取包根：`@scope/name/sub` → `@scope/name`；`name/sub` → `name` */
function packageRootOf(name) {
  if (name.startsWith("@")) return name.split("/").slice(0, 2).join("/")
  return name.split("/")[0]
}

function resolvable(name, roots) {
  if (name === "cordis:group") return { ok: true, where: "内置" }
  // 带子路径的名称（如 .../list-agents）是包的 exports 子路径，检查包根即可
  const pkg = packageRootOf(name)
  for (const root of roots) {
    if (existsSync(join(root, pkg))) return { ok: true, where: root }
  }
  return { ok: false, where: "" }
}

const file = join(presetDir, "agent.cordis.yml")
if (!existsSync(file)) {
  console.error(`✗ 找不到预设文件: ${file}`)
  process.exit(2)
}
const src = readFileSync(file, "utf8")
// 简易提取（无需 YAML 依赖）：所有 name: '...' 与 name: "..." 行
const names = [...src.matchAll(/^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map((m) => m[1])

const roots = candidateRoots()
console.log(`预设文件: ${file}`)
console.log(`搜索路径: ${roots.length} 个 dsh 包根\n`)

let bad = 0
const seen = new Set()
for (const name of names) {
  if (seen.has(name)) continue
  seen.add(name)
  const r = resolvable(name, roots)
  if (r.ok) {
    console.log(`  ✓ ${name}`)
  } else {
    bad += 1
    console.log(`  ✗ ${name}   ← 无法解析（会话将无法打开）`)
  }
}

console.log()
if (bad === 0) {
  console.log(`✅ 全部 ${seen.size} 个插件行均可解析`)
  process.exit(0)
} else {
  console.log(`❌ ${bad} 个插件行无法解析 —— 请修正包名后再使用该预设`)
  console.log(`   提示：官方写法可参考 dsh 自带预设：`)
  console.log(`   <dsh安装目录>/node_modules/@deepseek-ai/dsh-agent-presets/presets/`)
  process.exit(1)
}
