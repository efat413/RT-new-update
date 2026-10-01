import { generateInvoiceHtml, getProductCode } from '../src/utils/invoice';
import { INITIAL_PRODUCTS, INITIAL_SETTINGS } from '../src/data/seedData';
import { Order } from '../src/types';

function runInvoiceVerification() {
  console.log('=== STARTING INVOICE FEATURE VERIFICATION ===\n');

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

  const mockOrder: Order = {
    id: 'ord-test-101',
    orderNumber: 'RDN-984210',
    createdAt: new Date().toISOString(),
    customer: {
      fullName: 'Tahmid Rahman',
      phone: '01712345678',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
      fullAddress: 'House 22, Road 4, Sector 3, Uttara',
      notes: 'Please call before delivery',
    },
    items: [
      {
        product: {
          ...INITIAL_PRODUCTS[0],
          sku: 'SKU-WAL-001',
        },
        quantity: 2,
        selectedSize: 'Standard',
        selectedColor: 'Rich Brown',
      },
      {
        product: {
          ...INITIAL_PRODUCTS[1],
          sku: 'SKU-BELT-09',
        },
        quantity: 1,
      },
    ],
    subtotal: INITIAL_PRODUCTS[0].price * 2 + INITIAL_PRODUCTS[1].price,
    deliveryFee: 80,
    totalAmount: INITIAL_PRODUCTS[0].price * 2 + INITIAL_PRODUCTS[1].price + 80,
    paymentMethod: 'cod',
    paymentStatus: 'Pending COD',
    shippingStatus: 'Pending',
  };

  const invoiceHtml = generateInvoiceHtml(mockOrder, INITIAL_SETTINGS);

  // 1. Website name
  assert(
    invoiceHtml.includes(INITIAL_SETTINGS.siteName),
    '1. Invoice features the website name'
  );

  // 2. Favicon / Logo
  assert(
    invoiceHtml.includes(INITIAL_SETTINGS.logoUrl) ||
    invoiceHtml.includes(INITIAL_SETTINGS.faviconUrl || ''),
    '2. Invoice features the favicon / logo URL'
  );

  // 3. Product name
  assert(
    invoiceHtml.includes(INITIAL_PRODUCTS[0].title) && invoiceHtml.includes(INITIAL_PRODUCTS[1].title),
    '3. Invoice includes product names'
  );

  // 4. Product code
  assert(
    invoiceHtml.includes('SKU-WAL-001') && invoiceHtml.includes('SKU-BELT-09'),
    '4. Invoice includes product codes/SKUs'
  );

  // 5. Product price
  assert(
    invoiceHtml.includes(INITIAL_PRODUCTS[0].price.toLocaleString()) &&
    invoiceHtml.includes((INITIAL_PRODUCTS[0].price * 2).toLocaleString()),
    '5. Invoice includes product price and calculated line total'
  );

  // 6. Courier charges
  assert(
    invoiceHtml.includes('Courier Charges') &&
    invoiceHtml.includes('Inside Dhaka') &&
    invoiceHtml.includes('80'),
    '6. Invoice includes courier charges with delivery zone'
  );

  // 7. Total balance displayed at the end
  assert(
    invoiceHtml.includes('Total Balance:') &&
    invoiceHtml.includes(mockOrder.totalAmount.toLocaleString()) &&
    invoiceHtml.includes('Balance Due:'),
    '7. Invoice displays Total Balance and Balance Due at the end'
  );

  // 8. Order Tracking Number
  assert(
    invoiceHtml.includes('RDN-984210'),
    '8. Invoice displays the customer order number'
  );

  // 9. Customer details
  assert(
    invoiceHtml.includes('Tahmid Rahman') &&
    invoiceHtml.includes('01712345678') &&
    invoiceHtml.includes('Uttara'),
    '9. Invoice includes customer name, phone, and delivery address'
  );

  // 10. Print / Save as PDF capability
  assert(
    invoiceHtml.includes('window.print()') &&
    invoiceHtml.includes('@media print'),
    '10. Invoice has print and save-as-PDF styles embedded'
  );

  console.log(`\nVerification complete: ${passed} PASSED, ${failed} FAILED\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runInvoiceVerification();
