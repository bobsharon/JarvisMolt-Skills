#!/usr/bin/env node

/**
 * Skill Installer Agent - API版本
 *
 * JarvisMolt技能市场安装器 - 通过在线API验证授权
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const tar = require('tar');

// ======================================
// 📐 Constants
// ======================================

const MAX_REDIRECTS = 5;
const MIN_VALID_PACKAGE_SIZE = 1000; // bytes — below this, likely an error response
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ======================================
// 🌐 API配置
// ======================================

// API 密钥（运行时解码）
const _k = [115,107,45,106,97,114,118,105,115,109,111,108,116,45,50,48,50,54,45,49,51,54,55,98,56,98,98,101,97,99,49,56,48,51,101];

const API_CONFIG = {
  url: process.env.JARVISMOLT_API_URL || 'https://verify-ffigtcrsdv.cn-shanghai.fcapp.run',
  downloadUrl: process.env.JARVISMOLT_DOWNLOAD_URL || 'https://download-vjckfoskbb.cn-shanghai.fcapp.run',
  paymentUrl: process.env.JARVISMOLT_PAYMENT_URL || 'https://payment-xxxx.cn-shanghai.fcapp.run',
  apiKey: process.env.JARVISMOLT_API_KEY || String.fromCharCode(..._k)
};

// ======================================
// 🔒 路径安全校验
// ======================================

const SKILLS_BASE = path.join(os.homedir(), '.openclaw', 'skills');
const LICENSES_BASE = path.join(os.homedir(), '.openclaw', 'licenses');

function assertSafePath(filePath, baseDir) {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error(`路径越界: ${resolved}`);
  }
}

// ======================================
// 🔧 HTTP请求函数
// ======================================

function makeApiRequest(data) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_CONFIG.url);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_CONFIG.apiKey
      }
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (error) {
          reject(new Error(`解析响应失败: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`API请求失败: ${error.message}`));
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}

function makePaymentRequest(endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_CONFIG.paymentUrl);
    const body = JSON.stringify(data);

    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); } catch (e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ======================================
// 🔧 工具函数
// ======================================

function parseUserInput(message) {
  message = message.trim();

  // 支持格式: "从 https://...，学习飞书技能" 或 "从 https://... 学习飞书技能"
  const learnMatch2 = message.match(/从\s*(https?:\/\/[^\s,]+)[,，]?\s*学习\s*(.+?)\s*技能/i);
  if (learnMatch2) {
    const skillNameChinese = learnMatch2[2].trim();
    // 将中文技能名映射到英文
    const skillNameMap = {
      '飞书': 'lark',
      '飞书技能': 'lark'
    };
    const skillName = skillNameMap[skillNameChinese] || skillNameChinese;
    return {
      action: 'learn',
      skillName: skillName,
      giteeUrl: learnMatch2[1].replace(/[,，]+$/, '') // 移除末尾的逗号
    };
  }

  if (message.match(/查看.*技能授权/i)) {
    return { action: 'list-licenses' };
  }

  const updateMatch = message.match(/更新\s*(\w+)\s*技能/i);
  if (updateMatch) {
    return {
      action: 'update',
      skillName: updateMatch[1]
    };
  }

  const removeMatch = message.match(/移除\s*(\w+)\s*技能/i);
  if (removeMatch) {
    return {
      action: 'remove',
      skillName: removeMatch[1]
    };
  }

  return { action: 'unknown' };
}

function cacheLicense(skillName, license) {
  const licensesDir = path.join(os.homedir(), '.openclaw', 'licenses');

  if (!fs.existsSync(licensesDir)) {
    fs.mkdirSync(licensesDir, { recursive: true, mode: 0o700 });
  }

  const licensePath = path.join(licensesDir, `${skillName}.json`);
  assertSafePath(licensePath, LICENSES_BASE);

  const cacheData = {
    skill: skillName,
    code: license.code,
    activatedAt: Date.now(),
    expiresAt: license.expiresAt,
    type: license.type,
    tier: license.tier || 'standard'
  };

  fs.writeFileSync(licensePath, JSON.stringify(cacheData, null, 2), { mode: 0o600 });

  console.log(`✓ 授权信息已缓存到: ${licensePath}`);
}

/**
 * 通过API验证授权码
 */
