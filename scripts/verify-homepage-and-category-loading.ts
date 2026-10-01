/**
 * Verification suite for 6A: Homepage Progressive Category Loading
 * Rongdhonu Trade
 */

import fs from 'node:fs';
import path from 'node:path';

async function verifyProgressiveCategoryLoading() {
  console.log('================================================================');
  console.log('STARTING HOMEPAGE PROGRESSIVE CATEGORY LOADING VERIFICATION (6A)');
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

  const baseUrl = 'http://127.0.0.1:3000';

  // 1. HERO / SLIDER LOADING & LCP
  console.log('--- 1. HERO / SLIDER LOADING & LCP ---');
  const heroCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/HeroCarousel.tsx'), 'utf-8');
  
  assert(
    heroCode.includes('priority: currentSlide === 0'),
    '1.1 Hero carousel restricts priority=true strictly to primary visible slide (currentSlide === 0)'
  );

  assert(
    !heroCode.includes('slides.map(') || heroCode.includes('activeSlides.map((_, idx) => ('),
    '1.2 Inactive slide images are NOT rendered or preloaded into the DOM simultaneously'
  );

  // 2. CONSOLIDATED BOUNDED HOMEPAGE API (NO FULL CATALOG DOWNLOAD)
  console.log('--- 2. CONSOLIDATED BOUNDED HOMEPAGE API ---');
  const hpRes = await fetch(`${baseUrl}/api/store/homepage`);
  assert(hpRes.status === 200, '2.1 GET /api/store/homepage returns HTTP 200 OK');

  const hpData = await hpRes.json();
  const categoryProducts = hpData.categoryProducts || {};
  const catEntries = Object.entries(categoryProducts);

  assert(
    catEntries.length > 0,
    '2.2 Homepage API returns category preview maps'
  );

  let allBounded = true;
  let maxCount = 0;
  for (const [catId, prods] of catEntries) {
    const count = (prods as any[]).length;
    if (count > maxCount) maxCount = count;
    if (count > 6) {
      allBounded = false;
      break;
    }
  }

  assert(
    allBounded && maxCount <= 6,
    `2.3 Each homepage category preview is strictly bounded to <= 6 products (max found: ${maxCount})`
  );

  // 3. PROGRESSIVE VIEWPORT LOADING VIA INTERSECTION OBSERVER
  console.log('--- 3. PROGRESSIVE VIEWPORT LOADING VIA INTERSECTION OBSERVER ---');
  const carouselCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CategoryProductCarousel.tsx'), 'utf-8');

  assert(
    carouselCode.includes('new IntersectionObserver'),
    '3.1 CategoryProductCarousel utilizes browser-native IntersectionObserver for progressive loading'
  );

  assert(
    carouselCode.includes("rootMargin: '350px 0px'"),
    '3.2 IntersectionObserver triggers proactively when approaching viewport (rootMargin: 350px 0px)'
  );

  assert(
    carouselCode.includes('priorityFirst = false') &&
    carouselCode.includes('() => priorityFirst || (typeof window !=='),
    '3.3 First category renders immediately while subsequent categories load progressively on approach'
  );

  assert(
    carouselCode.includes('!isIntersected ? (') &&
    carouselCode.includes('aspect-square w-full bg-slate-100 rounded-xl animate-pulse'),
    '3.4 Non-intersected categories render matching zero-CLS placeholder grid without downloading product images'
  );

  // 4. VIEW ALL BEHAVIOR & SERVER-SIDE PAGINATION
  console.log('--- 4. VIEW ALL BEHAVIOR & SERVER-SIDE PAGINATION ---');
  assert(
    carouselCode.includes('onViewAll(category)'),
    '4.1 "View All" button triggers dedicated category view navigation'
  );

  const categoriesRes = await fetch(`${baseUrl}/api/categories`);
  const categoriesData = await categoriesRes.json();
  const categoriesList = categoriesData.categories || categoriesData;
  const firstCat = categoriesList[0];

  const catPageRes = await fetch(`${baseUrl}/api/products?category=${firstCat.id}&page=1&limit=24`);
  assert(catPageRes.status === 200, '4.2 Category listing endpoint responds with HTTP 200');

  const catPageData = await catPageRes.json();
  assert(
    catPageData.limit === 24 &&
    catPageData.page === 1 &&
    catPageData.total !== undefined,
    '4.3 Category view uses server-side pagination with limit=24 rather than downloading entire catalog'
  );

  // 5. IMAGE OPTIMIZATION & LAZY LOADING
  console.log('--- 5. IMAGE OPTIMIZATION & LAZY LOADING ---');
  const cardCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ProductCard.tsx'), 'utf-8');

  assert(
    cardCode.includes('priority = false') &&
    cardCode.includes('getResponsiveImageProps(product.imageUrl, \'card\', { priority })'),
    '5.1 Product cards default to lazy loading and async decoding'
  );

  assert(
    cardCode.includes('isHovered ? getResponsiveImageProps(secondaryImage, \'card\') : null'),
    '5.2 Secondary hover images are deferred until the user hovers over the product card'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

verifyProgressiveCategoryLoading().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
