import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { createAuthToken, getAuthSecret } from '../src/server/auth';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] ${message}`);
}

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('dist')) {
        getAllFiles(fullPath, fileList);
      }
    } else if (/\.(tsx?|jsx?|html)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function runTests() {
  console.log('================================================================');
  console.log('VERIFYING ISSUE 1 & 2 SECURITY FIXES');
  console.log('================================================================\n');

  // =================================================================
  // ISSUE 1: Hardcoded Super Admin Email / Identity Exposure
  // =================================================================
  console.log('--- ISSUE 1: Super Admin Hardcoded Identity & Bundle Inspection ---');

  const srcFiles = getAllFiles(resolve('./src'));

  // 1. Verify NO personal super admin emails exist in src/
  const forbiddenEmails = ['cmt413uec@gmail.com', 'efatmkt5@gmail.com', 'efatmkt7@gmail.com'];
  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf-8');
    for (const email of forbiddenEmails) {
      assert(
        !content.includes(email),
        `No exposure of ${email} in client/server src file: ${file.replace(resolve('.'), '')}`
      );
    }
  }

  // 2. Verify privileged user ID 'user-admin-efat' is NOT in src/
  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf-8');
    assert(
      !content.includes('user-admin-efat'),
      `No privileged ID 'user-admin-efat' in src file: ${file.replace(resolve('.'), '')}`
    );
  }

  // 2b. Verify privileged emails and user ID are NOT in vite.config.ts fallback
  const viteConfigCode = readFileSync(resolve('./vite.config.ts'), 'utf-8');
  for (const email of forbiddenEmails) {
    assert(
      !viteConfigCode.includes(email),
      `No exposure of ${email} in vite.config.ts fallback`
    );
  }
  assert(
    !viteConfigCode.includes('user-admin-efat'),
    `No privileged ID 'user-admin-efat' in vite.config.ts`
  );
  assert(
    !viteConfigCode.includes('efatadmin'),
    `No privileged username 'efatadmin' in vite.config.ts`
  );

  // 3. Verify isMasterAdminEmail is not used anywhere in components or context
  for (const file of srcFiles) {
    if (file.endsWith('types.ts')) continue; // types.ts only has the deprecated dummy
    const content = readFileSync(file, 'utf-8');
    assert(
      !content.includes('isMasterAdminEmail'),
      `No isMasterAdminEmail usage in: ${file.replace(resolve('.'), '')}`
    );
  }

  // 4. Verify INITIAL_USERS in seedData.ts does not contain any super_admin accounts
  const seedDataCode = readFileSync(resolve('./src/data/seedData.ts'), 'utf-8');
  assert(
    !seedDataCode.includes("role: 'super_admin'"),
    'INITIAL_USERS contains zero super_admin accounts'
  );

  // 5. Verify server permissions dynamically resolve from env without hardcoding
  const permCode = readFileSync(resolve('./src/server/permissions.ts'), 'utf-8');
  assert(
    permCode.includes('getSuperAdminEmails') &&
    permCode.includes('env?.SUPER_ADMIN_EMAILS') &&
    !permCode.includes('cmt413uec@gmail.com'),
    'Server permissions dynamically resolves Super Admin from env without hardcoded fallbacks'
  );

  // 6. Verify server router derives user from verified token & authoritative D1 record
  const routerCode = readFileSync(resolve('./src/server/router.ts'), 'utf-8');
  assert(
    routerCode.includes('requireAuth(') &&
    routerCode.includes('tokenUser = await verifyAuthToken(token, secret, env)') &&
    routerCode.includes('dbUser = await getUserByEmailOrUsername(env.DB'),
    'Server router derives user from verified cryptographic token and authoritative database row'
  );

  // 7. Verify GET /api/users filters out super_admin accounts for non-super admins
  assert(
    routerCode.includes('!isSuperAdminUserServer(u, env)'),
    'GET /api/users filters out all Super Admin identities for non-super admins'
  );

  // 8. Verify rowToUser sanitizes sensitive fields (password hash never returned)
  const dbCode = readFileSync(resolve('./src/server/db.ts'), 'utf-8');
  assert(
    dbCode.includes('// Never leak password or password hash to frontend') &&
    !dbCode.includes('password: row.password'),
    'Database user serialization (rowToUser) never leaks password or password hash'
  );

  // =================================================================
  // ISSUE 2: Authenticated User Can Change Email/Password Without Current Password
  // =================================================================
  console.log('\n--- ISSUE 2: Self-Service Email & Password Current Password Verification ---');

  // 1. Verify PUT /api/users/:id requires currentPassword for self email or password change
  assert(
    routerCode.includes('isSelf && (isChangingEmail || isChangingPassword)') &&
    routerCode.includes('Current password confirmation is required to change your email or password.'),
    'Router requires current password verification for self-service email and password updates'
  );

  // 2. Verify current password is verified against stored hash using verifyPassword
  assert(
    routerCode.includes('isCurrentValid = await verifyPassword(currentPassword, auth!.dbUser.password') &&
    routerCode.includes('Current password does not match. Please verify and try again.'),
    'Router cryptographically verifies current password against stored hash'
  );

  // 3. Verify new password is validated against policy (>= 6 characters)
  assert(
    routerCode.includes('New password must be at least 6 characters long.'),
    'Router enforces minimum password length policy (>= 6 characters)'
  );

  // 4. Verify new password is hashed with PBKDF2 before storage
  assert(
    dbCode.includes('updates.password ? await hashPassword(updates.password) :'),
    'Database update helper hashes new password with PBKDF2 before persisting'
  );

  // 5. Verify privilege escalation prevention: normal user cannot alter role or permissions
  assert(
    routerCode.includes('if (isSelf && auth!.role !== \'super_admin\') {') &&
    routerCode.includes('delete updates.role;') &&
    routerCode.includes('delete updates.permissions;'),
    'Self-updates strictly strip role and permissions modifications'
  );

  // 6. Verify non-super-admins cannot promote anyone to super_admin
  assert(
    routerCode.includes('if (updates.role === \'super_admin\' && auth!.role !== \'super_admin\') {') &&
    routerCode.includes('Forbidden: Cannot promote account to Super Administrator.'),
    'Unauthorized users cannot promote accounts to Super Administrator'
  );

  // 7. Verify non-self updates require user.manage permission
  assert(
    routerCode.includes('if (!isSelf) {') &&
    routerCode.includes("const permErr = requirePermission(auth!, 'user.manage');"),
    'Modifying another user requires administrative user.manage permission'
  );

  // 8. Verify session token is regenerated with fresh pwdSig upon password change
  assert(
    routerCode.includes('newPwdSig = await computePasswordSignature(') &&
    routerCode.includes('pwdSig: newPwdSig'),
    'Fresh session token with new pwdSig is issued on password change'
  );

  // 9. Verify requireAuth invalidates old sessions whose pwdSig no longer matches
  assert(
    routerCode.includes('Unauthorized: Session invalidated or password was changed. Please log in again.'),
    'Session invalidation: requireAuth rejects stale tokens after password change'
  );

  // 10. Verify legacy 16-character pwdSig fallback has been completely removed
  assert(
    !routerCode.includes('tokenSig.length === 16'),
    'Legacy 16-character pwdSig compatibility branch is completely removed from router.ts'
  );
  assert(
    routerCode.includes('tokenSig.length === 32'),
    'Strict 32-character SHA-256 signature length check is enforced in router.ts'
  );

  // 11. Verify getUserByEmailOrUsername matches strictly on unique email or id, excluding non-unique name
  assert(
    !dbCode.includes('LOWER(TRIM(name)) = ?'),
    'Identity lookup query strictly excludes non-unique display name (LOWER(TRIM(name)))'
  );
  assert(
    dbCode.includes('SELECT * FROM users WHERE LOWER(TRIM(email)) = ? OR id = ? LIMIT 1'),
    'Identity lookup query matches exclusively on unique email or primary key ID'
  );

  // 12. Verify jsonResponse hides internal errors and strips stack traces and SQL queries
  assert(
    routerCode.includes("error: 'Internal server error.'") &&
    routerCode.includes("delete payload.stack") &&
    routerCode.includes("delete payload.sql"),
    'jsonResponse automatically masks 5xx errors and strips stack traces and SQL queries'
  );

  // =================================================================
  // LIVE HTTP API INTEGRATION TESTS (against dev server)
  // =================================================================
  console.log('\n--- LIVE HTTP TESTS: Dev Server Self-Service Security ---');

  const baseUrl = 'http://localhost:3000';

  // 1. Create a fresh test customer
  const testEmail = `testuser_${Date.now()}@example.com`;
  const testPassword = 'OriginalPassword123!';
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Security Test User',
      email: testEmail,
      password: testPassword,
      phone: '01700000000',
    }),
  });

  const regData = await regRes.json();
  assert(regRes.status === 201 && regData.success, 'Test user successfully registered');
  const userId = regData.user.id;
  const cookie = regRes.headers.get('set-cookie') || '';
  assert(Boolean(cookie), 'Auth session cookie returned');

  // Extract auth cookie header
  const authCookieHeader = cookie.split(';')[0];

  // 2. Attempt to change email WITHOUT current password -> Must FAIL (400)
  const failEmailRes1 = await fetch(`${baseUrl}/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookieHeader,
    },
    body: JSON.stringify({
      updates: {
        email: `hacked_${Date.now()}@example.com`,
      },
    }),
  });
  assert(
    failEmailRes1.status === 400,
    'Attempt to change email without current password rejected with 400'
  );

  // 3. Attempt to change email WITH WRONG current password -> Must FAIL (400)
  const failEmailRes2 = await fetch(`${baseUrl}/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookieHeader,
    },
    body: JSON.stringify({
      currentPassword: 'WrongPassword999!',
      updates: {
        email: `hacked_${Date.now()}@example.com`,
      },
    }),
  });
  assert(
    failEmailRes2.status === 400,
    'Attempt to change email with incorrect password rejected with 400'
  );

  // 4. Attempt to change password WITHOUT current password -> Must FAIL (400)
  const failPwRes1 = await fetch(`${baseUrl}/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookieHeader,
    },
    body: JSON.stringify({
      updates: {
        password: 'NewInsecurePassword123!',
      },
    }),
  });
  assert(
    failPwRes1.status === 400,
    'Attempt to change password without current password rejected with 400'
  );

  // 5. Attempt to change password WITH WRONG current password -> Must FAIL (400)
  const failPwRes2 = await fetch(`${baseUrl}/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookieHeader,
    },
    body: JSON.stringify({
      currentPassword: 'WrongPassword999!',
      updates: {
        password: 'NewInsecurePassword123!',
      },
    }),
  });
  assert(
    failPwRes2.status === 400,
    'Attempt to change password with incorrect password rejected with 400'
  );

  // 6. Attempt privilege escalation: Try to promote self to super_admin -> Role change rejected with 403 or stripped/denied
  const escalateRes = await fetch(`${baseUrl}/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookieHeader,
    },
    body: JSON.stringify({
      updates: {
        role: 'super_admin',
        name: 'Hacked Name',
      },
    }),
  });
  const escalateData = await escalateRes.json();
  assert(
    escalateRes.status === 403 || escalateData.user?.role === 'customer',
    'Self-promotion attempt to super_admin was strictly prevented (role remains customer or returns 403)'
  );

  // 7. Attempt to modify another user's account -> Must FAIL (403 Forbidden)
  const hijackOtherRes = await fetch(`${baseUrl}/api/users/user-subadmin-operations`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookieHeader,
    },
    body: JSON.stringify({
      updates: {
        name: 'Hijacked Operations',
      },
    }),
  });
  assert(
    hijackOtherRes.status === 403,
    'Normal user attempting to modify another user rejected with 403 Forbidden'
  );

  // 8. Legitimate password change with CORRECT current password -> Must SUCCEED (200)
  const newPass = 'UpdatedSecurePassword456!';
  const successPwRes = await fetch(`${baseUrl}/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookieHeader,
    },
    body: JSON.stringify({
      currentPassword: testPassword,
      updates: {
        password: newPass,
      },
    }),
  });
  assert(successPwRes.status === 200, 'Legitimate password change with correct current password succeeded (200)');
  const newCookie = successPwRes.headers.get('set-cookie') || '';
  assert(Boolean(newCookie), 'Fresh session cookie returned with new password signature');

  // 9. Verify OLD token is now INVALIDATED
  const staleAuthRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      Cookie: authCookieHeader, // using the OLD cookie
    },
  });
  assert(
    staleAuthRes.status === 401,
    'Session invalidation verified: Stale session token with old password signature rejected (401)'
  );

  // 10. Verify NEW password works for login
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: testEmail,
      password: newPass,
    }),
  });
  const loginData = await loginRes.json();
  assert(loginRes.status === 200 && loginData.success, 'Login with new password succeeded');

  // 11. Verify token with legacy 16-character pwdSig is REJECTED with 401
  const secret = getAuthSecret({ DEV: true });
  const legacy16Token = await createAuthToken(
    {
      userId,
      email: testEmail,
      role: 'customer',
      pwdSig: 'pbkdf2:100000:07', // 16-character legacy signature format
    },
    secret
  );
  const legacyRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      Cookie: `auth_token=${encodeURIComponent(legacy16Token)}`,
    },
  });
  assert(
    legacyRes.status === 401,
    'Legacy 16-character session signature format is strictly rejected with 401 Unauthorized'
  );
  const legacyBody = await legacyRes.json();
  assert(
    legacyBody.error?.includes('Session invalidated or password was changed'),
    'Rejection message clearly instructs that session is invalidated and requires re-login'
  );

  // 12. Verify identity lookup correctness: Display name cannot be used as an ambiguous login credential
  const nameLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'Security Test User', // Display name, NOT unique email or ID
      password: newPass,
    }),
  });
  assert(
    nameLoginRes.status === 401,
    'Login attempt using non-unique display name is rejected with 401 Unauthorized'
  );
  const nameLoginData = await nameLoginRes.json();
  assert(
    nameLoginData.error === 'Invalid email or password.' || nameLoginData.error?.includes('Invalid email'),
    'Safe generic error returned for invalid login identifier without account enumeration'
  );

  // 13. Verify unique email login continues to SUCCEED
  const emailLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: testEmail, // Distinct unique email
      password: newPass,
    }),
  });
  assert(
    emailLoginRes.status === 200,
    'Login using unique verified email succeeds with 200'
  );

  console.log('\n================================================================');
  console.log('ALL ISSUE 1 & ISSUE 2 VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
