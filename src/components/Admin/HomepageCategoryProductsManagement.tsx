import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  GripVertical,
  ExternalLink,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Category, Product } from '../../types';
import { homepageCategoriesApi } from '../../services/storeApi';

export interface HomepageCategoryProductsManagementProps {
  categories: Category[];
  products: Product[];
  onSuccess?: (msg: string) => void;
}

export const HomepageCategoryProductsManagement: React.FC<HomepageCategoryProductsManagementProps> = ({
  categories,
  products,
  onSuccess,
}) => {
  // Sort categories alphabetically or by default order
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    sortedCategories[0]?.id || ''
  );

  // Status mapping: categoryId -> { isConfigured: boolean; count: number }
  const [configsMap, setConfigsMap] = useState<
    Record<string, { isConfigured: boolean; count: number; productIds: string[] }>
  >({});
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);

  // Ordered list of products for the selected category's homepage section
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Search & filter for available products
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock'>('all');

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Fetch all category configurations
  const loadAllConfigurations = useCallback(async () => {
    setIsLoadingConfigs(true);
    try {
      const res: any = await homepageCategoriesApi.getConfigurations();
      const map: Record<string, { isConfigured: boolean; count: number; productIds: string[] }> = {};

      if (Array.isArray(res?.configurationsList)) {
        res.configurationsList.forEach((c: any) => {
          map[c.categoryId] = {
            isConfigured: Boolean(c.isConfigured),
            count: c.productCount || (c.productIds?.length ?? 0),
            productIds: c.productIds || [],
          };
        });
      } else {
        const rawMap = (res?.configurations ?? res) || {};
        if (typeof rawMap === 'object' && !Array.isArray(rawMap)) {
          Object.entries(rawMap).forEach(([catId, pids]) => {
            const arr = Array.isArray(pids) ? pids : [];
            map[catId] = {
              isConfigured: arr.length > 0,
              count: arr.length,
              productIds: arr,
            };
          });
        }
      }
      setConfigsMap(map);
    } catch (err: any) {
      console.error('Failed to load homepage category configurations:', err);
    } finally {
      setIsLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    loadAllConfigurations();
  }, [loadAllConfigurations]);

  // When selected category changes, load its custom configuration
  const loadCategoryConfig = useCallback(
    async (catId: string) => {
      if (!catId) return;
      setIsLoadingCurrent(true);
      setFeedback(null);
      setIsDirty(false);
      try {
        const res = await homepageCategoriesApi.getCategoryConfig(catId);
        if (res) {
          setIsConfigured(Boolean(res.isConfigured));
          const orderedIds: string[] = res.productIds || [];

          if (res.isConfigured && orderedIds.length > 0) {
            // Reconstruct in exact saved order from products catalog
            const prodMap = new Map<string, Product>();
            products.forEach((p) => prodMap.set(p.id, p));

            const orderedProds: Product[] = [];
            orderedIds.forEach((id) => {
              const p = prodMap.get(id);
              if (p) {
                orderedProds.push(p);
              }
            });
            setSelectedProducts(orderedProds);
          } else {
            // Default automatic latest mode: Show default latest 5 products from this category
            const catProds = products
              .filter((p) => p.categoryId === catId && p.isActive !== false)
              .sort(
                (a, b) =>
                  new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
              )
              .slice(0, 5);
            setSelectedProducts(catProds);
          }
        }
      } catch (err: any) {
        console.error('Failed to load category homepage products config:', err);
        setFeedback({
          type: 'error',
          message: err?.message || 'Failed to load category homepage products configuration.',
        });
      } finally {
        setIsLoadingCurrent(false);
      }
    },
    [products]
  );

  useEffect(() => {
    if (selectedCategoryId) {
      loadCategoryConfig(selectedCategoryId);
    }
  }, [selectedCategoryId, loadCategoryConfig]);

  // Current category object
  const currentCategory = useMemo(() => {
    return sortedCategories.find((c) => c.id === selectedCategoryId);
  }, [sortedCategories, selectedCategoryId]);

  // Available catalog products for this category (active, matching categoryId)
  const availableCategoryProducts = useMemo(() => {
    if (!selectedCategoryId) return [];
    return products.filter((p) => {
      if (p.categoryId !== selectedCategoryId) return false;
      if (stockFilter === 'in_stock' && p.stock <= 0) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku?.toLowerCase().includes(q);
        const matchesId = p.id.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesId) return false;
      }
      return true;
    });
  }, [products, selectedCategoryId, stockFilter, searchQuery]);

  // Set of selected product IDs for quick lookup
  const selectedProductIdsSet = useMemo(() => {
    return new Set(selectedProducts.map((p) => p.id));
  }, [selectedProducts]);

  // Handlers for reordering
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setSelectedProducts((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
    setIsDirty(true);
  };

  const handleMoveDown = (index: number) => {
    if (index >= selectedProducts.length - 1) return;
    setSelectedProducts((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
    setIsDirty(true);
  };

  const handleMoveToTop = (index: number) => {
    if (index <= 0) return;
    setSelectedProducts((prev) => {
      const next = [...prev];
      const item = next.splice(index, 1)[0];
      next.unshift(item);
      return next;
    });
    setIsDirty(true);
  };

  const handleMoveToBottom = (index: number) => {
    if (index >= selectedProducts.length - 1) return;
    setSelectedProducts((prev) => {
      const next = [...prev];
      const item = next.splice(index, 1)[0];
      next.push(item);
      return next;
    });
    setIsDirty(true);
  };

  // Add a product to the selection
  const handleAddProduct = (product: Product) => {
    if (selectedProductIdsSet.has(product.id)) return;
    setSelectedProducts((prev) => [...prev, product]);
    setIsDirty(true);
  };

  // Remove a product from the selection
  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
    setIsDirty(true);
  };

  // HTML5 Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }
    setSelectedProducts((prev) => {
      const next = [...prev];
      const item = next.splice(draggedIndex, 1)[0];
      next.splice(targetIndex, 0, item);
      return next;
    });
    setDraggedIndex(null);
    setIsDirty(true);
  };

  // Save selection and order
  const handleSave = async () => {
    if (!selectedCategoryId) return;
    if (selectedProducts.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Please select at least one product for this category homepage section, or click "Reset to Automatic Mode".',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const orderedIds = selectedProducts.map((p) => p.id);
      const res = await homepageCategoriesApi.saveCategoryConfig(selectedCategoryId, orderedIds);
      if (res.success) {
        setIsConfigured(true);
        setIsDirty(false);
        const msg = `Homepage display for "${currentCategory?.name || 'Category'}" updated successfully (${orderedIds.length} products).`;
        setFeedback({
          type: 'success',
          message: msg,
        });
        if (onSuccess) onSuccess(msg);
        // Refresh configurations list
        loadAllConfigurations();
      } else {
        throw new Error(res.error || 'Failed to save configuration');
      }
    } catch (err: any) {
      console.error('Save error:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to save homepage category products.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default automatic latest mode
  const handleReset = async () => {
    if (!selectedCategoryId) return;
    setIsResetting(true);
    setFeedback(null);
    try {
      const res = await homepageCategoriesApi.resetCategoryConfig(selectedCategoryId);
      if (res.success) {
        setIsConfigured(false);
        setIsDirty(false);
        setShowResetConfirm(false);

        // Revert to automatic default latest 5
        const catProds = products
          .filter((p) => p.categoryId === selectedCategoryId && p.isActive !== false)
          .sort(
            (a, b) =>
              new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          )
          .slice(0, 5);
        setSelectedProducts(catProds);

        const msg = `"${currentCategory?.name || 'Category'}" reset to automatic latest-products mode.`;
        setFeedback({
          type: 'success',
          message: msg,
        });
        if (onSuccess) onSuccess(msg);
        loadAllConfigurations();
      } else {
        throw new Error(res.error || 'Failed to reset configuration');
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to reset homepage category products.',
      });
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200" id="homepage-category-products-management">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-white">
              Homepage Category Products
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Custom Order Engine
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
            Choose exactly which products appear in each category section on the homepage and arrange their exact display order.
            Independent per category—older products remain pinned even when new products are added to the store.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => {
              loadAllConfigurations();
              if (selectedCategoryId) loadCategoryConfig(selectedCategoryId);
            }}
            disabled={isLoadingConfigs || isLoadingCurrent}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            title="Refresh configurations from database"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isLoadingConfigs || isLoadingCurrent ? 'animate-spin text-rose-400' : ''
              }`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast / Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-2 duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
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
            className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Step 1: Category Selection Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <label
              htmlFor="homepage-category-selector"
              className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2"
            >
              <span>1. Select Category to Configure</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                {sortedCategories.length} Categories
              </span>
            </label>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Each category maintains its own isolated homepage display settings in Cloudflare D1.
            </p>
          </div>

          {currentCategory && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Current Mode:</span>
              {isConfigured ? (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  Custom Selection Active ({selectedProducts.length} items)
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300">
                  Automatic (Latest 5 Products)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Categories Chips / Quick Switcher */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          {sortedCategories.map((cat) => {
            const isSelected = cat.id === selectedCategoryId;
            const configInfo = configsMap[cat.id];
            const hasCustom = configInfo?.isConfigured;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-2 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-md ring-2 ring-slate-900/30'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80'
                }`}
              >
                <span>{cat.name}</span>
                {hasCustom ? (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-extrabold uppercase ${
                      isSelected
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                    }`}
                  >
                    Custom ({configInfo.count})
                  </span>
                ) : (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    Auto
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Homepage Display Queue (Exact Ordered List) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-base text-slate-900">
                  Homepage Display Order
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                  {selectedProducts.length} Products Chosen
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                These products will render on the homepage for <strong>{currentCategory?.name}</strong> in the exact sequence below (#1 first, #2 second, etc.).
              </p>
            </div>

            {isDirty && (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse flex items-center gap-1 self-start sm:self-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Unsaved Changes
              </span>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-save-homepage-category-products"
                onClick={handleSave}
                disabled={isSaving || selectedProducts.length === 0}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                    <span>Saving Order...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Save Selection &amp; Order</span>
                  </>
                )}
              </button>

              {isDirty && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCategoryId) loadCategoryConfig(selectedCategoryId);
                  }}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                  title="Discard changes and reload saved state"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Discard</span>
                </button>
              )}
            </div>

            {isConfigured && (
              <button
                type="button"
                id="btn-reset-homepage-category-default"
                onClick={() => setShowResetConfirm(true)}
                disabled={isResetting}
                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                title="Restore default behavior (automatic latest 5 products)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Automatic Mode</span>
              </button>
            )}
          </div>

          {/* Reset Confirmation Modal */}
          {showResetConfirm && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs text-rose-900">
                    Reset "{currentCategory?.name}" to Automatic Mode?
                  </h4>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    This will delete the custom homepage selection for this category in Cloudflare D1. The homepage will automatically revert to displaying the 5 most recently created products in this category.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isResetting}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isResetting ? 'Resetting...' : 'Yes, Reset to Automatic'}
                </button>
              </div>
            </div>
          )}

          {/* Ordered Products List */}
          {isLoadingCurrent ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-rose-500" />
              <p className="text-xs">Loading homepage selection...</p>
            </div>
          ) : selectedProducts.length === 0 ? (
            <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-3xl space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">No Products Selected</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Pick products from the available catalog on the right to build this category's homepage showcase.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-400 px-1 flex items-center justify-between">
                <span>Drag handle or use buttons to reorder</span>
                <span>{selectedProducts.length} items</span>
              </div>

              {selectedProducts.map((prod, index) => {
                const isFirst = index === 0;
                const isLast = index === selectedProducts.length - 1;
                const isDragging = draggedIndex === index;

                return (
                  <div
                    key={prod.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    className={`group p-3 rounded-2xl border transition-all flex items-center gap-3 bg-white ${
                      isDragging
                        ? 'opacity-40 border-dashed border-rose-400 scale-[0.98]'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {/* Drag Handle & Order Badge */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div
                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-1"
                        title="Drag to reorder"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <span className="w-6 h-6 rounded-lg bg-slate-900 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                        {index + 1}
                      </span>
                    </div>

                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                      <img
                        src={prod.image || 'https://placehold.co/100x100?text=No+Image'}
                        alt={prod.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-slate-900 truncate" title={prod.name}>
                        {prod.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                        <span className="font-bold text-slate-800">৳{prod.price}</span>
                        {prod.originalPrice && prod.originalPrice > prod.price && (
                          <span className="line-through text-slate-400 text-[10px]">
                            ৳{prod.originalPrice}
                          </span>
                        )}
                        <span>•</span>
                        <span
                          className={`font-semibold ${
                            prod.stock <= 0
                              ? 'text-rose-600'
                              : prod.stock <= 5
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {prod.stock <= 0 ? 'Out of stock' : `${prod.stock} in stock`}
                        </span>
                        {prod.createdAt && (
                          <span className="text-[10px] text-slate-400 hidden sm:inline">
                            (Added {new Date(prod.createdAt).toLocaleDateString()})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ordering Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(index)}
                        disabled={isFirst}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:hover:bg-slate-100 transition-colors cursor-pointer"
                        title={isFirst ? 'Already at the top' : 'Move Up (# ' + index + ')'}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMoveDown(index)}
                        disabled={isLast}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:hover:bg-slate-100 transition-colors cursor-pointer"
                        title={isLast ? 'Already at the bottom' : 'Move Down (# ' + (index + 2) + ')'}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveProduct(prod.id)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer ml-1"
                        title="Remove from homepage selection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Catalog Picker for this Category */}
        <div className="lg:col-span-5 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100 space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-slate-900">
                Category Catalog
              </h3>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {availableCategoryProducts.length} Available
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Browse all products under <strong>{currentCategory?.name}</strong> (new and older items) to add them to the homepage.
            </p>
          </div>

          {/* Search & Stock Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products by title, SKU, or ID..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStockFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  stockFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Products
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('in_stock')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  stockFilter === 'in_stock'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                In Stock Only
              </button>
            </div>
          </div>

          {/* Catalog Items */}
          <div className="max-h-[580px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
            {availableCategoryProducts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No products found in this category matching your filter.
              </div>
            ) : (
              availableCategoryProducts.map((prod) => {
                const isSelected = selectedProductIdsSet.has(prod.id);
                const orderIndex = selectedProducts.findIndex((p) => p.id === prod.id);

                return (
                  <div
                    key={prod.id}
                    className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-50/50 border-emerald-200 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                        <img
                          src={prod.image || 'https://placehold.co/100x100?text=No+Image'}
                          alt={prod.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="min-w-0">
                        <h5 className="font-bold text-xs text-slate-800 truncate" title={prod.name}>
                          {prod.name}
                        </h5>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span className="font-bold text-slate-700">৳{prod.price}</span>
                          <span>•</span>
                          <span
                            className={
                              prod.stock <= 0
                                ? 'text-rose-600 font-semibold'
                                : 'text-slate-500'
                            }
                          >
                            {prod.stock <= 0 ? 'Out of stock' : `${prod.stock} in stock`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            #{orderIndex + 1} Active
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(prod.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddProduct(prod)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-[11px] flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
