import {
  extractYouTubeVideoId,
  isValidYouTubeUrl,
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
} from '../src/utils/youtube';

async function runTests() {
  console.log('====================================================');
  console.log('STARTING PRODUCT VIDEO PLAY & YOUTUBE INTEGRATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  // --- UNIT TESTS: YouTube URL extraction ---
  console.log('--- 1. Testing YouTube URL Extraction & Embed Generation ---');
  const testCases = [
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ', type: 'Standard watch URL' },
    { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ', type: 'Short domain watch URL' },
    { url: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ', type: 'Mobile watch URL' },
    { url: 'https://youtu.be/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ', type: 'Short share link (youtu.be)' },
    { url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ', type: 'Embed URL' },
    { url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ', type: 'YouTube Shorts URL' },
    { url: 'https://www.youtube.com/live/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ', type: 'YouTube Live URL' },
    { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s&feature=share', expected: 'dQw4w9WgXcQ', type: 'URL with query params' },
    { url: 'dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ', type: 'Raw 11-char ID' },
  ];

  for (const tc of testCases) {
    const id = extractYouTubeVideoId(tc.url);
    assert(id === tc.expected, `Extract from ${tc.type}: got ${id}`);
    assert(isValidYouTubeUrl(tc.url), `Valid YouTube URL check: ${tc.type}`);
  }

  // Invalid test cases
  assert(extractYouTubeVideoId('https://example.com/video.mp4') === null, 'Non-YouTube URL returns null');
  assert(extractYouTubeVideoId('') === null, 'Empty string returns null');
  assert(extractYouTubeVideoId(null) === null, 'Null returns null');

  // Embed generation
  const embed = getYouTubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert(
    embed !== null && embed.includes('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
    `Embed URL contains privacy-enhanced nocookie domain: ${embed}`
  );

  const thumb = getYouTubeThumbnailUrl('https://youtu.be/dQw4w9WgXcQ', 'hq');
  assert(
    thumb === 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    `Thumbnail URL generated correctly: ${thumb}`
  );

  // --- API INTEGRATION TESTS: Backend persistence ---
  console.log('\n--- 2. Testing Backend API: Product Video Persistence ---');
  const baseUrl = 'http://localhost:3000';

  // Step A: Login as Super Admin
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'admin', password: process.env.DEV_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin' }),
  });
  const loginData = (await loginRes.json().catch(() => ({}))) as any;
  const token = loginData.token;
  if (!token) {
    throw new Error(
      `Failed to obtain Super Admin authentication token from /api/auth/login (HTTP ${loginRes.status}: ${JSON.stringify(loginData)}). Check test environment setup.`
    );
  }
  assert(Boolean(token), 'Super Admin token obtained');

  // Step B: Create Product with YouTube videoUrl
  const testProdId = `prod-test-video-${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      product: {
        id: testProdId,
        title: 'Video Demo Smartwatch',
        price: 3500,
        buyingPrice: 2000,
        categoryId: 'cat-mens-accessories',
        description: 'Test smartwatch with official YouTube video product demo.',
        imageUrl: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=800&q=80',
        stock: 12,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    }),
  });
  const createData = (await createRes.json()) as any;
  assert(createRes.status === 201 && createData.success, 'Product created via API');
  assert(
    createData.product?.videoUrl === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    `Newly created product returns videoUrl: ${createData.product?.videoUrl}`
  );

  // Step C: Fetch Single Product by ID (public access)
  const getRes = await fetch(`${baseUrl}/api/products/${testProdId}`);
  const getData = (await getRes.json()) as any;
  assert(getRes.status === 200 && getData.success, 'Fetched product by ID');
  assert(
    getData.product?.videoUrl === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    `Public product view contains videoUrl for the play button: ${getData.product?.videoUrl}`
  );

  // Step D: Update Product Video Link
  const updateRes = await fetch(`${baseUrl}/api/products/${testProdId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      updates: {
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ?t=30',
      },
    }),
  });
  const updateData = (await updateRes.json()) as any;
  assert(updateRes.status === 200 && updateData.success, 'Product updated with new video URL');
  assert(
    updateData.product?.videoUrl === 'https://youtu.be/dQw4w9WgXcQ?t=30',
    `Updated product returns new videoUrl: ${updateData.product?.videoUrl}`
  );

  // Step E: Clean up test product
  const delRes = await fetch(`${baseUrl}/api/products/${testProdId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(delRes.status === 200, 'Test product cleaned up');

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
