import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Star,
  ShoppingCart,
  ShoppingBag,
  Check,
  ChevronLeft,
  ChevronRight,
  Images,
  Heart,
  MessageSquare,
  Send,
  User,
  CheckCircle2,
  Trash2,
  Share2,
  Link,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Play,
  Video,
  Tv,
  AlertTriangle,
} from 'lucide-react';
import { Product } from '../types';
import { useStore } from '../context/StoreContext';
import { FormattedDescription } from './FormattedDescription';
import { ConfirmModal } from './ConfirmModal';
import { parseColorOption } from '../utils/productVariants';
import { getYouTubeThumbnailUrl } from '../utils/youtube';
import { getResponsiveImageProps, getResponsiveImageUrl } from '../utils/responsiveImage';

interface QuickViewModalProps {
  product: Product | null;
  onClose: () => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({ product: propProduct, onClose }) => {
  const {
    products,
    addToCart,
    quickBuy,
    categories,
    settings,
    wishlist,
    toggleWishlist,
    reviews,
    addProductReview,
    deleteProductReview,
    copyProductLink,
    getProductUrl,
    getCategoryUrl,
    setSelectedCategory,
    navigateToCategory,
    setQuickViewProduct,
    videoModalProduct,
    openProductVideo,
    currentUser,
    isAdminLoggedIn,
    hasPermission,
    trackEvent,
    setCurrentView,
    setSelectedProductId,
    loadProductById,
    showNotification,
  } = useStore();

  // Always resolve the latest product instance from store to reflect rating & reviewsCount adjustments immediately
  const product = (products && propProduct ? products.find((p) => p.id === propProduct.id) : null) || propProduct;

  const category = categories.find((c) => c.id === product?.categoryId);

  // Related products from same category for crawlable internal linking
  const relatedProducts = useMemo(() => {
    if (!product || !products) return [];
    return products
      .filter((p) => p.categoryId === product.categoryId && p.id !== product.id)
      .slice(0, 3);
  }, [product, products]);

  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | undefined>(undefined);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [addedNotice, setAddedNotice] = useState(false);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'reviews'>('overview');
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Track ProductView / ViewContent event to Meta, TikTok, and GTM
  useEffect(() => {
    if (product) {
      trackEvent('ProductView', {
        content_name: product.title,
        content_ids: [product.id],
        content_type: 'product',
        value: product.price,
        currency: 'BDT',
      });
    }
  }, [product?.id]);

  // Review Form State
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewAuthor, setReviewAuthor] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState('');
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

  // Permission to manage/delete reviews
  const canDeleteReview = Boolean(
    currentUser?.role === 'super_admin' ||
    hasPermission('reviews.delete') ||
    hasPermission('review.delete')
  );

  // Extract all images (primary + any gallery photos)
  const imageList = useMemo(() => {
    if (!product) return [];
    const set = new Set<string>();
    if (product.imageUrl) set.add(product.imageUrl.trim());
    if (product.images && Array.isArray(product.images)) {
      product.images.forEach((img) => {
        if (img && img.trim()) set.add(img.trim());
      });
    }
    return Array.from(set);
  }, [product]);

  // Reset selected image, tab, size, color, and quantity when product changes
  useEffect(() => {
    setSelectedImageIdx(0);
    setQuantity(1);
    setActiveTab('overview');
    setReviewSuccessMsg('');
    setIsFullscreenOpen(false);
    setIsZoomed(false);
    if (product?.sizes && product.sizes.length === 1) {
      setSelectedSize(product.sizes[0]);
    } else {
      setSelectedSize(undefined);
    }
    if (product?.colors && product.colors.length === 1) {
      setSelectedColor(product.colors[0]);
    } else {
      setSelectedColor(undefined);
    }
    setValidationError(null);
    if (currentUser?.name) {
      setReviewAuthor(currentUser.name);
    } else {
      setReviewAuthor('');
    }
  }, [product?.id, currentUser]);

