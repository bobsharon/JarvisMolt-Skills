/**
 * skill-installer agent.js 集成测试
 * 通过 skillInstallerAgent 间接测试内部函数
 * mock https + fs 拦截网络和文件操作
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');

const LICENSES_BASE = path.join(os.homedir(), '.openclaw', 'licenses');
const SKILLS_BASE = path.join(os.homedir(), '.openclaw', 'skills');

const skillInstallerAgent = require('./agent');

// Helper: mock https.request to return a given response
function mockHttps(responseBody, statusCode = 200) {
  return jest.spyOn(https, 'request').mockImplementation((options, callback) => {
    const mockRes = {
      statusCode,
      headers: {},
      on: jest.fn((event, handler) => {
        if (event === 'data') handler(JSON.stringify(responseBody));
        if (event === 'end') handler();
      })
    };
    if (callback) callback(mockRes);
    return {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    };
  });
}

describe('skillInstallerAgent', () => {
  afterEach(() => jest.restoreAllMocks());

  // ============== 基本命令解析 ==============

  test('未知命令返回帮助信息', async () => {
    const result = await skillInstallerAgent({ message: '你好', tools: {} });
    expect(result.response).toContain('Skill Installer');
    expect(result.response).toContain('使用方法');
  });

  test('learn 命令返回 needsInput 要求授权码', async () => {
    const result = await skillInstallerAgent({
      message: '从 https://gitee.com/test/repo 学习lark技能',
      tools: {}
    });
    expect(result.needsInput).toBe(true);
    expect(result.context.action).toBe('verify-license');
    expect(result.context.skillName).toBe('lark');
  });
  // ============== listAuthorizedSkills ==============

  describe('查看技能授权', () => {
    test('有 license 文件时列出', async () => {
      const licensePath = path.join(LICENSES_BASE, 'testskill.json');
      fs.mkdirSync(LICENSES_BASE, { recursive: true });
      fs.writeFileSync(licensePath, JSON.stringify({
        skill: 'testskill',
        code: 'TEST-CODE',
        activatedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        type: 'standard',
        tier: 'standard'
      }));

      try {
        const result = await skillInstallerAgent({ message: '查看我的技能授权', tools: {} });
        expect(result.response).toContain('testskill');
      } finally {
        try { fs.unlinkSync(licensePath); } catch {}
      }
    });

    test('无授权时提示', async () => {
      const result = await skillInstallerAgent({ message: '查看我的技能授权', tools: {} });
      expect(result.response).toBeDefined();
    });
  });

  // ============== verifyLicenseCode (via previousContext) ==============

  describe('verify-license 流程', () => {
    test('验证成功 + 下载失败（跳过 tar）', async () => {
      let callCount = 0;
      jest.spyOn(https, 'request').mockImplementation((options, callback) => {
        callCount++;
        let responseBody;

        if (callCount === 1) {
          // verifyLicenseCode — makeApiRequest response
          responseBody = {
            valid: true,
            activated: true,
            license: {
              code: 'TEST-LICENSE',
              expiresAt: Date.now() + 86400000,
              type: 'standard',
              tier: 'standard'
            },
            downloadUrl: '/api/download?token=test123'
          };
        } else {
          // downloadSkillFromAPI — return error to avoid tar extraction
          responseBody = { success: false, error: 'test: skip download' };
        }

        const mockRes = {
          statusCode: 200,
          headers: {},
          on: jest.fn((event, handler) => {
            if (event === 'data') handler(JSON.stringify(responseBody));
            if (event === 'end') handler();
          })
        };
        if (callback) callback(mockRes);
        return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
      });

      const result = await skillInstallerAgent({
        message: 'TEST-1234-5678-ABCD-EF',
        tools: {},
        previousContext: {
          action: 'verify-license',
          skillName: 'lark',
          giteeUrl: 'https://gitee.com/test/repo'
        }
      });
      // Verification was attempted
      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    test('验证失败返回错误信息', async () => {
      mockHttps({ success: false, valid: false, error: '授权码无效' });

      const result = await skillInstallerAgent({
        message: 'INVALID-CODE',
        tools: {},
        previousContext: {
          action: 'verify-license',
          skillName: 'lark',
          giteeUrl: 'https://gitee.com/test/repo'
        }
      });
      expect(result.response).toContain('验证失败');
      expect(result.success).toBe(false);
    });

    test('网络错误处理', async () => {
      jest.spyOn(https, 'request').mockImplementation((options, callback) => {
        return {
          on: jest.fn((event, handler) => {
            if (event === 'error') setTimeout(() => handler(new Error('ECONNREFUSED')), 0);
          }),
          write: jest.fn(),
          end: jest.fn()
        };
      });

      const result = await skillInstallerAgent({
        message: 'NET-ERROR-CODE',
        tools: {},
        previousContext: {
          action: 'verify-license',
          skillName: 'lark',
          giteeUrl: 'https://gitee.com/test/repo'
        }
      });
      expect(result.response).toContain('失败');
    });
  });

  // ============== 更新技能 ==============

  test('更新不存在的技能', async () => {
    const result = await skillInstallerAgent({
      message: '更新nonexistent技能',
      tools: {}
    });
    expect(result.response).toContain('尚未安装');
  });

  // ============== 移除技能 ==============

  test('移除不存在的技能', async () => {
    const result = await skillInstallerAgent({
      message: '移除fakeskill技能',
      tools: {}
    });
    expect(result.response).toContain('未安装');
  });

  test('移除已安装的技能', async () => {
    const skillName = 'removabletest';
    const skillDir = path.join(SKILLS_BASE, skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'agent.js'), '// test');

    try {
      const result = await skillInstallerAgent({
        message: `移除${skillName}技能`,
        tools: {}
      });
      expect(result.response).toContain('已移除');
      expect(fs.existsSync(skillDir)).toBe(false);
    } finally {
      try { fs.rmSync(skillDir, { recursive: true, force: true }); } catch {}
    }
  });
});
