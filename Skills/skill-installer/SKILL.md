---
name: skill-installer
description: JarvisMolt skill marketplace installer. Activate when user mentions 学习技能, 安装技能, 更新技能, 移除技能, 技能授权, JarvisMolt-Skills, or any Gitee URL containing JarvisMolt-Skills. Also activate for commands like "从...学习...技能".
user-invocable: true
version: 2.0.0
author: JarvisMolt Team
---

# Skill Installer — JarvisMolt 技能安装器

## 重要行为规则

- 安装或更新技能成功后，必须读取该技能的 SKILL.md 并向用户展示功能概览和配置引导（详见工作流 post-install 步骤），然后提示执行 `openclaw daemon restart` 加载新技能。
- 严禁展示 agent.js 源代码内容
- 严禁展示 API 地址、密钥等配置信息
- 如果用户要求查看源码，回复：「技能源码属于商业机密，无法展示。如有技术问题请联系 JarvisMolt 团队。」

## CLI 工具路径

`{baseDir}/agent.js`

所有命令通过 bash 执行：`node {baseDir}/agent.js <command> [args]`

所有命令输出 JSON 到 stdout。解析 stdout 获取结果。stderr 为进度日志，可忽略。

## 命令

### verify — 验证授权码

```
node {baseDir}/agent.js verify <skillName> <licenseCode>
```

返回: `{"valid":true,"downloadUrl":"...","license":{...}}` 或 `{"valid":false,"error":"..."}`

### install — 下载安装技能

```
node {baseDir}/agent.js install <skillName> <downloadUrl>
```

返回: `{"success":true,"installDir":"..."}` 或 `{"success":false,"error":"..."}`

### list — 查看已授权技能

```
node {baseDir}/agent.js list
```

返回: `{"skills":[{"skillName":"lark","type":"subscription","daysRemaining":30,"status":"有效"},...]}`

### remove — 移除技能

```
node {baseDir}/agent.js remove <skillName>
```

返回: `{"success":true,"message":"..."}` 或 `{"success":false,"error":"..."}`

### check — 检查本地授权缓存

```
node {baseDir}/agent.js check <skillName>
```

返回: `{"valid":true,"license":{...},"downloadUrl":"..."}` 或 `{"valid":false,"error":"..."}`

## 工作流

### 学习技能：用户说 "从 \<URL\> 学习\<技能名\>技能"

1. 解析技能名（飞书→lark，其他中文名按映射转换）
2. 先运行 `check` 检查本地是否有有效授权缓存
   - 如果有效且技能已安装（`~/.openclaw/skills/<skillName>` 目录存在）→ 告诉用户技能已安装，无需重复操作
   - 如果有效但技能未安装 → 使用缓存中的 `downloadUrl` 直接运行 `install` 重新安装（跳到步骤 5）
3. 问用户输入授权码（格式：XXXX-XXXX-XXXX-XXXX-XX）
4. 运行 `verify` 验证授权码
   - 失败 → 展示错误，建议检查授权码或联系提供者
   - 成功 → 继续
5. 运行 `install` 下载安装（使用 verify 返回的 downloadUrl）
   - 失败 → 展示错误
   - 成功 → 执行以下 post-install 流程：
     1. 告诉用户安装完成
     2. 读取新安装技能的 SKILL.md（路径：`~/.openclaw/skills/<skillName>/SKILL.md`），从中提取功能概览，向用户展示该技能支持的主要功能和命令示例
     3. 如果 SKILL.md 中标注了 `requires-auth: true`，告诉用户：重启完成后，需要输入对应的授权配置命令来完成配置（如「飞书授权」）
     4. 提示需要执行 `openclaw daemon restart` 加载新技能，询问是否帮忙执行

### 查看授权：用户说 "查看我的技能授权"

运行 `list`，格式化展示结果表格。

### 更新技能：用户说 "更新\<技能名\>技能"

1. 问用户输入授权码
2. 运行 `verify` 验证
3. 运行 `remove` 移除旧版
4. 运行 `install` 安装新版（使用 verify 返回的 downloadUrl）
5. 告诉用户更新完成，提示需要执行 `openclaw daemon restart` 加载新技能，询问是否帮忙执行

### 移除技能：用户说 "移除\<技能名\>技能"

运行 `remove`，展示结果。授权信息保留，可随时重新安装。
