/**
 * Security Verification Suite: Courier Credential Storage Refactor
 * Verifies that:
 * 1. localStorage courierConfigs contains no API key or secret key.
 * 2. Existing localStorage data containing credentials is sanitized.
 * 3. Public/client API responses never expose plaintext courier credentials.
 * 4. Production courier API calls use Worker secrets.
 * 5. Missing Worker credentials fail safely without leaking sensitive data.
 * 6. D1 settings updates cannot persist steadfastApiKey or steadfastSecretKey.
 * 7. Existing admin courier functionality still works using server-side credentials.
 */

import {
  sanitizeCourierConfig,
  sanitizeCourierConfigs,
  sanitizeSettingsForBrowserStorage,
  sanitizeWebhooksForBrowserStorage,
  sanitizeAllBrowserStorage,
  ALLOWED_COURIER_METADATA_KEYS,
  FORBIDDEN_CREDENTIAL_KEYS,
} from '../src/utils/courierStorage';
import { INITIAL_COURIER_CONFIGS, INITIAL_SETTINGS } from '../src/data/seedData';
import {
  controlledMergeSettings,
  updateStoreSettingsInD1,
  getStoreSettings,
  detectLegacyD1CourierCredentials,
  cleanupLegacyCourierCredentialsFromD1,
} from '../src/server/db';
import { handleApiRequest } from '../src/server/router';
import { createAuthToken } from '../src/server/auth';

