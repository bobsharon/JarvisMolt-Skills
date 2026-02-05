# xiaohongshu

小红书搜索和内容爬取技能 - 智能混合策略版

## 功能特性

- ✅ **智能模式切换**：自动选择最优爬取方式
- ✅ **反爬对抗**：支持Chrome扩展中继（利用真实浏览器）
- ✅ **动态内容**：完整支持JavaScript渲染
- ✅ **多种方式**：扩展中继 / 自动化浏览器 / 手动辅助

## 使用方法

### 快速开始
```
小红书搜索 电商运营
小红书爬取 直播带货 --深度
小红书分析 穿搭博主 --前20条
```

### 高级用法
```
小红书搜索 关键词 --模式=chrome扩展
小红书搜索 关键词 --模式=自动化
小红书搜索 关键词 --输出=json
```

---

## 🎯 三种工作模式

### 模式1：Chrome扩展中继 ⭐推荐⭐

**适用场景**：需要绕过反爬、利用已登录状态

**工作原理**：
1. 在你的Chrome浏览器中打开小红书
2. OpenClaw通过扩展连接到已打开的标签页
3. 直接读取动态加载的内容

**操作步骤**：
```bash
# 1. 手动在Chrome中打开小红书搜索页面
# 2. 在对话中说：
小红书搜索 电商运营 --模式=chrome扩展

# 3. Agent会自动连接到你的Chrome标签页并提取内容
```

**优点**：
- ✅ 最强反爬抵抗力（使用真实浏览器）
- ✅ 自动使用你的登录状态和Cookie
- ✅ 不会被检测为机器人
- ✅ 可以看到实时操作过程

---

### 模式2：自动化浏览器

**适用场景**：完全自动化、批量任务

**工作原理**：
1. OpenClaw启动隔离的Chromium实例
2. 自动打开搜索URL
3. 等待JS加载并提取内容

**操作步骤**：
```bash
# 直接在对话中说：
小红书搜索 电商运营 --模式=自动化

# 或者使用CLI：
openclaw browser open "https://www.xiaohongshu.com/search_result?keyword=电商运营&source=web_explore_feed" --profile xiaohongshu-isolated
```

**优点**：
- ✅ 完全自动化
- ✅ 隔离运行（安全）
- ✅ 可配置User-Agent和代理

**缺点**：
- ⚠️ 可能被检测为机器人
- ⚠️ 需要配置反检测措施

---

### 模式3：手动辅助模式

**适用场景**：作为降级fallback

**工作原理**：
1. 提示用户手动打开页面
2. 用户截图或复制内容
3. Agent分析用户提供的内容

---

## 🔧 配置文件

### 浏览器配置
位置：`/Users/bobsharon/myfiles/xlab/JarvisMolt/.openclaw/browser-config.json`

```json
{
  "browser": {
    "profiles": {
      "xiaohongshu-chrome": {
        "type": "chrome-extension-relay",
        "description": "使用已登录的Chrome"
      },
      "xiaohongshu-isolated": {
        "type": "openclaw-managed",
        "userDataDir": "~/.openclaw/browser-profiles/xiaohongshu"
      }
    }
  }
}
```

---

## 📋 搜索URL格式

- **探索feed搜索：** `https://www.xiaohongshu.com/search_result?keyword={关键词}&source=web_explore_feed`
- **用户搜索：** `https://www.xiaohongshu.com/search_result?keyword={关键词}&source=web_user_page`

---

## 🚀 实战示例

### 示例1：使用Chrome扩展中继
```bash
# 步骤1：在Chrome中打开
# https://www.xiaohongshu.com/search_result?keyword=电商运营&source=web_explore_feed

# 步骤2：在对话中执行
小红书搜索 电商运营

# Agent会自动：
# - 检测到你已打开的Chrome标签页
# - 连接并提取动态加载的笔记列表
# - 返回结构化数据
```

### 示例2：完全自动化
```bash
小红书爬取 直播带货 --模式=自动化 --数量=50

# Agent会自动：
# - 启动隔离浏览器
# - 打开搜索页面
# - 滚动加载更多内容
# - 提取50条笔记数据
# - 返回JSON格式结果
```

---

## ⚠️ 反爬对策

### 已实施的反检测措施

**浏览器指纹**：
- 禁用自动化控制标记：`--disable-blink-features=AutomationControlled`
- 自定义User-Agent：模拟真实macOS Chrome

**行为模拟**：
- 随机延迟（0.5-2秒）
- 模拟滚动和鼠标移动
- 逐步加载（避免瞬间爬取大量内容）

**会话管理**：
- 持久化Cookie和LocalStorage
- 使用真实浏览器Profile

---

## 🛠 CLI命令参考

### 打开页面
```bash
openclaw browser open "https://www.xiaohongshu.com/search_result?keyword=电商运营" --profile xiaohongshu-chrome
```

### 等待动态加载
```bash
openclaw browser wait --selector ".note-item" --timeout 5000
```

### 截图
```bash
openclaw browser screenshot <targetId> --type png --output xiaohongshu-search.png
```

### 提取内容
```bash
openclaw browser snapshot <targetId> --selector ".feed-container"
```

### 交互（翻页）
```bash
openclaw browser scroll <targetId> --direction down --pixels 500
openclaw browser click <targetId> --selector ".load-more"
```

---

## 🔍 提取的数据结构

```json
{
  "keyword": "电商运营",
  "total": 50,
  "notes": [
    {
      "noteId": "6523abc...",
      "title": "电商运营实战技巧",
      "description": "分享我的运营经验...",
      "author": {
        "userId": "5a7b8c9...",
        "nickname": "运营小王",
        "avatar": "https://..."
      },
      "stats": {
        "likes": 1234,
        "comments": 56,
        "favorites": 789
      },
      "images": ["https://...", "https://..."],
      "url": "https://www.xiaohongshu.com/explore/6523abc...",
      "publishTime": "2025-01-15"
    }
  ]
}
```

---

## 📊 性能与限制

| 模式 | 速度 | 反爬能力 | 可爬取数量 |
|------|------|---------|-----------|
| Chrome扩展 | 中 | ⭐⭐⭐⭐⭐ | 无限制 |
| 自动化浏览器 | 快 | ⭐⭐⭐ | 建议<100条/次 |
| 手动辅助 | 慢 | ⭐⭐⭐⭐⭐ | 按需 |

---

## ⚙️ 故障排查

### 问题1：浏览器无法启动
```bash
# 检查Node版本（需要>=22.0.0）
node --version

# 如果版本过低，升级Node：
nvm install 22
nvm use 22
```

### 问题2：内容加载不完整
```bash
# 增加等待时间
--wait-timeout 10000

# 或手动滚动加载更多
--auto-scroll true
```

### 问题3：被反爬拦截
```bash
# 切换到Chrome扩展模式
--模式=chrome扩展

# 或添加延迟
--delay 2000
```

---

## 📚 参考资源

- OpenClaw浏览器工具文档：`docs.openclaw.ai/browser`
- Playwright文档：`playwright.dev`
- 浏览器配置示例：`.openclaw/browser-config.json`

---

## 🔐 安全与隐私

- ✅ 所有操作在本地执行
- ✅ 不上传任何用户数据到外部服务器
- ✅ 浏览器Profile隔离存储
- ✅ 禁用任意JavaScript执行（`evaluateEnabled: false`）

---

## 技术栈

- **浏览器引擎**：Playwright Core v1.58.1
- **配置类型**：OpenClaw Browser Profiles
- **MCP服务器**：playwright、ide
