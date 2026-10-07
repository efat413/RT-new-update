import React from 'react';
import {
  X,
  Printer,
  Download,
  FileText,
  MapPin,
  CreditCard,
  Truck,
  CheckCircle,
  Clock,
  Phone,
  Building,
} from 'lucide-react';
import { Order } from '../types';
import { useStore } from '../context/StoreContext';
import { BrandLogo } from './BrandLogo';
import {
  getProductCode,
  printInvoice,
  downloadInvoiceHtml,
} from '../utils/invoice';
import { parseColorOption } from '../utils/productVariants';

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

  const siteName = settings?.siteName || 'Rongdhonu Trade';
  const logoUrl =
    settings?.logoUrl ||
    settings?.faviconUrl ||
    'https://i.pinimg.com/736x/bb/fe/59/bbfe59570509bbc00e9d703fd45ada18.jpg';
  const storePhone = settings?.phone || '+8801518739561';
  const storeAddress =
    settings?.address || 'House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh';
  const currency = settings?.currencySymbol || '৳';

  const orderDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const isPaid =
    order.paymentStatus === 'PAID' ||
    order.paymentStatus === 'Paid';

  const paymentMethodLabel =
    order.paymentMethod === 'dbbl'
      ? 'Dutch-Bangla Bank (DBBL)'
      : order.paymentMethod === 'card'
      ? 'Card Payment'
      : 'Cash on Delivery (COD)';

  const handlePrint = () => {
    printInvoice(order, settings);
  };

  const handleDownload = () => {
    downloadInvoiceHtml(order, settings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-4 sm:my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Top Control Bar */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
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

        {/* Printable/Viewable Invoice Body */}
        <div id="invoice-printable-card" className="p-6 sm:p-10 space-y-6 text-slate-800">
          {/* Subtle rainbow top accent */}
          <div className="h-1.5 w-full rainbow-gradient-bg rounded-full" />

          {/* Header Row: Brand Logo, Website Name & Store Info */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-slate-200">
            <div className="flex items-start gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 shadow-xs">
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
              <div>
                <h1 className="text-xl sm:text-2xl font-black font-display text-slate-900 tracking-tight">
                  {siteName}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed max-w-sm">
                  {storeAddress}
                </p>
                <p className="text-xs text-slate-600 font-medium mt-1 flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-rose-500" />
                  <span>Hotline / WhatsApp: {storePhone}</span>
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right w-full sm:w-auto bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-2xl border sm:border-0 border-slate-200">
              <span className="inline-block text-xs font-black uppercase tracking-wider text-rose-600 sm:text-slate-500">
                Official Invoice
              </span>
              <div className="text-base sm:text-lg font-mono font-bold text-slate-900 mt-0.5">
                #{order.orderNumber}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Date: {orderDate}
              </div>
              <div className="mt-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    isPaid
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {isPaid ? (
                    <>
                      <CheckCircle className="w-3 h-3" />
                      <span>PAID</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3" />
                      <span>COD DUE</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Customer & Order Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bill / Ship To */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Customer & Delivery Address:
              </span>
              <div className="text-sm font-bold text-slate-900">
                {order.customer.fullName}
              </div>
              <div className="text-xs text-slate-600 font-mono font-medium">
                {order.customer.phone}
                {order.customer.alternativePhone && ` / ${order.customer.alternativePhone}`}
              </div>
              <div className="text-xs text-slate-600 pt-0.5 leading-relaxed">
                {order.customer.fullAddress}, {order.customer.district}
              </div>
              {order.customer.notes && (
                <div className="text-[11px] text-slate-500 italic pt-1">
                  Note: {order.customer.notes}
                </div>
              )}
            </div>

            {/* Payment & Shipping Logistics */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-1.5 text-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Payment & Courier Details:
              </span>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-semibold text-slate-800">{paymentMethodLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Payment Status:</span>
                <span className="font-bold text-slate-800">{order.paymentStatus}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Delivery Zone:</span>
                <span className="font-semibold text-slate-800">
                  {order.customer.deliveryZone === 'inside_dhaka'
                    ? 'Inside Dhaka (24-48 hrs)'
                    : 'Outside Dhaka (48-72 hrs)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Shipping Status:</span>
                <span className="font-bold text-slate-800">{order.shippingStatus}</span>
              </div>
              {order.transactionId && (
                <div className="flex items-center justify-between font-mono text-[11px] text-indigo-700 pt-0.5">
                  <span>TrxID:</span>
                  <span className="font-bold">{order.transactionId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Product Items Table */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-3.5 text-center w-10">#</th>
                    <th className="py-3 px-3.5">Product Name</th>
                    <th className="py-3 px-3.5 w-28 sm:w-36">Product Code</th>
                    <th className="py-3 px-3.5 text-right w-24">Price</th>
                    <th className="py-3 px-3.5 text-center w-14">Qty</th>
                    <th className="py-3 px-3.5 text-right w-28">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item, idx) => {
                    const code = getProductCode(item);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-3.5 text-center text-slate-400 font-mono text-xs">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-semibold text-slate-900">
                            {item.product.title}
                          </div>
                          {(item.selectedSize || item.selectedColor) && (
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                              {item.selectedSize && (
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium text-slate-700">
                                  Size: {item.selectedSize}
                                </span>
                              )}
                              {item.selectedColor && (() => {
                                const parsed = parseColorOption(item.selectedColor);
                                return (
                                  <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded font-medium text-slate-700">
                                    <span
                                      className="w-2 h-2 rounded-full border border-black/20"
                                      style={{ backgroundColor: parsed.hex }}
                                    />
                                    <span>Color: {parsed.name}</span>
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-xs text-slate-700 font-semibold">
                          {code}
                        </td>
                        <td className="py-3 px-3.5 text-right text-slate-600 font-medium">
                          {currency} {item.product.price.toLocaleString()}
                        </td>
                        <td className="py-3 px-3.5 text-center font-bold text-slate-800">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-3.5 text-right font-bold text-slate-900">
                          {currency} {(item.product.price * item.quantity).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Breakdown & Total Balance */}
          <div className="flex justify-end">
            <div className="w-full sm:w-80 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-600 py-1">
                <span>Subtotal ({order.items.reduce((acc, i) => acc + i.quantity, 0)} items):</span>
                <span className="font-semibold text-slate-800">
                  {currency} {order.subtotal.toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between text-slate-600 py-1">
                <span>
                  Courier Charges ({order.customer.deliveryZone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}):
                </span>
                <span className="font-semibold text-slate-800">
                  {currency} {order.deliveryFee.toLocaleString()}
                </span>
              </div>

              {order.discountAmount && order.discountAmount > 0 ? (
                <div className="flex justify-between text-emerald-600 py-1">
                  <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}:</span>
                  <span className="font-semibold">
                    -{currency} {order.discountAmount.toLocaleString()}
                  </span>
                </div>
              ) : null}

              <div className="border-t-2 border-slate-200 pt-2 flex justify-between items-baseline font-bold text-base sm:text-lg text-slate-900">
                <span>Total Balance:</span>
                <span className="font-display text-rose-600 text-lg sm:text-xl">
                  {currency} {order.totalAmount.toLocaleString()} BDT
                </span>
              </div>

              {order.advancePayment != null && Number(order.advancePayment) > 0 && (
                <div className="flex justify-between text-blue-700 py-1 font-medium">
                  <span>Advance Paid ({order.advancePaymentMethod || 'Advance'}):</span>
                  <span className="font-semibold font-mono">
                    -{currency} {Number(order.advancePayment).toLocaleString()} BDT
                  </span>
                </div>
              )}

              {/* Explicit Balance Status Indicator */}
              <div
                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
                  isPaid || (order.customerDue === 0)
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}
              >
                <span>{isPaid || (order.customerDue === 0) ? 'Amount Paid:' : 'Customer Due (COD):'}</span>
                <span className="font-mono text-sm">
                  {currency} {(isPaid ? order.totalAmount : (order.customerDue ?? Math.max(0, order.totalAmount - (Number(order.advancePayment) || 0)))).toLocaleString()} BDT
                </span>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="pt-6 border-t border-dashed border-slate-200 text-center space-y-1.5 text-xs text-slate-500">
            <p className="font-bold text-slate-700">
              Thank you for shopping with {siteName}!
            </p>
            <p>
              Please keep this invoice for warranty and order tracking. For assistance, reach our hotline at{' '}
              <strong className="text-slate-700">{storePhone}</strong>.
            </p>
            <p className="text-[10px] text-slate-400 pt-1">
              This is an authorized, computer-generated invoice and requires no physical signature.
            </p>
          </div>

          {/* Action Footer for Mobile & Quick Actions */}
          <div className="pt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Print or Save as PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Download Invoice (.HTML)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="py-3 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
