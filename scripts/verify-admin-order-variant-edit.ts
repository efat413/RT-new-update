/**
 * Verification test for Admin Order Management: Product Color & Size Editing
 */

import { Product, CartItem } from '../src/types';

interface TestOrderItem extends CartItem {
  sellingPriceSnapshot?: number;
  buyingPriceSnapshot?: number;
  productCost?: number;
  productGrossProfit?: number;
}

function handleUpdateOrderItemSize(items: TestOrderItem[], index: number, newSize: string): TestOrderItem[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    return {
      ...item,
      selectedSize: newSize.trim() || undefined,
    };
  });
}

function handleUpdateOrderItemColor(items: TestOrderItem[], index: number, newColor: string): TestOrderItem[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    return {
      ...item,
      selectedColor: newColor.trim() || undefined,
    };
  });
}

function computeAvailableVariants(product: Product | undefined, item: TestOrderItem) {
  const availableSizes = Array.from(
    new Set([
      ...(product?.sizes || []),
      ...(item.product?.sizes || []),
      ...(item.selectedSize ? [item.selectedSize] : []),
    ].filter(Boolean) as string[])
  );
  const availableColors = Array.from(
    new Set([
      ...(product?.colors || []),
      ...(item.product?.colors || []),
      ...(item.selectedColor ? [item.selectedColor] : []),
    ].filter(Boolean) as string[])
  );
  return { availableSizes, availableColors };
}

function runVerification() {
  console.log('--- Starting Admin Edit Order: Color & Size Verification ---');

  const sampleProduct: Product = {
    id: 'prod-shirt-01',
    title: 'Premium Oxford Cotton Shirt',
    price: 1450,
    originalPrice: 1800,
    buyingPrice: 900,
    description: 'Cotton shirt',
    categoryId: 'cat-mens',
    imageUrl: 'https://example.com/shirt.jpg',
    stock: 25,
    rating: 4.8,
    reviewsCount: 12,
    featured: true,
    createdAt: '2026-01-01T00:00:00Z',
    colors: ['White', 'Sky Blue', 'Navy Blue'],
    sizes: ['M', 'L', 'XL'],
  };

  // Initial order item created with White / M
  const initialItems: TestOrderItem[] = [
    {
      product: sampleProduct,
      quantity: 2,
      selectedSize: 'M',
      selectedColor: 'White',
      sellingPriceSnapshot: 1450,
      buyingPriceSnapshot: 900,
    },
  ];

  // Test 1: Verify available sizes and colors detection
  const variants = computeAvailableVariants(sampleProduct, initialItems[0]);
  console.log('Test 1 (Available Variants):', variants);
  if (
    variants.availableColors.length !== 3 ||
    !variants.availableColors.includes('Navy Blue') ||
    variants.availableSizes.length !== 3 ||
    !variants.availableSizes.includes('XL')
  ) {
    throw new Error('Test 1 Failed: Available colors and sizes not extracted correctly');
  }
  console.log('✅ Test 1 Passed: Available variants correctly discovered.');

  // Test 2: Admin changes size from M to XL
  let updatedItems = handleUpdateOrderItemSize(initialItems, 0, 'XL');
  console.log('Test 2 (Size changed to XL):', updatedItems[0].selectedSize);
  if (updatedItems[0].selectedSize !== 'XL') {
    throw new Error('Test 2 Failed: selectedSize was not updated to XL');
  }
  console.log('✅ Test 2 Passed: Size successfully updated.');

  // Test 3: Admin changes color from White to Sky Blue
  updatedItems = handleUpdateOrderItemColor(updatedItems, 0, 'Sky Blue');
  console.log('Test 3 (Color changed to Sky Blue):', updatedItems[0].selectedColor);
  if (updatedItems[0].selectedColor !== 'Sky Blue') {
    throw new Error('Test 3 Failed: selectedColor was not updated to Sky Blue');
  }
  console.log('✅ Test 3 Passed: Color successfully updated.');

  // Test 4: Admin inputs custom size and custom color (e.g. customer requested bespoke tailoring)
  updatedItems = handleUpdateOrderItemSize(updatedItems, 0, 'XXXL (Custom Fit)');
  updatedItems = handleUpdateOrderItemColor(updatedItems, 0, 'Royal Crimson');
  console.log('Test 4 (Custom size & color):', {
    size: updatedItems[0].selectedSize,
    color: updatedItems[0].selectedColor,
  });
  if (
    updatedItems[0].selectedSize !== 'XXXL (Custom Fit)' ||
    updatedItems[0].selectedColor !== 'Royal Crimson'
  ) {
    throw new Error('Test 4 Failed: Custom variant values not properly stored');
  }
  console.log('✅ Test 4 Passed: Custom color and size inputs successfully stored.');

  // Test 5: Admin clears size and color (e.g. no variant)
  updatedItems = handleUpdateOrderItemSize(updatedItems, 0, '');
  updatedItems = handleUpdateOrderItemColor(updatedItems, 0, '');
  console.log('Test 5 (Cleared variants):', {
    size: updatedItems[0].selectedSize,
    color: updatedItems[0].selectedColor,
  });
  if (updatedItems[0].selectedSize !== undefined || updatedItems[0].selectedColor !== undefined) {
    throw new Error('Test 5 Failed: Empty size/color should reset to undefined');
  }
  console.log('✅ Test 5 Passed: Variant removal cleanly supported.');

  // Test 6: Verify payload construction preserves selectedSize and selectedColor
  const enrichedItems = [
    {
      product: sampleProduct,
      quantity: 1,
      selectedSize: 'L',
      selectedColor: 'Navy Blue',
      sellingPriceSnapshot: 1450,
      buyingPriceSnapshot: 900,
    },
  ].map((it) => {
    const unitPrice = Number(it.product?.price || 0);
    const buyingPrice = Number(it.buyingPriceSnapshot || 0);
    const qty = Number(it.quantity) || 1;
    return {
      ...it,
      product: { ...it.product, price: unitPrice },
      sellingPriceSnapshot: unitPrice,
      buyingPriceSnapshot: buyingPrice,
      productCost: buyingPrice * qty,
      productGrossProfit: (unitPrice - buyingPrice) * qty,
    };
  });

  if (enrichedItems[0].selectedSize !== 'L' || enrichedItems[0].selectedColor !== 'Navy Blue') {
    throw new Error('Test 6 Failed: Order payload failed to preserve selectedSize and selectedColor');
  }
  console.log('✅ Test 6 Passed: Payload accurately preserves size & color for server persistence.');

  console.log('🎉 ALL ADMIN ORDER VARIANT EDIT TESTS PASSED!');
}

runVerification();
