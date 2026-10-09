import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ProductReview, Product, ReviewStatus, ReviewSource, UserAccount } from '../types';
import { reviewsApi } from '../services/storeApi';
import { hasUserPermission } from '../utils/permissions';
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Filter,
  Search,
  Plus,
  RefreshCw,
  Star,
  ShieldCheck,
  Image as ImageIcon,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  Edit2,
  ArrowLeft,
  Package,
  Calendar,
  User,
  Sparkles,
  Check,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';

export interface AdminReviewsTabProps {
  products: Product[];
  currentUser: UserAccount | null;
  onRefreshProducts?: () => void;
  initialProductFilter?: string;
  onBackToProducts?: () => void;
}

export const AdminReviewsTab: React.FC<AdminReviewsTabProps> = ({
  products,
  currentUser,
  onRefreshProducts,
  initialProductFilter,
  onBackToProducts,
}) => {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductFilter || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | number>('all');
  const [dateFilter, setDateFilter] = useState<'all' | '7days' | '30days' | 'older'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'rating_desc' | 'rating_asc'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modals state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ProductReview | null>(null);
  const [viewingReview, setViewingReview] = useState<ProductReview | null>(null);
  const [editingReview, setEditingReview] = useState<ProductReview | null>(null);

  // Add review form state
  const [formProductId, setFormProductId] = useState(products[0]?.id || '');
  const [formAuthor, setFormAuthor] = useState(currentUser?.name || 'Store Staff');
  const [formRating, setFormRating] = useState(5);
  const [formComment, setFormComment] = useState('');
  const [formVerified, setFormVerified] = useState(true);
  const [formStatus, setFormStatus] = useState<ReviewStatus>('approved');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit review form state
  const [editAuthor, setEditAuthor] = useState('');
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState('');
  const [editVerified, setEditVerified] = useState(true);
  const [editStatus, setEditStatus] = useState<ReviewStatus>('approved');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const canView = currentUser ? hasUserPermission(currentUser, 'review.view') : false;
  const canManage = currentUser ? hasUserPermission(currentUser, 'review.manage') : false;
  const canDelete = currentUser ? hasUserPermission(currentUser, 'review.delete') : false;

  const showSuccessFeedback = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => {
      setSuccessNotice((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(p.id, p);
      if (p.slug) map.set(p.slug, p);
    }
    return map;
  }, [products]);

  // Identify scoped product when a specific product ID is filtered
  const scopedProduct = useMemo(() => {
    if (selectedProductId && selectedProductId !== 'all') {
      return productMap.get(selectedProductId) || products.find((p) => p.id === selectedProductId || p.slug === selectedProductId) || null;
    }
    return null;
  }, [productMap, products, selectedProductId]);

  // Keep initial filter in sync
  useEffect(() => {
    if (initialProductFilter) {
      setSelectedProductId(initialProductFilter);
      setCurrentPage(1);
    }
  }, [initialProductFilter]);

  // Set default form product when scoped product is present
  useEffect(() => {
    if (scopedProduct) {
      setFormProductId(scopedProduct.id);
    } else if (products[0]) {
      setFormProductId(products[0].id);
    }
  }, [scopedProduct, products]);

  // Fetch reviews strictly scoped to target product or all
  const loadReviews = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    setError(null);
    try {
      // Server-side product scoping: request target product if scoped
      const params = scopedProduct
        ? { productId: scopedProduct.id, status: 'all' }
        : { status: 'all' };
      const data = await reviewsApi.getAll(params);
      setReviews(data);
    } catch (err: any) {
      console.error('Failed to load reviews:', err);
      setError(err.message || 'Failed to load reviews from server.');
    } finally {
      setIsLoading(false);
    }
  }, [canView, scopedProduct]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Product-scoped reviews: strict guard preventing cross-product review contamination
  const productScopedReviews = useMemo(() => {
    if (!scopedProduct) {
      if (selectedProductId !== 'all') {
        return reviews.filter((r) => r.productId === selectedProductId);
      }
      return reviews;
    }
    return reviews.filter(
      (r) => r.productId === scopedProduct.id || (scopedProduct.slug && r.productId === scopedProduct.slug)
    );
  }, [reviews, scopedProduct, selectedProductId]);

  // Accurate server-derived counts for All, Pending, Approved, and Rejected tabs
  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of productScopedReviews) {
      const st = r.status || 'approved';
      if (st === 'pending') pending++;
      else if (st === 'approved') approved++;
      else if (st === 'rejected') rejected++;
    }
    return {
      all: productScopedReviews.length,
      pending,
      approved,
      rejected,
    };
  }, [productScopedReviews]);

  // Filtered and sorted reviews
  const filteredReviews = useMemo(() => {
    const now = Date.now();
    const result = productScopedReviews.filter((r) => {
      // 1. Status Filter
      if (statusFilter !== 'all') {
        const rStatus = r.status || 'approved';
        if (rStatus !== statusFilter) return false;
      }

      // 2. Rating Filter
      if (ratingFilter !== 'all') {
        if (r.rating !== ratingFilter) return false;
      }

      // 3. Date Filter
      if (dateFilter !== 'all' && r.createdAt) {
        const createdMs = new Date(r.createdAt).getTime();
        const diffMs = now - createdMs;
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        if (dateFilter === '7days' && diffMs > sevenDaysMs) return false;
        if (dateFilter === '30days' && diffMs > thirtyDaysMs) return false;
        if (dateFilter === 'older' && diffMs <= thirtyDaysMs) return false;
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const authorMatch = (r.authorName || r.author || '').toLowerCase().includes(q);
        const commentMatch = (r.comment || '').toLowerCase().includes(q);
        const prod = productMap.get(r.productId);
        const prodTitleMatch = prod?.title?.toLowerCase().includes(q);
        if (!authorMatch && !commentMatch && !prodTitleMatch) return false;
      }

      return true;
    });

    // Sorting
    return result.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      if (sortBy === 'rating_desc') {
        return (b.rating || 0) - (a.rating || 0);
      }
      if (sortBy === 'rating_asc') {
        return (a.rating || 0) - (b.rating || 0);
      }
      return 0;
    });
  }, [productScopedReviews, statusFilter, ratingFilter, dateFilter, searchQuery, sortBy, productMap]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredReviews.length / itemsPerPage));
  const paginatedReviews = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredReviews.slice(start, start + itemsPerPage);
  }, [filteredReviews, currentPage, itemsPerPage]);

  // Reset page when filters change
  const handleStatusFilterChange = (st: 'all' | ReviewStatus) => {
    setStatusFilter(st);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setStatusFilter('all');
    setRatingFilter('all');
    setDateFilter('all');
    setSearchQuery('');
    setSortBy('newest');
    setCurrentPage(1);
  };

  // Status update handler (Approve / Reject / Hold)
  const handleUpdateStatus = async (reviewId: string, newStatus: ReviewStatus) => {
    if (!canManage) return;
    setActionLoadingId(reviewId);
    try {
      const updated = await reviewsApi.update(reviewId, { status: newStatus });
      setReviews((prev) => prev.map((r) => (r.id === reviewId ? updated : r)));
      if (viewingReview && viewingReview.id === reviewId) {
        setViewingReview(updated);
      }
      showSuccessFeedback(
        newStatus === 'approved'
          ? 'Review approved and published to public catalog.'
          : newStatus === 'rejected'
          ? 'Review rejected and hidden from public catalog.'
          : 'Review reverted to pending moderation queue.'
      );
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      alert(`Failed to update review status: ${err.message || 'Server error'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (rev: ProductReview) => {
    setEditingReview(rev);
    setEditAuthor(rev.authorName || rev.author || '');
    setEditRating(rev.rating || 5);
    setEditComment(rev.comment || '');
    setEditVerified(Boolean(rev.verifiedPurchase));
    setEditStatus(rev.status || 'approved');
    setEditError(null);
  };

  // Submit Edit Review
  const handleSaveEditedReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReview || !canManage) return;
    if (!editAuthor.trim() || !editComment.trim()) {
      setEditError('Author name and comment are required.');
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const updated = await reviewsApi.update(editingReview.id, {
        authorName: editAuthor.trim(),
        rating: editRating,
        comment: editComment.trim(),
        verifiedPurchase: editVerified,
        status: editStatus,
      });
      setReviews((prev) => prev.map((r) => (r.id === editingReview.id ? updated : r)));
      if (viewingReview && viewingReview.id === editingReview.id) {
        setViewingReview(updated);
      }
      setEditingReview(null);
      showSuccessFeedback('Review details updated successfully.');
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update review on server.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Delete review handler
  const handleDeleteReview = async () => {
    if (!deleteCandidate || !canDelete) return;
    setActionLoadingId(deleteCandidate.id);
    try {
      await reviewsApi.delete(deleteCandidate.id);
      setReviews((prev) => prev.filter((r) => r.id !== deleteCandidate.id));
      if (viewingReview && viewingReview.id === deleteCandidate.id) {
        setViewingReview(null);
      }
      setDeleteCandidate(null);
      showSuccessFeedback('Review permanently deleted.');
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      alert(`Failed to delete review: ${err.message || 'Server error'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Add review handler (locked to scoped product if applicable)
  const handleCreateStaffReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    const targetId = scopedProduct ? scopedProduct.id : formProductId;
    if (!targetId || !formAuthor.trim() || !formComment.trim()) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setFormSubmitting(true);
    setFormError(null);
    try {
      const created = await reviewsApi.create({
        productId: targetId,
        authorName: formAuthor.trim(),
        author: formAuthor.trim(),
        rating: formRating,
        comment: formComment.trim(),
        verifiedPurchase: formVerified,
        status: formStatus,
        source: 'admin',
      });
      setReviews((prev) => [created, ...prev]);
      setIsAddModalOpen(false);
      setFormComment('');
      showSuccessFeedback('Review added successfully.');
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create review.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleReturnToProducts = () => {
    if (onBackToProducts) {
      onBackToProducts();
    } else {
      setSelectedProductId('all');
    }
  };

  if (!canView) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center max-w-lg mx-auto my-12 shadow-xs">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">Access Restricted</h3>
        <p className="text-sm text-slate-500 mb-4">
          You do not have permission to view or moderate customer reviews (`review.view`).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Return Path Navigation (when scoped to a specific product) */}
      {scopedProduct && (
        <div className="flex items-center justify-between gap-3 bg-white p-3.5 px-4 rounded-2xl border border-slate-200 shadow-xs">
          <button
            type="button"
            id="back-to-product-management-btn"
            onClick={handleReturnToProducts}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
            <span>Back to Product Management</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 hidden sm:inline">
              Scoped Mode:
            </span>
            <span className="text-xs font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 truncate max-w-xs">
              {scopedProduct.title}
            </span>
            <button
              type="button"
              onClick={() => setSelectedProductId('all')}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              View All Products
            </button>
          </div>
        </div>
      )}

      {/* Scoped Product Hero Header */}
      {scopedProduct ? (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-md border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4 min-w-0">
            {scopedProduct.imageUrl ? (
              <img
                src={scopedProduct.imageUrl}
                alt={scopedProduct.title}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover bg-white/10 border-2 border-white/20 shrink-0 shadow-md"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-700 flex items-center justify-center shrink-0 border border-slate-600">
                <Package className="w-8 h-8 text-slate-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-rose-500 text-white">
                  Product Reviews
                </span>
                {scopedProduct.sku && (
                  <span className="text-[11px] text-slate-300 font-mono">
                    SKU: {scopedProduct.sku}
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    scopedProduct.stock <= 5
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {scopedProduct.stock <= 5 ? `Low Stock (${scopedProduct.stock})` : `${scopedProduct.stock} in stock`}
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-extrabold text-white truncate font-display">
                {scopedProduct.title}
              </h2>

              <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-300">
                <span className="font-bold text-white text-sm">
                  ৳{scopedProduct.price.toLocaleString('en-BD')}
                </span>
                <span className="text-slate-500">•</span>
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span className="font-bold text-white">
                    {scopedProduct.rating !== undefined ? scopedProduct.rating.toFixed(1) : '5.0'}★
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    ({counts.approved} Approved)
                  </span>
                </div>
                {counts.pending > 0 && (
                  <>
                    <span className="text-slate-500">•</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {counts.pending} Pending Review
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
            <button
              type="button"
              onClick={loadReviews}
              disabled={isLoading}
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
              title="Refresh reviews"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
            </button>

            {canManage && (
              <button
                type="button"
                id="add-review-scoped-btn"
                onClick={() => setIsAddModalOpen(true)}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Review</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Global Header (when viewing all products) */
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5 font-display">
              <MessageSquare className="w-6 h-6 text-amber-500" />
              <span>Customer Review Moderation</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Moderate incoming customer reviews, inspect photo attachments, and manage catalog ratings.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadReviews}
              disabled={isLoading}
              className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
              title="Refresh reviews"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-rose-500' : ''}`} />
            </button>

            {canManage && (
              <button
                type="button"
                id="add-review-global-btn"
                onClick={() => setIsAddModalOpen(true)}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Review</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {successNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2.5 animate-in fade-in shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="flex-1">{successNotice}</span>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="p-1 text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Accurate Server-Derived Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div
          onClick={() => handleStatusFilterChange('all')}
          className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'all'
              ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50/50'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-1">
            <span>All Reviews</span>
            <MessageSquare className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{counts.all}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Total submissions</div>
        </div>

        <div
          id="reviews-pending-count-card"
          onClick={() => handleStatusFilterChange('pending')}
          className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'pending'
              ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/30'
              : 'border-slate-200/80 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 text-xs font-bold mb-1">
            <span>Pending</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 flex items-center gap-2">
            <span>{counts.pending}</span>
            {counts.pending > 0 && (
              <span className="text-[10px] uppercase tracking-wider py-0.5 px-2 bg-amber-100 text-amber-800 rounded-full font-bold">
                Action Needed
              </span>
            )}
          </div>
          <div className="text-[11px] text-amber-600/80 mt-0.5">Awaiting moderation</div>
        </div>

        <div
          id="reviews-approved-count-card"
          onClick={() => handleStatusFilterChange('approved')}
          className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'approved'
              ? 'border-emerald-400 ring-2 ring-emerald-400/20 bg-emerald-50/30'
              : 'border-slate-200/80 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 text-xs font-bold mb-1">
            <span>Approved</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">{counts.approved}</div>
          <div className="text-[11px] text-emerald-600/80 mt-0.5">Live on storefront</div>
        </div>

        <div
          onClick={() => handleStatusFilterChange('rejected')}
          className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'rejected'
              ? 'border-rose-400 ring-2 ring-rose-400/20 bg-rose-50/30'
              : 'border-slate-200/80 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-700 text-xs font-bold mb-1">
            <span>Rejected</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600">{counts.rejected}</div>
          <div className="text-[11px] text-rose-600/80 mt-0.5">Spam & hidden</div>
        </div>
      </div>

      {/* Filter, Search & Sorting Controls Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Status Tabs with accurate server counts */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            <button
              type="button"
              id="review-tab-all"
              onClick={() => handleStatusFilterChange('all')}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Reviews ({counts.all})
            </button>
            <button
              type="button"
              id="review-tab-pending"
              onClick={() => handleStatusFilterChange('pending')}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'pending'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/50'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending ({counts.pending})</span>
            </button>
            <button
              type="button"
              id="review-tab-approved"
              onClick={() => handleStatusFilterChange('approved')}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'approved'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/50'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Approved ({counts.approved})</span>
            </button>
            <button
              type="button"
              id="review-tab-rejected"
              onClick={() => handleStatusFilterChange('rejected')}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'rejected'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/50'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Rejected ({counts.rejected})</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[240px] flex-1 lg:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search author, comment..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2 pl-9 pr-8 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filters Bar: Rating, Date, Sort, and Global Product Dropdown */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2.5 justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Global Product Selector (only visible when not in scoped view) */}
            {!scopedProduct && (
              <div className="relative">
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-1.5 pl-3 pr-7 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                >
                  <option value="all">All Catalog Products ({products.length})</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {/* Rating Filter Dropdown */}
            <div className="relative">
              <select
                value={ratingFilter}
                onChange={(e) => {
                  setRatingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="py-1.5 pl-3 pr-7 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
              >
                <option value="all">All Star Ratings</option>
                <option value="5">★★★★★ (5 Stars)</option>
                <option value="4">★★★★☆ (4 Stars)</option>
                <option value="3">★★★☆☆ (3 Stars)</option>
                <option value="2">★★☆☆☆ (2 Stars)</option>
                <option value="1">★☆☆☆☆ (1 Star)</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Date Filter Dropdown */}
            <div className="relative">
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="py-1.5 pl-3 pr-7 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
              >
                <option value="all">All Dates</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="older">Older than 30 Days</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="py-1.5 pl-3 pr-7 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
              >
                <option value="newest">Sort: Newest First</option>
                <option value="oldest">Sort: Oldest First</option>
                <option value="rating_desc">Sort: Highest Rating</option>
                <option value="rating_asc">Sort: Lowest Rating</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {(ratingFilter !== 'all' || dateFilter !== 'all' || searchQuery || statusFilter !== 'all') && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="py-1.5 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <strong>{filteredReviews.length}</strong> {filteredReviews.length === 1 ? 'review' : 'reviews'}
          </div>
        </div>
      </div>

      {/* Review List Content */}
      {isLoading ? (
        <div className="bg-white rounded-3xl p-16 border border-slate-200 text-center shadow-xs">
          <div className="w-10 h-10 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-800">Loading reviews from server...</h4>
          <p className="text-xs text-slate-500 mt-1">Retrieving verified review records and attachments.</p>
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-3xl p-8 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
          <h4 className="text-sm font-bold text-rose-900">Failed to load reviews</h4>
          <p className="text-xs text-rose-700 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={loadReviews}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="bg-white rounded-3xl p-14 border border-slate-200 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto border border-slate-100">
            <MessageSquare className="w-7 h-7 text-slate-300" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            {scopedProduct
              ? `No reviews found for "${scopedProduct.title}"`
              : 'No customer reviews found'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all' || ratingFilter !== 'all' || dateFilter !== 'all'
              ? 'No reviews match your current filter criteria. Try adjusting or resetting your search and filter parameters.'
              : scopedProduct
              ? 'No customer reviews have been submitted for this product yet. You can add an official staff review to get started.'
              : 'No customer reviews have been submitted across the catalog yet.'}
          </p>

          <div className="flex items-center justify-center gap-2 pt-2">
            {(searchQuery || statusFilter !== 'all' || ratingFilter !== 'all' || dateFilter !== 'all') ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            ) : canManage ? (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add First Review</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {paginatedReviews.map((rev) => {
            const product = productMap.get(rev.productId);
            const status = rev.status || 'approved';
            const isPending = status === 'pending';
            const isApproved = status === 'approved';
            const isRejected = status === 'rejected';

            return (
              <div
                key={rev.id}
                id={`review-item-${rev.id}`}
                className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all shadow-xs ${
                  isPending
                    ? 'border-amber-300 bg-amber-50/15'
                    : isRejected
                    ? 'border-rose-200 bg-rose-50/10'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left Column: Product Context & Reviewer Content */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Product Thumbnail (if in global mode or for visual verification) */}
                    {product?.imageUrl && (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-50"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      {/* Product Title Bar (if global mode or to verify product association) */}
                      {!scopedProduct && product && (
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-bold text-slate-900 truncate hover:text-rose-600">
                            {product.title}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            (৳{product.price.toLocaleString('en-BD')})
                          </span>
                        </div>
                      )}

                      {/* Reviewer Details Header */}
                      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 mb-2">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{rev.authorName || rev.author || 'Customer'}</span>
                        </span>

                        {rev.verifiedPurchase && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300/70">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            Verified Purchase
                          </span>
                        )}

                        <span className="text-slate-300">•</span>

                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>
                            {rev.createdAt
                              ? new Date(rev.createdAt).toLocaleString('en-US', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })
                              : rev.date || 'Unknown date'}
                          </span>
                        </span>

                        {rev.source === 'admin' && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200">
                            Staff Review
                          </span>
                        )}
                      </div>

                      {/* Star Rating Display */}
                      <div className="flex items-center gap-1 mb-2.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${
                              s <= rev.rating
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-200'
                            }`}
                          />
                        ))}
                        <span className="text-xs font-bold text-slate-800 ml-1">
                          {rev.rating}.0
                        </span>
                      </div>

                      {/* Review Text */}
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed break-words bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 mb-3">
                        {rev.comment}
                      </p>

                      {/* Customer Photo Attachments */}
                      {rev.images && rev.images.length > 0 && (
                        <div className="mb-3 space-y-1.5">
                          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                            <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                            Customer Review Photos ({rev.images.length})
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {rev.images.map((img, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setPreviewImage(img)}
                                className="relative group w-14 h-14 rounded-xl overflow-hidden border border-slate-200 hover:border-rose-400 transition-all shrink-0 cursor-pointer shadow-2xs"
                                title="Click to view full photo"
                              >
                                <img
                                  src={img}
                                  alt={`Review photo ${idx + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Eye className="w-4 h-4 text-white" />
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Moderation Audit Attribution */}
                      {rev.approvedBy && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <span>Moderated by: <strong className="text-slate-700">{rev.approvedBy}</strong></span>
                          {rev.approvedAt && (
                            <span>({new Date(rev.approvedAt).toLocaleDateString('en-GB')})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Status Badges & Action Toolbar */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    {/* Status Badge */}
                    <div>
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-300">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Pending Review
                        </span>
                      )}
                      {isApproved && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          Approved (Live)
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 bg-rose-100 px-3 py-1 rounded-full border border-rose-300">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          Rejected (Hidden)
                        </span>
                      )}
                    </div>

                    {/* Action Buttons Toolbar */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* View Details Button */}
                      <button
                        type="button"
                        onClick={() => setViewingReview(rev)}
                        className="p-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        title="View complete review details"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-600" />
                        <span className="hidden md:inline">Details</span>
                      </button>

                      {/* Approve Action */}
                      {canManage && !isApproved && (
                        <button
                          type="button"
                          id={`approve-review-${rev.id}`}
                          disabled={actionLoadingId === rev.id}
                          onClick={() => handleUpdateStatus(rev.id, 'approved')}
                          className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                          title="Approve review (publishes to storefront and updates product rating)"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                      )}

                      {/* Reject Action */}
                      {canManage && !isRejected && (
                        <button
                          type="button"
                          id={`reject-review-${rev.id}`}
                          disabled={actionLoadingId === rev.id}
                          onClick={() => handleUpdateStatus(rev.id, 'rejected')}
                          className="py-1.5 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          title="Reject review"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      )}

                      {/* Hold / Revert Action */}
                      {canManage && !isPending && (
                        <button
                          type="button"
                          disabled={actionLoadingId === rev.id}
                          onClick={() => handleUpdateStatus(rev.id, 'pending')}
                          className="py-1.5 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          title="Revert to pending moderation"
                        >
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>Hold</span>
                        </button>
                      )}

                      {/* Edit Review Action */}
                      {canManage && (
                        <button
                          type="button"
                          id={`edit-review-btn-${rev.id}`}
                          onClick={() => handleOpenEditModal(rev)}
                          className="p-1.5 px-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Edit review text, rating, or status"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                          <span className="hidden md:inline">Edit</span>
                        </button>
                      )}

                      {/* Delete Action */}
                      {canDelete && (
                        <button
                          type="button"
                          id={`delete-review-btn-${rev.id}`}
                          disabled={actionLoadingId === rev.id}
                          onClick={() => setDeleteCandidate(rev)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Permanently delete review"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 bg-white p-3 px-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">
            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filteredReviews.length} total)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(Math.max(0, currentPage - 3), currentPage + 2)
              .map((pageNo) => (
                <button
                  key={pageNo}
                  type="button"
                  onClick={() => setCurrentPage(pageNo)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    currentPage === pageNo
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {pageNo}
                </button>
              ))}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 1. View Details Modal */}
      {viewingReview && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setViewingReview(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden space-y-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">Review Inspection Details</h3>
                  <p className="text-xs text-slate-500">ID: {viewingReview.id}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingReview(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Product Info */}
              {(() => {
                const prod = productMap.get(viewingReview.productId);
                return prod ? (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    {prod.imageUrl && (
                      <img
                        src={prod.imageUrl}
                        alt={prod.title}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Target Product</span>
                      <h4 className="text-xs font-bold text-slate-900 truncate">{prod.title}</h4>
                      <span className="text-[11px] font-semibold text-slate-500">
                        ৳{prod.price.toLocaleString('en-BD')} • Current Rating: {prod.rating?.toFixed(1) || '5.0'}★
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-2xl text-xs text-slate-600">
                    Product ID: <strong>{viewingReview.productId}</strong>
                  </div>
                );
              })()}

              {/* Reviewer & Status metadata */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-2xl text-xs border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[11px] font-semibold">Author</span>
                  <strong className="text-slate-900">{viewingReview.authorName || viewingReview.author || 'Customer'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-semibold">Verification</span>
                  <span className={viewingReview.verifiedPurchase ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                    {viewingReview.verifiedPurchase ? '✓ Verified Purchase' : 'Not verified'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-semibold">Date Submitted</span>
                  <span className="text-slate-700">
                    {viewingReview.createdAt
                      ? new Date(viewingReview.createdAt).toLocaleString('en-US')
                      : viewingReview.date || 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-semibold">Status</span>
                  <span className={`font-bold capitalize ${
                    viewingReview.status === 'approved'
                      ? 'text-emerald-600'
                      : viewingReview.status === 'rejected'
                      ? 'text-rose-600'
                      : 'text-amber-600'
                  }`}>
                    {viewingReview.status || 'approved'}
                  </span>
                </div>
              </div>

              {/* Stars */}
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1">Customer Rating</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-5 h-5 ${
                        s <= viewingReview.rating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-200'
                      }`}
                    />
                  ))}
                  <span className="text-sm font-bold text-slate-800 ml-1">
                    {viewingReview.rating} out of 5 Stars
                  </span>
                </div>
              </div>

              {/* Comment */}
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1">Review Feedback Text</span>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {viewingReview.comment}
                </div>
              </div>

              {/* Photos */}
              {viewingReview.images && viewingReview.images.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1.5">
                    Attached Photos ({viewingReview.images.length})
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {viewingReview.images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPreviewImage(img)}
                        className="relative group rounded-xl overflow-hidden aspect-square border border-slate-200 hover:border-rose-400 transition-all cursor-pointer"
                      >
                        <img src={img} alt="Attachment" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="w-5 h-5 text-white" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Moderation audit info */}
              {viewingReview.approvedBy && (
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-100">
                  Moderation Audit: Approved by <strong>{viewingReview.approvedBy}</strong> on{' '}
                  {viewingReview.approvedAt ? new Date(viewingReview.approvedAt).toLocaleString('en-US') : 'N/A'}.
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {canManage && viewingReview.status !== 'approved' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(viewingReview.id, 'approved')}
                    className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Approve
                  </button>
                )}
                {canManage && viewingReview.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(viewingReview.id, 'rejected')}
                    className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Reject
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenEditModal(viewingReview);
                      setViewingReview(null);
                    }}
                    className="py-1.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setViewingReview(null)}
                className="py-1.5 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Edit Review Modal */}
      {editingReview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">Edit Customer Review</h3>
                  <p className="text-xs text-slate-500">Update rating, comment, or moderation status</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingReview(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEditedReview} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Author Name</label>
                  <input
                    type="text"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    required
                    maxLength={60}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rating (1 to 5 Stars)</label>
                  <div className="flex items-center gap-1 py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setEditRating(star)}
                        className="p-1 focus:outline-none cursor-pointer"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= editRating
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-200'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-700 ml-1.5">{editRating}★</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Review Feedback</label>
                <textarea
                  rows={3}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  required
                  maxLength={1000}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="editVerifiedCheck"
                    checked={editVerified}
                    onChange={(e) => setEditVerified(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <label htmlFor="editVerifiedCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Verified Purchase Badge
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Review Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ReviewStatus)}
                    className="w-full py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    <option value="approved">Approved (Live on Catalog)</option>
                    <option value="pending">Pending Moderation</option>
                    <option value="rejected">Rejected (Hidden)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingReview(null)}
                  className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="py-2 px-5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Image Preview Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-2xl max-h-[85vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors z-10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              alt="Enlarged review photo"
              className="w-full h-auto max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}

      {/* 4. Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">Delete Review Permanently</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
              Are you sure you want to permanently delete the review by{' '}
              <strong>"{deleteCandidate.authorName || deleteCandidate.author}"</strong>? Public product ratings and counts will be recalculated automatically.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-delete-review-btn"
                onClick={handleDeleteReview}
                disabled={actionLoadingId === deleteCandidate.id}
                className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoadingId === deleteCandidate.id ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Add Staff Review Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Star className="w-5 h-5 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">Add Official Review</h3>
                  <p className="text-xs text-slate-500">Publish staff review or store endorsement</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateStaffReview} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Product</label>
                {scopedProduct ? (
                  <div className="py-2 px-3 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-900">
                    {scopedProduct.title} (Locked to current product)
                  </div>
                ) : (
                  <select
                    value={formProductId}
                    onChange={(e) => setFormProductId(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Author Name</label>
                  <input
                    type="text"
                    value={formAuthor}
                    onChange={(e) => setFormAuthor(e.target.value)}
                    required
                    maxLength={60}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rating (1 to 5 Stars)</label>
                  <div className="flex items-center gap-1 py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFormRating(star)}
                        className="p-1 focus:outline-none cursor-pointer"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= formRating
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-200'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-700 ml-1.5">{formRating}★</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Review Feedback</label>
                <textarea
                  rows={3}
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  placeholder="Share authentic product feedback, quality highlights, or staff test impressions..."
                  required
                  maxLength={1000}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="verifiedCheck"
                    checked={formVerified}
                    onChange={(e) => setFormVerified(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <label htmlFor="verifiedCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Verified Purchase Badge
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Initial Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ReviewStatus)}
                    className="w-full py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    <option value="approved">Approved (Live on Catalog)</option>
                    <option value="pending">Pending Moderation</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-staff-review-btn"
                  disabled={formSubmitting}
                  className="py-2 px-5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? 'Publishing...' : 'Save Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
