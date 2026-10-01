import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Search,
  Filter,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  Star,
  Package,
  AlertCircle,
  ExternalLink,
  Edit2,
  Layers,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { Product, Category } from '../../types';

interface FeaturedProductsManagementProps {
  products: Product[];
  categories: Category[];
  featuredProducts: Product[];
  onToggleFeatured: (
    productId: string,
    isFeatured?: boolean,
    sortOrder?: number
  ) => Promise<{ success: boolean; error?: string }>;
  hasPermission: (perm: string) => boolean;
  isSuperAdmin?: boolean;
  onOpenEditModal?: (product: Product) => void;
}

export const FeaturedProductsManagement: React.FC<FeaturedProductsManagementProps> = ({
  products,
  categories,
  featuredProducts,
  onToggleFeatured,
  hasPermission,
  isSuperAdmin = false,
  onOpenEditModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [featuredFilter, setFeaturedFilter] = useState<'all' | 'not_featured' | 'featured'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canUpdate = hasPermission('product.update');

  // Currently Featured Products sorted deterministically by featuredSortOrder ASC, createdAt DESC
  const sortedFeaturedList = useMemo(() => {
    // Gather all products marked as featured
    const feat = products.filter((p) => Boolean(p.featured));
    return [...feat].sort((a, b) => {
      const orderA = a.featuredSortOrder || 0;
      const orderB = b.featuredSortOrder || 0;
      if (orderA > 0 && orderB > 0) return orderA - orderB;
      if (orderA > 0) return -1;
      if (orderB > 0) return 1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }, [products]);

  // Catalog search across ALL categories
  const filteredCatalog = useMemo(() => {
    let list = [...products];

    // Filter by Category
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.categoryId === selectedCategory);
    }

    // Filter by Featured Status
    if (featuredFilter === 'not_featured') {
      list = list.filter((p) => !p.featured);
    } else if (featuredFilter === 'featured') {
      list = list.filter((p) => Boolean(p.featured));
    }

    // Search query across ALL categories: Product Name, SKU, ID, Description
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      const tokens = term.split(/\s+/).filter(Boolean);
      list = list.filter((p) => {
        const title = (p.title || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const id = (p.id || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const cat = categories.find((c) => c.id === p.categoryId)?.name.toLowerCase() || '';
        return tokens.every(
          (t) =>
            title.includes(t) ||
            sku.includes(t) ||
            id.includes(t) ||
            desc.includes(t) ||
            cat.includes(t)
        );
      });
    }

    return list;
  }, [products, categories, selectedCategory, featuredFilter, searchTerm]);

  // Handler to add or remove product from Featured
  const handleToggleFeatured = async (product: Product, targetStatus: boolean) => {
    if (!canUpdate) {
      setFeedbackNotice({ type: 'error', message: 'Permission required: product.update' });
      return;
    }
    setActionLoadingId(product.id);
    setFeedbackNotice(null);

    // If adding, calculate next sort order at end of list
    const nextOrder = targetStatus ? sortedFeaturedList.length + 1 : 0;
    const res = await onToggleFeatured(product.id, targetStatus, nextOrder);
    setActionLoadingId(null);

    if (res.success) {
      setFeedbackNotice({
        type: 'success',
        message: targetStatus
          ? `"${product.title}" added to Featured Products! It will appear on the homepage.`
          : `"${product.title}" removed from Featured Products. Product kept intact in D1.`,
      });
      setTimeout(() => setFeedbackNotice(null), 4000);
    } else {
      setFeedbackNotice({
        type: 'error',
        message: res.error || 'Failed to update featured status in D1.',
      });
    }
  };

  // Handler to adjust display order
  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    if (!canUpdate) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedFeaturedList.length) return;

    const currentItem = sortedFeaturedList[index];
    const targetItem = sortedFeaturedList[targetIndex];

    setActionLoadingId(currentItem.id);
    // Swap sort orders
    const currentOrder = currentItem.featuredSortOrder || (index + 1);
    const targetOrder = targetItem.featuredSortOrder || (targetIndex + 1);

    await onToggleFeatured(currentItem.id, true, targetOrder);
    await onToggleFeatured(targetItem.id, true, currentOrder);
    setActionLoadingId(null);

    setFeedbackNotice({
      type: 'success',
      message: `Updated display order for "${currentItem.title}".`,
    });
    setTimeout(() => setFeedbackNotice(null), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Description */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white p-5 sm:p-6 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <Sparkles className="w-5 h-5" />
              </span>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-white">
                Featured Products Management
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Curate top products to showcase on the homepage. Any existing product across{' '}
              <strong className="text-white">any category</strong> (Watches, Earbuds, Power Banks, Chargers, etc.) can be featured.
              Featured status is an independent property and{' '}
              <strong className="text-rose-400">never changes the product's original category or price</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Active Featured
              </span>
              <span className="text-xl font-extrabold font-display text-rose-400">
                {sortedFeaturedList.length}
              </span>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Total Products
              </span>
              <span className="text-xl font-extrabold font-display text-slate-200">
                {products.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Feedback Notice */}
      {feedbackNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 animate-in fade-in transition-all ${
            feedbackNotice.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
              : 'bg-rose-50 text-rose-900 border border-rose-300'
          }`}
        >
          {feedbackNotice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedbackNotice.message}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 1: CURRENT ACTIVE FEATURED PRODUCTS (Display Order)   */}
      {/* ============================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200/80 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
              <span>Active Featured Products ({sortedFeaturedList.length})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              These products appear in the homepage Featured section. Use the re-order arrows to adjust display priority.
            </p>
          </div>

          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 self-start sm:self-auto">
            Homepage Limit: First 8 items
          </span>
        </div>

        {sortedFeaturedList.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm text-slate-800">No Featured Products Selected Yet</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Search the catalog below across any category and click <strong>"Add to Featured"</strong> to feature items on the homepage.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 w-16 text-center">Order</th>
                  <th className="py-3 px-3">Product</th>
                  <th className="py-3 px-3">Original Category</th>
                  <th className="py-3 px-3">Price</th>
                  <th className="py-3 px-3">Stock</th>
                  <th className="py-3 px-3 text-center">Display Priority</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedFeaturedList.map((product, idx) => {
                  const cat = categories.find((c) => c.id === product.categoryId);
                  const isTop8 = idx < 8;
                  const isLoadingThis = actionLoadingId === product.id;

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isTop8 ? 'bg-white' : 'bg-slate-50/40 opacity-75'
                      }`}
                    >
                      {/* Order Index */}
                      <td className="py-3 px-3 text-center font-bold">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                            idx === 0
                              ? 'bg-amber-100 text-amber-800 font-extrabold ring-1 ring-amber-300'
                              : isTop8
                              ? 'bg-slate-100 text-slate-800 font-bold'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                      </td>

                      {/* Product Thumbnail & Title */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            className="w-11 h-11 rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate hover:text-rose-600">
                              {product.title}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                              {product.sku && <span>SKU: {product.sku}</span>}
                              {isTop8 && (
                                <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                                  Live on Homepage
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Original Category */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {cat ? cat.name : 'Unknown Category'}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-3 px-3 whitespace-nowrap font-bold text-slate-900 font-display">
                        ৳{product.price.toLocaleString()}
                      </td>

                      {/* Stock */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            product.stock === 0
                              ? 'bg-rose-100 text-rose-700'
                              : product.stock <= 5
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {product.stock === 0 ? 'Out of Stock' : `${product.stock} in stock`}
                        </span>
                      </td>

                      {/* Move Up / Move Down Re-order Buttons */}
                      <td className="py-3 px-3 whitespace-nowrap text-center">
                        {canUpdate ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveOrder(idx, 'up')}
                              disabled={idx === 0 || isLoadingThis}
                              className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors"
                              title="Move up in display order"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveOrder(idx, 'down')}
                              disabled={idx === sortedFeaturedList.length - 1 || isLoadingThis}
                              className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors"
                              title="Move down in display order"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Locked</span>
                        )}
                      </td>

                      {/* Action: Remove from Featured (Does NOT delete product!) */}
                      <td className="py-3 px-3 whitespace-nowrap text-right">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => handleToggleFeatured(product, false)}
                            disabled={isLoadingThis}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Remove featured status (keeps product in catalog)"
                          >
                            {isLoadingThis ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            )}
                            <span>Remove from Featured</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* SECTION 2: SEARCH & ADD FEATURED (Across ALL Categories)       */}
      {/* ============================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 flex items-center gap-2">
            <Search className="w-4 h-4 text-rose-500" />
            <span>Search & Add Products to Featured</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Search across <strong>ALL categories</strong> by product name, SKU, or ID. Any product from any category can become Featured.
          </p>
        </div>

        {/* Search & Category Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
          {/* Search Input across all categories */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search across ALL categories by name, SKU (e.g. EP-06), or ID..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
            />
          </div>

          {/* Category Filter Dropdown */}
          <div className="sm:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Featured Status Filter */}
          <div className="sm:col-span-3">
            <select
              value={featuredFilter}
              onChange={(e) => setFeaturedFilter(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer"
            >
              <option value="all">All Items ({products.length})</option>
              <option value="not_featured">Not Yet Featured</option>
              <option value="featured">Currently Featured ({sortedFeaturedList.length})</option>
            </select>
          </div>
        </div>

        {/* Filter Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 flex-wrap gap-2">
          <span>
            Found <strong>{filteredCatalog.length}</strong> matching products across all categories
          </span>
          {(searchTerm || selectedCategory !== 'all' || featuredFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('all');
                setFeaturedFilter('all');
              }}
              className="text-rose-600 font-bold hover:underline cursor-pointer"
            >
              Clear Search & Filters
            </button>
          )}
        </div>

        {/* Search Results Grid */}
        {filteredCatalog.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <Package className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-bold text-slate-700">No products match your search</p>
            <p className="text-[11px] text-slate-500">
              Try a different keyword or select "All Categories".
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pt-2">
            {filteredCatalog.map((product) => {
              const cat = categories.find((c) => c.id === product.categoryId);
              const isFeat = Boolean(product.featured);
              const isLoadingThis = actionLoadingId === product.id;

              return (
                <div
                  key={product.id}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isFeat
                      ? 'bg-rose-50/30 border-rose-200 ring-1 ring-rose-300/40 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Thumbnail & Badges */}
                    <div className="relative aspect-video w-full rounded-xl bg-slate-100 overflow-hidden border border-slate-200/70">
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover"
                      />
                      {isFeat ? (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-extrabold text-white bg-rose-600 shadow-xs flex items-center gap-1">
                          <Star className="w-3 h-3 fill-white" />
                          Featured
                        </span>
                      ) : (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-600 bg-white/90 backdrop-blur-xs border border-slate-200">
                          Not Featured
                        </span>
                      )}
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold text-white bg-slate-900/80">
                        Stock: {product.stock}
                      </span>
                    </div>

                    {/* Product Details */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider truncate">
                          {cat ? cat.name : 'Category'}
                        </span>
                        {product.sku && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {product.sku}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-xs text-slate-900 mt-1 line-clamp-1" title={product.title}>
                        {product.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        {product.description}
                      </p>
                      <div className="flex items-baseline gap-2 mt-1.5">
                        <span className="font-display font-extrabold text-sm text-slate-900">
                          ৳{product.price.toLocaleString()}
                        </span>
                        {product.originalPrice && (
                          <span className="text-[11px] text-slate-400 line-through">
                            ৳{product.originalPrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Add to Featured / Remove from Featured Action Button */}
                  <div className="pt-3 mt-3 border-t border-slate-100">
                    {canUpdate ? (
                      isFeat ? (
                        <button
                          type="button"
                          onClick={() => handleToggleFeatured(product, false)}
                          disabled={isLoadingThis}
                          className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isLoadingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          <span>Remove from Featured</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleFeatured(product, true)}
                          disabled={isLoadingThis}
                          className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-xs hover:shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isLoadingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                          )}
                          <span>Add to Featured</span>
                        </button>
                      )
                    ) : (
                      <span className="text-slate-400 text-xs text-center block">
                        Permission required
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