  // Lock body scroll and handle Escape key while modal or fullscreen is active
  useEffect(() => {
    if (!product) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (videoModalProduct) return;
      if (e.key === 'Escape') {
        if (isFullscreenOpen) {
          setIsFullscreenOpen(false);
          setIsZoomed(false);
        } else {
          onClose();
        }
      } else if (isFullscreenOpen) {
        if (e.key === 'ArrowLeft') {
          setSelectedImageIdx((prev) => (prev > 0 ? prev - 1 : imageList.length - 1));
          setIsZoomed(false);
        } else if (e.key === 'ArrowRight') {
          setSelectedImageIdx((prev) => (prev < imageList.length - 1 ? prev + 1 : 0));
          setIsZoomed(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [product, isFullscreenOpen, videoModalProduct, imageList.length, onClose]);

  // If no product is selected, render nothing (all Hooks called above)
  if (!product) return null;

  const activeImage = imageList[selectedImageIdx] || product.imageUrl;
  const isSavedInWishlist = wishlist.includes(product.id);
  const productReviews = Array.isArray(reviews)
    ? reviews.filter((r) => r && r.productId === product.id && (r.status || 'approved') === 'approved')
    : [];

  const backendReviewsCount =
    typeof product.reviewsCount === 'number'
      ? product.reviewsCount
      : (Number(product.reviewsCount) || 0);

  const totalReviewsCount = Math.max(backendReviewsCount, productReviews.length);

  const discountPercent =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0;

  const hasVideo = Boolean(product.videoUrl && product.videoUrl.trim());

  const validateVariantSelection = (): { valid: boolean; color?: string; size?: string } => {
    const hasMultipleColors = Boolean(product?.colors && product.colors.length > 1);
    const hasMultipleSizes = Boolean(product?.sizes && product.sizes.length > 1);

    const resolvedColor =
      selectedColor || (product?.colors && product.colors.length === 1 ? product.colors[0] : undefined);
    const resolvedSize =
      selectedSize || (product?.sizes && product.sizes.length === 1 ? product.sizes[0] : undefined);

    const isColorMissing = hasMultipleColors && !resolvedColor;
    const isSizeMissing = hasMultipleSizes && !resolvedSize;

    if (isColorMissing && isSizeMissing) {
      const msg = 'Please select a color and size.';
      setValidationError(msg);
      showNotification('warning', 'Selection Required', msg);
      return { valid: false };
    }
    if (isColorMissing) {
      const msg = 'Please select a color.';
      setValidationError(msg);
      showNotification('warning', 'Color Required', msg);
      return { valid: false };
    }
    if (isSizeMissing) {
      const msg = 'Please select a size.';
      setValidationError(msg);
      showNotification('warning', 'Size Required', msg);
      return { valid: false };
    }

    setValidationError(null);
    return { valid: true, color: resolvedColor, size: resolvedSize };
  };

  const handleAddToCart = () => {
    const { valid, color, size } = validateVariantSelection();
    if (!valid) return;

    addToCart(product, quantity, size, color);
    setAddedNotice(true);
    setTimeout(() => {
      setAddedNotice(false);
      onClose();
    }, 800);
  };

  const handleQuickBuy = () => {
    const { valid, color, size } = validateVariantSelection();
    if (!valid) return;

    quickBuy(product, size, color);
    onClose();
  };

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !reviewComment.trim()) return;

    addProductReview({
      productId: product.id,
      authorName: reviewAuthor.trim() || 'Verified Shopper',
      rating: reviewRating,
      comment: reviewComment.trim(),
    });

    setReviewComment('');
    setReviewSuccessMsg('Thank you! Your review has been submitted and is pending administrator approval before appearing in the store.');
    setTimeout(() => setReviewSuccessMsg(''), 4000);
  };

  return createPortal(
    <div
      id="quick-view-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[99999] flex items-start sm:items-center justify-center p-2.5 sm:p-4 md:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-3xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-auto max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2.5rem)] flex flex-col md:flex-row">
        <button
          id="close-quick-view-btn"
          onClick={onClose}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 z-30 p-2 rounded-full bg-white/90 hover:bg-white text-slate-700 shadow-md transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Column: Image Container with Gallery Slideshow */}
        <div className="relative bg-slate-100 flex flex-col justify-between overflow-hidden md:w-1/2 shrink-0">
          <div className="relative aspect-4/3 sm:aspect-square md:aspect-auto md:h-full w-full max-h-56 sm:max-h-72 md:max-h-none overflow-hidden flex items-center justify-center bg-slate-900/5 group/img">
            <img
              {...getResponsiveImageProps(activeImage, 'detail', { priority: true })}
              alt={`${product.title} - ${category?.name || 'Rongdhonu Trade'} view ${selectedImageIdx + 1}`}
              onClick={() => setIsFullscreenOpen(true)}
              className="w-full h-full object-cover transition-all duration-300 hover:scale-105 cursor-zoom-in"
              title="Click to view full-screen"
            />

            {/* Corner Action Buttons: Full-Screen View Button + Video Play Button */}
            <div className="absolute bottom-3 left-3 sm:bottom-3.5 sm:left-3.5 z-20 flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                id="quick-view-fullscreen-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullscreenOpen(true);
                }}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/95 hover:bg-white text-slate-700 hover:text-slate-950 flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-95 border border-slate-200/80 backdrop-blur-xs cursor-pointer group"
                title="View full-screen"
                aria-label="View product image full screen"
              >
                <Maximize2 className="w-4 h-4 transition-transform group-hover:scale-110 text-slate-700 group-hover:text-slate-950" />
              </button>

