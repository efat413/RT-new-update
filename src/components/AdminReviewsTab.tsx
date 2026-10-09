import React, { useState, useEffect, useMemo } from 'react';
import { ProductReview, Product, ReviewStatus, UserAccount } from '../types';
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
  X,
  Eye,
} from 'lucide-react';

interface AdminReviewsTabProps {
  products: Product[];
  currentUser: UserAccount | null;
  onRefreshProducts?: () => void;
  initialProductFilter?: string;
}

export const AdminReviewsTab: React.FC<AdminReviewsTabProps> = ({
  products,
  currentUser,
  onRefreshProducts,
  initialProductFilter,
}) => {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductFilter || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modals state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ProductReview | null>(null);

  // Add review form state
  const [formProductId, setFormProductId] = useState(products[0]?.id || '');
  const [formAuthor, setFormAuthor] = useState(currentUser?.name || 'Store Staff');
  const [formRating, setFormRating] = useState(5);
  const [formComment, setFormComment] = useState('');
  const [formVerified, setFormVerified] = useState(true);
  const [formStatus, setFormStatus] = useState<ReviewStatus>('approved');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canView = currentUser ? hasUserPermission(currentUser, 'review.view') : false;
  const canManage = currentUser ? hasUserPermission(currentUser, 'review.manage') : false;
  const canDelete = currentUser ? hasUserPermission(currentUser, 'review.delete') : false;

  const loadReviews = async () => {
    if (!canView) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getAll({ status: 'all' });
      setReviews(data);
    } catch (err: any) {
      console.error('Failed to load reviews:', err);
      setError(err.message || 'Failed to load reviews from server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [canView]);

  useEffect(() => {
    if (initialProductFilter) {
      setSelectedProductId(initialProductFilter);
    }
  }, [initialProductFilter]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(p.id, p);
      if (p.slug) map.set(p.slug, p);
    }
    return map;
  }, [products]);

  // Counts
  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of reviews) {
      if (r.status === 'pending') pending++;
      else if (r.status === 'approved' || !r.status) approved++;
      else if (r.status === 'rejected') rejected++;
    }
    return {
      all: reviews.length,
      pending,
      approved,
      rejected,
    };
  }, [reviews]);

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      // Status filter
      if (statusFilter !== 'all') {
        const rStatus = r.status || 'approved';
        if (rStatus !== statusFilter) return false;
      }
      // Product filter
      if (selectedProductId !== 'all') {
        const prod = productMap.get(r.productId);
        const canonId = prod ? prod.id : r.productId;
        if (canonId !== selectedProductId && r.productId !== selectedProductId) {
          return false;
        }
      }
      // Search filter
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
  }, [reviews, statusFilter, selectedProductId, searchQuery, productMap]);

  // Action handlers
  const handleUpdateStatus = async (reviewId: string, newStatus: ReviewStatus) => {
    if (!canManage) return;
    setActionLoadingId(reviewId);
    try {
      const updated = await reviewsApi.update(reviewId, { status: newStatus });
      setReviews((prev) => prev.map((r) => (r.id === reviewId ? updated : r)));
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      alert(`Failed to update review status: ${err.message || 'Server error'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteReview = async () => {
    if (!deleteCandidate || !canDelete) return;
    setActionLoadingId(deleteCandidate.id);
    try {
      await reviewsApi.delete(deleteCandidate.id);
      setReviews((prev) => prev.filter((r) => r.id !== deleteCandidate.id));
      setDeleteCandidate(null);
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      alert(`Failed to delete review: ${err.message || 'Server error'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateStaffReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!formProductId || !formAuthor.trim() || !formComment.trim()) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setFormSubmitting(true);
    setFormError(null);
    try {
      const created = await reviewsApi.create({
        productId: formProductId,
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
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create review.');
    } finally {
      setFormSubmitting(false);
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
    <div className="space-y-6">
      {/* Header section with Stats Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
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
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-xs"
            title="Refresh reviews"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-rose-500' : ''}`} />
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Staff Review</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Total Reviews</span>
            <MessageSquare className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{counts.all}</div>
        </div>

        <div
          onClick={() => setStatusFilter('pending')}
          className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'pending'
              ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/20'
              : 'border-slate-200/80 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 text-xs font-semibold mb-1">
            <span>Pending Review</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 flex items-center gap-2">
            <span>{counts.pending}</span>
            {counts.pending > 0 && (
              <span className="text-[10px] uppercase tracking-wider py-0.5 px-2 bg-amber-100 text-amber-800 rounded-full font-bold">
                Action Required
              </span>
            )}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('approved')}
          className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'approved'
              ? 'border-emerald-400 ring-2 ring-emerald-400/20 bg-emerald-50/20'
              : 'border-slate-200/80 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold mb-1">
            <span>Live Approved</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">{counts.approved}</div>
        </div>

        <div
          onClick={() => setStatusFilter('rejected')}
          className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-xs ${
            statusFilter === 'rejected'
              ? 'border-rose-400 ring-2 ring-rose-400/20 bg-rose-50/20'
              : 'border-slate-200/80 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-700 text-xs font-semibold mb-1">
            <span>Rejected / Spam</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600">{counts.rejected}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center gap-3 justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              statusFilter === 'pending'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            Pending ({counts.pending})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('approved')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              statusFilter === 'approved'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            Approved ({counts.approved})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('rejected')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              statusFilter === 'rejected'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            Rejected ({counts.rejected})
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto">
          {/* Product Filter Dropdown */}
          <div className="relative w-full sm:w-60">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full py-1.5 pl-3 pr-8 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            >
              <option value="all">All Products ({products.length})</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search author, comment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-1.5 pl-8 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Review List */}
      {isLoading ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center">
          <div className="w-10 h-10 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">Loading reviews...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-6 text-center text-sm">
          {error}
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 mb-1">No reviews found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all' || selectedProductId !== 'all'
              ? 'No reviews match your filter criteria. Try resetting filters.'
              : 'No customer reviews submitted yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReviews.map((rev) => {
            const product = productMap.get(rev.productId);
            const status = rev.status || 'approved';
            const isPending = status === 'pending';
            const isApproved = status === 'approved';
            const isRejected = status === 'rejected';

            return (
              <div
                key={rev.id}
                className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all shadow-xs ${
                  isPending
                    ? 'border-amber-300/80 bg-amber-50/10'
                    : isRejected
                    ? 'border-rose-200/80 bg-rose-50/5'
                    : 'border-slate-200/80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  {/* Left: Product & Author Info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {product?.imageUrl && (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {product?.title || `Product ID: ${rev.productId}`}
                        </span>
                        {product?.price && (
                          <span className="text-[11px] font-semibold text-slate-500">
                            (৳{product.price.toLocaleString('en-BD')})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 mb-2">
                        <span className="font-semibold text-slate-800">
                          {rev.authorName || rev.author || 'Customer'}
                        </span>
                        {rev.verifiedPurchase && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            Verified Purchase
                          </span>
                        )}
                        <span className="text-slate-400">•</span>
                        <span className="text-[11px] text-slate-500">
                          {rev.createdAt ? new Date(rev.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown date'}
                        </span>
                        {rev.source === 'admin' && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                            Official Staff
                          </span>
                        )}
                      </div>

                      {/* Stars */}
                      <div className="flex items-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= rev.rating
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-200'
                            }`}
                          />
                        ))}
                        <span className="text-xs font-bold text-slate-700 ml-1">
                          {rev.rating}.0
                        </span>
                      </div>

                      {/* Comment text */}
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed break-words bg-slate-50/80 p-3 rounded-xl border border-slate-100 mb-3">
                        {rev.comment}
                      </p>

                      {/* Photos thumbnail gallery */}
                      {rev.images && rev.images.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          {rev.images.map((img, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setPreviewImage(img)}
                              className="relative group w-14 h-14 rounded-xl overflow-hidden border border-slate-200 hover:border-rose-400 transition-all shrink-0 cursor-pointer shadow-2xs"
                            >
                              <img
                                src={img}
                                alt={`Review upload ${idx + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Eye className="w-3.5 h-3.5 text-white" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Moderation audit attribution */}
                      {rev.approvedBy && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <span>Moderated by: <strong>{rev.approvedBy}</strong></span>
                          {rev.approvedAt && (
                            <span>({new Date(rev.approvedAt).toLocaleDateString('en-GB')})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Status badge & Moderation Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    {/* Status Badge */}
                    <div>
                      {isPending && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100/80 px-2.5 py-1 rounded-full border border-amber-300">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Pending Moderation
                        </span>
                      )}
                      {isApproved && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          Live Approved
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100/80 px-2.5 py-1 rounded-full border border-rose-300">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          Rejected
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5">
                      {canManage && !isApproved && (
                        <button
                          type="button"
                          disabled={actionLoadingId === rev.id}
                          onClick={() => handleUpdateStatus(rev.id, 'approved')}
                          className="py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                          title="Approve review (will publish to storefront and update ratings)"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                      )}

                      {canManage && !isRejected && (
                        <button
                          type="button"
                          disabled={actionLoadingId === rev.id}
                          onClick={() => handleUpdateStatus(rev.id, 'rejected')}
                          className="py-1.5 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Reject review"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      )}

                      {canManage && !isPending && (
                        <button
                          type="button"
                          disabled={actionLoadingId === rev.id}
                          onClick={() => handleUpdateStatus(rev.id, 'pending')}
                          className="py-1.5 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Revert to pending moderation"
                        >
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Hold</span>
                        </button>
                      )}

                      {canDelete && (
                        <button
                          type="button"
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

      {/* Image Preview Lightbox Modal */}
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
              className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors z-10"
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

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Review</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
              Are you sure you want to delete the review by <strong>"{deleteCandidate.authorName || deleteCandidate.author}"</strong>?
              Catalog ratings will be recalculated automatically.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteReview}
                disabled={actionLoadingId === deleteCandidate.id}
                className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs"
              >
                {actionLoadingId === deleteCandidate.id ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Review Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Star className="w-5 h-5 fill-amber-500" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Add Official Staff Review</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
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
                <select
                  value={formProductId}
                  onChange={(e) => setFormProductId(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
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
                        className="p-1 focus:outline-none"
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
                    <span className="text-xs font-bold text-slate-700 ml-2">{formRating}★</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Review Comment</label>
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
                    className="rounded text-rose-600 focus:ring-rose-500"
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
                    className="w-full py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800"
                  >
                    <option value="approved">Approved (Live)</option>
                    <option value="pending">Pending Moderation</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="py-2 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors"
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
