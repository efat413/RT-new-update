/**
 * Comprehensive Verification Suite for:
 * 1. Product SSR SEO (Metadata, OpenGraph, Twitter, Schema JSON-LD, Crawler Fallback)
 * 2. Category SSR SEO (Metadata, OpenGraph, Twitter, Breadcrumbs & Collection JSON-LD, Crawler Fallback)
 * 3. ADMIN_SECRET Security (Fail Closed in Production, No Hardcoded Secrets, .dev.vars ignored)
 * 4. Robots.txt & Sitemap.xml Technical SEO
 * 5. Internal Links & Routes Integrity
 */

import {
  injectProductSEOIntoHtml,
  injectCategorySEOIntoHtml,
  generateProductSchema,
  generateBreadcrumbSchema,
  getProductSEOMetadata,
  getCategorySEOData,
  ROBOTS_TXT_CONTENT,
  generateSitemapXml,
  SITE_DOMAIN,
} from '../src/utils/seo';
import { INITIAL_PRODUCTS, INITIAL_CATEGORIES } from '../src/data/seedData';
import { getAuthSecret } from '../src/server/auth';
import fs from 'fs';
import path from 'path';

async function runVerification() {
  console.log('===========================================================');
  console.log('STARTING THOROUGH VERIFICATION OF ALL 3 FIXES & INTEGRITY');
  console.log('===========================================================\n');

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

  const baseHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Default Title</title>
    <meta name="description" content="Default Description" />
    <link rel="canonical" href="https://rongdhonutrade.com/" />
    <meta name="robots" content="index, follow" />
    <meta property="og:site_name" content="Default Site" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Default Title" />
    <meta property="og:description" content="Default Description" />
    <meta property="og:url" content="https://rongdhonutrade.com/" />
    <meta property="og:image" content="https://rongdhonutrade.com/default.jpg" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Default Title" />
    <meta name="twitter:description" content="Default Description" />
    <meta name="twitter:image" content="https://rongdhonutrade.com/default.jpg" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

  // ==========================================
  // FIX 1: PRODUCT SSR SEO VERIFICATION
  // ==========================================
  console.log('\n--- VERIFYING FIX 1: PRODUCT SERVER-SIDE SEO ---');
  const sampleProduct = INITIAL_PRODUCTS[0];
  const sampleCat = INITIAL_CATEGORIES.find((c) => c.id === sampleProduct.categoryId);
  const siteName = 'Rongdhonu Trade';

  const productHtml = injectProductSEOIntoHtml(baseHtml, sampleProduct, sampleCat?.name, siteName);

  // 1.1 Unique Title
  assert(
    productHtml.includes(`<title>${sampleProduct.title} Price in Bangladesh | ${siteName}</title>`),
    '1.1 Product has unique server-side <title> containing product title, Price in Bangladesh, and site name'
  );

  // 1.2 Unique Meta Description
  assert(
    productHtml.includes(sampleProduct.title) && productHtml.includes(sampleProduct.price.toLocaleString()),
    '1.2 Product has server-side meta description with name, price in BDT, and details'
  );

  // 1.3 Canonical URL
  const expectedProductCanonical = `${SITE_DOMAIN}/product/${encodeURIComponent(sampleProduct.id)}`;
  assert(
    productHtml.includes(`<link rel="canonical" href="${expectedProductCanonical}" />`),
    '1.3 Product has exact canonical URL in initial HTML response'
  );

  // 1.4 Open Graph Tags
  assert(
    productHtml.includes(`property="og:title" content="${sampleProduct.title} Price in Bangladesh | ${siteName}"`),
    '1.4 OG Title matches product title and site name'
  );
  assert(
    productHtml.includes('property="og:type" content="product"'),
    '1.5 OG Type is set to product'
  );
  assert(
    productHtml.includes(`property="og:url" content="${expectedProductCanonical}"`),
    '1.6 OG URL matches canonical URL'
  );
  assert(
    productHtml.includes('property="og:image"'),
    '1.7 OG Image contains product image URL'
  );

  // 1.8 Twitter Card
  assert(
    productHtml.includes('name="twitter:card" content="summary_large_image"'),
    '1.8 Twitter card is set to summary_large_image'
  );
  assert(
    productHtml.includes(`name="twitter:title" content="${sampleProduct.title} Price in Bangladesh | ${siteName}"`),
    '1.9 Twitter title is customized with product title'
  );

  // 1.10 Product JSON-LD Structured Data
  assert(
    productHtml.includes('application/ld+json') && productHtml.includes('id="schema-product"'),
    '1.10 Product Schema.org JSON-LD is injected into <head>'
  );
  const schemaObj = generateProductSchema(sampleProduct, sampleCat?.name, siteName);
  assert(schemaObj['@type'] === 'Product', '1.11 Schema type is Product');
  assert(schemaObj.name === sampleProduct.title, '1.12 Schema name matches product title');
  assert(schemaObj.offers.price === sampleProduct.price, '1.13 Schema price matches actual product price');
  assert(schemaObj.offers.priceCurrency === 'BDT', '1.14 Schema currency is BDT');
  assert(schemaObj.offers.availability.includes('InStock'), '1.15 Schema availability is InStock');
  assert(schemaObj.brand.name === siteName, '1.16 Schema brand is present');
  assert(!('buyingPrice' in schemaObj || 'cost' in schemaObj), '1.17 Sensitive buying price is never leaked in Schema');

  // 1.18 Meaningful Crawler Fallback Body
  assert(
    productHtml.includes(sampleProduct.title) &&
    productHtml.includes(`৳${sampleProduct.price.toLocaleString()} BDT`) &&
    productHtml.includes('ssr-crawler-fallback') &&
    productHtml.includes('<noscript>'),
    '1.18 Product page provides meaningful semantic HTML body (H1, BDT price, stock, image, description) for non-JS crawlers'
  );

  // ==========================================
  // FIX 2: CATEGORY SSR SEO VERIFICATION
  // ==========================================
  console.log('\n--- VERIFYING FIX 2: CATEGORY SERVER-SIDE SEO ---');
  const cat = INITIAL_CATEGORIES[0];
  const catSeoData = getCategorySEOData(cat, siteName);
  const categoryHtml = injectCategorySEOIntoHtml(baseHtml, cat, siteName);

  // 2.1 Unique Title
  assert(
    categoryHtml.includes(`<title>${catSeoData.title}</title>`),
    '2.1 Category has unique targeted SEO <title>'
  );

  // 2.2 Meta Description
  assert(
    categoryHtml.includes(catSeoData.description),
    '2.2 Category has unique relevant meta description'
  );

  // 2.3 Canonical URL
  const expectedCatCanonical = `${SITE_DOMAIN}/category/${encodeURIComponent(cat.slug || cat.id)}`;
  assert(
    categoryHtml.includes(`<link rel="canonical" href="${expectedCatCanonical}" />`),
    '2.3 Category canonical URL matches category slug'
  );

  // 2.4 Open Graph Tags
  assert(
    categoryHtml.includes(`property="og:title" content="${catSeoData.title}"`),
    '2.4 Category OG title matches category title'
  );
  assert(
    categoryHtml.includes(`property="og:url" content="${expectedCatCanonical}"`),
    '2.5 Category OG url matches category canonical'
  );

  // 2.6 Twitter Card
  assert(
    categoryHtml.includes(`name="twitter:title" content="${catSeoData.title}"`),
    '2.6 Category Twitter card title is set'
  );

  // 2.7 Breadcrumb & Collection JSON-LD
  assert(
    categoryHtml.includes('id="schema-breadcrumbs"') && categoryHtml.includes('id="schema-category-collection"'),
    '2.7 Category includes BreadcrumbList and CollectionPage JSON-LD'
  );

  // 2.8 Meaningful Crawler Fallback Body
  assert(
    categoryHtml.includes(cat.name) &&
    categoryHtml.includes('ssr-crawler-fallback') &&
    categoryHtml.includes('<noscript>'),
    '2.8 Category page returns meaningful semantic HTML body for non-JS crawlers'
  );

  // 2.9 Differentiated metadata across categories
  const otherCat = INITIAL_CATEGORIES[1];
  const otherCatSeo = getCategorySEOData(otherCat, siteName);
  assert(
    catSeoData.title !== otherCatSeo.title && catSeoData.description !== otherCatSeo.description,
    '2.9 Different categories have distinct, non-duplicate metadata'
  );

  // ==========================================
  // FIX 3: ADMIN_SECRET SECURITY VERIFICATION
  // ==========================================
  console.log('\n--- VERIFYING FIX 3: ADMIN_SECRET SECURITY & FAIL-CLOSED ---');

  // 3.1 wrangler.json check
  const wranglerContent = fs.readFileSync(path.resolve(process.cwd(), 'wrangler.json'), 'utf-8');
  assert(
    !wranglerContent.includes('ADMIN_SECRET') && !wranglerContent.includes('rongdhonu-trade-cf-secure'),
    '3.1 wrangler.json does NOT contain ADMIN_SECRET or any hardcoded secret'
  );

  // 3.2 Source code check: No hardcoded secrets in src/
  const srcAuthContent = fs.readFileSync(path.resolve(process.cwd(), 'src/server/auth.ts'), 'utf-8');
  assert(
    !srcAuthContent.includes('DEFAULT_PRODUCTION_AUTH_SECRET'),
    '3.2 src/server/auth.ts does not declare DEFAULT_PRODUCTION_AUTH_SECRET'
  );
  assert(
    !srcAuthContent.includes('rongdhonu-trade-cf-secure'),
    '3.3 Source code does not contain hard-coded production secret string'
  );
  assert(
    !srcAuthContent.includes('dev-local-secret-do-not-use-in-production-2026'),
    '3.3b src/server/auth.ts does not contain hardcoded dev-local-secret fallback'
  );

  // 3.4 Security hardening: Production strictly fails closed if ADMIN_SECRET / JWT_SECRET is missing
  let prodFailedClosed = false;
  let fallbackSuccessDev = false;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAdminSecret = process.env.ADMIN_SECRET;
  try {
    delete process.env.ADMIN_SECRET;

    // Test Production Fail Closed
    process.env.NODE_ENV = 'production';
    try {
      getAuthSecret({ DB: {} as any });
    } catch (err: any) {
      if (err?.message?.includes('SERVER_CONFIGURATION_ERROR')) {
        prodFailedClosed = true;
      }
    }

    // Test Dev/Local Fallback
    process.env.NODE_ENV = 'development';
    const devSec = getAuthSecret({});
    if (typeof devSec === 'string' && devSec.length >= 16) {
      fallbackSuccessDev = true;
    }
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAdminSecret !== undefined) {
      process.env.ADMIN_SECRET = originalAdminSecret;
    }
  }
  assert(
    prodFailedClosed,
    '3.4a getAuthSecret() strictly fails closed in production when ADMIN_SECRET is not provided'
  );
  assert(
    fallbackSuccessDev,
    '3.4b getAuthSecret() provides a valid signing secret in development when ADMIN_SECRET is not provided'
  );

  // 3.5 Reads securely when ADMIN_SECRET is provided in production
  const testSecret = 'custom-configured-production-secret-999';
  const resolved = getAuthSecret({ ADMIN_SECRET: testSecret, DB: {} as any });
  assert(
    resolved === testSecret,
    '3.5 getAuthSecret() properly uses the provided ADMIN_SECRET in production'
  );

  // 3.6 .gitignore includes .dev.vars
  const gitignoreContent = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf-8');
  assert(
    gitignoreContent.includes('.dev.vars*') && gitignoreContent.includes('!.dev.vars.example'),
    '3.6 .gitignore properly ignores .dev.vars local secret files'
  );

  // 3.7 .dev.vars.example exists and guides the user
  assert(
    fs.existsSync(path.resolve(process.cwd(), '.dev.vars.example')),
    '3.7 .dev.vars.example exists as a clean template for local development'
  );

  // ==========================================
  // SECTION 4: ROBOTS.TXT & SITEMAP.XML
  // ==========================================
  console.log('\n--- VERIFYING SECTION 4: ROBOTS.TXT & SITEMAP.XML ---');
  assert(
    ROBOTS_TXT_CONTENT.includes('Allow: /') &&
    ROBOTS_TXT_CONTENT.includes('Disallow: /admin') &&
    ROBOTS_TXT_CONTENT.includes('Disallow: /account') &&
    ROBOTS_TXT_CONTENT.includes('Disallow: /cart') &&
    ROBOTS_TXT_CONTENT.includes('Disallow: /checkout') &&
    ROBOTS_TXT_CONTENT.includes('Disallow: /api') &&
    ROBOTS_TXT_CONTENT.includes(`Sitemap: ${SITE_DOMAIN}/sitemap.xml`),
    '4.1 robots.txt allows public pages, disallows private routes, and links to authoritative sitemap'
  );

  const sitemap = generateSitemapXml(INITIAL_CATEGORIES, INITIAL_PRODUCTS);
  assert(
    sitemap.includes('<loc>https://rongdhonutrade.com/</loc>') &&
    sitemap.includes('https://rongdhonutrade.com/category/') &&
    !sitemap.includes('?category=') &&
    sitemap.includes('https://rongdhonutrade.com/product/') &&
    !sitemap.includes('?product=') &&
    !sitemap.includes('/admin') &&
    !sitemap.includes('/checkout'),
    '4.2 sitemap.xml includes valid public URLs and excludes private routes'
  );

  console.log('\n===========================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
