import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Sparkles } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { getResponsiveImageProps, getResponsiveImageUrl } from '../utils/responsiveImage';

export const HeroCarousel: React.FC = () => {
  const { navigateToCategory, slides, settings } = useStore();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Touch tracking for mobile/tablet swipe navigation
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);

  const activeSlides = (Array.isArray(slides) ? slides : []).filter(
    (s) => s.isActive !== false && (s as any).is_active !== 0 && (s as any).status !== 'inactive'
  );

  // Authoritative master aspect ratio: Desktop 1200:480 (5:2 = 2.5:1)
  // Strictly identical across ALL screen sizes (mobile, tablet, laptop, desktop, ultra-wide)
  const masterRatio = settings?.sliderAspectRatio || '1200 / 480';
  const fitMode = settings?.bannerFitMode || 'contain';

  useEffect(() => {
    if (activeSlides.length > 0 && currentSlide >= activeSlides.length) {
      setCurrentSlide(0);
    }
  }, [activeSlides.length, currentSlide]);

  useEffect(() => {
    if (isPaused || activeSlides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % activeSlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused, activeSlides.length]);

  if (activeSlides.length === 0) {
    if (settings?.bannerUrl) {
      const singleBannerProps = getResponsiveImageProps(settings.bannerUrl, 'banner', { priority: true });
      return (
        <div
          id="hero-banner-slider"
          className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl bg-slate-950 text-white shadow-xl mt-4 select-none"
          style={{ aspectRatio: masterRatio }}
        >
          <div className="relative w-full h-full overflow-hidden">
            {fitMode !== 'cover' && (
              <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-gradient-to-r from-slate-950 via-slate-900/60 to-slate-950" />
            )}
            <div className="absolute inset-0 z-0 flex items-center justify-center">
              <img
                {...singleBannerProps}
                alt={settings.siteName || 'Rongdhonu Trade'}
                className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'} object-center`}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1400&q=80';
                }}
              />
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const slide = activeSlides[currentSlide] || activeSlides[0];
  const currentBannerUrl = (currentSlide === 0 && settings?.bannerUrl) ? settings.bannerUrl : slide.imageUrl;
  const hasText = Boolean(slide.headline?.trim() || slide.title?.trim());
  const bannerImageProps = getResponsiveImageProps(currentBannerUrl, 'banner', { priority: currentSlide === 0 });

  const handleShopNow = (catId?: string) => {
    if (catId) {
      navigateToCategory(catId);
    } else {
      const feed = document.getElementById('products-feed-section');
      if (feed) {
        feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (activeSlides.length <= 1) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (
      touchStartX.current === null ||
      touchStartY.current === null ||
      touchEndX.current === null ||
      touchEndY.current === null ||
      activeSlides.length <= 1
    ) {
      touchStartX.current = null;
      touchStartY.current = null;
      touchEndX.current = null;
      touchEndY.current = null;
      return;
    }

    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = touchStartY.current - touchEndY.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Minimum distance required for a swipe gesture to prevent accidental taps triggering navigation
    const minSwipeDistance = 40;

    // Only navigate if horizontal movement clearly exceeds vertical movement (preserves standard page scrolling)
    if (absX >= minSwipeDistance && absX > absY * 1.5) {
      if (deltaX > 0) {
        // Swipe right-to-left -> Next slide
        setCurrentSlide((prev) => (prev + 1) % activeSlides.length);
      } else {
        // Swipe left-to-right -> Previous slide
        setCurrentSlide((prev) => (prev - 1 + activeSlides.length) % activeSlides.length);
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;
  };

  const handleTouchCancel = () => {
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;
  };

  return (
    <div
      id="hero-banner-slider"
      className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl bg-slate-950 text-white shadow-xl mt-4 select-none group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      style={{
        // Authoritative master aspect ratio: width: 100%, height calculated automatically
        aspectRatio: masterRatio,
      }}
    >
      {/* Slide Container (Guaranteed 100% width and 100% height from parent fixed aspect ratio) */}
      <div className="relative w-full h-full overflow-hidden">
        {/* Ambient Subtle Backdrop: Pure CSS gradient replaces heavy duplicate <img> tag, eliminating secondary decoding and GPU blur filter overhead */}
        {fitMode !== 'cover' && (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-gradient-to-r from-slate-950 via-slate-900/60 to-slate-950" />
        )}

        {/* Authoritative Banner Image: Zero stretching, zero distortion, zero forced cropping (LCP prioritized) */}
        <div className="absolute inset-0 z-0 flex items-center justify-center">
          <img
            {...bannerImageProps}
            alt={slide.headline || slide.title || 'Promotional Banner'}
            className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'} object-center transition-opacity duration-300`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = slide.imageUrl || 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1400&q=80';
            }}
          />
        </div>

        {/* Vignette Gradient Overlay: Enhances text legibility when overlay headlines are present */}
        {hasText && (
          <div className="absolute inset-0 z-[1] bg-gradient-to-r from-slate-950/85 via-slate-950/45 to-transparent pointer-events-none" />
        )}

        {/* Slide Content Overlay: Scaled gracefully across all viewports to fit perfectly inside fixed ratio */}
        {hasText && (
          <div
            onClick={() => handleShopNow(slide.categoryId)}
            className="relative z-10 w-full h-full px-3.5 sm:px-8 md:px-12 lg:px-16 flex flex-col justify-center max-w-3xl cursor-pointer"
          >
            {/* Promo Badges */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2 md:mb-3">
              {slide.tag && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-xs font-bold bg-slate-900/90 text-white border border-slate-700/80 shadow-xs">
                  <Sparkles className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-amber-400 fill-amber-400" />
                  <span>{slide.tag}</span>
                </span>
              )}
              {slide.discountBadge && (
                <span className="inline-block px-2 py-0.5 rounded-full text-[9px] sm:text-xs font-extrabold bg-amber-400 text-slate-950 shadow-xs">
                  {slide.discountBadge}
                </span>
              )}
            </div>

            {/* Headline: Responsive typography strictly prevents vertical overflow at any aspect-ratio scale */}
            <h2 className="text-xs sm:text-xl md:text-3xl lg:text-4xl font-extrabold font-display tracking-tight text-white leading-tight drop-shadow-sm line-clamp-1 sm:line-clamp-2">
              {slide.headline}
            </h2>

            {/* Subtext: Shown on tablets and desktops */}
            {slide.subtext && (
              <p className="hidden sm:block mt-1 sm:mt-2 md:mt-3 text-[11px] sm:text-xs md:text-sm lg:text-base text-slate-200 line-clamp-1 md:line-clamp-2 leading-relaxed max-w-xl drop-shadow-sm">
                {slide.subtext}
              </p>
            )}

            {/* CTA Buttons */}
            <div className="mt-2 sm:mt-4 md:mt-6 flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                id={`hero-cta-btn-${slide.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleShopNow(slide.categoryId);
                }}
                className="px-2.5 py-1 sm:px-5 sm:py-2.5 rounded-lg sm:rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-[10px] sm:text-xs md:text-sm flex items-center gap-1 sm:gap-1.5 shadow-md hover:shadow-lg active:scale-95 transition-all"
              >
                <span>{slide.buttonText || 'Shop Collection'}</span>
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const feed = document.getElementById('products-feed-section');
                  if (feed) feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="hidden sm:inline-flex px-3 sm:px-4 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl bg-black/40 hover:bg-black/60 text-white font-semibold text-xs backdrop-blur-md border border-white/20 transition-colors"
              >
                Explore All
              </button>
            </div>
          </div>
        )}

        {/* Left / Right Carousel Navigation Arrows */}
        {activeSlides.length > 1 && (
          <>
            <button
              type="button"
              id="hero-prev-btn"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentSlide((prev) => (prev - 1 + activeSlides.length) % activeSlides.length);
              }}
              className="hidden lg:flex absolute left-1.5 sm:left-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-full bg-slate-950/60 hover:bg-slate-950 text-white border border-white/20 items-center justify-center backdrop-blur-md transition-all shadow-md"
              aria-label="Previous Slide"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
            </button>

            <button
              type="button"
              id="hero-next-btn"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentSlide((prev) => (prev + 1) % activeSlides.length);
              }}
              className="hidden lg:flex absolute right-1.5 sm:right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-full bg-slate-950/60 hover:bg-slate-950 text-white border border-white/20 items-center justify-center backdrop-blur-md transition-all shadow-md"
              aria-label="Next Slide"
            >
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
            </button>
          </>
        )}

        {/* Slide Indicators / Dots */}
        {activeSlides.length > 1 && (
          <div className="absolute bottom-1.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 sm:gap-2 bg-slate-950/60 backdrop-blur-md px-2 sm:px-3 py-1 rounded-full border border-white/10 shadow-sm scale-85 sm:scale-100">
            {activeSlides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentSlide(idx);
                }}
                className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                  currentSlide === idx
                    ? 'w-4 sm:w-6 bg-white shadow-xs'
                    : 'w-1.5 sm:w-2 bg-white/40 hover:bg-white/70'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
