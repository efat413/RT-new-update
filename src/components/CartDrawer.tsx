import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { parseColorOption } from '../utils/productVariants';
import { getResponsiveImageUrl } from '../utils/responsiveImage';
import { ErrorBoundary } from './ErrorBoundary';

// Code-splitting: Lazy-load heavy checkout form (Bangladesh districts, payment selection, DBBL verification, promo vouchers)
// Visitors browsing their cart items do NOT download the entire checkout bundle until cart is populated and checkout is displayed
const CheckoutSection = React.lazy(() =>
  import('./CheckoutSection').then((m) => ({ default: m.CheckoutSection }))
);

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

const CheckoutLoadingFallback: React.FC = () => (
  <div className="space-y-6 pt-4 border-t border-slate-200 animate-pulse">
    <div className="space-y-3">
      <div className="h-4 w-36 bg-slate-200 rounded-md" />
      <div className="h-10 w-full bg-slate-100 rounded-xl" />
      <div className="h-10 w-full bg-slate-100 rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-10 w-full bg-slate-100 rounded-xl" />
        <div className="h-10 w-full bg-slate-100 rounded-xl" />
      </div>
    </div>
    <div className="space-y-3 pt-3 border-t border-slate-200">
      <div className="h-4 w-32 bg-slate-200 rounded-md" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-14 w-full bg-slate-100 rounded-xl" />
        <div className="h-14 w-full bg-slate-100 rounded-xl" />
      </div>
    </div>
    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
      <div className="h-4 w-28 bg-slate-200 rounded-md" />
      <div className="h-4 w-full bg-slate-200/70 rounded-md" />
      <div className="h-4 w-full bg-slate-200/70 rounded-md" />
      <div className="h-12 w-full bg-slate-300 rounded-xl" />
    </div>
  </div>
);

export const CartDrawer: React.FC = () => {
  const {
    cart,
    cartCount,
    cartSubtotal,
    isCartOpen,
    setIsCartOpen,
    updateCartQuantity,
    removeFromCart,
    trackEvent,
  } = useStore();

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

  // Track InitiateCheckout once when customer opens checkout drawer with items
  const hasTrackedCheckoutRef = useRef(false);
  useEffect(() => {
    if (isCartOpen && cart.length > 0) {
      if (!hasTrackedCheckoutRef.current) {
        hasTrackedCheckoutRef.current = true;
        trackEvent('InitiateCheckout', {
          content_name: cart.map((it) => it.product.title).join(', '),
          content_ids: cart.map((it) => it.product.id),
          contents: cart.map((it) => ({
            id: it.product.id,
            name: it.product.title,
            price: it.product.price,
            quantity: it.quantity,
          })),
          num_items: cart.reduce((acc, it) => acc + it.quantity, 0),
          value: cartSubtotal,
          currency: 'BDT',
        });
      }
    } else if (!isCartOpen) {
      hasTrackedCheckoutRef.current = false;
    }
  }, [isCartOpen, cart, cartSubtotal, trackEvent]);

  if (!isCartOpen) return null;

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

                {/* Code-split Checkout Flow */}
                <ErrorBoundary
                  compact
                  fallbackTitle="Checkout Form Unavailable"
                  fallbackMessage="Unable to load the checkout form. Please try reloading."
                >
                  <React.Suspense fallback={<CheckoutLoadingFallback />}>
                    <CheckoutSection />
                  </React.Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
