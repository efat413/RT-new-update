import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Product } from '../types';
import { ProductCard } from './ProductCard';

interface FeaturedProductsCarouselProps {
  products: Product[];
  onViewAll: () => void;
}

export const FeaturedProductsCarousel: React.FC<FeaturedProductsCarouselProps> = ({
  products,
  onViewAll,
}) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  // Mobile touch swipe handling
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  // Responsive desktop detection (desktop shows 3, mobile shows 2)
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const visibleCount = isDesktop ? 3 : 2;
  const totalItems = products.length;

  // Auto-slide every 4.5 seconds (cycles through already-loaded products, NO API requests)
  useEffect(() => {
    if (isPaused || totalItems <= visibleCount) return;

    const interval = setInterval(() => {
      setStartIndex((prev) => (prev + 1) % totalItems);
    }, 4500);

    return () => clearInterval(interval);
  }, [isPaused, totalItems, visibleCount]);

  if (!products || products.length === 0) {
    return null;
  }

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStartIndex((prev) => (prev - 1 + totalItems) % totalItems);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStartIndex((prev) => (prev + 1) % totalItems);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartXRef.current = e.touches[0].clientX;
    touchEndXRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    setIsPaused(false);
    if (touchStartXRef.current !== null && touchEndXRef.current !== null) {
      const distance = touchStartXRef.current - touchEndXRef.current;
      if (distance > 45) {
        handleNext();
      } else if (distance < -45) {
        handlePrev();
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  // Sliding window of visible products recycled from the limited dataset
  const visibleProducts: Product[] = [];
  const countToDisplay = Math.min(visibleCount, totalItems);
  for (let i = 0; i < countToDisplay; i++) {
    const itemIndex = (startIndex + i) % totalItems;
    visibleProducts.push(products[itemIndex]);
  }

  return (
    <section
      ref={sectionRef}
      id="featured-products-section"
      className="py-6 sm:py-8 border-b border-slate-200/80 last:border-b-0 min-h-[380px]"
      aria-label="Featured Products carousel"
    >
      {/* Featured Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4 sm:mb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 fill-rose-500 text-rose-500" />
            </div>
            <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight flex items-center gap-2">
              <span>Featured Products</span>
              <span className="text-xs font-medium text-slate-400 font-sans hidden sm:inline">
                | বিশেষ পছন্দ
              </span>
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
              {totalItems} items
            </span>
          </div>
        </div>

        {/* Action Controls: Previous / Next Chevrons + "View All →" Link */}
        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
          {totalItems > visibleCount && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrev}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer"
                aria-label="Previous featured product"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer"
                aria-label="Next featured product"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-600 text-white font-bold text-xs shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <span>View All Featured</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Recycled Products Carousel viewport */}
      <div
        className="relative overflow-hidden"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`grid gap-3 sm:gap-5 transition-all duration-300 ${
            isDesktop ? 'grid-cols-3' : 'grid-cols-2'
          }`}
        >
          {visibleProducts.map((product, idx) => (
            <div key={`${product.id}-${idx}`} className="w-full">
              <ProductCard product={product} priority={idx === 0} />
            </div>
          ))}
        </div>
      </div>

      {/* Carousel dot indicators */}
      {totalItems > visibleCount && (
        <div className="flex items-center justify-center gap-1.5 mt-4 pt-2">
          {Array.from({ length: totalItems }).map((_, dotIdx) => (
            <button
              key={dotIdx}
              type="button"
              onClick={() => setStartIndex(dotIdx)}
              className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                dotIdx === startIndex
                  ? 'w-6 bg-rose-500'
                  : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
              aria-label={`Jump to featured product position ${dotIdx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