async function verifyLicenseCode(skillName, code) {
  console.log(`\n🌐 正在连接验证服务器...`);
  console.log(`   API: ${API_CONFIG.url}\n`);

  try {
    const response = await makeApiRequest({
      action: 'activate',
      skillName,
      code,
      userId: os.userInfo().username
    });

    if (response.valid && response.activated) {
      console.log('✓ 授权验证成功\n');
      return {
        valid: true,
        license: response.license,
        downloadUrl: response.downloadUrl  // 保存 downloadUrl
      };
    } else {
      return {
        valid: false,
        error: response.error || '验证失败',
        message: response.message
      };
    }
  } catch (error) {
    console.error('⚠️  API请求失败:', error.message);

    return {
      valid: false,
      error: 'API连接失败',
      message: `无法连接到验证服务器。\n\n请检查：
1. 网络连接是否正常
2. API服务器是否在线
3. 或联系技能提供者

错误详情: ${error.message}`
    };
  }
}

async function downloadSkillFromAPI(downloadUrl) {
  const tmpFile = path.join(os.tmpdir(), `skill-${Date.now()}.tar.gz`);

  console.log(`\n📥 正在下载技能包...`);
  console.log(`   临时文件: ${tmpFile}\n`);

  try {
    // 构建完整的下载URL - 使用独立的 download API
    // downloadUrl 格式: /api/download?token=xxx
    const fullUrl = `${API_CONFIG.downloadUrl}${downloadUrl}`;

    console.log('🌐 正在连接下载服务器...');
    console.log(`   URL: ${fullUrl.substring(0, 80)}...`);

    // 使用 node https 下载以获取响应头（用于 hash 校验）
    const { expectedHash } = await new Promise((resolve, reject) => {
      const doRequest = (reqUrl, redirects) => {
        if (redirects > MAX_REDIRECTS) return reject(new Error('重定向次数过多'));
        const parsedUrl = new URL(reqUrl);
        if (parsedUrl.protocol !== 'https:') {
          return reject(new Error('安全策略：仅支持 HTTPS 连接，拒绝 HTTP 重定向'));
        }
        https.get(reqUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return doRequest(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          const hash = res.headers['x-package-hash'] || null;
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            fs.writeFileSync(tmpFile, Buffer.concat(chunks));
            resolve({ expectedHash: hash });
          });
          res.on('error', reject);
        }).on('error', reject);
      };
      doRequest(fullUrl, 0);
    });

    if (!fs.existsSync(tmpFile)) {
      throw new Error('下载失败: 临时文件不存在');
    }

    const stats = fs.statSync(tmpFile);
    if (stats.size === 0) {
      throw new Error('下载失败: 文件大小为0');
    }

    // 检查是否是错误响应（JSON格式）
    if (stats.size < MIN_VALID_PACKAGE_SIZE) {
      const content = fs.readFileSync(tmpFile, 'utf8');
      try {
        const json = JSON.parse(content);
        if (json.error) {
          throw new Error(`下载失败: ${json.error}`);
        }
      } catch (e) {
        // 不是JSON，继续
      }
    }

    // SHA256 完整性校验
    if (expectedHash) {
      const fileBuffer = fs.readFileSync(tmpFile);
      const actualHash = 'sha256:' + crypto.createHash('sha256').update(fileBuffer).digest('hex');
      if (actualHash !== expectedHash) {
        fs.unlinkSync(tmpFile);
        throw new Error(`完整性校验失败!\n  期望: ${expectedHash}\n  实际: ${actualHash}`);
      }
      console.log('🔒 SHA256 完整性校验通过');
    } else {
      console.log('⚠️  服务端未提供哈希，跳过完整性校验');
    }

    console.log(`✓ 技能包下载成功 (${stats.size} bytes)\n`);

    return tmpFile;
  } catch (error) {
    throw new Error(`技能包下载失败: ${error.message}`);
  }
}

