import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Star,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  Shield,
  MessageSquare,
  Package,
  User,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  X,
  Check,
  Calendar,
  Sparkles,
  Inbox,
  ExternalLink,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { reviewsApi } from '../services/storeApi';
import { ProductReview, Product } from '../types';

export interface AdminReviewsTabProps {
  onPendingCountChange?: (count: number) => void;
}

/**
 * Format timestamp safely to user-friendly local date & time
 */
function formatReviewDate(dateStr?: string | null): string {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get human-readable relative time (e.g. 5m ago, 2h ago, 3d ago)
 */
function getRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    return `${Math.floor(diffMonths / 12)}y ago`;
  } catch {
    return '';
  }
}

/**
 * Filters review timestamp by preset date ranges
 */
function matchesDateFilter(dateStr: string | undefined, filter: string): boolean {
  if (filter === 'all' || !filter) return true;
  if (!dateStr) return false;
  try {
    const reviewDate = new Date(dateStr);
    if (isNaN(reviewDate.getTime())) return false;
    const now = new Date();

    if (filter === 'today') {
      return (
        reviewDate.getFullYear() === now.getFullYear() &&
        reviewDate.getMonth() === now.getMonth() &&
        reviewDate.getDate() === now.getDate()
      );
    }
    if (filter === '7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return reviewDate >= sevenDaysAgo;
    }
    if (filter === '30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return reviewDate >= thirtyDaysAgo;
    }
    if (filter === 'thisMonth') {
      return (
        reviewDate.getFullYear() === now.getFullYear() &&
        reviewDate.getMonth() === now.getMonth()
      );
    }
  } catch {}
  return true;
}

