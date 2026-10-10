import React, { useState, useMemo } from 'react';
import { Star, ShoppingCart, ShoppingBag, Check, Images, Heart, Share2, Eye } from 'lucide-react';
import { Product } from '../types';
import { useStore } from '../context/StoreContext';
import { parseColorOption } from '../utils/productVariants';
import { getResponsiveImageProps } from '../utils/responsiveImage';

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

const ProductCardComponent: React.FC<ProductCardProps> = ({ product, priority = false }) => {
  const {
    addToCart,
    quickBuy,
    setQuickViewProduct,
    categories,
    wishlist,
    toggleWishlist,
    copyProductLink,
    getProductUrl,
    getCategoryUrl,
    setSelectedCategory,
    navigateToCategory,
    setCurrentView,
    setSelectedProductId,
    loadProductById,
    reviews,
  } = useStore();
  const [isAdded, setIsAdded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const approvedReviews = useMemo(() => {
    return Array.isArray(reviews)
      ? reviews.filter((r) => r && (r.productId === product.id || (product.slug && r.productId === product.slug)) && r.status === 'approved')
      : [];
  }, [reviews, product.id, product.slug]);

  const approvedCount = reviews && reviews.length > 0
    ? approvedReviews.length
    : (typeof product.reviewsCount === 'number' && product.reviewsCount > 0 ? product.reviewsCount : 0);

  const approvedRating = approvedReviews.length > 0
    ? approvedReviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0) / approvedReviews.length
    : (typeof product.rating === 'number' ? product.rating : 5.0);

  const category = categories.find((c) => c.id === product.categoryId);
  const isSavedInWishlist = wishlist.includes(product.id);
  const hasMultipleColors = Boolean(product.colors && product.colors.length > 1);
  const hasMultipleSizes = Boolean(product.sizes && product.sizes.length > 1);
  const requiresVariantSelection = hasMultipleColors || hasMultipleSizes;

  const handleProductClick = (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    setSelectedProductId(product.slug || product.id);
    setCurrentView('product');
    loadProductById(product.slug || product.id);
    window.history.pushState({}, '', getProductUrl(product));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryClick = (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (category) {
      navigateToCategory(category.id);
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (requiresVariantSelection) {
      setQuickViewProduct(product);
      return;
    }
    const defaultSize = product.sizes && product.sizes.length === 1 ? product.sizes[0] : undefined;
    const defaultColor = product.colors && product.colors.length === 1 ? product.colors[0] : undefined;
    addToCart(product, 1, defaultSize, defaultColor, false);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1200);
  };

  const handleQuickBuy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (requiresVariantSelection) {
      setQuickViewProduct(product);
      return;
    }
    const defaultSize = product.sizes && product.sizes.length === 1 ? product.sizes[0] : undefined;
    const defaultColor = product.colors && product.colors.length === 1 ? product.colors[0] : undefined;
    quickBuy(product, defaultSize, defaultColor);
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWishlist(product.id);
  };

  const isLowStock = product.stock <= 5 && product.stock > 0;
  const isOutOfStock = product.stock === 0;
  const hasMultipleImages = Boolean(product.images && product.images.length > 1);
  const secondaryImage = hasMultipleImages && product.images ? product.images[1] : null;

  const discountPercent =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0;

  const primaryImgProps = getResponsiveImageProps(product.imageUrl, 'card', { priority });
  const secondaryImgProps = secondaryImage && isHovered ? getResponsiveImageProps(secondaryImage, 'card') : null;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      className="group relative bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden hover:-translate-y-1"
    >
      {/* Dynamic Rainbow Top Accent on hover */}
      <div className="h-1 w-full bg-transparent group-hover:rainbow-gradient-bg transition-all duration-300" />

      {/* Image Container */}
      <div className="relative aspect-square w-full bg-slate-100 overflow-hidden">
        <a
          href={getProductUrl(product)}
          onClick={handleProductClick}
          className="block w-full h-full cursor-pointer"
          title={product.title}
        >
          <img
            {...primaryImgProps}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchPriority={priority ? 'high' : 'auto'}
            alt={`${product.title} - ${category ? category.name : 'Rongdhonu Trade'}`}
            className={`w-full h-full object-cover object-center transition-all duration-500 ease-out ${
              secondaryImage ? 'group-hover:opacity-0 group-hover:scale-105' : 'group-hover:scale-105'
            }`}
          />

          {/* Alternate angle reveal on hover if multiple images exist (deferred until user hovers card) */}
          {secondaryImage && isHovered && secondaryImgProps && (
            <img
              {...secondaryImgProps}
              loading="lazy"
              decoding="async"
              alt={`${product.title} - ${category ? category.name : 'Rongdhonu Trade'} view 2`}
              className="absolute inset-0 w-full h-full object-cover object-center opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500 ease-out"
            />
          )}
        </a>

        {/* Multiple Photos Indicator Badge */}
        {hasMultipleImages && (
          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-full bg-slate-900/75 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1 shadow-xs z-10 transition-opacity group-hover:opacity-90 pointer-events-none">
            <Images className="w-3 h-3 text-rose-400" />
            {product.images?.length}
          </span>
        )}

        {/* Quick View Button - Appears strictly when hovering the mouse over the image, never sitting over image when idle */}
        <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setQuickViewProduct(product);
            }}
            className="py-1.5 px-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-950 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg backdrop-blur-xs active:scale-95 transition-all cursor-pointer"
            title="Quick View"
            aria-label="Quick View"
          >
            <Eye className="w-3.5 h-3.5 text-rose-400" />
            <span>Quick View</span>
          </button>
        </div>

        {/* Floating Action Buttons: Wishlist, Quick View & Share Link */}
        <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1.5 items-center">
          <button
            type="button"
            onClick={handleToggleWishlist}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-xs ${
              isSavedInWishlist
                ? 'bg-white text-rose-500 shadow-md scale-105'
                : 'bg-white/80 hover:bg-white text-slate-500 hover:text-rose-500 opacity-90 group-hover:opacity-100'
            }`}
            title={isSavedInWishlist ? 'Remove from wishlist' : 'Save to wishlist'}
            aria-label="Toggle Wishlist"
          >
            <Heart
              className={`w-4 h-4 transition-transform active:scale-125 ${
                isSavedInWishlist ? 'fill-rose-500 text-rose-500' : ''
              }`}
            />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setQuickViewProduct(product);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-xs bg-white/80 hover:bg-white text-slate-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Quick View"
            aria-label="Quick View"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copyProductLink(product.id);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-xs bg-white/80 hover:bg-white text-slate-500 hover:text-indigo-600 opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Copy direct product link"
            aria-label="Share Link"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Badges Overlay */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 z-10 pointer-events-none">
          {discountPercent > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider text-white bg-rose-600 shadow-sm flex items-center gap-1">
              {discountPercent}% OFF
            </span>
          )}
          {isLowStock && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-sm">
              Low Stock: {product.stock} left
            </span>
          )}
          {isOutOfStock && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-white shadow-sm">
              Sold Out
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between space-y-2 sm:space-y-3">
        <div>
          {/* Category & Rating */}
          <div className="flex items-center justify-between gap-1 sm:gap-2 text-xs">
            {category ? (
              <a
                href={getCategoryUrl(category.slug || category.id)}
                onClick={handleCategoryClick}
                className="text-[10px] sm:text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition-colors uppercase tracking-wider truncate max-w-[55%]"
                title={`View ${category.name}`}
              >
                {category.name}
              </a>
            ) : (
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate max-w-[55%]">
                Category
              </span>
            )}
            {approvedCount > 0 ? (
              <div className="flex items-center gap-0.5 sm:gap-1 text-amber-500 font-bold text-[10px] sm:text-xs shrink-0">
                <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400" />
                <span>{approvedRating.toFixed(1)}</span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-normal">
                  ({approvedCount})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-slate-400 font-medium text-[10px] sm:text-[11px] shrink-0">
                <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-300" />
                <span>0 reviews</span>
              </div>
            )}
          </div>

          {/* Title */}
          <a
            href={getProductUrl(product)}
            onClick={handleProductClick}
            className="block group-hover:text-rose-600 transition-colors"
          >
            <h3 className="font-bold text-xs sm:text-sm text-slate-800 group-hover:text-rose-600 transition-colors mt-1 line-clamp-2 leading-tight sm:leading-snug min-h-[2rem] sm:min-h-0">
              {product.title}
            </h3>
          </a>

          {/* Specific Colors preview on product card so viewers easily identify them */}
          {product.colors && product.colors.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1 flex-wrap" title={`Available colors: ${product.colors.map((c) => parseColorOption(c).name).join(', ')}`}>
              <div className="flex items-center -space-x-1 py-0.5">
                {product.colors.slice(0, 5).map((col, cIdx) => {
                  const parsed = parseColorOption(col);
                  return (
                    <span
                      key={cIdx}
                      className={`inline-block w-3.5 h-3.5 rounded-full border-2 border-white shadow-2xs shrink-0 ${
                        parsed.isLight ? 'ring-1 ring-slate-300' : ''
                      }`}
                      style={{ backgroundColor: parsed.hex }}
                      title={parsed.name}
                    />
                  );
                })}
              </div>
              {product.colors.length > 5 && (
                <span className="text-[10px] text-slate-400 font-bold">
                  +{product.colors.length - 5}
                </span>
              )}
              <span className="text-[10px] text-slate-600 font-medium truncate max-w-[130px]">
                {product.colors.length === 1
                  ? parseColorOption(product.colors[0]).name
                  : `${product.colors.length} colors`}
              </span>
            </div>
          )}
        </div>

        {/* Price & Actions */}
        <div className="pt-1.5 sm:pt-2 border-t border-slate-100 space-y-2 sm:space-y-3">
          <div className="flex items-baseline justify-between gap-1">
            <div className="flex items-baseline gap-1 sm:gap-1.5 truncate">
              <span className="text-sm sm:text-lg font-bold font-display text-slate-900">
                ৳ {product.price.toLocaleString()}
              </span>
              {product.originalPrice && (
                <span className="text-[10px] sm:text-xs text-slate-400 line-through truncate">
                  ৳ {product.originalPrice.toLocaleString()}
                </span>
              )}
            </div>
            <span className="text-[9px] sm:text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">
              {product.stock > 0 ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>

          {/* Two CTA buttons: Add to Cart & Quick Buy */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <button
              id={`add-to-cart-btn-${product.id}`}
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className="py-1.5 sm:py-2 px-1 sm:px-2.5 rounded-lg sm:rounded-xl border border-rose-500 text-rose-600 hover:bg-rose-50 font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1 sm:gap-1.5 transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-95"
              title="Add to shopping cart"
            >
              {isAdded ? (
                <>
                  <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600" />
                  <span>Added!</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Add</span>
                </>
              )}
            </button>

            <button
              id={`buy-now-btn-${product.id}`}
              onClick={handleQuickBuy}
              disabled={isOutOfStock}
              className="py-1.5 sm:py-2 px-1 sm:px-2.5 rounded-lg sm:rounded-xl bg-slate-900 hover:bg-black active:bg-slate-950 text-white font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1 sm:gap-1.5 shadow-xs hover:shadow-sm active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
              title="Buy now immediately"
            >
              <ShoppingBag className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
              <span>Buy Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ProductCard = React.memo(ProductCardComponent, (prev, next) => {
  return (
    prev.priority === next.priority &&
    prev.product.id === next.product.id &&
    prev.product.price === next.product.price &&
    prev.product.originalPrice === next.product.originalPrice &&
    prev.product.stock === next.product.stock &&
    prev.product.imageUrl === next.product.imageUrl &&
    prev.product.title === next.product.title &&
    prev.product.rating === next.product.rating &&
    prev.product.reviewsCount === next.product.reviewsCount
  );
});
