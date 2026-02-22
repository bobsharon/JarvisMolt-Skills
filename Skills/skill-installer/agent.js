#!/usr/bin/env node

/**
 * Skill Installer CLI — JarvisMolt 技能安装器
 *
 * 用法: node agent.js <command> [args]
 *   verify <skillName> <licenseCode>  — 验证授权码
 *   install <skillName> <downloadUrl> — 下载安装技能
 *   list                              — 查看已授权技能
 *   remove <skillName>                — 移除技能
 *   check <skillName>                 — 检查本地授权缓存
 *
 * stdout = JSON 结果，stderr = 进度日志
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const tar = require('tar');

// ======================================
// Constants
// ======================================

const MAX_REDIRECTS = 5;
const MIN_VALID_PACKAGE_SIZE = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOCKOUT_MAX_FAILURES = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ======================================
// API 配置
// ======================================

// Security: API credentials and endpoints MUST be provided via environment variables.
// Never hardcode API keys or server URLs in distributed packages.
// Set these in ~/.openclaw/env or via the installer bootstrap process.

function loadApiConfig() {
  const url = process.env.JARVISMOLT_API_URL;
  const downloadUrl = process.env.JARVISMOLT_DOWNLOAD_URL;
  const apiKey = process.env.JARVISMOLT_API_KEY;

  const missing = [];
  if (!url) missing.push('JARVISMOLT_API_URL');
  if (!downloadUrl) missing.push('JARVISMOLT_DOWNLOAD_URL');
  if (!apiKey) missing.push('JARVISMOLT_API_KEY');

  if (missing.length > 0) {
    throw new Error(
      `缺少必要的环境变量: ${missing.join(', ')}。` +
      `请运行 openclaw skill-installer setup 或手动配置 ~/.openclaw/env`
    );
  }

  return { url, downloadUrl, apiKey };
}

// Lazy-loaded: only accessed when API calls are actually made
let _apiConfig = null;
function getApiConfig() {
  if (!_apiConfig) _apiConfig = loadApiConfig();
  return _apiConfig;
}

// ======================================
// 路径安全校验
// ======================================

const SKILLS_BASE = path.join(os.homedir(), '.openclaw', 'skills');
const LICENSES_BASE = path.join(os.homedir(), '.openclaw', 'licenses');
const LOCKOUT_FILE = path.join(LICENSES_BASE, '.rate-limit-lockout.json');

const VALID_SKILL_NAME = /^[a-z][a-z0-9-]{1,30}$/;

function validateSkillName(name) {
  if (!name || !VALID_SKILL_NAME.test(name)) {
    throw new Error(`无效的技能名: ${name}（仅允许小写字母、数字、连字符，2-31 字符）`);
  }
  if (name === 'skill-installer') {
    throw new Error('不能操作安装器自身');
  }
}

function assertSafePath(filePath, baseDir) {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error(`路径越界: ${resolved}`);
  }
}

// ======================================
// 验证频率限制 (Rate Limiting)
// ======================================

function readLockout() {
  try {
    if (fs.existsSync(LOCKOUT_FILE)) {
      return JSON.parse(fs.readFileSync(LOCKOUT_FILE, 'utf8'));
    }
  } catch (_) {}
  return { failures: 0, lockedUntil: null };
}

function writeLockout(data) {
  if (!fs.existsSync(LICENSES_BASE)) {
    fs.mkdirSync(LICENSES_BASE, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(LOCKOUT_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function checkLockout() {
  const lockout = readLockout();

  if (lockout.lockedUntil) {
    const lockedUntil = new Date(lockout.lockedUntil);
    const now = new Date();
    if (lockedUntil > now) {
      const remainMs = lockedUntil.getTime() - now.getTime();
      const remainMin = Math.ceil(remainMs / 60000);
      return { locked: true, error: `验证失败次数过多，请在 ${remainMin} 分钟后重试` };
    }
    // Lock expired — reset
    writeLockout({ failures: 0, lockedUntil: null });
    return { locked: false };
  }

  if (lockout.failures >= LOCKOUT_MAX_FAILURES) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    writeLockout({ failures: lockout.failures, lockedUntil });
    const remainMin = Math.ceil(LOCKOUT_DURATION_MS / 60000);
    return { locked: true, error: `验证失败次数过多，请在 ${remainMin} 分钟后重试` };
  }

  return { locked: false };
}

function recordVerifyFailure() {
  const lockout = readLockout();
  lockout.failures += 1;
  writeLockout(lockout);
}

function resetLockout() {
  writeLockout({ failures: 0, lockedUntil: null });
}

// ======================================
// HTTP 请求
// ======================================

function makeApiRequest(data) {
  return new Promise((resolve, reject) => {
    const config = getApiConfig();
    const url = new URL(config.url);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
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

// ======================================
// 核心功能函数
// ======================================

function parseUserInput(message) {
  message = message.trim();

  const learnMatch = message.match(/从\s*(https?:\/\/[^\s,]+)[,，]?\s*学习\s*(.+?)\s*技能/i);
  if (learnMatch) {
    const skillNameChinese = learnMatch[2].trim();
    const skillNameMap = { '飞书': 'lark', '飞书技能': 'lark' };
    const skillName = skillNameMap[skillNameChinese] || skillNameChinese;
    return { action: 'learn', skillName, giteeUrl: learnMatch[1].replace(/[,，]+$/, '') };
  }

  if (message.match(/查看.*技能授权/i)) {
    return { action: 'list-licenses' };
  }

  const updateMatch = message.match(/更新\s*(\w+)\s*技能/i);
  if (updateMatch) {
    return { action: 'update', skillName: updateMatch[1] };
  }

  const removeMatch = message.match(/移除\s*(\w+)\s*技能/i);
  if (removeMatch) {
    return { action: 'remove', skillName: removeMatch[1] };
  }

  return { action: 'unknown' };
}

function cacheLicense(skillName, license, downloadUrl) {
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
    tier: license.tier || 'standard',
    downloadUrl: downloadUrl || null
  };
  fs.writeFileSync(licensePath, JSON.stringify(cacheData, null, 2), { mode: 0o600 });
  console.error(`✓ 授权信息已缓存到: ${licensePath}`);
}

async function verifyLicenseCode(skillName, code) {
  console.error('正在连接验证服务器...');
  try {
    const response = await makeApiRequest({
      action: 'activate',
      skillName,
      code,
      userId: os.userInfo().username
    });

    if (response.valid && response.activated) {
      console.error('✓ 授权验证成功');
      return { valid: true, license: response.license, downloadUrl: response.downloadUrl };
    } else {
      return { valid: false, error: response.error || '验证失败', message: response.message };
    }
  } catch (error) {
    return { valid: false, error: 'API连接失败', message: error.message };
  }
}

async function downloadSkillFromAPI(downloadUrl) {
  const tmpFile = path.join(os.tmpdir(), `skill-${Date.now()}.tar.gz`);
  console.error('正在下载技能包...');

  const config = getApiConfig();
  const fullUrl = new URL(downloadUrl, config.downloadUrl).href;
  const parsedFull = new URL(fullUrl);
  const allowedHost = new URL(config.downloadUrl).hostname;
  if (parsedFull.hostname !== allowedHost) {
    throw new Error(`安全策略：下载域名不匹配 (${parsedFull.hostname} != ${allowedHost})`);
  }
  console.error(`URL: ${fullUrl.substring(0, 80)}...`);

  const { expectedHash } = await new Promise((resolve, reject) => {
    const doRequest = (reqUrl, redirects) => {
      if (redirects > MAX_REDIRECTS) return reject(new Error('重定向次数过多'));
      const parsedUrl = new URL(reqUrl);
      if (parsedUrl.protocol !== 'https:') {
        return reject(new Error('安全策略：仅支持 HTTPS 连接'));
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

  /* PLACEHOLDER_DOWNLOAD_VALIDATION */

  if (!fs.existsSync(tmpFile)) throw new Error('下载失败: 临时文件不存在');

  const stats = fs.statSync(tmpFile);
  if (stats.size === 0) throw new Error('下载失败: 文件大小为0');

  if (stats.size < MIN_VALID_PACKAGE_SIZE) {
    const content = fs.readFileSync(tmpFile, 'utf8');
    try {
      const json = JSON.parse(content);
      if (json.error) throw new Error(`下载失败: ${json.error}`);
    } catch (e) {
      if (e.message.startsWith('下载失败:')) throw e;
    }
  }

  if (expectedHash) {
    const fileBuffer = fs.readFileSync(tmpFile);
    const actualHash = 'sha256:' + crypto.createHash('sha256').update(fileBuffer).digest('hex');
    if (actualHash !== expectedHash) {
      fs.unlinkSync(tmpFile);
      throw new Error(`完整性校验失败!\n  期望: ${expectedHash}\n  实际: ${actualHash}`);
    }
    console.error('✓ SHA256 完整性校验通过');
  }

  console.error(`✓ 技能包下载成功 (${stats.size} bytes)`);
  return tmpFile;
}

