import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Star,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  MessageSquare,
  Package,
  User,
  ShieldAlert,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { reviewsApi } from '../services/storeApi';
import { ProductReview, Product } from '../types';

export const AdminReviewsTab: React.FC = () => {
  const { products, currentUser, hasPermission, showNotification } = useStore();

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<ProductReview | null>(null);

  // Form states for Create
  const [createProductId, setCreateProductId] = useState<string>('');
  const [createAuthor, setCreateAuthor] = useState('');
  const [createRating, setCreateRating] = useState(5);
  const [createComment, setCreateComment] = useState('');
  const [createVerified, setCreateVerified] = useState(true);
  const [createStatus, setCreateStatus] = useState<'approved' | 'pending'>('approved');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Form states for Edit
  const [editAuthor, setEditAuthor] = useState('');
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState('');
  const [editStatus, setEditStatus] = useState<string>('approved');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Deletion processing state
  const [isDeleting, setIsDeleting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Permission checks
  const canView = hasPermission ? hasPermission('reviews.view') : true;
  const canApprove = hasPermission ? hasPermission('reviews.approve') : false;
  const canDelete = hasPermission ? hasPermission('reviews.delete') : false;
  const canCreate = hasPermission ? hasPermission('reviews.create') : false;
  const canEdit = hasPermission ? hasPermission('reviews.edit') : false;

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    (products || []).forEach((p) => {
      map.set(p.id, p);
      if (p.slug) map.set(p.slug, p);
    });
    return map;
  }, [products]);

  const fetchReviews = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getAllAdmin();
      setReviews(data);
    } catch (err: any) {
      console.error('Error fetching admin reviews:', err);
      setError(err?.message || 'Failed to load reviews. Please check permissions.');
    } finally {
      setIsLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Handle Quick Approve
  const handleApprove = async (review: ProductReview) => {
    if (!canApprove) {
      showNotification('error', 'Forbidden', 'You do not have permission to approve reviews (reviews.approve).');
      return;
    }
    setProcessingId(review.id);
    try {
      const updated = await reviewsApi.approve(review.id);
      setReviews((prev) => prev.map((r) => (r.id === review.id ? updated : r)));
      showNotification('success', 'Review Approved', `Review by "${review.authorName || review.author}" is now live in store.`);
    } catch (err: any) {
      showNotification('error', 'Approval Failed', err?.message || 'Failed to approve review.');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Quick Reject
  const handleReject = async (review: ProductReview) => {
    if (!canApprove) {
      showNotification('error', 'Forbidden', 'You do not have permission to moderate reviews (reviews.approve).');
      return;
    }
    setProcessingId(review.id);
    try {
      const updated = await reviewsApi.updateStatus(review.id, 'rejected');
      setReviews((prev) => prev.map((r) => (r.id === review.id ? updated : r)));
      showNotification('info', 'Review Rejected', `Review by "${review.authorName || review.author}" marked as rejected.`);
    } catch (err: any) {
      showNotification('error', 'Rejection Failed', err?.message || 'Failed to update review status.');
    } finally {
      setProcessingId(null);
    }
  };

  // Open Edit Modal
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

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview || !canEdit) return;

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

  // Open Delete Modal
  const openDeleteModal = (review: ProductReview) => {
    if (!canDelete) {
      showNotification('error', 'Forbidden', 'You do not have permission to delete reviews (reviews.delete).');
      return;
    }
    setSelectedReview(review);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!selectedReview || !canDelete) return;

    setIsDeleting(true);
    try {
      await reviewsApi.delete(selectedReview.id);
      setReviews((prev) => prev.filter((r) => r.id !== selectedReview.id));
      setIsDeleteModalOpen(false);
      showNotification('info', 'Review Deleted', 'The customer review has been permanently deleted.');
    } catch (err: any) {
      showNotification('error', 'Deletion Failed', err?.message || 'Failed to delete review.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Submit Create Admin Review
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
        authorName: createAuthor.trim() || currentUser?.name || 'Store Admin',
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
      showNotification('success', 'Review Created', 'Admin review added successfully.');
    } catch (err: any) {
      showNotification('error', 'Creation Failed', err?.message || 'Failed to create review.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Counts
  const pendingCount = useMemo(() => reviews.filter((r) => (r.status || 'approved') === 'pending').length, [reviews]);
  const approvedCount = useMemo(() => reviews.filter((r) => (r.status || 'approved') === 'approved').length, [reviews]);
  const rejectedCount = useMemo(() => reviews.filter((r) => r.status === 'rejected').length, [reviews]);

  // Filtered Reviews
  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      // Status filter
      const curStatus = (r.status || 'approved').toLowerCase();
      if (statusFilter !== 'all' && curStatus !== statusFilter) return false;

      // Product filter
      if (productFilter !== 'all' && r.productId !== productFilter) return false;

      // Verified filter
      if (verifiedFilter === 'verified' && !r.verifiedPurchase) return false;
      if (verifiedFilter === 'unverified' && r.verifiedPurchase) return false;

      // Search query
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
  }, [reviews, statusFilter, productFilter, verifiedFilter, searchQuery, productMap]);

  if (!canView) {
    return (
      <div className="p-8 text-center bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
        <h3 className="text-lg font-bold text-rose-900">Access Denied (403 Forbidden)</h3>
        <p className="text-sm text-rose-700 max-w-md mx-auto">
          You do not have the <code className="bg-rose-100 px-1.5 py-0.5 rounded font-mono font-bold">reviews.view</code> permission required to view the customer review moderation queue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-amber-500" />
            Customer Reviews Moderation Queue
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Audit, verify, and moderate customer product feedback. Customer submissions require admin approval (<code className="text-amber-700 font-mono">reviews.approve</code>) before publishing live.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchReviews}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
            title="Refresh review records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-600' : ''}`} />
            Refresh
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
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Admin Review
            </button>
          )}
        </div>
      </div>

      {/* Metrics Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Reviews</span>
          <div className="text-2xl font-bold text-slate-900">{reviews.length}</div>
          <span className="text-[10px] text-slate-400">All submissions in database</span>
        </div>

        <div className={`p-4 rounded-2xl shadow-2xs space-y-1 border ${pendingCount > 0 ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Pending Approval</span>
            {pendingCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
          </div>
          <div className="text-2xl font-bold text-amber-700">{pendingCount}</div>
          <span className="text-[10px] text-amber-600">Requires moderator action</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Approved / Live</span>
          <div className="text-2xl font-bold text-emerald-600">{approvedCount}</div>
          <span className="text-[10px] text-slate-400">Published to storefront</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Rejected</span>
          <div className="text-2xl font-bold text-slate-600">{rejectedCount}</div>
          <span className="text-[10px] text-slate-400">Hidden from storefront</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-4">
        {/* Status Tab Toggle Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 border-b border-slate-100 sm:border-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All ({reviews.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'pending'
                ? 'bg-amber-600 text-white'
                : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Pending Moderation ({pendingCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'approved'
                ? 'bg-emerald-600 text-white'
                : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Approved ({approvedCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('rejected')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'rejected'
                ? 'bg-rose-600 text-white'
                : 'text-rose-700 hover:bg-rose-50'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            Rejected ({rejectedCount})
          </button>
        </div>

        {/* Search & Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
          {/* Keyword Search */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by author, review comment, or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-800"
            />
          </div>

          {/* Product Filter */}
          <div className="sm:col-span-4">
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-800"
            >
              <option value="all">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          {/* Verified Purchase Filter */}
          <div className="sm:col-span-3">
            <select
              value={verifiedFilter}
              onChange={(e) => setVerifiedFilter(e.target.value as any)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:bg-white text-slate-800"
            >
              <option value="all">Verified: All</option>
              <option value="verified">Verified Purchases Only</option>
              <option value="unverified">Unverified Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-xs text-rose-800">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Reviews List */}
      {isLoading ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-500">Loading reviews from database...</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-2">
          <MessageSquare className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No reviews found matching the filters</p>
          <p className="text-xs text-slate-400">
            {statusFilter === 'pending'
              ? 'Great news! There are no pending customer reviews awaiting moderation.'
              : 'Try clearing your search query or switching filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReviews.map((rev) => {
            const product = productMap.get(rev.productId);
            const isApproved = (rev.status || 'approved') === 'approved';
            const isPending = rev.status === 'pending';
            const isRejected = rev.status === 'rejected';

            return (
              <div
                key={rev.id}
                className={`p-4 sm:p-5 bg-white border rounded-2xl shadow-2xs space-y-3 transition-all ${
                  isPending
                    ? 'border-amber-300 ring-1 ring-amber-200/60 bg-amber-50/20'
                    : isRejected
                    ? 'border-slate-200 bg-slate-50/40 opacity-75'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Review Top Meta */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Status Badge */}
                    {isPending ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        <Clock className="w-3 h-3 text-amber-600 animate-spin" />
                        Pending Approval
                      </span>
                    ) : isRejected ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Approved / Live
                      </span>
                    )}

                    {/* Verified Purchase Badge */}
                    {rev.verifiedPurchase ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        Verified Purchase
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500">
                        Unverified
                      </span>
                    )}

                    {/* Star Rating */}
                    <div className="flex items-center gap-0.5 ml-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= rev.rating
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-200'
                          }`}
                        />
                      ))}
                      <span className="text-xs font-bold text-slate-700 ml-1">
                        {rev.rating}.0
                      </span>
                    </div>
                  </div>

                  {/* Submission date & ID */}
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-400">{rev.id}</span>
                    <span>•</span>
                    <span>{new Date(rev.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                {/* Review Body & Product Reference */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                  <div className="sm:col-span-8 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs uppercase">
                        {(rev.authorName || rev.author || 'C')[0]}
                      </div>
                      <span className="font-bold text-xs text-slate-900">
                        {rev.authorName || rev.author || 'Anonymous Shopper'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      "{rev.comment}"
                    </p>

                    {/* Moderation audit tracking */}
                    {rev.approvedBy && (
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1">
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                        <span>
                          Approved by <strong className="text-slate-600">{rev.approvedBy}</strong>
                          {rev.approvedAt && ` on ${new Date(rev.approvedAt).toLocaleDateString()}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Product Details info card */}
                  <div className="sm:col-span-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex items-center gap-2.5">
                    {product?.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-800 truncate" title={product?.title || rev.productId}>
                        {product?.title || 'Unknown Product'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        ID: {rev.productId}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  {/* Approve Action */}
                  {canApprove && !isApproved && (
                    <button
                      type="button"
                      disabled={processingId === rev.id}
                      onClick={() => handleApprove(rev)}
                      className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Approve & Publish
                    </button>
                  )}

                  {/* Reject Action */}
                  {canApprove && !isRejected && (
                    <button
                      type="button"
                      disabled={processingId === rev.id}
                      onClick={() => handleReject(rev)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-500" />
                      Reject
                    </button>
                  )}

                  {/* Edit Action */}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditModal(rev)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                      Edit
                    </button>
                  )}

                  {/* Delete Action */}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => openDeleteModal(rev)}
                      className="px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50/50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE ADMIN REVIEW MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-600" />
                Add Admin Product Review
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Product Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={createProductId}
                  onChange={(e) => setCreateProductId(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/40"
                >
                  <option value="">Select a product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (ID: {p.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Author Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Author Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tanvir Ahmed or Verified Shopper"
                  value={createAuthor}
                  onChange={(e) => setCreateAuthor(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              {/* Star Rating */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setCreateRating(star)}
                      className="p-1 focus:outline-none"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= createRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-slate-700 ml-2">{createRating} Stars</span>
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Review Comment <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Share customer feedback or product review details..."
                  value={createComment}
                  onChange={(e) => setCreateComment(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              {/* Options */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as any)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="approved">Approved & Live</option>
                    <option value="pending">Pending Moderation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Verified Badge</label>
                  <label className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createVerified}
                      onChange={(e) => setCreateVerified(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500/40"
                    />
                    <span className="text-xs text-slate-700 font-medium">Verified Purchase</span>
                  </label>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSubmittingCreate ? 'Saving...' : 'Create Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT REVIEW MODAL */}
      {isEditModalOpen && selectedReview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-600" />
                Edit Customer Review
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Author Name</label>
                <input
                  type="text"
                  required
                  value={editAuthor}
                  onChange={(e) => setEditAuthor(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEditRating(star)}
                      className="p-1 focus:outline-none"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= editRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-slate-700 ml-2">{editRating} Stars</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Comment</label>
                <textarea
                  required
                  rows={3}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Moderation Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="approved">Approved & Live</option>
                  <option value="pending">Pending Moderation</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSubmittingEdit ? 'Saving...' : 'Update Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && selectedReview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-slate-900">Delete Customer Review?</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 space-y-1">
              <div><strong>Author:</strong> {selectedReview.authorName || selectedReview.author}</div>
              <div><strong>Rating:</strong> {selectedReview.rating}★</div>
              <div className="text-slate-500 truncate">"{selectedReview.comment}"</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminReviewsTab;
