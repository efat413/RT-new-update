import assert from 'assert';
import {
  generateSitemapXml,
  injectCategorySEOIntoHtml,
  getCategorySEOData,
  SITE_DOMAIN,
} from '../src/utils/seo';
import { INITIAL_CATEGORIES, INITIAL_PRODUCTS } from '../src/data/seedData';

async function runCategorySeoUrlVerification() {
  console.log('===============================================================');
  console.log('STARTING CATEGORY SEO URL VERIFICATION');
  console.log('===============================================================');

  // TEST 1: Sitemap Category URLs
  console.log('\n[TEST 1] Verifying Sitemap XML Category URLs...');
  const sitemapXml = generateSitemapXml(INITIAL_CATEGORIES, INITIAL_PRODUCTS);
  assert(sitemapXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Sitemap has valid XML header');
  assert(sitemapXml.includes('<loc>https://rongdhonutrade.com/</loc>'), 'Sitemap has homepage URL');
  
  for (const cat of INITIAL_CATEGORIES) {
    const slug = cat.slug || cat.id;
    const cleanUrl = `https://rongdhonutrade.com/category/${encodeURIComponent(slug)}`;
    assert(sitemapXml.includes(`<loc>${cleanUrl}</loc>`), `Sitemap must contain clean category URL: ${cleanUrl}`);
  }
  assert(!sitemapXml.includes('/?category='), 'Sitemap must NEVER contain legacy query format /?category=');
  assert(!sitemapXml.includes('?cat='), 'Sitemap must NEVER contain legacy query format ?cat=');
  console.log('✓ All sitemap category URLs use clean /category/{slug} format');
  console.log('✓ Zero /?category= query parameters found in sitemap');

  // TEST 2: Category Canonical URL Generation
  console.log('\n[TEST 2] Verifying Category Canonical URL Generation...');
  const testCat = INITIAL_CATEGORIES[0]; // cat-mens-accessories
  const baseHtml = '<!DOCTYPE html><html><head><title>Original</title><link rel="canonical" href="https://rongdhonutrade.com/" /></head><body><div id="root"></div></body></html>';
  const injectedHtml = injectCategorySEOIntoHtml(baseHtml, testCat, 'Rongdhonu Trade');

  const expectedCanonical = `https://rongdhonutrade.com/category/${encodeURIComponent(testCat.slug || testCat.id)}`;
  assert(
    injectedHtml.includes(`<link rel="canonical" href="${expectedCanonical}" />`),
    `Injected HTML must have canonical link: ${expectedCanonical}`
  );
  assert(!injectedHtml.includes(`/?category=`), 'Injected HTML must NOT contain /?category= canonical URL');

  // Breadcrumbs Schema in Category Page
  assert(
    injectedHtml.includes(`"url": "${expectedCanonical}"`),
    'CollectionPage schema and breadcrumbs must reference clean canonical URL'
  );
  console.log(`✓ Injected category canonical URL verified: ${expectedCanonical}`);
  console.log('✓ Schema.org CollectionPage and breadcrumbs reference clean canonical URL');

  // TEST 3: Preservation of Visible D1 Title and Description
  console.log('\n[TEST 3] Verifying Exact Preservation of Visible D1 Title and Description...');
  // The crawler HTML body must contain the exact category name and description from D1
  assert(injectedHtml.includes(testCat.name), 'Visible H1 must match exact D1 category name');
  if (testCat.description) {
    assert(injectedHtml.includes(testCat.description), 'Visible description must match exact D1 category description');
  }
  console.log('✓ Visible category name and description preserved directly as stored in D1');

  // TEST 4: Live HTTP Endpoints (Direct /category/{slug}, Invalid 404, Legacy 301 Redirect)
  console.log('\n[TEST 4] Testing Live Dev Server Category Routing & Redirects...');
  const baseUrl = 'http://localhost:3000';

  // 4.1 Direct Category URL
  const directRes = await fetch(`${baseUrl}/category/mens-accessories`);
  assert.strictEqual(directRes.status, 200, 'Direct category URL must return HTTP 200');
  const directHtml = await directRes.text();
  assert(directHtml.includes('https://rongdhonutrade.com/category/mens-accessories'), 'Direct response contains clean canonical');
  console.log('✓ Direct /category/mens-accessories returned HTTP 200 with clean canonical');

  // 4.2 Invalid Category URL strictly returns 404
  const invalidRes = await fetch(`${baseUrl}/category/invalid-category-xyz-9999`);
  assert.strictEqual(invalidRes.status, 404, 'Non-existent category must return HTTP 404');
  console.log('✓ Invalid /category/invalid-category-xyz-9999 returned HTTP 404 Not Found');

  // 4.3 Legacy Query URL 301 Permanent Redirect
  const legacyRes = await fetch(`${baseUrl}/?category=mens-accessories`, {
    redirect: 'manual', // do not auto-follow to check 301 status
  });
  assert(
    [301, 302].includes(legacyRes.status),
    `Legacy ?category= query must return redirect (301), got ${legacyRes.status}`
  );
  const locationHeader = legacyRes.headers.get('location');
  assert.strictEqual(
    locationHeader,
    '/category/mens-accessories',
    `Legacy redirect Location must point to /category/mens-accessories, got: ${locationHeader}`
  );
  console.log(`✓ Legacy /?category=mens-accessories returned HTTP ${legacyRes.status} redirecting to ${locationHeader}`);

  // TEST 5: Verify Product URLs remain untouched
  console.log('\n[TEST 5] Verifying Product URLs Remain /product/{productId}...');
  const sampleProd = INITIAL_PRODUCTS[0];
  const prodCanonical = `https://rongdhonutrade.com/product/${encodeURIComponent(sampleProd.id)}`;
  assert(sitemapXml.includes(`<loc>${prodCanonical}</loc>`), `Sitemap product URL must be: ${prodCanonical}`);
  assert(!sitemapXml.includes('/?product='), 'Sitemap product URL must not use ?product=');
  console.log(`✓ Product URL format verified untouched: ${prodCanonical}`);

  console.log('\n===============================================================');
  console.log('ALL CATEGORY SEO URL CHECKS PASSED PERFECTLY ✅');
  console.log('===============================================================');
}

runCategorySeoUrlVerification().catch((err) => {
  console.error('Category SEO URL verification failed:', err);
  process.exit(1);
});
