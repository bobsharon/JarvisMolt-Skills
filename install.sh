#!/usr/bin/env bash
# JarvisMolt skill-installer 一键安装脚本
# 用法: curl -fsSL https://gitee.com/bobsharon/JarvisMolt-Skills/raw/master/install.sh | bash
set -euo pipefail

# ── 版本 & URL ──────────────────────────────────────────────
VERSION="1.0.0"
TARBALL_URL="https://gitee.com/bobsharon/JarvisMolt-Skills/releases/download/v${VERSION}/skill-installer.tar.gz"
FALLBACK_BASE="https://gitee.com/bobsharon/JarvisMolt-Skills/raw/master/Skills/skill-installer"
INSTALL_DIR="${HOME}/.openclaw/skills/skill-installer"
TAOBAO_REGISTRY="https://registry.npmmirror.com"

# ── 颜色（与 OpenClaw 一致：coral / cyan / amber）─────────
if [ -t 1 ] && [ -t 2 ]; then
  CORAL='\033[38;5;209m'   # 标题 / 成功
  CYAN='\033[38;5;81m'     # 信息
  AMBER='\033[38;5;214m'   # 警告
  RED='\033[38;5;196m'     # 错误
  DIM='\033[2m'
  RESET='\033[0m'
else
  CORAL='' CYAN='' AMBER='' RED='' DIM='' RESET=''
fi

ui_info()    { printf "${CYAN}ℹ ${RESET}%s\n" "$*"; }
ui_success() { printf "${CORAL}✓ ${RESET}%s\n" "$*"; }
ui_warn()    { printf "${AMBER}⚠ ${RESET}%s\n" "$*"; }
ui_error()   { printf "${RED}✗ ${RESET}%s\n" "$*" >&2; }
ui_step()    { printf "\n${CORAL}▸ %s${RESET}\n" "$*"; }

# ── 临时文件清理 ────────────────────────────────────────────
TMPDIR_INSTALL=""
cleanup() { [ -n "$TMPDIR_INSTALL" ] && rm -rf "$TMPDIR_INSTALL"; }
trap cleanup EXIT

# ── 下载器检测 ──────────────────────────────────────────────
download() {
  local url="$1" dest="$2"
  if command -v curl &>/dev/null; then
    curl -fsSL --connect-timeout 15 --max-time 120 -o "$dest" "$url"
  elif command -v wget &>/dev/null; then
    wget -q --timeout=15 -O "$dest" "$url"
  else
    ui_error "需要 curl 或 wget，请先安装其中之一"
    exit 1
  fi
}

