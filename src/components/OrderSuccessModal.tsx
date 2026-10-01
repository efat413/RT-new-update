import React, { useState } from 'react';
import {
  CheckCircle,
  Package,
  Phone,
  Printer,
  Copy,
  ExternalLink,
  ShoppingBag,
  Truck,
  MapPin,
  Edit2,
  Trash2,
  AlertTriangle,
  FileText,
  Download,
  Eye,
} from 'lucide-react';
import { Order } from '../types';
import { useStore } from '../context/StoreContext';
import { EditDeliveryInfoModal } from './EditDeliveryInfoModal';
import { ConfirmModal } from './ConfirmModal';
import { formatWhatsAppLink } from '../utils/phone';

// Code-splitting: Lazy-load InvoiceModal on demand only when viewing/downloading invoices
const InvoiceModal = React.lazy(() =>
  import('./InvoiceModal').then((m) => ({ default: m.InvoiceModal }))
);
import { parseColorOption } from '../utils/productVariants';
import { getResponsiveImageUrl } from '../utils/responsiveImage';
import {
  getProductCode,
  printInvoice,
  downloadInvoiceHtml,
} from '../utils/invoice';

interface OrderSuccessModalProps {
  order: Order | null;
  onClose: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({ order: initialOrder, onClose }) => {
  const { settings, cancelCustomerOrder } = useStore();
  const [order, setOrder] = useState<Order | null>(initialOrder);
  const [copied, setCopied] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  React.useEffect(() => {
    setOrder(initialOrder);
  }, [initialOrder]);

  if (!order) return null;

  const copyOrderNumber = () => {
    navigator.clipboard.writeText(order.orderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPending = order.shippingStatus === 'Pending';

  const handleCancelOrder = () => {
    if (!isPending) {
      setCancelFeedback('Only pending orders can be canceled. This order has already progressed to shipping.');
      setTimeout(() => setCancelFeedback(null), 3500);
      return;
    }
    setIsCancelConfirmOpen(true);
  };

  const executeCancelOrder = async () => {
    const res = await cancelCustomerOrder(order.id);
    if (res.success) {
      setCancelFeedback(res.message || 'Order canceled successfully.');
      setTimeout(() => {
        setCancelFeedback(null);
        onClose();
      }, 1800);
    } else {
      setCancelFeedback(res.message || 'Failed to cancel order.');
      setTimeout(() => setCancelFeedback(null), 3500);
    }
    setIsCancelConfirmOpen(false);
  };

  const supportWhatsApp = settings.footer?.supportWhatsApp || settings.phone || '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-4 sm:my-8">
        {/* Rainbow Accent Header */}
        <div className="h-2.5 w-full rainbow-gradient-bg" />

        <div className="p-6 sm:p-8 space-y-6">
          {/* Top confirmation */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold font-display text-slate-800">
              Order Confirmed!
            </h2>
            <p className="text-sm text-slate-600">
              Thank you for shopping with <strong className="text-slate-800">{settings.siteName}</strong>. Your order is now being prepared for dispatch.
            </p>
          </div>

          {/* Order Details Badge */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">
                Order Tracking Number
              </span>
              <span className="text-lg font-bold font-mono text-slate-900">
                {order.orderNumber}
              </span>
            </div>
            <button
              id="copy-order-num-btn"
              onClick={copyOrderNumber}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors shadow-sm"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Payment & Shipping Summary */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <span className="text-slate-400 font-medium block">Payment Method</span>
              <span className="font-bold text-slate-800 block">
                {order.paymentMethod === 'dbbl'
                  ? 'Dutch-Bangla Bank (DBBL)'
                  : order.paymentMethod === 'card'
                  ? 'Card Payment'
                  : 'Cash on Delivery (COD)'}
              </span>
              <span
                className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  order.paymentStatus === 'PAID' || order.paymentStatus === 'Paid'
                    ? 'bg-emerald-100 text-emerald-700'
                    : order.paymentStatus === 'UNVERIFIED'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {order.paymentStatus}
              </span>
              {order.transactionId && (
                <span className="block text-[10px] font-mono text-indigo-700 font-bold mt-0.5">
                  TrxID: {order.transactionId}
                </span>
              )}
              {order.dbblDetails && (
                <span className="block text-[10px] text-slate-500 mt-0.5 truncate">
                  Via {order.dbblDetails.senderBank}
                </span>
              )}
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <span className="text-slate-400 font-medium block">Shipping Status</span>
              <span className="font-bold text-slate-800">
                {order.shippingStatus}
              </span>
              <span className="block text-[10px] text-slate-500 mt-1">
                {order.customer.deliveryZone === 'inside_dhaka'
                  ? 'Inside Dhaka (24-48 hrs)'
                  : 'Outside Dhaka (48-72 hrs)'}
              </span>
            </div>
          </div>

          {/* Customer Invoice & Download Banner */}
          <div className="bg-gradient-to-r from-rose-50 via-pink-50/40 to-indigo-50/60 border border-rose-200/90 rounded-2xl p-4 space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Official Customer Invoice
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    With product code, courier charges & total balance.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                id="open-invoice-modal-btn"
                onClick={() => setIsInvoiceOpen(true)}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Invoice</span>
              </button>

              <button
                type="button"
                id="download-invoice-pdf-btn"
                onClick={() => printInvoice(order, settings)}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
                title="Print or Save as PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF / Print</span>
              </button>

              <button
                type="button"
                id="download-invoice-file-btn"
                onClick={() => downloadInvoiceHtml(order, settings)}
                className="py-2 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition-all cursor-pointer active:scale-95"
                title="Download standalone HTML invoice file"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Save</span>
              </button>
            </div>
          </div>

          {/* Items Breakdown */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-slate-400" />
              Purchased Items ({order.items.length})
            </h4>
            <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 pr-1">
              {order.items.map((item, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <img
                      src={getResponsiveImageUrl(item.product.imageUrl, 240)}
                      alt={item.product.title}
                      width={40}
                      height={40}
                      loading="lazy"
                      decoding="async"
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                      style={{ aspectRatio: '1 / 1' }}
                    />
                    <div>
                      <p className="font-semibold text-slate-800 line-clamp-1">
                        {item.product.title}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap text-slate-500">
                        <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1 py-0.2 rounded font-semibold">
                          Code: {getProductCode(item)}
                        </span>
                        <span>•</span>
                        <span>Qty: {item.quantity}</span>
                        {(item.selectedSize || item.selectedColor) && (
                          <>
                            <span>•</span>
                            {item.selectedSize && (
                              <span className="bg-slate-100 px-1 py-0.2 rounded text-[10px] text-slate-700 font-medium">
                                Size: {item.selectedSize}
                              </span>
                            )}
                            {item.selectedColor && (() => {
                              const parsed = parseColorOption(item.selectedColor);
                              return (
                                <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded text-[10px] text-slate-700 font-medium flex items-center gap-1">
                                  <span>Color:</span>
                                  <span
                                    className={`w-2 h-2 rounded-full border shadow-2xs shrink-0 ${
                                      parsed.isLight ? 'border-slate-300' : 'border-black/20'
                                    }`}
                                    style={{ backgroundColor: parsed.hex }}
                                  />
                                  <span>{parsed.name}</span>
                                </span>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="font-bold text-slate-700">
                    ৳ {(item.product.price * item.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Cost breakdown */}
          <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>৳ {order.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Courier Charges ({order.customer.deliveryZone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}):</span>
              <span>৳ {order.deliveryFee.toLocaleString()}</span>
            </div>
            {order.discountAmount && order.discountAmount > 0 ? (
              <div className="flex justify-between text-emerald-600">
                <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}:</span>
                <span>-৳ {order.discountAmount.toLocaleString()}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-100">
              <span>Total Balance:</span>
              <span className="font-display text-rose-600">
                ৳ {order.totalAmount.toLocaleString()} BDT
              </span>
            </div>
          </div>

          {/* Customer Address Snapshot */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
              <span>Deliver to: {order.customer.fullName} ({order.customer.phone})</span>
            </div>
            <p className="text-slate-500 pl-5">{order.customer.fullAddress}, {order.customer.district}</p>
          </div>

          {/* Customer Post-Order Management Actions */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Manage Your Order:
            </span>

            {cancelFeedback && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold">
                {cancelFeedback}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                id="order-success-edit-delivery-btn"
                onClick={() => {
                  if (!isPending) {
                    setCancelFeedback('Order is already being processed and cannot be edited online. Please contact support.');
                    setTimeout(() => setCancelFeedback(null), 3500);
                    return;
                  }
                  setIsEditModalOpen(true);
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                  isPending
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 active:scale-95 cursor-pointer'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                }`}
                title={isPending ? 'Modify delivery address, contact phone, or delivery zone' : 'Order is already processing'}
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                Edit Delivery Info
              </button>

              <button
                type="button"
                id="order-success-cancel-btn"
                onClick={handleCancelOrder}
                disabled={!isPending}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                  isPending
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-95'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                }`}
                title={isPending ? 'Cancel order and restore product stock' : 'Cannot cancel orders in processing'}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                Cancel / Delete Order
              </button>
            </div>

            {!isPending && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Order is already being processed and cannot be edited or canceled online.
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              id="order-success-view-invoice-btn"
              onClick={() => setIsInvoiceOpen(true)}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>View & Download Official Invoice</span>
            </button>

            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={formatWhatsAppLink(
                  supportWhatsApp,
                  `Hi ${settings.siteName || 'Rongdhonu Trade'}! I just placed order #${order.orderNumber}. Could you please confirm delivery details?`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors shadow-md"
              >
                <Phone className="w-4 h-4" />
                WhatsApp Helpline
              </a>

              <button
                id="continue-shopping-btn"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all"
              >
                <ShoppingBag className="w-4 h-4" />
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Official Customer Invoice Modal */}
      {isInvoiceOpen && (
        <React.Suspense fallback={null}>
          <InvoiceModal
            order={order}
            isOpen={isInvoiceOpen}
            onClose={() => setIsInvoiceOpen(false)}
          />
        </React.Suspense>
      )}

      {/* Edit Delivery Info Modal */}
      <EditDeliveryInfoModal
        order={order}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={(updatedOrder) => {
          setOrder(updatedOrder);
        }}
      />

      {/* Unified In-App Order Cancellation Confirmation Modal */}
      <ConfirmModal
        isOpen={isCancelConfirmOpen}
        onClose={() => setIsCancelConfirmOpen(false)}
        title={`Cancel Order #${order.orderNumber}?`}
        message={`Are you sure you want to cancel Order #${order.orderNumber}?\n\nThis will permanently delete the order and automatically restore product items back into store inventory.`}
        confirmText="Yes, Cancel Order"
        cancelText="Keep Order"
        variant="danger"
        onConfirm={executeCancelOrder}
      />
    </div>
  );
};
