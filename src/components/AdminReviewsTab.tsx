import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Star,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Trash2,
  Search,
  Filter,
  Eye,
  Plus,
  Clock,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Calendar,
  User,
  Package,
  Check,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  Copy,
  PlusCircle,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAdmin } from '../context/AdminContextDefinition';
import { ProductReview, Product } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { getResponsiveImageUrl } from '../utils/responsiveImage';

export const AdminReviewsTab: React.FC = () => {
  const { products, showNotification, hasPermission, currentUser } = useStore();
  const admin = useAdmin();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRating, setSelectedRating] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');

  // Detail / Inspect Modal
  const [inspectReview, setInspectReview] = useState<ProductReview | null>(null);

  // Moderation note input state
  const [moderationNoteModal, setModerationNoteModal] = useState<{
    isOpen: boolean;
    review: ProductReview | null;
    action: 'approve' | 'reject';
    note: string;
  }>({
    isOpen: false,
    review: null,
    action: 'approve',
    note: '',
  });

  // Create Review Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createProductId, setCreateProductId] = useState<string>('');
  const [createAuthorName, setCreateAuthorName] = useState<string>('Verified Customer');
  const [createRating, setCreateRating] = useState<number>(5);
  const [createComment, setCreateComment] = useState<string>('');
  const [createStatus, setCreateStatus] = useState<'approved' | 'pending'>('pending');
  const [createVerified, setCreateVerified] = useState<boolean>(true);
  const [createModerationNote, setCreateModerationNote] = useState<string>('Staff Created');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  // Batch Add Reviews Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchDefaultProductId, setBatchDefaultProductId] = useState<string>('');
  const [batchItems, setBatchItems] = useState<Array<{
    id: string;
    productId: string;
    authorName: string;
    rating: number;
    comment: string;
    status: 'approved' | 'pending';
    verifiedPurchase: boolean;
    moderationNote: string;
  }>>([
    {
      id: 'batch-1',
      productId: '',
      authorName: 'Verified Customer',
      rating: 5,
      comment: 'Excellent product quality and very responsive delivery! Fully satisfied.',
      status: 'approved',
      verifiedPurchase: true,
      moderationNote: 'Verified buyer batch upload',
    },
    {
      id: 'batch-2',
      productId: '',
      authorName: 'Authentic Buyer',
      rating: 5,
      comment: 'Authentic item, matches description perfectly. Recommended seller!',
      status: 'approved',
      verifiedPurchase: true,
      moderationNote: 'Verified buyer batch upload',
    },
  ]);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [batchFormError, setBatchFormError] = useState<string | null>(null);

  // Confirm delete modal
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const canManageReviews = hasPermission('review.manage');

  // Load reviews on mount and when filters change
  const loadReviews = useCallback(() => {
    if (!admin?.fetchAdminReviews) return;
    admin.fetchAdminReviews({
      status: selectedStatus,
      productId: selectedProductId,
      rating: selectedRating !== 'all' ? Number(selectedRating) : undefined,
      search: searchQuery.trim(),
    });
  }, [admin, selectedStatus, selectedProductId, selectedRating, searchQuery]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Set default product for create modal if products exist
  useEffect(() => {
    if (products.length > 0 && !createProductId) {
      setCreateProductId(products[0].id);
    }
  }, [products, createProductId]);

  const handleStatusFilterChange = (status: string) => {
    setSelectedStatus(status);
    if (admin?.setAdminReviewsPage) {
      admin.setAdminReviewsPage(1);
    }
  };

  const handleApprove = async (review: ProductReview, note?: string) => {
    if (!admin?.adminApproveReview) return;
    await admin.adminApproveReview(review.id, note);
    if (inspectReview?.id === review.id) {
      setInspectReview((prev) => (prev ? { ...prev, status: 'approved', moderatedAt: new Date().toISOString() } : null));
    }
  };

  const handleReject = async (review: ProductReview, note?: string) => {
    if (!admin?.adminRejectReview) return;
    await admin.adminRejectReview(review.id, note);
    if (inspectReview?.id === review.id) {
      setInspectReview((prev) => (prev ? { ...prev, status: 'rejected', moderatedAt: new Date().toISOString() } : null));
    }
  };

  const handleToggleVerified = async (review: ProductReview) => {
    if (!admin?.adminToggleVerifiedReview) return;
    const newVerified = !review.verifiedPurchase;
    await admin.adminToggleVerifiedReview(review.id, newVerified);
    if (inspectReview?.id === review.id) {
      setInspectReview((prev) => (prev ? { ...prev, verifiedPurchase: newVerified } : null));
    }
  };

  const handleDelete = (review: ProductReview) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Customer Review?',
      message: `Are you sure you want to permanently delete the review by "${review.authorName || review.author || 'Shopper'}"? Product rating will automatically re-calculate.`,
      confirmText: 'Delete Permanently',
      variant: 'danger',
      onConfirm: async () => {
        if (!admin?.adminDeleteReview) return;
        await admin.adminDeleteReview(review.id);
        if (inspectReview?.id === review.id) {
          setInspectReview(null);
        }
      },
    });
  };

  const handleOpenModerationNote = (review: ProductReview, action: 'approve' | 'reject') => {
    setModerationNoteModal({
      isOpen: true,
      review,
      action,
      note: action === 'approve' ? 'Approved by staff' : 'Violates community guidelines / Spam',
    });
  };

  const handleSubmitModerationAction = async () => {
    const { review, action, note } = moderationNoteModal;
    if (!review) return;
    if (action === 'approve') {
      await handleApprove(review, note);
    } else {
      await handleReject(review, note);
    }
    setModerationNoteModal({ isOpen: false, review: null, action: 'approve', note: '' });
  };

  const handleCreateReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createProductId || !createAuthorName.trim() || !createComment.trim()) {
      setCreateFormError('Please fill out all required fields.');
      return;
    }

    if (createAuthorName.trim().length < 2 || createAuthorName.trim().length > 60) {
      setCreateFormError('Author name must be between 2 and 60 characters.');
      return;
    }

    if (createComment.trim().length < 3 || createComment.trim().length > 1000) {
      setCreateFormError('Comment must be between 3 and 1000 characters.');
      return;
    }

    setIsSubmittingCreate(true);
    setCreateFormError(null);

    try {
      if (!admin?.adminCreateReview) {
        throw new Error('Review creation is not available');
      }

      const res = await admin.adminCreateReview({
        productId: createProductId,
        authorName: createAuthorName.trim(),
        rating: createRating,
        comment: createComment.trim(),
        status: createStatus,
        verifiedPurchase: createVerified,
        moderationNote: createModerationNote.trim() || undefined,
      });

      if (res.success) {
        setIsCreateModalOpen(false);
        setCreateComment('');
        setCreateAuthorName('Verified Customer');
        setCreateRating(5);
        setCreateStatus('pending');
        setCreateVerified(true);
        setCreateModerationNote('Staff Created');
      } else {
        setCreateFormError(res.error || 'Failed to create review.');
      }
    } catch (err: any) {
      setCreateFormError(err?.message || 'Failed to create review.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleAddBatchRow = () => {
    const defaultPid = batchDefaultProductId || (products[0]?.id || '');
    setBatchItems((prev) => [
      ...prev,
      {
        id: `batch-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        productId: defaultPid,
        authorName: 'Verified Customer',
        rating: 5,
        comment: '',
        status: 'approved',
        verifiedPurchase: true,
        moderationNote: 'Verified buyer batch upload',
      },
    ]);
  };

  const handleRemoveBatchRow = (rowId: string) => {
    setBatchItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== rowId) : prev));
  };

  const handleDuplicateBatchRow = (index: number) => {
    setBatchItems((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const copy = {
        ...target,
        id: `batch-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const handleApplyDefaultProductToAll = () => {
    if (!batchDefaultProductId) return;
    setBatchItems((prev) => prev.map((it) => ({ ...it, productId: batchDefaultProductId })));
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchItems || batchItems.length === 0) {
      setBatchFormError('At least one review row is required.');
      return;
    }

    // Client-side pre-validation
    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      if (!item.productId) {
        setBatchFormError(`Row #${i + 1}: Please select a product.`);
        return;
      }
      if (!item.authorName.trim() || item.authorName.trim().length < 2) {
        setBatchFormError(`Row #${i + 1}: Customer name must be at least 2 characters.`);
        return;
      }
      if (!item.comment.trim() || item.comment.trim().length < 3) {
        setBatchFormError(`Row #${i + 1}: Review text must be at least 3 characters.`);
        return;
      }
    }

    setIsSubmittingBatch(true);
    setBatchFormError(null);

    try {
      if (!admin?.adminBatchCreateReviews) {
        throw new Error('Batch review creation is not available in admin context.');
      }

      const res = await admin.adminBatchCreateReviews(
        batchItems.map((it) => ({
          productId: it.productId,
          authorName: it.authorName.trim(),
          rating: it.rating,
          comment: it.comment.trim(),
          status: it.status,
          verifiedPurchase: it.verifiedPurchase,
          moderationNote: it.moderationNote.trim() || undefined,
        }))
      );

      if (res.success) {
        setIsBatchModalOpen(false);
        const defaultPid = products[0]?.id || '';
        setBatchItems([
          {
            id: 'batch-1',
            productId: defaultPid,
            authorName: 'Verified Customer',
            rating: 5,
            comment: 'Excellent product quality and very responsive delivery! Fully satisfied.',
            status: 'approved',
            verifiedPurchase: true,
            moderationNote: 'Verified buyer batch upload',
          },
          {
            id: 'batch-2',
            productId: defaultPid,
            authorName: 'Satisfied Buyer',
            rating: 5,
            comment: 'Authentic item, matches description perfectly. Recommended seller!',
            status: 'approved',
            verifiedPurchase: true,
            moderationNote: 'Verified buyer batch upload',
          },
        ]);
      } else {
        setBatchFormError(res.error || 'Failed to complete batch upload.');
      }
    } catch (err: any) {
      setBatchFormError(err?.message || 'Failed to complete batch upload.');
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  // Helper map for products
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => {
      map.set(p.id, p);
      if (p.slug) map.set(p.slug, p);
    });
    return map;
  }, [products]);

  const counts = admin?.adminReviewsCounts || { all: 0, pending: 0, approved: 0, rejected: 0 };
  const reviews = admin?.adminReviews || [];
  const isLoading = admin?.isAdminReviewsLoading || false;
  const page = admin?.adminReviewsPage || 1;
  const totalPages = admin?.adminReviewsTotalPages || 1;
  const totalReviews = admin?.adminReviewsTotal || 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Stats */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-2xl p-4 sm:p-6 text-white border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black font-display tracking-tight text-white">
              Customer Review Moderation
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white">
              Live Control
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
            Review and moderate all customer submissions. Only approved reviews are visible on the storefront and contribute to product rating calculations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={loadReviews}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh review records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {canManageReviews && (
            <>
              <button
                type="button"
                id="admin-batch-create-reviews-top-btn"
                onClick={() => {
                  setBatchFormError(null);
                  if (products.length > 0 && !batchDefaultProductId) {
                    setBatchDefaultProductId(products[0].id);
                    setBatchItems((prev) =>
                      prev.map((it) => (it.productId ? it : { ...it, productId: products[0].id }))
                    );
                  }
                  setIsBatchModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                title="Batch add multiple reviews in one step"
              >
                <Layers className="w-4 h-4" />
                <span>Batch Add Reviews</span>
              </button>

              <button
                type="button"
                id="admin-create-review-top-btn"
                onClick={() => {
                  setCreateFormError(null);
                  setIsCreateModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Manual Review</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status Counters Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => handleStatusFilterChange('all')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'all'
              ? 'bg-slate-900 border-slate-700 text-white shadow-md'
              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold mb-1">
            <span className={selectedStatus === 'all' ? 'text-slate-300' : 'text-slate-500'}>All Reviews</span>
            <MessageSquare className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black">{counts.all}</div>
        </button>

        <button
          type="button"
          id="admin-filter-pending-reviews-btn"
          onClick={() => handleStatusFilterChange('pending')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'pending'
              ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-md ring-2 ring-amber-400/40'
              : 'bg-white border-slate-200 text-slate-700 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold mb-1">
            <span className="text-amber-700 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Pending Moderation
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600">{counts.pending}</div>
        </button>

        <button
          type="button"
          id="admin-filter-approved-reviews-btn"
          onClick={() => handleStatusFilterChange('approved')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'approved'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-md ring-2 ring-emerald-400/40'
              : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold mb-1">
            <span className="text-emerald-700">Approved (Live)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{counts.approved}</div>
        </button>

        <button
          type="button"
          id="admin-filter-rejected-reviews-btn"
          onClick={() => handleStatusFilterChange('rejected')}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            selectedStatus === 'rejected'
              ? 'bg-rose-50 border-rose-300 text-rose-950 shadow-md ring-2 ring-rose-400/40'
              : 'bg-white border-slate-200 text-slate-700 hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold mb-1">
            <span className="text-rose-700">Rejected (Hidden)</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-600">{counts.rejected}</div>
        </button>
      </div>

      {/* Filters & Search Row */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer name, review text, or product..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Product Filter */}
          <div className="sm:col-span-4">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none bg-white font-medium text-slate-700"
            >
              <option value="all">All Products (All Catalog)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.reviewsCount ?? 0} revs)
                </option>
              ))}
            </select>
          </div>

          {/* Rating Filter */}
          <div className="sm:col-span-3">
            <select
              value={selectedRating}
              onChange={(e) => setSelectedRating(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none bg-white font-medium text-slate-700"
            >
              <option value="all">All Star Ratings</option>
              <option value="5">5 Stars (★★★★★)</option>
              <option value="4">4 Stars (★★★★☆)</option>
              <option value="3">3 Stars (★★★☆☆)</option>
              <option value="2">2 Stars (★★☆☆☆)</option>
              <option value="1">1 Star (★☆☆☆☆)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reviews Table / Listing */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading && reviews.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Loading reviews from database...</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-16 text-center space-y-3 px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-slate-800">No reviews found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {selectedStatus !== 'all'
                ? `There are no reviews currently matching status "${selectedStatus}".`
                : 'No reviews match your current search and filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Customer & Date</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Rating</th>
                  <th className="py-3 px-4">Review Text</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reviews.map((r) => {
                  const targetProd = productMap.get(r.productId);
                  const status = r.status || 'approved';

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Customer & Date */}
                      <td className="py-3.5 px-4 align-top min-w-[160px]">
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="truncate">{r.authorName || r.author || 'Customer'}</span>
                            {r.createdByAdmin && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200" title="Created by staff">
                                Admin
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {r.verifiedPurchase ? (
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-0.5" title="Verified Customer Badge">
                                <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                                Verified
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Unverified</span>
                            )}
                            {canManageReviews && (
                              <button
                                type="button"
                                disabled={Boolean(admin?.reviewActionLoadingMap?.[r.id])}
                                onClick={() => handleToggleVerified(r)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all border cursor-pointer disabled:opacity-50 flex items-center gap-1 ${
                                  r.verifiedPurchase
                                    ? 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border-slate-200 hover:border-rose-200'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 hover:border-emerald-300'
                                }`}
                                title={r.verifiedPurchase ? 'Remove Verified Customer Badge' : 'Add Verified Customer Badge (ভেরিফাইড ব্যাজ যোগ করুন)'}
                              >
                                {admin?.reviewActionLoadingMap?.[r.id] === 'verified' && (
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                )}
                                <span>{r.verifiedPurchase ? 'Remove Badge' : '+ Add Badge'}</span>
                              </button>
                            )}
                          </div>

                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-300" />
                            <span>{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : 'Unknown'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Product */}
                      <td className="py-3.5 px-4 align-top min-w-[180px]">
                        {targetProd ? (
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                              <img
                                src={getResponsiveImageUrl(targetProd.imageUrl, 80)}
                                alt={targetProd.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 line-clamp-1 hover:text-rose-600 transition-colors">
                                {targetProd.title}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                ৳{targetProd.price.toLocaleString()} • {targetProd.rating?.toFixed(1) || '5.0'}★
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px] truncate block max-w-[150px]">
                            {r.productId}
                          </span>
                        )}
                      </td>

                      {/* Rating */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <div className="flex text-amber-400">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-3.5 h-3.5 ${
                                  star <= r.rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-200'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="font-extrabold text-slate-800 ml-1">
                            {r.rating}★
                          </span>
                        </div>
                      </td>

                      {/* Review Text */}
                      <td className="py-3.5 px-4 align-top max-w-[280px]">
                        <p className="text-slate-700 leading-relaxed line-clamp-3 text-xs">
                          {r.comment}
                        </p>
                        {r.moderationNote && (
                          <div className="mt-1.5 text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 inline-block">
                            <strong className="text-slate-700">Note:</strong> {r.moderationNote}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        {status === 'approved' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Approved
                          </span>
                        )}
                        {status === 'pending' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 w-fit animate-pulse">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Pending Review
                          </span>
                        )}
                        {status === 'rejected' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1 w-fit">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            Rejected
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <button
                            type="button"
                            onClick={() => setInspectReview(r)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="Inspect Review Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Approve Action */}
                          {status !== 'approved' && canManageReviews && (
                            <button
                              type="button"
                              id={`admin-approve-review-${r.id}`}
                              disabled={Boolean(admin?.reviewActionLoadingMap?.[r.id])}
                              onClick={() => handleOpenModerationNote(r, 'approve')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              title="Approve review (Makes public & updates rating)"
                            >
                              {admin?.reviewActionLoadingMap?.[r.id] === 'approve' ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                              ) : (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              )}
                              <span>Approve</span>
                            </button>
                          )}

                          {/* Reject Action */}
                          {status !== 'rejected' && canManageReviews && (
                            <button
                              type="button"
                              id={`admin-reject-review-${r.id}`}
                              disabled={Boolean(admin?.reviewActionLoadingMap?.[r.id])}
                              onClick={() => handleOpenModerationNote(r, 'reject')}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              title="Reject review (Hides from public & removes from rating)"
                            >
                              {admin?.reviewActionLoadingMap?.[r.id] === 'reject' ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                              ) : (
                                <X className="w-3.5 h-3.5 text-amber-600" />
                              )}
                              <span>Reject</span>
                            </button>
                          )}

                          {/* Delete Action */}
                          {canManageReviews && (
                            <button
                              type="button"
                              id={`admin-delete-review-${r.id}`}
                              disabled={Boolean(admin?.reviewActionLoadingMap?.[r.id])}
                              onClick={() => handleDelete(r)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
                              title="Delete review permanently"
                            >
                              {admin?.reviewActionLoadingMap?.[r.id] === 'delete' ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-600" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalReviews} total reviews)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => admin?.setAdminReviewsPage?.((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => admin?.setAdminReviewsPage?.((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Inspect Review Details */}
      {inspectReview && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setInspectReview(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                  <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                </span>
                <h3 className="font-bold text-base text-slate-900">Review Details & Moderation</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectReview(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Product Info */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                {productMap.get(inspectReview.productId) ? (
                  <>
                    <img
                      src={getResponsiveImageUrl(productMap.get(inspectReview.productId)!.imageUrl, 100)}
                      alt="Product"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                    />
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">
                        {productMap.get(inspectReview.productId)!.title}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Product ID: <span className="font-mono">{inspectReview.productId}</span>
                      </p>
                    </div>
                  </>
                ) : (
                  <div>
                    <h4 className="font-bold text-slate-800">Target Product</h4>
                    <p className="text-slate-500 font-mono">{inspectReview.productId}</p>
                  </div>
                )}
              </div>

              {/* Customer & Rating */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Author Name</span>
                  <p className="font-bold text-slate-800 text-xs">
                    {inspectReview.authorName || inspectReview.author || 'Anonymous'}
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 mt-1">
                    <p className="text-[10px] text-slate-600 font-bold flex items-center gap-1">
                      {inspectReview.verifiedPurchase ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified Customer
                        </span>
                      ) : (
                        <span className="text-slate-400">⚪ Unverified</span>
                      )}
                    </p>
                    {canManageReviews && (
                      <button
                        type="button"
                        onClick={() => handleToggleVerified(inspectReview)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                          inspectReview.verifiedPurchase
                            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {inspectReview.verifiedPurchase ? 'Remove Badge' : '+ Add Badge'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Customer Rating</span>
                  <div className="flex items-center gap-1 text-amber-500">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${s <= inspectReview.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                      />
                    ))}
                    <span className="font-black text-slate-800 ml-1">{inspectReview.rating}★</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {inspectReview.createdAt ? new Date(inspectReview.createdAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Review Text */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Customer Written Review</span>
                <p className="text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">
                  {inspectReview.comment}
                </p>
              </div>

              {/* Moderation Metadata */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-[11px] text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Status:</span>
                  <span className="font-bold uppercase tracking-wider">{inspectReview.status || 'approved'}</span>
                </div>
                {inspectReview.moderatorId && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Moderator ID:</span>
                    <span className="font-mono text-slate-700">{inspectReview.moderatorId}</span>
                  </div>
                )}
                {inspectReview.moderatedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Moderated At:</span>
                    <span>{new Date(inspectReview.moderatedAt).toLocaleString()}</span>
                  </div>
                )}
                {inspectReview.moderationNote && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Moderation Note:</span>
                    <span>{inspectReview.moderationNote}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              {inspectReview.status !== 'approved' && canManageReviews && (
                <button
                  type="button"
                  onClick={() => {
                    handleApprove(inspectReview);
                    setInspectReview(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  Approve Review
                </button>
              )}
              {inspectReview.status !== 'rejected' && canManageReviews && (
                <button
                  type="button"
                  onClick={() => {
                    handleReject(inspectReview);
                    setInspectReview(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <X className="w-4 h-4" />
                  Reject Review
                </button>
              )}
              {canManageReviews && (
                <button
                  type="button"
                  onClick={() => handleDelete(inspectReview)}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 border border-rose-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Moderation Note & Action Dialog */}
      {moderationNoteModal.isOpen && moderationNoteModal.review && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setModerationNoteModal({ isOpen: false, review: null, action: 'approve', note: '' })}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span
                className={`p-2.5 rounded-2xl ${
                  moderationNoteModal.action === 'approve'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {moderationNoteModal.action === 'approve' ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <XCircle className="w-6 h-6" />
                )}
              </span>
              <div>
                <h3 className="font-black text-base text-slate-900">
                  {moderationNoteModal.action === 'approve' ? 'Approve Customer Review' : 'Reject Customer Review'}
                </h3>
                <p className="text-xs text-slate-500">
                  {moderationNoteModal.action === 'approve'
                    ? 'Review will immediately become visible to all storefront shoppers.'
                    : 'Review will be hidden from storefront shoppers and excluded from average rating.'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Moderation Note / Reason (Optional)
              </label>
              <textarea
                value={moderationNoteModal.note}
                onChange={(e) =>
                  setModerationNoteModal((prev) => ({ ...prev, note: e.target.value }))
                }
                rows={2}
                maxLength={250}
                placeholder="Optional internal note regarding this moderation decision..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModerationNoteModal({ isOpen: false, review: null, action: 'approve', note: '' })}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                id="admin-confirm-moderation-action-btn"
                onClick={handleSubmitModerationAction}
                className={`px-4 py-2 rounded-xl text-white font-bold text-xs shadow-md transition-all ${
                  moderationNoteModal.action === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Confirm {moderationNoteModal.action === 'approve' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Create Manual Review Dialog */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-black text-base text-slate-900">Create Staff Product Review</h3>
                  <p className="text-[11px] text-slate-500">
                    Add a manual review directly for a product with custom moderation status.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createFormError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{createFormError}</span>
              </div>
            )}

            <form onSubmit={handleCreateReviewSubmit} className="space-y-4 text-xs">
              {/* Product Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Select Product *
                </label>
                <select
                  id="admin-create-review-product-select"
                  value={createProductId}
                  onChange={(e) => setCreateProductId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none bg-white font-medium"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (Current: {p.rating?.toFixed(1) || '5.0'}★, {p.reviewsCount ?? 0} revs)
                    </option>
                  ))}
                </select>
              </div>

              {/* Author & Rating */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Customer Name *
                  </label>
                  <input
                    id="admin-create-review-author-input"
                    type="text"
                    value={createAuthorName}
                    onChange={(e) => setCreateAuthorName(e.target.value)}
                    required
                    placeholder="e.g. Shakib Al Hasan"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Star Rating (1 to 5) *
                  </label>
                  <div className="flex items-center gap-1 py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setCreateRating(star)}
                        className="p-1 hover:scale-110 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= createRating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="font-black text-slate-800 ml-1 text-sm">{createRating}★</span>
                  </div>
                </div>
              </div>

              {/* Review Text */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Review Text *
                </label>
                <textarea
                  id="admin-create-review-comment-input"
                  value={createComment}
                  onChange={(e) => setCreateComment(e.target.value)}
                  rows={3}
                  required
                  placeholder="Authentic feedback, quality notes, fit description..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                />
              </div>

              {/* Verified Customer Badge Toggle */}
              <div>
                <label className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="font-bold text-xs text-slate-800 block">Verified Customer Badge (ভেরিফাইড কাস্টমার ব্যাজ)</span>
                      <span className="text-[10px] text-slate-500">Add official "Verified Customer" badge to this review</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    id="admin-create-review-verified-toggle"
                    checked={createVerified}
                    onChange={(e) => setCreateVerified(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                  />
                </label>
              </div>

              {/* Initial Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Initial Moderation Status *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      createStatus === 'approved'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="initialStatus"
                      value="approved"
                      checked={createStatus === 'approved'}
                      onChange={() => setCreateStatus('approved')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold block">Approved (Live)</span>
                      <span className="text-[10px] text-slate-500">Visible now & updates rating</span>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      createStatus === 'pending'
                        ? 'bg-amber-50 border-amber-300 text-amber-950 ring-2 ring-amber-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="initialStatus"
                      value="pending"
                      checked={createStatus === 'pending'}
                      onChange={() => setCreateStatus('pending')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="font-bold block">Pending</span>
                      <span className="text-[10px] text-slate-500">Kept in review queue</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Moderation Note */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Internal Moderation Note
                </label>
                <input
                  type="text"
                  value={createModerationNote}
                  onChange={(e) => setCreateModerationNote(e.target.value)}
                  placeholder="e.g. Created from verified phone call order"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="admin-submit-create-review-btn"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingCreate ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving Review...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Create Review</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Add Reviews Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50/70 via-white to-indigo-50/40 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg text-slate-900 font-display flex items-center gap-2">
                    Batch Add Verified Customer Reviews
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700 border border-indigo-200">
                      {batchItems.length} {batchItems.length === 1 ? 'Review' : 'Reviews'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Insert multiple authentic customer reviews with verified badges in a single operation.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Presets / Global Defaults Toolbar */}
            <div className="px-4 sm:px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  Quick Default Product:
                </span>
                <select
                  value={batchDefaultProductId}
                  onChange={(e) => setBatchDefaultProductId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-xs"
                >
                  <option value="">Select product to quick-fill...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleApplyDefaultProductToAll}
                  disabled={!batchDefaultProductId}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Apply to All Rows
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddBatchRow}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Another Row</span>
                </button>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleBatchSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
                {batchFormError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>{batchFormError}</span>
                  </div>
                )}

                {batchItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-slate-300 transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-xs text-slate-800">
                          Review #{idx + 1}
                        </span>
                        {item.verifiedPurchase && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            Verified Customer
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {item.status === 'approved' ? 'Approved (Live)' : 'Pending'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDuplicateBatchRow(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                          title="Duplicate this row"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px] hidden sm:inline">Duplicate</span>
                        </button>
                        {batchItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveBatchRow(item.id)}
                            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                            title="Remove this row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="text-[11px] hidden sm:inline">Remove</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Row Form Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      {/* Product Selection */}
                      <div className="lg:col-span-2">
                        <label className="block font-semibold text-slate-700 mb-1">
                          Product *
                        </label>
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchItems((prev) =>
                              prev.map((it) => (it.id === item.id ? { ...it, productId: val } : it))
                            );
                          }}
                          required
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs"
                        >
                          <option value="">-- Choose Product --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Author Name */}
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Customer Name *
                        </label>
                        <input
                          type="text"
                          value={item.authorName}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchItems((prev) =>
                              prev.map((it) => (it.id === item.id ? { ...it, authorName: val } : it))
                            );
                          }}
                          required
                          placeholder="e.g. Tanvir Ahmed"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs"
                        />
                      </div>

                      {/* Rating */}
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Rating (1-5) *
                        </label>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => {
                                setBatchItems((prev) =>
                                  prev.map((it) => (it.id === item.id ? { ...it, rating: star } : it))
                                );
                              }}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                item.rating >= star
                                  ? 'bg-amber-50 border-amber-300 text-amber-500'
                                  : 'bg-slate-50 border-slate-200 text-slate-300'
                              }`}
                            >
                              <Star className={`w-3.5 h-3.5 ${item.rating >= star ? 'fill-amber-400' : ''}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Review Comment */}
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 text-xs">
                        Review Content *
                      </label>
                      <textarea
                        value={item.comment}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBatchItems((prev) =>
                            prev.map((it) => (it.id === item.id ? { ...it, comment: val } : it))
                          );
                        }}
                        rows={2}
                        required
                        placeholder="Authentic feedback, fabric quality notes, delivery experience..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                    </div>

                    {/* Footer toggles for the row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs border-t border-slate-50">
                      <div className="flex items-center gap-4 flex-wrap">
                        {/* Verified Toggle */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={item.verifiedPurchase}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setBatchItems((prev) =>
                                prev.map((it) => (it.id === item.id ? { ...it, verifiedPurchase: checked } : it))
                              );
                            }}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                          />
                          <span className="font-semibold text-slate-700 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Verified Customer
                          </span>
                        </label>

                        {/* Status Toggle */}
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-700">Status:</span>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`status-${item.id}`}
                              value="approved"
                              checked={item.status === 'approved'}
                              onChange={() => {
                                setBatchItems((prev) =>
                                  prev.map((it) => (it.id === item.id ? { ...it, status: 'approved' } : it))
                                );
                              }}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-slate-600">Approved</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`status-${item.id}`}
                              value="pending"
                              checked={item.status === 'pending'}
                              onChange={() => {
                                setBatchItems((prev) =>
                                  prev.map((it) => (it.id === item.id ? { ...it, status: 'pending' } : it))
                                );
                              }}
                              className="text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-slate-600">Pending</span>
                          </label>
                        </div>
                      </div>

                      {/* Moderation note */}
                      <div className="flex items-center gap-1.5 flex-1 max-w-xs">
                        <input
                          type="text"
                          value={item.moderationNote}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchItems((prev) =>
                              prev.map((it) => (it.id === item.id ? { ...it, moderationNote: val } : it))
                            );
                          }}
                          placeholder="Note (optional)"
                          className="w-full px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleAddBatchRow}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-slate-500" />
                  <span>Add Another Row</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBatchModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="admin-submit-batch-reviews-btn"
                    disabled={isSubmittingBatch}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingBatch ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Uploading {batchItems.length} Reviews...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Submit Batch ({batchItems.length} Reviews)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
