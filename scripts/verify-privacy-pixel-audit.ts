import assert from 'node:assert';
import {
  sha256Sync,
  prepareHashedUserData,
  buildMetaCapiUserData,
  sanitizePayloadForStorage,
  sanitizePixelLogForPrivacy,
  trackSocialEvent,
  savePixelLog,
  getStoredPixelLogs,
  clearStoredPixelLogs,
} from '../src/utils/pixelTracking';

// Mock localStorage and window for Node test environment
const mockStorage: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => { mockStorage[key] = String(val); },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
};

(globalThis as any).document = {
  getElementById: () => null,
  getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
  createElement: () => ({ setAttribute: () => {}, id: '', src: '' }),
  head: { appendChild: () => {} },
};

(globalThis as any).window = {
  dispatchEvent: () => true,
  localStorage: (globalThis as any).localStorage,
  document: (globalThis as any).document,
};

(globalThis as any).CustomEvent = class {
  detail: any;
  constructor(public type: string, opts?: any) {
    this.detail = opts?.detail;
  }
};

async function runPrivacyAudit() {
  console.log('======================================================================');
  console.log('PRIVACY & SECURITY AUDIT: META PIXEL, ANALYTICS & LOCALSTORAGE');
  console.log('======================================================================');

  const testEmail = 'john.doe@example.com';
  const testPhone = '01712345678';
  const expectedEmailHash = sha256Sync('john.doe@example.com');
  const expectedPhoneHash = sha256Sync('8801712345678');

  // Test 1: prepareHashedUserData never returns raw email or phone previews
  console.log('\n[TEST 1] Verifying prepareHashedUserData output...');
  const hashedUser = prepareHashedUserData({
    email: testEmail,
    phone: testPhone,
    fullName: 'John Doe',
    district: 'Dhaka',
  });

  assert(hashedUser !== null, 'Hashed user must be generated');
  assert.strictEqual(hashedUser.em, expectedEmailHash, 'Email hash must match SHA-256');
  assert.strictEqual(hashedUser.ph, expectedPhoneHash, 'Phone hash must match SHA-256');
  assert.strictEqual((hashedUser as any).rawEmailPreview, undefined, 'rawEmailPreview must be completely absent');
  assert.strictEqual((hashedUser as any).rawPhonePreview, undefined, 'rawPhonePreview must be completely absent');
  console.log('✓ PASS: prepareHashedUserData returns exclusively SHA-256 hashes (em, ph, fn, ln, ct)');

  // Test 2: trackSocialEvent logs containing zero raw PII
  console.log('\n[TEST 2] Verifying trackSocialEvent log output & localStorage...');
  clearStoredPixelLogs();

  const log = trackSocialEvent(
    'Purchase',
    {
      value: 2500,
      currency: 'BDT',
      order_id: 'ord-test-privacy-101',
    },
    {
      email: testEmail,
      phone: testPhone,
      fullName: 'John Doe',
      district: 'Dhaka',
    }
  );

  assert(log.hasUserData === true, 'Log must report hasUserData: true');
  assert(!log.userDataSummary?.includes(testEmail), 'userDataSummary must NOT contain raw email');
  assert(!log.userDataSummary?.includes(testPhone), 'userDataSummary must NOT contain raw phone');
  assert(log.userDataSummary?.includes('SHA-256'), 'userDataSummary must clearly indicate SHA-256');
  console.log('✓ PASS: In-memory log userDataSummary sanitized:', log.userDataSummary);

  // Test 3: Inspect raw localStorage content
  console.log('\n[TEST 3] Inspecting raw localStorage serialization...');
  const rawStorageData = mockStorage['rongdhonu_pixel_logs_v1'] || '';
  assert(rawStorageData.length > 0, 'LocalStorage must contain logs');
  assert(!rawStorageData.includes(testEmail), 'CRITICAL: Raw email found inside localStorage!');
  assert(!rawStorageData.includes(testPhone), 'CRITICAL: Raw phone found inside localStorage!');
  assert(rawStorageData.includes(expectedEmailHash), 'Hashed email must be present in log record');
  assert(rawStorageData.includes(expectedPhoneHash), 'Hashed phone must be present in log record');
  console.log('✓ PASS: LocalStorage verification: ZERO raw emails or phone numbers exist in localStorage');

  // Test 4: Payload sanitization (stripping / hashing PII in event params)
  console.log('\n[TEST 4] Verifying sanitizePayloadForStorage...');
  const sensitivePayload = {
    order_id: '12345',
    customer_email: 'sensitive@customer.com',
    customer_phone: '01899887766',
    shipping_address: 'House 12, Road 4, Sector 7, Uttara, Dhaka',
    value: 1500,
  };
  const sanitizedPayload = sanitizePayloadForStorage(sensitivePayload);
  assert.strictEqual(sanitizedPayload.shipping_address, undefined, 'Sensitive physical address must be scrubbed');
  assert.strictEqual(sanitizedPayload.customer_email, undefined, 'Raw customer_email must be removed');
  assert.strictEqual(sanitizedPayload.customer_phone, undefined, 'Raw customer_phone must be removed');
  assert.strictEqual(sanitizedPayload.customer_email_sha256, sha256Sync('sensitive@customer.com'), 'Hashed email must exist');
  assert.strictEqual(sanitizedPayload.customer_phone_sha256, sha256Sync('01899887766'), 'Hashed phone must exist');
  assert.strictEqual(sanitizedPayload.value, 1500, 'Non-PII fields must be preserved');
  console.log('✓ PASS: Payload sanitization successfully scrubs physical addresses and hashes email/phone keys');

  // Test 5: Retroactive cleansing of legacy unhashed logs in localStorage
  console.log('\n[TEST 5] Verifying retroactive cleansing of legacy unhashed localStorage logs...');
  const legacyDirtyLogs = [
    {
      id: 'legacy-evt-1',
      timestamp: '12:00:00 PM',
      eventName: 'Purchase',
      platforms: ['meta'],
      status: 'success',
      hasUserData: true,
      userDataSummary: 'Email (dirty.user@legacy.com), Phone (01700112233)',
      payload: {
        customer_email: 'dirty.user@legacy.com',
        address: 'Secret Old Road',
        value: 1200,
      },
    },
  ];
  mockStorage['rongdhonu_pixel_logs_v1'] = JSON.stringify(legacyDirtyLogs);

  // Calling getStoredPixelLogs() should detect legacy PII and purge it
  const cleanedLogs = getStoredPixelLogs();
  assert(!cleanedLogs[0].userDataSummary?.includes('dirty.user@legacy.com'), 'Legacy raw email must be scrubbed from memory');
  assert(!cleanedLogs[0].userDataSummary?.includes('01700112233'), 'Legacy raw phone must be scrubbed from memory');
  assert(cleanedLogs[0].userDataSummary?.includes('SHA-256'), 'Must be replaced with SHA-256 marker');

  // Verify that localStorage itself was retroactively rewritten clean
  const updatedStorage = mockStorage['rongdhonu_pixel_logs_v1'];
  assert(!updatedStorage.includes('dirty.user@legacy.com'), 'CRITICAL: Raw email persisted in localStorage after read!');
  assert(!updatedStorage.includes('01700112233'), 'CRITICAL: Raw phone persisted in localStorage after read!');
  assert(!updatedStorage.includes('Secret Old Road'), 'CRITICAL: Raw address persisted in localStorage after read!');
  console.log('✓ PASS: Legacy logs retroactively scrubbed and rewritten cleanly in localStorage');

  // Test 6: Meta Conversions API (CAPI) Compatibility
  console.log('\n[TEST 6] Verifying Meta Conversions API (CAPI) payload builder...');
  const capiData = buildMetaCapiUserData(
    {
      email: 'capi.customer@shop.com',
      phone: '01912345678',
      firstName: 'Rahim',
      lastName: 'Uddin',
      district: 'Chattogram',
    },
    '103.205.71.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'fb.1.1689234567.12345678',
    'fb.1.1689234567.AbCdEf123'
  );

  assert(Array.isArray(capiData.em), 'CAPI em must be array');
  assert.strictEqual(capiData.em[0], sha256Sync('capi.customer@shop.com'), 'CAPI em must be SHA-256');
  assert(Array.isArray(capiData.ph), 'CAPI ph must be array');
  assert.strictEqual(capiData.ph[0], sha256Sync('8801912345678'), 'CAPI ph must be E.164 Bangladeshi SHA-256');
  assert(Array.isArray(capiData.fn), 'CAPI fn must be array');
  assert.strictEqual(capiData.fn[0], sha256Sync('rahim'), 'CAPI fn must be lowercase SHA-256');
  assert.strictEqual(capiData.client_ip_address, '103.205.71.1', 'CAPI client IP must match');
  assert.strictEqual(capiData.fbp, 'fb.1.1689234567.12345678', 'CAPI fbp must match');
  console.log('✓ PASS: Meta Conversions API (CAPI) compatibility verified with standard hashed array structures');

  console.log('\n======================================================================');
  console.log('🎉 ALL PRIVACY & SECURITY AUDIT CHECKS PASSED WITH 100% COMPLIANCE!');
  console.log('======================================================================');
}

runPrivacyAudit().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
