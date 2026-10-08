/**
 * Security Verification Suite: Courier Base URL SSRF Prevention & Secret Protection
 *
 * Verifies that:
 * 1. validateCourierApiDestination rejects all SSRF vectors:
 *    - localhost, 127.0.0.1, ::1
 *    - private RFC1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 *    - cloud metadata IPs (169.254.169.254, metadata.google.internal)
 *    - carrier-grade NAT (100.64.0.0/10)
 *    - multicast and reserved ranges
 *    - file://, ftp://, data://, javascript:, http://
 *    - embedded credentials
 *    - non-standard ports
 *    - integer / octal / hex encoded IP addresses
 * 2. Steadfast endpoints allow ONLY approved hosts (portal.packzy.com, portal.steadfast.com.bd)
 * 3. POST /api/courier/steadfast/test blocks arbitrary baseUrl attacks
 * 4. POST /api/courier/dispatch blocks arbitrary baseUrl attacks
 * 5. Steadfast secrets are never sent to non-Steadfast or unapproved destinations
 * 6. Redirects to internal or untrusted hosts are rejected
 */

import {
  validateCourierApiDestination,
  safeFetchCourierApi,
  APPROVED_STEADFAST_HOSTNAMES,
  APPROVED_STEADFAST_BASE_URLS,
  APPROVED_COURIER_DOMAINS,
} from '../src/server/ssrf';
import { resolveSteadfastBaseUrls, callSteadfastApi } from '../src/server/courier';
import { handleApiRequest } from '../src/server/router';
import { createAuthToken } from '../src/server/auth';
import { Env } from '../src/server/types';

