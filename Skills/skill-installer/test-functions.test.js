/**
 * skill-installer 纯函数测试
 * 测试 parseUserInput 和文件系统安全补充
 */

const path = require('path');
const os = require('os');

// 从 agent.js 提取 parseUserInput（未导出，复制纯函数逻辑）
function parseUserInput(message) {
  message = message.trim();

  const learnMatch2 = message.match(/从\s*(https?:\/\/[^\s,]+)[,，]?\s*学习\s*(.+?)\s*技能/i);
  if (learnMatch2) {
    const skillNameChinese = learnMatch2[2].trim();
    const skillNameMap = { '飞书': 'lark', '飞书技能': 'lark' };
    const skillName = skillNameMap[skillNameChinese] || skillNameChinese;
    return {
      action: 'learn',
      skillName: skillName,
      giteeUrl: learnMatch2[1].replace(/[,，]+$/, '')
    };
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

// assertSafePath 复制
const SKILLS_BASE = path.join(os.homedir(), '.openclaw', 'skills');

function assertSafePath(filePath, baseDir) {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error(`路径越界: ${resolved}`);
  }
}
// ============== parseUserInput 测试 ==============

describe('parseUserInput', () => {
  test('学习命令解析', () => {
    const result = parseUserInput('从 https://gitee.com/bobsharon/JarvisMolt-Skills 学习飞书技能');
    expect(result.action).toBe('learn');
    expect(result.skillName).toBe('lark');
    expect(result.giteeUrl).toContain('gitee.com');
  });

  test('更新命令解析', () => {
    const result = parseUserInput('更新lark技能');
    expect(result.action).toBe('update');
    expect(result.skillName).toBe('lark');
  });

  test('列出授权命令解析', () => {
    const result = parseUserInput('查看我的技能授权');
    expect(result.action).toBe('list-licenses');
  });

  test('移除命令解析', () => {
    const result = parseUserInput('移除lark技能');
    expect(result.action).toBe('remove');
    expect(result.skillName).toBe('lark');
  });

  test('空输入 → unknown', () => {
    const result = parseUserInput('');
    expect(result.action).toBe('unknown');
  });

  test('未知命令 → unknown', () => {
    const result = parseUserInput('做点别的事情');
    expect(result.action).toBe('unknown');
  });

  test('特殊字符技能名', () => {
    // parseUserInput uses \w+ for update/remove, so special chars won't match
    const result = parseUserInput('更新<script>alert(1)</script>技能');
    expect(result.action).toBe('unknown');
  });

  test('过长技能名', () => {
    const longName = 'a'.repeat(1000);
    const result = parseUserInput(`更新${longName}技能`);
    // \w+ will match, but the name is just very long - function doesn't limit
    expect(result.action).toBe('update');
  });
});

// ============== 文件系统安全补充 ==============

describe('文件系统安全补充', () => {
  test('符号链接路径 — resolve 后判断', () => {
    // assertSafePath uses path.resolve which resolves symlinks at path level
    expect(() => {
      assertSafePath(path.join(SKILLS_BASE, 'legit', '..', '..', 'etc'), SKILLS_BASE);
    }).toThrow('路径越界');
  });

  test('空字符串路径', () => {
    // path.resolve('') returns cwd, which is not under SKILLS_BASE
    expect(() => {
      assertSafePath('', SKILLS_BASE);
    }).toThrow();
  });

  test('Unicode 路径', () => {
    // Unicode subpath under SKILLS_BASE should be allowed
    expect(() => {
      assertSafePath(path.join(SKILLS_BASE, '技能包'), SKILLS_BASE);
    }).not.toThrow();
  });
});