async function runSecurityTests() {
  console.log('================================================================');
  console.log('STARTING COURIER CREDENTIAL STORAGE SECURITY VERIFICATION');
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
  // REQUIREMENT 1: localStorage courierConfigs contains no API key or secret key
  // =========================================================================
  console.log('--- REQUIREMENT 1: Sanitizer & Seed Data Credential Absence ---');

  // Test 1.1: INITIAL_COURIER_CONFIGS must not have any credential fields
  for (const config of INITIAL_COURIER_CONFIGS) {
    const hasApiKey = 'apiKey' in config && (config as any).apiKey !== '';
    const hasSecretKey = 'secretKey' in config && (config as any).secretKey !== '';
    assert(
      !hasApiKey && !hasSecretKey,
      `1.1 INITIAL_COURIER_CONFIGS for ${config.name} has no plaintext credentials`
    );
  }

  // Test 1.2: sanitizeCourierConfig strips all forbidden credential keys
  const dirtyConfig = {
    id: 'courier-dirty-1',
    name: 'Steadfast Courier',
    code: 'Steadfast',
    apiKey: 'merchant_secret_key_12345',
    secretKey: 'merchant_secret_value_67890',
    steadfastApiKey: 'legacy_api_key',
    steadfastSecretKey: 'legacy_secret_key',
    webhookSecret: 'webhook_sec_abc',
    secret: 'top_secret_val',
    authorization: 'Bearer token123',
    token: 'jwt_token',
    password: 'super_password',
    COURIER_WEBHOOK_SECRET: 'courier_webhook_secret',
    baseUrl: 'https://portal.packzy.com/api/v1',
    trackingUrlPattern: 'https://steadfast.com.bd/t/{trackingCode}',
    isActive: true,
    triggerWebhookOnAdd: true,
  };

  const cleanConfig = sanitizeCourierConfig(dirtyConfig);
  let leakFound = false;
  for (const forbidden of FORBIDDEN_CREDENTIAL_KEYS) {
    if (forbidden in cleanConfig) {
      leakFound = true;
      console.error(`Found leaked key: ${forbidden}`);
    }
  }
  assert(!leakFound, '1.2 sanitizeCourierConfig strips all forbidden credential keys');

  // Test 1.3: Allowed metadata keys are strictly preserved
  assert(
    cleanConfig.id === 'courier-dirty-1' &&
      cleanConfig.name === 'Steadfast Courier' &&
      cleanConfig.code === 'Steadfast' &&
      cleanConfig.baseUrl === 'https://portal.packzy.com/api/v1' &&
      cleanConfig.trackingUrlPattern === 'https://steadfast.com.bd/t/{trackingCode}' &&
      cleanConfig.isActive === true &&
      cleanConfig.triggerWebhookOnAdd === true,
    '1.3 Allowed courier metadata keys (id, name, code, baseUrl, trackingUrlPattern, isActive, triggerWebhookOnAdd) preserved'
  );

  // =========================================================================
  // REQUIREMENT 2: Existing localStorage data containing credentials is sanitized
  // =========================================================================
  console.log('\n--- REQUIREMENT 2: Existing Storage Data Sanitization ---');

  // Mock a browser window.localStorage environment
  const mockStorageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => mockStorageMap.get(key) || null,
    setItem: (key: string, val: string) => mockStorageMap.set(key, val),
    removeItem: (key: string) => mockStorageMap.delete(key),
    get length() {
      return mockStorageMap.size;
    },
    key: (i: number) => Array.from(mockStorageMap.keys())[i] || null,
  };

  (globalThis as any).window = {
    localStorage: mockLocalStorage,
    sessionStorage: mockLocalStorage,
  };

  // Seed storage with dirty legacy entries
  mockLocalStorage.setItem(
    'rongdhonu_couriers_v1',
    JSON.stringify([
      {
        id: 'courier-old',
        name: 'Steadfast',
        code: 'steadfast',
        apiKey: 'dirty_api_key_stored_in_browser',
        secretKey: 'dirty_secret_key_stored_in_browser',
        baseUrl: 'https://portal.packzy.com/api/v1',
        trackingUrlPattern: 'https://steadfast.com.bd/t/{trackingCode}',
        isActive: true,
      },
    ])
  );

  mockLocalStorage.setItem(
    'rongdhonu_settings',
    JSON.stringify({
      siteName: 'Rongdhonu Trade',
      phone: '01800000000',
      steadfastApiKey: 'stored_d1_steadfast_key',
      steadfastSecretKey: 'stored_d1_steadfast_secret',
    })
  );

  mockLocalStorage.setItem(
    'rongdhonu_courier_webhooks_v1',
    JSON.stringify([
      {
        id: 'wh-test-1',
        name: 'Alert Webhook',
        url: 'https://example.com/webhook',
        secret: 'webhook_secret_in_browser_storage',
        hasSecret: true,
        events: ['courier.added'],
      },
    ])
  );

  mockLocalStorage.setItem('steadfast_api_key_orphan', 'orphan_secret_123');

  // Run full browser storage sanitization
  sanitizeAllBrowserStorage();

  // Verify couriers cleaned
  const sanitizedCouriersRaw = mockLocalStorage.getItem('rongdhonu_couriers_v1');
  const sanitizedCouriers = JSON.parse(sanitizedCouriersRaw || '[]');
  assert(
    sanitizedCouriers[0]?.apiKey === undefined && sanitizedCouriers[0]?.secretKey === undefined,
    '2.1 rongdhonu_couriers_v1 in storage has apiKey and secretKey removed'
  );
  assert(
    !sanitizedCouriersRaw?.includes('dirty_api_key') && !sanitizedCouriersRaw?.includes('dirty_secret_key'),
    '2.2 Serialized storage string contains zero credential substrings'
  );

  // Verify settings cleaned
  const sanitizedSettingsRaw = mockLocalStorage.getItem('rongdhonu_settings');
  const sanitizedSettings = JSON.parse(sanitizedSettingsRaw || '{}');
  assert(
    sanitizedSettings.steadfastApiKey === undefined && sanitizedSettings.steadfastSecretKey === undefined,
    '2.3 rongdhonu_settings in storage has steadfastApiKey and steadfastSecretKey removed'
  );

  // Verify webhooks cleaned
  const sanitizedWebhooksRaw = mockLocalStorage.getItem('rongdhonu_courier_webhooks_v1');
  const sanitizedWebhooks = JSON.parse(sanitizedWebhooksRaw || '[]');
  assert(
    sanitizedWebhooks[0]?.secret === undefined,
    '2.4 rongdhonu_courier_webhooks_v1 in storage has secret removed'
  );

  // Verify orphan key purged
  assert(
    mockLocalStorage.getItem('steadfast_api_key_orphan') === null,
    '2.5 Orphan credential storage keys (e.g. steadfast_api_key_orphan) purged completely'
  );

  // =========================================================================
  // REQUIREMENT 3: Public/client API responses never expose plaintext courier credentials
  // =========================================================================
  console.log('\n--- REQUIREMENT 3: API Response Plaintext Credential Protection ---');

  // Create mock D1 database
  const d1Store = new Map<string, any>();
  const mockD1Database: any = {
    prepare: (query: string) => {
      let boundParams: any[] = [];
      return {
        bind: (...params: any[]) => {
          boundParams = params;
          return {
            first: async () => {
              if (query.includes('FROM store_settings')) {
                const row = d1Store.get('store_settings:default');
                return row || null;
              }
              if (query.includes('FROM users')) {
                return {
                  id: 'admin-user-1',
                  email: 'superadmin@rongdhonu.com',
                  role: 'super_admin',
                  password_hash: 'mockhash',
                };
              }
              return null;
            },
            run: async () => {
              if (query.includes('UPDATE store_settings') || query.includes('INSERT INTO store_settings')) {
                d1Store.set('store_settings:default', {
                  id: 'default',
                  settings_json: boundParams[0],
                  updated_at: new Date().toISOString(),
                });
                return { success: true };
              }
              return { success: true };
            },
            all: async () => ({ results: [] }),
          };
        },
        first: async () => {
          if (query.includes('FROM store_settings')) {
            const row = d1Store.get('store_settings:default');
            return row || null;
          }
          return null;
        },
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
      };
    },
  };

  // Seed D1 with settings containing legacy keys
  d1Store.set('store_settings:default', {
    id: 'default',
    settings_json: JSON.stringify({
      ...INITIAL_SETTINGS,
      steadfastApiKey: 'd1_raw_secret_api_key_99999',
      steadfastSecretKey: 'd1_raw_secret_value_88888',
    }),
    updated_at: new Date().toISOString(),
  });

  const testEnv = {
    DB: mockD1Database,
    ADMIN_SECRET: 'super-secure-admin-secret-for-tests-min-32-chars-long!',
    STEADFAST_API_KEY: 'env_worker_secret_key_111',
    STEADFAST_SECRET_KEY: 'env_worker_secret_val_222',
    COURIER_WEBHOOK_SECRET: 'env_courier_webhook_secret_333',
  };

  // Test 3.1: Public GET /api/settings (unauthenticated) never includes courier credentials
  const publicReq = new Request('https://rongdhonutrade.com/api/settings', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const publicRes = await handleApiRequest(publicReq, testEnv);
  const publicData = await publicRes.json();
  assert(
    publicData.settings?.steadfastApiKey === undefined &&
      publicData.settings?.steadfastSecretKey === undefined,
    '3.1 Public GET /api/settings returns no steadfastApiKey or steadfastSecretKey'
  );
  assert(
    !JSON.stringify(publicData).includes('d1_raw_secret_api_key_99999') &&
      !JSON.stringify(publicData).includes('env_worker_secret_key_111'),
    '3.2 Public settings response contains zero plaintext secrets'
  );

  // Test 3.3: Authenticated Admin GET /api/settings returns masked values only
  const adminToken = await createAuthToken(
    { userId: 'admin-user-1', email: 'superadmin@rongdhonu.com', role: 'super_admin' },
    testEnv.ADMIN_SECRET
  );

  const adminReq = new Request('https://rongdhonutrade.com/api/settings', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
  });
  const adminRes = await handleApiRequest(adminReq, testEnv);
  const adminData = await adminRes.json();
  assert(
    adminData.settings?.steadfastApiKey === '••••••••' &&
      adminData.settings?.steadfastSecretKey === '••••••••',
    '3.3 Authenticated Admin GET /api/settings returns strictly masked "••••••••" for UI compatibility'
  );
  assert(
    !JSON.stringify(adminData).includes('d1_raw_secret_api_key_99999') &&
      !JSON.stringify(adminData).includes('env_worker_secret_key_111'),
    '3.4 Admin settings response contains zero plaintext credentials'
  );

  // =========================================================================
  // REQUIREMENT 4: Production courier API calls use Worker secrets
  // =========================================================================
  console.log('\n--- REQUIREMENT 4: Production Courier API Calls Use Worker Secrets ---');

  // Test 4.1: Status endpoint uses Worker secrets
  const statusReq = new Request('https://rongdhonutrade.com/api/courier/steadfast/status/CID-12345', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  const statusRes = await handleApiRequest(statusReq, testEnv);
  // Status will fail outbound to external mock without 503 credentials error, or succeed
  assert(
    statusRes.status !== 503,
    '4.1 /api/courier/steadfast/status succeeds in reading Worker secrets env.STEADFAST_API_KEY'
  );

  // =========================================================================
  // REQUIREMENT 5: Missing Worker credentials fail safely
  // =========================================================================
  console.log('\n--- REQUIREMENT 5: Missing Worker Credentials Fail Safely ---');

  const envWithoutSecrets = {
    DB: mockD1Database,
    ADMIN_SECRET: testEnv.ADMIN_SECRET,
    STEADFAST_API_KEY: '',
    STEADFAST_SECRET_KEY: '',
  };

  // Test 5.1: Missing worker credentials fail safely on status check
  const missingCredsStatusReq = new Request(
    'https://rongdhonutrade.com/api/courier/steadfast/status/CID-12345',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    }
  );
  const missingCredsStatusRes = await handleApiRequest(missingCredsStatusReq, envWithoutSecrets);
  const missingStatusData = await missingCredsStatusRes.json();
  assert(
    missingCredsStatusRes.status === 503,
    '5.1 Missing Worker secrets returns HTTP 503 Service Unavailable'
  );
  assert(
    missingStatusData.error?.includes('temporarily unavailable'),
    '5.2 Safe error message returned without exposing credentials or internal paths'
  );

  // Test 5.3: Missing worker credentials fail safely on test connection
  const missingTestReq = new Request('https://rongdhonutrade.com/api/courier/steadfast/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({}),
  });
  const missingTestRes = await handleApiRequest(missingTestReq, envWithoutSecrets);
  const missingTestData = await missingTestRes.json();
  assert(
    missingTestRes.status === 400 &&
      missingTestData.error ===
        'Steadfast Courier API credentials are not configured in Worker secrets or provided in request.',
    '5.3 Missing credentials in test endpoint returns clean, informative error message'
  );

  // =========================================================================
  // REQUIREMENT 6: D1 settings updates cannot persist steadfastApiKey or steadfastSecretKey
  // =========================================================================
  console.log('\n--- REQUIREMENT 6: D1 Settings Updates Cannot Persist Credentials ---');

  // Test 6.1: controlledMergeSettings strips any submitted credentials
  const mergedSettings = controlledMergeSettings(INITIAL_SETTINGS, {
    siteName: 'Updated Brand Name',
    steadfastApiKey: 'maliciously_submitted_api_key',
    steadfastSecretKey: 'maliciously_submitted_secret_key',
  } as any);

  assert(
    (mergedSettings as any).steadfastApiKey === undefined &&
      (mergedSettings as any).steadfastSecretKey === undefined,
    '6.1 controlledMergeSettings explicitly drops steadfastApiKey and steadfastSecretKey'
  );

  // Test 6.2: PUT /api/admin/settings ignores and never persists submitted credentials
  const updateSettingsReq = new Request('https://rongdhonutrade.com/api/admin/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      settings: {
        siteName: 'Rongdhonu Secured Store',
        steadfastApiKey: 'new_plaintext_attempted_key_999',
        steadfastSecretKey: 'new_plaintext_attempted_secret_888',
      },
    }),
  });
  const updateSettingsRes = await handleApiRequest(updateSettingsReq, testEnv);
  const updateSettingsData = await updateSettingsRes.json();
  assert(
    updateSettingsRes.status === 200 && updateSettingsData.success === true,
    '6.2 PUT /api/admin/settings accepted successfully'
  );

  // Inspect the raw record in mock D1
  const rawD1Record = d1Store.get('store_settings:default');
  const rawParsed = JSON.parse(rawD1Record.settings_json);
  assert(
    rawParsed.steadfastApiKey === undefined && rawParsed.steadfastSecretKey === undefined,
    '6.3 Raw D1 settings_json contains no steadfastApiKey or steadfastSecretKey'
  );
  assert(
    !rawD1Record.settings_json.includes('new_plaintext_attempted_key_999') &&
      !rawD1Record.settings_json.includes('new_plaintext_attempted_secret_888'),
    '6.4 Submitted plaintext credentials never reach the D1 database storage'
  );

  // Test 6.5: detectLegacyD1CourierCredentials and cleanupLegacyCourierCredentialsFromD1
  d1Store.set('store_settings:default', {
    id: 'default',
    settings_json: JSON.stringify({
      ...INITIAL_SETTINGS,
      steadfastApiKey: 'legacy_d1_test_key_abc',
      steadfastSecretKey: 'legacy_d1_test_secret_xyz',
    }),
    updated_at: new Date().toISOString(),
  });

  const legacyReport = await detectLegacyD1CourierCredentials(mockD1Database);
  assert(
    legacyReport.hasLegacyCredentials === true &&
      legacyReport.hasLegacyApiKey === true &&
      legacyReport.hasLegacySecretKey === true,
    '6.5 detectLegacyD1CourierCredentials correctly detects legacy stored keys without exposing plaintext'
  );

  const cleanupRes = await cleanupLegacyCourierCredentialsFromD1(mockD1Database);
  assert(cleanupRes.cleaned === true, '6.6 cleanupLegacyCourierCredentialsFromD1 cleans legacy credentials');

  const afterCleanupRow = d1Store.get('store_settings:default');
  const afterCleanupParsed = JSON.parse(afterCleanupRow.settings_json);
  assert(
    afterCleanupParsed.steadfastApiKey === undefined &&
      afterCleanupParsed.steadfastSecretKey === undefined &&
      afterCleanupParsed.siteName === INITIAL_SETTINGS.siteName,
    '6.7 Legacy credentials purged while preserving all store settings in D1'
  );

  // =========================================================================
  // REQUIREMENT 7: Existing admin courier functionality works using server-side credentials
  // =========================================================================
  console.log('\n--- REQUIREMENT 7: Admin Courier Functionality with Server-Side Credentials ---');

  // Test 7.1: Courier credentials status endpoint
  const credsStatusReq = new Request('https://rongdhonutrade.com/api/admin/courier/credentials/status', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  const credsStatusRes = await handleApiRequest(credsStatusReq, testEnv);
  const credsStatusData = await credsStatusRes.json();
  assert(
    credsStatusRes.status === 200 &&
      credsStatusData.success === true &&
      credsStatusData.workerSecretsConfigured.apiKey === true &&
      credsStatusData.workerSecretsConfigured.secretKey === true,
    '7.1 /api/admin/courier/credentials/status correctly reports Worker Secrets configuration'
  );

  // Test 7.2: Admin test connection using temporary validation credentials in request body
  // does not persist credentials to D1 or storage
  const tempTestReq = new Request('https://rongdhonutrade.com/api/courier/steadfast/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      apiKey: 'temporary_validation_key_only',
      secretKey: 'temporary_validation_secret_only',
      baseUrl: 'https://portal.packzy.com/api/v1',
    }),
  });
  const tempTestRes = await handleApiRequest(tempTestReq, testEnv);
  // Endpoint processes the key for validation without crashing or saving
  assert(
    tempTestRes.status === 200 || tempTestRes.status === 400,
    '7.2 Admin connection test with temporary validation credentials executes server-side validation flow'
  );
  const currentD1AfterTemp = d1Store.get('store_settings:default');
  assert(
    !currentD1AfterTemp.settings_json.includes('temporary_validation_key_only'),
    '7.3 Temporary validation credentials are NOT persisted in D1 store_settings'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
