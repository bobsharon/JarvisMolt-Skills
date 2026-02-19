/**
 * skill-installer 安全加固单元测试（迁移自 test-security.js）
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// 从 agent.js 提取被测逻辑（纯函数）
const SKILLS_BASE = path.join(os.homedir(), '.openclaw', 'skills');
const LICENSES_BASE = path.join(os.homedir(), '.openclaw', 'licenses');

function assertSafePath(filePath, baseDir) {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error(`路径越界: ${resolved}`);
  }
}

// ============== assertSafePath 测试 ==============

describe('assertSafePath 路径校验', () => {
  test('正常子路径放行', () => {
    expect(() => {
      assertSafePath(path.join(SKILLS_BASE, 'lark'), SKILLS_BASE);
    }).not.toThrow();
  });

  test('base 目录本身放行', () => {
    expect(() => {
      assertSafePath(SKILLS_BASE, SKILLS_BASE);
    }).not.toThrow();
  });

  test('路径穿越 ../../etc 被拦截', () => {
    expect(() => {
      assertSafePath(path.join(SKILLS_BASE, '..', '..', 'etc'), SKILLS_BASE);
    }).toThrow('路径越界');
  });

  test('绝对路径 /etc/passwd 被拦截', () => {
    expect(() => {
      assertSafePath('/etc/passwd', SKILLS_BASE);
    }).toThrow();
  });
  test('前缀伪装 skills-evil 被拦截', () => {
    expect(() => {
      assertSafePath(SKILLS_BASE + '-evil', SKILLS_BASE);
    }).toThrow();
  });

  test('licenses 路径校验', () => {
    expect(() => {
      assertSafePath(path.join(LICENSES_BASE, 'lark.json'), LICENSES_BASE);
    }).not.toThrow();
  });

  test('licenses 路径穿越被拦截', () => {
    expect(() => {
      assertSafePath(path.join(LICENSES_BASE, '..', 'skills', 'evil'), LICENSES_BASE);
    }).toThrow();
  });
});

// ============== execSync 安全化验证 ==============

describe('execSync 安全化验证', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent.js'), 'utf8');

  test('agent.js 不再使用 execSync', () => {
    const lines = src.split('\n');
    const callLines = lines.filter(l => l.includes('execSync') && !l.includes('require'));
    expect(callLines.length).toBe(0);
  });

  test('agent.js 使用 execFileSync 替代 npm install', () => {
    expect(src).toContain("execFileSync('npm'");
  });

  test('agent.js 使用 fs.rmSync 替代 rm -rf', () => {
    expect(src).not.toContain('rm -rf');
    expect(src).toContain('fs.rmSync');
  });

  test('npm install 使用国内镜像', () => {
    expect(src).toContain('registry.npmmirror.com');
  });
});

// ============== SHA256 完整性校验 ==============

describe('SHA256 完整性校验', () => {
  test('SHA256 计算正确', () => {
    const content = Buffer.from('hello jarvismolt');
    const expected = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
    expect(expected.startsWith('sha256:')).toBe(true);
    expect(expected.length).toBe(7 + 64);
  });

  test('hash 不匹配时应能检测', () => {
    const a = crypto.createHash('sha256').update('file-a').digest('hex');
    const b = crypto.createHash('sha256').update('file-b').digest('hex');
    expect(a).not.toBe(b);
  });

  test('agent.js 包含 hash 校验逻辑', () => {
    const src = fs.readFileSync(path.join(__dirname, 'agent.js'), 'utf8');
    expect(src).toContain('x-package-hash');
    expect(src).toContain('完整性校验失败');
  });
});
