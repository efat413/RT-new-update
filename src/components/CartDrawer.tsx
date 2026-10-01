import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ShieldCheck,
  Banknote,
  Check,
  RefreshCw,
  Copy,
  Building2,
  Upload,
  AlertCircle,
  TicketPercent,
  Tag,
  CheckCircle2,
  MapPin,
  Phone,
  User,
  Home,
  FileText,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { DeliveryZone, PaymentMethod, Coupon } from '../types';
import { SearchableDistrictSelect } from './SearchableDistrictSelect';
import { BANGLADESH_DISTRICT_UPAZILA_MAP, ALL_BANGLADESH_LOCATIONS } from '../data/bangladeshAreas';
import { parseColorOption } from '../utils/productVariants';
import { getResponsiveImageUrl } from '../utils/responsiveImage';

export const BANGLADESH_DISTRICTS = [
  'Dhaka',
  'Chattogram',
  'Gazipur',
  'Narayanganj',
  'Cumilla',
  'Sylhet',
  'Rajshahi',
  'Khulna',
  'Barishal',
  'Bogura',
  'Mymensingh',
  'Cox\'s Bazar',
  'Bagerhat',
  'Bandarban',
  'Barguna',
  'Bhola',
  'Brahmanbaria',
  'Chandpur',
  'Chapainawabganj',
  'Chuadanga',
  'Dinajpur',
  'Faridpur',
  'Feni',
  'Gaibandha',
  'Gopalganj',
  'Habiganj',
  'Jamalpur',
  'Jashore',
  'Jhalokati',
  'Jhenaidah',
  'Joypurhat',
  'Khagrachhari',
  'Kishoreganj',
  'Kurigram',
  'Kushtia',
  'Lakshmipur',
  'Lalmonirhat',
  'Madaripur',
  'Magura',
  'Manikganj',
  'Meherpur',
  'Moulvibazar',
  'Munshiganj',
  'Naogaon',
  'Narail',
  'Narsingdi',
  'Natore',
  'Netrokona',
  'Nilphamari',
  'Noakhali',
  'Pabna',
  'Panchagarh',
  'Patuakhali',
  'Pirojpur',
  'Rajbari',
  'Rangamati',
  'Rangpur',
  'Satkhira',
  'Shariatpur',
  'Sherpur',
  'Sirajganj',
  'Sunamganj',
  'Tangail',
  'Thakurgaon',
];

interface FormErrors {
  fullName?: string;
  phone?: string;
  address?: string;
  area?: string;
  district?: string;
  altPhone?: string;
  general?: string;
}

