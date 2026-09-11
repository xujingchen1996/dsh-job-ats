#!/bin/bash
# ─────────────────────────────────────────────────────────────
# 求职 ATS 模式 一键安装脚本
# 用法：在装有 dsh 的电脑上运行  bash install.sh
# 会自动完成：预设注册 + 包安装 + 三处接线（patch / workspace / 链接）
# ─────────────────────────────────────────────────────────────
set -u
DSH="${DSH_HOME:-$HOME/.dsh}"
SRC="$(cd "$(dirname "$0")" && pwd)"
PATCH="$DSH/profiles/web/cordis.patch.yml"
WORKSPACE="$DSH/profiles/web/pnpm-workspace.yaml"
PKG_DIR="$DSH/profiles/web/packages/dsh-job-ats"
PRESET_DIR="$DSH/.agent-presets/job-ats"

fail() { echo "❌ $1"; exit 1; }
ok()   { echo "✅ $1"; }

# ── 前置检查 ──
[ -d "$DSH/profiles/web" ] || fail "找不到 web profile（$DSH/profiles/web）。确认这是 DeepSeek Harness (dsh) 的安装，且用 dsh web 启动过。"
command -v node >/dev/null 2>&1 || fail "未找到 node（dsh 依赖 Node.js）"

# fflate 是 docx 导出的隐性依赖（dsh 自带，vite 依赖）；找不到仅告警
if ! find "$DSH/profiles/node_modules" "$DSH/profiles/web/node_modules" /opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules -maxdepth 1 -name "fflate" -type d 2>/dev/null | grep -q .; then
  echo "⚠️  未检测到 fflate 库：Word 导出可能不可用（HTML/PDF 不受影响）。"
fi

# ── 1. 预设文件夹 ──
if [ -d "$PRESET_DIR" ]; then
  echo "ℹ️  $PRESET_DIR 已存在，跳过（如需覆盖请先手动删除该目录）"
else
  mkdir -p "$(dirname "$PRESET_DIR")"
  cp -R "$SRC/preset" "$PRESET_DIR" && ok "已安装预设 → $PRESET_DIR"
fi

# ── 2. 包文件 ──
if [ -d "$PKG_DIR" ]; then
  echo "ℹ️  $PKG_DIR 已存在，跳过（如需覆盖请先手动删除该目录）"
else
  mkdir -p "$DSH/profiles/web/packages"
  cp -R "$SRC/package" "$PKG_DIR" && ok "已安装包 → $PKG_DIR"
fi

# ── 3. profile patch 注册（挂载浏览器 Tab + /ats-api 接口）──
if grep -q "job-ats-studio" "$PATCH" 2>/dev/null; then
  echo "ℹ️  $PATCH 已注册过 job-ats-studio，跳过"
else
  mkdir -p "$(dirname "$PATCH")" 2>/dev/null
  cat >> "$PATCH" <<'PATCHEOF'

# The 求职 ATS 工作台 (job-ats): host half serves /ats-api/* (jobs, analyses,
# resume library, ATS task state/edits/choices, applications, interviews, and
# Word/PDF export), and this Loader entry is what puts the dsh.client bundle
# into the browser boot graph. The preset row (mode: tools) registers the
# model tools.
- insert:
    - id: job-ats-studio
      name: dsh-job-ats
      config:
        mode: api
PATCHEOF
  ok "已追加注册 → $PATCH"
fi

# ── 4. pnpm workspace 清单 ──
if grep -q "packages/dsh-job-ats" "$WORKSPACE" 2>/dev/null; then
  echo "ℹ️  $WORKSPACE 已包含 dsh-job-ats，跳过"
else
  echo "  - packages/dsh-job-ats" >> "$WORKSPACE" && ok "已追加 → $WORKSPACE"
fi

# ── 5. 加载器符号链接 ──
if [ -e "$DSH/profiles/node_modules/dsh-job-ats" ] && [ ! -L "$DSH/profiles/node_modules/dsh-job-ats" ]; then
  fail "$DSH/profiles/node_modules/dsh-job-ats 已存在但不是符号链接，请手动检查"
fi
mkdir -p "$DSH/profiles/node_modules"
ln -sfn ../web/packages/dsh-job-ats "$DSH/profiles/node_modules/dsh-job-ats"
ok "已建立符号链接 → $DSH/profiles/node_modules/dsh-job-ats"

# ── 完成 ──
echo ""
echo "🎉 安装完成！"
echo "下一步：重启 dsh web 服务（页面会短暂断开，刷新即恢复，会话不丢）。"
echo "重启后：新建会话 → 预设选择器选「求职 ATS 模式」→ 顶部出现六个标签页。"
echo ""
echo "提示："
echo "  · PDF 导出需要在 Mac 上安装 Google Chrome（无 Chrome 时可导出 HTML 代替）"
echo "  · 若因其他 AI 软件占用 3080 端口导致启动失败，请先释放端口"
