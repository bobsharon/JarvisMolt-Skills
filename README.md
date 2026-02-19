# JarvisMolt-Skills

> OpenClaw 技能市场 | 通过 skill-installer 安装授权技能

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-v2026.2.3+-green.svg)](https://openclaw.ai)

---

## 🚀 快速开始

### 一键安装（推荐）

```bash
curl -fsSL https://gitee.com/bobsharon/JarvisMolt-Skills/raw/master/install.sh | bash
```

安装完成后，在 OpenClaw 中输入：

```
从 https://gitee.com/bobsharon/JarvisMolt-Skills 学习飞书技能
```

输入您购买的授权码即可完成安装。

<details>
<summary>手动安装（备选）</summary>

#### 前置准备（国内用户必读）

**配置 npm 镜像（推荐）**

```bash
# 使用淘宝镜像（永久配置）
npm config set registry https://registry.npmmirror.com

# 验证配置
npm config get registry
```

#### 步骤

```bash
# 克隆仓库
git clone https://gitee.com/bobsharon/JarvisMolt-Skills.git

# 安装 skill-installer（技能安装器）
cp -r JarvisMolt-Skills/Skills/skill-installer ~/.openclaw/skills/

# 安装依赖
cd ~/.openclaw/skills/skill-installer
npm install

# 重启 OpenClaw
openclaw gateway restart
```

</details>

---

## 🎯 工作原理

1. **skill-installer** 是一个元技能（meta-skill），负责安装其他技能
2. 当您请求学习某个技能时，skill-installer 会：
   - 提示输入授权码（如果需要）
   - 连接验证服务器验证授权
   - 从安全服务器下载技能包
   - 自动安装到 `~/.openclaw/skills/`

3. 所有技能都需要有效的授权码才能使用

---

## 📖 获取授权码

联系技能提供者获取授权码：
- 微信: JarvisMolt-Skills

### 付费模式

按月/季/年的 SaaS 化服务：

| 周期 | 标准版 | 旗舰版 |
|------|--------|--------|
| 试用 | 免费 7 天（旗舰版全功能） | — |
| 月付 | ¥29.9 | ¥49.9 |
| 季付 | ¥79.9 | ¥129.9 |
| 年付 | ¥199.9 | ¥349.9 |

---

## 📁 项目结构

```
JarvisMolt-Skills/
├── Skills/
│   └── skill-installer/   # 技能安装器（唯一包含的技能）
│       ├── agent.js       # 安装器核心逻辑
│       ├── package.json   # 依赖配置
│       ├── SKILL.md       # 详细文档
│       └── README.md      # 使用说明
└── README.md              # 本文件
```

**注意**：本仓库只包含 skill-installer。实际的技能（如飞书等）通过授权后自动下载安装。

---

## 🔐 安全说明

- 所有技能都经过授权验证后下载
- 需要有效授权码才能下载
- 授权码有激活次数限制，请勿分享
- 下载链接带有临时签名，10分钟有效

---

## 💡 常见问题

**Q: 为什么仓库里只有 skill-installer？**
A: 为了保护技能代码，实际技能存储在私有服务器上，通过授权后自动下载。

**Q: 授权码可以分享吗？**
A: 不建议。授权码有激活次数限制（默认1次），分享会消耗激活名额。

**Q: 如何查看已安装的技能？**
A: 在 OpenClaw 中输入 "查看我的技能授权"

**Q: 如何更新技能？**
A: 在 OpenClaw 中输入 "更新XX技能"

---

## 📞 支持

遇到问题？查看 [skill-installer 文档](./Skills/skill-installer/SKILL.md)

---

**最后更新**: 2026-02-19
**维护者**: JarvisMolt Team
