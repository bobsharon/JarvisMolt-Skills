const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  readLockout,
  writeLockout,
  checkLockout,
  recordVerifyFailure,
  resetLockout,
  LOCKOUT_FILE,
  LOCKOUT_MAX_FAILURES,
  LOCKOUT_DURATION_MS,
} = require('./agent');

const LICENSES_BASE = path.join(os.homedir(), '.openclaw', 'licenses');

beforeEach(() => {
  // Clean lockout file before each test
  try { fs.unlinkSync(LOCKOUT_FILE); } catch (_) {}
});

afterAll(() => {
  try { fs.unlinkSync(LOCKOUT_FILE); } catch (_) {}
});

describe('verify rate limiting', () => {
  test('readLockout returns defaults when no file exists', () => {
    const lockout = readLockout();
    expect(lockout).toEqual({ failures: 0, lockedUntil: null });
  });

  test('writeLockout and readLockout round-trip', () => {
    const data = { failures: 3, lockedUntil: null };
    writeLockout(data);
    expect(readLockout()).toEqual(data);
  });

  test('lockout triggers after 5 consecutive failures', () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i++) {
      recordVerifyFailure();
    }
    const lockout = readLockout();
    expect(lockout.failures).toBe(LOCKOUT_MAX_FAILURES);

    const status = checkLockout();
    expect(status.locked).toBe(true);
    expect(status.error).toMatch(/验证失败次数过多/);
  });

  test('lockout prevents further verification attempts', () => {
    // Simulate 5 failures then lockout
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i++) {
      recordVerifyFailure();
    }
    // First check triggers the lock
    checkLockout();

    // Subsequent checks should still be locked
    const status = checkLockout();
    expect(status.locked).toBe(true);
    expect(status.error).toMatch(/分钟后重试/);
  });

  test('successful verification resets lockout', () => {
    for (let i = 0; i < 4; i++) {
      recordVerifyFailure();
    }
    expect(readLockout().failures).toBe(4);

    resetLockout();

    const lockout = readLockout();
    expect(lockout.failures).toBe(0);
    expect(lockout.lockedUntil).toBeNull();

    const status = checkLockout();
    expect(status.locked).toBe(false);
  });

  test('lockout expires after 15 minutes', () => {
    // Write a lockout that expired 1 minute ago
    const pastLock = new Date(Date.now() - 60000).toISOString();
    writeLockout({ failures: 5, lockedUntil: pastLock });

    const status = checkLockout();
    expect(status.locked).toBe(false);

    // Verify the file was reset
    const lockout = readLockout();
    expect(lockout.failures).toBe(0);
    expect(lockout.lockedUntil).toBeNull();
  });

  test('lockout with future timestamp remains locked', () => {
    const futureLock = new Date(Date.now() + 10 * 60000).toISOString();
    writeLockout({ failures: 5, lockedUntil: futureLock });

    const status = checkLockout();
    expect(status.locked).toBe(true);
    expect(status.error).toMatch(/\d+ 分钟后重试/);
  });

  test('fewer than 5 failures does not trigger lockout', () => {
    for (let i = 0; i < 4; i++) {
      recordVerifyFailure();
    }
    const status = checkLockout();
    expect(status.locked).toBe(false);
  });
});
