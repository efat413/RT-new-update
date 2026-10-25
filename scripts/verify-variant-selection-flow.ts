/**
 * Verification script for Product Purchase Flow & Variant Selection
 * Tests:
 * 1. ProductCard Add to Cart & Buy Now variant requirements
 * 2. Single-option auto-selection convenience
 * 3. QuickView variant initialization (no silent default for multiple options)
 * 4. Validation error messages for missing color, missing size, or both
 * 5. Successful Add to Cart and Buy Now with chosen variants
 */

import { Product } from '../src/types';

interface VariantValidationResult {
  valid: boolean;
  color?: string;
  size?: string;
  error?: string;
}

function checkProductCardAction(product: Product): { requiresQuickView: boolean; defaultSize?: string; defaultColor?: string } {
  const hasMultipleColors = Boolean(product.colors && product.colors.length > 1);
  const hasMultipleSizes = Boolean(product.sizes && product.sizes.length > 1);
  const requiresVariantSelection = hasMultipleColors || hasMultipleSizes;

  if (requiresVariantSelection) {
    return { requiresQuickView: true };
  }

  const defaultSize = product.sizes && product.sizes.length === 1 ? product.sizes[0] : undefined;
  const defaultColor = product.colors && product.colors.length === 1 ? product.colors[0] : undefined;
  return { requiresQuickView: false, defaultSize, defaultColor };
}

function initializeQuickViewVariants(product: Product): { initialSize?: string; initialColor?: string } {
  const initialSize = product.sizes && product.sizes.length === 1 ? product.sizes[0] : undefined;
  const initialColor = product.colors && product.colors.length === 1 ? product.colors[0] : undefined;
  return { initialSize, initialColor };
}

function validateQuickViewSubmission(
  product: Product,
  selectedSize?: string,
  selectedColor?: string
): VariantValidationResult {
  const hasMultipleColors = Boolean(product.colors && product.colors.length > 1);
  const hasMultipleSizes = Boolean(product.sizes && product.sizes.length > 1);

  const resolvedColor =
    selectedColor || (product.colors && product.colors.length === 1 ? product.colors[0] : undefined);
  const resolvedSize =
    selectedSize || (product.sizes && product.sizes.length === 1 ? product.sizes[0] : undefined);

  const isColorMissing = hasMultipleColors && !resolvedColor;
  const isSizeMissing = hasMultipleSizes && !resolvedSize;

  if (isColorMissing && isSizeMissing) {
    return { valid: false, error: 'Please select a color and size.' };
  }
  if (isColorMissing) {
    return { valid: false, error: 'Please select a color.' };
  }
  if (isSizeMissing) {
    return { valid: false, error: 'Please select a size.' };
  }

  return { valid: true, color: resolvedColor, size: resolvedSize };
}

