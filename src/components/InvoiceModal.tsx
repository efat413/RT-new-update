import React, { useMemo } from 'react';
import {
  X,
  Printer,
  Download,
  FileText,
  CheckCircle,
  Clock,
  Phone,
  Globe,
  LucideIcon,
} from 'lucide-react';
import { Order, StoreSettings } from '../types';
import { useStore } from '../context/StoreContext';
import { BrandLogo } from './BrandLogo';
import {
  getProductCode,
  printInvoice,
  downloadInvoiceHtml,
} from '../utils/invoice';
import { parseColorOption } from '../utils/productVariants';

export interface PrintSvgIconProps {
  icon: LucideIcon;
  size?: number;
  strokeColor: string;
  fillColor?: string;
  strokeWidth?: number;
  className?: string;
}

/**
 * Explicit print-safe SVG Icon wrapper:
 * Enforces explicit numeric width/height attributes and inline stroke/fill styles
 * so icons never vanish when Tailwind utility classes are stripped or rasterized during print/PDF export.
 */
export const PrintSvgIcon: React.FC<PrintSvgIconProps> = ({
  icon: IconComponent,
  size = 14,
  strokeColor,
  fillColor = 'none',
  strokeWidth = 2,
  className = '',
}) => (
  <span
    className={`inline-flex items-center justify-center shrink-0 ${className}`}
    style={{
      width: `${size}px`,
      height: `${size}px`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      verticalAlign: 'middle',
      flexShrink: 0,
      color: strokeColor,
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
    }}
  >
    <IconComponent
      width={size}
      height={size}
      stroke={strokeColor}
      fill={fillColor}
      strokeWidth={strokeWidth}
      className="invoice-print-svg"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        stroke: strokeColor,
        fill: fillColor,
        strokeWidth,
        display: 'block',
        visibility: 'visible',
        opacity: 1,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    />
  </span>
);

export interface OrderInvoiceProps {
  order: Order;
  settings?: StoreSettings;
  generatedAt?: string;
  onPrint?: () => void;
}

export const formatBangladeshDateTime = (dateInput: string | number | Date): string => {
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return String(dateInput || '');
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date) + ' (BDT Time)';
  } catch {
    return String(dateInput || '');
  }
};

