import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Heart,
  ShoppingCart,
  Trash2,
  ArrowRight,
  Check,
  ShoppingBag,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { getResponsiveImageUrl } from '../utils/responsiveImage';

export const WishlistDrawer: React.FC = () => {
  const {
    wishlist,
    products,
    categories,
    isWishlistOpen,
    setIsWishlistOpen,
    toggleWishlist,
    clearWishlist,
    addToCart,
    setQuickViewProduct,
  } = useStore();

  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});

  // Close modal on Escape key press
  useEffect(() => {
    if (!isWishlistOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsWishlistOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWishlistOpen, setIsWishlistOpen]);

  if (!isWishlistOpen) return null;

  const wishlistProducts = products.filter((p) => wishlist.includes(p.id));

  const handleAddToCart = (product: any) => {
    addToCart(product, 1);
    setAddedMap((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedMap((prev) => ({ ...prev, [product.id]: false }));
    }, 1200);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 md:p-6 lg:p-8 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity duration-300"
        onClick={() => setIsWishlistOpen(false)}
      />

      <div className="relative w-full h-full sm:h-auto sm:max-h-[92vh] max-w-4xl bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-xs">
              <Heart className="w-5 h-5 fill-rose-500 text-rose-500" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-800 flex items-center gap-2">
                Saved Wishlist
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                  {wishlistProducts.length} {wishlistProducts.length === 1 ? 'item' : 'items'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Items you've saved to purchase later
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {wishlistProducts.length > 0 && (
              <button
                onClick={clearWishlist}
                className="text-xs font-semibold text-slate-500 hover:text-rose-600 px-3 py-1.5 rounded-lg hover:bg-slate-200/80 transition-colors cursor-pointer"
                title="Clear all saved items"
              >
                Clear All
              </button>
            )}
            <button
              id="close-wishlist-drawer-btn"
              onClick={() => setIsWishlistOpen(false)}
              className="p-2 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Close wishlist"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {wishlistProducts.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-rose-50 flex items-center justify-center mx-auto text-rose-400 shadow-inner">
                <Heart className="w-10 h-10 fill-rose-100 text-rose-500" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg sm:text-xl">Your Wishlist is Empty</h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                Tap the heart icon on any product to save items you love and buy them whenever you're ready.
              </p>
              <button
                onClick={() => setIsWishlistOpen(false)}
                className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-colors cursor-pointer"
              >
                Explore Collection
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {wishlistProducts.map((product) => {
                const isOutOfStock = product.stock <= 0;
                const cat = categories.find((c) => c.id === product.categoryId);
                const discount =
                  product.originalPrice && product.originalPrice > product.price
                    ? Math.round(
                        ((product.originalPrice - product.price) / product.originalPrice) * 100
                      )
                    : 0;

                return (
                  <div
                    key={product.id}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200 transition-all flex gap-3.5 items-center group relative shadow-2xs hover:shadow-sm"
                  >
                    <div
                      onClick={() => {
                        setQuickViewProduct(product);
                        setIsWishlistOpen(false);
                      }}
                      className="w-20 h-20 sm:w-22 sm:h-22 rounded-xl bg-white overflow-hidden shrink-0 border border-slate-200 cursor-pointer shadow-2xs relative"
                    >
                      <img
                        src={getResponsiveImageUrl(product.imageUrl, 240)}
                        alt={product.title}
                        width={88}
                        height={88}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        style={{ aspectRatio: '1 / 1' }}
                      />
                      {discount > 0 && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-extrabold shadow-xs">
                          -{discount}%
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      {cat && (
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          {cat.name}
                        </span>
                      )}
                      <h4
                        onClick={() => {
                          setQuickViewProduct(product);
                          setIsWishlistOpen(false);
                        }}
                        className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-1 cursor-pointer hover:text-rose-600 transition-colors"
                        title={product.title}
                      >
                        {product.title}
                      </h4>

                      <div className="flex items-baseline gap-2">
                        <span className="font-extrabold text-slate-900 text-xs sm:text-sm">
                          ৳ {product.price.toLocaleString()} BDT
                        </span>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <span className="text-[11px] text-slate-400 line-through">
                            ৳ {product.originalPrice.toLocaleString()}
                          </span>
                        )}
                      </div>

                      <div>
                        {isOutOfStock ? (
                          <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-100/70 px-2 py-0.5 rounded-md">
                            Out of Stock
                          </span>
                        ) : (
                          <span className="inline-block text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                            In Stock ({product.stock} available)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-1.5">
                        <button
                          disabled={isOutOfStock}
                          onClick={() => handleAddToCart(product)}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                          title="Add to shopping cart"
                        >
                          {addedMap[product.id] ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Added!</span>
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>Add to Cart</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => toggleWishlist(product.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Remove from wishlist"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {wishlistProducts.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
            <span className="text-xs sm:text-sm text-slate-600">
              Total saved items: <strong className="text-slate-900">{wishlistProducts.length}</strong>
            </span>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsWishlistOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
              >
                Continue Shopping
              </button>
              <button
                onClick={() => {
                  wishlistProducts.forEach((p) => {
                    if (p.stock > 0) addToCart(p, 1);
                  });
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                <span>Add All to Cart</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
