import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Package,
  MapPin,
  Edit2,
  Trash2,
  Clock,
  Truck,
  CheckCircle2,
  Phone,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  ChevronRight,
  MessageCircle,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Order } from '../types';
import { EditDeliveryInfoModal } from './EditDeliveryInfoModal';
import { ConfirmModal } from './ConfirmModal';
import { formatWhatsAppLink } from '../utils/phone';
import { orderApi } from '../services/orderApi';
import { getResponsiveImageUrl } from '../utils/responsiveImage';

interface OrderTrackingDropdownProps {
  onClose: () => void;
}

export const OrderTrackingDropdown: React.FC<OrderTrackingDropdownProps> = ({ onClose }) => {
  const { orders, cancelCustomerOrder, settings, isAdminLoggedIn, currentUser } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [matchedOrder, setMatchedOrder] = useState<Order | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Get most recent 3 orders for quick-click lookup suggestions
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3);
  }, [orders]);

  const performSearch = async (queryStr: string, phoneStr: string) => {
    const orderNum = queryStr.trim();
    const cleanPhone = phoneStr.replace(/[^0-9]/g, '');

    if (!orderNum) {
      setSearchError('Please enter your Order Number (e.g. RNG-10024).');
      return;
    }
    if (!cleanPhone || cleanPhone.length < 11) {
      setSearchError('Please enter your valid 11-digit contact number for verification.');
      return;
    }

    setHasSearched(true);
    setIsSearching(true);
    setSearchError(null);

    // 1. Check local session orders if available
    const localMatch = orders.find((o) => {
      const matchNum = o.orderNumber.toLowerCase() === orderNum.toLowerCase() || o.id.toLowerCase() === orderNum.toLowerCase();
      const matchPhone = o.customer.phone.replace(/[^0-9]/g, '').endsWith(cleanPhone.slice(-11));
      return matchNum && matchPhone;
    });

    if (localMatch) {
      setMatchedOrder(localMatch);
    }

    // 2. Query secure backend tracking endpoint (enforces rate-limits, anti-scraping, and fresh courier status)
    try {
      const apiRes = await orderApi.trackOrder(orderNum, cleanPhone);
      if (apiRes.success && apiRes.order) {
        setMatchedOrder(apiRes.order);
        setSearchError(null);
      } else if (!localMatch) {
        setMatchedOrder(null);
        setSearchError(apiRes.error || 'Order not found or contact number does not match.');
      } else if (apiRes.isRateLimited) {
        setSearchError(apiRes.error || 'Too many tracking requests. Please slow down.');
      }
    } catch {
      if (!localMatch) {
        setMatchedOrder(null);
        setSearchError('Unable to reach server. Please check your connection and try again.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchQuery, phoneQuery);
  };

  const handleQuickLookup = (order: Order) => {
    setSearchQuery(order.orderNumber);
    setPhoneQuery(order.customer.phone);
    performSearch(order.orderNumber, order.customer.phone);
  };

  const handleCopyOrderNumber = (num: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(num);
    }
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCancelOrder = () => {
    if (!matchedOrder) return;
    if (matchedOrder.shippingStatus !== 'Pending') {
      setActionFeedback('Only pending orders can be canceled. This order has already progressed to shipping.');
      setTimeout(() => setActionFeedback(null), 3500);
      return;
    }
    setIsCancelConfirmOpen(true);
  };

  const executeCancelOrder = async () => {
    if (!matchedOrder) return;
    const res = await cancelCustomerOrder(matchedOrder.id);
    if (res.success) {
      setActionFeedback(`Order #${matchedOrder.orderNumber} was successfully canceled and stock restored.`);
      setMatchedOrder(null);
      setTimeout(() => {
        setActionFeedback(null);
      }, 4000);
    } else {
      setActionFeedback(res.message || 'Failed to cancel order.');
      setTimeout(() => setActionFeedback(null), 3500);
    }
    setIsCancelConfirmOpen(false);
  };

  const isPending = matchedOrder?.shippingStatus === 'Pending';
  const supportWhatsApp = settings.footer?.supportWhatsApp || settings.phone || '';
  const canModifyDirectly = Boolean(
    isAdminLoggedIn ||
    (currentUser && matchedOrder?.userEmail && currentUser.email?.toLowerCase() === matchedOrder.userEmail.toLowerCase()) ||
    orders.some((o) => o.id === matchedOrder?.id)
  );

  return (
    <div className="flex flex-col h-full max-h-[82vh] bg-white text-slate-900 select-text">
      {/* Rainbow gradient accent bar */}
      <div className="h-1.5 w-full rainbow-gradient-bg shrink-0" />

      {/* Header */}
      <div className="p-4 sm:p-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
            <Truck className="w-4.5 h-4.5 text-rose-400" />
          </div>
          <div>
            <h2 className="font-display font-bold text-sm sm:text-base text-slate-900 leading-tight">
              Track Order & Parcel Status
            </h2>
            <p className="text-[11px] text-slate-500">
              Live delivery tracking & post-order options
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          title="Close dropdown"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="p-3.5 sm:p-4 bg-white border-b border-slate-100 shrink-0 space-y-2">
        <form onSubmit={handleSearch} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="order-tracking-dropdown-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Order Number (e.g. RNG-10024)"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all"
              />
            </div>
            <div className="relative flex-1">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="order-tracking-dropdown-phone-input"
                type="tel"
                value={phoneQuery}
                onChange={(e) => setPhoneQuery(e.target.value)}
                placeholder="11-digit Contact Phone"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all"
              />
            </div>
            <button
              id="order-tracking-dropdown-search-btn"
              type="submit"
              disabled={isSearching}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-xs hover:shadow active:scale-95 transition-all shrink-0 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <span>{isSearching ? 'Checking...' : 'Track'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Quick lookups for recent orders if available */}
        {!hasSearched && recentOrders.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Recent:
            </span>
            {recentOrders.map((ord) => (
              <button
                key={ord.id}
                type="button"
                onClick={() => handleQuickLookup(ord)}
                className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-mono font-bold transition-colors cursor-pointer border border-slate-200/80"
              >
                #{ord.orderNumber}
              </button>
            ))}
          </div>
        )}

        {/* Search error / rate limit banner */}
        {searchError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="flex-1">{searchError}</span>
          </div>
        )}

        {/* Feedback message banner */}
        {actionFeedback && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="flex-1">{actionFeedback}</span>
          </div>
        )}
      </div>

      {/* Scrollable Body Content */}
      <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 space-y-3.5">
        {/* Initial Empty / Prompt State */}
        {!hasSearched && !matchedOrder && (
          <div className="py-8 text-center space-y-2.5 px-2">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
              <Package className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Real-time Order Lookup</h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              Check delivery progress, view courier waybills (Steadfast / Pathao), or track delivery status in real time.
            </p>
            <div className="pt-2 flex items-center justify-center gap-4 text-[11px] text-slate-400 font-medium">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Live Dispatch Status
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Courier Tracking
              </span>
            </div>
          </div>
        )}

        {/* Not Found State */}
        {hasSearched && !matchedOrder && (
          <div className="py-7 text-center space-y-2.5 px-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">No Matching Order Found</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              We couldn't verify an order with number <strong className="text-slate-800 font-mono">"{searchQuery}"</strong> and the specified phone number.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setPhoneQuery('');
                setHasSearched(false);
                setSearchError(null);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Clear and try again
            </button>
          </div>
        )}

        {/* Matched Order Details Card */}
        {matchedOrder && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            {/* Order Card Container */}
            <div className="p-3.5 sm:p-4 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-3.5">
              {/* Order ID & Status Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Order ID
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono font-bold text-sm sm:text-base text-slate-900">
                      {matchedOrder.orderNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyOrderNumber(matchedOrder.orderNumber)}
                      className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                      title="Copy order number"
                    >
                      {copiedId ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      matchedOrder.shippingStatus === 'Delivered'
                        ? 'bg-emerald-100 text-emerald-800'
                        : matchedOrder.shippingStatus === 'Shipped'
                        ? 'bg-blue-100 text-blue-800'
                        : matchedOrder.shippingStatus === 'Cancelled'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {matchedOrder.shippingStatus}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      matchedOrder.paymentStatus === 'PAID' || matchedOrder.paymentStatus === 'Paid'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {matchedOrder.paymentStatus}
                  </span>
                </div>
              </div>

              {/* Progress Timeline */}
              <div className="py-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1.5">
                  <span className={matchedOrder.shippingStatus ? 'text-emerald-600' : ''}>1. Placed</span>
                  <span className={matchedOrder.shippingStatus !== 'Pending' ? 'text-emerald-600' : ''}>2. Processing</span>
                  <span className={matchedOrder.shippingStatus === 'Shipped' || matchedOrder.shippingStatus === 'Delivered' ? 'text-emerald-600' : ''}>3. Shipped</span>
                  <span className={matchedOrder.shippingStatus === 'Delivered' ? 'text-emerald-600' : ''}>4. Delivered</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{
                      width:
                        matchedOrder.shippingStatus === 'Delivered'
                          ? '100%'
                          : matchedOrder.shippingStatus === 'Shipped'
                          ? '75%'
                          : matchedOrder.shippingStatus === 'Processing'
                          ? '50%'
                          : '25%',
                    }}
                  />
                </div>
              </div>

              {/* Recipient & Courier Details */}
              <div className="space-y-2 text-xs">
                {/* Delivery Address */}
                <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">
                    Delivery Address
                  </span>
                  <p className="font-bold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>{matchedOrder.customer.fullName}</span>
                    <span className="text-slate-500 font-mono text-[11px]">({matchedOrder.customer.phone})</span>
                  </p>
                  <p className="text-slate-600 pl-5 text-[11px] leading-snug">
                    {matchedOrder.customer.fullAddress?.includes(matchedOrder.customer.district)
                      ? matchedOrder.customer.fullAddress
                      : `${matchedOrder.customer.fullAddress}, ${matchedOrder.customer.district}`}
                  </p>
                  <div className="pl-5 pt-0.5">
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                      Zone: {matchedOrder.customer.deliveryZone === 'inside_dhaka' ? 'Inside Dhaka (৳80)' : 'Outside Dhaka (৳150)'}
                    </span>
                  </div>
                </div>

                {/* Courier & Payment Info */}
                <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase tracking-wider">
                    Courier & Payment
                  </span>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Payment Method:</span>
                    <span className="font-bold text-slate-800">
                      {matchedOrder.paymentMethod === 'dbbl' ? 'DBBL / NexusPay' : 'Cash on Delivery (COD)'}
                    </span>
                  </div>
                  {matchedOrder.transactionId && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">TrxID:</span>
                      <span className="text-indigo-700 font-mono font-bold">{matchedOrder.transactionId}</span>
                    </div>
                  )}

                  {matchedOrder.courierBooking ? (
                    <div className="pt-1 mt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1 text-blue-600 font-semibold">
                        <Truck className="w-3.5 h-3.5 shrink-0" />
                        <span>{matchedOrder.courierBooking.provider} Waybill:</span>
                      </div>
                      <span className="font-mono font-bold text-slate-800">
                        {matchedOrder.courierBooking.waybillId}
                      </span>
                    </div>
                  ) : (
                    <div className="pt-1 mt-1 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Courier assigning upon dispatch</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Items ({matchedOrder.items.length})
                </span>
                <div className="divide-y divide-slate-100 bg-white rounded-xl border border-slate-200/90 overflow-hidden max-h-36 overflow-y-auto">
                  {matchedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <img
                          src={getResponsiveImageUrl(item.product.imageUrl, 240)}
                          alt={item.product.title}
                          width={32}
                          height={32}
                          loading="lazy"
                          decoding="async"
                          className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                          style={{ aspectRatio: '1 / 1' }}
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-[11px] truncate">
                            {item.product.title}
                          </p>
                          <p className="text-[10px] text-slate-400">Qty: {item.quantity}</p>
                        </div>
                      </div>
                      <span className="font-bold text-slate-800 text-[11px] shrink-0">
                        ৳ {(item.product.price * item.quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Financial Summary */}
                <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>Subtotal:</span>
                    <span>৳ {matchedOrder.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>Delivery Fee:</span>
                    <span>৳ {matchedOrder.deliveryFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-slate-900 pt-1 border-t border-slate-100">
                    <span>Grand Total:</span>
                    <span className="text-rose-600 font-bold">
                      ৳ {matchedOrder.totalAmount.toLocaleString()} BDT
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row gap-2">
                {isPending && canModifyDirectly ? (
                  <button
                    type="button"
                    id="dropdown-edit-delivery-btn"
                    onClick={() => setIsEditModalOpen(true)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-rose-300" />
                    <span>Edit Delivery Info</span>
                  </button>
                ) : (
                  <div className="w-full p-2.5 bg-slate-100 rounded-xl text-[11px] text-slate-600 flex items-center justify-between gap-2">
                    <span className="truncate">
                      Status: <strong>{matchedOrder.shippingStatus}</strong> {isPending ? '(Contact support to modify)' : '(Online modification locked)'}
                    </span>
                    {supportWhatsApp && (
                      <a
                        href={formatWhatsAppLink(
                          supportWhatsApp,
                          `Hi ${settings.siteName || 'Rongdhonu Trade'}! Inquiry regarding order #${matchedOrder.orderNumber}`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-emerald-600 hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        <MessageCircle className="w-3 h-3" />
                        Help
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 sm:p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
        {supportWhatsApp ? (
          <a
            href={formatWhatsAppLink(
              supportWhatsApp,
              `Hello ${settings.siteName || 'Rongdhonu Trade'}! I need assistance tracking my order.`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 hover:text-emerald-800 font-semibold text-[11px] flex items-center gap-1"
          >
            <Phone className="w-3 h-3 text-emerald-600" />
            <span>Support: {supportWhatsApp}</span>
          </a>
        ) : (
          <span className="text-[11px] text-slate-400">
            Direct parcel tracking support
          </span>
        )}

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 font-bold text-[11px] text-slate-700 transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>

      {/* Sub-modal for editing delivery info */}
      {matchedOrder && (
        <EditDeliveryInfoModal
          order={matchedOrder}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={(updated) => {
            setMatchedOrder(updated);
            setActionFeedback('Delivery information updated successfully!');
            setTimeout(() => setActionFeedback(null), 3000);
          }}
        />
      )}
    </div>
  );
};
