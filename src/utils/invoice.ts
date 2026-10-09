import { Order, StoreSettings } from '../types';

function escapeHtml(str: any): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getProductCode(item: Order['items'][0]): string {
  if (item.product.sku && item.product.sku.trim()) {
    return item.product.sku.trim();
  }
  // Fallback to formatted short product ID
  const cleanId = (item.product.id || '').replace(/^prod-/, '').trim();
  return cleanId ? `SKU-${cleanId.toUpperCase()}` : 'SKU-GENERAL';
}

export function generateInvoiceHtml(order: Order, settings: StoreSettings): string {
  const siteName = settings?.siteName || 'Rongdhonu Trade';
  const logoUrl = settings?.logoUrl || settings?.faviconUrl || 'https://i.pinimg.com/736x/bb/fe/59/bbfe59570509bbc00e9d703fd45ada18.jpg';
  const faviconUrl = settings?.faviconUrl || logoUrl;
  const storePhone = settings?.phone || '+8801518739561';
  const storeAddress = settings?.address || 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh';
  const currency = settings?.currencySymbol || '৳';

  const safeSiteName = escapeHtml(siteName);
  const safeFaviconUrl = escapeHtml(faviconUrl);
  const safeLogoUrl = escapeHtml(logoUrl);
  const safeStorePhone = escapeHtml(storePhone);
  const safeStoreAddress = escapeHtml(storeAddress);
  const safeCurrency = escapeHtml(currency);
  const safeOrderNumber = escapeHtml(order.orderNumber);

  const orderDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const paymentMethodLabel =
    order.paymentMethod === 'dbbl'
      ? 'Dutch-Bangla Bank (DBBL)'
      : order.paymentMethod === 'card'
      ? 'Card Payment'
      : 'Cash on Delivery (COD)';

  const isPaid =
    order.paymentStatus === 'PAID' ||
    order.paymentStatus === 'Paid';

  const itemsHtml = order.items
    .map((item, index) => {
      const code = escapeHtml(getProductCode(item));
      const variantDetails: string[] = [];
      if (item.selectedSize) variantDetails.push(`Size: ${escapeHtml(item.selectedSize)}`);
      if (item.selectedColor) variantDetails.push(`Color: ${escapeHtml(item.selectedColor)}`);

      const variantText = variantDetails.length > 0 ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${variantDetails.join(' | ')}</div>` : '';

      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 12px; text-align: center; color: #64748b; font-size: 12px;">${index + 1}</td>
          <td style="padding: 10px 12px;">
            <div style="font-weight: 600; color: #1e293b; font-size: 13px;">${escapeHtml(item.product.title)}</div>
            ${variantText}
          </td>
          <td style="padding: 10px 12px; font-family: monospace; font-size: 12px; font-weight: 600; color: #0f172a;">${code}</td>
          <td style="padding: 10px 12px; text-align: right; color: #334155; font-size: 13px;">${safeCurrency} ${item.product.price.toLocaleString()}</td>
          <td style="padding: 10px 12px; text-align: center; color: #334155; font-size: 13px; font-weight: 600;">${item.quantity}</td>
          <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a; font-size: 13px;">${safeCurrency} ${(item.product.price * item.quantity).toLocaleString()}</td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${safeOrderNumber} - ${safeSiteName}</title>
  <link rel="icon" type="image/x-icon" href="${safeFaviconUrl}" />
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Plus Jakarta Sans', 'Noto Sans Bengali', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      padding: 20px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    tr, .print-avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .invoice-container {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px 36px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
    }
    .rainbow-bar {
      height: 4px;
      background: linear-gradient(90deg, #ef4444 0%, #f59e0b 25%, #10b981 50%, #0ea5e9 75%, #8b5cf6 100%);
      border-radius: 2px;
      margin-bottom: 24px;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo {
      width: 56px;
      height: 56px;
      object-fit: contain;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      padding: 2px;
    }
    .brand-name {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .brand-contact {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
      line-height: 1.5;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-title {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .invoice-number {
      font-size: 14px;
      font-weight: 700;
      font-family: monospace;
      color: #e11d48;
      margin-top: 2px;
    }
    .invoice-date {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    .info-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px 16px;
    }
    .info-card-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 8px;
    }
    .customer-name {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .info-text {
      font-size: 12px;
      color: #334155;
      line-height: 1.5;
      margin-top: 2px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .items-table th {
      background: #f1f5f9;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 12px;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #cbd5e1;
    }
    .totals-container {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 24px;
    }
    .totals-table {
      width: 320px;
      border-collapse: collapse;
    }
    .totals-table td {
      padding: 6px 10px;
      font-size: 12px;
      color: #475569;
    }
    .totals-table td.amount {
      text-align: right;
      font-weight: 600;
      color: #1e293b;
    }
    .totals-table tr.total-row {
      border-top: 2px solid #cbd5e1;
      border-bottom: 2px solid #cbd5e1;
    }
    .totals-table tr.total-row td {
      padding: 10px 10px;
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
    }
    .totals-table tr.total-row td.amount {
      font-size: 16px;
      color: #e11d48;
    }
    .badge-status {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-paid {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .badge-pending {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .footer-note {
      border-top: 1px dashed #cbd5e1;
      padding-top: 16px;
      text-align: center;
      font-size: 11px;
      color: #64748b;
      line-height: 1.6;
    }
    .no-print {
      margin-bottom: 16px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #0f172a;
      color: #ffffff;
    }
    .btn-primary:hover {
      background: #1e293b;
    }
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
      }
      .invoice-container {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        max-width: 100% !important;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="no-print">
      <button class="btn btn-primary" onclick="window.print()">
        🖨️ Print / Save as PDF
      </button>
    </div>

    <div class="rainbow-bar"></div>

    <header class="header-row">
      <div class="brand-section">
        <img src="${safeLogoUrl}" alt="${safeSiteName} Logo" class="brand-logo" onerror="this.style.display='none'" />
        <div>
          <h1 class="brand-name">${safeSiteName}</h1>
          <p class="brand-contact">
            ${safeStoreAddress}<br>
            Hotline / WhatsApp: ${safeStorePhone}
          </p>
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-title">Invoice / Cash Memo</div>
        <div class="invoice-number">#${safeOrderNumber}</div>
        <div class="invoice-date">Date: ${orderDate}</div>
        <div style="margin-top: 6px;">
          <span class="badge-status ${isPaid ? 'badge-paid' : 'badge-pending'}">
            ${isPaid ? 'PAID' : 'PAYABLE ON DELIVERY (COD)'}
          </span>
        </div>
      </div>
    </header>

    <section class="info-grid">
      <div class="info-card">
        <div class="info-card-title">Customer / Delivery Details</div>
        <div class="customer-name">${escapeHtml(order.customer.fullName)}</div>
        <div class="info-text"><strong>Phone:</strong> ${escapeHtml(order.customer.phone)}</div>
        ${order.customer.alternativePhone ? `<div class="info-text"><strong>Alt Phone:</strong> ${escapeHtml(order.customer.alternativePhone)}</div>` : ''}
        <div class="info-text"><strong>Address:</strong> ${escapeHtml(order.customer.fullAddress)}, ${escapeHtml(order.customer.district)}</div>
        ${order.customer.notes ? `<div class="info-text"><strong>Notes:</strong> ${escapeHtml(order.customer.notes)}</div>` : ''}
      </div>

      <div class="info-card">
        <div class="info-card-title">Order & Payment Info</div>
        <div class="info-text"><strong>Payment Method:</strong> ${escapeHtml(paymentMethodLabel)}</div>
        <div class="info-text"><strong>Payment Status:</strong> ${escapeHtml(order.paymentStatus)}</div>
        <div class="info-text"><strong>Delivery Zone:</strong> ${order.customer.deliveryZone === 'inside_dhaka' ? 'Inside Dhaka (24-48 hrs)' : 'Outside Dhaka (48-72 hrs)'}</div>
        <div class="info-text"><strong>Shipping Status:</strong> ${escapeHtml(order.shippingStatus)}</div>
        ${order.transactionId ? `<div class="info-text"><strong>TrxID:</strong> ${escapeHtml(order.transactionId)}</div>` : ''}
      </div>
    </section>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 40px; text-align: center;">#</th>
          <th style="text-align: left;">Product Name</th>
          <th style="width: 120px; text-align: left;">Product Code</th>
          <th style="width: 90px; text-align: right;">Price</th>
          <th style="width: 50px; text-align: center;">Qty</th>
          <th style="width: 110px; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="totals-container">
      <table class="totals-table">
        <tr>
          <td>Subtotal:</td>
          <td class="amount">${safeCurrency} ${order.subtotal.toLocaleString()}</td>
        </tr>
        <tr>
          <td>Courier Charges (${order.customer.deliveryZone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}):</td>
          <td class="amount">${safeCurrency} ${order.deliveryFee.toLocaleString()}</td>
        </tr>
        ${
          order.discountAmount && order.discountAmount > 0
            ? `<tr>
                <td style="color: #16a34a;">Discount${order.couponCode ? ` (${escapeHtml(order.couponCode)})` : ''}:</td>
                <td class="amount" style="color: #16a34a;">-${safeCurrency} ${order.discountAmount.toLocaleString()}</td>
              </tr>`
            : ''
        }
        <tr class="total-row">
          <td>Total Balance:</td>
          <td class="amount">${safeCurrency} ${order.totalAmount.toLocaleString()} BDT</td>
        </tr>
        ${
          order.advancePayment && Number(order.advancePayment) > 0
            ? `<tr>
                <td style="color: #2563eb;">Advance Paid (${escapeHtml(order.advancePaymentMethod || 'Advance')}):</td>
                <td class="amount" style="color: #2563eb;">-${safeCurrency} ${Number(order.advancePayment).toLocaleString()} BDT</td>
              </tr>`
            : ''
        }
        <tr>
          <td style="font-weight: 700; color: ${isPaid || order.customerDue === 0 ? '#15803d' : '#b45309'}; padding-top: 8px;">
            ${isPaid || order.customerDue === 0 ? 'Amount Paid:' : 'Customer Due (COD):'}
          </td>
          <td class="amount" style="font-weight: 700; color: ${isPaid || order.customerDue === 0 ? '#15803d' : '#b45309'}; padding-top: 8px;">
            ${safeCurrency} ${(isPaid ? order.totalAmount : (order.customerDue ?? Math.max(0, order.totalAmount - (Number(order.advancePayment) || 0)))).toLocaleString()} BDT
          </td>
        </tr>
      </table>
    </div>

    <footer class="footer-note">
      <p style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">
        Thank you for choosing ${safeSiteName}!
      </p>
      <p>
        Enjoy a 7-day warranty for verified issues upon unboxing. For inquiries or live dispatch updates, contact our helpline at <strong>${safeStorePhone}</strong>.
      </p>
      <p style="font-size: 10px; color: #94a3b8; margin-top: 8px;">
        This is a computer-generated invoice and requires no physical signature.
      </p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Triggers a direct file download of the self-contained invoice HTML file
 * so the customer can save it locally and open or print it offline anytime.
 */
export function downloadInvoiceHtml(order: Order, settings: StoreSettings): void {
  const htmlContent = generateInvoiceHtml(order, settings);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Invoice-${order.orderNumber}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Triggers clean browser printing for the invoice using an isolated hidden iframe
 * so that no parent modals, dark backdrops, or page backgrounds distort the print job.
 */
export function printInvoice(order: Order, settings: StoreSettings): void {
  const htmlContent = generateInvoiceHtml(order, settings);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Ignore
    } finally {
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    }
  };

  // Safe timeout trigger if onload does not fire
  setTimeout(() => {
    try {
      if (document.body.contains(iframe)) {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 2000);
      }
    } catch {}
  }, 500);
}
