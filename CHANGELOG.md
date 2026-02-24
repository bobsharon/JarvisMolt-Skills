# Changelog

## [1.4.1] - 2026-02-15

### Security
- 客户端速率限制：verify 连续失败 5 次后锁定 15 分钟 (#5)
- 移除硬编码 API key 和 FC URL (#2 #3 #4)

### Fixed
- 恢复 skillInstallerAgent export + parseUserInput 兼容集成测试

## [1.4.0] - 2026-02-10

### Security
- 供应链安全加固：路径校验、execSync 替换、SHA256 hash 校验、国内镜像
- `--ignore-scripts` 防止 npm postinstall 攻击 (#9)
- tar 解压 symlink 过滤 (#10)
- downloadUrl 域名白名单校验 (#11)
- skillName 白名单校验 (#12)

### Added
- 测试体系重构 + Jest v8 coverage
- `check` 命令：本地授权缓存检查 + downloadUrl 缓存复用

### Fixed
- post-install 展示命令示例而非分类名
- post-install 先展示 auth 提示再 restart
- daemon restart 改为自动执行并告知用户
- cache downloadUrl 用于重装流程

## [1.3.0] - 2026-01-20

### Changed
- 从 agent 回调模式重构为 SKILL.md 驱动 + CLI 工具模式
- npm install 使用内联 registry 避免污染全局配置

### Fixed
- tar 解压 strip-components=1 修复嵌套目录
- raw URL 分支名 master → main

## [1.2.0] - 2026-01-10

### Added
- 一键安装脚本 install.sh
- UX 进度反馈（verify / install 步骤）

### Changed
- 使用 Node.js tar 模块实现跨平台解压（替代 shell tar）
- 技能名 feishu → lark 避免与内置 channel 冲突

## [1.1.0] - 2025-12-20

### Added
- 集成 Download API 实现完整技能安装流程
- 增强命令格式支持

### Security
- 混淆 API key，SKILL.md 添加反源码展示规则

## [1.0.0] - 2025-12-01

### Added
- 初始版本：skill-installer CLI 工具
- verify / install / list / remove 命令
- SKILL.md 驱动的工作流定义
