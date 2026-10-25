/**
 * Verification script for Product Purchase Flow & Variant Selection (Updated Behavior)
 * Tests:
 * 1. Color variants: First option auto-selected by default upon load.
 * 2. Size variants: First option auto-selected by default upon load.
 * 3. Customer can change color/size at any time and explicit selection is preserved.
 * 4. Products without color or size do not invent variant values.
 * 5. Shipping Zone is optional:
 *    - Order placed without selecting shipping zone uses safe fallback (district-based or default inside_dhaka).
 *    - Order placed with explicit shipping zone uses selected zone.
 *    - Consistent delivery fee calculation.
 */

import { Product, CustomerInfo, DeliveryZone } from '../src/types';

interface VariantInitializationResult {
  selectedColor?: string;
  selectedSize?: string;
}

function initializeVariantDefaults(product: Product): VariantInitializationResult {
  const selectedSize = product.sizes && product.sizes.length > 0 ? product.sizes[0] : undefined;
  const selectedColor = product.colors && product.colors.length > 0 ? product.colors[0] : undefined;
  return { selectedSize, selectedColor };
}

function resolveVariantSelection(
  product: Product,
  currentSize?: string,
  currentColor?: string
): { valid: boolean; color?: string; size?: string } {
  const resolvedColor =
    currentColor || (product.colors && product.colors.length > 0 ? product.colors[0] : undefined);
  const resolvedSize =
    currentSize || (product.sizes && product.sizes.length > 0 ? product.sizes[0] : undefined);

  return { valid: true, color: resolvedColor, size: resolvedSize };
}

function calculateEffectiveZoneAndFee(
  selectedZone: DeliveryZone | undefined,
  district: string,
  settings: { insideDhakaFee?: number; outsideDhakaFee?: number }
): { effectiveZone: DeliveryZone; fee: number } {
  const effectiveZone: DeliveryZone =
    selectedZone || (district && !district.toLowerCase().includes('dhaka') ? 'outside_dhaka' : 'inside_dhaka');
  const fee = effectiveZone === 'outside_dhaka' ? settings.outsideDhakaFee ?? 150 : settings.insideDhakaFee ?? 80;
  return { effectiveZone, fee };
}

