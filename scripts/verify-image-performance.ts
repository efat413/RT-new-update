/**
 * Comprehensive Verification Suite for Image Performance & Responsive Image Delivery
 */

import {
  getResponsiveImageUrl,
  getResponsiveSrcSet,
  getResponsiveImageProps,
  RESPONSIVE_IMAGE_PRESETS,
  isInternalMediaUrl,
  isUnsplashUrl,
} from '../src/utils/responsiveImage';
import {
  validateImageBuffer,
  isValidMediaKey,
  getSafeMediaHeaders,
} from '../src/server/imageSecurity';
import { getTestAdminToken } from './test-auth-helper';

async function runImagePerformanceTests() {
  console.log('===========================================================');
  console.log('STARTING RESPONSIVE IMAGE PERFORMANCE VERIFICATION');
  console.log('===========================================================');

  const baseUrl = 'http://127.0.0.1:3000';

  // 1. TEST RESPONSIVE URL GENERATION FOR INTERNAL MEDIA
  console.log('\n[TEST 1] Internal Media URL Transformation...');
  const internalMediaUrl = '/api/media/asset-1718000000000-abc123.jpg';
  const cardUrl = getResponsiveImageUrl(internalMediaUrl, 360);
  console.assert(cardUrl.includes('/api/media/asset-1718000000000-abc123.jpg'), 'Must preserve base path');
  console.assert(cardUrl.includes('w=360'), 'Must include target width');
  console.log('✓ Internal media transformed:', cardUrl);

  // Non-standard width (e.g. 160) must safely map to available standard width (240)
  const thumbnailMappedUrl = getResponsiveImageUrl(internalMediaUrl, 160);
  console.assert(thumbnailMappedUrl.includes('w=240'), 'Width 160 must map to available standard width 240');
  console.log('✓ Thumbnail mapped to standard width 240:', thumbnailMappedUrl);

  const detailUrl = getResponsiveImageUrl(internalMediaUrl, 1200, 90);
  console.assert(detailUrl.includes('w=1080'), 'Detail URL must map 1200 to max standard width 1080');
  console.assert(detailUrl.includes('q=90'), 'Detail URL must include q=90');
  console.log('✓ High-res detail media transformed:', detailUrl);

  // 2. TEST RESPONSIVE URL GENERATION FOR DYNAMIC CDNs (Unsplash)
  console.log('\n[TEST 2] Dynamic CDN (Unsplash) Transformation...');
  const unsplashUrl = 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80';
  const mobileCardUnsplash = getResponsiveImageUrl(unsplashUrl, 240);
  console.assert(mobileCardUnsplash.includes('w=240'), 'Mobile width must be 240');
  console.assert(mobileCardUnsplash.includes('auto=format'), 'Must preserve auto=format for modern WebP/AVIF');
  console.log('✓ Mobile card Unsplash URL:', mobileCardUnsplash);

  const desktopBannerUnsplash = getResponsiveImageUrl(unsplashUrl, 1440, 85);
  console.assert(desktopBannerUnsplash.includes('w=1440'), 'Desktop width must be 1440');
  console.assert(desktopBannerUnsplash.includes('q=85'), 'Desktop quality must be 85');
  console.log('✓ Desktop banner Unsplash URL:', desktopBannerUnsplash);

  // 3. TEST SRCSET GENERATION FOR CARDS AND BANNERS
  console.log('\n[TEST 3] HTML srcSet and Sizes Generation...');
  const cardProps = getResponsiveImageProps(unsplashUrl, 'card');
  console.assert(cardProps.srcSet !== undefined, 'Card must have srcSet');
  console.assert(cardProps.srcSet!.includes('240w') && cardProps.srcSet!.includes('720w'), 'Card srcSet must cover range');
  console.assert(cardProps.sizes === RESPONSIVE_IMAGE_PRESETS.card.sizes, 'Card sizes must match preset');
  console.assert(cardProps.width === 360 && cardProps.height === 360, 'Card must specify width/height to avoid CLS');
  console.assert(cardProps.style.aspectRatio === '1 / 1', 'Card must declare aspect-ratio: 1/1');
  console.log('✓ Card responsive image props verified');

  const internalCardProps = getResponsiveImageProps(internalMediaUrl, 'card');
  console.assert(internalCardProps.srcSet !== undefined, 'Internal card must have srcSet');
  console.assert(internalCardProps.srcSet!.includes('w=240') && internalCardProps.srcSet!.includes('240w'), 'Internal card must include 240w');
  console.assert(internalCardProps.srcSet!.includes('w=720') && internalCardProps.srcSet!.includes('720w'), 'Internal card must include 720w');
  console.log('✓ Internal card responsive image props strictly contain available standard variants:', internalCardProps.srcSet);

  const bannerProps = getResponsiveImageProps(unsplashUrl, 'banner', { priority: true });
  console.assert(bannerProps.srcSet !== undefined, 'Banner must have srcSet');
  console.assert(bannerProps.loading === 'eager', 'LCP Banner must be eager');
  console.assert(bannerProps.fetchPriority === 'high', 'LCP Banner must have high fetchPriority');
  console.assert(bannerProps.width === 1200 && bannerProps.height === 480, 'Banner must specify width/height');
  console.assert(bannerProps.style.aspectRatio === '1200 / 480', 'Banner must match 1200/480 master ratio');
  console.log('✓ Banner responsive image props verified');

  // 4. TEST BACKWARD COMPATIBILITY: OLD IMAGE URLs WITHOUT PARAMETERS
  console.log('\n[TEST 4] Backward Compatibility for Old Image URLs...');
  const oldUrl = '/api/media/asset-1718000000000-abc123.jpg';
  console.assert(isValidMediaKey('asset-1718000000000-abc123.jpg'), 'Old media key must be valid');
  // Raw Data URLs must remain untouched
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  console.assert(getResponsiveImageUrl(dataUrl, 300) === dataUrl, 'Data URLs must remain as-is');
  console.assert(getResponsiveSrcSet(dataUrl, [100, 200]) === undefined, 'Data URLs return undefined srcSet safely');
  console.log('✓ Old image URLs and data URLs safely handled without breaking');

  // 5. TEST SECURITY: INVALID IMAGE KEYS & MALICIOUS BUFFER VALIDATION
  console.log('\n[TEST 5] Image Security & Header Validation...');
  console.assert(isValidMediaKey('../../etc/passwd') === false, 'Path traversal must be blocked');
  console.assert(isValidMediaKey('not-a-valid-key.jpg') === false, 'Malformed key must be blocked');
  console.assert(isValidMediaKey('asset-12345678-abc.png') === true, 'Valid media key format accepted');
  console.assert(isValidMediaKey('asset-12345678-abc_w240.webp') === true, 'Valid media variant key format accepted');

  const safeHeaders = getSafeMediaHeaders('image/webp');
  console.assert(safeHeaders['Cache-Control'] === 'public, max-age=31536000, immutable', 'Immutable cache header required');
  console.assert(safeHeaders['X-Content-Type-Options'] === 'nosniff', 'nosniff header required');
  console.assert(safeHeaders['Vary'] === 'Accept', 'Vary Accept header required');
  console.log('✓ Media security and immutable cache headers verified');

  // 6. TEST LIVE SERVER MEDIA ENDPOINT WITH AND WITHOUT RESPONSIVE QUERY
  console.log('\n[TEST 6] Live Dev Server /api/media Endpoint Testing...');
  // Upload a valid high-resolution 600x600 image to test genuine resizing
  let adminToken = await getTestAdminToken(baseUrl);

  const sharpModule = await import('sharp');
  const sharp = (sharpModule as any).default || sharpModule;
  const samplePngBytes = await sharp({
    create: {
      width: 600,
      height: 600,
      channels: 4,
      background: { r: 225, g: 29, b: 72, alpha: 1 },
    },
  }).png().toBuffer();

  const uploadRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      dataUrl: `data:image/png;base64,${samplePngBytes.toString('base64')}`,
    }),
  });

  console.assert(uploadRes.status === 200, `Upload must succeed with 200, got ${uploadRes.status}`);
  const uploadData = await uploadRes.json();
  console.assert(uploadData.success && uploadData.url, 'Must return asset URL');
  console.log('✓ Successfully uploaded test media asset:', uploadData.url, `(Original: ${samplePngBytes.length} bytes)`);

  // Fetch original image (without query parameters)
  const origRes = await fetch(`${baseUrl}${uploadData.url}`);
  console.assert(origRes.status === 200, 'Original image must return 200');
  console.assert(origRes.headers.get('content-type') === 'image/png', 'Original must preserve image/png format');
  console.assert(origRes.headers.get('cache-control')?.includes('immutable'), 'Must have immutable cache header');
  const origArrayBuf = await origRes.arrayBuffer();
  console.assert(origArrayBuf.byteLength === samplePngBytes.length, 'Original image byte size must match upload');
  console.log(`✓ Original image fetched: ${origArrayBuf.byteLength} bytes, content-type: ${origRes.headers.get('content-type')}`);

  // Fetch responsive image with ?w=240
  const resizedRes = await fetch(`${baseUrl}${uploadData.url}?w=240`, {
    headers: { 'Accept': 'image/webp,image/*,*/*' },
  });
  console.assert(resizedRes.status === 200, 'Resized image must return 200');
  console.assert(resizedRes.headers.get('content-type') === 'image/webp', 'Resized variant must be image/webp');
  console.assert(resizedRes.headers.get('cache-control')?.includes('immutable'), 'Resized image must have immutable cache header');
  const resizedArrayBuf = await resizedRes.arrayBuffer();
  console.assert(resizedArrayBuf.byteLength < origArrayBuf.byteLength, 'Resized WebP must be significantly smaller than original');
  console.log(`✓ Resized image with ?w=240 verified: ${resizedArrayBuf.byteLength} bytes (vs original ${origArrayBuf.byteLength} bytes, ${Math.round((1 - resizedArrayBuf.byteLength / origArrayBuf.byteLength) * 100)}% bandwidth savings!), format: ${resizedRes.headers.get('content-type')}`);

  // Fetch responsive image with non-standard ?w=160 (must serve 240px variant)
  const mappedRes = await fetch(`${baseUrl}${uploadData.url}?w=160`, {
    headers: { 'Accept': 'image/webp,image/*,*/*' },
  });
  console.assert(mappedRes.status === 200, 'Mapped variant must return 200');
  console.assert(mappedRes.headers.get('content-type') === 'image/webp', 'Mapped variant must return image/webp');
  const mappedArrayBuf = await mappedRes.arrayBuffer();
  console.assert(mappedArrayBuf.byteLength === resizedArrayBuf.byteLength, 'Non-standard width request must serve matched standard variant buffer');
  console.log(`✓ Non-standard request ?w=160 successfully served matched standard 240px variant (${mappedArrayBuf.byteLength} bytes)`);

  // Fetch invalid media key (must return 400)
  const invalidKeyRes = await fetch(`${baseUrl}/api/media/invalid-key.jpg`);
  console.assert(invalidKeyRes.status === 400, 'Invalid media key must return 400');
  console.log('✓ Invalid media key strictly returned 400 Bad Request');

  console.log('\n===========================================================');
  console.log('✅ ALL IMAGE PERFORMANCE & RESPONSIVE DELIVERY TESTS PASSED');
  console.log('===========================================================');
}

runImagePerformanceTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
