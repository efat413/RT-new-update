import React, { useState } from 'react';
import {
  TicketPercent,
  Plus,
  Edit2,
  Trash2,
  Copy,
  CheckCircle2,
  Percent,
  DollarSign,
  Truck,
  Power,
  Search,
  Filter,
  Share2,
  AlertCircle,
  X,
  Megaphone,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Coupon } from '../types';
import { ConfirmModal } from './ConfirmModal';

export const AdminVouchersTab: React.FC = () => {
  const { coupons, addCoupon, updateCoupon, deleteCoupon, toggleCouponActive, showNotification } = useStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'inactive' | 'percentage' | 'fixed'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCouponCode, setEditingCouponCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedCaptionCode, setCopiedCaptionCode] = useState<string | null>(null);

  // Form states
  const [formCode, setFormCode] = useState('');
  const [formDiscountType, setFormDiscountType] = useState<'percentage' | 'fixed' | 'free_shipping'>('percentage');
  const [formDiscountValue, setFormDiscountValue] = useState<number>(10);
  const [formMinSpend, setFormMinSpend] = useState<string>('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const openCreateModal = () => {
    setEditingCouponCode(null);
    setFormCode('');
    setFormDiscountType('percentage');
    setFormDiscountValue(10);
    setFormMinSpend('');
    setFormDescription('');
    setFormIsActive(true);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: Coupon) => {
    setEditingCouponCode(c.code);
    setFormCode(c.code);
    setFormDiscountType(c.discountType);
    setFormDiscountValue(c.discountValue);
    setFormMinSpend(c.minSpend ? c.minSpend.toString() : '');
    setFormDescription(c.description || '');
    setFormIsActive(c.isActive);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanCode = formCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode) {
      setFormError('Please enter a valid voucher code (letters, numbers, underscores).');
      return;
    }

    const val = Number(formDiscountValue);
    if (formDiscountType === 'percentage' && (isNaN(val) || val <= 0 || val > 100)) {
      setFormError('Percentage discount must be between 1% and 100%.');
      return;
    }
    if (formDiscountType === 'fixed' && (isNaN(val) || val <= 0)) {
      setFormError('Fixed discount amount must be greater than ৳ 0.');
      return;
    }

    const minSpendNum = formMinSpend.trim() ? Number(formMinSpend) : undefined;
    if (minSpendNum !== undefined && (isNaN(minSpendNum) || minSpendNum < 0)) {
      setFormError('Minimum order amount must be a positive number.');
      return;
    }

    const couponData: Coupon = {
      code: cleanCode,
      discountType: formDiscountType,
      discountValue: formDiscountType === 'free_shipping' ? 150 : val,
      minSpend: minSpendNum,
      description: formDescription.trim() || `${formDiscountType === 'percentage' ? `${val}% Off` : formDiscountType === 'fixed' ? `৳${val} Off` : 'Free Shipping'} on orders`,
      isActive: formIsActive,
    };

    if (editingCouponCode) {
      const res = updateCoupon(editingCouponCode, couponData);
      if (!res.success) {
        setFormError(res.message);
        return;
      }
    } else {
      const res = addCoupon(couponData);
      if (!res.success) {
        setFormError(res.message);
        return;
      }
    }

    setIsModalOpen(false);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    showNotification('success', 'Code Copied', `Voucher code "${code}" copied to clipboard.`);
  };

  const handleCopySocialCaption = (c: Coupon) => {
    const discountText =
      c.discountType === 'percentage'
        ? `${c.discountValue}% OFF`
        : c.discountType === 'fixed'
        ? `৳${c.discountValue} FLAT DISCOUNT`
        : 'FREE NATIONWIDE DELIVERY';

    const minSpendText = c.minSpend ? ` (Minimum order ৳${c.minSpend.toLocaleString()})` : '';

    const caption = `🔥 Special Promo from Rongdhonu Trade! 🔥\nGet ${discountText}${minSpendText} on your next order.\nUse secret promo code: *${c.code}* at checkout.\n\n🛒 Order now: ${window.location.origin}\nCash on Delivery & Direct DBBL / NexusPay available!`;

    navigator.clipboard.writeText(caption);
    setCopiedCaptionCode(c.code);
    setTimeout(() => setCopiedCaptionCode(null), 2500);
    showNotification('success', 'Caption Copied', `Social announcement post copied for "${c.code}"!`);
  };

  const filteredCoupons = coupons.filter((c) => {
    const matchesSearch =
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.description.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (filterType === 'active') return c.isActive;
    if (filterType === 'inactive') return !c.isActive;
    if (filterType === 'percentage') return c.discountType === 'percentage';
    if (filterType === 'fixed') return c.discountType === 'fixed' || c.discountType === 'free_shipping';
    return true;
  });

  const totalCoupons = coupons.length;
  const activeCoupons = coupons.filter((c) => c.isActive).length;
  const percentageCoupons = coupons.filter((c) => c.discountType === 'percentage').length;
  const fixedCoupons = coupons.filter((c) => c.discountType === 'fixed' || c.discountType === 'free_shipping').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Create Action */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <TicketPercent className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-bold text-xl text-slate-800">
                Promo Vouchers & Discount Percentages
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage secret voucher codes and discounts. Codes are hidden from the storefront until you announce them on social media.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          id="btn-create-new-voucher"
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Voucher</span>
        </button>
      </div>

      {/* Social Announcement Guidance Banner */}
      <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-3 text-xs text-amber-900">
        <Megaphone className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-amber-950">
            Hidden from Storefront Customers by Default
          </p>
          <p className="text-amber-800 leading-relaxed">
            Customers cannot see any voucher list or preview in the checkout drawer. You control when and where to share these codes (e.g., Facebook posts, Instagram stories, TikTok ads). When a customer types the exact code, your configured discount percentage or fixed amount applies instantly.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Vouchers</span>
            <TicketPercent className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2 font-mono">{totalCoupons}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Active Codes</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2 font-mono">{activeCoupons}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">% Percentage Deals</span>
            <Percent className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-purple-600 mt-2 font-mono">{percentageCoupons}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Fixed / Free Ship</span>
            <DollarSign className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-2 font-mono">{fixedCoupons}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by code or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            Filter:
          </span>
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            All ({totalCoupons})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterType === 'active'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
            }`}
          >
            Active ({activeCoupons})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('inactive')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterType === 'inactive'
                ? 'bg-slate-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Disabled ({totalCoupons - activeCoupons})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('percentage')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterType === 'percentage'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-800'
            }`}
          >
            Percentages ({percentageCoupons})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('fixed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterType === 'fixed'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-800'
            }`}
          >
            Fixed Deals ({fixedCoupons})
          </button>
        </div>
      </div>

      {/* Vouchers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCoupons.length === 0 ? (
          <div className="col-span-full p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
            <TicketPercent className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">No vouchers found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchTerm
                ? 'Try a different search query or reset the filter.'
                : 'Create your first promotional voucher with a custom discount percentage or fixed value.'}
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all"
            >
              + Create Voucher
            </button>
          </div>
        ) : (
          filteredCoupons.map((c) => (
            <div
              key={c.code}
              className={`p-5 bg-white rounded-2xl border transition-all space-y-4 relative ${
                c.isActive ? 'border-slate-200 shadow-xs hover:shadow-md' : 'border-slate-200/60 bg-slate-50/50 opacity-75'
              }`}
            >
              {/* Top Row: Code and Status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-extrabold uppercase px-3 py-1 rounded-lg bg-slate-900 text-white tracking-wider border border-slate-800">
                    {c.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(c.code)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    title="Copy voucher code"
                  >
                    {copiedCode === c.code ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCouponActive(c.code)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer ${
                      c.isActive
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                        : 'bg-slate-200 text-slate-600 border border-slate-300 hover:bg-slate-300'
                    }`}
                    title={c.isActive ? 'Click to disable voucher' : 'Click to activate voucher'}
                  >
                    <Power className="w-3 h-3" />
                    {c.isActive ? 'Active' : 'Disabled'}
                  </button>
                </div>
              </div>

              {/* Discount Details & Badge */}
              <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                {c.discountType === 'percentage' && (
                  <div className="px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 flex items-center gap-2">
                    <Percent className="w-4 h-4 text-purple-600" />
                    <div>
                      <span className="font-mono text-sm font-bold">{c.discountValue}% OFF</span>
                      <span className="text-[10px] text-purple-600 block">Percentage Discount</span>
                    </div>
                  </div>
                )}

                {c.discountType === 'fixed' && (
                  <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    <div>
                      <span className="font-mono text-sm font-bold">৳ {c.discountValue} OFF</span>
                      <span className="text-[10px] text-blue-600 block">Fixed Deduct</span>
                    </div>
                  </div>
                )}

                {c.discountType === 'free_shipping' && (
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="font-mono text-sm font-bold">Free Delivery</span>
                      <span className="text-[10px] text-emerald-600 block">Shipping Waived</span>
                    </div>
                  </div>
                )}

                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-700 block">
                    {c.minSpend ? `Min. Spend: ৳ ${c.minSpend.toLocaleString()}` : 'No Minimum Spend'}
                  </span>
                  <span className="text-[11px] text-slate-400">Bangladesh Taka</span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                {c.description || 'No description provided.'}
              </p>

              {/* Card Actions Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopySocialCaption(c)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copy pre-formatted social media announcement post"
                >
                  <Share2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>{copiedCaptionCode === c.code ? 'Caption Copied!' : 'Copy Social Post'}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditModal(c)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-700 text-slate-600 transition-colors cursor-pointer"
                    title="Edit voucher parameters"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: 'Delete Voucher Code?',
                        message: `Are you sure you want to permanently delete promotional voucher "${c.code}"? Customers will no longer be able to apply this discount.`,
                        confirmText: 'Delete Voucher',
                        variant: 'danger',
                        onConfirm: () => {
                          deleteCoupon(c.code);
                        },
                      });
                    }}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-600 transition-colors cursor-pointer"
                    title="Delete voucher"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="h-2 w-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500" />

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <TicketPercent className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-800">
                      {editingCouponCode ? `Edit Voucher: ${editingCouponCode}` : 'Create New Voucher'}
                    </h3>
                    <p className="text-xs text-slate-500">Configure discount percentage and minimum order spend</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSaveCoupon} className="space-y-4">
                {/* Voucher Code */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Voucher Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    disabled={!!editingCouponCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. FLASH20, SUMMER15, EIDSPECIAL"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
                  />
                  <p className="text-[11px] text-slate-400">
                    Customers must enter this exact code during checkout to redeem the offer.
                  </p>
                </div>

                {/* Discount Type */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Discount Type <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormDiscountType('percentage')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        formDiscountType === 'percentage'
                          ? 'border-purple-600 bg-purple-50/70 ring-2 ring-purple-500 font-bold text-purple-800'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <Percent className="w-4 h-4 mx-auto mb-1 text-purple-600" />
                      <span className="text-xs block">Percentage (%)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormDiscountType('fixed')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        formDiscountType === 'fixed'
                          ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500 font-bold text-blue-800'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <DollarSign className="w-4 h-4 mx-auto mb-1 text-blue-600" />
                      <span className="text-xs block">Fixed (৳ BDT)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormDiscountType('free_shipping')}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        formDiscountType === 'free_shipping'
                          ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500 font-bold text-emerald-800'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <Truck className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
                      <span className="text-xs block">Free Shipping</span>
                    </button>
                  </div>
                </div>

                {/* Discount Value */}
                {formDiscountType !== 'free_shipping' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {formDiscountType === 'percentage' ? 'Discount Percentage (%)' : 'Discount Amount (৳ BDT)'}{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max={formDiscountType === 'percentage' ? 100 : 50000}
                        required
                        value={formDiscountValue}
                        onChange={(e) => setFormDiscountValue(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 pr-10"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        {formDiscountType === 'percentage' ? '%' : '৳'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Minimum Order Spend */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Minimum Order Amount (৳ BDT) <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Leave empty for no minimum purchase limit"
                    value={formMinSpend}
                    onChange={(e) => setFormMinSpend(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Order subtotal must meet or exceed this amount to apply the discount.
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Campaign Note / Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 15% discount for Facebook Eid followers"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Active Switch */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Voucher Status</span>
                    <span className="text-[11px] text-slate-500">Enable or temporarily disable this promo code</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-md active:scale-95"
                  >
                    {editingCouponCode ? 'Save Changes' : 'Create Voucher'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Unified Confirm Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        variant={confirmDialog.variant}
      />
    </div>
  );
};
