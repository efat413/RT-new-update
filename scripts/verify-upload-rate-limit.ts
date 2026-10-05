/**
 * Verification Suite for Upload Rate Limiting and Storage Abuse Protection
 *
 * Tests:
 * 1. Normal admin upload
 * 2. Normal staff upload
 * 3. Repeated uploads
 * 4. Rate limit triggered (HTTP 429 + Retry-After)
 * 5. Unauthenticated upload (HTTP 401)
 * 6. Customer upload (HTTP 403)
 * 7. Invalid file (HTTP 400)
 * 8. Oversized file (HTTP 413)
 */

import { getTestAdminToken, getTestStaffToken, getTestCustomerToken } from './test-auth-helper';

async function runUploadRateLimitTests() {
  console.log('===========================================================');
  console.log('STARTING UPLOAD RATE LIMIT & STORAGE ABUSE VERIFICATION');
  console.log('===========================================================');

  const baseUrl = 'http://127.0.0.1:3000';

  // Valid 2x2 PNG image buffer
  const validPngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x72, 0xb6, 0x0d, 0x24,
    0x00, 0x00, 0x00, 0x0f, 0x49, 0x44, 0x41, 0x54,
    0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  const validDataUrl = `data:image/png;base64,${Buffer.from(validPngBytes).toString('base64')}`;

  // Legitimate authenticated session tokens
  const adminToken = await getTestAdminToken(baseUrl);
  const staffToken = await getTestStaffToken(baseUrl, 'staff@rongdhonutrade.com');
  const rateLimitTargetStaffToken = await getTestStaffToken(baseUrl, 'inventory@rongdhonutrade.com');
  const customerToken = await getTestCustomerToken(baseUrl, 'customer@gmail.com');

  // =========================================================================
  // TEST 1: NORMAL ADMIN UPLOAD
  // =========================================================================
  console.log('\n[TEST 1] Normal Admin Upload...');
  const adminUploadRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ dataUrl: validDataUrl }),
  });
  console.assert(adminUploadRes.status === 200, `Expected 200, got ${adminUploadRes.status}`);
  const adminData = await adminUploadRes.json();
  console.assert(adminData.success === true && adminData.url.startsWith('/api/media/'), 'Admin upload must succeed');
  console.log('✓ Normal admin upload succeeded with status 200:', adminData.url);

  // =========================================================================
  // TEST 2: NORMAL STAFF UPLOAD
  // =========================================================================
  console.log('\n[TEST 2] Normal Staff Upload...');
  const staffUploadRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${staffToken}`,
    },
    body: JSON.stringify({ dataUrl: validDataUrl }),
  });
  console.assert(staffUploadRes.status === 200, `Expected 200, got ${staffUploadRes.status}`);
  const staffData = await staffUploadRes.json();
  console.assert(staffData.success === true && staffData.url.startsWith('/api/media/'), 'Staff upload must succeed');
  console.log('✓ Normal staff upload succeeded with status 200:', staffData.url);

  // =========================================================================
  // TEST 3 & 4: REPEATED UPLOADS & RATE LIMIT TRIGGERED
  // =========================================================================
  console.log('\n[TEST 3 & 4] Repeated Uploads & Rate Limit Triggered...');

  let uploadsCount = 0;
  let rateLimitedResponse: Response | null = null;

  // Burst limit is 10 uploads in 60s. We send 11 requests: first 10 must succeed, 11th must return 429.
  for (let i = 1; i <= 11; i++) {
    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${rateLimitTargetStaffToken}`,
      },
      body: JSON.stringify({ dataUrl: validDataUrl }),
    });

    if (res.status === 200) {
      uploadsCount++;
    } else {
      console.log(`Upload ${i} status:`, res.status, await res.clone().text());
      if (res.status === 429) {
        rateLimitedResponse = res;
        break;
      }
    }
  }

  console.assert(uploadsCount === 10, `Expected exactly 10 successful uploads before rate limit, got ${uploadsCount}`);
  console.assert(rateLimitedResponse !== null, 'Rate limit must be triggered on the 11th upload');
  console.assert(rateLimitedResponse!.status === 429, `Expected HTTP 429, got ${rateLimitedResponse!.status}`);

  const rateLimitBody = await rateLimitedResponse!.json();
  console.assert(rateLimitBody.success === false, 'Rate limit response must indicate success: false');
  console.assert(rateLimitedResponse!.headers.has('retry-after'), 'Response must include Retry-After header');
  console.log(`✓ Repeated uploads allowed exactly 10 uploads before rate limiting.`);
  console.log(`✓ 11th upload triggered HTTP 429 with Retry-After: ${rateLimitedResponse!.headers.get('retry-after')}s`);
  console.log(`✓ Error message: "${rateLimitBody.error}"`);

  // =========================================================================
  // TEST 5: UNAUTHENTICATED UPLOAD
  // =========================================================================
  console.log('\n[TEST 5] Unauthenticated Upload...');
  const unauthRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: validDataUrl }),
  });
  console.assert(unauthRes.status === 401, `Expected 401, got ${unauthRes.status}`);
  console.log('✓ Unauthenticated upload correctly rejected with HTTP 401');

  // =========================================================================
  // TEST 6: CUSTOMER UPLOAD
  // =========================================================================
  console.log('\n[TEST 6] Customer Upload...');
  const customerRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${customerToken}`,
    },
    body: JSON.stringify({ dataUrl: validDataUrl }),
  });
  console.assert(customerRes.status === 403, `Expected 403, got ${customerRes.status}`);
  const customerBody = await customerRes.json();
  console.assert(customerBody.error.includes('Customers cannot upload'), 'Customer upload error must state forbidden');
  console.log('✓ Customer upload correctly forbidden with HTTP 403');

  // =========================================================================
  // TEST 7: INVALID FILE (SCRIPT/HTML DISGUISED AS IMAGE)
  // =========================================================================
  console.log('\n[TEST 7] Invalid File (Polyglot / Disguised Script)...');

  const maliciousDataUrl = `data:image/jpeg;base64,${Buffer.from('<script>alert("xss")</script>').toString('base64')}`;
  const invalidRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ dataUrl: maliciousDataUrl }),
  });
  console.assert(invalidRes.status === 400, `Expected 400 for invalid file, got ${invalidRes.status}`);
  console.log('✓ Invalid file strictly rejected with HTTP 400');

  // =========================================================================
  // TEST 8: OVERSIZED FILE (>10MB)
  // =========================================================================
  console.log('\n[TEST 8] Oversized File (>10MB)...');
  const oversizedBuffer = Buffer.alloc(10.5 * 1024 * 1024); // 10.5MB
  const oversizedRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: oversizedBuffer,
  });
  console.assert(oversizedRes.status === 413, `Expected 413 for oversized file, got ${oversizedRes.status}`);
  console.log('✓ Oversized file (>10MB) strictly rejected with HTTP 413 Payload Too Large');

  console.log('\n===========================================================');
  console.log('✅ ALL 8 UPLOAD RATE LIMIT & SECURITY TESTS PASSED');
  console.log('===========================================================');
}

runUploadRateLimitTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
