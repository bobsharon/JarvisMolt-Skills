# JarvisMolt-Skills

> OpenClaw技能市场 | 开箱即用的AI自动化技能

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-v2026.2.3+-green.svg)](https://openclaw.ai)

---

## 🚀 快速开始

### 自动安装（推荐）

```bash
# 1. 首次安装skill-installer
git clone https://github.com/YOUR_USERNAME/JarvisMolt-Skills.git
cp -r JarvisMolt-Skills/Skills/skill-installer ~/.openclaw/skills/
openclaw gateway restart

# 2. 在OpenClaw对话中学习技能
学习lark技能 从 https://github.com/YOUR_USERNAME/JarvisMolt-Skills

# 3. 输入授权码（从技能提供者处获取）
ABCD-EFGH-JKLM-NPQR-XY

# ✅ 完成！技能自动下载和安装
```

---

## 🎁 可用技能

### 1. 飞书技能 (lark)

- 智能混合策略（Chrome扩展 + 自动化浏览器）
- 动态JavaScript内容渲染
- 反爬虫对抗机制
- 结构化数据输出

**使用示例**：
```
飞书搜索 电商运营
飞书爬取 直播带货 --数量=50
```

[查看文档](./Skills/lark/)

---

## 📖 获取授权码

联系技能提供者获取授权码：
- Email: skills@jarvismolt.com
- 微信: JarvisMolt-Skills

---

## 📁 项目结构

```
JarvisMolt-Skills/
├── Skills/
│   ├── skill-installer/   # 技能安装器（必须）
│   ├── lark/        # 飞书技能
│   └── lark/             # 飞书技能（即将推出）
├── .openclaw/
│   └── browser-config.json # 浏览器配置
└── README.md
```

---

**最后更新**: 2026-02-05
