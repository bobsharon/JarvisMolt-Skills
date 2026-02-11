#!/usr/bin/env node

/**
 * Skill Installer Agent - API版本
 *
 * JarvisMolt技能市场安装器 - 通过在线API验证授权
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const https = require('https');

// ======================================
// 🌐 API配置
// ======================================

const API_CONFIG = {
  // 阿里云函数计算 - Verify API
  url: process.env.JARVISMOLT_API_URL || 'https://verify-ffigtcrsdv.cn-shanghai.fcapp.run',
  // 阿里云函数计算 - Download API
  downloadUrl: process.env.JARVISMOLT_DOWNLOAD_URL || 'https://download-vjckfoskbb.cn-shanghai.fcapp.run',
  // API密钥
  apiKey: process.env.JARVISMOLT_API_KEY || 'sk-jarvismolt-2026-1367b8bbeac1803e'
};

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

// ======================================
// 🔧 工具函数
// ======================================

function parseUserInput(message) {
  message = message.trim();

  // 支持格式1: "学习 lark 技能 从 https://..."
  const learnMatch1 = message.match(/学习\s*(\w+)\s*技能\s*从\s*(https?:\/\/[^\s,]+)/i);
  if (learnMatch1) {
    return {
      action: 'learn',
      skillName: learnMatch1[1],
      githubUrl: learnMatch1[2]
    };
  }

  // 支持格式2: "从 https://...，学习飞书技能" 或 "从 https://... 学习飞书技能"
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
      githubUrl: learnMatch2[1].replace(/[,，]+$/, '') // 移除末尾的逗号
    };
  }

  const installMatch = message.match(/安装\s*技能库\s*从\s*(https?:\/\/[^\s,]+)/i);
  if (installMatch) {
    return {
      action: 'install-all',
      githubUrl: installMatch[1]
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

function checkCachedLicense(skillName) {
  const licensePath = path.join(os.homedir(), '.openclaw', 'licenses', `${skillName}.json`);

  if (!fs.existsSync(licensePath)) {
    return null;
  }

  try {
    const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));

    if (licenseData.expiresAt && licenseData.expiresAt < Date.now()) {
      return { expired: true, ...licenseData };
    }

    return licenseData;
  } catch (error) {
    console.error(`读取授权缓存失败: ${error.message}`);
    return null;
  }
}

function cacheLicense(skillName, license) {
  const licensesDir = path.join(os.homedir(), '.openclaw', 'licenses');

  if (!fs.existsSync(licensesDir)) {
    fs.mkdirSync(licensesDir, { recursive: true, mode: 0o700 });
  }

  const licensePath = path.join(licensesDir, `${skillName}.json`);

  const cacheData = {
    skill: skillName,
    code: license.code,
    activatedAt: Date.now(),
    expiresAt: license.expiresAt,
    type: license.type
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

    execSync(`curl -L -s "${fullUrl}" -o "${tmpFile}"`, {
      timeout: 60000
    });

    if (!fs.existsSync(tmpFile)) {
      throw new Error('下载失败: 临时文件不存在');
    }

    const stats = fs.statSync(tmpFile);
    if (stats.size === 0) {
      throw new Error('下载失败: 文件大小为0');
    }

    // 检查是否是错误响应（JSON格式）
    if (stats.size < 1000) {
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

    console.log(`✓ 技能包下载成功 (${stats.size} bytes)\n`);

    return tmpFile;
  } catch (error) {
    throw new Error(`技能包下载失败: ${error.message}`);
  }
}

async function installSkill(tarGzFile, skillName) {
  const skillsDir = path.join(os.homedir(), '.openclaw', 'skills');
  const targetDir = path.join(skillsDir, skillName);

  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  console.log(`\n📦 正在安装技能...`);
  console.log(`   源文件: ${tarGzFile}`);
  console.log(`   目标目录: ${targetDir}\n`);

  if (fs.existsSync(targetDir)) {
    console.log('   ⚠️  技能已存在，将覆盖安装');
    execSync(`rm -rf "${targetDir}"`);
  }

  // 解压 tar.gz 到目标目录
  try {
    execSync(`mkdir -p "${targetDir}" && tar -xzf "${tarGzFile}" -C "${targetDir}"`, {
      stdio: 'inherit'
    });
  } catch (error) {
    throw new Error(`解压技能包失败: ${error.message}`);
  }

  const packageJson = path.join(targetDir, 'package.json');
  if (fs.existsSync(packageJson)) {
    console.log('\n📚 正在安装依赖...');
    execSync('npm install', {
      cwd: targetDir,
      stdio: 'inherit'
    });
  }

  console.log('\n✓ 技能安装完成\n');

  try {
    execSync(`rm -f "${tarGzFile}"`);
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
      Math.floor((license.expiresAt - now) / (24 * 60 * 60 * 1000)) :
      Infinity;

    return {
      skillName: license.skill,
      type: license.type,
      daysRemaining,
      status: (license.expiresAt && license.expiresAt < now) ? '已过期' : '✓ 有效'
    };
  });
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
        const { skillName, githubUrl } = parsed;

        console.log(`🎯 目标技能: ${skillName}`);
        console.log(`🔗 GitHub仓库: ${githubUrl}\n`);

        console.log('📋 步骤1: 检查授权...');
        let license = checkCachedLicense(skillName);

        if (license) {
          if (license.expired) {
            console.log('   ⚠️  授权已过期，需要重新授权');
            license = null;
          } else {
            console.log(`   ✓ 找到有效授权 (${license.type})\n`);
          }
        }

        if (!license) {
          console.log('\n🔐 该技能需要授权码才能使用');
          console.log('   请输入授权码（从技能提供者处获取）:\n');

          return {
            response: `该技能需要授权码才能使用。

请输入授权码：（例如：ABCD-EFGH-JKLM-NPQR-XY）

获取授权码请联系技能提供者。`,
            needsInput: true,
            context: {
              action: 'verify-license',
              skillName,
              githubUrl
            }
          };
        }

        // 即使有缓存的授权，也需要重新验证以获取临时下载链接
        console.log('📥 步骤2: 获取下载链接...');
        const verifyResult = await verifyLicenseCode(skillName, license.code);

        if (!verifyResult.valid) {
          return {
            response: `❌ 获取下载链接失败\n\n错误: ${verifyResult.error}\n${verifyResult.message || ''}\n\n请重新授权或联系技能提供者。`,
            success: false
          };
        }

        console.log('📥 步骤3: 下载技能包...');
        const tarGzFile = await downloadSkillFromAPI(verifyResult.downloadUrl);

        console.log('📦 步骤4: 安装技能...');
        const targetDir = await installSkill(tarGzFile, skillName);

        console.log('╔═══════════════════════════════════════════════════╗');
        console.log('║              ✅ 技能学习完成！                     ║');
        console.log('╚═══════════════════════════════════════════════════╝\n');

        return {
          response: `✅ ${skillName}技能学习完成！

安装位置: ${targetDir}

现在你可以使用该技能了。例如：
- 小红书搜索 电商运营
- 小红书爬取 直播带货 --数量=50

详细文档: ${path.join(targetDir, 'SKILL.md')}`,
          success: true
        };
      }

      case 'verify-license': {
        const { skillName, githubUrl } = parsed;
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

      case 'list-licenses': {
        const skills = listAuthorizedSkills();

        if (skills.length === 0) {
          return {
            response: '您还没有授权任何技能。\n\n使用"学习XX技能 从 URL"来学习新技能。'
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

      case 'remove': {
        const { skillName } = parsed;
        const skillDir = path.join(os.homedir(), '.openclaw', 'skills', skillName);

        if (!fs.existsSync(skillDir)) {
          return {
            response: `技能"${skillName}"未安装。`
          };
        }

        execSync(`rm -rf "${skillDir}"`);

        return {
          response: `✓ 技能"${skillName}"已移除。\n\n授权信息已保留，可以随时重新安装。`
        };
      }

      default: {
        return {
          response: `Skill Installer - 技能安装器 (在线API验证版本)

使用方法：
1. 学习技能：学习<技能名称>技能 从 <GitHub-URL>
   例如：学习lark技能 从 https://github.com/YOUR_USERNAME/JarvisMolt-Skills

2. 查看授权：查看我的技能授权

3. 移除技能：移除<技能名称>技能

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

if (require.main === module) {
  const testMessage = process.argv[2] || '学习lark技能 从 https://github.com/YOUR_USERNAME/JarvisMolt-Skills';

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
