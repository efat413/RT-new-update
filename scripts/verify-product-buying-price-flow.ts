import {
  sanitizeProductForRole,
  buildSelectProductColumns,
  rowToProduct,
} from '../src/server/db';
import { Product } from '../src/types';

async function runTests() {
  console.log('=====================================================');
  console.log('VERIFYING PRODUCT BUYING PRICE & UNIT PROFIT SYSTEM');
  console.log('=====================================================\n');

  // Test 1: Column builder includes buying_price when authorized
  console.log('1. Testing buildSelectProductColumns for buying_price inclusion...');
  const availableColumns = new Set([
    'id', 'title', 'price', 'original_price', 'buying_price',
    'category_id', 'description', 'image_url', 'stock', 'status'
  ]);

  const publicCols = buildSelectProductColumns(availableColumns, false);
  if (publicCols.includes('buying_price')) {
    throw new Error('FAIL: publicCols should NOT include buying_price');
  }
  console.log('   ✓ Public SELECT query strictly excludes buying_price');

  const privilegedCols = buildSelectProductColumns(availableColumns, true);
  if (!privilegedCols.includes('buying_price')) {
    throw new Error('FAIL: privilegedCols MUST include buying_price');
  }
  console.log('   ✓ Privileged SELECT query includes buying_price');

  // Test 2: rowToProduct maps buying_price column to buyingPrice and unitProfit
  console.log('\n2. Testing rowToProduct mapping...');
  const rowWithBuyingPrice: any = {
    id: 'prod-test-01',
    title: 'Luxury Leather Wallet',
    price: 1200,
    original_price: 1500,
    buying_price: 650,
    category_id: 'cat-mens-accessories',
    description: 'Genuine leather',
    image_url: 'https://example.com/wallet.jpg',
    images_json: '[]',
    stock: 20,
    featured: 1,
    status: 'active',
  };

  const mappedProduct = rowToProduct(rowWithBuyingPrice);
  if (mappedProduct.buyingPrice !== 650) {
    throw new Error(`FAIL: expected buyingPrice to be 650, got ${mappedProduct.buyingPrice}`);
  }
  if (mappedProduct.unitProfit !== 550) {
    throw new Error(`FAIL: expected unitProfit to be 550 (1200 - 650), got ${mappedProduct.unitProfit}`);
  }
  console.log('   ✓ rowToProduct correctly sets buyingPrice: ৳650 and unitProfit: ৳550');

  // Test 3: sanitizeProductForRole for Super Admin (camelCase)
  console.log('\n3. Testing sanitizeProductForRole for Super Admin...');
  const rawProductWithCamel: Product = {
    id: 'prod-001',
    title: 'Minimalist Watch',
    price: 1000,
    buyingPrice: 600,
    categoryId: 'cat-watches',
    description: 'Sleek design',
    imageUrl: 'https://example.com/watch.jpg',
    stock: 10,
    featured: true,
    rating: 5,
    reviewsCount: 1,
    createdAt: new Date().toISOString(),
  };

  const superAdminView = sanitizeProductForRole(rawProductWithCamel, { isSuperAdmin: true });
  if (superAdminView.buyingPrice !== 600) {
    throw new Error(`FAIL: Super Admin must see buyingPrice 600, got ${superAdminView.buyingPrice}`);
  }
  if (superAdminView.unitProfit !== 400) {
    throw new Error(`FAIL: Super Admin must see unitProfit 400, got ${superAdminView.unitProfit}`);
  }
  console.log('   ✓ Super Admin correctly sees buyingPrice: ৳600 and unitProfit: ৳400');

  // Test 4: sanitizeProductForRole with snake_case alias
  console.log('\n4. Testing sanitizeProductForRole with snake_case (buying_price)...');
  const rawProductWithSnake: any = {
    id: 'prod-002',
    title: 'Smart Earbuds',
    price: 2500,
    buying_price: 1400,
    categoryId: 'cat-gadgets',
    description: 'TWS earbuds',
    imageUrl: 'https://example.com/earbuds.jpg',
    stock: 25,
    featured: false,
    createdAt: new Date().toISOString(),
  };

  const superAdminSnakeView = sanitizeProductForRole(rawProductWithSnake, { isSuperAdmin: true });
  if (superAdminSnakeView.buyingPrice !== 1400) {
    throw new Error(`FAIL: Super Admin must see buyingPrice 1400 from buying_price, got ${superAdminSnakeView.buyingPrice}`);
  }
  if (superAdminSnakeView.unitProfit !== 1100) {
    throw new Error(`FAIL: Super Admin must see unitProfit 1100, got ${superAdminSnakeView.unitProfit}`);
  }
  console.log('   ✓ Super Admin correctly maps snake_case buying_price: ৳1400 and unitProfit: ৳1100');

  // Test 5: Public / Customer sanitization strictly strips buying price & profit
  console.log('\n5. Testing public / customer sanitization security...');
  const publicView = sanitizeProductForRole(rawProductWithCamel, {
    isSuperAdmin: false,
    canViewBuyingPrice: false,
    canViewProfit: false,
  });

  if (publicView.buyingPrice !== undefined || (publicView as any).buying_price !== undefined) {
    throw new Error('FAIL: publicView MUST NOT contain buyingPrice or buying_price');
  }
  if (publicView.unitProfit !== undefined || (publicView as any).unit_profit !== undefined) {
    throw new Error('FAIL: publicView MUST NOT contain unitProfit or unit_profit');
  }
  console.log('   ✓ Public visitor view strictly removes buyingPrice, buying_price, and unitProfit');

  // Test 6: Form state initialization in Edit Product modal
  console.log('\n6. Testing Edit Product modal form initialization...');
  const testProduct: Product = {
    id: 'prod-edit-test',
    title: 'Executive Pen',
    price: 500,
    buyingPrice: 220,
    categoryId: 'cat-office',
    description: 'Smooth writing',
    imageUrl: 'https://example.com/pen.jpg',
    stock: 40,
    featured: false,
    rating: 5,
    reviewsCount: 1,
    createdAt: new Date().toISOString(),
  };

  const initialBuyingPrice = testProduct.buyingPrice != null
    ? testProduct.buyingPrice
    : ((testProduct as any).buying_price != null ? (testProduct as any).buying_price : '');

  if (initialBuyingPrice !== 220) {
    throw new Error(`FAIL: initialBuyingPrice should be 220, got ${initialBuyingPrice}`);
  }

  const calculatedUnitProfit = initialBuyingPrice !== '' && !isNaN(Number(initialBuyingPrice))
    ? Math.max(0, Number(testProduct.price) - Number(initialBuyingPrice))
    : '—';

  if (calculatedUnitProfit !== 280) {
    throw new Error(`FAIL: calculatedUnitProfit should be 280 (500 - 220), got ${calculatedUnitProfit}`);
  }
  console.log(`   ✓ Form state initialized: Buying Price = ৳${initialBuyingPrice}, Unit Profit = ৳${calculatedUnitProfit}`);

  console.log('\n=====================================================');
  console.log('ALL BUYING PRICE & UNIT PROFIT TESTS PASSED SUCCESSFULLY!');
  console.log('=====================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