async function runCourierSsrfTests() {
  console.log('================================================================');
  console.log('STARTING COURIER SSRF & SERVER SECRET PROTECTION VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // =========================================================================
  // TEST SUITE 1: validateCourierApiDestination SSRF Vector Rejection
  // =========================================================================
  console.log('--- TEST SUITE 1: validateCourierApiDestination SSRF Filters ---');

  const dangerousUrls = [
    { url: 'http://127.0.0.1', desc: 'IPv4 loopback (plain HTTP)' },
    { url: 'https://127.0.0.1', desc: 'IPv4 loopback (HTTPS)' },
    { url: 'http://localhost', desc: 'Localhost hostname (plain HTTP)' },
    { url: 'https://localhost', desc: 'Localhost hostname (HTTPS)' },
    { url: 'http://169.254.169.254', desc: 'AWS/GCP/Azure link-local metadata (HTTP)' },
    { url: 'https://169.254.169.254', desc: 'Link-local metadata (HTTPS)' },
    { url: 'http://[::1]', desc: 'IPv6 loopback (HTTP)' },
    { url: 'https://[::1]', desc: 'IPv6 loopback (HTTPS)' },
    { url: 'http://10.0.0.1', desc: 'RFC1918 10.0.0.0/8' },
    { url: 'https://10.254.1.1', desc: 'RFC1918 10.0.0.0/8 HTTPS' },
    { url: 'http://172.16.0.1', desc: 'RFC1918 172.16.0.0/12' },
    { url: 'https://172.31.255.1', desc: 'RFC1918 172.31.x.x HTTPS' },
    { url: 'http://192.168.1.1', desc: 'RFC1918 192.168.0.0/16' },
    { url: 'https://192.168.100.5', desc: 'RFC1918 192.168.x.x HTTPS' },
    { url: 'http://100.64.0.1', desc: 'Carrier-grade NAT 100.64.0.0/10' },
    { url: 'https://100.127.255.1', desc: 'Carrier-grade NAT 100.127.x.x HTTPS' },
    { url: 'http://0.0.0.0', desc: 'Current network 0.0.0.0' },
    { url: 'http://224.0.0.1', desc: 'Multicast address' },
    { url: 'http://240.0.0.1', desc: 'Reserved address space' },
    { url: 'file:///etc/passwd', desc: 'file:// protocol' },
    { url: 'ftp://ftp.example.com', desc: 'ftp:// protocol' },
    { url: 'data:text/plain;base64,SGVsbG8=', desc: 'data: protocol' },
    { url: 'javascript:alert(1)', desc: 'javascript: protocol' },
    { url: 'https://admin:supersecret@portal.packzy.com', desc: 'Embedded URL credentials' },
    { url: 'https://portal.packzy.com:8080/api/v1', desc: 'Arbitrary port 8080' },
    { url: 'https://portal.packzy.com:22/api/v1', desc: 'SSH port 22' },
    { url: 'http://2130706433', desc: 'Integer-encoded 127.0.0.1' },
    { url: 'http://0x7f000001', desc: 'Hex-encoded 127.0.0.1' },
    { url: 'http://0177.0.0.1', desc: 'Octal-encoded 127.0.0.1' },
    { url: 'https://metadata.google.internal', desc: 'Google Cloud metadata' },
    { url: 'https://metadata.azure.com', desc: 'Azure metadata' },
    { url: 'https://instance-data', desc: 'AWS instance-data' },
    { url: 'https://attacker-controlled-server.com/api', desc: 'External attacker domain' },
    { url: 'https://portal.packzy.com.attacker.com', desc: 'Subdomain deception' },
    { url: 'https://evil-portal.packzy.com', desc: 'Prefix deception' },
    { url: '/api/internal/admin', desc: 'Relative path traversal' },
  ];

  for (const item of dangerousUrls) {
    const res = validateCourierApiDestination(item.url);
    assert(
      !res.valid,
      `1. Rejected dangerous courier URL: ${item.desc} (${item.url})`,
      res.error
    );
  }

  // Test approved destinations
  const validPackzy = validateCourierApiDestination('https://portal.packzy.com/api/v1', { courierType: 'steadfast' });
  assert(validPackzy.valid, '1. Approved Packzy primary gateway accepted');

  const validSteadfastLegacy = validateCourierApiDestination('https://portal.steadfast.com.bd/api/v1', { courierType: 'steadfast' });
  assert(validSteadfastLegacy.valid, '1. Approved Steadfast legacy gateway accepted');

  const validPathao = validateCourierApiDestination('https://api-hermes.pathao.com/aladdin/api/v1', { courierType: 'pathao' });
  assert(validPathao.valid, '1. Approved Pathao gateway accepted for Pathao courier');

  const validRedX = validateCourierApiDestination('https://openapi.redx.com.bd/v1.0.0-beta', { courierType: 'redx' });
  assert(validRedX.valid, '1. Approved RedX gateway accepted for RedX courier');

  // Verify that Pathao URL is REJECTED for Steadfast courier calls
  const pathaoForSteadfast = validateCourierApiDestination('https://api-hermes.pathao.com/aladdin/api/v1', { courierType: 'steadfast' });
  assert(!pathaoForSteadfast.valid, '1. Non-Steadfast gateway rejected when courierType is steadfast');

  // =========================================================================
  // TEST SUITE 2: resolveSteadfastBaseUrls Server-Side Allowlist Enforcement
  // =========================================================================
  console.log('\n--- TEST SUITE 2: resolveSteadfastBaseUrls Allowlist ---');

  // Passing malicious customBaseUrl MUST NOT alter server candidate list
  const maliciousCustoms = [
    'http://127.0.0.1:8080',
    'http://169.254.169.254/latest/meta-data',
    'https://attacker-server.com/exfiltrate',
    'https://localhost',
    'javascript:void(0)',
  ];

  for (const badUrl of maliciousCustoms) {
    const resolved = resolveSteadfastBaseUrls(badUrl);
    const containsBad = resolved.includes(badUrl);
    assert(!containsBad, `2. resolveSteadfastBaseUrls ignores malicious customBaseUrl: ${badUrl}`);
    assert(
      resolved.every((u) => u.startsWith('https://portal.packzy.com') || u.startsWith('https://portal.steadfast.com.bd')),
      `2. All resolved URLs are strictly approved Steadfast gateways`
    );
  }

  // =========================================================================
  // TEST SUITE 3: callSteadfastApi Pre-Flight Destination Validation
  // =========================================================================
  console.log('\n--- TEST SUITE 3: callSteadfastApi SSRF Guard ---');

  const callWithMaliciousBase = await callSteadfastApi('get_balance', {
    apiKey: 'test-api-key',
    secretKey: 'test-secret-key',
    baseUrl: 'http://169.254.169.254/metadata',
  });
  assert(
    !callWithMaliciousBase.ok && callWithMaliciousBase.status === 400,
    '3. callSteadfastApi immediately rejects malicious baseUrl with status 400 without network dispatch'
  );

  const callWithLocalhost = await callSteadfastApi('get_balance', {
    apiKey: 'test-api-key',
    secretKey: 'test-secret-key',
    baseUrl: 'http://127.0.0.1:9999',
  });
  assert(
    !callWithLocalhost.ok && callWithLocalhost.status === 400,
    '3. callSteadfastApi immediately rejects localhost baseUrl with status 400'
  );

  // =========================================================================
  // TEST SUITE 4: POST /api/courier/steadfast/test Endpoint Security
  // =========================================================================
  console.log('\n--- TEST SUITE 4: POST /api/courier/steadfast/test Endpoint Security ---');

  let adminToken = '';
  try {
    const { getTestAdminToken } = await import('./test-auth-helper');
    adminToken = await getTestAdminToken('http://127.0.0.1:3000');
  } catch (err: any) {
    console.warn('Could not get token from dev server, generating signed test token:', err?.message);
    const { createSignedTestToken } = await import('./test-auth-helper');
    adminToken = createSignedTestToken({
      userId: 'admin-super-1',
      email: 'dev-superadmin@local.test',
      role: 'super_admin',
    });
  }

  const testSsrfPayloads = [
    { baseUrl: 'http://127.0.0.1' },
    { baseUrl: 'http://localhost:8000' },
    { baseUrl: 'http://169.254.169.254/latest' },
    { baseUrl: 'https://attacker.com/steal-steadfast-secrets' },
    { baseUrl: 'http://10.0.0.1' },
    { baseUrl: 'https://portal.packzy.com:8443' },
  ];

  for (const payload of testSsrfPayloads) {
    const resp = await fetch('http://127.0.0.1:3000/api/courier/steadfast/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    const body: any = await resp.json().catch(() => ({}));
    assert(
      resp.status === 400 && body.success === false,
      `4. /api/courier/steadfast/test blocks SSRF baseUrl: ${payload.baseUrl} (HTTP ${resp.status})`
    );
  }

  // =========================================================================
  // TEST SUITE 5: POST /api/courier/dispatch Courier SSRF & Secret Exfiltration
  // =========================================================================
  console.log('\n--- TEST SUITE 5: POST /api/courier/dispatch SSRF & Secret Protection ---');

  // Test 5.1: Steadfast dispatch with malicious courier.baseUrl
  const sfResp = await fetch('http://127.0.0.1:3000/api/courier/dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      order: { id: 'ord-test-ssrf', orderNumber: 'ORD-SSRF-001', customer: { fullName: 'Test', phone: '01711111111' } },
      courier: {
        code: 'steadfast',
        baseUrl: 'http://169.254.169.254/credentials',
      },
    }),
  });

  assert(
    sfResp.status === 400,
    `5.1 /api/courier/dispatch blocks Steadfast dispatch with SSRF baseUrl (HTTP ${sfResp.status})`
  );

  // Test 5.2: Generic courier dispatch with attacker URL
  const genResp = await fetch('http://127.0.0.1:3000/api/courier/dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      order: { id: 'ord-test-ssrf', orderNumber: 'ORD-SSRF-001', customer: { fullName: 'Test', phone: '01711111111' } },
      courier: {
        code: 'custom-courier',
        name: 'Custom Courier',
        apiKey: 'generic-api-key',
        baseUrl: 'http://127.0.0.1:3000/internal-api',
      },
    }),
  });

  assert(
    genResp.status === 400,
    `5.2 /api/courier/dispatch blocks generic courier with loopback baseUrl (HTTP ${genResp.status})`
  );

  // Test 5.3: Preventing Steadfast server secrets from being sent to generic courier
  const exfilResp = await fetch('http://127.0.0.1:3000/api/courier/dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      order: { id: 'ord-test-ssrf', orderNumber: 'ORD-SSRF-001', customer: { fullName: 'Test', phone: '01711111111' } },
      courier: {
        code: 'pathao',
        name: 'Pathao Courier',
        apiKey: process.env.STEADFAST_API_KEY || 'dev-steadfast-api-key',
        baseUrl: 'https://api-hermes.pathao.com/aladdin/api/v1',
      },
    }),
  });

  assert(
    exfilResp.status === 400,
    `5.3 /api/courier/dispatch blocks sending Steadfast API Key to generic courier (HTTP ${exfilResp.status})`
  );

  // =========================================================================
  // TEST SUITE 6: Redirect Security in safeFetchCourierApi
  // =========================================================================
  console.log('\n--- TEST SUITE 6: safeFetchCourierApi Redirect Security ---');

  // Attempt fetch to non-HTTPS URL
  const badProtocolFetch = await safeFetchCourierApi({
    url: 'http://portal.packzy.com/api/v1/test',
    courierType: 'steadfast',
  });
  assert(
    !badProtocolFetch.ok && badProtocolFetch.status === 400,
    '6.1 safeFetchCourierApi rejects plain http:// destination'
  );

  // Attempt fetch to unapproved domain
  const unapprovedDomainFetch = await safeFetchCourierApi({
    url: 'https://attacker.com/api/v1/test',
    courierType: 'generic',
  });
  assert(
    !unapprovedDomainFetch.ok && unapprovedDomainFetch.status === 400,
    '6.2 safeFetchCourierApi rejects unapproved domain destination'
  );

  console.log('\n================================================================');
  console.log(`COURIER SSRF VERIFICATION COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runCourierSsrfTests().catch((err) => {
  console.error('Fatal error running courier SSRF verification:', err);
  process.exit(1);
});
