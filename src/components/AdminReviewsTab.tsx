import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ProductReview, Product, ReviewStatus, ReviewSource, UserAccount } from '../types';
import { reviewsApi, uploadApi } from '../services/storeApi';
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
  RotateCcw,
  UploadCloud,
  Loader2,
  MessageCircle,
  Share2,
} from 'lucide-react';

export interface AdminReviewsTabProps {
  products: Product[];
  currentUser: UserAccount | null;
  onRefreshProducts?: () => void;
  onRefreshReviews?: (productId?: string) => void;
  initialProductFilter?: string;
  onBackToProducts?: () => void;
}

const REVIEW_SOURCE_CONFIG: Record<
  ReviewSource,
  { label: string; badgeClass: string; iconClass: string }
> = {
  manual: {
    label: 'Manual Entry',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
    iconClass: 'text-indigo-600',
  },
  whatsapp: {
    label: 'WhatsApp',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    iconClass: 'text-emerald-600',
  },
  facebook: {
    label: 'Facebook',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200/80',
    iconClass: 'text-blue-600',
  },
  messenger: {
    label: 'Messenger',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200/80',
    iconClass: 'text-sky-600',
  },
  instagram: {
    label: 'Instagram',
    badgeClass: 'bg-pink-50 text-pink-800 border-pink-200/80',
    iconClass: 'text-pink-600',
  },
  admin: {
    label: 'Staff Endorsement',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200/80',
    iconClass: 'text-purple-600',
  },
  customer: {
    label: 'Customer Submission',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200/80',
    iconClass: 'text-slate-600',
  },
};

const MAX_REVIEW_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB for review photos

/**
 * Client-side file signature & magic byte validator for review photos.
 * Validates file size (<= 2MB) and inspects binary headers to reject
 * SVGs, HTML, script polyglots, and unsupported formats before upload.
 */
async function validateClientImageFile(file: File): Promise<{ valid: boolean; error?: string }> {
  if (!file) return { valid: false, error: 'No file selected.' };
  if (file.size > MAX_REVIEW_IMAGE_SIZE_BYTES) {
    return { valid: false, error: `File "${file.name}" exceeds the 2MB maximum limit for review photos.` };
  }
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: `File "${file.name}" is not a supported format. Please select a JPG, PNG, or WebP image.`,
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve({ valid: false, error: `Failed to read "${file.name}".` });
    reader.onload = () => {
      const arr = new Uint8Array(reader.result as ArrayBuffer);
      if (arr.length < 12) {
        resolve({ valid: false, error: `File "${file.name}" is too small or truncated.` });
        return;
      }
      // Check JPEG: FF D8 FF
      const isJpeg = arr[0] === 0xff && arr[1] === 0xd8 && arr[2] === 0xff;
      // Check PNG: 89 50 4E 47
      const isPng = arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4e && arr[3] === 0x47;
      // Check WebP: RIFF ... WEBP
      const isWebp =
        arr[0] === 0x52 &&
        arr[1] === 0x49 &&
        arr[2] === 0x46 &&
        arr[3] === 0x46 &&
        arr[8] === 0x57 &&
        arr[9] === 0x45 &&
        arr[10] === 0x42 &&
        arr[11] === 0x50;
      // Check GIF: GIF8
      const isGif = arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x38;

      if (!isJpeg && !isPng && !isWebp && !isGif) {
        resolve({
          valid: false,
          error: `File "${file.name}" contains invalid image headers. SVG, HTML, and script files are strictly blocked.`,
        });
        return;
      }
      resolve({ valid: true });
    };
    reader.readAsArrayBuffer(file.slice(0, 32));
  });
}

