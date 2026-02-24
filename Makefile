# JarvisMolt-Skills 本地内控
# 用法: make help

.PHONY: help version-check version-stamp lint-secrets package-check test check preflight

SKILL_DIR := Skills/skill-installer
TARBALL   := skill-installer.tar.gz

# ── 默认 target ──────────────────────────────────────────────
help: ## 显示所有可用命令
	@echo ""
	@echo "  JarvisMolt-Skills 内控命令"
	@echo "  ========================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ── 版本一致性检查 ───────────────────────────────────────────
version-check: ## 检查 package.json 与 SKILL.md 版本一致
	@echo "🔍 版本一致性检查..."
	@PKG_VER=$$(node -p "require('./$(SKILL_DIR)/package.json').version") && \
	SKILL_VER=$$(sed -n 's/^version: \([0-9][0-9.]*\).*/\1/p' $(SKILL_DIR)/SKILL.md | head -1) && \
	CL_VER=$$(sed -n 's/^## \[\([0-9][0-9.]*\)\].*/\1/p' CHANGELOG.md | head -1) && \
	echo "  package.json: $$PKG_VER" && \
	echo "  SKILL.md:     $$SKILL_VER" && \
	echo "  CHANGELOG.md: $$CL_VER" && \
	if [ "$$PKG_VER" != "$$SKILL_VER" ]; then echo "❌ package.json ($$PKG_VER) != SKILL.md ($$SKILL_VER)"; exit 1; fi && \
	if [ "$$PKG_VER" != "$$CL_VER" ]; then echo "❌ package.json ($$PKG_VER) != CHANGELOG ($$CL_VER)"; exit 1; fi && \
	echo "✅ 版本一致: $$PKG_VER"

# ── 版本号批量更新 ─────────────────────────────────────────────
version-stamp: ## 从 package.json 同步版本号到 SKILL.md
	@VER=$$(node -p "require('./$(SKILL_DIR)/package.json').version") && \
	echo "📌 同步版本号: $$VER" && \
	sed -i '' "s/^version: [0-9][0-9.]*/version: $$VER/" $(SKILL_DIR)/SKILL.md && \
	echo "✅ 版本号已同步为 $$VER"

# ── 密钥泄露扫描 ─────────────────────────────────────────────
lint-secrets: ## 扫描 .js 文件中的硬编码密钥/URL
	@echo "🔍 密钥泄露扫描..."
	@FOUND=0; \
	for f in $$(find . -name '*.js' | grep -v node_modules | grep -v '\.test\.'); do \
		HITS=$$(grep -nE "(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|xoxb-|AKIA[A-Z0-9]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY|['\"][a-f0-9]{32}['\"])" "$$f" || true); \
		if [ -n "$$HITS" ]; then \
			echo "  ⚠️  $$f:"; \
			echo "$$HITS" | sed 's/^/    /'; \
			FOUND=1; \
		fi; \
	done; \
	if [ "$$FOUND" = "1" ]; then echo "❌ 发现疑似硬编码密钥"; exit 1; fi; \
	echo "✅ 未发现硬编码密钥"

# ── 打包产物校验 ─────────────────────────────────────────────
package-check: ## 校验 skill-installer.tar.gz 产物内容
	@echo "🔍 打包产物校验..."
	@if [ ! -f $(TARBALL) ]; then echo "❌ $(TARBALL) 不存在"; exit 1; fi
	@echo "  检查不该打包的文件..."
	@BAD=$$(tar tzf $(TARBALL) | grep -E '(test/|coverage/|\.env|\.log$$|package-lock\.json|\.git|\.test\.js)' || true); \
	if [ -n "$$BAD" ]; then \
		echo "❌ tar.gz 包含不该打包的文件:"; \
		echo "$$BAD" | sed 's/^/    /'; \
		exit 1; \
	fi
	@echo "  检查必须包含的文件..."
	@for REQUIRED in agent.js package.json SKILL.md; do \
		if ! tar tzf $(TARBALL) | grep -q "$$REQUIRED"; then \
			echo "❌ tar.gz 缺少 $$REQUIRED"; exit 1; \
		fi; \
	done
	@if ! tar tzf $(TARBALL) | grep -q 'node_modules/tar/'; then \
		echo "❌ tar.gz 缺少 node_modules/tar/"; exit 1; \
	fi
	@echo "✅ 打包产物校验通过"

# ── 测试 ─────────────────────────────────────────────────────
test: ## 运行单元测试
	@echo "🧪 运行单元测试..."
	@cd $(SKILL_DIR) && npx jest --verbose --forceExit
	@echo "✅ 单元测试通过"

# ── 组合 target ──────────────────────────────────────────────
check: version-check lint-secrets ## 快速静态检查（version + secrets）
	@echo ""
	@echo "✅ 所有静态检查通过"

preflight: check test package-check ## 发布前完整检查（静态 + 测试 + 打包）
	@echo ""
	@echo "✅ Preflight 全部通过，可以发布"