              {/* Video Play Button next to full-screen view button (only visible when video link is added) */}
              {hasVideo && (
                <button
                  type="button"
                  id="quick-view-video-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    openProductVideo(product, 'popup');
                  }}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-95 border border-rose-500 shadow-rose-600/30 ring-2 ring-rose-500/20 backdrop-blur-xs cursor-pointer group select-none"
                  title="Watch Product Video Demo"
                  aria-label="Play product video"
                >
                  <Play className="w-4 h-4 fill-current transition-transform group-hover:scale-110 text-white ml-0.5" />
                </button>
              )}
            </div>

            {/* Stock Badges */}
            {product.stock <= 5 && product.stock > 0 && (
              <span className="absolute top-3.5 left-3.5 px-2.5 py-0.5 rounded-full bg-rose-500 text-white text-[11px] font-bold shadow-md z-10">
                Only {product.stock} Left!
              </span>
            )}
            {product.stock === 0 && (
              <span className="absolute top-3.5 left-3.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-white text-[11px] font-bold shadow-md z-10">
                Out of Stock
              </span>
            )}

            {/* Wishlist Button Overlay */}
            <button
              type="button"
              onClick={() => toggleWishlist(product.id)}
              className={`absolute top-3.5 right-12 sm:right-14 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all shadow-md ${
                isSavedInWishlist
                  ? 'bg-rose-50 text-rose-600 ring-2 ring-rose-500'
                  : 'bg-white/90 hover:bg-white text-slate-600 hover:text-rose-600'
              }`}
              title={isSavedInWishlist ? 'Remove from Wishlist' : 'Add to Wishlist'}
              aria-label="Toggle Wishlist"
            >
              <Heart className={`w-4 h-4 ${isSavedInWishlist ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>

            {/* Prev / Next Arrows if multiple images */}
            {imageList.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImageIdx((prev) =>
                      prev > 0 ? prev - 1 : imageList.length - 1
                    );
                  }}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow-md transition-transform hover:scale-110 z-10 cursor-pointer"
                  title="Previous photo"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImageIdx((prev) =>
                      prev < imageList.length - 1 ? prev + 1 : 0
                    );
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-800 flex items-center justify-center shadow-md transition-transform hover:scale-110 z-10 cursor-pointer"
                  title="Next photo"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* Photo Counter */}
                <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-slate-900/75 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs z-10">
                  <Images className="w-3.5 h-3.5 text-rose-400" />
                  {selectedImageIdx + 1} / {imageList.length}
                </span>
              </>
            )}
          </div>

          {/* Thumbnail Strip if multiple images or video are provided */}
          {(imageList.length > 1 || hasVideo) && (
            <div className="p-2.5 sm:p-3 bg-slate-50 border-t border-slate-200/80 flex items-center gap-2 overflow-x-auto">
              {imageList.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImageIdx(idx)}
                  className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                    selectedImageIdx === idx
                      ? 'border-rose-600 ring-2 ring-rose-200 scale-105'
                      : 'border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-400'
                  }`}
                  title={`View photo ${idx + 1}`}
                >
                  <img
                    src={getResponsiveImageUrl(img, 240)}
                    width={48}
                    height={48}
                    alt={`Thumbnail ${idx + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
              {hasVideo && product.videoUrl && (
                <button
                  type="button"
                  id="quick-view-thumbnail-video-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    openProductVideo(product, 'popup');
                  }}
                  className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 border-2 border-rose-500 ring-1 ring-rose-200 hover:scale-105 transition-all cursor-pointer bg-slate-900 group"
                  title="Watch Product Video Demo"
                  aria-label="Watch Product Video Demo"
                >
                  {getYouTubeThumbnailUrl(product.videoUrl, 'mq') ? (
                    <img
                      src={getYouTubeThumbnailUrl(product.videoUrl, 'mq')!}
                      alt={`${product.title} video thumbnail`}
                      className="w-full h-full object-cover opacity-75 group-hover:opacity-95 transition-opacity"
                    />
                  ) : (
                    <img
                      src={getResponsiveImageUrl(product.imageUrl, 240)}
                      width={48}
                      height={48}
                      alt={`${product.title} video thumbnail`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover opacity-60"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-white ml-0.5" />
                    </div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Details Container with Internal Smooth Scroll */}
        <div className="p-4 sm:p-6 md:p-7 flex flex-col justify-between space-y-4 md:w-1/2 overflow-y-auto max-h-[calc(100vh-14rem)] md:max-h-[calc(100vh-2.5rem)]">
          <div>
            {/* Breadcrumb Navigation */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 mb-2.5 flex-wrap">
              <a
                href="/"
                onClick={(e) => {
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
                  e.preventDefault();
                  onClose();
                  setSelectedCategory(null);
                }}
                className="underline decoration-slate-300 underline-offset-4 hover:decoration-rose-500 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:ring-offset-1 rounded-xs transition-colors font-medium"
              >
                Home
              </a>
              <span className="text-slate-300">/</span>
              {category && (
                <>
                  <a
                    href={getCategoryUrl(category.id)}
                    onClick={(e) => {
                      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
                      e.preventDefault();
                      onClose();
                      navigateToCategory(category.id);
                    }}
                    className="underline decoration-slate-300 underline-offset-4 hover:decoration-rose-500 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:ring-offset-1 rounded-xs transition-colors font-medium"
                  >
                    {category.name}
                  </a>
                  <span className="text-slate-300">/</span>
                </>
              )}
              <span className="text-slate-800 font-bold truncate max-w-[170px]" aria-current="page">
                {product.title}
              </span>
            </nav>

            {category && (
              <a
                href={getCategoryUrl(category.id)}
                onClick={(e) => {
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
                  e.preventDefault();
                  onClose();
                  navigateToCategory(category.id);
                }}
                className="inline-block text-xs font-bold text-rose-600 uppercase tracking-wider bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                title={`Browse ${category.name}`}
              >
                {category.name}
              </a>
            )}
            <a
              href={getProductUrl(product)}
              onClick={(e) => {
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
                e.preventDefault();
                onClose();
                setSelectedProductId(product.slug || product.id);
                setCurrentView('product');
                loadProductById(product.slug || product.id);
                window.history.pushState({}, '', getProductUrl(product));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="block group-hover:text-rose-600 transition-colors"
            >
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold font-display text-slate-900 hover:text-rose-600 transition-colors mt-2">
                {product.title}
              </h1>
            </a>

            {/* Star Rating & Reviews Tab Trigger */}
            <div className="flex items-center justify-between gap-2 mt-2">
              <div
                onClick={() => setActiveTab('reviews')}
                className="flex items-center gap-2 cursor-pointer group hover:opacity-80 transition-opacity"
              >
                {totalReviewsCount > 0 ? (
                  <>
                    <div className="flex items-center text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${
                            i < Math.floor(product.rating)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-bold text-slate-700">
                      {typeof product.rating === 'number' ? product.rating.toFixed(1) : product.rating}
                    </span>
                    <span className="text-xs text-rose-600 underline font-semibold">
                      ({totalReviewsCount} {totalReviewsCount === 1 ? 'review' : 'reviews'})
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center text-slate-200">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 text-slate-200" />
                      ))}
                    </div>
                    <span className="text-xs font-medium text-slate-500">No reviews yet</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => copyProductLink(product.id)}
                  title="Copy direct product link to clipboard"
                  className="text-xs font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Share URL</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleWishlist(product.id)}
                  className={`text-xs font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
                    isSavedInWishlist
                      ? 'bg-rose-50 border-rose-300 text-rose-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-rose-600'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isSavedInWishlist ? 'fill-rose-500 text-rose-500' : ''}`} />
                  <span>{isSavedInWishlist ? 'Saved' : 'Wishlist'}</span>
                </button>
              </div>
            </div>

            {/* Price & Discount Percentage */}
            <div className="flex items-center gap-2.5 flex-wrap mt-3.5">
              <span className="text-2xl sm:text-3xl font-extrabold font-display text-slate-900">
                ৳ {product.price.toLocaleString()}
              </span>
              {product.originalPrice && (
                <span className="text-sm sm:text-base font-semibold text-slate-400 line-through">
                  ৳ {product.originalPrice.toLocaleString()}
                </span>
              )}
              {discountPercent > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold tracking-wider text-white bg-rose-600 shadow-xs flex items-center gap-1">
                  {discountPercent}% OFF
                </span>
              )}
            </div>

            {/* Variant Selectors: Size & Color */}
            {((product.sizes && product.sizes.length > 0) || (product.colors && product.colors.length > 0)) && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                {/* Size Selector */}
                {product.sizes && product.sizes.length > 0 && (
                  <div
                    className={`rounded-xl transition-all ${
                      validationError && product.sizes.length > 1 && !selectedSize
                        ? 'p-2.5 ring-2 ring-rose-400 bg-rose-50/50'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Available Sizes:
                      </span>
                      <span className="text-xs font-extrabold text-rose-600">
                        {selectedSize ? `Selected: ${selectedSize}` : 'Choose a size'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {product.sizes.map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => {
                            setSelectedSize(sz);
                            setValidationError(null);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            selectedSize === sz
                              ? 'bg-slate-900 text-white shadow-xs scale-105 ring-2 ring-slate-900/20'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Color Selector */}
                {product.colors && product.colors.length > 0 && (
                  <div
                    className={`rounded-xl transition-all ${
                      validationError && product.colors.length > 1 && !selectedColor
                        ? 'p-2.5 ring-2 ring-rose-400 bg-rose-50/50'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Available Colors:
                      </span>
                      <span className="text-xs font-extrabold text-rose-600 flex items-center gap-1.5">
                        {selectedColor ? (
                          <>
                            <span className="text-slate-500 font-medium">Selected:</span>
                            <span
                              className="w-3 h-3 rounded-full border border-black/15 shadow-2xs inline-block"
                              style={{ backgroundColor: parseColorOption(selectedColor).hex }}
                            />
                            <span>{parseColorOption(selectedColor).name}</span>
                          </>
                        ) : (
                          'Choose a color'
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {product.colors.map((col) => {
                        const parsed = parseColorOption(col);
                        const isSelected = selectedColor === col;
                        return (
                          <button
                            key={col}
                            type="button"
                            onClick={() => {
                              setSelectedColor(col);
                              setValidationError(null);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border shadow-2xs ${
                              isSelected
                                ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-rose-500 scale-105'
                                : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded-full border shadow-2xs shrink-0 flex items-center justify-center transition-transform ${
                                parsed.isLight ? 'border-slate-300' : 'border-black/20'
                              }`}
                              style={{ backgroundColor: parsed.hex }}
                            >
                              {isSelected && (
                                <Check className={`w-2.5 h-2.5 ${parsed.isLight ? 'text-black' : 'text-white'}`} />
                              )}
                            </span>
                            <span>{parsed.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quantity and Actions */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Quantity
                </span>
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 transition-colors font-bold disabled:opacity-40"
                  >
                    -
                  </button>
                  <span className="px-4 py-1.5 text-sm font-bold text-slate-800 bg-white">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                    disabled={quantity >= product.stock}
                    className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 transition-colors font-bold disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Validation Warning Alert */}
              {validationError && (
                <div
                  id="quick-view-variant-validation-alert"
                  className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200"
                  role="alert"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* CTAs */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  id="modal-add-to-cart-btn"
                  onClick={handleAddToCart}
                  disabled={product.stock === 0}
                  className="py-3 px-4 rounded-xl border-2 border-rose-500 text-rose-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-rose-50 active:scale-95 transition-all disabled:opacity-50"
                >
                  {addedNotice ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      Added!
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      Add to Cart
                    </>
                  )}
                </button>

                <button
                  id="modal-quick-buy-btn"
                  onClick={handleQuickBuy}
                  disabled={product.stock === 0}
                  className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-black active:bg-slate-950 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                  Buy Now
                </button>
              </div>
            </div>

            {/* View Switcher Tabs: Overview vs Reviews */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`pb-2 text-xs font-bold transition-all border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-rose-600 text-rose-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Product Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className={`pb-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'reviews'
                    ? 'border-rose-600 text-rose-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Customer Reviews ({totalReviewsCount})
              </button>
            </div>

            {/* Tab 1: Overview with Formatted Description */}
            {activeTab === 'overview' && (
              <div className="mt-3 space-y-3 max-h-48 sm:max-h-56 overflow-y-auto pr-1">
                <FormattedDescription content={product.description} />

                {/* Internal Linking: Related Products from the same category */}
                {relatedProducts.length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Related in {category?.name || 'Category'}
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {relatedProducts.map((rel) => (
                        <a
                          key={rel.id}
                          href={getProductUrl(rel)}
                          onClick={(e) => {
                            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
                            e.preventDefault();
                            setQuickViewProduct(rel);
                          }}
                          className="group block p-1.5 rounded-xl border border-slate-200 hover:border-rose-400 bg-white transition-all text-left"
                          title={rel.title}
                        >
                          <div className="aspect-square w-full rounded-lg overflow-hidden bg-slate-100 mb-1">
                            <img
                              {...getResponsiveImageProps(rel.imageUrl, 'card')}
                              alt={`${rel.title} - ${category?.name || 'Rongdhonu Trade'}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          </div>
                          <p className="text-[10px] font-bold text-slate-800 line-clamp-1 group-hover:text-rose-600 transition-colors">
                            {rel.title}
                          </p>
                          <p className="text-[10px] font-semibold text-rose-600">
                            ৳{rel.price.toLocaleString()}
                          </p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Reviews & Add Review Form */}
              {activeTab === 'reviews' && (
                <div className="mt-3 space-y-3 max-h-56 overflow-y-auto pr-1">
                  {/* Write a Review Box */}
                  <form
                    onSubmit={handleReviewSubmit}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Write a Customer Review
                      </span>
                      {/* Interactive Star Picker */}
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewRating(star)}
                            className="p-0.5 hover:scale-110 transition-transform"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                star <= reviewRating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <input
                        type="text"
                        value={reviewAuthor}
                        onChange={(e) => setReviewAuthor(e.target.value)}
                        placeholder="Your Name (e.g. Tanvir Ahmed)"
                        className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                      <textarea
                        rows={2}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Share your experience with this item..."
                        className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      {reviewSuccessMsg ? (
                        <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {reviewSuccessMsg}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          Your review will help other Bangladeshi shoppers.
                        </span>
                      )}
                      <button
                        type="submit"
                        className="px-3 py-1 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        Submit
                      </button>
                    </div>
                  </form>

                  {/* Reviews List */}
                  <div className="space-y-2">
                    {productReviews.length === 0 ? (
                      <div className="text-center py-4 bg-slate-50/80 rounded-xl border border-slate-200/60 p-4 space-y-1">
                        <p className="text-xs font-semibold text-slate-700">
                          {totalReviewsCount > 0
                            ? `${totalReviewsCount} Verified Customer Rating${totalReviewsCount === 1 ? '' : 's'} (${typeof product.rating === 'number' ? product.rating.toFixed(1) : product.rating}★)`
                            : 'No customer reviews yet'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {totalReviewsCount > 0
                            ? 'Ratings have been verified. Be the first to share your feedback below!'
                            : 'Be the first to review this product!'}
                        </p>
                      </div>
                    ) : (
                      productReviews.map((r) => (
                        <div
                          key={r.id}
                          className="p-2.5 rounded-lg bg-white border border-slate-100 shadow-2xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-800">
                                {r.author}
                              </span>
                              {r.verifiedPurchase && (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                                  Verified Purchase
                                </span>
                              )}
                            </div>
                            <div className="flex items-center text-amber-400">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3 h-3 ${
                                    i < r.rating
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-slate-200'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600">{r.comment}</p>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100/60">
                            <span className="text-[10px] text-slate-400 block font-mono">
                              {r.date || (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '')}
                            </span>
                            {canDeleteReview && (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDialog({
                                    isOpen: true,
                                    title: 'Delete Customer Review?',
                                    message: `Are you sure you want to delete this review by "${r.author || r.authorName || 'Shopper'}"?`,
                                    confirmText: 'Delete Review',
                                    variant: 'danger',
                                    onConfirm: () => {
                                      deleteProductReview(r.id);
                                    },
                                  });
                                }}
                                className="px-2 py-0.5 rounded text-[10px] font-bold text-rose-600 hover:text-white hover:bg-rose-600 bg-rose-50 border border-rose-200 transition-all flex items-center gap-1 cursor-pointer"
                                title="Delete this review (Admin action)"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete Review</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Unified Confirm Modal for QuickView */}
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

        {/* Full-Screen Image Viewer Modal */}
        {isFullscreenOpen && (
          <div
            id="product-fullscreen-viewer"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsFullscreenOpen(false);
                setIsZoomed(false);
              }
            }}
            className="fixed inset-0 z-[100005] bg-black/95 backdrop-blur-md flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-200"
          >
            {/* Full-Screen Top Header Bar */}
            <div className="relative z-30 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-black/85 via-black/50 to-transparent">
              <div className="min-w-0 pr-4">
                <h3 className="text-white font-bold text-sm sm:text-base truncate drop-shadow-sm">
                  {product.title}
                </h3>
                <p className="text-slate-300 text-xs truncate flex items-center gap-1.5 mt-0.5">
                  <span>{category?.name || 'Rongdhonu Trade'}</span>
                  {imageList.length > 1 && (
                    <>
                      <span>•</span>
                      <span className="text-rose-400 font-semibold">
                        Photo {selectedImageIdx + 1} of {imageList.length}
                      </span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Watch Video from Fullscreen Button (only visible when video link is added) */}
                {hasVideo && (
                  <button
                    type="button"
                    id="fullscreen-video-play-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openProductVideo(product, 'popup');
                    }}
                    className="p-2 sm:p-2.5 rounded-full transition-all border shadow-sm cursor-pointer hover:scale-105 active:scale-95 bg-rose-600 hover:bg-rose-700 text-white border-rose-500 shadow-rose-600/30 ring-2 ring-rose-500/20 flex items-center justify-center"
                    title="Watch Product Video Demo"
                    aria-label="Play product video"
                  >
                    <Play className="w-5 h-5 fill-current text-white ml-0.5" />
                  </button>
                )}

                {/* Zoom In/Out Toggle */}
                <button
                  type="button"
                  id="fullscreen-zoom-toggle-btn"
                  onClick={() => setIsZoomed((prev) => !prev)}
                  className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/15 active:scale-95"
                  title={isZoomed ? 'Zoom Out (Normal Size)' : 'Zoom In (Magnify)'}
                  aria-label={isZoomed ? 'Zoom Out' : 'Zoom In'}
                >
                  {isZoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
                </button>

                {/* Close Fullscreen Button */}
                <button
                  type="button"
                  id="fullscreen-close-btn"
                  onClick={() => {
                    setIsFullscreenOpen(false);
                    setIsZoomed(false);
                  }}
                  className="p-2 sm:p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all cursor-pointer border border-white/25 hover:scale-105 active:scale-95"
                  title="Close Full-Screen (Esc)"
                  aria-label="Close Full-Screen"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            </div>

            {/* Fullscreen Main Image Stage */}
            <div
              className="relative flex-1 flex items-center justify-center p-3 sm:p-6 overflow-hidden"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setIsFullscreenOpen(false);
                  setIsZoomed(false);
                }
              }}
            >
              <div
                className="relative max-w-full max-h-full flex items-center justify-center overflow-auto cursor-pointer"
                onClick={() => setIsZoomed((prev) => !prev)}
              >
                <img
                  {...getResponsiveImageProps(activeImage, 'detail', { priority: true, quality: 90 })}
                  alt={`${product.title} - Full screen photo ${selectedImageIdx + 1}`}
                  className={`max-w-full max-h-[75vh] sm:max-h-[82vh] object-contain transition-transform duration-300 ease-out drop-shadow-2xl ${
                    isZoomed ? 'scale-150 sm:scale-175 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                  }`}
                />
              </div>

              {/* Prev / Next Arrows in Fullscreen */}
              {imageList.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsZoomed(false);
                      setSelectedImageIdx((prev) =>
                        prev > 0 ? prev - 1 : imageList.length - 1
                      );
                    }}
                    className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow-2xl transition-transform hover:scale-110 active:scale-95 z-30 cursor-pointer backdrop-blur-xs"
                    title="Previous photo (Left Arrow key)"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsZoomed(false);
                      setSelectedImageIdx((prev) =>
                        prev < imageList.length - 1 ? prev + 1 : 0
                      );
                    }}
                    className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow-2xl transition-transform hover:scale-110 active:scale-95 z-30 cursor-pointer backdrop-blur-xs"
                    title="Next photo (Right Arrow key)"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Fullscreen Bottom Thumbnail Strip & Controls */}
            <div className="relative z-30 px-4 py-3 sm:py-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col items-center gap-2">
              {imageList.length > 1 && (
                <div className="flex items-center gap-2 max-w-full overflow-x-auto py-1 px-2 scrollbar-none">
                  {imageList.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setIsZoomed(false);
                        setSelectedImageIdx(idx);
                      }}
                      className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                        selectedImageIdx === idx
                          ? 'border-rose-500 ring-2 ring-rose-500/50 scale-105 opacity-100 shadow-lg'
                          : 'border-white/20 opacity-50 hover:opacity-90 hover:border-white/50'
                      }`}
                      title={`Jump to photo ${idx + 1}`}
                    >
                      <img
                        src={getResponsiveImageUrl(img, 240)}
                        width={56}
                        height={56}
                        alt={`Thumbnail ${idx + 1}`}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-400 font-medium text-center">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white border border-white/20 text-[10px]">Esc</kbd> or click background to exit • Click image to zoom
              </p>
            </div>
          </div>
        )}
      </div>,
      document.body
    );
  };