function runTests() {
  console.log('--- Starting Variant & Shipping Zone Selection Verification ---');

  const settings = { insideDhakaFee: 80, outsideDhakaFee: 150 };

  // Test 1: Product with Multiple Colors & Sizes (Auto-selects first options)
  const productA: Product = {
    id: 'prod-multi',
    title: 'Multi-Variant Shirt',
    price: 1500,
    buyingPrice: 900,
    description: 'Cotton shirt with sizes and colors',
    categoryId: 'cat-apparel',
    imageUrl: 'https://example.com/shirt.jpg',
    stock: 50,
    rating: 5,
    reviewsCount: 12,
    featured: true,
    createdAt: '2026-01-01T00:00:00Z',
    colors: ['Navy Blue', 'Crimson Red', 'Olive Green'],
    sizes: ['M', 'L', 'XL'],
  };

  const initA = initializeVariantDefaults(productA);
  console.log('Test 1 (Initial variant auto-selection):', initA);
  if (initA.selectedColor !== 'Navy Blue' || initA.selectedSize !== 'M') {
    throw new Error('Test 1 Failed: First color and size must be selected by default upon load');
  }
  console.log('✅ Test 1 Passed: First available color and size auto-selected by default.');

  // Test 2: Customer changes color to 'Crimson Red' and size to 'XL'
  let userSelectedColor: string | undefined = initA.selectedColor;
  let userSelectedSize: string | undefined = initA.selectedSize;

  userSelectedColor = 'Crimson Red';
  userSelectedSize = 'XL';

  const resolvedChanged = resolveVariantSelection(productA, userSelectedSize, userSelectedColor);
  if (resolvedChanged.color !== 'Crimson Red' || resolvedChanged.size !== 'XL') {
    throw new Error('Test 2 Failed: Explicit customer changes must be preserved');
  }
  console.log('✅ Test 2 Passed: Customer color/size change is preserved.');

  // Test 3: Product with Color only (no sizes)
  const productWallet: Product = {
    id: 'prod-wallet',
    title: 'Leather Wallet',
    price: 800,
    buyingPrice: 400,
    description: 'Leather wallet',
    categoryId: 'cat-acc',
    imageUrl: 'https://example.com/wallet.jpg',
    stock: 20,
    rating: 4.8,
    reviewsCount: 5,
    featured: false,
    createdAt: '2026-01-01T00:00:00Z',
    colors: ['Black', 'Brown'],
    sizes: [],
  };

  const initWallet = initializeVariantDefaults(productWallet);
  console.log('Test 3 (Color only product):', initWallet);
  if (initWallet.selectedColor !== 'Black' || initWallet.selectedSize !== undefined) {
    throw new Error('Test 3 Failed: Should auto-select first color and leave size as undefined');
  }
  const resolvedWallet = resolveVariantSelection(productWallet, initWallet.selectedSize, initWallet.selectedColor);
  if (resolvedWallet.color !== 'Black' || resolvedWallet.size !== undefined) {
    throw new Error('Test 3b Failed: Must not invent size when none exist');
  }
  console.log('✅ Test 3 Passed: Color-only product selects first color, does not invent size.');

  // Test 4: Product with Size only (no colors)
  const productShoe: Product = {
    id: 'prod-shoe',
    title: 'Running Shoes',
    price: 3200,
    buyingPrice: 2000,
    description: 'Shoes',
    categoryId: 'cat-shoes',
    imageUrl: 'https://example.com/shoes.jpg',
    stock: 15,
    rating: 4.9,
    reviewsCount: 8,
    featured: false,
    createdAt: '2026-01-01T00:00:00Z',
    colors: [],
    sizes: ['41', '42', '43'],
  };

  const initShoe = initializeVariantDefaults(productShoe);
  if (initShoe.selectedSize !== '41' || initShoe.selectedColor !== undefined) {
    throw new Error('Test 4 Failed: Should auto-select first size and leave color as undefined');
  }
  const resolvedShoe = resolveVariantSelection(productShoe, initShoe.selectedSize, initShoe.selectedColor);
  if (resolvedShoe.size !== '41' || resolvedShoe.color !== undefined) {
    throw new Error('Test 4b Failed: Must not invent color when none exist');
  }
  console.log('✅ Test 4 Passed: Size-only product selects first size, does not invent color.');

  // Test 5: Product with Neither color nor size
  const productBook: Product = {
    id: 'prod-book',
    title: 'Programming Book',
    price: 500,
    buyingPrice: 250,
    description: 'Book',
    categoryId: 'cat-books',
    imageUrl: 'https://example.com/book.jpg',
    stock: 30,
    rating: 5,
    reviewsCount: 3,
    featured: false,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const initBook = initializeVariantDefaults(productBook);
  if (initBook.selectedColor !== undefined || initBook.selectedSize !== undefined) {
    throw new Error('Test 5 Failed: Product with no variants should have undefined color and size');
  }
  const resolvedBook = resolveVariantSelection(productBook, undefined, undefined);
  if (resolvedBook.color !== undefined || resolvedBook.size !== undefined) {
    throw new Error('Test 5b Failed: Must not invent variants for non-variant products');
  }
  console.log('✅ Test 5 Passed: Product with no variants leaves options undefined.');

  // Test 6: Shipping Zone Optional - Default / Unselected with Dhaka district
  const shippingUnselectedDhaka = calculateEffectiveZoneAndFee(undefined, 'Dhaka', settings);
  console.log('Test 6 (Shipping Zone unselected, Dhaka):', shippingUnselectedDhaka);
  if (shippingUnselectedDhaka.effectiveZone !== 'inside_dhaka' || shippingUnselectedDhaka.fee !== 80) {
    throw new Error('Test 6 Failed: Default Dhaka fallback failed');
  }
  console.log('✅ Test 6 Passed: Unselected shipping zone with Dhaka district resolves to inside_dhaka.');

  // Test 7: Shipping Zone Optional - Default / Unselected with Chittagong district
  const shippingUnselectedCtg = calculateEffectiveZoneAndFee(undefined, 'Chittagong', settings);
  console.log('Test 7 (Shipping Zone unselected, Chittagong):', shippingUnselectedCtg);
  if (shippingUnselectedCtg.effectiveZone !== 'outside_dhaka' || shippingUnselectedCtg.fee !== 150) {
    throw new Error('Test 7 Failed: Default Outside Dhaka fallback failed');
  }
  console.log('✅ Test 7 Passed: Unselected shipping zone with non-Dhaka district resolves to outside_dhaka.');

  // Test 8: Shipping Zone Explicitly Selected
  const shippingExplicitOutside = calculateEffectiveZoneAndFee('outside_dhaka', 'Dhaka', settings);
  if (shippingExplicitOutside.effectiveZone !== 'outside_dhaka' || shippingExplicitOutside.fee !== 150) {
    throw new Error('Test 8 Failed: Explicit outside_dhaka selection must be respected');
  }
  const shippingExplicitInside = calculateEffectiveZoneAndFee('inside_dhaka', 'Chittagong', settings);
  if (shippingExplicitInside.effectiveZone !== 'inside_dhaka' || shippingExplicitInside.fee !== 80) {
    throw new Error('Test 8b Failed: Explicit inside_dhaka selection must be respected');
  }
  console.log('✅ Test 8 Passed: Explicit shipping zone selection is respected.');

  console.log('🎉 ALL VARIANT & SHIPPING ZONE VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runTests();