# ── 主流程 ──────────────────────────────────────────────────
main() {
  printf "\n${CORAL}🦞 JarvisMolt skill-installer 安装器 v${VERSION}${RESET}\n"
  printf "${DIM}────────────────────────────────────────${RESET}\n\n"

  # ── 1. 环境检测 ──
  ui_step "检测环境"

  # OS
  local os
  case "$(uname -s)" in
    Darwin) os="macOS" ;;
    Linux)  os="Linux" ;;
    *)      ui_error "不支持的操作系统: $(uname -s)"; exit 1 ;;
  esac
  ui_info "操作系统: ${os}"

  # OpenClaw
  if ! command -v openclaw &>/dev/null; then
    ui_error "未检测到 OpenClaw，请先安装："
    printf "  ${CYAN}curl -fsSL https://openclaw.ai/install.sh | bash${RESET}\n\n"
    exit 1
  fi
  ui_info "OpenClaw: $(openclaw --version 2>/dev/null || echo '已安装')"

  # Node.js
  if ! command -v node &>/dev/null; then
    ui_error "需要 Node.js 18+，请先安装"
    printf "  ${CYAN}https://nodejs.org/${RESET}\n\n"
    exit 1
  fi
  local node_major
  node_major=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
  if [ "$node_major" -lt 18 ]; then
    ui_error "Node.js 版本过低 (v$(node -v))，需要 18+"
    exit 1
  fi
  ui_info "Node.js: $(node -v)"

  # npm
  if ! command -v npm &>/dev/null; then
    ui_error "未检测到 npm"
    exit 1
  fi
  ui_info "npm: $(npm -v)"

  ui_success "环境检测通过"

  # ── 2. 下载 ──
  ui_step "下载 skill-installer"

  TMPDIR_INSTALL=$(mktemp -d)
  local tarball="${TMPDIR_INSTALL}/skill-installer.tar.gz"
  local download_ok=false

  # 尝试从 Release 下载 tarball
  ui_info "从 Gitee Release 下载..."
  if download "$TARBALL_URL" "$tarball" 2>/dev/null; then
    download_ok=true
    ui_success "下载完成 (tarball)"
  else
    # 备选：逐文件下载
    ui_warn "Release 下载失败，尝试从仓库直接下载..."
    local fallback_dir="${TMPDIR_INSTALL}/skill-installer"
    mkdir -p "$fallback_dir"
    local failed=false
    for f in agent.js package.json SKILL.md; do
      if ! download "${FALLBACK_BASE}/${f}" "${fallback_dir}/${f}" 2>/dev/null; then
        failed=true
        break
      fi
    done
    if [ "$failed" = true ]; then
      ui_error "下载失败，请检查网络连接"
      ui_info "也可以手动安装: https://gitee.com/bobsharon/JarvisMolt-Skills"
      exit 1
    fi
    ui_success "下载完成 (单文件模式)"
  fi

  # ── 3. 安装 ──
  ui_step "安装到 ${INSTALL_DIR}"

  mkdir -p "$INSTALL_DIR"

  if [ "$download_ok" = true ]; then
    tar xzf "$tarball" -C "$INSTALL_DIR" --strip-components=0 2>/dev/null \
      || tar xzf "$tarball" -C "$INSTALL_DIR" 2>/dev/null
  else
    cp -f "${TMPDIR_INSTALL}/skill-installer/"* "$INSTALL_DIR/"
  fi

  # 验证关键文件
  for f in agent.js package.json SKILL.md; do
    if [ ! -f "${INSTALL_DIR}/${f}" ]; then
      ui_error "安装不完整：缺少 ${f}"
      exit 1
    fi
  done
  ui_success "文件就位"

  # npm install（自动配置淘宝镜像）
  ui_info "安装 npm 依赖..."
  local current_registry
  current_registry=$(npm config get registry 2>/dev/null || echo "")
  if [ "$current_registry" != "$TAOBAO_REGISTRY" ] && [ "$current_registry" != "${TAOBAO_REGISTRY}/" ]; then
    ui_info "配置 npm 淘宝镜像以加速下载..."
    npm config set registry "$TAOBAO_REGISTRY" 2>/dev/null || true
  fi

  (cd "$INSTALL_DIR" && npm install --production --no-fund --no-audit 2>&1) | while IFS= read -r line; do
    printf "  ${DIM}%s${RESET}\n" "$line"
  done
  ui_success "依赖安装完成"

  # ── 4. 重启 gateway ──
  ui_step "重启 OpenClaw Gateway"

  if openclaw daemon status &>/dev/null; then
    if openclaw daemon restart &>/dev/null; then
      ui_success "Gateway 已重启"
    else
      ui_warn "自动重启失败，请手动执行: openclaw daemon restart"
    fi
  else
    ui_warn "Gateway 未运行，请手动启动: openclaw daemon start"
  fi

  # ── 5. 完成 ──
  printf "\n${CORAL}────────────────────────────────────────${RESET}\n"
  printf "${CORAL}🦞 JarvisMolt skill-installer 安装成功！${RESET}\n"
  printf "${CORAL}────────────────────────────────────────${RESET}\n\n"
  ui_info "下一步：在 OpenClaw 中输入："
  printf "\n  ${CYAN}从 https://gitee.com/bobsharon/JarvisMolt-Skills 学习飞书技能${RESET}\n\n"
}

main "$@"
