import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderTree,
  Package,
  Search,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Tag,
  Eye,
  Sliders,
  Sparkles,
  Layers,
  Info,
  Loader2,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { Category, Product } from '../../types';
import { homepageCategoriesApi } from '../../services/storeApi';

export interface HomepageCategoriesManagementProps {
  categories?: Category[];
  products?: Product[];
  onRefreshHomepage?: () => void;
  hasPermission?: (perm: any) => boolean;
  isSuperAdmin?: boolean;
  onOpenEditProduct?: (product: Product) => void;
}

export const HomepageCategoriesManagement: React.FC<HomepageCategoriesManagementProps> = ({
  categories = [],
  products = [],
  onRefreshHomepage,
  hasPermission = (_perm?: any) => true,
  isSuperAdmin = false,
  onOpenEditProduct,
}) => {
  const canUpdate = Boolean(
    isSuperAdmin ||
      (typeof hasPermission === 'function' &&
        (hasPermission('canManageCategories') ||
          hasPermission('product.update') ||
          hasPermission('category.manage')))
  );

  // Selected Category
  const [selectedCatId, setSelectedCatId] = useState<string>(() => {
    return (categories && categories[0]?.id) || '';
  });

  // Category configurations loaded from server: Record<categoryId, string[] (productIds)>
  const [allConfigs, setAllConfigs] = useState<Record<string, string[]>>({});
  const [isLoadingConfigs, setIsLoadingConfigs] = useState<boolean>(true);

  // Active category's ordered product IDs in draft/edit state
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [initialLoadedIds, setInitialLoadedIds] = useState<string[]>([]);

  // Search filter for catalog items to add
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [categoryListSearch, setCategoryListSearch] = useState<string>('');

  // Save / Action states
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Confirmation modal state for Reset to Default
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);

  // Sync selectedCatId if initial was empty
  useEffect(() => {
    if ((!selectedCatId || !categories.some((c) => c.id === selectedCatId)) && categories.length > 0) {
      setSelectedCatId(categories[0].id);
    }
  }, [categories, selectedCatId]);

  // Load all homepage category configurations from server
  const loadAllConfigs = useCallback(async () => {
    setIsLoadingConfigs(true);
    try {
      const res = await homepageCategoriesApi.getAllConfigs();
      if (res.success && res.configs) {
        setAllConfigs(res.configs);
      }
    } catch (err) {
      console.error('Failed to load homepage category configs:', err);
    } finally {
      setIsLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    loadAllConfigs();
  }, [loadAllConfigs]);

  // When selected category changes, update current draft list
  useEffect(() => {
    if (!selectedCatId) {
      setSelectedProductIds([]);
      setInitialLoadedIds([]);
      return;
    }

    const configured = allConfigs[selectedCatId];
    if (Array.isArray(configured) && configured.length > 0) {
      setSelectedProductIds(configured);
      setInitialLoadedIds(configured);
    } else {
      setSelectedProductIds([]);
      setInitialLoadedIds([]);
    }
  }, [selectedCatId, allConfigs]);

  const activeCategory = useMemo(() => {
    return categories.find((c) => c.id === selectedCatId) || categories[0];
  }, [categories, selectedCatId]);

  // Filtered categories for sidebar/selector
  const filteredCategories = useMemo(() => {
    const q = categoryListSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.slug && c.slug.toLowerCase().includes(q))
    );
  }, [categories, categoryListSearch]);

  // All active products belonging to the selected category
  const categoryCatalog = useMemo(() => {
    if (!activeCategory) return [];
    return products.filter(
      (p) =>
        p.categoryId === activeCategory.id &&
        p.status !== 'inactive' &&
        !(p as any).isDeleted
    );
  }, [products, activeCategory]);

  // Default fallback products (5 most recent active products) for unconfigured state
  const defaultRecentFiveProducts = useMemo(() => {
    return [...categoryCatalog]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 5);
  }, [categoryCatalog]);

  // Search filtered category catalog items available to add
  const filteredCatalogItems = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase();
    if (!term) return categoryCatalog;
    return categoryCatalog.filter((p) => {
      const title = (p.title || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const id = (p.id || '').toLowerCase();
      return title.includes(term) || sku.includes(term) || id.includes(term);
    });
  }, [categoryCatalog, catalogSearch]);

  // Ordered list of products currently selected for the homepage showcase
  // Gracefully handles deleted, inactive, or mismatched products
  const currentShowcaseProducts = useMemo(() => {
    const prodMap = new Map<string, Product>();
    categoryCatalog.forEach((p) => prodMap.set(p.id, p));

    const list: Product[] = [];
    for (const pId of selectedProductIds) {
      const prod = prodMap.get(pId);
      if (prod) {
        list.push(prod);
      }
    }
    return list;
  }, [selectedProductIds, categoryCatalog]);

  // Is this category currently customized or using default fallback?
  const isCustomConfigured = Boolean(
    allConfigs[selectedCatId] && allConfigs[selectedCatId].length > 0
  );

  // Check if draft has unsaved changes
  const isDirty = useMemo(() => {
    if (selectedProductIds.length !== initialLoadedIds.length) return true;
    for (let i = 0; i < selectedProductIds.length; i++) {
      if (selectedProductIds[i] !== initialLoadedIds[i]) return true;
    }
    return false;
  }, [selectedProductIds, initialLoadedIds]);

  // Reorder: Move product up in display sequence
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setSelectedProductIds((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Reorder: Move product down in display sequence
  const handleMoveDown = (index: number) => {
    if (index >= selectedProductIds.length - 1) return;
    setSelectedProductIds((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Add product to showcase
  const handleAddProduct = (productId: string) => {
    if (selectedProductIds.includes(productId)) return;
    setSelectedProductIds((prev) => [...prev, productId]);
  };

  // Remove product from showcase
  const handleRemoveProduct = (productId: string) => {
    setSelectedProductIds((prev) => prev.filter((id) => id !== productId));
  };

  // Save changes to Cloudflare D1
  const handleSave = async () => {
    if (!canUpdate) {
      setFeedback({ type: 'error', message: 'Permission required to update category homepage showcase.' });
      return;
    }
    if (!activeCategory) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      // If user emptied list completely, saving empty array removes custom config (reverts to default)
      if (selectedProductIds.length === 0) {
        const res = await homepageCategoriesApi.resetCategoryConfig(activeCategory.id);
        if (res.success) {
          setAllConfigs((prev) => {
            const next = { ...prev };
            delete next[activeCategory.id];
            return next;
          });
          setInitialLoadedIds([]);
          setFeedback({
            type: 'success',
            message: `Homepage showcase cleared for "${activeCategory.name}". It will now show the 5 most recent products by default.`,
          });
          onRefreshHomepage?.();
        } else {
          setFeedback({ type: 'error', message: res.error || 'Failed to update category showcase.' });
        }
      } else {
        const res = await homepageCategoriesApi.saveCategoryConfig(activeCategory.id, selectedProductIds);
        if (res.success) {
          setAllConfigs((prev) => ({
            ...prev,
            [activeCategory.id]: selectedProductIds,
          }));
          setInitialLoadedIds(selectedProductIds);
          setFeedback({
            type: 'success',
            message: `Homepage showcase saved! "${activeCategory.name}" will display ${selectedProductIds.length} custom-ordered products on the homepage.`,
          });
          onRefreshHomepage?.();
        } else {
          setFeedback({ type: 'error', message: res.error || 'Failed to save category showcase.' });
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Error communicating with server.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setFeedback(null), 4500);
    }
  };

  // Reset to default (showing 5 most recent products)
  const handleResetToDefault = async () => {
    if (!canUpdate) return;
    if (!activeCategory) return;

    setIsResetting(true);
    setIsResetConfirmOpen(false);
    setFeedback(null);

    try {
      const res = await homepageCategoriesApi.resetCategoryConfig(activeCategory.id);
      if (res.success) {
        setAllConfigs((prev) => {
          const next = { ...prev };
          delete next[activeCategory.id];
          return next;
        });
        setSelectedProductIds([]);
        setInitialLoadedIds([]);
        setFeedback({
          type: 'success',
          message: `Category "${activeCategory.name}" has been reset to default behavior. The homepage will automatically show the 5 most recent products.`,
        });
        onRefreshHomepage?.();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to reset category showcase.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Error resetting category showcase.' });
    } finally {
      setIsResetting(false);
      setTimeout(() => setFeedback(null), 4500);
    }
  };

  // Populate draft with the current 5 most recent products as a quick starting point
  const handleQuickPopulateRecent = () => {
    const recentIds = defaultRecentFiveProducts.map((p) => p.id);
    setSelectedProductIds(recentIds);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Purpose Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display font-bold text-xl text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>Homepage Category Showcase & Ordering</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Isolated Per-Category
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Select and manually arrange which specific products appear inside each category's carousel on the storefront homepage. Adding new products to your store globally will never alter your customized order.
          </p>
        </div>

        {/* Global Save Button for Active Category */}
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              Unsaved changes
            </span>
          )}

          <button
            type="button"
            id="btn-save-homepage-category"
            onClick={handleSave}
            disabled={!canUpdate || isSaving || !isDirty}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer ${
              isDirty
                ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white shadow-md active:scale-95'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
            }`}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Save Homepage Order</span>
          </button>
        </div>
      </div>

      {/* Scope Clarification Notice */}
      <div className="p-3.5 bg-sky-50/80 border border-sky-200 rounded-2xl flex items-start gap-2.5 text-xs text-sky-900 shadow-2xs">
        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold text-sky-950">
            Homepage Scope Isolation Guarantee:
          </p>
          <p className="text-sky-800 text-[11px] leading-relaxed">
            Custom ordering configured here applies <strong>only</strong> to the category carousels on the storefront homepage. Dedicated category listing pages (e.g. <code>/category/smart-watch</code>), search results, and global Featured Products remain completely untouched.
          </p>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          id="homepage-category-feedback-alert"
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between animate-fadeIn shadow-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : feedback.type === 'error'
              ? 'bg-rose-50 border border-rose-200 text-rose-800'
              : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-500 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Master 2-Column Interface: Category Selector Sidebar + Configuration Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (3 cols): Categories List & Status */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <FolderTree className="w-3.5 h-3.5 text-indigo-500" />
                Select Category
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                {categories.length} total
              </span>
            </div>

            {/* Category Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={categoryListSearch}
                onChange={(e) => setCategoryListSearch(e.target.value)}
                placeholder="Search categories..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              {categoryListSearch && (
                <button
                  type="button"
                  onClick={() => setCategoryListSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Category Items List */}
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredCategories.map((cat) => {
                const isSelected = cat.id === selectedCatId;
                const configItems = allConfigs[cat.id];
                const isConfigured = Array.isArray(configItems) && configItems.length > 0;
                const totalCatProducts = products.filter(
                  (p) => p.categoryId === cat.id && p.status !== 'inactive' && !(p as any).isDeleted
                ).length;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      if (isDirty) {
                        if (!window.confirm('You have unsaved changes in this category. Discard changes and switch category?')) {
                          return;
                        }
                      }
                      setSelectedCatId(cat.id);
                      setCatalogSearch('');
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-slate-800'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs truncate flex items-center gap-1.5">
                        <span className="truncate">{cat.name}</span>
                        {isConfigured && (
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isSelected ? 'bg-amber-400' : 'bg-amber-500'
                            }`}
                            title="Custom Homepage Order Active"
                          />
                        )}
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 truncate ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {totalCatProducts} products in catalog
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {isConfigured ? (
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-block ${
                            isSelected
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                              : 'bg-amber-100 text-amber-900 border border-amber-200'
                          }`}
                        >
                          Custom ({configItems.length})
                        </span>
                      ) : (
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-block ${
                            isSelected
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-slate-200/80 text-slate-600'
                          }`}
                        >
                          Default (5)
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (8 cols): Showcase Management & Ordering */}
        <div className="lg:col-span-8 space-y-6">
          {activeCategory ? (
            <>
              {/* Active Category Header Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-extrabold text-lg text-slate-900">
                      {activeCategory.name}
                    </h3>
                    {isCustomConfigured ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        Custom Showcase ({currentShowcaseProducts.length} items)
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-slate-500" />
                        Default (5 most recent products)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                    <span>
                      Slug: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">/{activeCategory.slug}</code>
                    </span>
                    <span>•</span>
                    <span>{categoryCatalog.length} active products available</span>
                  </div>
                </div>

                {/* Reset to Default Button */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {isCustomConfigured && (
                    <button
                      type="button"
                      id="btn-reset-category-homepage"
                      onClick={() => setIsResetConfirmOpen(true)}
                      disabled={isResetting || !canUpdate}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                      title="Revert this category to default behavior (showing the 5 most recent products)"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-600" />
                      <span>Reset to Default</span>
                    </button>
                  )}
                </div>
              </div>

              {/* SECTION 1: Current Homepage Showcase Display Order */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 sm:px-5 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-indigo-600" />
                      Homepage Display Sequence
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Products render on the homepage carousel in this exact order (from #1 onwards). Use Move Up / Down to adjust ranking.
                    </p>
                  </div>

                  {currentShowcaseProducts.length === 0 && !isCustomConfigured && (
                    <button
                      type="button"
                      onClick={handleQuickPopulateRecent}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200 transition-colors cursor-pointer self-start sm:self-auto flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Start with 5 Recent Products</span>
                    </button>
                  )}
                </div>

                {/* List of Ordered Showcase Products */}
                <div className="divide-y divide-slate-100">
                  {currentShowcaseProducts.length === 0 ? (
                    <div className="p-8 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                        <Package className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h5 className="font-bold text-sm text-slate-800">
                          {isCustomConfigured
                            ? 'No products currently selected'
                            : 'Currently using default behavior (5 most recent products)'}
                        </h5>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Select products from the catalog below to establish a customized homepage display sequence for <strong>{activeCategory.name}</strong>.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleQuickPopulateRecent}
                        disabled={defaultRecentFiveProducts.length === 0}
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Populate with 5 Recent Products</span>
                      </button>
                    </div>
                  ) : (
                    currentShowcaseProducts.map((prod, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === currentShowcaseProducts.length - 1;

                      return (
                        <div
                          key={`showcase-${prod.id}`}
                          className="p-3.5 sm:px-5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                        >
                          {/* Order Rank Badge + Product Info */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Position Number */}
                            <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center font-mono shrink-0 shadow-2xs">
                              #{idx + 1}
                            </span>

                            {/* Product Thumbnail */}
                            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                              <img
                                src={prod.imageUrl}
                                alt={prod.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>

                            {/* Title, Price, and Stock */}
                            <div className="min-w-0 flex-1">
                              <h5 className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                                {prod.title}
                              </h5>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs">
                                <span className="font-extrabold text-slate-800 font-display">
                                  ৳ {Number(prod.price).toLocaleString()}
                                </span>
                                {prod.originalPrice && (
                                  <span className="text-[11px] text-slate-400 line-through">
                                    ৳ {Number(prod.originalPrice).toLocaleString()}
                                  </span>
                                )}
                                {prod.sku && (
                                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                                    {prod.sku}
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                    prod.stock <= 0
                                      ? 'bg-rose-100 text-rose-700'
                                      : prod.stock <= 5
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {prod.stock <= 0 ? 'Out of stock' : `${prod.stock} in stock`}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Controls: Move Up, Move Down, Remove */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveUp(idx)}
                              disabled={isFirst || !canUpdate}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-slate-700 transition-colors shadow-2xs cursor-pointer"
                              title="Move up in display order"
                              aria-label={`Move ${prod.title} up`}
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDown(idx)}
                              disabled={isLast || !canUpdate}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none text-slate-700 transition-colors shadow-2xs cursor-pointer"
                              title="Move down in display order"
                              aria-label={`Move ${prod.title} down`}
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(prod.id)}
                              disabled={!canUpdate}
                              className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors shadow-2xs cursor-pointer ml-1"
                              title="Remove from homepage showcase"
                              aria-label={`Remove ${prod.title} from showcase`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* SECTION 2: Add Products from Category Catalog */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 sm:px-5 border-b border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-600" />
                      Add Products from "{activeCategory.name}"
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Click "+ Add to Showcase" to append any product (both old and newly added products) to the homepage section.
                    </p>
                  </div>

                  {/* Search within Category Products */}
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Search title or SKU..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    {catalogSearch && (
                      <button
                        type="button"
                        onClick={() => setCatalogSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Available Products Grid */}
                <div className="p-4 sm:p-5">
                  {filteredCatalogItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No active products found matching your search.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
                      {filteredCatalogItems.map((prod) => {
                        const isAlreadySelected = selectedProductIds.includes(prod.id);
                        const selectedRank = isAlreadySelected
                          ? selectedProductIds.indexOf(prod.id) + 1
                          : null;

                        return (
                          <div
                            key={`cat-item-${prod.id}`}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                              isAlreadySelected
                                ? 'bg-slate-50/90 border-slate-300'
                                : 'bg-white hover:bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                                <img
                                  src={prod.imageUrl}
                                  alt={prod.title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h6 className="font-bold text-xs text-slate-900 truncate">
                                  {prod.title}
                                </h6>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                                  <span className="font-bold text-slate-800">
                                    ৳ {Number(prod.price).toLocaleString()}
                                  </span>
                                  <span>•</span>
                                  <span>Stock: {prod.stock}</span>
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {isAlreadySelected ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProduct(prod.id)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold text-[10px] flex items-center gap-1 hover:bg-rose-600 transition-colors cursor-pointer group"
                                  title="Click to remove from showcase"
                                >
                                  <Check className="w-3 h-3 group-hover:hidden" />
                                  <X className="w-3 h-3 hidden group-hover:block" />
                                  <span className="group-hover:hidden">#{selectedRank} in Showcase</span>
                                  <span className="hidden group-hover:inline">Remove</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAddProduct(prod.id)}
                                  disabled={!canUpdate}
                                  className="px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 hover:border-emerald-600 font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <FolderTree className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Please select a category from the left menu.</p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Reset to Default */}
      {isResetConfirmOpen && activeCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Reset "{activeCategory.name}" to Default?
                </h3>
                <p className="text-xs text-slate-500">
                  Revert to showing the 5 most recent products on the homepage.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              This will remove the custom product selection and ordering for <strong>{activeCategory.name}</strong> from Cloudflare D1. The homepage carousel will automatically display the 5 most recent products in this category.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-reset-category"
                onClick={handleResetToDefault}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isResetting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                <span>Confirm Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomepageCategoriesManagement;