async function installSkill(tarGzFile, skillName) {
  const skillsDir = path.join(os.homedir(), '.openclaw', 'skills');
  const targetDir = path.join(skillsDir, skillName);
  assertSafePath(targetDir, SKILLS_BASE);

  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  console.error(`正在安装技能到 ${targetDir}...`);

  if (fs.existsSync(targetDir)) {
    console.error('技能已存在，将覆盖安装');
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  fs.mkdirSync(targetDir, { recursive: true });

  await tar.x({
    file: tarGzFile,
    cwd: targetDir,
    strip: 1,
    filter: (_path, entry) => {
      if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
        console.error(`⚠️ 安全策略：跳过链接文件 ${_path}`);
        return false;
      }
      return true;
    }
  });
  console.error('✓ 技能包解压成功');

  const packageJson = path.join(targetDir, 'package.json');
  if (fs.existsSync(packageJson)) {
    console.error('正在安装依赖...');
    execFileSync('npm', ['install', '--ignore-scripts', '--registry', 'https://registry.npmmirror.com'], {
      cwd: targetDir,
      stdio: ['ignore', 'ignore', 'inherit']
    });
  }

  try { fs.unlinkSync(tarGzFile); } catch (_) {}

  return targetDir;
}

/* PLACEHOLDER_LIST_CHECK_REMOVE */