async function installSkill(tarGzFile, skillName) {
  const skillsDir = path.join(os.homedir(), '.openclaw', 'skills');
  const targetDir = path.join(skillsDir, skillName);
  assertSafePath(targetDir, SKILLS_BASE);

  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  console.log(`\n📦 正在安装技能...`);
  console.log(`   源文件: ${tarGzFile}`);
  console.log(`   目标目录: ${targetDir}\n`);

  if (fs.existsSync(targetDir)) {
    console.log('   ⚠️  技能已存在，将覆盖安装');
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  // 创建目标目录
  fs.mkdirSync(targetDir, { recursive: true });

  // 使用 Node.js tar 模块解压（跨平台兼容）
  try {
    await tar.x({
      file: tarGzFile,
      cwd: targetDir,
      strip: 1
    });
    console.log('✓ 技能包解压成功\n');
  } catch (error) {
    throw new Error(`解压技能包失败: ${error.message}`);
  }

  const packageJson = path.join(targetDir, 'package.json');
  if (fs.existsSync(packageJson)) {
    console.log('📚 正在安装依赖...');
    execFileSync('npm', ['install', '--registry', 'https://registry.npmmirror.com'], {
      cwd: targetDir,
      stdio: 'inherit'
    });
  }

  console.log('\n✓ 技能安装完成\n');

  try {
    fs.unlinkSync(tarGzFile);
    console.log('✓ 临时文件已清理\n');
  } catch (error) {
    console.warn(`⚠️  清理临时文件失败: ${error.message}`);
  }

  return targetDir;
}

function listAuthorizedSkills() {
  const licensesDir = path.join(os.homedir(), '.openclaw', 'licenses');

  if (!fs.existsSync(licensesDir)) {
    return [];
  }

  const files = fs.readdirSync(licensesDir).filter(f => f.endsWith('.json'));

  return files.map(file => {
    const licensePath = path.join(licensesDir, file);
    const license = JSON.parse(fs.readFileSync(licensePath, 'utf8'));

    const now = Date.now();
    const daysRemaining = license.expiresAt ?
      Math.floor((license.expiresAt - now) / MS_PER_DAY) :
      Infinity;

    return {
      skillName: license.skill,
      type: license.type,
      daysRemaining,
      status: (license.expiresAt && license.expiresAt < now) ? '已过期' : '✓ 有效'
    };
  });
}

/**
 * 检查指定技能的本地授权缓存是否仍然有效（未过期）
 * @returns {{ valid: boolean, license?: object, error?: string }}
 */
function checkCachedLicense(skillName) {
  const licensePath = path.join(os.homedir(), '.openclaw', 'licenses', `${skillName}.json`);
  assertSafePath(licensePath, LICENSES_BASE);

  if (!fs.existsSync(licensePath)) {
    return { valid: false, error: '未找到授权信息' };
  }

  const license = JSON.parse(fs.readFileSync(licensePath, 'utf8'));

  if (license.expiresAt && license.expiresAt < Date.now()) {
    return { valid: false, error: '授权已过期', license };
  }

  return { valid: true, license };
}

// ======================================
// 🤖 Agent主函数
// ======================================

async function skillInstallerAgent(context) {
  const { message, tools, previousContext } = context;

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║     Skill Installer - JarvisMolt技能安装器        ║');
  console.log('║            (在线API验证版本)                       ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  // 如果有 previousContext，说明是多轮对话的后续步骤
  let parsed;
  if (previousContext && previousContext.action) {
    parsed = previousContext;
  } else {
    parsed = parseUserInput(message);
  }

  try {
    switch (parsed.action) {
      case 'learn': {
        const { skillName, giteeUrl } = parsed;

        console.log(`🎯 目标技能: ${skillName}`);
        console.log(`🔗 Gitee仓库: ${giteeUrl}\n`);

        console.log('📋 步骤1: 请输入授权码...');

        // 强制要求输入授权码，不使用缓存
        console.log('\n🔐 该技能需要授权码才能使用');

        return {
          response: `该技能需要授权码才能使用。

请选择：
1. 输入授权码（已有授权码）
2. 购买授权（支付宝/微信支付）
3. 了解更多

请输入选项编号或直接输入授权码：`,
          needsInput: true,
          context: {
            action: 'learn-choice',
            skillName,
            giteeUrl
          }
        };
      }

      case 'learn-choice': {
        const { skillName, giteeUrl } = parsed;
        const input = message.trim();

        if (input === '2') {
          // 购买流程
          return {
            response: `📦 选择套餐：

1. 月卡 ¥29.9（30天）
2. 季卡 ¥79.9（90天，省 9.8）
3. 年卡 ¥199（365天，省 159.8）

请输入选项编号：`,
            needsInput: true,
            context: {
              action: 'purchase-plan',
              skillName,
              giteeUrl
            }
          };
        }

        if (input === '3') {
          return {
            response: `JarvisMolt 飞书技能 — 让 AI 成为你的飞书智能副驾

功能：智能搜索文档、知识库浏览、日程管理、AI 周报生成等。

了解更多：https://gitee.com/bobsharon/JarvisMolt-Skills

准备好了？回复 1 输入授权码，或回复 2 在线购买。`,
            needsInput: true,
            context: {
              action: 'learn-choice',
              skillName,
              giteeUrl
            }
          };
        }

        // 默认当作授权码输入（选项 1 或直接输入码）
        const licenseCode = (input === '1') ? '' : input;
        if (!licenseCode || licenseCode === '1') {
          return {
            response: `请输入授权码：（格式：XXXX-XXXX-XXXX-XXXX-XX）`,
            needsInput: true,
            context: {
              action: 'verify-license',
              skillName,
              giteeUrl
            }
          };
        }

        // 直接验证输入的码
        parsed.action = 'verify-license';
        // fall through to verify-license handled below
      }
      // falls through

      case 'verify-license': {
        const { skillName, giteeUrl } = parsed;
        const licenseCode = message.trim();

        console.log(`\n🔐 验证授权码: ${licenseCode}`);
        console.log(`   技能: ${skillName}\n`);

        const result = await verifyLicenseCode(skillName, licenseCode);

        if (!result.valid) {
          return {
            response: `❌ 授权码验证失败

错误: ${result.error}
${result.message || ''}

请检查：
1. 授权码是否正确（注意大小写）
2. 网络连接是否正常
3. 授权码是否已过期

如需帮助，请联系技能提供者。`,
            success: false
          };
        }

        console.log('✓ 授权码验证成功\n');

        cacheLicense(skillName, result.license);

        const tarGzFile = await downloadSkillFromAPI(result.downloadUrl);
        const targetDir = await installSkill(tarGzFile, skillName);

        return {
          response: `✅ ${skillName}技能学习完成！

授权验证成功，技能已安装。

安装位置: ${targetDir}

现在你可以使用该技能了！`,
          success: true
        };
      }

      case 'purchase-plan': {
        const { skillName, giteeUrl } = parsed;
        const planIndex = parseInt(message.trim(), 10);
        const plans = ['monthly', 'quarterly', 'yearly'];
        const planKey = plans[planIndex - 1];

        if (!planKey) {
          return {
            response: '无效的选项，请输入 1、2 或 3。',
            needsInput: true,
            context: { action: 'purchase-plan', skillName, giteeUrl }
          };
        }

        console.log(`\n💳 创建订单: ${planKey} for ${skillName}`);

        try {
          const resp = await makePaymentRequest('/create-order', { skill: skillName, plan: planKey });
          if (!resp.success) {
            return { response: `创建订单失败：${resp.error || '未知错误'}`, success: false };
          }

          console.log(`🔗 支付链接: ${resp.payUrl}`);

          // 尝试打开浏览器
          try {
            const { execFileSync } = require('child_process');
            if (process.platform === 'darwin') execFileSync('open', [resp.payUrl]);
            else if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', resp.payUrl]);
          } catch (_) { /* ignore */ }

          console.log('\n⏳ 等待支付完成...');

          // 轮询
          const orderId = resp.orderId;
          const sleep = ms => new Promise(r => setTimeout(r, ms));

          for (let i = 0; i < 90; i++) {
            await sleep(2000);
            try {
              const poll = await makePaymentRequest('/poll-order', { orderId });
              if (poll.status === 'paid' && poll.licenseCode) {
                console.log(`✅ 支付成功，授权码: ${poll.licenseCode}`);

                // 自动激活
                const activateResult = await verifyLicenseCode(skillName, poll.licenseCode);
                if (activateResult.valid) {
                  cacheLicense(skillName, activateResult.license);
                  const tarGzFile = await downloadSkillFromAPI(activateResult.downloadUrl);
                  const targetDir = await installSkill(tarGzFile, skillName);

                  return {
                    response: `✅ 支付成功！授权码：${poll.licenseCode}

✅ 激活成功，技能已安装。

安装位置: ${targetDir}

现在你可以使用该技能了！`,
                    success: true
                  };
                }

                return {
                  response: `✅ 支付成功！授权码：${poll.licenseCode}\n\n⚠️ 自动激活失败，请手动输入授权码重试。`,
                  success: false
                };
              }
              if (poll.status === 'failed') {
                return { response: '支付失败，请重试。', success: false };
              }
            } catch (_) { /* continue polling */ }
          }

          return {
            response: `⏰ 等待支付超时。\n\n如果您已完成支付，请使用授权码手动激活。\n订单号：${orderId}`,
            success: false
          };
        } catch (err) {
          return { response: `创建订单出错：${err.message}`, success: false };
        }
      }

      case 'list-licenses': {
        const skills = listAuthorizedSkills();

        if (skills.length === 0) {
          return {
            response: '您还没有授权任何技能。\n\n使用"从 <Gitee-URL> 学习XX技能"来学习新技能。'
          };
        }

        let response = '已授权技能列表：\n\n';
        response += '┌─────────────┬──────────────────────┬──────────┬──────────────┐\n';
        response += '│ 技能名称     │ 授权类型              │ 剩余天数  │ 状态         │\n';
        response += '├─────────────┼──────────────────────┼──────────┼──────────────┤\n';

        skills.forEach(skill => {
          const days = skill.daysRemaining === Infinity ? '永久' : `${skill.daysRemaining}天`;
          response += `│ ${skill.skillName.padEnd(11)} │ ${skill.type.padEnd(20)} │ ${days.padEnd(8)} │ ${skill.status.padEnd(12)} │\n`;
        });

        response += '└─────────────┴──────────────────────┴──────────┴──────────────┘';

        return { response };
      }

      case 'update': {
        const { skillName } = parsed;
        const skillDir = path.join(os.homedir(), '.openclaw', 'skills', skillName);
        assertSafePath(skillDir, SKILLS_BASE);

        if (!fs.existsSync(skillDir)) {
          return {
            response: `技能"${skillName}"尚未安装，无法更新。\n\n请先使用"从 <Gitee-URL> 学习${skillName}技能"安装。`
          };
        }

        console.log(`🔄 准备更新技能: ${skillName}`);
        console.log('📋 请输入授权码以验证更新权限...\n');

        return {
          response: `正在准备更新"${skillName}"技能。\n\n请输入授权码以验证更新权限：（格式：XXXX-XXXX-XXXX-XXXX-XX）`,
          needsInput: true,
          context: {
            action: 'verify-update',
            skillName
          }
        };
      }

      case 'verify-update': {
        const { skillName } = parsed;
        const licenseCode = message.trim();
        const skillDir = path.join(os.homedir(), '.openclaw', 'skills', skillName);
        assertSafePath(skillDir, SKILLS_BASE);

        console.log(`\n🔐 验证授权码: ${licenseCode}`);
        console.log(`   技能: ${skillName}\n`);

        const result = await verifyLicenseCode(skillName, licenseCode);

        if (!result.valid) {
          return {
            response: `❌ 授权码验证失败\n\n错误: ${result.error}\n${result.message || ''}\n\n请检查授权码是否正确。`,
            success: false
          };
        }

        console.log('✓ 授权码验证成功，开始更新\n');

        // 保留授权缓存，删除旧版技能目录
        console.log(`🗑️  删除旧版本: ${skillDir}`);
        fs.rmSync(skillDir, { recursive: true, force: true });

        // 缓存新的授权信息
        cacheLicense(skillName, result.license);

        // 重新下载安装
        const tarGzFile = await downloadSkillFromAPI(result.downloadUrl);
        const targetDir = await installSkill(tarGzFile, skillName);

        return {
          response: `✅ ${skillName}技能更新完成！\n\n安装位置: ${targetDir}\n\n技能已更新到最新版本。`,
          success: true
        };
      }

      case 'remove': {
        const { skillName } = parsed;
        const skillDir = path.join(os.homedir(), '.openclaw', 'skills', skillName);
        assertSafePath(skillDir, SKILLS_BASE);

        if (!fs.existsSync(skillDir)) {
          return {
            response: `技能"${skillName}"未安装。`
          };
        }

        fs.rmSync(skillDir, { recursive: true, force: true });

        return {
          response: `✓ 技能"${skillName}"已移除。\n\n授权信息已保留，可以随时重新安装。`
        };
      }

      default: {
        return {
          response: `Skill Installer - 技能安装器 (在线API验证版本)

使用方法：
1. 学习技能：从 <Gitee-URL> 学习<技能名称>技能
   例如：从 https://gitee.com/bobsharon/JarvisMolt-Skills 学习lark技能

2. 查看授权：查看我的技能授权

3. 更新技能：更新<技能名称>技能

4. 移除技能：移除<技能名称>技能

需要帮助？请查看文档：~/.openclaw/skills/skill-installer/SKILL.md`
        };
      }
    }
  } catch (error) {
    console.error('\n❌ 错误:', error.message);

    return {
      response: `执行失败: ${error.message}\n\n如需帮助，请联系技能提供者。`,
      success: false,
      error: error.message
    };
  }
}

// ======================================
// 📤 导出
// ======================================

module.exports = skillInstallerAgent;
module.exports.checkCachedLicense = checkCachedLicense;

if (require.main === module) {
  const testMessage = process.argv[2] || '从 https://gitee.com/bobsharon/JarvisMolt-Skills 学习lark技能';

  skillInstallerAgent({
    message: testMessage,
    tools: {}
  }).then(result => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Agent返回结果:');
    console.log('═══════════════════════════════════════════════════\n');
    console.log(result.response);

    if (result.needsInput) {
      console.log('\n⚠️  需要用户输入');
      console.log('Context:', result.context);
    }
  }).catch(error => {
    console.error('Agent执行失败:', error);
    process.exit(1);
  });
}
