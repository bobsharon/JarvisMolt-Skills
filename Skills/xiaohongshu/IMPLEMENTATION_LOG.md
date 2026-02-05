# 小红书动态内容爬取 - 实施记录

## 📅 实施时间
2026-02-05

---

## 🎯 问题诊断

### 原始问题
```
小红书内容是动态加载的（JavaScript渲染）
→ WebFetch工具只能抓取静态HTML
→ 无法获取笔记内容
```

### 技术分析
1. **WebFetch局限性**：
   - 只抓取初始HTML响应
   - 不执行JavaScript
   - 无法等待动态内容加载
   - 不支持SPA（单页应用）

2. **小红书特点**：
   - 使用React/Vue等框架
   - 笔记列表通过API异步加载
   - 需要浏览器环境才能看到真实内容

---

## 🔍 方案研究过程

### 第一步：查阅OpenClaw文档
通过`claude-code-guide` Agent查询官方文档，获得以下关键信息：

1. **浏览器自动化支持**：
   - ✅ Playwright Core v1.58.1 已集成
   - ✅ 支持3种浏览器配置模式
   - ✅ 提供完整的browser工具集

2. **配置类型**：
   ```
   - openclaw-managed: 专用隔离浏览器
   - chrome (extension relay): 连接到现有Chrome
   - remote CDP: 连接到远程Chromium
   ```

3. **可用工具**：
   ```bash
   openclaw browser open <url>
   openclaw browser wait --selector <selector>
   openclaw browser screenshot <targetId>
   openclaw browser click <targetId> --selector <selector>
   openclaw browser snapshot <targetId>
   ```

---

## 💡 优化方案设计

### 方案矩阵对比

| 方案 | 自动化 | 反爬能力 | 实现难度 | 推荐度 |
|------|--------|---------|---------|--------|
| Browser工具 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Chrome扩展中继 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ |
| 远程CDP | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 智能混合 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### 最终选择：智能混合策略

**架构设计**：
```
┌─────────────────────────────────────────┐
│          智能混合策略                     │
├─────────────────────────────────────────┤
│  优先级1: Chrome扩展中继                 │
│           (最佳反爬，利用真实浏览器)      │
│                                          │
│  优先级2: Browser工具自动化              │
│           (完全自动，隔离安全)           │
│                                          │
│  优先级3: 手动辅助模式                   │
│           (降级fallback)                 │
└─────────────────────────────────────────┘
```

**决策依据**：
1. **反爬对抗**：Chrome扩展中继使用真实浏览器，完全绕过反爬检测
2. **用户体验**：自动化browser工具作为备选，无需手动操作
3. **鲁棒性**：三层降级策略，确保总能完成任务

---

## 🛠 实施步骤

### 步骤1：创建浏览器配置文件

**文件路径**：`.openclaw/browser-config.json`

**内容**：
```json
{
  "browser": {
    "evaluateEnabled": false,
    "profiles": {
      "xiaohongshu-chrome": {
        "type": "chrome-extension-relay",
        "description": "使用已登录的Chrome浏览器",
        "defaultUrl": "https://www.xiaohongshu.com"
      },
      "xiaohongshu-isolated": {
        "type": "openclaw-managed",
        "userDataDir": "~/.openclaw/browser-profiles/xiaohongshu",
        "description": "隔离的自动化浏览器",
        "options": {
          "headless": false,
          "args": [
            "--disable-blink-features=AutomationControlled",
            "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
          ]
        }
      }
    }
  },
  "tools": {
    "allow": ["browser", "web_fetch"],
    "deny": []
  }
}
```

**关键配置说明**：
- `evaluateEnabled: false` → 禁用任意JS执行（安全）
- `--disable-blink-features=AutomationControlled` → 隐藏自动化标记
- 自定义User-Agent → 模拟真实浏览器

---

### 步骤2：升级技能文档

**文件路径**：`Skills/xiaohongshu/SKILL.md`

**更新内容**：
1. ✅ 添加三种工作模式说明
2. ✅ 提供详细的CLI命令参考
3. ✅ 包含反爬对策措施
4. ✅ 添加故障排查指南
5. ✅ 提供数据结构示例

**核心改进**：
- 从"简单说明"→"完整实施手册"
- 添加实战示例和最佳实践
- 提供性能对比和限制说明

---

### 步骤3：创建Agent实现（待完成）

**计划文件**：`Skills/xiaohongshu/agent.ts`

**核心逻辑**：
```typescript
// 伪代码
async function xiaohongshuSearch(keyword: string, options) {
  // 1. 检测可用模式
  const mode = await detectAvailableMode();

  if (mode === 'chrome-extension') {
    // 使用Chrome扩展中继
    return await chromeExtensionRelay(keyword);
  } else if (mode === 'automation') {
    // 使用自动化浏览器
    return await browserAutomation(keyword);
  } else {
    // 降级到手动模式
    return await manualAssistMode(keyword);
  }
}
```

---

