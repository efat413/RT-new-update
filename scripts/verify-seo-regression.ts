/**
 * Automated Verification Script for SEO, Google Indexing, and Core Regression
 */

import { ROBOTS_TXT_CONTENT, generateSitemapXml, getProductSEOMetadata, getCategorySEOData, generateProductSchema, SITE_DOMAIN } from '../src/utils/seo';
import { INITIAL_PRODUCTS, INITIAL_CATEGORIES } from '../src/data/seedData';

async function runRegressionSuite() {
  console.log('====================================================');
  console.log('STARTING AUTOMATED SEO & REGRESSION VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // TEST 13: Verify robots.txt
  console.log('\n--- Checking TEST 13: robots.txt ---');
  assert(ROBOTS_TXT_CONTENT.includes('User-agent: *'), 'TEST 13.1: robots.txt has User-agent: *');
  assert(ROBOTS_TXT_CONTENT.includes('Allow: /'), 'TEST 13.2: robots.txt allows public root (homepage, categories, products)');
  assert(!ROBOTS_TXT_CONTENT.includes('Disallow: /?'), 'TEST 13.3: robots.txt does not block query param URLs (?product=, ?category=)');
  assert(ROBOTS_TXT_CONTENT.includes(`Sitemap: ${SITE_DOMAIN}/sitemap.xml`), 'TEST 13.4: robots.txt declares authoritative sitemap');

  // TEST 14: Verify sitemap.xml
  console.log('\n--- Checking TEST 14: sitemap.xml ---');
  const sitemapXml = generateSitemapXml(INITIAL_CATEGORIES, INITIAL_PRODUCTS);
  assert(sitemapXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'TEST 14.1: sitemap starts with XML declaration');
  assert(sitemapXml.includes('<loc>https://rongdhonutrade.com/</loc>'), 'TEST 14.2: sitemap includes homepage canonical URL');
  assert(sitemapXml.includes('https://rongdhonutrade.com/category/mens-accessories'), 'TEST 14.3: sitemap includes category canonical URLs');
  assert(!sitemapXml.includes('?category='), 'TEST 14.3b: sitemap does not include old ?category= query URLs');
  assert(sitemapXml.includes('https://rongdhonutrade.com/product/prod-wallet-01'), 'TEST 14.4: sitemap includes product canonical URLs');
  assert(!sitemapXml.includes('?product='), 'TEST 14.4b: sitemap does not include old ?product= query URLs');
  assert(!sitemapXml.includes('/admin'), 'TEST 14.5: sitemap excludes /admin');
  assert(!sitemapXml.includes('/checkout'), 'TEST 14.6: sitemap excludes /checkout');
  assert(!sitemapXml.includes('/account'), 'TEST 14.7: sitemap excludes /account');
  assert(!sitemapXml.includes('/cart'), 'TEST 14.8: sitemap excludes /cart');
  assert(!sitemapXml.includes('/api/'), 'TEST 14.9: sitemap excludes API routes');

  // TEST 15: Private pages are not indexable
  console.log('\n--- Checking TEST 15: Private pages protection ---');
  assert(ROBOTS_TXT_CONTENT.includes('Disallow: /admin'), 'TEST 15.1: /admin disallowed in robots.txt');
  assert(ROBOTS_TXT_CONTENT.includes('Disallow: /account'), 'TEST 15.2: /account disallowed in robots.txt');
  assert(ROBOTS_TXT_CONTENT.includes('Disallow: /cart'), 'TEST 15.3: /cart disallowed in robots.txt');
  assert(ROBOTS_TXT_CONTENT.includes('Disallow: /checkout'), 'TEST 15.4: /checkout disallowed in robots.txt');
  assert(ROBOTS_TXT_CONTENT.includes('Disallow: /api'), 'TEST 15.5: /api disallowed in robots.txt');

  // TEST 16: Public product pages SEO and Schema.org
  console.log('\n--- Checking TEST 16: Product metadata and Schema.org ---');
  const sampleProd = INITIAL_PRODUCTS[0];
  const prodMeta = getProductSEOMetadata(sampleProd, 'Rongdhonu Trade');
  assert(prodMeta.title.includes(sampleProd.title) && prodMeta.title.includes('Rongdhonu Trade'), 'TEST 16.1: Product has unique branded title');
  assert(prodMeta.description.includes(sampleProd.title) && prodMeta.description.includes(sampleProd.price.toLocaleString()), 'TEST 16.2: Product description includes price and features');
  assert(prodMeta.canonicalUrl === `https://rongdhonutrade.com/product/${encodeURIComponent(sampleProd.id)}`, 'TEST 16.3: Canonical URL matches product ID');

  const prodSchema = generateProductSchema(sampleProd, 'Men\'s Accessories', 'Rongdhonu Trade');
  assert(prodSchema['@type'] === 'Product', 'TEST 16.4: Product Schema is type Product');
  assert(prodSchema.offers.price === sampleProd.price, 'TEST 16.5: Schema price matches real product price');
  assert(prodSchema.offers.priceCurrency === 'BDT', 'TEST 16.6: Schema currency is BDT');
  assert(!('buyingPrice' in prodSchema || 'cost' in prodSchema), 'TEST 16.7: Schema does not leak private buyingPrice');

  // TEST 17: Category pages SEO
  console.log('\n--- Checking TEST 17: Category pages SEO ---');
  const sampleCat = INITIAL_CATEGORIES[0];
  const catData = getCategorySEOData(sampleCat, 'Rongdhonu Trade');
  assert(Boolean(catData.title && catData.title.length > 10), 'TEST 17.1: Category has descriptive title');
  assert(Boolean(catData.h1 && catData.h1.length > 5), 'TEST 17.2: Category has visible H1');
  assert(Boolean(catData.description && catData.description.length > 20), 'TEST 17.3: Category has useful meta description');

  // TEST 18: No accidental noindex on public catalog
  console.log('\n--- Checking TEST 18: Indexing safety ---');
  assert(!prodMeta.noIndex, 'TEST 18.1: Valid products are NOT marked noindex');

  // TEST 20: Real production domain
  console.log('\n--- Checking TEST 20: Production domain usage ---');
  assert(SITE_DOMAIN === 'https://rongdhonutrade.com', 'TEST 20.1: SITE_DOMAIN is https://rongdhonutrade.com');
  assert(!sitemapXml.includes('http://localhost'), 'TEST 20.2: No localhost in sitemap.xml');
  assert(!sitemapXml.includes('example.com'), 'TEST 20.3: No example.com in sitemap.xml');

  // TEST 21: Brand SEO and Language Representations
  console.log('\n--- Checking TEST 21: Brand SEO & Bilingual Representations ---');
  const { DEFAULT_SITE_NAME, DEFAULT_BENGALI_BRAND_NAME, BRAND_SEARCH_VARIATIONS, generateOrganizationSchema, generateWebSiteSchema, DEFAULT_HOMEPAGE_TITLE, DEFAULT_HOMEPAGE_DESCRIPTION } = await import('../src/utils/seo');
  assert(DEFAULT_SITE_NAME === 'Rongodhonu Trade', 'TEST 21.1: Preferred English brand name is Rongodhonu Trade');
  assert(DEFAULT_BENGALI_BRAND_NAME === 'রঙধনু ট্রেড', 'TEST 21.2: Preferred Bengali brand name is রঙধনু ট্রেড');
  assert(BRAND_SEARCH_VARIATIONS.includes('Rongdhonu'), 'TEST 21.3: Brand variations include Rongdhonu');
  assert(BRAND_SEARCH_VARIATIONS.includes('রংধনু'), 'TEST 21.4: Brand variations include রংধনু');
  assert(BRAND_SEARCH_VARIATIONS.includes('রঙধনু'), 'TEST 21.5: Brand variations include রঙধনু');

  const orgSchema = generateOrganizationSchema();
  assert(orgSchema.name === 'Rongodhonu Trade', 'TEST 21.6: Organization schema name is Rongodhonu Trade');
  assert(Array.isArray((orgSchema as any).alternateName) && (orgSchema as any).alternateName.includes('রঙধনু ট্রেড'), 'TEST 21.7: Organization schema has Bengali alternateName');
  assert((orgSchema as any).alternateName.includes('Rongdhonu'), 'TEST 21.8: Organization schema includes Rongdhonu variant');

  const siteSchema = generateWebSiteSchema();
  assert(siteSchema.name === 'Rongodhonu Trade', 'TEST 21.9: WebSite schema name is Rongodhonu Trade');
  assert(Array.isArray((siteSchema as any).alternateName) && (siteSchema as any).alternateName.includes('রঙধনু ট্রেড'), 'TEST 21.10: WebSite schema has Bengali alternateName');

  assert(DEFAULT_HOMEPAGE_TITLE.includes('Rongodhonu Trade') && DEFAULT_HOMEPAGE_TITLE.includes('রঙধনু ট্রেড'), 'TEST 21.11: Homepage title includes English and Bengali brand names');
  assert(DEFAULT_HOMEPAGE_DESCRIPTION.includes('Rongodhonu Trade') && DEFAULT_HOMEPAGE_DESCRIPTION.includes('রঙধনু ট্রেড'), 'TEST 21.12: Homepage description includes English and Bengali brand names');

  // TEST 22: Category Intent Resolution for All 15 Categories
  console.log('\n--- Checking TEST 22: Category Intent & Targeted Keyword Resolution ---');
  const testCategories = [
    { name: 'Leather Wallets', slug: 'wallets', expectedWord: 'মানিব্যাগ' },
    { name: 'Fashion Bracelets', slug: 'bracelets', expectedWord: 'ব্রেসলেট' },
    { name: "Men's Bracelet", slug: 'mens-bracelet', expectedWord: 'ব্রেসলেট' },
    { name: 'Custom Laser Print Money Bag', slug: 'custom-money-bag', expectedWord: 'লেজার প্রিন্ট' },
    { name: 'Custom Photo Frame', slug: 'custom-photo-frame', expectedWord: 'ফটো ফ্রেম' },
    { name: 'Custom Laser Print Keyring', slug: 'custom-keyring', expectedWord: 'কী-রিং' },
    { name: 'Custom Laser Print Water Bottle', slug: 'custom-water-bottle', expectedWord: 'বোতল' },
    { name: 'Custom Laser Print Bracelet', slug: 'custom-bracelet', expectedWord: 'লেজার প্রিন্ট ব্রেসলেট' },
    { name: 'Bluetooth Speakers', slug: 'bluetooth-speakers', expectedWord: 'ব্লুটুথ স্পিকার' },
    { name: 'Data Cables', slug: 'data-cables', expectedWord: 'ডাটা ক্যাবল' },
    { name: 'Fast Chargers', slug: 'chargers', expectedWord: 'চার্জার' },
    { name: 'TWS Earbuds', slug: 'tws-earbuds', expectedWord: 'ইয়ারবাডস' },
    { name: 'Wireless Headphones', slug: 'headphones', expectedWord: 'হেডফোন' },
    { name: 'Portable Power Bank', slug: 'power-banks', expectedWord: 'পাওয়ার ব্যাংক' },
    { name: 'Smart Watches', slug: 'watches', expectedWord: 'ঘড়ি' },
  ];

  for (const tc of testCategories) {
    const data = getCategorySEOData({ id: tc.slug, name: tc.name, slug: tc.slug, description: '' } as any);
    assert(Boolean(data.title && data.title.includes('Rongodhonu Trade')), `TEST 22 [${tc.name}]: Title contains Rongodhonu Trade`);
    assert(Boolean(data.h1 && data.h1.length > 5), `TEST 22 [${tc.name}]: Visible H1 is generated`);
    assert(Boolean(data.description && data.description.includes(tc.expectedWord)), `TEST 22 [${tc.name}]: Description contains relevant targeted term "${tc.expectedWord}"`);
  }

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
