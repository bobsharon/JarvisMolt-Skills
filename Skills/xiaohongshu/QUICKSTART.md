# 🚀 小红书爬取 - 快速开始指南

> **5分钟快速上手，立即开始爬取小红书内容！**

---

## ⚡ 最快方式：Chrome扩展中继模式

### 第一步：修复Node版本（如果需要）

```bash
# 检查当前Node版本
node --version

# 如果 < 22.0.0，使用nvm切换：
nvm use 23.11.1  # 你已经安装了这个版本

# 验证
node --version   # 应该显示 v23.11.1
openclaw status  # 应该正常运行
```

---

### 第二步：在Chrome中打开小红书

**方法1：直接访问**
```
在Chrome浏览器中打开：
https://www.xiaohongshu.com/search_result?keyword=电商运营&source=web_explore_feed
```

**方法2：手动搜索**
1. 打开 https://www.xiaohongshu.com
2. 在搜索框输入关键词（如：电商运营）
3. 等待页面加载完成

---

### 第三步：在对话中使用技能

```bash
# 直接在对话中说：
小红书搜索 电商运营

# 或者使用高级参数：
小红书搜索 直播带货 --模式=chrome扩展 --数量=20
```

---

## 🎯 完整命令示例

### 示例1：基础搜索
```
用户: 小红书搜索 电商运营
Agent:
  ✓ 检测到Chrome标签页
  ✓ 连接成功
  ✓ 提取到15条笔记
  ✓ 返回结构化数据
```

### 示例2：深度爬取
```
用户: 小红书爬取 穿搭博主 --深度 --数量=50
Agent:
  ✓ 启动自动化浏览器
  ✓ 打开搜索页面
  ✓ 滚动加载更多内容
  ✓ 提取50条笔记数据
  ✓ 返回JSON文件
```

### 示例3：批量任务
```
用户: 小红书批量搜索 电商运营,直播带货,跨境电商
Agent:
  ✓ 依次搜索3个关键词
  ✓ 每个关键词提取20条
  ✓ 合并去重
  ✓ 导出Excel表格
```

---

## 📋 输出数据格式

```json
{
  "keyword": "电商运营",
  "timestamp": "2026-02-05T10:30:00Z",
  "total": 20,
  "notes": [
    {
      "noteId": "6523abc...",
      "title": "电商运营实战技巧分享",
      "description": "作为运营了3年的电商人...",
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
      "images": [
        "https://sns-webpic-qc.xhscdn.com/...",
        "https://sns-webpic-qc.xhscdn.com/..."
      ],
      "url": "https://www.xiaohongshu.com/explore/6523abc...",
      "publishTime": "2天前"
    }
  ]
}
```

---

## 🛠 故障排查

### 问题1：`openclaw: command not found`

**解决方案**：
```bash
# 检查OpenClaw是否安装
which openclaw

# 如果未安装，根据项目文档安装
npm install -g openclaw
# 或
pnpm install -g openclaw
```

---

### 问题2：`Node version too low`

**解决方案**：
```bash
# 使用nvm切换到已安装的高版本
nvm use 23.11.1

# 或安装新版本
nvm install 22
nvm use 22
```

---

### 问题3：`Browser profile not found`

**解决方案**：
```bash
# 创建Profile目录
mkdir -p ~/.openclaw/browser-profiles/xiaohongshu

# 或让OpenClaw自动创建
openclaw browser open "https://www.xiaohongshu.com" --profile xiaohongshu-isolated
```

---

### 问题4：`Chrome extension not available`

**解决方案**：
1. 确保在Chrome中打开了小红书页面
2. 安装OpenClaw Chrome扩展（如果需要）
3. 或切换到自动化模式：
   ```
   小红书搜索 关键词 --模式=自动化
   ```

---

### 问题5：内容加载不完整

**解决方案**：
```bash
# 增加等待时间
小红书搜索 关键词 --wait=10000

# 或启用自动滚动
小红书搜索 关键词 --auto-scroll=true
```

---

## 🎓 高级技巧

### 技巧1：自定义数据字段
```bash
小红书搜索 电商运营 --fields=title,author,stats,url
# 只提取指定字段，减少数据量
```

### 技巧2：过滤和排序
```bash
小红书搜索 直播带货 --min-likes=1000 --sort=likes
# 只要点赞数>=1000的笔记，按点赞数排序
```

### 技巧3：导出到文件
```bash
小红书搜索 穿搭博主 --output=json --file=xiaohongshu-data.json
小红书搜索 穿搭博主 --output=csv --file=xiaohongshu-data.csv
小红书搜索 穿搭博主 --output=excel --file=xiaohongshu-data.xlsx
```

### 技巧4：增量更新
```bash
小红书搜索 电商运营 --since=2026-02-01
# 只爬取2月1日之后的新笔记
```

---

## 📊 使用建议

### 最佳实践

✅ **推荐**：
- 优先使用Chrome扩展中继模式（反爬能力最强）
- 单次爬取控制在50-100条以内
- 添加随机延迟（--delay=1000-3000ms）
- 定期清理缓存（避免占用空间）

❌ **避免**：
- 短时间内大量爬取（容易被限流）
- 使用固定的爬取间隔（容易被识别）
- 忽略反爬警告（可能导致IP被封）

---

## 🔗 相关文档

- 详细实施记录：[IMPLEMENTATION_LOG.md](./IMPLEMENTATION_LOG.md)
- 完整技能文档：[SKILL.md](./SKILL.md)
- 浏览器配置：[../.openclaw/browser-config.json](../../.openclaw/browser-config.json)

---

## 💬 获取帮助

如果遇到问题：
1. 查看故障排查章节
2. 阅读详细实施记录
3. 检查浏览器配置文件
4. 在对话中直接问我

---

**状态**：✅ 准备就绪
**最后更新**：2026-02-05
**维护者**：Claude Sonnet 4.5
