import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowDownUp,
  Search,
  Filter,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  RotateCcw,
  Check,
  Star,
  Package,
  AlertCircle,
  FolderTree,
  Eye,
  CheckCircle2,
  Save,
  Clock,
  Sparkles,
  Layers,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { Product, Category } from '../../types';

interface CategoryProductSequenceManagementProps {
  products: Product[];
  categories: Category[];
  initialCategoryId?: string;
  onSaveSequence: (
    categoryId: string,
    productOrders: Array<{ id: string; displayOrder: number }>
  ) => Promise<{ success: boolean; error?: string }>;
  hasPermission: (perm: string) => boolean;
  onOpenEditModal?: (product: Product) => void;
}

export const CategoryProductSequenceManagement: React.FC<CategoryProductSequenceManagementProps> = ({
  products,
  categories,
  initialCategoryId,
  onSaveSequence,
  hasPermission,
  onOpenEditModal,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => {
    if (initialCategoryId && categories.some((c) => c.id === initialCategoryId)) {
      return initialCategoryId;
    }
    return categories[0]?.id || '';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Local working list for the selected category so user can reorder smoothly before saving
  const [orderedProducts, setOrderedProducts] = useState<Product[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // When selectedCategoryId changes or products change from upstream (if no local unsaved edits), initialize orderedProducts
  useEffect(() => {
    if (!selectedCategoryId) return;

    const catProds = products.filter((p) => p.categoryId === selectedCategoryId);
    // Sort deterministically:
    // If displayOrder > 0, use displayOrder ASC, else fallback to createdAt DESC
    const sorted = [...catProds].sort((a, b) => {
      const orderA = Number(a.displayOrder ?? a.display_order) || 0;
      const orderB = Number(b.displayOrder ?? b.display_order) || 0;
      if (orderA > 0 && orderB > 0) return orderA - orderB;
      if (orderA > 0) return -1;
      if (orderB > 0) return 1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    setOrderedProducts(sorted);
    setHasUnsavedChanges(false);
  }, [selectedCategoryId, products]);

  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === selectedCategoryId) || null;
  }, [categories, selectedCategoryId]);

  const canUpdate = hasPermission('product.update') || hasPermission('canManageCategories');

  // Filtered view when user searches within the category
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return orderedProducts;
    const term = searchTerm.trim().toLowerCase();
    return orderedProducts.filter((p) =>
      (p.title || '').toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term) ||
      (p.id || '').toLowerCase().includes(term)
    );
  }, [orderedProducts, searchTerm]);

  // Movement helpers
  const moveProduct = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= orderedProducts.length) return;
    if (toIndex < 0 || toIndex >= orderedProducts.length) return;
    if (fromIndex === toIndex) return;

    const updated = [...orderedProducts];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    setOrderedProducts(updated);
    setHasUnsavedChanges(true);
  };

  const moveToFront = (index: number) => {
    moveProduct(index, 0);
  };

  const moveToBack = (index: number) => {
    moveProduct(index, orderedProducts.length - 1);
  };

  const handleDisplayOrderChange = (productId: string, newOrderRaw: number) => {
    const newOrder = Math.max(1, Math.min(orderedProducts.length, newOrderRaw));
    const currentIndex = orderedProducts.findIndex((p) => p.id === productId);
    if (currentIndex === -1) return;

    const targetIndex = newOrder - 1;
    moveProduct(currentIndex, targetIndex);
  };

  // Quick Preset Sorters
  const applyPresetSort = (type: 'oldest' | 'newest' | 'alpha' | 'price_asc' | 'price_desc') => {
    const list = [...orderedProducts];
    if (type === 'oldest') {
      // Oldest added first (ascending createdAt)
      list.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    } else if (type === 'newest') {
      // Newest added first (descending createdAt)
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } else if (type === 'alpha') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (type === 'price_asc') {
      list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (type === 'price_desc') {
      list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    }

    setOrderedProducts(list);
    setHasUnsavedChanges(true);
  };

  const handleResetToSaved = () => {
    const catProds = products.filter((p) => p.categoryId === selectedCategoryId);
    const sorted = [...catProds].sort((a, b) => {
      const orderA = Number(a.displayOrder ?? a.display_order) || 0;
      const orderB = Number(b.displayOrder ?? b.display_order) || 0;
      if (orderA > 0 && orderB > 0) return orderA - orderB;
      if (orderA > 0) return -1;
      if (orderB > 0) return 1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    setOrderedProducts(sorted);
    setHasUnsavedChanges(false);
  };

  const handleSave = async () => {
    if (!selectedCategoryId || orderedProducts.length === 0) return;
    setIsSaving(true);
    setFeedbackNotice(null);

    // Map each product to its explicit 1-indexed display order
    const payload = orderedProducts.map((p, idx) => ({
      id: p.id,
      displayOrder: idx + 1,
    }));

    const result = await onSaveSequence(selectedCategoryId, payload);
    setIsSaving(false);

    if (result.success) {
      setHasUnsavedChanges(false);
      setFeedbackNotice({
        type: 'success',
        message: `Custom product order for "${selectedCategory?.name || 'Category'}" successfully saved and updated on the homepage!`,
      });
      setTimeout(() => setFeedbackNotice(null), 5000);
    } else {
      setFeedbackNotice({
        type: 'error',
        message: result.error || 'Failed to save category product order. Please try again.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-indigo-900/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30">
              <ArrowDownUp className="w-3.5 h-3.5" />
              <span>Homepage Display Sequencing</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-display tracking-tight text-white flex items-center gap-2">
              Category Product Sequence Manager
            </h2>
            <p className="text-xs sm:text-sm text-indigo-200/80 max-w-2xl leading-relaxed">
              Customize the exact sequence in which products appear under each category on your homepage.
              The first <strong>6 products</strong> will appear directly in the category homepage carousel.
              Move older or newer products to the front with a single click.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                showPreview
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>{showPreview ? 'Hide Homepage Preview' : 'Preview Carousel'}</span>
            </button>

            <button
              type="button"
              id="save-category-sequence-btn"
              onClick={handleSave}
              disabled={isSaving || !canUpdate || (!hasUnsavedChanges && orderedProducts.every((p, i) => (p.displayOrder || 0) === i + 1))}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg ${
                hasUnsavedChanges
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 ring-2 ring-emerald-400'
                  : 'bg-white/15 hover:bg-white/25 text-white/90 border border-white/20'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save Sequence' : 'Saved'}</span>
            </button>
          </div>
        </div>

        {/* Feedback alert */}
        {feedbackNotice && (
          <div
            className={`mt-4 p-3.5 rounded-2xl flex items-center gap-3 text-xs font-semibold ${
              feedbackNotice.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-200 border border-rose-500/30'
            }`}
          >
            {feedbackNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{feedbackNotice.message}</span>
          </div>
        )}
      </div>

      {/* Category Selection Tabs / Filter Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Select Category to Customize:
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products in this category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Category Horizontal Scroll Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
          {categories.map((cat) => {
            const count = products.filter((p) => p.categoryId === cat.id).length;
            const isSelected = cat.id === selectedCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  if (hasUnsavedChanges) {
                    if (!confirm('You have unsaved changes in this category. Discard and switch?')) {
                      return;
                    }
                  }
                  setSelectedCategoryId(cat.id);
                  setSearchTerm('');
                }}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/60'
                }`}
              >
                <span>{cat.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                    isSelected ? 'bg-indigo-800 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Sort Presets & Status Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Quick Presets:
          </span>

          <button
            type="button"
            onClick={() => applyPresetSort('oldest')}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Display the products added earlier first at the front"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Oldest Added First (Put Early Products in Front)</span>
          </button>

          <button
            type="button"
            onClick={() => applyPresetSort('newest')}
            className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Sort with newly added products first"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-500" />
            <span>Newest Added First</span>
          </button>

          <button
            type="button"
            onClick={() => applyPresetSort('alpha')}
            className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>A to Z</span>
          </button>

          <button
            type="button"
            onClick={() => applyPresetSort('price_asc')}
            className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>Price: Low to High</span>
          </button>

          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={handleResetToSaved}
              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Discard unsaved changes and reset to current saved order"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Unsaved</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200 animate-pulse">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              Unsaved Changes
            </span>
          )}

          <span className="text-xs font-medium text-slate-500">
            Total in Category: <strong>{orderedProducts.length}</strong> products
          </span>
        </div>
      </div>

      {/* Live Homepage Carousel Preview (Collapsible) */}
      {showPreview && (
        <div className="bg-slate-900 rounded-3xl p-5 text-white border border-slate-800 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  Storefront Homepage Carousel Preview: {selectedCategory?.name}
                </h4>
                <p className="text-[11px] text-slate-400">
                  This preview shows the 6 items that will appear on the homepage in this exact left-to-right order.
                </p>
              </div>
            </div>

            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
              Live Preview
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2">
            {orderedProducts.slice(0, 6).map((prod, slotIdx) => (
              <div
                key={prod.id}
                className="bg-slate-800/90 rounded-2xl p-2.5 border border-slate-700 flex flex-col justify-between space-y-2 relative group overflow-hidden"
              >
                <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-indigo-600 text-white font-mono font-black text-[10px] shadow-md">
                  #{slotIdx + 1}
                </div>
                <div className="aspect-square rounded-xl bg-slate-950 overflow-hidden relative">
                  <img
                    src={prod.imageUrl}
                    alt={prod.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div>
                  <h5 className="text-[11px] font-bold text-slate-200 line-clamp-1">{prod.title}</h5>
                  <div className="text-xs font-black text-rose-400 mt-0.5">৳ {prod.price.toLocaleString()}</div>
                </div>
              </div>
            ))}
            {orderedProducts.length === 0 && (
              <div className="col-span-full py-6 text-center text-xs text-slate-400">
                No products found in this category.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Interactive Reordering List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
              <span>Sequenced Product List for "{selectedCategory?.name || 'Category'}"</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                {orderedProducts.length} Total
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Use the Up/Down buttons, the Move to Front button, or enter position numbers to arrange items.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !canUpdate || !hasUnsavedChanges}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md ${
              hasUnsavedChanges
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 ring-2 ring-emerald-400'
                : 'bg-slate-100 text-slate-400 border border-slate-200'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Sequence'}</span>
          </button>
        </div>

        {orderedProducts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">No products in this category</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              This category does not have any products assigned to it yet. Add products to this category in Product Management.
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs font-bold text-slate-700">No products match "{searchTerm}"</p>
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-xs text-indigo-600 font-bold hover:underline"
            >
              Clear search filter
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredProducts.map((product) => {
              // Find real index in orderedProducts
              const realIndex = orderedProducts.findIndex((p) => p.id === product.id);
              const position = realIndex + 1;
              const isHomepageSlot = position <= 6;

              return (
                <div
                  key={product.id}
                  className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-colors ${
                    isHomepageSlot
                      ? 'bg-gradient-to-r from-indigo-50/40 via-white to-transparent hover:bg-indigo-50/70'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* Left: Position Indicator, Thumbnail & Details */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Rank Badge & Input */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div
                        className={`w-10 h-10 rounded-2xl flex flex-col items-center justify-center font-display font-black text-xs shadow-xs border ${
                          isHomepageSlot
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-indigo-600/20'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title={isHomepageSlot ? `Homepage Carousel Slot #${position}` : `Catalog Position #${position}`}
                      >
                        <span className="text-[9px] uppercase tracking-tighter opacity-80 leading-none">Slot</span>
                        <span className="text-sm font-black leading-tight">#{position}</span>
                      </div>
                    </div>

                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Product Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900 truncate max-w-xs sm:max-w-md">
                          {product.title}
                        </h4>
                        {isHomepageSlot && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px]">
                            <Star className="w-3 h-3 text-indigo-600 fill-indigo-600" />
                            Homepage Slot {position}
                          </span>
                        )}
                        {product.featured && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                            <Sparkles className="w-3 h-3 text-amber-600" />
                            Featured
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        <span className="font-black text-rose-600">৳ {product.price.toLocaleString()}</span>
                        {product.sku && <span className="font-mono text-[11px] text-slate-400">SKU: {product.sku}</span>}
                        <span className="text-[11px] text-slate-400">
                          Added: {new Date(product.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-600">
                          Stock: {product.stock > 0 ? `${product.stock} units` : <span className="text-rose-500 font-bold">Out of stock</span>}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Sequence Controls */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {/* Move to Front (Top) */}
                    <button
                      type="button"
                      onClick={() => moveToFront(realIndex)}
                      disabled={realIndex === 0 || !canUpdate}
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed text-indigo-700 font-bold text-xs flex items-center gap-1 border border-indigo-200 transition-colors cursor-pointer"
                      title="Move directly to Front (#1 position)"
                    >
                      <ChevronsUp className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="hidden sm:inline">To Front</span>
                    </button>

                    {/* Move Up (▲) */}
                    <button
                      type="button"
                      onClick={() => moveProduct(realIndex, realIndex - 1)}
                      disabled={realIndex === 0 || !canUpdate}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors cursor-pointer border border-slate-200"
                      title="Move up one position"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>

                    {/* Move Down (▼) */}
                    <button
                      type="button"
                      onClick={() => moveProduct(realIndex, realIndex + 1)}
                      disabled={realIndex === orderedProducts.length - 1 || !canUpdate}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors cursor-pointer border border-slate-200"
                      title="Move down one position"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>

                    {/* Move to End (Bottom) */}
                    <button
                      type="button"
                      onClick={() => moveToBack(realIndex)}
                      disabled={realIndex === orderedProducts.length - 1 || !canUpdate}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors cursor-pointer border border-slate-200"
                      title="Move to bottom of list"
                    >
                      <ChevronsDown className="w-4 h-4" />
                    </button>

                    {/* Direct position number input */}
                    <div className="flex items-center gap-1 ml-1">
                      <span className="text-[11px] font-bold text-slate-400">Pos:</span>
                      <input
                        type="number"
                        min="1"
                        max={orderedProducts.length}
                        value={position}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            handleDisplayOrderChange(product.id, val);
                          }
                        }}
                        className="w-12 px-1.5 py-1 text-center bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        title="Enter desired position number"
                      />
                    </div>

                    {/* Optional Edit Modal Trigger */}
                    {onOpenEditModal && (
                      <button
                        type="button"
                        onClick={() => onOpenEditModal(product)}
                        className="p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors cursor-pointer ml-1"
                        title="Edit product details"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer actions */}
        {orderedProducts.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-slate-400" />
              <span>
                Products numbered <strong>#1 through #6</strong> are featured in the homepage category carousel.
              </span>
            </div>

            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <button
                  type="button"
                  onClick={handleResetToSaved}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Discard Changes
                </button>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !canUpdate || !hasUnsavedChanges}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md ${
                  hasUnsavedChanges
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 ring-2 ring-emerald-400'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving Sequence...' : 'Save Sequence'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