function listAuthorizedSkills() {
  const licensesDir = path.join(os.homedir(), '.openclaw', 'licenses');
  if (!fs.existsSync(licensesDir)) return [];

  return fs.readdirSync(licensesDir).filter(f => f.endsWith('.json')).map(file => {
    const license = JSON.parse(fs.readFileSync(path.join(licensesDir, file), 'utf8'));
    const now = Date.now();
    const daysRemaining = license.expiresAt ? Math.floor((license.expiresAt - now) / MS_PER_DAY) : Infinity;
    return {
      skillName: license.skill,
      type: license.type,
      daysRemaining,
      status: (license.expiresAt && license.expiresAt < now) ? '已过期' : '有效'
    };
  });
}

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
  return { valid: true, license, downloadUrl: license.downloadUrl || null };
}

function removeSkill(skillName) {
  const skillDir = path.join(os.homedir(), '.openclaw', 'skills', skillName);
  assertSafePath(skillDir, SKILLS_BASE);

  if (!fs.existsSync(skillDir)) {
    return { success: false, error: `技能"${skillName}"未安装` };
  }
  fs.rmSync(skillDir, { recursive: true, force: true });
  return { success: true, message: `${skillName} 已移除` };
}

// ======================================
// Agent 回调接口（供集成调用）
// ======================================

