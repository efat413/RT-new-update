import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Tag,
  Share2,
  Package,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { Category, Product } from '../types';
import { ProductCard } from './ProductCard';

interface CategoryListingViewProps {
  category: Category | null;
  categories: Category[];
  searchQuery?: string;
  products: Product[];
  isLoading: boolean;
  totalProducts: number;
  currentPage: number;
  totalPages: number;
  limit: number;
  sortBy: 'featured' | 'price-asc' | 'price-desc' | 'rating';
  onPageChange: (newPage: number) => void;
  onSortChange: (newSort: 'featured' | 'price-asc' | 'price-desc' | 'rating') => void;
  onCategoryChange: (categoryId: string | null) => void;
  onBackToHome: () => void;
  onShareCategory?: (categoryId: string) => void;
  siteName?: string;
  isFeaturedListing?: boolean;
}

export const CategoryListingView: React.FC<CategoryListingViewProps> = ({
  category,
  categories,
  searchQuery,
  products,
  isLoading,
  totalProducts,
  currentPage,
  totalPages,
  limit,
  sortBy,
  onPageChange,
  onSortChange,
  onCategoryChange,
  onBackToHome,
  onShareCategory,
  siteName = 'Rongdhonu Trade',
  isFeaturedListing = false,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handlePageSelect = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    onPageChange(page);
    // Smooth scroll to top of product list
    if (containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const startItem = totalProducts === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, totalProducts);

  // Generate pagination items with ellipses if many pages
  const getPaginationPages = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    pages.push(1);
    if (currentPage > 3) {
      pages.push('...');
    }
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) {
      pages.push('...');
    }
    pages.push(totalPages);
    return pages;
  };

  return (
    <div ref={containerRef} className="pt-4 pb-12">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
        <button
          type="button"
          onClick={onBackToHome}
          className="underline decoration-slate-300 underline-offset-4 hover:decoration-rose-500 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:ring-offset-1 rounded-xs transition-colors cursor-pointer font-medium flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" />
          <span>Home</span>
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-bold" aria-current="page">
          {searchQuery
            ? `Search: "${searchQuery}"`
            : isFeaturedListing
            ? 'Featured Products'
            : category
            ? category.name
            : 'All Products'}
        </span>
      </nav>

      {/* Header Banner & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 mb-6">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              {searchQuery
                ? `Search: "${searchQuery}"`
                : isFeaturedListing
                ? 'Featured Products'
                : category
                ? category.name
                : 'All Products'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-700 font-mono">
              {totalProducts} {totalProducts === 1 ? 'item' : 'items'}
            </span>
            {category && onShareCategory && (
              <button
                type="button"
                onClick={() => onShareCategory(category.id)}
                className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Copy direct category URL for social posting"
              >
                <Share2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Share Category URL</span>
              </button>
            )}
          </div>

          {isFeaturedListing ? (
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 max-w-2xl leading-relaxed">
              Explore our curated collection of featured top-selling and trending products across Bangladesh with nationwide cash on delivery.
            </p>
          ) : category?.description ? (
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 max-w-2xl leading-relaxed">
              {category.description}
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-1">
              Browse authentic items with nationwide cash on delivery from {siteName}.
            </p>
          )}

          {totalProducts > 0 && (
            <p className="text-xs font-medium text-slate-400 mt-1">
              Showing {startItem}–{endItem} of {totalProducts} products (Page {currentPage} of {totalPages})
            </p>
          )}
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          {/* Category Dropdown */}
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-400 shrink-0" />
            <label htmlFor="category-page-select" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
              Category:
            </label>
            <select
              id="category-page-select"
              value={category?.id || ''}
              onChange={(e) => onCategoryChange(e.target.value ? e.target.value : null)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-2xs cursor-pointer hover:border-slate-400 transition-colors"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
            <label htmlFor="category-sort-select" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
              Sort By:
            </label>
            <select
              id="category-sort-select"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as any)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-2xs cursor-pointer hover:border-slate-400 transition-colors"
            >
              <option value="featured">Featured First</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="rating">Top Customer Rated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content: Loading State, Empty State, or Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 space-y-3 shadow-xs overflow-hidden"
            >
              <div className="w-full aspect-square rounded-xl bg-slate-100 animate-pulse" />
              <div className="h-3 w-16 rounded-full bg-slate-100 animate-pulse" />
              <div className="h-4 w-4/5 rounded bg-slate-100 animate-pulse" />
              <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
              <div className="h-8 w-full rounded-xl bg-slate-100 animate-pulse" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="py-20 text-center space-y-4 bg-white rounded-3xl border border-slate-200 shadow-xs">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-slate-800 text-lg">No Products Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? `We couldn't find any products matching "${searchQuery}". Try different keywords or reset filters.`
              : 'There are currently no products in this category. Browse our other categories.'}
          </p>
          <button
            type="button"
            onClick={onBackToHome}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
          >
            Back to Homepage
          </button>
        </div>
      ) : (
        <>
          {/* Products Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {products.map((product, idx) => (
              <ProductCard key={product.id} product={product} priority={idx < 2} />
            ))}
          </div>

          {/* Server-Side Pagination Bar */}
          {totalPages > 1 && (
            <div className="mt-10 pt-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs font-medium text-slate-500">
                Page <span className="font-bold text-slate-900">{currentPage}</span> of{' '}
                <span className="font-bold text-slate-900">{totalPages}</span> ({totalProducts} total products)
              </div>

              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                {/* Previous Button */}
                <button
                  type="button"
                  onClick={() => handlePageSelect(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>

                {/* Page Number Buttons */}
                {getPaginationPages().map((p, idx) => {
                  if (typeof p === 'string') {
                    return (
                      <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 font-bold text-xs">
                        ...
                      </span>
                    );
                  }
                  const isCurrent = p === currentPage;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePageSelect(p)}
                      disabled={isLoading}
                      className={`min-w-9 h-9 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-rose-600 text-white shadow-md'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                      aria-current={isCurrent ? 'page' : undefined}
                    >
                      {p}
                    </button>
                  );
                })}

                {/* Next Button */}
                <button
                  type="button"
                  onClick={() => handlePageSelect(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                  aria-label="Next page"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
