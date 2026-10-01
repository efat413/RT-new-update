import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Package,
  LogOut,
  Mail,
  Phone,
  Calendar,
  ExternalLink,
  Truck,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ShoppingCart,
  Plus,
  ArrowRight,
  ShoppingBag,
  Edit2,
  Trash2,
  LayoutDashboard,
  Save,
  MapPin,
  Check,
  FileText,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { getResponsiveImageUrl } from '../utils/responsiveImage';
import { Product, Order, DeliveryZone } from '../types';
import { authApi } from '../services/authApi';
import { EditDeliveryInfoModal } from './EditDeliveryInfoModal';
import { ConfirmModal } from './ConfirmModal';
import { InvoiceModal } from './InvoiceModal';
import { parseColorOption } from '../utils/productVariants';

interface UserAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserAccountModal: React.FC<UserAccountModalProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    orders,
    logout,
    setCurrentView,
    addToCart,
    cart,
    cartCount,
    cartSubtotal,
    setIsCartOpen,
    cancelCustomerOrder,
    userAccountModalTab,
    setUserAccountModalTab,
    updateCurrentUserProfile,
    settings,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'orders' | 'profile'>('orders');
  const [addedItemNotice, setAddedItemNotice] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState<Order | null>(null);
  const [viewingInvoiceOrder, setViewingInvoiceOrder] = useState<Order | null>(null);
  const [orderActionNotice, setOrderActionNotice] = useState<string | null>(null);

  // Edit profile form state
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileDistrict, setProfileDistrict] = useState('Dhaka');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileZone, setProfileZone] = useState<DeliveryZone>('inside_dhaka');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeMessage, setPasswordChangeMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Prevent background scrolling while modal is open and ensure top alignment
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset scroll of modal overlay if previously scrolled
      const el = document.getElementById('user-account-modal-overlay');
      if (el) el.scrollTop = 0;
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Sync activeTab with userAccountModalTab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(userAccountModalTab || 'orders');
    }
  }, [isOpen, userAccountModalTab]);

  // Sync profile form state with currentUser
  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name || '');
      setProfilePhone(currentUser.phone || '');
      setProfileEmail(currentUser.email || '');
      setProfileDistrict(currentUser.district || 'Dhaka');
      setProfileAddress(currentUser.address || '');
      setProfileZone(currentUser.deliveryZone || 'inside_dhaka');
    }
  }, [currentUser, isOpen]);

  if (!isOpen || !currentUser) return null;

  // Filter orders placed by this user
  const userOrders = orders.filter((o) => {
    if (o.userId && o.userId === currentUser.id) return true;
    if (o.userEmail && currentUser.email && o.userEmail.toLowerCase() === currentUser.email.toLowerCase()) return true;
    if (o.customer?.email && currentUser.email && o.customer.email.toLowerCase() === currentUser.email.toLowerCase()) return true;
    if (o.customer?.phone && currentUser.phone && o.customer.phone.replace(/[^0-9]/g, '') === currentUser.phone.replace(/[^0-9]/g, '')) return true;
    if (o.customer?.fullName && currentUser.name && o.customer.fullName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) return true;
    return false;
  });

  const handleLogout = () => {
    logout();
    onClose();
  };

  const handleReorderItem = (product: Product, quantity: number) => {
    addToCart(product, quantity);
    setAddedItemNotice(`Added "${product.title}" (${quantity}x) to your cart!`);
    setTimeout(() => setAddedItemNotice(null), 3000);
  };

  const handleReorderAllItems = (items: { product: Product; quantity: number }[]) => {
    items.forEach((item) => {
      addToCart(item.product, item.quantity);
    });
    setAddedItemNotice(`Added all ${items.length} items to your cart!`);
    setTimeout(() => {
      setAddedItemNotice(null);
      onClose();
      setIsCartOpen(true);
    }, 600);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) return;

    setIsSavingProfile(true);
    const res = updateCurrentUserProfile({
      name: profileName.trim(),
      phone: profilePhone.trim(),
      district: profileDistrict.trim(),
      address: profileAddress.trim(),
      deliveryZone: profileZone,
    });

    setIsSavingProfile(false);
    if (res.success) {
      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 4000);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeMessage(null);

    const trimmedCurrent = currentPassword.trim();
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmNewPassword.trim();

    if (!trimmedCurrent) {
      setPasswordChangeMessage({ text: 'Please enter your current password.', isError: true });
      return;
    }

    if (!trimmedNew || trimmedNew.length < 6) {
      setPasswordChangeMessage({ text: 'New password must be at least 6 characters long.', isError: true });
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setPasswordChangeMessage({ text: 'New passwords do not match. Please verify.', isError: true });
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await authApi.changePassword(trimmedNew, trimmedCurrent);
      if (res.success) {
        setPasswordChangeMessage({ text: 'Your password was changed successfully!', isError: false });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        setPasswordChangeMessage({ text: res.message || 'Failed to change password. Please check your current password.', isError: true });
      }
    } catch (err: any) {
      setPasswordChangeMessage({ text: err?.message || 'Error communicating with server.', isError: true });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const isPrivilegedAdmin =
    currentUser.role === 'super_admin' ||
    currentUser.role === 'admin' ||
    currentUser.role === 'sub_admin';

  return createPortal(
    <div
      id="user-account-modal-overlay"
      onClick={onClose}
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[999999] overflow-y-auto bg-slate-950/80 backdrop-blur-xs px-2 sm:px-4 md:px-6 py-2 sm:py-3 animate-fadeIn flex items-start justify-center"
    >
      {/* Container anchored directly to the very top */}
      <div
        id="user-account-modal-content"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl md:max-w-2xl lg:max-w-3xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] my-1 sm:my-2 animate-scaleUp"
      >
          {/* Top Rainbow Accent */}
          <div className="h-1.5 w-full rainbow-gradient-bg shrink-0" />

          {/* Modal Header - Pinned at top */}
          <div className="p-3.5 sm:p-4.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white sticky top-0 z-20">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                onClick={() => {
                  onClose();
                  const isAlreadyHome =
                    !window.location.search && (window.location.pathname === '/' || window.location.pathname === '');
                  if (isAlreadyHome) {
                    window.location.reload();
                  } else {
                    window.location.href = '/';
                  }
                }}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white font-bold flex items-center justify-center text-sm sm:text-base shadow-sm shrink-0 cursor-pointer hover:ring-2 hover:ring-rose-500 hover:scale-105 active:scale-95 transition-all select-none"
                title="Click to visit or reload homepage"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onClose();
                    window.location.href = '/';
                  }
                }}
              >
                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {currentUser.name}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider shrink-0 ${
                      isPrivilegedAdmin
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {currentUser.role === 'super_admin'
                      ? 'Super Admin'
                      : currentUser.role === 'admin'
                      ? 'Store Admin'
                      : currentUser.role === 'sub_admin'
                      ? 'Sub-Admin Staff'
                      : 'Customer Account'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 truncate">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{currentUser.email}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0 ml-2 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Navigation: My Orders vs Edit Profile */}
          <div className="px-4 sm:px-6 pt-2.5 pb-0 border-b border-slate-200 flex items-center gap-2 bg-slate-50/80 shrink-0">
            <button
              type="button"
              id="user-modal-tab-orders"
              onClick={() => {
                setActiveTab('orders');
                setUserAccountModalTab('orders');
              }}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'orders'
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>My Orders</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  activeTab === 'orders'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {userOrders.length}
              </span>
            </button>

            <button
              type="button"
              id="user-modal-tab-profile"
              onClick={() => {
                setActiveTab('profile');
                setUserAccountModalTab('profile');
              }}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'profile'
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Profile Info</span>
            </button>
          </div>

          {/* Feedback Alerts */}
          {addedItemNotice && (
            <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between animate-fadeIn shrink-0">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {addedItemNotice}
              </span>
              <button
                onClick={() => {
                  onClose();
                  setIsCartOpen(true);
                }}
                className="text-emerald-900 hover:underline font-bold text-[11px] flex items-center gap-1 ml-2 shrink-0 cursor-pointer"
              >
                Open Cart <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {orderActionNotice && (
            <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-200 text-blue-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn shrink-0">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{orderActionNotice}</span>
            </div>
          )}

          {profileSaveSuccess && (
            <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Profile details updated successfully!</span>
            </div>
          )}

          {/* Content Body - Scrollable */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1 min-h-0 text-slate-800">
            {activeTab === 'profile' ? (
              /* TAB 2: EDIT PROFILE FORM */
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <User className="w-4 h-4 text-rose-500" />
                      <span>Personal Information</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Member since {new Date(currentUser.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        id="user-profile-name"
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="Your full name"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Phone Number *
                      </label>
                      <input
                        id="user-profile-phone"
                        type="tel"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="e.g. +8801518739561"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Email Address</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        (Login Identity)
                      </span>
                    </label>
                    <input
                      id="user-profile-email"
                      type="email"
                      value={profileEmail}
                      disabled
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-500 cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Delivery & Address Information */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-rose-500" />
                    <span>Default Delivery Address</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        District / City
                      </label>
                      <input
                        id="user-profile-district"
                        type="text"
                        value={profileDistrict}
                        onChange={(e) => {
                          const val = e.target.value;
                          setProfileDistrict(val);
                          if (val.toLowerCase().includes('dhaka')) {
                            setProfileZone('inside_dhaka');
                          } else {
                            setProfileZone('outside_dhaka');
                          }
                        }}
                        placeholder="e.g. Dhaka, Chattogram, Sylhet"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Delivery Region
                      </label>
                      <select
                        id="user-profile-zone"
                        value={profileZone}
                        onChange={(e) => setProfileZone(e.target.value as DeliveryZone)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="inside_dhaka">
                          Inside Dhaka (৳{settings.insideDhakaFee || 80})
                        </option>
                        <option value="outside_dhaka">
                          Outside Dhaka (৳{settings.outsideDhakaFee || 150})
                        </option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Street Address & Delivery Details
                    </label>
                    <textarea
                      id="user-profile-address"
                      rows={2}
                      value={profileAddress}
                      onChange={(e) => setProfileAddress(e.target.value)}
                      placeholder="e.g. House #12, Road #4, Sector #3, Uttara, Dhaka"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="submit"
                    id="save-profile-btn"
                    disabled={isSavingProfile}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingProfile ? 'Saving...' : 'Save Profile Changes'}</span>
                  </button>
                </div>

                {/* Security & Password Change */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3.5 mt-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-rose-500" />
                    <span>Security & Password</span>
                  </span>

                  {passwordChangeMessage && (
                    <div
                      className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                        passwordChangeMessage.isError
                          ? 'bg-rose-50 border border-rose-200 text-rose-700'
                          : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      }`}
                    >
                      {passwordChangeMessage.isError ? (
                        <X className="w-4 h-4 text-rose-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span>{passwordChangeMessage.text}</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Current Password *
                      </label>
                      <div className="relative">
                        <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          id="user-current-password"
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-9 pr-9 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          New Password *
                        </label>
                        <div className="relative">
                          <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            id="user-new-password"
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="At least 6 characters"
                            className="w-full pl-9 pr-9 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Confirm New Password *
                        </label>
                        <div className="relative">
                          <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            id="user-confirm-new-password"
                            type={showNewPassword ? 'text' : 'password'}
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handlePasswordChange}
                        disabled={isChangingPassword}
                        className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{isChangingPassword ? 'Updating Password...' : 'Update Password'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            ) : (
              /* TAB 1: MY ORDERS & REORDERING */
              <>
                {/* Quick info badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">
                      Phone Number
                    </span>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-bold text-slate-800 text-xs sm:text-sm">
                        {currentUser.phone || '+8801518739561'}
                      </span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">
                      Account Created
                    </span>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-bold text-slate-800 text-xs sm:text-sm">
                        {new Date(currentUser.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Current Cart Status in Dashboard */}
                {cart.length > 0 && (
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                        <ShoppingCart className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Active Cart ({cartCount} {cartCount === 1 ? 'item' : 'items'})
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Subtotal: <strong className="text-slate-800">৳ {cartSubtotal.toLocaleString()} BDT</strong>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setIsCartOpen(true);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                    >
                      <span>Checkout</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Admin shortcuts if admin */}
                {isPrivilegedAdmin && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-purple-50 via-purple-50/80 to-indigo-50 border border-purple-200 shadow-2xs">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                          <ShieldCheck className="w-5 h-5 text-purple-100" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-extrabold text-purple-950 leading-tight">
                              Administrative Dashboard Access
                            </h4>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 border border-purple-300 shadow-2xs shrink-0">
                              {currentUser.role === 'super_admin'
                                ? 'Super Admin'
                                : currentUser.role === 'admin'
                                ? 'Store Admin'
                                : 'Sub-Admin'}
                            </span>
                          </div>
                          <p className="text-[11px] sm:text-xs text-purple-800 font-medium mt-1 leading-relaxed">
                            You have administrative privileges to manage orders, products, categories, courier APIs, and store settings.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        id="user-modal-go-to-admin-btn"
                        onClick={() => {
                          onClose();
                          setCurrentView('admin');
                        }}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shrink-0 whitespace-nowrap transition-all cursor-pointer"
                      >
                        <LayoutDashboard className="w-3.5 h-3.5" />
                        <span>Go to Admin Panel</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* User Orders List */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-slate-500" />
                      <span>Order History ({userOrders.length})</span>
                    </h3>
                  </div>

                  {userOrders.length === 0 ? (
                    <div className="p-6 sm:p-8 rounded-2xl border border-dashed border-slate-200 text-center space-y-2.5 bg-slate-50/50">
                      <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-xs font-medium text-slate-600">
                        No orders placed yet under this account.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          setCurrentView('store');
                        }}
                        className="mt-1 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-black transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                      >
                        <span>Start Shopping</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {userOrders.map((ord) => (
                        <div
                          key={ord.id}
                          className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-2xs space-y-3"
                        >
                          {/* Order header */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-slate-900">
                                  {ord.orderNumber}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    ord.shippingStatus === 'Delivered'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : ord.shippingStatus === 'Shipped'
                                      ? 'bg-blue-100 text-blue-700'
                                      : ord.shippingStatus === 'Cancelled'
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {ord.shippingStatus}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {new Date(ord.createdAt).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <div className="text-right">
                              <div className="text-xs font-bold text-slate-900">
                                ৳ {ord.totalAmount.toLocaleString()} BDT
                              </div>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                  ord.paymentStatus === 'Paid'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {ord.paymentMethod === 'cod'
                                  ? 'Cash on Delivery'
                                  : ord.paymentMethod === 'dbbl'
                                  ? 'DBBL Bank'
                                  : ord.paymentMethod === 'card'
                                  ? 'Card'
                                  : 'Online'}{' '}
                                • {ord.paymentStatus}
                              </span>
                            </div>
                          </div>

                          {/* Items in order */}
                          <div className="space-y-2">
                            {ord.items.map((it, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-xs py-1"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                                    <img
                                      src={getResponsiveImageUrl(it.product.imageUrl, 240)}
                                      alt={it.product.title}
                                      width={36}
                                      height={36}
                                      loading="lazy"
                                      decoding="async"
                                      className="w-full h-full object-cover"
                                      style={{ aspectRatio: '1 / 1' }}
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src =
                                          'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80';
                                      }}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-slate-800 truncate">
                                      {it.product.title}
                                    </div>
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                                      <span>Qty: {it.quantity}</span>
                                      <span>•</span>
                                      <span>৳ {it.product.price.toLocaleString()}</span>
                                      {it.selectedSize && (
                                        <span className="bg-slate-100 px-1 py-0.2 rounded text-[10px] text-slate-700 font-medium">
                                          Size: {it.selectedSize}
                                        </span>
                                      )}
                                      {it.selectedColor && (() => {
                                        const parsed = parseColorOption(it.selectedColor);
                                        return (
                                          <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-700 font-medium flex items-center gap-1">
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
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleReorderItem(it.product, it.quantity)}
                                  className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] flex items-center gap-1 transition-colors shrink-0 ml-2 cursor-pointer"
                                  title="Add this product back to cart"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Reorder</span>
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Order actions & delivery info */}
                          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="text-[11px] text-slate-500">
                              <span>Shipping to: </span>
                              <strong className="text-slate-700">
                                {ord.customer.fullName}
                              </strong>
                              , {ord.customer.fullAddress} ({ord.customer.district})
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              {ord.shippingStatus === 'Pending' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setEditingOrder(ord)}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <Edit2 className="w-3 h-3 text-slate-500" />
                                    <span>Edit Address</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCancelingOrder(ord)}
                                    className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-500" />
                                    <span>Cancel</span>
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => setViewingInvoiceOrder(ord)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                                title="View and download order invoice"
                              >
                                <FileText className="w-3 h-3 text-rose-600" />
                                <span>Invoice</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleReorderAllItems(ord.items)}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-black text-white font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                <span>Reorder All</span>
                              </button>
                            </div>
                          </div>

                          {/* Courier tracking link */}
                          {ord.courierBooking?.waybillId && (
                            <div className="pt-1.5 flex items-center gap-1.5 text-slate-500 text-[11px]">
                              <Truck className="w-3.5 h-3.5 text-blue-500" />
                              <span>{ord.courierBooking.provider} Tracking: </span>
                              <a
                                href={ord.courierBooking.trackingUrl || `https://steadfast.com.bd/t/${ord.courierBooking.waybillId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-rose-600 hover:underline font-mono font-bold inline-flex items-center gap-0.5"
                              >
                                {ord.courierBooking.waybillId}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-xs transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 font-bold text-xs text-slate-800 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      {/* Edit Delivery Info Modal for Customer Order History */}
      {editingOrder && (
        <EditDeliveryInfoModal
          order={editingOrder}
          isOpen={!!editingOrder}
          onClose={() => setEditingOrder(null)}
          onSuccess={() => {
            setOrderActionNotice('Order delivery details updated successfully!');
            setTimeout(() => setOrderActionNotice(null), 3000);
          }}
        />
      )}

      {/* Unified In-App Order Cancellation Confirmation Modal */}
      <ConfirmModal
        isOpen={!!cancelingOrder}
        onClose={() => setCancelingOrder(null)}
        title={`Cancel Order #${cancelingOrder?.orderNumber}?`}
        message={`Are you sure you want to cancel Order #${cancelingOrder?.orderNumber}?\n\nThis will remove the order and automatically restore all items back into store inventory.`}
        confirmText="Yes, Cancel Order"
        cancelText="Keep Order"
        variant="danger"
        onConfirm={async () => {
          if (cancelingOrder) {
            const res = await cancelCustomerOrder(cancelingOrder.id);
            if (res.success) {
              setOrderActionNotice(res.message || `Order #${cancelingOrder.orderNumber} canceled successfully.`);
            } else {
              setOrderActionNotice(res.message || 'Failed to cancel order.');
            }
            setTimeout(() => setOrderActionNotice(null), 3500);
            setCancelingOrder(null);
          }
        }}
      />
      {/* Official Customer Invoice Modal */}
      <InvoiceModal
        order={viewingInvoiceOrder}
        isOpen={Boolean(viewingInvoiceOrder)}
        onClose={() => setViewingInvoiceOrder(null)}
      />
    </div>,
    document.body
  );
};