async function skillInstallerAgent({ message, tools, previousContext }) {
  try {
    // 如果有上下文，处理多轮对话
    if (previousContext && previousContext.action === 'verify-license') {
      const code = message.trim();
      const { skillName, giteeUrl } = previousContext;
      const result = await verifyLicenseCode(skillName, code);

      if (!result.valid) {
        return { response: `验证失败: ${result.error || '授权码无效'}`, success: false };
      }

      cacheLicense(skillName, { ...result.license, code }, result.downloadUrl);

      if (result.downloadUrl) {
        try {
          const tmpFile = await downloadSkillFromAPI(result.downloadUrl);
          const installDir = await installSkill(tmpFile, skillName);
          return { response: `✓ ${skillName} 技能已安装到 ${installDir}`, success: true };
        } catch (err) {
          return { response: `授权成功，但下载失败: ${err.message}`, success: true };
        }
      }
      return { response: `✓ ${skillName} 授权验证成功`, success: true };
    }

    const parsed = parseUserInput(message);

    switch (parsed.action) {
      case 'learn':
        return {
          response: `请输入 ${parsed.skillName} 技能的授权码:`,
          needsInput: true,
          context: { action: 'verify-license', skillName: parsed.skillName, giteeUrl: parsed.giteeUrl }
        };

      case 'list-licenses': {
        const skills = listAuthorizedSkills();
        if (skills.length === 0) {
          return { response: '当前没有已授权的技能。' };
        }
        const lines = skills.map(s => `- ${s.skillName} (${s.status}, 剩余 ${s.daysRemaining} 天)`);
        return { response: `已授权技能:\n${lines.join('\n')}` };
      }

      case 'update': {
        const skillDir = path.join(os.homedir(), '.openclaw', 'skills', parsed.skillName);
        if (!fs.existsSync(skillDir)) {
          return { response: `${parsed.skillName} 尚未安装，无法更新。` };
        }
        const cached = checkCachedLicense(parsed.skillName);
        if (!cached.valid) {
          return { response: `${parsed.skillName} 授权无效: ${cached.error}` };
        }
        if (cached.downloadUrl) {
          const tmpFile = await downloadSkillFromAPI(cached.downloadUrl);
          const installDir = await installSkill(tmpFile, parsed.skillName);
          return { response: `✓ ${parsed.skillName} 已更新到 ${installDir}` };
        }
        return { response: `${parsed.skillName} 没有可用的下载地址。` };
      }

      case 'remove': {
        const result = removeSkill(parsed.skillName);
        if (result.success) {
          return { response: `✓ ${parsed.skillName} 已移除` };
        }
        return { response: `${parsed.skillName} 未安装` };
      }

      default:
        return {
          response: 'Skill Installer 使用方法:\n- 从 <URL> 学习 <技能名> 技能\n- 查看我的技能授权\n- 更新 <技能名> 技能\n- 移除 <技能名> 技能'
        };
    }
  } catch (error) {
    return { response: `操作失败: ${error.message}`, success: false };
  }
}

// ======================================
// CLI 入口
// ======================================

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'verify': {
        const [skillName, licenseCode] = args;
        if (!skillName || !licenseCode) {
          console.log(JSON.stringify({ valid: false, error: '用法: verify <skillName> <licenseCode>' }));
          break;
        }
        validateSkillName(skillName);

        // Rate-limit check
        const lockoutStatus = checkLockout();
        if (lockoutStatus.locked) {
          console.log(JSON.stringify({ success: false, error: lockoutStatus.error }));
          break;
        }

        const result = await verifyLicenseCode(skillName, licenseCode);
        if (result.valid && result.license) {
          resetLockout();
          cacheLicense(skillName, { ...result.license, code: licenseCode }, result.downloadUrl);
        } else {
          recordVerifyFailure();
        }
        console.log(JSON.stringify(result));
        break;
      }

      case 'install': {
        const [skillName, downloadUrl] = args;
        if (!skillName || !downloadUrl) {
          console.log(JSON.stringify({ success: false, error: '用法: install <skillName> <downloadUrl>' }));
          break;
        }
        validateSkillName(skillName);
        const tmpFile = await downloadSkillFromAPI(downloadUrl);
        const installDir = await installSkill(tmpFile, skillName);
        console.log(JSON.stringify({ success: true, installDir }));
        break;
      }

      case 'list': {
        console.log(JSON.stringify({ skills: listAuthorizedSkills() }));
        break;
      }

      case 'remove': {
        const [skillName] = args;
        if (!skillName) {
          console.log(JSON.stringify({ success: false, error: '用法: remove <skillName>' }));
          break;
        }
        validateSkillName(skillName);
        console.log(JSON.stringify(removeSkill(skillName)));
        break;
      }

      case 'check': {
        const [skillName] = args;
        if (!skillName) {
          console.log(JSON.stringify({ valid: false, error: '用法: check <skillName>' }));
          break;
        }
        validateSkillName(skillName);
        console.log(JSON.stringify(checkCachedLicense(skillName)));
        break;
      }

      default:
        console.log(JSON.stringify({ error: `未知命令: ${command || '(空)'}。可用命令: verify, install, list, remove, check` }));
    }
  } catch (error) {
    console.log(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = skillInstallerAgent;
module.exports.checkCachedLicense = checkCachedLicense;
module.exports.readLockout = readLockout;
module.exports.writeLockout = writeLockout;
module.exports.checkLockout = checkLockout;
module.exports.recordVerifyFailure = recordVerifyFailure;
module.exports.resetLockout = resetLockout;
module.exports.LOCKOUT_FILE = LOCKOUT_FILE;
module.exports.LOCKOUT_MAX_FAILURES = LOCKOUT_MAX_FAILURES;
module.exports.LOCKOUT_DURATION_MS = LOCKOUT_DURATION_MS;