export const AdminReviewsTab: React.FC<AdminReviewsTabProps> = ({ onPendingCountChange }) => {
  const { products, currentUser, hasPermission, showNotification } = useStore();

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Primary Tabs: Pending | Approved | All
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');

  // Filters: Product | Rating | Status | Date | Search
  const [productFilter, setProductFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<ProductReview | null>(null);

  // Form states for Create Admin Review
  const [createProductId, setCreateProductId] = useState<string>('');
  const [createAuthor, setCreateAuthor] = useState('');
  const [createRating, setCreateRating] = useState(5);
  const [createComment, setCreateComment] = useState('');
  const [createVerified, setCreateVerified] = useState(true);
  const [createStatus, setCreateStatus] = useState<'approved' | 'pending'>('approved');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Form states for Edit Review
  const [editAuthor, setEditAuthor] = useState('');
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState('');
  const [editStatus, setEditStatus] = useState<string>('approved');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Processing & Deletion state
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Expandable review comments map
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

  // Central Permissions enforcement
  const canView = hasPermission ? hasPermission('reviews.view') : true;
  const canApprove = hasPermission ? hasPermission('reviews.approve') : false;
  const canDelete = hasPermission ? hasPermission('reviews.delete') : false;
  const canCreate = hasPermission ? hasPermission('reviews.create') : false;
  const canEdit = hasPermission ? hasPermission('reviews.edit') : false;

  // Map products by ID and slug for fast lookup
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    (products || []).forEach((p) => {
      map.set(p.id, p);
      if (p.slug) map.set(p.slug, p);
    });
    return map;
  }, [products]);

  // Fetch reviews from server
  const fetchReviews = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getAllAdmin();
      setReviews(data);
      const pendingNum = data.filter((r) => (r.status || 'approved') === 'pending').length;
      onPendingCountChange?.(pendingNum);
    } catch (err: any) {
      console.error('Error fetching admin reviews:', err);
      setError(err?.message || 'Failed to load reviews. Please verify server permissions.');
    } finally {
      setIsLoading(false);
    }
  }, [canView, onPendingCountChange]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Metric counts
  const pendingCount = useMemo(
    () => reviews.filter((r) => (r.status || 'approved') === 'pending').length,
    [reviews]
  );
  const approvedCount = useMemo(
    () => reviews.filter((r) => (r.status || 'approved') === 'approved').length,
    [reviews]
  );
  const rejectedCount = useMemo(
    () => reviews.filter((r) => r.status === 'rejected').length,
    [reviews]
  );

  // Sync pending count to parent when reviews change
  useEffect(() => {
    onPendingCountChange?.(pendingCount);
  }, [pendingCount, onPendingCountChange]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      productFilter !== 'all' ||
      ratingFilter !== 'all' ||
      statusFilter !== 'all' ||
      dateFilter !== 'all' ||
      searchQuery.trim().length > 0
    );
  }, [productFilter, ratingFilter, statusFilter, dateFilter, searchQuery]);

  const resetAllFilters = () => {
    setProductFilter('all');
    setRatingFilter('all');
    setStatusFilter('all');
    setDateFilter('all');
    setSearchQuery('');
  };

  // Filtered reviews based on active tab and all 5 filters
  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      const curStatus = (r.status || 'approved').toLowerCase();

      // Tab filter: Pending | Approved | All
      if (activeTab === 'pending' && curStatus !== 'pending') return false;
      if (activeTab === 'approved' && curStatus !== 'approved') return false;

      // Status dropdown filter (especially useful on 'All' tab)
      if (statusFilter !== 'all' && curStatus !== statusFilter.toLowerCase()) return false;

      // Product filter
      if (productFilter !== 'all' && r.productId !== productFilter) return false;

      // Rating filter
      if (ratingFilter !== 'all') {
        const targetRating = Number(ratingFilter);
        if (Math.round(r.rating) !== targetRating) return false;
      }

      // Date filter
      if (!matchesDateFilter(r.createdAt, dateFilter)) return false;

      // Search query (matches Customer, Product Title, or Comment)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const author = (r.authorName || r.author || '').toLowerCase();
        const comment = (r.comment || '').toLowerCase();
        const prod = productMap.get(r.productId);
        const prodTitle = (prod?.title || '').toLowerCase();
        if (!author.includes(q) && !comment.includes(q) && !prodTitle.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [reviews, activeTab, statusFilter, productFilter, ratingFilter, dateFilter, searchQuery, productMap]);

  // -------------------------------------------------------------
  // ACTION: Approve Review
  // -------------------------------------------------------------
  const handleApprove = async (review: ProductReview) => {
    if (!canApprove) {
      showNotification('error', 'Forbidden', 'You do not have permission to approve reviews (reviews.approve).');
      return;
    }
    setProcessingId(review.id);
    try {
      const updated = await reviewsApi.approve(review.id);
      setReviews((prev) => prev.map((r) => (r.id === review.id ? updated : r)));
      showNotification(
        'success',
        'Review Approved',
        `Review by "${review.authorName || review.author || 'Shopper'}" is now live in the store.`
      );
    } catch (err: any) {
      showNotification('error', 'Approval Failed', err?.message || 'Failed to approve review.');
    } finally {
      setProcessingId(null);
    }
  };

  // -------------------------------------------------------------
  // ACTION: Reject Review (Moderation option for staff)
  // -------------------------------------------------------------
  const handleReject = async (review: ProductReview) => {
    if (!canApprove) {
      showNotification('error', 'Forbidden', 'You do not have permission to moderate reviews (reviews.approve).');
      return;
    }
    setProcessingId(review.id);
    try {
      const updated = await reviewsApi.updateStatus(review.id, 'rejected');
      setReviews((prev) => prev.map((r) => (r.id === review.id ? updated : r)));
      showNotification(
        'info',
        'Review Rejected',
        `Review by "${review.authorName || review.author || 'Shopper'}" has been marked as rejected.`
      );
    } catch (err: any) {
      showNotification('error', 'Rejection Failed', err?.message || 'Failed to update review status.');
    } finally {
      setProcessingId(null);
    }
  };

  // -------------------------------------------------------------
  // ACTION: Edit Review
  // -------------------------------------------------------------
  const openEditModal = (review: ProductReview) => {
    if (!canEdit) {
      showNotification('error', 'Forbidden', 'You do not have permission to edit reviews (reviews.edit).');
      return;
    }
    setSelectedReview(review);
    setEditAuthor(review.authorName || review.author || '');
    setEditRating(review.rating || 5);
    setEditComment(review.comment || '');
    setEditStatus(review.status || 'approved');
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview || !canEdit) return;

    if (!editAuthor.trim()) {
      showNotification('error', 'Validation Error', 'Customer / Author name is required.');
      return;
    }
    if (!editComment.trim()) {
      showNotification('error', 'Validation Error', 'Review comment cannot be empty.');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const updated = await reviewsApi.update(selectedReview.id, {
        authorName: editAuthor.trim(),
        rating: editRating,
        comment: editComment.trim(),
        status: editStatus,
      });
      setReviews((prev) => prev.map((r) => (r.id === selectedReview.id ? updated : r)));
      setIsEditModalOpen(false);
      showNotification('success', 'Review Updated', 'Customer review details saved successfully.');
    } catch (err: any) {
      showNotification('error', 'Update Failed', err?.message || 'Failed to update review.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // -------------------------------------------------------------
  // ACTION: Delete Review
  // -------------------------------------------------------------
  const openDeleteModal = (review: ProductReview) => {
    if (!canDelete) {
      showNotification('error', 'Forbidden', 'You do not have permission to delete reviews (reviews.delete).');
      return;
    }
    setSelectedReview(review);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedReview || !canDelete) return;

    setIsDeleting(true);
    try {
      await reviewsApi.delete(selectedReview.id);
      setReviews((prev) => prev.filter((r) => r.id !== selectedReview.id));
      setIsDeleteModalOpen(false);
      showNotification('success', 'Review Deleted', 'The customer review has been permanently deleted.');
    } catch (err: any) {
      showNotification('error', 'Deletion Failed', err?.message || 'Failed to delete review.');
    } finally {
      setIsDeleting(false);
    }
  };

  // -------------------------------------------------------------
  // ACTION: Add Admin Review (Optional Staff Creation)
  // -------------------------------------------------------------
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      showNotification('error', 'Forbidden', 'You do not have permission to create reviews (reviews.create).');
      return;
    }
    if (!createProductId) {
      showNotification('error', 'Validation Error', 'Please select a product for the review.');
      return;
    }
    if (!createComment.trim()) {
      showNotification('error', 'Validation Error', 'Review comment is required.');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const created = await reviewsApi.createAdmin({
        productId: createProductId,
        authorName: createAuthor.trim() || currentUser?.name || 'Store Staff',
        rating: createRating,
        comment: createComment.trim(),
        verifiedPurchase: createVerified,
        status: createStatus,
      });
      setReviews((prev) => [created, ...prev]);
      setIsCreateModalOpen(false);
      // Reset form
      setCreateAuthor('');
      setCreateComment('');
      setCreateRating(5);
      showNotification('success', 'Review Created', 'Admin review published successfully.');
    } catch (err: any) {
      showNotification('error', 'Creation Failed', err?.message || 'Failed to create review.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const toggleCommentExpand = (id: string) => {
    setExpandedComments((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // -------------------------------------------------------------
  // ACCESS DENIED VIEW: If user lacks reviews.view
  // -------------------------------------------------------------
  if (!canView) {
    return (
      <div className="p-8 sm:p-12 text-center bg-white border border-rose-200 rounded-3xl shadow-xs space-y-4 max-w-xl mx-auto my-12">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-rose-50/50">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Access Restricted (403 Forbidden)</h3>
          <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">
            Your account does not possess the <code className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-mono font-bold">reviews.view</code> permission required to view or moderate customer reviews.
          </p>
        </div>
        <p className="text-[11px] text-slate-400">
          Please contact a Store Super Admin if you require access to Customer Reviews management.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================ */}
      {/* 1. TOP HEADER: TITLE, SUMMARY, AND ACTION BUTTONS           */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-600 rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-slate-900 tracking-tight flex items-center gap-2">
                Customer Reviews Management
                {pendingCount > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 bg-amber-500 text-slate-950 rounded-full animate-pulse">
                    {pendingCount} Pending
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit, moderate, and manage customer product feedback. Customer submissions require approval before appearing on the storefront.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchReviews}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh review records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-600' : 'text-slate-500'}`} />
            <span>Refresh</span>
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => {
                if (products.length > 0 && !createProductId) {
                  setCreateProductId(products[0].id);
                }
                setIsCreateModalOpen(true);
              }}
              className="px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Review</span>
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. STATS & TAB SELECTOR: PENDING | APPROVED | ALL            */}
      {/* ============================================================ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 sm:p-2.5 shadow-2xs">
        <div className="grid grid-cols-3 gap-2">
          {/* TAB 1: PENDING */}
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`p-3 sm:p-4 rounded-xl text-left transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 border ${
              activeTab === 'pending'
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-950 shadow-xs ring-1 ring-amber-500/20'
                : 'bg-slate-50/60 border-slate-200/70 hover:bg-slate-50 text-slate-600'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  activeTab === 'pending'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold flex items-center gap-1.5">
                  Pending
                  {pendingCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
                  )}
                </div>
                <div className="text-[11px] text-slate-500 hidden sm:block">Awaiting moderation</div>
              </div>
            </div>
            <div
              className={`text-lg sm:text-xl font-black font-display px-2.5 py-0.5 rounded-lg self-start sm:self-center font-mono ${
                activeTab === 'pending'
                  ? 'bg-amber-500/20 text-amber-900 border border-amber-500/30'
                  : 'bg-slate-200/60 text-slate-700'
              }`}
            >
              {pendingCount}
            </div>
          </button>

          {/* TAB 2: APPROVED */}
          <button
            type="button"
            onClick={() => setActiveTab('approved')}
            className={`p-3 sm:p-4 rounded-xl text-left transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 border ${
              activeTab === 'approved'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-950 shadow-xs ring-1 ring-emerald-500/20'
                : 'bg-slate-50/60 border-slate-200/70 hover:bg-slate-50 text-slate-600'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  activeTab === 'approved'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold">Approved</div>
                <div className="text-[11px] text-slate-500 hidden sm:block">Live on storefront</div>
              </div>
            </div>
            <div
              className={`text-lg sm:text-xl font-black font-display px-2.5 py-0.5 rounded-lg self-start sm:self-center font-mono ${
                activeTab === 'approved'
                  ? 'bg-emerald-500/20 text-emerald-900 border border-emerald-500/30'
                  : 'bg-slate-200/60 text-slate-700'
              }`}
            >
              {approvedCount}
            </div>
          </button>

          {/* TAB 3: ALL */}
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`p-3 sm:p-4 rounded-xl text-left transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 border ${
              activeTab === 'all'
                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                : 'bg-slate-50/60 border-slate-200/70 hover:bg-slate-50 text-slate-600'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  activeTab === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold">All Reviews</div>
                <div className={`text-[11px] hidden sm:block ${activeTab === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Total database records
                </div>
              </div>
            </div>
            <div
              className={`text-lg sm:text-xl font-black font-display px-2.5 py-0.5 rounded-lg self-start sm:self-center font-mono ${
                activeTab === 'all'
                  ? 'bg-slate-800 text-slate-100 border border-slate-700'
                  : 'bg-slate-200/60 text-slate-700'
              }`}
            >
              {reviews.length}
            </div>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. FILTERS BAR: PRODUCT | RATING | STATUS | DATE | SEARCH     */}
      {/* ============================================================ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-amber-600" />
            <span>Filter Reviews:</span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 hover:underline cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Clear All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
          {/* 1. Search Query Filter */}
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search customer, product, or comment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-800"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 2. Product Filter */}
          <div className="lg:col-span-3">
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">📦 All Products ({products.length})</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Rating Filter */}
          <div className="lg:col-span-2">
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">⭐ All Ratings</option>
              <option value="5">5 Stars (★★★★★)</option>
              <option value="4">4 Stars (★★★★☆)</option>
              <option value="3">3 Stars (★★★☆☆)</option>
              <option value="2">2 Stars (★★☆☆☆)</option>
              <option value="1">1 Star (★☆☆☆☆)</option>
            </select>
          </div>

          {/* 4. Status Filter */}
          <div className="lg:col-span-1.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">Status: All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* 5. Date Filter */}
          <div className="lg:col-span-1.5">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-800 font-medium cursor-pointer"
            >
              <option value="all">📅 All Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="thisMonth">This Month</option>
            </select>
          </div>
        </div>

        {/* Filter Summary Status Line */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <div>
            Showing <strong className="text-slate-800">{filteredReviews.length}</strong> of{' '}
            <strong className="text-slate-800">{reviews.length}</strong> total reviews
            {activeTab !== 'all' && (
              <span> in <strong className="capitalize text-slate-700">{activeTab}</strong> tab</span>
            )}
          </div>
          {hasActiveFilters && (
            <span className="text-amber-700 font-medium">Filtered view active</span>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. REVIEW CARDS LIST WITH SKELETONS, EMPTY, AND ERROR STATES */}
      {/* ============================================================ */}
      {isLoading ? (
        /* LOADING SKELETON STATES */
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs animate-pulse space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 bg-slate-200 rounded-md" />
                    <div className="h-3 w-20 bg-slate-100 rounded-md" />
                  </div>
                </div>
                <div className="h-6 w-24 bg-slate-200 rounded-full" />
              </div>
              <div className="h-12 w-full bg-slate-100 rounded-xl" />
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="h-4 w-40 bg-slate-200 rounded-md" />
                <div className="h-8 w-44 bg-slate-200 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        /* ERROR STATE */
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-sm font-bold text-rose-900">Failed to load customer reviews</h3>
          <p className="text-xs text-rose-700 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={fetchReviews}
            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : filteredReviews.length === 0 ? (
        /* EMPTY STATES */
        <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center space-y-4 shadow-2xs">
          {activeTab === 'pending' && !hasActiveFilters ? (
            /* EMPTY PENDING QUEUE */
            <>
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-emerald-50/50">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-bold text-lg text-slate-900">
                  Inbox Zero! All Reviews Moderated
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  There are no customer reviews currently pending moderation. Any newly submitted product reviews will appear here automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>View All Reviews ({reviews.length})</span>
              </button>
            </>
          ) : activeTab === 'approved' && !hasActiveFilters ? (
            /* EMPTY APPROVED QUEUE */
            <>
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <Inbox className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-bold text-lg text-slate-900">No Approved Reviews Yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Approved customer reviews will appear here and become publicly visible to store visitors.
                </p>
              </div>
            </>
          ) : (
            /* FILTER RESULTS EMPTY */
            <>
              <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto">
                <Search className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display font-bold text-lg text-slate-900">No Matching Reviews Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No reviews match your selected filter criteria. Try adjusting your search query, product, or date selection.
                </p>
              </div>
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-4 py-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            </>
          )}
        </div>
      ) : (
        /* REVIEWS LIST ITEMS */
        <div className="space-y-3.5">
          {filteredReviews.map((rev) => {
            const product = productMap.get(rev.productId);
            const statusClean = (rev.status || 'approved').toLowerCase();
            const isProcessing = processingId === rev.id;
            const isExpanded = Boolean(expandedComments[rev.id]);
            const isLongComment = (rev.comment || '').length > 180;
            const authorInitial = (rev.authorName || rev.author || 'C').charAt(0).toUpperCase();

            return (
              <div
                key={rev.id}
                id={`admin-review-card-${rev.id}`}
                className={`bg-white border rounded-2xl p-4 sm:p-5 transition-all shadow-2xs ${
                  statusClean === 'pending'
                    ? 'border-amber-300 bg-amber-50/20'
                    : statusClean === 'rejected'
                    ? 'border-rose-200 bg-rose-50/10'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Review Header: Customer, Rating, Status, Date */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  {/* Customer Identity */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold font-display text-sm shrink-0 shadow-2xs ${
                        statusClean === 'pending'
                          ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300/60'
                          : rev.verifiedPurchase
                          ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300/60'
                          : 'bg-slate-100 text-slate-700 ring-2 ring-slate-200'
                      }`}
                    >
                      {authorInitial}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 truncate">
                          {rev.authorName || rev.author || 'Anonymous Shopper'}
                        </span>

                        {/* Verified Purchase Badge */}
                        {rev.verifiedPurchase ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                            title="Server-verified purchase from a legitimate store order"
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>Verified Purchase</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200"
                            title="Unverified submission"
                          >
                            <Shield className="w-3 h-3 text-slate-400" />
                            <span>Unverified</span>
                          </span>
                        )}
                      </div>

                      {/* Date & relative time */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {formatReviewDate(rev.createdAt)}
                        </span>
                        {getRelativeTime(rev.createdAt) && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-md font-mono">
                            {getRelativeTime(rev.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rating Stars & Status Badge */}
                  <div className="flex items-center gap-2.5 sm:self-start shrink-0 flex-wrap">
                    {/* Star Rating Display */}
                    <div className="flex items-center gap-1 bg-amber-50/70 border border-amber-200/80 px-2.5 py-1 rounded-xl">
                      <div className="flex items-center">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3.5 h-3.5 ${
                              star <= Math.round(rev.rating)
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-amber-900 ml-1">
                        {typeof rev.rating === 'number' ? rev.rating.toFixed(1) : rev.rating}★
                      </span>
                    </div>

                    {/* Status Pill Badge */}
                    {statusClean === 'pending' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
                        <span>Pending</span>
                      </span>
                    ) : statusClean === 'approved' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Approved</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs">
                        <XCircle className="w-3.5 h-3.5 text-rose-700" />
                        <span>Rejected</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Review Body: Product information & Comment text */}
                <div className="py-3 space-y-2.5">
                  {/* Product Association Card */}
                  <div className="flex items-center gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {product?.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                        <Package className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Product:
                        </span>
                        {product?.price && (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded font-mono">
                            ৳{product.price}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-800 truncate" title={product?.title || rev.productId}>
                        {product?.title || `Product ID: ${rev.productId}`}
                      </div>
                    </div>
                  </div>

                  {/* Customer Comment Text */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-100/90 shadow-2xs text-xs text-slate-700 leading-relaxed font-normal">
                    <p className="whitespace-pre-wrap">
                      {isLongComment && !isExpanded
                        ? `${rev.comment.slice(0, 180)}...`
                        : rev.comment}
                    </p>
                    {isLongComment && (
                      <button
                        type="button"
                        onClick={() => toggleCommentExpand(rev.id)}
                        className="mt-1.5 text-[11px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3 h-3" /> Show Less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" /> Read Full Review
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Approval Audit Trail (if available) */}
                  {rev.approvedAt && (
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1">
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span>
                        Approved {formatReviewDate(rev.approvedAt)}
                        {rev.approvedBy ? ` by ${rev.approvedBy}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* ============================================================ */}
                {/* ACTION BUTTONS: PERMISSION CONTROLLED (Approve, Edit, Delete) */}
                {/* Users without permission will NOT see these action buttons   */}
                {/* ============================================================ */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] text-slate-400 font-mono">
                    ID: {rev.id}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* ACTION 1: APPROVE (Requires reviews.approve) */}
                    {canApprove && statusClean !== 'approved' && (
                      <button
                        type="button"
                        id={`review-approve-btn-${rev.id}`}
                        onClick={() => handleApprove(rev)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                        title="Approve review and publish live to storefront"
                      >
                        {isProcessing ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>Approve</span>
                      </button>
                    )}

                    {/* MODERATION ACTION: REJECT (Requires reviews.approve) */}
                    {canApprove && statusClean === 'pending' && (
                      <button
                        type="button"
                        id={`review-reject-btn-${rev.id}`}
                        onClick={() => handleReject(rev)}
                        disabled={isProcessing}
                        className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                        title="Reject inappropriate or spam review"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    )}

                    {/* ACTION 2: EDIT (Requires reviews.edit) */}
                    {canEdit && (
                      <button
                        type="button"
                        id={`review-edit-btn-${rev.id}`}
                        onClick={() => openEditModal(rev)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Edit customer review text, rating, or author"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Edit</span>
                      </button>
                    )}

                    {/* ACTION 3: DELETE (Requires reviews.delete) */}
                    {canDelete && (
                      <button
                        type="button"
                        id={`review-delete-btn-${rev.id}`}
                        onClick={() => openDeleteModal(rev)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Permanently delete review"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. MODALS: EDIT REVIEW MODAL                                */}
      {/* ============================================================ */}
      {isEditModalOpen && selectedReview && canEdit && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Edit Customer Review</h3>
                  <p className="text-xs text-slate-500">Modify review details, rating, and status</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Product Info */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/70 text-xs text-slate-600">
                <span className="font-semibold text-slate-500 block text-[10px] uppercase">Product:</span>
                <span className="font-bold text-slate-800">
                  {productMap.get(selectedReview.productId)?.title || selectedReview.productId}
                </span>
              </div>

              {/* Author / Customer Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Customer / Author Name
                </label>
                <input
                  type="text"
                  value={editAuthor}
                  onChange={(e) => setEditAuthor(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-900 font-medium"
                  required
                />
              </div>

              {/* Rating Star Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Star Rating: <strong className="text-amber-600 font-bold">{editRating} / 5 Stars</strong>
                </label>
                <div className="flex items-center gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setEditRating(star)}
                      className="p-1 hover:scale-110 transition-transform cursor-pointer"
                      title={`${star} Star${star > 1 ? 's' : ''}`}
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= editRating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Review Comment */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Review Comment Text
                </label>
                <textarea
                  rows={4}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-900 leading-relaxed font-normal"
                  required
                />
              </div>

              {/* Moderation Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Moderation Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-900 font-bold cursor-pointer"
                >
                  <option value="pending">⏳ Pending (Hidden from store until approved)</option>
                  <option value="approved">✅ Approved (Live on storefront)</option>
                  <option value="rejected">❌ Rejected (Hidden from storefront)</option>
                </select>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingEdit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. MODALS: DELETE REVIEW CONFIRMATION MODAL                 */}
      {/* ============================================================ */}
      {isDeleteModalOpen && selectedReview && canDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-rose-50/50">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-display font-bold text-base text-slate-900">
                Permanently Delete Review?
              </h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete this review by{' '}
                <strong className="text-slate-800">
                  "{selectedReview.authorName || selectedReview.author || 'Shopper'}"
                </strong>
                ? This action cannot be undone.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-700">
                Product: {productMap.get(selectedReview.productId)?.title || selectedReview.productId}
              </div>
              <div className="text-slate-500 italic line-clamp-2">
                "{selectedReview.comment}"
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-delete-review-btn"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Review</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. MODALS: CREATE ADMIN REVIEW MODAL                        */}
      {/* ============================================================ */}
      {isCreateModalOpen && canCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Add Admin Review</h3>
                  <p className="text-xs text-slate-500">Author and publish a customer review administratively</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Product Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select Product *
                </label>
                <select
                  value={createProductId}
                  onChange={(e) => setCreateProductId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-900 font-medium cursor-pointer"
                  required
                >
                  <option value="" disabled>-- Select a product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Author Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Customer / Reviewer Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Tanvir Hasan"
                  value={createAuthor}
                  onChange={(e) => setCreateAuthor(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-900 font-medium"
                />
              </div>

              {/* Star Rating Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Rating: <strong className="text-amber-600">{createRating} / 5 Stars</strong>
                </label>
                <div className="flex items-center gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setCreateRating(star)}
                      className="p-1 hover:scale-110 transition-transform cursor-pointer"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= createRating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Review Comment *
                </label>
                <textarea
                  rows={3}
                  placeholder="Write the customer's feedback or testimonial..."
                  value={createComment}
                  onChange={(e) => setCreateComment(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-900 font-normal"
                  required
                />
              </div>

              {/* Verified Purchase and Status toggles */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Verified Purchase Badge
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={createVerified}
                      onChange={(e) => setCreateVerified(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-medium text-slate-700">Display as Verified</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Publish Status
                  </label>
                  <select
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as any)}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 text-slate-900 font-medium cursor-pointer"
                  >
                    <option value="approved">Approved (Live)</option>
                    <option value="pending">Pending Moderation</option>
                  </select>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmittingCreate}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingCreate && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Publish Review</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
