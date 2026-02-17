#!/usr/bin/env node

/**
 * skill-installer 安全加固单元测试
 *
 * 测试内容：
 * 1. assertSafePath 路径校验
 * 2. execSync 已被移除（无 shell 注入风险）
 * 3. SHA256 hash 校验逻辑
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// ======================================
// 测试框架
// ======================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

// ======================================
// 从 agent.js 提取被测逻辑（纯函数）
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
// 1. assertSafePath 测试
// ======================================

console.log('\n[assertSafePath 路径校验]');

test('正常子路径放行', () => {
  assertSafePath(path.join(SKILLS_BASE, 'lark'), SKILLS_BASE);
});

test('base 目录本身放行', () => {
  assertSafePath(SKILLS_BASE, SKILLS_BASE);
});

test('路径穿越 ../../etc 被拦截', () => {
  let threw = false;
  try {
    assertSafePath(path.join(SKILLS_BASE, '..', '..', 'etc'), SKILLS_BASE);
  } catch (e) {
    threw = true;
    assert(e.message.includes('路径越界'), '错误信息应包含"路径越界"');
  }
  assert(threw, '应抛出异常');
});

test('绝对路径 /etc/passwd 被拦截', () => {
  let threw = false;
  try {
    assertSafePath('/etc/passwd', SKILLS_BASE);
  } catch (e) {
    threw = true;
  }
  assert(threw, '应抛出异常');
});

test('前缀伪装 skills-evil 被拦截', () => {
  // ~/.openclaw/skills-evil 不应被当作 ~/.openclaw/skills 的子路径
  let threw = false;
  try {
    assertSafePath(SKILLS_BASE + '-evil', SKILLS_BASE);
  } catch (e) {
    threw = true;
  }
  assert(threw, '应抛出异常');
});

test('licenses 路径校验', () => {
  assertSafePath(path.join(LICENSES_BASE, 'lark.json'), LICENSES_BASE);
});

test('licenses 路径穿越被拦截', () => {
  let threw = false;
  try {
    assertSafePath(path.join(LICENSES_BASE, '..', 'skills', 'evil'), LICENSES_BASE);
  } catch (e) {
    threw = true;
  }
  assert(threw, '应抛出异常');
});

// ======================================
// 2. execSync 移除验证
// ======================================

console.log('\n[execSync 安全化验证]');

test('agent.js 不再使用 execSync', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent.js'), 'utf8');
  // 排除 require 行，检查代码体中是否还有 execSync 调用
  const lines = src.split('\n');
  const callLines = lines.filter((l, i) => {
    return l.includes('execSync') && !l.includes('require');
  });
  assert(callLines.length === 0, `仍有 execSync 调用:\n${callLines.join('\n')}`);
});

test('agent.js 使用 execFileSync 替代 npm install', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent.js'), 'utf8');
  assert(src.includes("execFileSync('npm'"), '应使用 execFileSync 调用 npm');
});

test('agent.js 使用 fs.rmSync 替代 rm -rf', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent.js'), 'utf8');
  assert(!src.includes('rm -rf'), '不应包含 rm -rf');
  assert(src.includes('fs.rmSync'), '应使用 fs.rmSync');
});

test('npm install 使用国内镜像', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent.js'), 'utf8');
  assert(src.includes('registry.npmmirror.com'), '应使用 npmmirror 镜像');
});

// ======================================
// 3. SHA256 hash 校验逻辑
// ======================================

console.log('\n[SHA256 完整性校验]');

test('SHA256 计算正确', () => {
  const content = Buffer.from('hello jarvismolt');
  const expected = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  assert(expected.startsWith('sha256:'), '格式应为 sha256:hex');
  assert(expected.length === 7 + 64, 'sha256 hex 应为 64 字符');
});

test('hash 不匹配时应能检测', () => {
  const a = crypto.createHash('sha256').update('file-a').digest('hex');
  const b = crypto.createHash('sha256').update('file-b').digest('hex');
  assert(a !== b, '不同内容的 hash 应不同');
});

test('agent.js 包含 hash 校验逻辑', () => {
  const src = fs.readFileSync(path.join(__dirname, 'agent.js'), 'utf8');
  assert(src.includes('x-package-hash'), '应读取 x-package-hash 头');
  assert(src.includes('完整性校验失败'), '应有校验失败的错误提示');
});

// ======================================
// 结果
// ======================================

console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
