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

// ======================================
// API 配置
// ======================================

const _k = [115,107,45,106,97,114,118,105,115,109,111,108,116,45,50,48,50,54,45,49,51,54,55,98,56,98,98,101,97,99,49,56,48,51,101];

const API_CONFIG = {
  url: process.env.JARVISMOLT_API_URL || 'https://verify-ffigtcrsdv.cn-shanghai.fcapp.run',
  downloadUrl: process.env.JARVISMOLT_DOWNLOAD_URL || 'https://download-vjckfoskbb.cn-shanghai.fcapp.run',
  apiKey: process.env.JARVISMOLT_API_KEY || String.fromCharCode(..._k)
};

// ======================================
// 路径安全校验
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
// HTTP 请求
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

/* PLACEHOLDER_CORE_FUNCTIONS */

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

  const fullUrl = `${API_CONFIG.downloadUrl}${downloadUrl}`;
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

  await tar.x({ file: tarGzFile, cwd: targetDir, strip: 1 });
  console.error('✓ 技能包解压成功');

  const packageJson = path.join(targetDir, 'package.json');
  if (fs.existsSync(packageJson)) {
    console.error('正在安装依赖...');
    execFileSync('npm', ['install', '--registry', 'https://registry.npmmirror.com'], {
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
        const result = await verifyLicenseCode(skillName, licenseCode);
        if (result.valid && result.license) {
          cacheLicense(skillName, { ...result.license, code: licenseCode }, result.downloadUrl);
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
        console.log(JSON.stringify(removeSkill(skillName)));
        break;
      }

      case 'check': {
        const [skillName] = args;
        if (!skillName) {
          console.log(JSON.stringify({ valid: false, error: '用法: check <skillName>' }));
          break;
        }
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

main();
