import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { bufferToHex, verifyPassword, hashPassword } from '../src/server/auth';

async function verifyPasswordResetSystem() {
  console.log('--- STARTING COMPREHENSIVE PASSWORD RESET & SECURITY AUDIT VERIFICATION ---');

  const baseUrl = 'http://localhost:3000';

  // 1. Test live dev server endpoints
  console.log('\n[TEST 1] Testing live /api/auth/forgot-password endpoint...');

  // 1.1 Invalid email validation
  const invalidEmailRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.1' },
    body: JSON.stringify({ email: 'invalid-email-no-at' }),
  });
  if (invalidEmailRes.status !== 400) {
    throw new Error(`Expected 400 for invalid email, got ${invalidEmailRes.status}`);
  }
  const invalidEmailData = await invalidEmailRes.json();
  console.log('✓ Invalid email rejected with 400:', invalidEmailData.message);

  // 1.2 Case 2: Non-existing email request (Anti-enumeration: identical 200 response)
  const nonExistingEmailRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.2' },
    body: JSON.stringify({ email: 'ghost-nonexistent-user@example.com' }),
  });
  if (nonExistingEmailRes.status !== 200) {
    throw new Error(`Expected 200 for non-existing email (anti-enumeration), got ${nonExistingEmailRes.status}`);
  }
  const nonExistingEmailData = await nonExistingEmailRes.json();
  if (
    nonExistingEmailData.success !== true ||
    nonExistingEmailData.status !== 'RESET_EMAIL_SENT' ||
    nonExistingEmailData.message !== 'If the account exists, password reset instructions have been sent.'
  ) {
    throw new Error(`Unexpected response for non-existing email: ${JSON.stringify(nonExistingEmailData)}`);
  }
  console.log('✓ Non-existing email returned exact anti-enumeration response:', JSON.stringify(nonExistingEmailData));

  // 1.3 Case 1: Existing email request (including mixed-case normalization check)
  const existingEmailRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.3' },
    body: JSON.stringify({ email: '  CMT413UEC@Gmail.com  ' }),
  });
  if (existingEmailRes.status !== 200) {
    throw new Error(`Expected 200 for existing email, got ${existingEmailRes.status}`);
  }
  const existingEmailData = await existingEmailRes.json();
  if (
    existingEmailData.success !== true ||
    existingEmailData.status !== 'RESET_EMAIL_SENT' ||
    existingEmailData.message !== 'If the account exists, password reset instructions have been sent.'
  ) {
    throw new Error(`Unexpected response for existing email: ${JSON.stringify(existingEmailData)}`);
  }
  console.log('✓ Existing email (normalized from mixed case) returned identical anti-enumeration response:', JSON.stringify(existingEmailData));

  // 1.4 Rate Limiting on /api/auth/forgot-password
  console.log('\n[TEST 2] Testing server-side rate limiting on /api/auth/forgot-password...');
  let rateLimitedTriggered = false;
  for (let i = 0; i < 7; i++) {
    const rlRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.99' },
      body: JSON.stringify({ email: 'ratelimit-target@example.com' }),
    });
    if (rlRes.status === 429) {
      const rlData = await rlRes.json();
      if (
        rlData.success !== false ||
        rlData.status !== 'RATE_LIMITED' ||
        rlData.message !== 'Too many password reset requests. Please try again later.'
      ) {
        throw new Error(`Unexpected rate limit payload: ${JSON.stringify(rlData)}`);
      }
      rateLimitedTriggered = true;
      console.log('✓ Rate limiting triggered on attempt', i + 1, 'with payload:', JSON.stringify(rlData));
      break;
    }
  }
  if (!rateLimitedTriggered) {
    throw new Error('Rate limiting failed to trigger after repeated requests!');
  }

  // 2. Test live /api/auth/reset-password endpoint validation
  console.log('\n[TEST 3] Testing live /api/auth/reset-password validation...');

  // 2.1 Missing token
  const noTokenRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.4' },
    body: JSON.stringify({ newPassword: 'ValidPassword123' }),
  });
  if (noTokenRes.status !== 400) throw new Error('Expected 400 for missing token');
  console.log('✓ Missing token rejected with 400');

  // 2.2 Short password (<6 chars)
  const shortPwRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.4' },
    body: JSON.stringify({ token: 'mock-token-abc', newPassword: '123' }),
  });
  if (shortPwRes.status !== 400) throw new Error('Expected 400 for short password');
  console.log('✓ Short password (<6 chars) rejected with 400');

  // 2.3 Non-existent/invalid token
  const invalidTokenRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.4' },
    body: JSON.stringify({ token: 'completely-nonexistent-token-xyz', newPassword: 'NewPassword@2026' }),
  });
  if (invalidTokenRes.status !== 400) throw new Error('Expected 400 for non-existent token');
  console.log('✓ Non-existent or invalid reset token rejected with 400');

  // 3. End-to-End Flow Test on Production Router (handleApiRequest)
  console.log('\n[TEST 4] End-to-End Flow Test on handleApiRequest (Case 1, Case 2, Single-Use, Expiry, Login)...');
  const { handleApiRequest } = await import('../src/server/router');

  const storedResetTokens = new Map<string, { id: string; user_id: string; token_hash: string; expires_at: number; used_at: number | null; created_at: number }>();
  const mockUsers = new Map<string, { id: string; email: string; name: string; role: string; password: string }>();
  const initialPasswordHash = await hashPassword('OldPassword@123');
  mockUsers.set('usr-existing-456', {
    id: 'usr-existing-456',
    email: 'existing@example.com',
    name: 'Existing Customer',
    role: 'customer',
    password: initialPasswordHash,
  });

  let resendCallCount: number = 0;
  let capturedEmailPayload: any = null;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: any, init?: any) => {
    const urlStr = typeof input === 'string' ? input : input?.url || '';
    if (urlStr.includes('api.resend.com')) {
      resendCallCount++;
      capturedEmailPayload = init?.body ? JSON.parse(init.body) : null;
      return new Response(JSON.stringify({ id: 'resend-mock-test-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };

  const mockDb: any = {
    prepare: (query: string) => {
      const bindFn = (...args: any[]) => ({
        first: async () => {
          if (query.includes('FROM users WHERE LOWER(TRIM(email)) = ?')) {
            const cleanArg = String(args[0] || '').toLowerCase().trim();
            for (const u of mockUsers.values()) {
              if (u.email.toLowerCase().trim() === cleanArg) return { ...u };
            }
            return null;
          }
          if (query.includes('FROM users WHERE LOWER(TRIM(email)) = ? OR id = ?') || query.includes('FROM users WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(name)) = ? OR id = ?')) {
            const cleanArg = String(args[0] || '').toLowerCase().trim();
            const idArg = args.length > 2 ? args[2] : args[1];
            for (const u of mockUsers.values()) {
              if (u.email.toLowerCase().trim() === cleanArg || u.id === idArg) return { ...u };
            }
            return null;
          }
          if (query.includes('FROM users WHERE id = ?')) {
            const u = mockUsers.get(String(args[0]));
            return u ? { ...u } : null;
          }
          if (query.includes('RETURNING')) {
            const [usedAt, tokenHash, now] = args;
            for (const t of storedResetTokens.values()) {
              if (t.token_hash === tokenHash && t.used_at == null && t.expires_at > (now || 0)) {
                t.used_at = usedAt;
                return { ...t };
              }
            }
            return null;
          }
          if (query.includes('FROM password_reset_tokens WHERE token_hash = ?')) {
            const hashArg = String(args[0]);
            for (const t of storedResetTokens.values()) {
              if (t.token_hash === hashArg) return { ...t };
            }
            return null;
          }
          return null;
        },
        run: async () => {
          let changes = 0;
          if (query.includes('INSERT INTO password_reset_tokens')) {
            const [id, user_id, token_hash, expires_at, created_at] = args;
            storedResetTokens.set(id, { id, user_id, token_hash, expires_at, used_at: null, created_at });
            changes = 1;
          } else if (query.includes('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ?')) {
            const [usedAt, userId] = args;
            for (const t of storedResetTokens.values()) {
              if (t.user_id === userId && t.used_at == null) {
                t.used_at = usedAt;
                changes++;
              }
            }
          } else if (query.includes('UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?')) {
            const [usedAt, tokenHash, now] = args;
            for (const t of storedResetTokens.values()) {
              if (t.token_hash === tokenHash && t.used_at == null && (!now || t.expires_at > now)) {
                t.used_at = usedAt;
                changes++;
              }
            }
          } else if (query.includes('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?')) {
            const [usedAt, id] = args;
            const t = storedResetTokens.get(id);
            if (t && t.used_at == null) {
              t.used_at = usedAt;
              changes++;
            }
          } else if (query.includes('UPDATE users SET password = ?')) {
            const [newHashed, id] = args;
            const u = mockUsers.get(id);
            if (u) {
              u.password = newHashed;
              changes++;
            }
          }
          return { success: true, meta: { changes }, changes };
        },
        all: async () => ({ results: [], success: true }),
      });
      return {
        bind: bindFn,
        run: async () => ({ success: true }),
        all: async () => ({ results: [], success: true }),
        first: async () => null,
      };
    },
  };

  const mockEnv: any = {
    DB: mockDb,
    RESEND_API_KEY: 're_test_key_case_verification_123',
    RESEND_FROM_EMAIL: 'support@rongdhonutrade.com',
    APP_URL: 'https://rongdhonutrade.com',
  };

  try {
    // CASE 2: Non-existing email (Anti-enumeration: returns identical 200 and generic message)
    console.log('-> Testing Case 2 (Account does NOT exist)...');
    const nonExistentReq = new Request('https://rongdhonutrade.com/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
      body: JSON.stringify({ email: 'unregistered-user@example.com' }),
    });

    const resCase2 = await handleApiRequest(nonExistentReq, mockEnv);
    const dataCase2 = await resCase2.json();

    if (resCase2.status !== 200) throw new Error(`Expected 200 for Case 2 (anti-enumeration), got ${resCase2.status}`);
    if (
      dataCase2.success !== true ||
      dataCase2.status !== 'RESET_EMAIL_SENT' ||
      dataCase2.message !== 'If the account exists, password reset instructions have been sent.'
    ) {
      throw new Error(`Case 2 unexpected response: ${JSON.stringify(dataCase2)}`);
    }
    if (storedResetTokens.size !== 0) throw new Error('Case 2 MUST NOT generate or store any reset token');
    if (resendCallCount !== 0) throw new Error('Case 2 MUST NOT send any email');
    console.log('✓ Case 2 Passed: Unregistered email -> anti-enumeration generic 200 -> 0 tokens generated -> 0 emails sent');

    // CASE 1: Existing email (mixed-case input to verify case-insensitive normalization)
    console.log('-> Testing Case 1 (Account exists)...');
    const existingReq = new Request('https://rongdhonutrade.com/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.11' },
      body: JSON.stringify({ email: '  Existing@Example.COM ' }),
    });

    const resCase1 = await handleApiRequest(existingReq, mockEnv);
    const dataCase1 = await resCase1.json();

    if (resCase1.status !== 200) throw new Error(`Expected 200 for Case 1, got ${resCase1.status}`);
    if (
      dataCase1.success !== true ||
      dataCase1.status !== 'RESET_EMAIL_SENT' ||
      dataCase1.message !== 'If the account exists, password reset instructions have been sent.'
    ) {
      throw new Error(`Case 1 unexpected response: ${JSON.stringify(dataCase1)}`);
    }
    if (Array.from(storedResetTokens.keys()).length !== 1) throw new Error('Case 1 MUST store 1 hashed token in DB');
    if (Number(resendCallCount) !== 1) throw new Error('Case 1 MUST send 1 reset email via Resend');

    // Extract raw token from the email sent to the user
    const emailText: string = capturedEmailPayload?.text || '';
    const urlMatch = emailText.match(/https:\/\/rongdhonutrade\.com\/reset-password\?token=([a-f0-9]{64})/);
    if (!urlMatch) {
      throw new Error(`Expected production reset link with 64-char hex token in email, got: ${emailText}`);
    }
    const rawTokenFromEmail = urlMatch[1];

    // Verify stored token in DB is ONLY the SHA-256 hash, never the raw token
    const storedRecord = Array.from(storedResetTokens.values())[0];
    if (storedRecord.token_hash === rawTokenFromEmail) {
      throw new Error('SECURITY FAILURE: Raw reset token was stored in database!');
    }
    const expectedHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawTokenFromEmail));
    const expectedHashHex = bufferToHex(expectedHashBuf);
    if (storedRecord.token_hash !== expectedHashHex) {
      throw new Error('Stored token_hash does not match SHA-256 of raw token!');
    }
    console.log('✓ Case 1 Passed: 64-char random token generated, SHA-256 hash stored in DB, production reset URL sent via Resend');

    // Reset password using the raw token from email
    console.log('-> Testing password reset with valid token...');
    const resetReq = new Request('https://rongdhonutrade.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.12' },
      body: JSON.stringify({ token: rawTokenFromEmail, newPassword: 'BrandNewSecurePassword!99' }),
    });
    const resetRes = await handleApiRequest(resetReq, mockEnv);
    const resetData = await resetRes.json();
    if (resetRes.status !== 200 || !resetData.success) {
      throw new Error(`Expected password reset to succeed, got: ${JSON.stringify(resetData)}`);
    }
    console.log('✓ Password reset succeeded and updated user password hash (PBKDF2)');

    // Verify token is now marked used and cannot be reused
    console.log('-> Testing single-use enforcement (reusing same token)...');
    const reuseReq = new Request('https://rongdhonutrade.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.12' },
      body: JSON.stringify({ token: rawTokenFromEmail, newPassword: 'AnotherPassword!99' }),
    });
    const reuseRes = await handleApiRequest(reuseReq, mockEnv);
    const reuseData = await reuseRes.json();
    if (reuseRes.status !== 400 || reuseData.success !== false || (reuseData.status !== 'TOKEN_ALREADY_USED' && reuseData.status !== 'INVALID_TOKEN')) {
      throw new Error(`Expected reused token to be rejected with 400 (TOKEN_ALREADY_USED or INVALID_TOKEN), got: ${JSON.stringify(reuseData)}`);
    }
    console.log('✓ Reused token rejected immediately:', reuseData.message);

    // Verify user can log in with the new password
    console.log('-> Testing login with new password...');
    const loginReq = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.12' },
      body: JSON.stringify({ usernameOrEmail: 'existing@example.com', password: 'BrandNewSecurePassword!99' }),
    });
    const loginRes = await handleApiRequest(loginReq, mockEnv);
    const loginData = await loginRes.json();
    if (loginRes.status !== 200 || !loginData.success) {
      throw new Error(`Expected login with new password to succeed, got: ${JSON.stringify(loginData)}`);
    }
    console.log('✓ User successfully logged in with new password');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 4. Static Security & Bundle Audit
  console.log('\n[TEST 5] Performing static code and production bundle security audit...');
  const routerCode = readFileSync(resolve('src/server/router.ts'), 'utf-8');
  const viteConfigCode = readFileSync(resolve('vite.config.ts'), 'utf-8');

  // Ensure rawToken or resetUrl is never logged in router.ts or vite.config.ts
  if (/console\.(log|info|warn|error)\([^)]*(rawToken|resetUrl)/.test(routerCode)) {
    throw new Error('SECURITY FAILURE: router.ts logs rawToken or resetUrl!');
  }
  if (viteConfigCode.includes('Simulated password reset link') || /console\.(log|info|warn|error)\([^)]*(rawToken|resetUrl)/.test(viteConfigCode)) {
    throw new Error('SECURITY FAILURE: vite.config.ts logs resetUrl or rawToken!');
  }
  console.log('✓ Zero raw reset token or reset URL logging in server or dev middleware');

  // Inspect dist/ client bundle if present
  const distDir = resolve('dist');
  if (existsSync(distDir)) {
    const collectFiles = (dir: string): string[] => {
      const entries = readdirSync(dir);
      let files: string[] = [];
      for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          files = files.concat(collectFiles(full));
        } else if (full.endsWith('.js') || full.endsWith('.html')) {
          files.push(full);
        }
      }
      return files;
    };
    const bundleFiles = collectFiles(distDir);
    for (const file of bundleFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('RESEND_API_KEY') || content.includes('api.resend.com') || content.includes('ADMIN_SECRET')) {
        throw new Error(`SECURITY FAILURE: Client bundle file ${file} contains server-only secret references!`);
      }
    }
    console.log(`✓ Audited ${bundleFiles.length} production client bundle files in dist/: zero email credentials or server secrets exposed`);
  }

  console.log('\n======================================================');
  console.log(' ALL PASSWORD RESET & SECURITY AUDIT TESTS PASSED! 🎉');
  console.log('======================================================');
}

verifyPasswordResetSystem().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
