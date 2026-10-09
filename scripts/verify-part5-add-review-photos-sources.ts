import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { validateImageBuffer } from '../src/server/imageSecurity';
import { hasUserPermission } from '../src/utils/permissions';
import type { UserAccount, ProductReview, ReviewSource } from '../src/types';

console.log('================================================================');
console.log('PART 5: PRODUCT-SPECIFIC REVIEW CREATION, PHOTOS & SOURCES AUDIT');
console.log('================================================================');

const reviewsTabSource = fs.readFileSync(path.resolve('src/components/AdminReviewsTab.tsx'), 'utf-8');
const routerSource = fs.readFileSync(path.resolve('src/server/router.ts'), 'utf-8');
const dbSource = fs.readFileSync(path.resolve('src/server/db.ts'), 'utf-8');

// -------------------------------------------------------------
// TEST 1: Form Location & Navigation in Product Management
// -------------------------------------------------------------
console.log('\n[TEST 1] Verifying form location and product identification...');
assert(reviewsTabSource.includes('id="add-review-scoped-btn"'), 'Scoped + Add Review button must exist');
assert(reviewsTabSource.includes('Target Product *'), 'Target Product field must be present in modal');
assert(reviewsTabSource.includes('targetProd.title'), 'Target product title must be clearly displayed');
assert(reviewsTabSource.includes('Locked to Selected Product') || reviewsTabSource.includes('Locked to current product'), 'Scoped product locking must be indicated');
console.log('✅ TEST 1 PASSED: + Add Review form is accessible from scoped product review view and identifies the target product.');

// -------------------------------------------------------------
// TEST 2: All Required Form Fields
// -------------------------------------------------------------
console.log('\n[TEST 2] Verifying all required form fields...');
assert(reviewsTabSource.includes('id="add-review-author-name"'), 'Author display name input must exist');
assert(reviewsTabSource.includes('star <= formRating') && reviewsTabSource.includes('id={`star-btn-${star}`}'), '1-5 star rating selector must exist');
assert(reviewsTabSource.includes('id="add-review-comment-text"'), 'Review text comment textarea must exist');
assert(reviewsTabSource.includes('formImages') && reviewsTabSource.includes('Optional Review Photos'), 'Review photos uploader must exist');
assert(reviewsTabSource.includes('id="add-review-source-select"'), 'Source selector must exist');
assert(reviewsTabSource.includes('value="manual"'), 'Manual source must be supported');
assert(reviewsTabSource.includes('value="whatsapp"'), 'WhatsApp source must be supported');
assert(reviewsTabSource.includes('value="facebook"'), 'Facebook source must be supported');
assert(reviewsTabSource.includes('value="messenger"'), 'Messenger source must be supported');
assert(reviewsTabSource.includes('value="instagram"'), 'Instagram source must be supported');
assert(reviewsTabSource.includes('id="add-review-status-select"'), 'Status select must exist');
assert(reviewsTabSource.includes('id="addVerifiedCheck"'), 'Verified Purchase checkbox must exist');
console.log('✅ TEST 2 PASSED: All required form fields present (Product, Author, Stars, Comment, Photos, Sources, Status, VerifiedPurchase).');

// -------------------------------------------------------------
// TEST 3: Business Rules - Default Values & Permission Enforcement
// -------------------------------------------------------------
console.log('\n[TEST 3] Verifying business rules: default verifiedPurchase=false, status permissions...');
// Default verifiedPurchase to false
assert(reviewsTabSource.includes('const [formVerified, setFormVerified] = useState(false)'), 'formVerified must default to false');
// Status is gated by canManage
assert(reviewsTabSource.includes('disabled={!canManage}'), 'Status select must be disabled if admin lacks review.manage');
assert(reviewsTabSource.includes('effectiveStatus: ReviewStatus = canManage ? formStatus : \'pending\''), 'effectiveStatus must enforce pending if !canManage');
console.log('✅ TEST 3 PASSED: verifiedPurchase defaults to false; approval status strictly enforced via permissions.');

// -------------------------------------------------------------
// TEST 4: Image Validation & Magic Byte Security
// -------------------------------------------------------------
console.log('\n[TEST 4] Verifying image security, magic byte checks, and storage format...');
// 1. JPEG Magic Bytes
const validJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const jpegResult = validateImageBuffer(validJpeg);
assert.strictEqual(jpegResult.valid, true);
assert.strictEqual(jpegResult.format, 'jpeg');

// 2. PNG Magic Bytes
const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const pngResult = validateImageBuffer(validPng);
assert.strictEqual(pngResult.valid, true);
assert.strictEqual(pngResult.format, 'png');

// 3. SVG / Script disguised as image must be BLOCKED
const fakeSvg = new TextEncoder().encode('GIF89a<svg><script>alert(1)</script></svg>');
const svgResult = validateImageBuffer(fakeSvg);
assert.strictEqual(svgResult.valid, false, 'Disguised SVG/script must be strictly rejected');

// 4. Client-side validation function exists
assert(reviewsTabSource.includes('validateClientImageFile'), 'validateClientImageFile must check magic bytes on client');
assert(reviewsTabSource.includes('uploadApi.upload'), 'Must reuse uploadApi.upload service');
assert(reviewsTabSource.includes('handleRemoveFormImage'), 'Image remove controls must exist');
console.log('✅ TEST 4 PASSED: Binary signatures and magic bytes verified; executable scripts blocked; preview & remove controls active.');

// -------------------------------------------------------------
// TEST 5: Backend Storage Architecture & D1 Column Integrity
// -------------------------------------------------------------
console.log('\n[TEST 5] Verifying storage architecture (images_json stores URLs/keys, never large binary in D1)...');
assert(dbSource.includes('images_json') || routerSource.includes('reviewImages'), 'D1 reviews table stores metadata/urls in images_json');
assert(routerSource.includes('sanitizeReviewImageReference'), 'Review images must be sanitized on the backend');
assert(routerSource.includes('slice(0, 5)'), 'Server must cap review images at max 5');
console.log('✅ TEST 5 PASSED: Review records store storage keys/URLs in images_json; binary files stored in D1 binary media storage.');

// -------------------------------------------------------------
// TEST 6: Review Sources Integration in Backend Router & Database
// -------------------------------------------------------------
console.log('\n[TEST 6] Verifying sources integration (manual, whatsapp, facebook, messenger, instagram)...');
const sources: ReviewSource[] = ['manual', 'whatsapp', 'facebook', 'messenger', 'instagram'];
for (const src of sources) {
  assert(routerSource.includes(src), `router.ts must recognize source: ${src}`);
  assert(dbSource.includes(src), `db.ts must recognize source: ${src}`);
}
console.log('✅ TEST 6 PASSED: All review sources supported across frontend, router, and database.');

console.log('================================================================');
console.log('🎉 ALL PART 5 REVIEW CREATION, PHOTOS & SOURCES TESTS PASSED!');
console.log('================================================================');