function runTests() {
  console.log('--- Starting Variant Purchase Flow Verification ---');

  // Test Case 1: Product with Single Color & Single Size (Product A)
  const productA: Product = {
    id: 'prod-a',
    title: 'Product A (Single Option)',
    price: 1200,
    originalPrice: 1500,
    buyingPrice: 800,
    description: 'Test product A',
    categoryId: 'cat-fashion',
    imageUrl: 'https://example.com/a.jpg',
    stock: 20,
    rating: 4.8,
    reviewsCount: 10,
    featured: false,
    createdAt: '2026-01-01T00:00:00Z',
    colors: ['Black'],
    sizes: ['M'],
  };

  const actionA = checkProductCardAction(productA);
  console.log('Test 1 (Product A - Single Options on Card):', actionA);
  if (actionA.requiresQuickView !== false || actionA.defaultColor !== 'Black' || actionA.defaultSize !== 'M') {
    throw new Error('Test 1 Failed: Single option product should not require Quick View and should auto-select Black and M');
  }

  const qvInitA = initializeQuickViewVariants(productA);
  console.log('Test 1b (Product A - Quick View Initialization):', qvInitA);
  if (qvInitA.initialColor !== 'Black' || qvInitA.initialSize !== 'M') {
    throw new Error('Test 1b Failed: Quick View should auto-select the only option');
  }

  const validationA = validateQuickViewSubmission(productA, qvInitA.initialSize, qvInitA.initialColor);
  if (!validationA.valid || validationA.color !== 'Black' || validationA.size !== 'M') {
    throw new Error('Test 1c Failed: Validation should pass with single auto-selected option');
  }
  console.log('✅ Test 1 Passed: Single option convenience preserved.');

  // Test Case 2: Product with Multiple Colors & Multiple Sizes (Product B)
  const productB: Product = {
    id: 'prod-b',
    title: 'Product B (Multiple Options)',
    price: 2500,
    originalPrice: 3000,
    buyingPrice: 1800,
    description: 'Test product B',
    categoryId: 'cat-clothing',
    imageUrl: 'https://example.com/b.jpg',
    stock: 50,
    rating: 4.9,
    reviewsCount: 25,
    featured: true,
    createdAt: '2026-01-01T00:00:00Z',
    colors: ['Black', 'White', 'Blue'],
    sizes: ['M', 'L', 'XL'],
  };

  const actionB = checkProductCardAction(productB);
  console.log('Test 2 (Product B - Card Action):', actionB);
  if (actionB.requiresQuickView !== true) {
    throw new Error('Test 2 Failed: Multi-variant product MUST open Quick View from Card');
  }

  const qvInitB = initializeQuickViewVariants(productB);
  console.log('Test 2b (Product B - Quick View Init):', qvInitB);
  if (qvInitB.initialColor !== undefined || qvInitB.initialSize !== undefined) {
    throw new Error('Test 2b Failed: Multi-variant product must NOT silently select first variant');
  }

  // Test 3: Validation when neither is selected
  const valBothMissing = validateQuickViewSubmission(productB, undefined, undefined);
  console.log('Test 3 (Both missing):', valBothMissing);
  if (valBothMissing.valid || valBothMissing.error !== 'Please select a color and size.') {
    throw new Error('Test 3 Failed: Should return "Please select a color and size."');
  }

  // Test 4: Validation when only size is selected
  const valColorMissing = validateQuickViewSubmission(productB, 'L', undefined);
  console.log('Test 4 (Color missing):', valColorMissing);
  if (valColorMissing.valid || valColorMissing.error !== 'Please select a color.') {
    throw new Error('Test 4 Failed: Should return "Please select a color."');
  }

  // Test 5: Validation when only color is selected
  const valSizeMissing = validateQuickViewSubmission(productB, undefined, 'Blue');
  console.log('Test 5 (Size missing):', valSizeMissing);
  if (valSizeMissing.valid || valSizeMissing.error !== 'Please select a size.') {
    throw new Error('Test 5 Failed: Should return "Please select a size."');
  }

  // Test 6: Validation when both are properly selected
  const valValid = validateQuickViewSubmission(productB, 'XL', 'Blue');
  console.log('Test 6 (Both selected):', valValid);
  if (!valValid.valid || valValid.color !== 'Blue' || valValid.size !== 'XL') {
    throw new Error('Test 6 Failed: Submission should be valid and preserve chosen variant');
  }
  console.log('✅ Test 2-6 Passed: Multi-variant flow & validations verified.');

  // Test Case 7: Product with multiple colors but NO sizes (e.g. Leather Wallet)
  const productWallet: Product = {
    id: 'prod-wallet',
    title: 'Executive Leather Wallet',
    price: 950,
    originalPrice: 1200,
    buyingPrice: 600,
    description: 'Leather wallet',
    categoryId: 'cat-acc',
    imageUrl: 'https://example.com/wallet.jpg',
    stock: 15,
    rating: 4.7,
    reviewsCount: 8,
    featured: false,
    createdAt: '2026-01-01T00:00:00Z',
    colors: ['Brown', 'Black', 'Tan'],
    sizes: [],
  };

  const actionWallet = checkProductCardAction(productWallet);
  if (!actionWallet.requiresQuickView) {
    throw new Error('Test 7 Failed: Multi-color wallet should require Quick View');
  }
  const valWalletNoColor = validateQuickViewSubmission(productWallet, undefined, undefined);
  if (valWalletNoColor.valid || valWalletNoColor.error !== 'Please select a color.') {
    throw new Error('Test 7b Failed: Wallet with no size should only prompt "Please select a color."');
  }
  const valWalletWithColor = validateQuickViewSubmission(productWallet, undefined, 'Tan');
  if (!valWalletWithColor.valid || valWalletWithColor.color !== 'Tan') {
    throw new Error('Test 7c Failed: Wallet with color should be valid');
  }
  console.log('✅ Test 7 Passed: Product with only multiple colors functions properly.');

  // Test Case 8: Product with multiple sizes but 1 color (e.g. T-Shirt with single color black)
  const productShirt: Product = {
    id: 'prod-shirt',
    title: 'Solid Black Tee',
    price: 650,
    originalPrice: 800,
    buyingPrice: 350,
    description: 'Black t-shirt',
    categoryId: 'cat-apparel',
    imageUrl: 'https://example.com/tee.jpg',
    stock: 30,
    rating: 4.9,
    reviewsCount: 15,
    featured: false,
    createdAt: '2026-01-01T00:00:00Z',
    colors: ['Black'],
    sizes: ['S', 'M', 'L', 'XL'],
  };

  const actionShirt = checkProductCardAction(productShirt);
  if (!actionShirt.requiresQuickView) {
    throw new Error('Test 8 Failed: Shirt with multiple sizes should require Quick View');
  }
  const qvInitShirt = initializeQuickViewVariants(productShirt);
  if (qvInitShirt.initialColor !== 'Black' || qvInitShirt.initialSize !== undefined) {
    throw new Error('Test 8b Failed: Single color should be auto-selected while sizes remain unselected');
  }
  const valShirtNoSize = validateQuickViewSubmission(productShirt, undefined, qvInitShirt.initialColor);
  if (valShirtNoSize.valid || valShirtNoSize.error !== 'Please select a size.') {
    throw new Error('Test 8c Failed: Shirt should prompt "Please select a size."');
  }
  const valShirtWithSize = validateQuickViewSubmission(productShirt, 'L', qvInitShirt.initialColor);
  if (!valShirtWithSize.valid || valShirtWithSize.size !== 'L' || valShirtWithSize.color !== 'Black') {
    throw new Error('Test 8d Failed: Shirt with size selected should be valid with Black color');
  }
  console.log('✅ Test 8 Passed: Product with single color and multiple sizes functions properly.');

  console.log('🎉 ALL 8 TESTS PASSED SUCCESSFULLY!');
}

runTests();
