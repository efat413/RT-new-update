import { DEFAULT_STORE_SETTINGS } from '../src/data/defaultSettings';
import { generateOrganizationSchema } from '../src/utils/seo';
import { generateInvoiceHtml } from '../src/utils/invoice';
import { sanitizeSettingsForBrowserStorage } from '../src/utils/courierStorage';
import { controlledMergeSettings, parseStoreSettingsRow } from '../src/server/db';
import { Order } from '../src/types';
import { getTestAdminToken, TEST_BASE_URL } from './test-auth-helper';

async function runAssertions() {
  console.log('--- RUNNING ADDRESS AUDIT ASSERTIONS ---');

  // 1. Check DEFAULT_STORE_SETTINGS
  if (DEFAULT_STORE_SETTINGS.footer.officeAddress !== 'Uttara, Dhaka 1230') {
    throw new Error(`defaultSettings.footer.officeAddress expected "Uttara, Dhaka 1230", got: ${DEFAULT_STORE_SETTINGS.footer.officeAddress}`);
  }
  if (DEFAULT_STORE_SETTINGS.address !== 'Uttara, Dhaka 1230') {
    throw new Error(`defaultSettings.address expected "Uttara, Dhaka 1230", got: ${DEFAULT_STORE_SETTINGS.address}`);
  }
  console.log('✓ defaultSettings verified: Uttara, Dhaka 1230');

  // 2. Check generateOrganizationSchema
  const orgSchema = generateOrganizationSchema(DEFAULT_STORE_SETTINGS);
  const serializedOrg = JSON.stringify(orgSchema);
  if (serializedOrg.includes('House 14') || serializedOrg.includes('Sector 7')) {
    throw new Error(`generateOrganizationSchema contains old street address: ${serializedOrg}`);
  }
  if (orgSchema.address.addressLocality !== 'Uttara' || orgSchema.address.addressRegion !== 'Dhaka' || orgSchema.address.postalCode !== '1230') {
    throw new Error(`generateOrganizationSchema address mismatch: ${JSON.stringify(orgSchema.address)}`);
  }
  console.log('✓ generateOrganizationSchema verified: no old address present, PostalAddress is clean Uttara, Dhaka 1230');

  // 3. Check Invoice generation fallback
  const mockOrder: Order = {
    id: 'ord-test-1',
    orderNumber: 'RT-20261019-9999',
    customer: {
      fullName: 'Test Customer',
      phone: '01712345678',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
      fullAddress: 'Dhanmondi, Dhaka',
    },
    items: [],
    subtotal: 1000,
    deliveryFee: 80,
    totalAmount: 1080,
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    shippingStatus: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Test invoice with empty address
  const htmlEmpty = generateInvoiceHtml(mockOrder, { ...DEFAULT_STORE_SETTINGS, address: '' });
  if (htmlEmpty.includes('House 14') || htmlEmpty.includes('Sector 7')) {
    throw new Error('generateInvoiceHtml with empty address fell back to outdated address!');
  }
  if (!htmlEmpty.includes('Uttara, Dhaka 1230')) {
    throw new Error('generateInvoiceHtml with empty address did not include Uttara, Dhaka 1230');
  }

  // Test invoice with outdated address in settings
  const htmlOutdated = generateInvoiceHtml(mockOrder, {
    ...DEFAULT_STORE_SETTINGS,
    address: 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh',
  });
  if (htmlOutdated.includes('House 14') || htmlOutdated.includes('Sector 7')) {
    throw new Error('generateInvoiceHtml failed to filter out outdated address!');
  }
  if (!htmlOutdated.includes('Uttara, Dhaka 1230')) {
    throw new Error('generateInvoiceHtml failed to normalize outdated address to Uttara, Dhaka 1230');
  }
  console.log('✓ Invoice HTML verified: correctly falls back and sanitizes to Uttara, Dhaka 1230');

  // 4. Check sanitizeSettingsForBrowserStorage
  const staleBrowserSettings = {
    address: 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh',
    footer: {
      officeAddress: 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh',
    },
  };
  const sanitizedBrowser = sanitizeSettingsForBrowserStorage(staleBrowserSettings);
  if (sanitizedBrowser.address !== 'Uttara, Dhaka 1230' || sanitizedBrowser.footer.officeAddress !== 'Uttara, Dhaka 1230') {
    throw new Error(`sanitizeSettingsForBrowserStorage failed: ${JSON.stringify(sanitizedBrowser)}`);
  }
  console.log('✓ Browser storage sanitization verified: stale cached settings upgraded to Uttara, Dhaka 1230');

  // 5. Check D1 controlledMergeSettings & parseStoreSettingsRow
  const staleD1Json = JSON.stringify({
    siteName: 'Rongdhonu Trade',
    address: 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh',
    footer: {
      officeAddress: 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh',
    },
  });
  const parsedFromD1 = parseStoreSettingsRow({ settings_json: staleD1Json });
  if (parsedFromD1.address !== 'Uttara, Dhaka 1230' || parsedFromD1.footer.officeAddress !== 'Uttara, Dhaka 1230') {
    throw new Error(`parseStoreSettingsRow failed to sanitize D1 data: ${JSON.stringify(parsedFromD1)}`);
  }

  const merged = controlledMergeSettings(DEFAULT_STORE_SETTINGS, {
    footer: {
      ...DEFAULT_STORE_SETTINGS.footer,
      officeAddress: 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh',
    },
  });
  if (merged.footer.officeAddress !== 'Uttara, Dhaka 1230') {
    throw new Error(`controlledMergeSettings failed: ${merged.footer.officeAddress}`);
  }
  console.log('✓ D1 database settings parsing & merging verified: old address is replaced with Uttara, Dhaka 1230');

  // 6. Live dev server API check
  try {
    const adminToken = await getTestAdminToken(TEST_BASE_URL);
    console.log('✓ Admin authenticated for settings API verification');

    // Attempt to save an address update via API
    const saveRes = await fetch(`${TEST_BASE_URL}/api/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        settings: {
          footer: {
            officeAddress: 'Uttara, Dhaka 1230',
          },
        },
      }),
    });

    if (!saveRes.ok) {
      throw new Error(`Save settings failed with HTTP ${saveRes.status}`);
    }
    const saveData = await saveRes.json();
    if (!saveData.success || saveData.settings.footer.officeAddress !== 'Uttara, Dhaka 1230') {
      throw new Error(`Save settings response unexpected: ${JSON.stringify(saveData)}`);
    }
    console.log('✓ Admin Panel save settings API verified: address persists as Uttara, Dhaka 1230');

    // Attempt to save outdated address via API - should be sanitized
    const saveOutdatedRes = await fetch(`${TEST_BASE_URL}/api/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        settings: {
          footer: {
            officeAddress: 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh',
          },
        },
      }),
    });
    if (!saveOutdatedRes.ok) {
      throw new Error(`Save outdated settings failed with HTTP ${saveOutdatedRes.status}`);
    }
    const saveOutdatedData = await saveOutdatedRes.json();
    if (saveOutdatedData.settings.footer.officeAddress.includes('House 14') || saveOutdatedData.settings.footer.officeAddress.includes('Sector 7')) {
      throw new Error('API failed to sanitize outdated address upon update');
    }
    console.log('✓ API sanitization guard verified: attempts to submit outdated address are normalized to Uttara, Dhaka 1230');

    // Verify public homepage endpoint
    const publicHpRes = await fetch(`${TEST_BASE_URL}/api/store/homepage`);
    const publicHp = await publicHpRes.json();
    if (publicHp.settings?.footer?.officeAddress !== 'Uttara, Dhaka 1230') {
      throw new Error(`Public homepage API returned incorrect officeAddress: ${publicHp.settings?.footer?.officeAddress}`);
    }
    if (publicHp.settings?.address !== 'Uttara, Dhaka 1230') {
      throw new Error(`Public homepage API returned incorrect address: ${publicHp.settings?.address}`);
    }
    console.log('✓ Public homepage API verified: returns Uttara, Dhaka 1230');

    // Verify public HTML output
    const htmlRes = await fetch(`${TEST_BASE_URL}/`);
    const html = await htmlRes.text();
    if (html.includes('House 14') || html.includes('Sector 7')) {
      throw new Error('Public HTML contains outdated street address!');
    }
    console.log('✓ Public HTML verified: contains zero occurrences of old street address');
  } catch (err: any) {
    console.error('API Verification error:', err?.message || err);
    throw err;
  }

  console.log('\n=== ALL ADDRESS REMOVAL AUDIT ASSERTIONS COMPLETED SUCCESSFULLY ===');
}

runAssertions().catch((err) => {
  console.error(err);
  process.exit(1);
});