export const AdminReviewsTab: React.FC<AdminReviewsTabProps> = ({
  products,
  currentUser,
  onRefreshProducts,
  onRefreshReviews,
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
  const [formAuthor, setFormAuthor] = useState('');
  const [formRating, setFormRating] = useState(5);
  const [formComment, setFormComment] = useState('');
  const [formVerified, setFormVerified] = useState(false); // Default verifiedPurchase to false
  const [formStatus, setFormStatus] = useState<ReviewStatus>('approved');
  const [formSource, setFormSource] = useState<ReviewSource>('manual');
  const [formImages, setFormImages] = useState<string[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [imageUploadProgressText, setImageUploadProgressText] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit review form state
  const [editAuthor, setEditAuthor] = useState('');
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState('');
  const [editVerified, setEditVerified] = useState(false);
  const [editStatus, setEditStatus] = useState<ReviewStatus>('approved');
  const [editSource, setEditSource] = useState<ReviewSource>('manual');
  const [editImages, setEditImages] = useState<string[]>([]);
  const [isUploadingEditImages, setIsUploadingEditImages] = useState(false);
  const [editUploadProgressText, setEditUploadProgressText] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const canView = currentUser ? (hasUserPermission(currentUser, 'reviews.view') || hasUserPermission(currentUser, 'review.view')) : false;
  const canCreate = currentUser ? (hasUserPermission(currentUser, 'reviews.create') || hasUserPermission(currentUser, 'review.create') || hasUserPermission(currentUser, 'review.manage') || hasUserPermission(currentUser, 'reviews.manage')) : false;
  const canEdit = currentUser ? (hasUserPermission(currentUser, 'reviews.edit') || hasUserPermission(currentUser, 'review.edit') || hasUserPermission(currentUser, 'review.manage') || hasUserPermission(currentUser, 'reviews.manage')) : false;
  const canApprove = currentUser ? (hasUserPermission(currentUser, 'reviews.approve') || hasUserPermission(currentUser, 'review.approve') || hasUserPermission(currentUser, 'review.manage') || hasUserPermission(currentUser, 'reviews.manage')) : false;
  const canDelete = currentUser ? (hasUserPermission(currentUser, 'reviews.delete') || hasUserPermission(currentUser, 'review.delete')) : false;
  const canManage = canApprove;

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
      return (
        productMap.get(selectedProductId) ||
        products.find((p) => p.id === selectedProductId || p.slug === selectedProductId) ||
        null
      );
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
    if (!canApprove) return;
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
      if (onRefreshReviews) onRefreshReviews(updated.productId);
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
    setEditSource(rev.source || 'manual');
    setEditImages(Array.isArray(rev.images) ? [...rev.images] : []);
    setEditError(null);
  };

  // Image upload handler for Add Review form
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList: File[] = Array.from(files);

    if (formImages.length + fileList.length > 5) {
      setFormError('You can attach a maximum of 5 photos per review.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Pre-validate all selected files BEFORE initiating upload
    for (const file of fileList) {
      if (file.size > MAX_REVIEW_IMAGE_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        const errorMsg = `File "${file.name}" exceeds the strict 2MB limit (${sizeMb} MB). Review photos must be 2MB or less.`;
        setFormError(errorMsg);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const val = await validateClientImageFile(file);
      if (!val.valid) {
        setFormError(val.error || `Invalid image file "${file.name}".`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    setIsUploadingImages(true);
    setFormError(null);

    const uploadedUrls: string[] = [];
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setImageUploadProgressText(`Uploading photo ${i + 1} of ${fileList.length}...`);

        // Upload to server with purpose='review'
        const res = await uploadApi.upload(file, 'review');
        if (!res.success || !res.url) {
          throw new Error(res.error || `Failed to upload "${file.name}".`);
        }

        uploadedUrls.push(res.url);
      }

      setFormImages((prev) => [...prev, ...uploadedUrls]);
    } catch (err: any) {
      console.error('Image upload failed:', err);
      setFormError(err.message || 'Image upload failed. Storage service may be unconfigured or offline.');
    } finally {
      setIsUploadingImages(false);
      setImageUploadProgressText(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFormImage = (indexToRemove: number) => {
    setFormImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Image upload handler for Edit Review form
  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList: File[] = Array.from(files);

    if (editImages.length + fileList.length > 5) {
      setEditError('You can attach a maximum of 5 photos per review.');
      if (editFileInputRef.current) editFileInputRef.current.value = '';
      return;
    }

    // Pre-validate all selected files BEFORE initiating upload
    for (const file of fileList) {
      if (file.size > MAX_REVIEW_IMAGE_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        const errorMsg = `File "${file.name}" exceeds the strict 2MB limit (${sizeMb} MB). Review photos must be 2MB or less.`;
        setEditError(errorMsg);
        if (editFileInputRef.current) editFileInputRef.current.value = '';
        return;
      }

      const val = await validateClientImageFile(file);
      if (!val.valid) {
        setEditError(val.error || `Invalid image file "${file.name}".`);
        if (editFileInputRef.current) editFileInputRef.current.value = '';
        return;
      }
    }

    setIsUploadingEditImages(true);
    setEditError(null);

    const uploadedUrls: string[] = [];
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setEditUploadProgressText(`Uploading photo ${i + 1} of ${fileList.length}...`);

        // Upload to server with purpose='review'
        const res = await uploadApi.upload(file, 'review');
        if (!res.success || !res.url) {
          throw new Error(res.error || `Failed to upload "${file.name}".`);
        }

        uploadedUrls.push(res.url);
      }

      setEditImages((prev) => [...prev, ...uploadedUrls]);
    } catch (err: any) {
      console.error('Edit image upload failed:', err);
      setEditError(err.message || 'Image upload failed.');
    } finally {
      setIsUploadingEditImages(false);
      setEditUploadProgressText(null);
      if (editFileInputRef.current) editFileInputRef.current.value = '';
    }
  };

  const handleRemoveEditImage = (indexToRemove: number) => {
    setEditImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Submit Edit Review
  const handleSaveEditedReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReview || (!canEdit && !canApprove)) return;
    if (canEdit && (!editAuthor.trim() || !editComment.trim())) {
      setEditError('Author name and comment are required.');
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const payload: Partial<ProductReview> = {};
      if (canApprove && editStatus !== undefined) {
        payload.status = editStatus;
      }
      if (canEdit) {
        payload.authorName = editAuthor.trim();
        payload.rating = editRating;
        payload.comment = editComment.trim();
        payload.verifiedPurchase = editVerified;
        payload.images = editImages;
      }
      const updated = await reviewsApi.update(editingReview.id, payload);
      setReviews((prev) => prev.map((r) => (r.id === editingReview.id ? updated : r)));
      if (viewingReview && viewingReview.id === editingReview.id) {
        setViewingReview(updated);
      }
      setEditingReview(null);
      showSuccessFeedback('Review details updated successfully.');
      if (onRefreshProducts) onRefreshProducts();
      if (onRefreshReviews) onRefreshReviews(editingReview.productId);
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
      if (onRefreshReviews) onRefreshReviews(deleteCandidate.productId);
    } catch (err: any) {
      alert(`Failed to delete review: ${err.message || 'Server error'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Add review handler (locked to scoped product if applicable)
  const handleCreateStaffReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      setFormError('You do not have permission to create reviews.');
      return;
    }
    const targetId = scopedProduct ? scopedProduct.id : formProductId;
    if (!targetId || !formAuthor.trim() || !formComment.trim()) {
      setFormError('Please fill in all required fields (Author name, rating, comment).');
      return;
    }

    // Permission enforcement: only users with reviews.approve can create directly approved reviews
    const effectiveStatus: ReviewStatus = canManage ? formStatus : 'pending';

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
        status: effectiveStatus,
        source: formSource,
        images: formImages,
      });

      setReviews((prev) => [created, ...prev]);
      setIsAddModalOpen(false);

      // Reset form
      setFormComment('');
      setFormAuthor('');
      setFormRating(5);
      setFormVerified(false);
      setFormImages([]);
      setFormStatus(canApprove ? 'approved' : 'pending');
      setFormSource('manual');

      showSuccessFeedback(
        effectiveStatus === 'approved'
          ? 'Review published directly to the product page!'
          : 'Review saved in Pending queue for moderation.'
      );
      if (onRefreshProducts) onRefreshProducts();
      if (onRefreshReviews) onRefreshReviews(created.productId);
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

  const getSourceBadge = (source?: ReviewSource) => {
    const s = source || 'customer';
    const cfg = REVIEW_SOURCE_CONFIG[s] || REVIEW_SOURCE_CONFIG.customer;
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${cfg.badgeClass}`}
      >
        <Share2 className={`w-3 h-3 ${cfg.iconClass}`} />
        <span>{cfg.label}</span>
      </span>
    );
  };

  const getRatingDescription = (r: number) => {
    switch (r) {
      case 5:
        return '5 Stars - Excellent / অসাধারণ';
      case 4:
        return '4 Stars - Very Good / খুব ভালো';
      case 3:
        return '3 Stars - Good / ভালো';
      case 2:
        return '2 Stars - Fair / মোটামুটি';
      case 1:
        return '1 Star - Poor / সন্তোষজনক নয়';
      default:
        return `${r} Stars`;
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
            <span className="text-[11px] font-bold text-slate-500 hidden sm:inline">Scoped Mode:</span>
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
                  <span className="text-[11px] text-slate-300 font-mono">SKU: {scopedProduct.sku}</span>
                )}
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    scopedProduct.stock <= 5
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {scopedProduct.stock <= 5
                    ? `Low Stock (${scopedProduct.stock})`
                    : `${scopedProduct.stock} in stock`}
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
                  <span className="text-slate-400 text-[11px]">({counts.approved} Approved)</span>
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

            {canCreate ? (
              <button
                type="button"
                id="add-review-scoped-btn"
                onClick={() => {
                  setFormProductId(scopedProduct.id);
                  setFormStatus(canApprove ? 'approved' : 'pending');
                  setFormVerified(false);
                  setIsAddModalOpen(true);
                }}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Review</span>
              </button>
            ) : (
              <button
                type="button"
                id="add-review-scoped-btn"
                disabled
                className="py-2.5 px-4 rounded-xl bg-slate-800 text-slate-500 border border-slate-700 text-xs font-bold flex items-center gap-2 shadow-none cursor-not-allowed whitespace-nowrap opacity-50"
                title="Permission required: reviews.create"
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

            {canCreate ? (
              <button
                type="button"
                id="add-review-global-btn"
                onClick={() => {
                  setFormStatus(canApprove ? 'approved' : 'pending');
                  setFormVerified(false);
                  setIsAddModalOpen(true);
                }}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Review</span>
              </button>
            ) : (
              <button
                type="button"
                id="add-review-global-btn"
                disabled
                className="py-2.5 px-4 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold flex items-center gap-2 shadow-none cursor-not-allowed opacity-50"
                title="Permission required: reviews.create"
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
            {searchQuery || statusFilter !== 'all' || ratingFilter !== 'all' || dateFilter !== 'all' ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (scopedProduct) setFormProductId(scopedProduct.id);
                  setFormStatus(canManage ? 'approved' : 'pending');
                  setFormVerified(false);
                  setIsAddModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add First Review</span>
              </button>
            )}
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

                        {/* Review Source Badge */}
                        {getSourceBadge(rev.source)}

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
                      </div>

                      {/* Star Rating Display */}
                      <div className="flex items-center gap-1 mb-2.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${
                              s <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                            }`}
                          />
                        ))}
                        <span className="text-xs font-bold text-slate-800 ml-1">{rev.rating}.0</span>
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
                          <span>
                            Moderated by: <strong className="text-slate-700">{rev.approvedBy}</strong>
                          </span>
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
                      {canApprove && !isApproved && (
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
                      {canApprove && !isRejected && (
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
                      {canApprove && !isPending && (
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
                      {(canEdit || canApprove) && (
                        <button
                          type="button"
                          id={`edit-review-btn-${rev.id}`}
                          onClick={() => handleOpenEditModal(rev)}
                          className="p-1.5 px-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Edit review text, rating, or photos"
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
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-white"
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
                  <strong className="text-slate-900">
                    {viewingReview.authorName || viewingReview.author || 'Customer'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-semibold">Verification</span>
                  <span className={viewingReview.verifiedPurchase ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                    {viewingReview.verifiedPurchase ? '✓ Verified Purchase' : 'Not verified'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-semibold">Source Origin</span>
                  <div className="mt-0.5">{getSourceBadge(viewingReview.source)}</div>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-semibold">Status</span>
                  <span
                    className={`font-bold capitalize ${
                      viewingReview.status === 'approved'
                        ? 'text-emerald-600'
                        : viewingReview.status === 'rejected'
                        ? 'text-rose-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {viewingReview.status || 'approved'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[11px] font-semibold">Date Submitted</span>
                  <span className="text-slate-700 font-medium">
                    {viewingReview.createdAt
                      ? new Date(viewingReview.createdAt).toLocaleString('en-US')
                      : viewingReview.date || 'Unknown'}
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
                        s <= viewingReview.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                      }`}
                    />
                  ))}
                  <span className="text-sm font-bold text-slate-800 ml-1">
                    {viewingReview.rating} out of 5 Stars ({getRatingDescription(viewingReview.rating)})
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
                        className="relative group rounded-xl overflow-hidden aspect-square border border-slate-200 hover:border-rose-400 transition-all cursor-pointer shadow-2xs"
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
                {canApprove && viewingReview.status !== 'approved' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(viewingReview.id, 'approved')}
                    className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Approve
                  </button>
                )}
                {canApprove && viewingReview.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(viewingReview.id, 'rejected')}
                    className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Reject
                  </button>
                )}
                {(canEdit || canApprove) && (
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
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">Edit Customer Review</h3>
                  <p className="text-xs text-slate-500">Update rating, comment, photos, or moderation status</p>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Author Name *</label>
                  <input
                    type="text"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    required
                    maxLength={60}
                    disabled={!canEdit}
                    className={`w-full py-2 px-3 rounded-xl border text-xs text-slate-800 ${
                      canEdit
                        ? 'bg-slate-50 border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20'
                        : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rating (1 to 5 Stars)</label>
                  <div className="flex items-center gap-1 py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setEditRating(star)}
                        className={`p-1 focus:outline-none ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= editRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-700 ml-1.5">{editRating}★</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Review Feedback *</label>
                <textarea
                  rows={3}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  required
                  maxLength={1000}
                  disabled={!canEdit}
                  className={`w-full py-2 px-3 rounded-xl border text-xs text-slate-800 ${
                    canEdit
                      ? 'bg-slate-50 border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20'
                      : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                  }`}
                />
              </div>

              {/* Photos Management */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                    <span>Optional Review Photos ({editImages.length}/5)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Max 2MB each (JPG, PNG, WebP)</span>
                </div>
                {canEdit && editImages.length < 5 && (
                  <div className="mb-2">
                    <label className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer inline-flex items-center gap-1 py-1 px-2.5 rounded-lg bg-blue-50 border border-blue-200/60">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Attach Photos</span>
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleEditPhotoUpload}
                        className="hidden"
                        disabled={isUploadingEditImages}
                      />
                    </label>
                  </div>
                )}

                {isUploadingEditImages && (
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-xs flex items-center gap-2 mb-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{editUploadProgressText || 'Uploading image...'}</span>
                  </div>
                )}

                {editImages.length > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {editImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative group w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0"
                      >
                        <img src={img} alt="Thumb" className="w-full h-full object-cover" />
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEditImage(idx)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
                            title="Remove image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">No photos attached.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Review Source</label>
                  <select
                    value={editSource}
                    disabled={!canEdit}
                    onChange={(e) => setEditSource(e.target.value as ReviewSource)}
                    className={`w-full py-1.5 px-3 rounded-xl border text-xs font-semibold ${
                      canEdit
                        ? 'bg-slate-50 border-slate-200 text-slate-800 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <option value="manual">Manual (Direct / Staff)</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="facebook">Facebook</option>
                    <option value="messenger">Messenger</option>
                    <option value="instagram">Instagram</option>
                    <option value="admin">Official Staff Review</option>
                    <option value="customer">Customer Submission</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Review Status {canApprove ? '' : '(Restricted)'}
                  </label>
                  <select
                    value={editStatus}
                    disabled={!canApprove}
                    onChange={(e) => setEditStatus(e.target.value as ReviewStatus)}
                    className={`w-full py-1.5 px-3 rounded-xl border text-xs font-semibold ${
                      canApprove
                        ? 'bg-slate-50 border-slate-200 text-slate-800 cursor-pointer'
                        : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <option value="approved">Approved (Live on Catalog)</option>
                    <option value="pending">Pending Moderation</option>
                    <option value="rejected">Rejected (Hidden)</option>
                  </select>
                  {!canApprove && (
                    <span className="text-[10px] text-amber-600 mt-0.5 block">
                      Permission "reviews.approve" required to change status.
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editVerifiedCheck"
                  checked={editVerified}
                  disabled={!canEdit}
                  onChange={(e) => setEditVerified(e.target.checked)}
                  className={`rounded text-rose-600 focus:ring-rose-500 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                />
                <label htmlFor="editVerifiedCheck" className={`text-xs font-semibold ${canEdit ? 'text-slate-700 cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}>
                  Verified Purchase Badge
                </label>
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
                  disabled={editSubmitting || isUploadingEditImages}
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
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
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
              <strong>"{deleteCandidate.authorName || deleteCandidate.author}"</strong>? Public product ratings and
              counts will be recalculated automatically.
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

      {/* 5. Complete Add Review Modal with Photos, Source, and Status Gating */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full border border-slate-200 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 text-white flex items-center justify-center shadow-xs">
                  <Star className="w-5 h-5 fill-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">Add Product Review</h3>
                  <p className="text-xs text-slate-500">Record customer feedback or authentic staff review</p>
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
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateStaffReview} className="space-y-4">
              {/* Selected Product (Clearly Identified) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Target Product *</label>
                {(() => {
                  const targetProd = scopedProduct || productMap.get(formProductId) || products[0];
                  if (!targetProd) return null;
                  return (
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3">
                      {targetProd.imageUrl && (
                        <img
                          src={targetProd.imageUrl}
                          alt={targetProd.title}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0 bg-white"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          {scopedProduct ? 'Locked to Selected Product' : 'Selected Catalog Product'}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900 truncate">{targetProd.title}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-semibold text-slate-700">
                            ৳{targetProd.price.toLocaleString('en-BD')}
                          </span>
                          <span>•</span>
                          <span>Rating: {targetProd.rating?.toFixed(1) || '5.0'}★</span>
                        </div>
                      </div>

                      {!scopedProduct && products.length > 1 && (
                        <select
                          value={formProductId}
                          onChange={(e) => setFormProductId(e.target.value)}
                          className="py-1 px-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer max-w-[200px] truncate"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Reviewer Display Name & Rating */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Reviewer Display Name *
                  </label>
                  <input
                    type="text"
                    id="add-review-author-name"
                    value={formAuthor}
                    onChange={(e) => setFormAuthor(e.target.value)}
                    placeholder="e.g. Tanvir Ahmed or Farhana"
                    required
                    maxLength={60}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Rating (1 to 5 Stars) *
                  </label>
                  <div className="flex items-center gap-1 py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        id={`star-btn-${star}`}
                        onClick={() => setFormRating(star)}
                        className="p-1 focus:outline-none cursor-pointer transition-transform hover:scale-110"
                        title={getRatingDescription(star)}
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= formRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-700 ml-1.5">{formRating}★</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">{getRatingDescription(formRating)}</span>
                </div>
              </div>

              {/* Review Text */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Review Feedback Text *</label>
                  <span className="text-[10px] text-slate-400">{formComment.length}/1000</span>
                </div>
                <textarea
                  id="add-review-comment-text"
                  rows={3}
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  placeholder="Share customer feedback, unboxing impression, or staff review..."
                  required
                  maxLength={1000}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              {/* Optional Review Photos Upload Section */}
              <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                    <span>Optional Review Photos ({formImages.length}/5)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Max 2MB each (JPG, PNG, WebP)</span>
                </div>

                {/* Upload Trigger / Dropzone */}
                {formImages.length < 5 && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed border-slate-300 hover:border-rose-400 bg-white rounded-xl p-3.5 text-center cursor-pointer transition-colors ${
                      isUploadingImages ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <UploadCloud className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                    <span className="text-xs font-bold text-slate-700 block">
                      Click to browse or drop photos
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Upload real customer unboxing photos or staff product images
                    </span>
                  </div>
                )}

                {/* Upload Progress Indicator */}
                {isUploadingImages && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-rose-600 shrink-0" />
                    <span className="font-semibold">{imageUploadProgressText || 'Uploading photo...'}</span>
                  </div>
                )}

                {/* Uploaded Images Preview Grid */}
                {formImages.length > 0 && (
                  <div className="flex items-center gap-2.5 flex-wrap pt-1">
                    {formImages.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        className="relative group w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-2xs shrink-0"
                      >
                        <img src={imgUrl} alt="Upload preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveFormImage(idx)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
                          title="Remove photo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Source & Status Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Source Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Review Source</label>
                  <select
                    id="add-review-source-select"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value as ReviewSource)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  >
                    <option value="manual">Manual (Staff / Direct Entry)</option>
                    <option value="whatsapp">WhatsApp (Customer Chat)</option>
                    <option value="facebook">Facebook (Page / Post)</option>
                    <option value="messenger">Messenger (Direct Message)</option>
                    <option value="instagram">Instagram (DM / Story)</option>
                    <option value="admin">Official Staff Review</option>
                  </select>
                </div>

                {/* Status Selection (Subject to permissions) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Initial Status {canApprove ? '' : '(Pending Only)'}
                  </label>
                  <select
                    id="add-review-status-select"
                    value={canManage ? formStatus : 'pending'}
                    disabled={!canManage}
                    onChange={(e) => setFormStatus(e.target.value as ReviewStatus)}
                    className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                      canManage
                        ? 'bg-slate-50 border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20'
                        : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <option value="approved">Approved (Live on Catalog)</option>
                    <option value="pending">Pending Moderation</option>
                  </select>
                  {!canApprove && (
                    <span className="text-[10px] text-amber-600 mt-0.5 block">
                      Permission "reviews.approve" required to publish immediately. Review will be submitted as Pending.
                    </span>
                  )}
                </div>
              </div>

              {/* Verified Purchase Checkbox (Default false) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <label
                    htmlFor="addVerifiedCheck"
                    className="text-xs font-bold text-slate-800 cursor-pointer block"
                  >
                    Verified Purchase Badge
                  </label>
                  <p className="text-[10px] text-slate-500">
                    Default is false. Check only when customer order has been independently confirmed.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="addVerifiedCheck"
                  checked={formVerified}
                  onChange={(e) => setFormVerified(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-staff-review-btn"
                  disabled={formSubmitting || isUploadingImages}
                  className="py-2.5 px-6 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {formSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Review...</span>
                    </>
                  ) : (
                    <span>Publish Review</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