## 🧪 测试计划

### 测试用例1：Chrome扩展中继模式
```bash
# 前置条件：在Chrome中打开小红书搜索页面
# 执行命令：
小红书搜索 电商运营 --模式=chrome扩展

# 预期结果：
# - Agent检测到已打开的Chrome标签页
# - 成功提取动态加载的笔记列表
# - 返回JSON格式数据
```

### 测试用例2：自动化浏览器模式
```bash
# 执行命令：
小红书搜索 直播带货 --模式=自动化 --数量=20

# 预期结果：
# - 启动隔离浏览器实例
# - 自动打开搜索URL
# - 等待JS加载完成
# - 滚动加载20条笔记
# - 返回结构化数据
```

### 测试用例3：反爬对抗测试
```bash
# 执行命令：
小红书爬取 穿搭博主 --深度 --数量=100

# 验证点：
# - 未被检测为机器人
# - 成功绕过验证码
# - 持续爬取100条数据
```

---

## 📊 性能指标

### 目标性能

| 指标 | Chrome扩展 | 自动化浏览器 |
|------|-----------|-------------|
| **首次加载** | 3-5秒 | 5-8秒 |
| **单条笔记提取** | 0.1秒 | 0.2秒 |
| **20条笔记** | 5-10秒 | 8-15秒 |
| **100条笔记** | 30-60秒 | 60-120秒 |
| **成功率** | >95% | >80% |

---

## 🚨 已知问题与解决方案

### 问题1：Node版本不匹配
**现象**：
```
openclaw requires Node >=22.0.0
Detected: node 20.19.6
```

**解决方案**：
```bash
# 方案A：使用nvm切换版本
nvm install 22
nvm use 22

# 方案B：使用已安装的v23.11.1
nvm use 23.11.1

# 验证
node --version  # 应该显示 >= 22.0.0
openclaw status # 应该正常运行
```

### 问题2：浏览器Profile不存在
**现象**：
```
Error: Browser profile 'xiaohongshu-isolated' not found
```

**解决方案**：
```bash
# 创建Profile目录
mkdir -p ~/.openclaw/browser-profiles/xiaohongshu

# 或让OpenClaw自动创建
openclaw browser open "https://www.xiaohongshu.com" --profile xiaohongshu-isolated
```

### 问题3：Chrome扩展未安装
**现象**：
```
Error: Chrome extension relay not available
```

**解决方案**：
1. 安装OpenClaw Chrome扩展
2. 在Chrome扩展管理页面启用
3. 确保扩展有权限访问xiaohongshu.com

---

## 📈 下一步计划

### 短期（本周）
- [ ] 修复Node版本问题
- [ ] 测试Chrome扩展中继模式
- [ ] 实现基础的笔记提取功能
- [ ] 编写Agent实现代码

### 中期（本月）
- [ ] 实现自动化浏览器模式
- [ ] 添加反爬对抗措施
- [ ] 实现分页和滚动加载
- [ ] 优化数据结构和解析

### 长期（下月）
- [ ] 添加缓存机制（避免重复爬取）
- [ ] 实现增量更新（只爬新内容）
- [ ] 支持多关键词批量搜索
- [ ] 数据持久化和导出功能

---

## 🎓 技术收获

### 关键学习点

1. **WebFetch vs Browser工具**：
   - WebFetch适合静态内容（新闻、文档）
   - Browser工具适合动态内容（SPA、搜索结果）

2. **浏览器配置策略**：
   - Chrome扩展中继：最强反爬，适合登录态任务
   - OpenClaw-managed：自动化友好，适合批量任务
   - Remote CDP：企业级，适合分布式爬取

3. **反爬对抗技术**：
   - 禁用自动化控制标记
   - 自定义User-Agent
   - 随机延迟和行为模拟
   - 使用真实浏览器Profile

---

## 📚 参考文档

- [OpenClaw浏览器工具文档](https://docs.openclaw.ai/browser)
- [Playwright官方文档](https://playwright.dev)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [小红书URL规则分析](./SKILL.md#搜索url格式)

---

## 👥 贡献者

- 主要实施：Claude Sonnet 4.5
- 方案设计：基于OpenClaw框架最佳实践
- 文档编写：2026-02-05

---

## 📝 变更日志

### v1.0.0 (2026-02-05)
- ✅ 创建浏览器配置文件
- ✅ 升级技能文档
- ✅ 设计智能混合策略
- ✅ 编写完整实施记录
- ⏳ Agent代码实现（待完成）

---

## ✅ 实施检查清单

- [x] 问题诊断和分析
- [x] 方案研究和对比
- [x] 浏览器配置文件创建
- [x] 技能文档升级
- [x] 实施记录编写
- [ ] Node版本升级
- [ ] Agent代码实现
- [ ] 功能测试
- [ ] 性能优化
- [ ] 文档完善

---

**状态**：实施中 🚧
**完成度**：60%
**预计完成时间**：待Node版本修复后继续