export const CartDrawer: React.FC = () => {
  const {
    cart,
    cartCount,
    cartSubtotal,
    isCartOpen,
    setIsCartOpen,
    updateCartQuantity,
    removeFromCart,
    createOrder,
    settings,
    setRecentSuccessOrder,
    currentUser,
    applyCoupon,
    trackEvent,
  } = useStore();

  // Customer Delivery Information State
  const [fullName, setFullName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState(currentUser?.district || '');
  const [deliveryZone, setDeliveryZone] = useState<DeliveryZone>('inside_dhaka');
  const [altPhone, setAltPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Payment Selection State
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cod');

  // Submission & Validation State
  const [validationErrors, setValidationErrors] = useState<FormErrors>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  // Promo Code / Coupon State
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [promoFeedback, setPromoFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // DBBL Bank & NexusPay Payment State
  const [senderBank, setSenderBank] = useState('NexusPay App');
  const [senderAccountOrPhone, setSenderAccountOrPhone] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [depositSlipUrl, setDepositSlipUrl] = useState('');
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Synchronize currentUser profile when available
  useEffect(() => {
    if (currentUser) {
      if (!fullName && currentUser.name) setFullName(currentUser.name);
      if (!phone && currentUser.phone) setPhone(currentUser.phone);
      if (currentUser.district && !district) {
        setDistrict(currentUser.district);
        setDeliveryZone(currentUser.district.toLowerCase().includes('dhaka') ? 'inside_dhaka' : 'outside_dhaka');
      }
    }
  }, [currentUser, isCartOpen]);

  // Adjust delivery zone automatically when district changes (user can still manually toggle if desired)
  const handleDistrictChange = (selectedDistrict: string) => {
    setDistrict(selectedDistrict);
    if (selectedDistrict.toLowerCase().includes('dhaka')) {
      setDeliveryZone('inside_dhaka');
    } else if (selectedDistrict.trim()) {
      setDeliveryZone('outside_dhaka');
    }
    if (validationErrors.district) {
      setValidationErrors((prev) => ({ ...prev, district: undefined }));
    }
  };

  // Close modal on Escape key press
  useEffect(() => {
    if (!isCartOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCartOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCartOpen, setIsCartOpen]);

  if (!isCartOpen) return null;

  const deliveryFee =
    deliveryZone === 'inside_dhaka'
      ? Number(settings.insideDhakaFee) || 80
      : Number(settings.outsideDhakaFee) || 150;
  const effectiveDiscount = appliedCoupon?.discountType === 'free_shipping' ? deliveryFee : discountAmount;
  const grandTotal = Math.max(0, cartSubtotal + deliveryFee - effectiveDiscount);

  const handleApplyPromo = (codeToApply?: string) => {
    const code = (codeToApply || promoCodeInput).trim().toUpperCase();
    if (!code) {
      setPromoFeedback({ type: 'error', text: 'Please enter a promo code or voucher.' });
      return;
    }
    const result = applyCoupon(code, cartSubtotal, deliveryFee);
    if (result.success && result.coupon) {
      setAppliedCoupon(result.coupon);
      setDiscountAmount(result.discountAmount);
      setPromoFeedback({ type: 'success', text: result.message || 'Promo applied successfully!' });
      setPromoCodeInput(result.coupon.code);
    } else {
      setPromoFeedback({ type: 'error', text: result.message || 'Invalid or expired promo code.' });
    }
  };

  const handleRemovePromo = () => {
    setAppliedCoupon(null);
    setDiscountAmount(0);
    setPromoFeedback(null);
    setPromoCodeInput('');
  };

  // Active DBBL Bank Settings from Admin Settings or defaults
  const dbblBank = {
    bankName: settings.dbblBank?.bankName || 'Dutch-Bangla Bank PLC',
    accountHolderName: settings.dbblBank?.accountHolderName || settings.siteName || 'Rongdhonu Trade',
    accountNumber: settings.dbblBank?.accountNumber || '',
    branchName: settings.dbblBank?.branchName || '',
    routingNumber: settings.dbblBank?.routingNumber || '',
    qrCodeUrl: settings.dbblBank?.qrCodeUrl || '',
    instructions: settings.dbblBank?.instructions || 'Send money or transfer via Dutch-Bangla Bank / NexusPay app or internet banking. Copy our Account Number, complete transfer, and paste the Transaction ID (TrxID) below.',
  };

  const handleCopyAccountNumber = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(dbblBank.accountNumber);
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2500);
    }
  };

  const handleSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Deposit slip image size must be under 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setDepositSlipUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Phone normalization & validation for Bangladesh
  const normalizeAndValidatePhone = (phoneInput: string): { isValid: boolean; normalized: string; error?: string } => {
    const cleanDigits = phoneInput.replace(/[^0-9]/g, '');
    let normalized = cleanDigits;

    if (normalized.startsWith('8801')) {
      normalized = normalized.slice(2);
    } else if (normalized.startsWith('88')) {
      normalized = normalized.slice(2);
    }

    if (!normalized) {
      return { isValid: false, normalized: '', error: 'Please enter a valid mobile number.' };
    }

    // Bangladesh standard 11 digits: 013, 014, 015, 016, 017, 018, 019
    const bdPhoneRegex = /^01[3-9]\d{8}$/;
    if (!bdPhoneRegex.test(normalized)) {
      return {
        isValid: false,
        normalized,
        error: 'Please enter a valid 11-digit Bangladeshi mobile number (e.g. 01XXXXXXXXX).',
      };
    }

    return { isValid: true, normalized };
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    // 1. Cart validation
    if (cart.length === 0) {
      errors.general = 'Your shopping cart is empty.';
    }

    // 2. Full Name validation
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      errors.fullName = 'Please enter your name.';
    } else if (trimmedName.length < 3) {
      errors.fullName = 'Name must be at least 3 characters.';
    }

    // 3. Phone validation
    const phoneCheck = normalizeAndValidatePhone(phone);
    if (!phoneCheck.isValid) {
      errors.phone = phoneCheck.error || 'Please enter a valid mobile number.';
    }

    // 4. Address validation
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      errors.address = 'Please enter your delivery address.';
    } else if (trimmedAddress.length < 5) {
      errors.address = 'Please enter a detailed street/house address (min 5 characters).';
    }

    // 5. District / City validation
    if (!district.trim()) {
      errors.district = 'Please select your district / city.';
    }

    // 6. Optional Alternative Phone validation
    if (altPhone.trim()) {
      const altCheck = normalizeAndValidatePhone(altPhone);
      if (!altCheck.isValid) {
        errors.altPhone = 'Please enter a valid alternative 11-digit mobile number.';
      }
    }

    // 7. DBBL fields if selected
    if (selectedPayment === 'dbbl') {
      if (!transactionId.trim() || transactionId.trim().length < 4) {
        errors.general = 'Please enter your Bank / NexusPay Transaction ID (TrxID) of at least 4 characters.';
      } else if (!senderAccountOrPhone.trim()) {
        errors.general = 'Please enter your Sender Account Number or Mobile Number for DBBL verification.';
      }
    }

    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstError = errors.fullName || errors.phone || errors.address || errors.district || errors.general;
      setErrorMessage(firstError || 'Please fill in all required customer information.');
      return false;
    }

    setErrorMessage('');
    return true;
  };

  const handlePlaceOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    // Honeypot check for bots
    if (honeypot.trim()) {
      setErrorMessage('Submission rejected: automated activity detected.');
      return;
    }

    const isValid = validateForm();
    if (!isValid) return;

    const phoneCheck = normalizeAndValidatePhone(phone);
    const cleanPhone = phoneCheck.normalized;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const orderPayload = {
        userId: currentUser?.id,
        userEmail: currentUser?.email,
        customer: {
          fullName: fullName.trim(),
          phone: cleanPhone,
          alternativePhone: altPhone.trim() ? normalizeAndValidatePhone(altPhone).normalized : undefined,
          district: district.trim(),
          deliveryZone,
          fullAddress: address.trim(),
          notes: notes.trim() || undefined,
          email: currentUser?.email,
          userId: currentUser?.id,
        },
        items: [...cart],
        subtotal: cartSubtotal,
        deliveryFee,
        totalAmount: grandTotal,
        couponCode: appliedCoupon?.code,
        discountAmount: effectiveDiscount,
        paymentMethod: selectedPayment,
        paymentStatus: selectedPayment === 'dbbl' ? ('UNVERIFIED' as const) : ('DUE' as const),
        transactionId: selectedPayment === 'dbbl' ? transactionId.trim() : undefined,
        dbblDetails:
          selectedPayment === 'dbbl'
            ? {
                senderBank: senderBank.trim() || 'Dutch-Bangla Bank / NexusPay',
                senderAccountOrPhone: senderAccountOrPhone.trim(),
                transactionId: transactionId.trim(),
                depositSlipUrl: depositSlipUrl || undefined,
              }
            : undefined,
      };

      const newOrder = await createOrder(orderPayload);

      // On successful order creation:
      setIsSubmitting(false);
      setIsCartOpen(false);
      setRecentSuccessOrder(newOrder);

      // Reset customer form & promo state
      setFullName('');
      setPhone('');
      setAddress('');
      setDistrict(currentUser?.district || '');
      setAltPhone('');
      setNotes('');
      setValidationErrors({});
      handleRemovePromo();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(
        err?.message || 'Could not place order. Please verify your details and connection and try again.'
      );
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 md:p-6 lg:p-8 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity duration-300"
        onClick={() => setIsCartOpen(false)}
      />

      <div className="relative w-full h-full sm:h-auto sm:max-h-[92vh] max-w-5xl bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-xs">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-800 flex items-center gap-2">
                Shopping Cart & Checkout
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                  {cartCount} {cartCount === 1 ? 'item' : 'items'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Cash on delivery & instant order placement across Bangladesh
              </p>
            </div>
          </div>
          <button
            id="close-cart-drawer-btn"
            onClick={() => setIsCartOpen(false)}
            className="p-2 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            title="Close cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

          {/* Scrollable Drawer Body: Products -> Customer Info -> Payment -> Promo */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
            {/* Honeypot field for bot protection */}
            <input
              type="text"
              name="website_anti_bot"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              style={{ display: 'none', position: 'absolute', opacity: 0 }}
              tabIndex={-1}
              autoComplete="off"
            />

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {cart.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <ShoppingBag className="w-10 h-10" />
                </div>
                <h3 className="font-bold text-slate-700 text-lg">Your Cart is Empty</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Explore our premium Men's Accessories, Modern Gadgets, and Handpicked Gifts.
                </p>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-colors cursor-pointer"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
              {/* Left Column: Order Items + Customer Info + Payment Method */}
              <div className="lg:col-span-7 space-y-6">
                {/* 1. CART PRODUCTS SECTION */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Order Items ({cartCount})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Subtotal: <strong>৳ {cartSubtotal.toLocaleString()}</strong>
                    </span>
                  </div>

                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div
                        key={`${item.product.id}-${item.selectedSize || ''}-${item.selectedColor || ''}`}
                        className="flex gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 relative group"
                      >
                        <img
                          src={getResponsiveImageUrl(item.product.imageUrl, 240)}
                          alt={item.product.title}
                          width={64}
                          height={64}
                          loading="lazy"
                          decoding="async"
                          className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                          style={{ aspectRatio: '1 / 1' }}
                        />
                        <div className="flex-1 min-w-0 pr-6">
                          <h4 className="font-bold text-slate-900 text-xs truncate">
                            {item.product.title}
                          </h4>
                          <p className="text-xs text-rose-600 font-bold font-display mt-0.5">
                            ৳ {item.product.price.toLocaleString()} BDT
                          </p>
                          {(item.selectedSize || item.selectedColor) && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {item.selectedSize && (
                                <span className="text-[10px] font-semibold bg-slate-200/80 text-slate-800 px-1.5 py-0.5 rounded-md">
                                  Size: {item.selectedSize}
                                </span>
                              )}
                              {item.selectedColor && (() => {
                                const parsed = parseColorOption(item.selectedColor);
                                return (
                                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
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
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQuantity(
                                    item.product.id,
                                    item.quantity - 1,
                                    item.selectedSize,
                                    item.selectedColor
                                  )
                                }
                                className="p-1 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="px-2 font-mono text-xs font-bold text-slate-800">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQuantity(
                                    item.product.id,
                                    item.quantity + 1,
                                    item.selectedSize,
                                    item.selectedColor
                                  )
                                }
                                className="p-1 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                                aria-label="Increase quantity"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Total: ৳ {(item.product.price * item.quantity).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            removeFromCart(item.product.id, item.selectedSize, item.selectedColor)
                          }
                          className="absolute top-3 right-3 text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. CUSTOMER INFORMATION SECTION */}
                <div className="space-y-4 pt-2 border-t border-slate-200">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-rose-500" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Customer Information
                    </h3>
                  </div>

                  {/* FULL NAME */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="customer-fullname-input"
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (validationErrors.fullName) {
                          setValidationErrors((prev) => ({ ...prev, fullName: undefined }));
                        }
                      }}
                      placeholder="Enter your full name"
                      className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 ${
                        validationErrors.fullName
                          ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-rose-500'
                      }`}
                    />
                    {validationErrors.fullName && (
                      <p className="text-[11px] text-rose-600 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {validationErrors.fullName}
                      </p>
                    )}
                  </div>

                  {/* PHONE NUMBER */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Phone Number <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="customer-phone-input"
                        type="tel"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          if (validationErrors.phone) {
                            setValidationErrors((prev) => ({ ...prev, phone: undefined }));
                          }
                        }}
                        placeholder="01XXXXXXXXX"
                        maxLength={15}
                        className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 ${
                          validationErrors.phone
                            ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
                            : 'border-slate-300 focus:ring-rose-500'
                        }`}
                      />
                    </div>
                    {validationErrors.phone && (
                      <p className="text-[11px] text-rose-600 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {validationErrors.phone}
                      </p>
                    )}
                  </div>

                  {/* DISTRICT & DELIVERY ZONE */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        District / City <span className="text-rose-500">*</span>
                      </label>
                      <SearchableDistrictSelect
                        id="customer-district-select"
                        value={district}
                        onChange={(val) => handleDistrictChange(val)}
                        hasError={!!validationErrors.district}
                        placeholder="Select City"
                      />
                      {validationErrors.district && (
                        <p className="text-[11px] text-rose-600 font-medium mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          {validationErrors.district}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Delivery Zone
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDeliveryZone('inside_dhaka')}
                          className={`py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                            deliveryZone === 'inside_dhaka'
                              ? 'border-rose-500 bg-rose-50/80 text-rose-700 font-bold ring-1 ring-rose-500'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 text-[11px]'
                          }`}
                        >
                          <span className="block text-[11px] leading-tight font-semibold">Inside Dhaka</span>
                          <span className="text-[10px] text-slate-500">৳{settings.insideDhakaFee || 80}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeliveryZone('outside_dhaka')}
                          className={`py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                            deliveryZone === 'outside_dhaka'
                              ? 'border-rose-500 bg-rose-50/80 text-rose-700 font-bold ring-1 ring-rose-500'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 text-[11px]'
                          }`}
                        >
                          <span className="block text-[11px] leading-tight font-semibold">Outside Dhaka</span>
                          <span className="text-[10px] text-slate-500">৳{settings.outsideDhakaFee || 150}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ADDRESS */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Address <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      id="customer-address-input"
                      rows={2}
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value);
                        if (validationErrors.address) {
                          setValidationErrors((prev) => ({ ...prev, address: undefined }));
                        }
                      }}
                      placeholder="House/Road/Area"
                      className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 ${
                        validationErrors.address
                          ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
                          : 'border-slate-300 focus:ring-rose-500'
                      }`}
                    />
                    {validationErrors.address && (
                      <p className="text-[11px] text-rose-600 font-medium mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {validationErrors.address}
                      </p>
                    )}
                  </div>

                  {/* OPTIONAL FIELD: ALTERNATIVE PHONE */}
                  <div className="pt-1">
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Alternative Phone <span className="text-slate-400">(Optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={altPhone}
                      onChange={(e) => {
                        setAltPhone(e.target.value);
                        if (validationErrors.altPhone) {
                          setValidationErrors((prev) => ({ ...prev, altPhone: undefined }));
                        }
                      }}
                      placeholder="01XXXXXXXXX"
                      maxLength={15}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    {validationErrors.altPhone && (
                      <p className="text-[10px] text-rose-600 font-medium mt-0.5">
                        {validationErrors.altPhone}
                      </p>
                    )}
                  </div>

                  {/* OPTIONAL NOTES */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Order Notes <span className="text-slate-400">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Special delivery instructions"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                {/* 3. PAYMENT METHOD SELECTION */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    Payment Method
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Cash on Delivery */}
                    <button
                      id="pay-method-cod-btn"
                      type="button"
                      onClick={() => setSelectedPayment('cod')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedPayment === 'cod'
                          ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                          Cash on Delivery
                        </span>
                        {selectedPayment === 'cod' && (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Pay cash upon parcel delivery
                      </span>
                    </button>

                    {/* DBBL Bank / NexusPay */}
                    <button
                      id="pay-method-dbbl-btn"
                      type="button"
                      onClick={() => setSelectedPayment('dbbl')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedPayment === 'dbbl'
                          ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                          DBBL / NexusPay
                        </span>
                        {selectedPayment === 'dbbl' && (
                          <Check className="w-3.5 h-3.5 text-indigo-600" />
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Direct Bank & Bangla QR
                      </span>
                    </button>
                  </div>

                  {/* Inline DBBL Bank Details Form if selected */}
                  {selectedPayment === 'dbbl' && (
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-500/30 shadow-xl space-y-4">
                      <div className="flex items-center justify-between border-b border-indigo-800/60 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-extrabold text-xs shadow-xs">
                            DBBL
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-white leading-tight">
                              {dbblBank.bankName}
                            </h5>
                            <span className="text-[10px] text-indigo-300">
                              NexusPay & Bank Transfer (0% Fee)
                            </span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                          Zero Surcharge
                        </span>
                      </div>

                      <div className="p-3 bg-slate-800/80 rounded-xl border border-indigo-900/60 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-[11px]">Account Name:</span>
                          <span className="font-bold text-white">{dbblBank.accountHolderName}</span>
                        </div>

                        <div className="flex items-center justify-between py-1 px-2.5 bg-slate-900/90 rounded-lg border border-indigo-500/40">
                          <div>
                            <span className="text-[10px] text-indigo-300 uppercase tracking-wider block font-medium">
                              DBBL Account Number
                            </span>
                            <span className="font-mono font-extrabold text-sm text-amber-300 tracking-wider">
                              {dbblBank.accountNumber}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyAccountNumber}
                            className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedAccount ? 'Copied!' : 'Copy'}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-700/60">
                          <div>
                            <span className="text-slate-400 block text-[10px]">Branch:</span>
                            <span className="text-slate-200 font-medium">{dbblBank.branchName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">Routing No:</span>
                            <span className="font-mono text-slate-200 font-medium">{dbblBank.routingNumber}</span>
                          </div>
                        </div>
                      </div>

                      {/* Instructions & QR Code Preview */}
                      <div className="flex items-start gap-3 p-2.5 rounded-xl bg-indigo-950/60 border border-indigo-800/40 text-[11px]">
                        {dbblBank.qrCodeUrl && (
                          <div className="shrink-0 text-center">
                            <img
                              src={dbblBank.qrCodeUrl}
                              alt="NexusPay QR Code"
                              className="w-14 h-14 rounded-lg bg-white p-1 object-contain cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => setShowQrModal(true)}
                              title="Click to zoom QR Code"
                            />
                            <span className="text-[9px] text-indigo-300 block mt-0.5">NexusPay QR</span>
                          </div>
                        )}
                        <p className="text-slate-300 leading-relaxed text-[11px] flex-1">
                          {dbblBank.instructions}
                        </p>
                      </div>

                      {/* Verification Details */}
                      <div className="space-y-2.5 pt-1">
                        <span className="text-[11px] font-bold text-indigo-200 uppercase tracking-wider block">
                          Provide Your Transfer Verification Details
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              Sender Bank / App *
                            </label>
                            <select
                              value={senderBank}
                              onChange={(e) => setSenderBank(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="NexusPay App">NexusPay App</option>
                              <option value="DBBL Rocket">DBBL Rocket</option>
                              <option value="Dutch-Bangla Bank Net Banking">Dutch-Bangla Net Banking</option>
                              <option value="City Touch / City Bank">City Touch / City Bank</option>
                              <option value="BRAC Bank / Astha">BRAC Bank / Astha</option>
                              <option value="Islami Bank / CellFin">Islami Bank / CellFin</option>
                              <option value="bKash to Bank">bKash (Send to Bank)</option>
                              <option value="Nagad to Bank">Nagad (Send to Bank)</option>
                              <option value="Other Bank (BEFTN/NPSB)">Other Bank (BEFTN/NPSB)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              Sender Account / Mobile No *
                            </label>
                            <input
                              type="text"
                              value={senderAccountOrPhone}
                              onChange={(e) => setSenderAccountOrPhone(e.target.value)}
                              placeholder="e.g. 017xxxxxxxx or Acc No"
                              className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Bank Transaction ID (TrxID / Ref) *
                          </label>
                          <input
                            type="text"
                            value={transactionId}
                            onChange={(e) => setTransactionId(e.target.value)}
                            placeholder="e.g. DBBL-9284102 or NPSB Trx ID"
                            className="w-full px-3 py-2 bg-slate-800 border border-indigo-500/50 rounded-xl text-xs font-mono font-bold text-amber-300 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                          />
                        </div>

                        {/* Deposit Slip Upload */}
                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Upload Payment Screenshot / Deposit Slip (Optional)
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 hover:border-indigo-500 rounded-xl text-xs text-slate-300 cursor-pointer flex items-center justify-center gap-2 transition-colors">
                              <Upload className="w-3.5 h-3.5 text-indigo-400" />
                              <span>{depositSlipUrl ? 'Change Screenshot' : 'Choose Image File'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleSlipUpload}
                                className="hidden"
                              />
                            </label>
                            {depositSlipUrl && (
                              <button
                                type="button"
                                onClick={() => setDepositSlipUrl('')}
                                className="px-2.5 py-2 rounded-xl bg-rose-900/60 text-rose-300 hover:bg-rose-900 text-xs font-bold transition-colors cursor-pointer"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          {depositSlipUrl && (
                            <div className="mt-2 p-1.5 bg-slate-800/80 rounded-xl border border-slate-700 flex items-center gap-2">
                              <img
                                src={depositSlipUrl}
                                alt="Slip preview"
                                className="w-12 h-12 rounded-lg object-cover border border-slate-600"
                              />
                              <span className="text-[10px] text-emerald-400 font-medium">
                                Screenshot attached ready for admin review
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-1 text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-800">
                        <span className="flex items-center gap-1 text-indigo-300">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                          Admin Verified Manual Deposit
                        </span>
                        <span className="text-amber-400">Order Status: UNVERIFIED</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Promo Code + Order Summary + Place Order Button */}
              <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-0">
                {/* 4. PROMO CODE / VOUCHER SECTION (BEFORE FINAL ORDER BUTTON) */}
                <div className="pt-2 border-t border-slate-200">
                  <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <TicketPercent className="w-4 h-4 text-rose-500" />
                        Have a Promo Code / Voucher?
                      </span>
                      {appliedCoupon && (
                        <button
                          type="button"
                          onClick={handleRemovePromo}
                          className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {appliedCoupon ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-bold font-mono uppercase text-emerald-900">
                              Promo Applied ✓ ({appliedCoupon.code})
                            </span>
                            <span className="text-[11px] block text-emerald-700 mt-0.5">
                              Discount: <strong>-৳ {effectiveDiscount.toLocaleString()} BDT</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            id="cart-coupon-input"
                            type="text"
                            value={promoCodeInput}
                            onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleApplyPromo();
                              }
                            }}
                            placeholder="Enter promo code or voucher"
                            className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleApplyPromo()}
                            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-colors cursor-pointer active:scale-95"
                          >
                            Apply
                          </button>
                        </div>

                        {promoFeedback && (
                          <p
                            className={`text-[11px] font-medium flex items-center gap-1 ${
                              promoFeedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {promoFeedback.type === 'success' ? (
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                            ) : (
                              <AlertCircle className="w-3 h-3 shrink-0" />
                            )}
                            {promoFeedback.text}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. ORDER SUMMARY & SUBMIT BUTTON CARD */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-xs space-y-4">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-200">
                    Order Summary
                  </h4>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Subtotal ({cartCount} {cartCount === 1 ? 'item' : 'items'}):</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        ৳ {cartSubtotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delivery Charge ({deliveryZone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}):</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        ৳ {deliveryFee.toLocaleString()}
                      </span>
                    </div>
                    {effectiveDiscount > 0 && (
                      <div className="flex justify-between text-emerald-700 font-semibold bg-emerald-100/70 px-2.5 py-1.5 rounded-lg">
                        <span className="flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5 text-emerald-600" />
                          Discount ({appliedCoupon?.code || 'Promo'}):
                        </span>
                        <span className="font-mono font-bold">-৳ {effectiveDiscount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                      <span>Total Amount:</span>
                      <span className="text-rose-600 font-display text-lg font-extrabold tracking-tight">
                        ৳ {grandTotal.toLocaleString()} BDT
                      </span>
                    </div>
                  </div>

                  {/* Single-Step Direct Place Order Button */}
                  <button
                    id="place-order-submit-btn"
                    type="button"
                    onClick={() => handlePlaceOrder()}
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-black disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-98 transition-all cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                        <span>Placing Order...</span>
                      </>
                    ) : selectedPayment === 'cod' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Place Order (৳ {grandTotal.toLocaleString()})</span>
                      </>
                    ) : (
                      <>
                        <Building2 className="w-4 h-4 text-indigo-400" />
                        <span>Confirm Order (DBBL Transfer)</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>100% Secure Checkout • Cash on Delivery</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Zoom Modal */}
      {showQrModal && dbblBank.qrCodeUrl && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-slate-900 text-sm">NexusPay / Bangla QR</h4>
              <button
                onClick={() => setShowQrModal(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={dbblBank.qrCodeUrl}
              alt="Scan with NexusPay"
              className="w-56 h-56 mx-auto rounded-xl border border-slate-200"
            />
            <p className="text-xs text-slate-500">
              Scan using NexusPay, Dutch-Bangla Net Banking, or any Bangladeshi bank app supporting Bangla QR.
            </p>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
