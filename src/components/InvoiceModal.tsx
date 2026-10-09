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
} from 'lucide-react';
import { Order, StoreSettings } from '../types';
import { useStore } from '../context/StoreContext';
import { BrandLogo } from './BrandLogo';
import {
  getProductCode,
  downloadInvoiceHtml,
} from '../utils/invoice';
import { parseColorOption } from '../utils/productVariants';

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
      className="bg-white text-slate-900 p-6 sm:p-10 max-w-[210mm] mx-auto space-y-6 font-sans"
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
          margin: 12mm;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          tr, .print-avoid-break {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          #invoice-printable-card {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      {/* Top Rainbow Accent */}
      <div className="h-1.5 w-full rainbow-gradient-bg rounded-full" />

      {/* Header: Branding, Website, Contact Info, Currency */}
      <header className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-5 border-b border-slate-200 print-avoid-break">
        <div className="flex items-start gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${siteName} Logo`}
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
            <p className="text-xs font-semibold text-rose-600 flex items-center gap-1">
              <Globe className="w-3 h-3" />
              <span>{websiteUrl}</span>
            </p>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm">
              {storeAddress}
            </p>
            <p className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-rose-500" />
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
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                isPaid || dueBalance === 0
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}
            >
              {isPaid || dueBalance === 0 ? (
                <>
                  <CheckCircle className="w-3 h-3" />
                  <span>PAID</span>
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3" />
                  <span>DUE: {currency}{dueBalance.toLocaleString()} BDT</span>
                </>
              )}
            </span>
          </div>
        </div>
      </header>

      {/* Customer Details & Order Meta */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 print-avoid-break">
        {/* Customer Details (Bangla UTF-8 Safe) */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-1.5">
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
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-1.5 text-xs">
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
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider">
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
                <tr key={idx} className="print-avoid-break">
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
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                            Size: {item.selectedSize}
                          </span>
                        )}
                        {parsedColor && (
                          <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                            <span
                              className="w-2 h-2 rounded-full border border-black/20"
                              style={{ backgroundColor: parsedColor.hex }}
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
      <div className="flex justify-end print-avoid-break">
        <div className="w-full sm:w-88 space-y-1.5 text-xs sm:text-sm bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
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
          >
            <span>Due / Remaining Balance:</span>
            <span className="font-mono text-sm sm:text-base">
              {currency}{dueBalance.toLocaleString()} BDT
            </span>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <footer className="pt-4 border-t border-dashed border-slate-300 text-center space-y-1 text-xs text-slate-500 print-avoid-break">
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
          <Printer className="w-4 h-4" />
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
    if (typeof window !== 'undefined') {
      document.body.classList.add('invoice-printing-active');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('invoice-printing-active');
      }, 500);
    }
  };

  const handleDownload = () => {
    downloadInvoiceHtml(order, settings);
  };

  return (
    <div className="invoice-print-portal fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto print:static print:p-0 print:bg-white print:overflow-visible">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-4 sm:my-8 print:my-0 print:border-0 print:shadow-none print:rounded-none print:max-w-none">
        {/* Top Control Bar */}
        <div className="no-print bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
            <FileText className="w-4 h-4 text-rose-400" />
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
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              id="invoice-download-file-btn"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700 cursor-pointer active:scale-95"
              title="Download standalone invoice file (.html)"
            >
              <Download className="w-3.5 h-3.5" />
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
