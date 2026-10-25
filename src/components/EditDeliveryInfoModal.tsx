import React, { useState, useEffect } from 'react';
import { X, MapPin, Check, AlertTriangle, Calculator } from 'lucide-react';
import { Order } from '../types';
import { useStore } from '../context/StoreContext';

interface EditDeliveryInfoModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedOrder: Order) => void;
}

export const EditDeliveryInfoModal: React.FC<EditDeliveryInfoModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { settings, updateCustomerDeliveryInfo } = useStore();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [deliveryZone, setDeliveryZone] = useState<'inside_dhaka' | 'outside_dhaka'>('inside_dhaka');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      setFullName(order.customer.fullName || '');
      setPhone(order.customer.phone || '');
      setFullAddress(order.customer.fullAddress || '');
      setDistrict(order.customer.district || '');
      setDeliveryZone(order.customer.deliveryZone || 'inside_dhaka');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [order]);

  if (!isOpen || !order) return null;

  const isPending = order.shippingStatus === 'Pending';
  const insideFee = settings.insideDhakaFee || 80;
  const outsideFee = settings.outsideDhakaFee || 150;
  const currentFee = deliveryZone === 'inside_dhaka' ? insideFee : outsideFee;
  const calculatedGrandTotal = order.subtotal + currentFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPending) {
      setErrorMsg('Order is already being processed and cannot be edited online. Please contact support.');
      return;
    }

    if (!fullName.trim() || !phone.trim() || !fullAddress.trim() || !district.trim()) {
      setErrorMsg('Please fill in all required delivery fields.');
      return;
    }

    const res = await updateCustomerDeliveryInfo(order.id, {
      fullName: fullName.trim(),
      phone: phone.trim(),
      fullAddress: fullAddress.trim(),
      district: district.trim(),
      deliveryZone,
    });

    if (res.success) {
      setSuccessMsg(res.message || 'Delivery details updated successfully!');
      if (res.updatedOrder && onSuccess) {
        onSuccess(res.updatedOrder);
      }
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1200);
    } else {
      setErrorMsg(res.message || 'Failed to update delivery information.');
    }
  };

  return (
    <div
      id="edit-delivery-info-modal-overlay"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="edit-delivery-info-modal-content"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
      >
        <div className="h-2 w-full rainbow-gradient-bg" />

        <div className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900">
                  Edit Delivery Information
                </h3>
                <p className="text-xs text-slate-500">Order #{order.orderNumber}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isPending && (
            <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Editing Restricted</strong>
                Order is already being processed and cannot be edited online. Please contact support.
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Recipient Full Name *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={!isPending}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contact Phone Number *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!isPending}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Shipping Delivery Zone *
                </label>
                <select
                  value={deliveryZone}
                  onChange={(e) => setDeliveryZone(e.target.value as any)}
                  disabled={!isPending}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="inside_dhaka">Inside Dhaka (৳{insideFee})</option>
                  <option value="outside_dhaka">Outside Dhaka (৳{outsideFee})</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  District / City *
                </label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  disabled={!isPending}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Full Street / Area Address *
              </label>
              <textarea
                rows={2}
                value={fullAddress}
                onChange={(e) => setFullAddress(e.target.value)}
                disabled={!isPending}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            {/* Dynamic Recalculation Summary Box */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                <Calculator className="w-3.5 h-3.5 text-rose-500" />
                <span>Dynamic Total Recalculation:</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Items Subtotal:</span>
                <span className="font-mono">৳ {order.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>
                  Delivery Fee ({deliveryZone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}):
                </span>
                <span className="font-mono font-bold text-slate-800">৳ {currentFee}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
                <span>Updated Grand Total:</span>
                <span className="font-display text-rose-600 font-bold">
                  ৳ {calculatedGrandTotal.toLocaleString()} BDT
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              {isPending && (
                <button
                  type="submit"
                  id="save-delivery-info-btn"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Save & Update Order
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