export const OrderInvoice: React.FC<OrderInvoiceProps> = ({
  order,
  settings,
  generatedAt,
  onPrint,
}) => {
  const siteName = settings?.siteName || 'Rongdhonu Trade';
  const websiteUrl = 'https://rongdhonutrade.com/';
  const logoUrl =
    settings?.logoUrl ||
    settings?.faviconUrl ||
    'https://i.pinimg.com/736x/bb/fe/59/bbfe59570509bbc00e9d703fd45ada18.jpg';
  const storePhone = settings?.phone || '+8801518739561';
  const storeAddress =
    settings?.address || 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh';
  const currency = settings?.currencySymbol || '৳';

  const orderDateTime = useMemo(
    () => formatBangladeshDateTime(order.createdAt),
    [order.createdAt]
  );

  const invoiceGeneratedTimestamp = useMemo(
    () => generatedAt || formatBangladeshDateTime(new Date()),
    [generatedAt]
  );

  const isPaid =
    order.paymentStatus === 'PAID' ||
    order.paymentStatus === 'Paid';

  const paymentMethodLabel =
    order.paymentMethod === 'dbbl'
      ? 'Dutch-Bangla Bank (DBBL)'
      : order.paymentMethod === 'card'
      ? 'Card Payment'
      : 'Cash on Delivery (COD)';

  const subtotal = Number(order.subtotal) || 0;
  const discountAmount = Number(order.discountAmount) || 0;
  const deliveryFee = Number(order.deliveryFee) || 0;
  const totalAmount = Number(order.totalAmount) || 0;
  const advancePayment = Math.max(0, Number(order.advancePayment) || 0);
  const dueBalance = isPaid
    ? 0
    : order.customerDue != null
    ? Math.max(0, Number(order.customerDue))
    : Math.max(0, totalAmount - advancePayment);

  const triggerNativePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div
      id="invoice-printable-card"
      className="bg-white text-slate-900 p-6 sm:p-10 w-full max-w-[210mm] mx-auto space-y-6 font-sans"
      style={{
        fontFamily:
          "'Plus Jakarta Sans', 'Noto Sans Bengali', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          html, body, #root {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #invoice-printable-card,
          #invoice-printable-card * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          table {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          tr, .invoice-card, .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          svg.invoice-print-svg {
            display: inline-block !important;
            visibility: visible !important;
            opacity: 1 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #invoice-printable-card {
            width: 100% !important;
            max-width: 210mm !important;
            padding: 0 !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }
        }
      `}</style>

      {/* Top Rainbow Accent */}
      <div
        className="h-1.5 w-full rainbow-gradient-bg rounded-full"
        style={{
          background:
            'linear-gradient(135deg, #ef4444 0%, #f59e0b 25%, #10b981 50%, #0ea5e9 75%, #8b5cf6 100%)',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      />

      {/* Header: Branding, Website, Contact Info, Currency */}
      <header className="invoice-card print-avoid-break flex flex-col sm:flex-row justify-between items-start gap-4 pb-5 border-b border-slate-200">
        <div className="flex items-start gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${siteName} Logo`}
                crossOrigin="anonymous"
                className="w-full h-full object-contain rounded-xl"
              />
            ) : (
              <BrandLogo size="md" showText={false} />
            )}
          </div>
          <div className="space-y-0.5">
            <h1 className="text-xl sm:text-2xl font-black font-display text-slate-900 tracking-tight">
              {siteName}
            </h1>
            <p className="text-xs font-semibold text-rose-600 flex items-center gap-1.5">
              <PrintSvgIcon icon={Globe} size={13} strokeColor="#e11d48" />
              <span>{websiteUrl}</span>
            </p>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm">
              {storeAddress}
            </p>
            <p className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
              <PrintSvgIcon icon={Phone} size={13} strokeColor="#f43f5e" />
              <span>Hotline / WhatsApp: {storePhone}</span>
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right w-full sm:w-auto bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-2xl border sm:border-0 border-slate-200 space-y-1">
          <div className="inline-block text-xs font-black uppercase tracking-wider text-rose-600">
            Official Tax / Cash Invoice
          </div>
          <div className="text-base sm:text-lg font-mono font-bold text-slate-900">
            Order ID: #{order.orderNumber}
          </div>
          <div className="text-[11px] font-semibold text-slate-600">
            Currency: BDT ({currency})
          </div>
          <div className="pt-1">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                isPaid || dueBalance === 0
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}
              style={{
                backgroundColor: isPaid || dueBalance === 0 ? '#d1fae5' : '#fef3c7',
                color: isPaid || dueBalance === 0 ? '#065f46' : '#78350f',
                borderColor: isPaid || dueBalance === 0 ? '#6ee7b7' : '#fcd34d',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              {isPaid || dueBalance === 0 ? (
                <>
                  <PrintSvgIcon icon={CheckCircle} size={13} strokeColor="#065f46" />
                  <span>PAID</span>
                </>
              ) : (
                <>
                  <PrintSvgIcon icon={Clock} size={13} strokeColor="#78350f" />
                  <span>DUE: {currency}{dueBalance.toLocaleString()} BDT</span>
                </>
              )}
            </span>
          </div>
        </div>
      </header>

      {/* Customer Details & Order Meta */}
      <section className="invoice-card print-avoid-break grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Customer Details (Bangla UTF-8 Safe) */}
        <div
          className="invoice-card bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-1.5"
          style={{
            backgroundColor: '#f8fafc',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Customer & Delivery Address
          </span>
          <div className="text-sm font-bold text-slate-900 break-words">
            {order.customer.fullName}
          </div>
          <div className="text-xs text-slate-700 font-mono font-semibold">
            Phone: {order.customer.phone}
            {order.customer.alternativePhone ? ` / ${order.customer.alternativePhone}` : ''}
          </div>
          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line break-words">
            Address: {order.customer.fullAddress}
            {order.customer.area ? `, ${order.customer.area}` : ''}
            {order.customer.district ? `, ${order.customer.district}` : ''}
          </div>
          {order.customer.notes && (
            <div className="text-[11px] text-slate-600 italic pt-1 break-words">
              Note: {order.customer.notes}
            </div>
          )}
        </div>

        {/* Order Meta */}
        <div
          className="invoice-card bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-1.5 text-xs"
          style={{
            backgroundColor: '#f8fafc',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Order Metadata
          </span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Order ID:</span>
            <span className="font-mono font-bold text-slate-900">#{order.orderNumber}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Order Date/Time:</span>
            <span className="font-semibold text-slate-800 text-right">{orderDateTime}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Invoice Generated:</span>
            <span className="font-medium text-slate-700 text-right">{invoiceGeneratedTimestamp}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Order / Shipping Status:</span>
            <span className="font-bold text-slate-900">{order.shippingStatus} ({order.paymentStatus})</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Payment Method:</span>
            <span className="font-semibold text-slate-800">{paymentMethodLabel}</span>
          </div>
          {order.transactionId && (
            <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-indigo-700">
              <span>Transaction ID:</span>
              <span className="font-bold">{order.transactionId}</span>
            </div>
          )}
        </div>
      </section>

      {/* Item Table */}
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <table
          className="w-full text-left border-collapse text-xs sm:text-sm"
          style={{ pageBreakInside: 'auto', breakInside: 'auto' }}
        >
          <thead>
            <tr
              className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider"
              style={{
                backgroundColor: '#f1f5f9',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              <th className="py-2.5 px-3 text-center w-10">SL</th>
              <th className="py-2.5 px-3">Item Name</th>
              <th className="py-2.5 px-3 w-36">Options / Variant</th>
              <th className="py-2.5 px-3 text-right w-24">Unit Price</th>
              <th className="py-2.5 px-3 text-center w-14">Qty</th>
              <th className="py-2.5 px-3 text-right w-28">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {order.items.map((item, idx) => {
              const code = getProductCode(item);
              const unitPrice = Number(item.sellingPriceSnapshot ?? item.product.price) || 0;
              const lineTotal = unitPrice * item.quantity;
              const parsedColor = item.selectedColor ? parseColorOption(item.selectedColor) : null;

              return (
                <tr
                  key={idx}
                  className="invoice-card print-avoid-break"
                  style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                >
                  <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-xs">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900 break-words">
                      {item.product.title}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      Code: {code}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-700">
                    {item.selectedSize || parsedColor ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.selectedSize && (
                          <span
                            className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-medium"
                            style={{
                              backgroundColor: '#f1f5f9',
                              WebkitPrintColorAdjust: 'exact',
                              printColorAdjust: 'exact',
                            }}
                          >
                            Size: {item.selectedSize}
                          </span>
                        )}
                        {parsedColor && (
                          <span
                            className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-medium"
                            style={{
                              backgroundColor: '#f1f5f9',
                              WebkitPrintColorAdjust: 'exact',
                              printColorAdjust: 'exact',
                            }}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                              style={{
                                backgroundColor: parsedColor.hex,
                                WebkitPrintColorAdjust: 'exact',
                                printColorAdjust: 'exact',
                              }}
                            />
                            <span>Color: {parsedColor.name}</span>
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">Standard</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-700 font-medium">
                    {currency}{unitPrice.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                    {item.quantity}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                    {currency}{lineTotal.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Financial Summary */}
      <div className="invoice-card print-avoid-break flex justify-end">
        <div
          className="invoice-card w-full sm:w-88 space-y-1.5 text-xs sm:text-sm bg-slate-50/70 p-4 rounded-2xl border border-slate-200"
          style={{
            backgroundColor: '#f8fafc',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <div className="flex justify-between text-slate-600 py-0.5">
            <span>Subtotal ({order.items.reduce((acc, i) => acc + i.quantity, 0)} items):</span>
            <span className="font-mono font-semibold text-slate-900">
              {currency}{subtotal.toLocaleString()} BDT
            </span>
          </div>

          <div className="flex justify-between text-slate-600 py-0.5">
            <span>
              Discount{order.couponCode ? ` (${order.couponCode})` : ''}:
            </span>
            <span className="font-mono font-semibold text-emerald-700">
              -{currency}{discountAmount.toLocaleString()} BDT
            </span>
          </div>

          <div className="flex justify-between text-slate-600 py-0.5">
            <span>
              Delivery Charge ({order.customer.deliveryZone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}):
            </span>
            <span className="font-mono font-semibold text-slate-900">
              {currency}{deliveryFee.toLocaleString()} BDT
            </span>
          </div>

          <div className="border-t border-slate-300 pt-2 flex justify-between items-baseline font-bold text-sm sm:text-base text-slate-900">
            <span>Total Amount:</span>
            <span className="font-mono text-base sm:text-lg text-slate-900">
              {currency}{totalAmount.toLocaleString()} BDT
            </span>
          </div>

          <div className="flex justify-between text-blue-700 py-0.5 font-medium">
            <span>
              Advance Payment{order.advancePaymentMethod ? ` (${order.advancePaymentMethod})` : ''}:
            </span>
            <span className="font-mono font-semibold">
              -{currency}{advancePayment.toLocaleString()} BDT
            </span>
          </div>

          <div
            className={`mt-2 p-2.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-bold ${
              dueBalance === 0
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-amber-50 text-amber-900 border-amber-300'
            }`}
            style={{
              backgroundColor: dueBalance === 0 ? '#ecfdf5' : '#fffbeb',
              color: dueBalance === 0 ? '#064e3b' : '#78350f',
              borderColor: dueBalance === 0 ? '#6ee7b7' : '#fcd34d',
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          >
            <span>Due / Remaining Balance:</span>
            <span className="font-mono text-sm sm:text-base">
              {currency}{dueBalance.toLocaleString()} BDT
            </span>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <footer className="invoice-card print-avoid-break pt-4 border-t border-dashed border-slate-300 text-center space-y-1 text-xs text-slate-500">
        <p className="font-bold text-slate-800">
          Thank you for shopping with {siteName} ({websiteUrl})!
        </p>
        <p>
          Please keep this invoice for warranty and order tracking. Helpline:{' '}
          <strong className="text-slate-700">{storePhone}</strong>
        </p>
      </footer>

      {/* Simple Native Print Trigger Button (Hidden in print via .no-print) */}
      <div className="no-print pt-2 flex justify-end">
        <button
          type="button"
          onClick={triggerNativePrint}
          className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm inline-flex items-center gap-2 shadow-sm cursor-pointer active:scale-95"
        >
          <PrintSvgIcon icon={Printer} size={16} strokeColor="#ffffff" />
          <span>Print Invoice (A4)</span>
        </button>
      </div>
    </div>
  );
};

interface InvoiceModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  const { settings } = useStore();

  if (!isOpen || !order) return null;

  const handlePrint = () => {
    printInvoice(order, settings);
  };

  const handleDownload = () => {
    downloadInvoiceHtml(order, settings);
  };

  return (
    <div className="invoice-print-portal fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto print:static print:p-0 print:bg-white print:overflow-visible">
      <div className="relative w-full max-w-[210mm] bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-4 sm:my-8 print:my-0 print:border-0 print:shadow-none print:rounded-none print:max-w-[210mm] print:overflow-visible">
        {/* Top Control Bar */}
        <div className="no-print bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
            <PrintSvgIcon icon={FileText} size={16} strokeColor="#fb7185" />
            <span>Order Invoice #{order.orderNumber}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="invoice-print-pdf-btn"
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
              title="Print or Save as PDF"
            >
              <PrintSvgIcon icon={Printer} size={14} strokeColor="#ffffff" />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              id="invoice-download-file-btn"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700 cursor-pointer active:scale-95"
              title="Download standalone invoice file (.html)"
            >
              <PrintSvgIcon icon={Download} size={14} strokeColor="#e2e8f0" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
              aria-label="Close invoice"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable A4 Invoice Component */}
        <OrderInvoice order={order} settings={settings} onPrint={handlePrint} />
      </div>
    </div>
  );
};
