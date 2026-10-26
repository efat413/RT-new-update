import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  Edit2,
  Trash2,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Check,
  X,
  Eye,
  EyeOff,
  Tag,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { CarouselSlide, Category } from '../types';
import { ImageUploadField } from './ImageUploadField';
import { ConfirmModal } from './ConfirmModal';

interface AdminSlidesTabProps {
  slides: CarouselSlide[];
  categories: Category[];
  onAddSlide: (slide: Omit<CarouselSlide, 'id'>) => Promise<{ success: boolean; slider?: CarouselSlide; error?: string }> | any;
  onUpdateSlide: (id: string, updates: Partial<CarouselSlide>) => Promise<{ success: boolean; slider?: CarouselSlide; error?: string }> | any;
  onDeleteSlide: (id: string) => Promise<{ success: boolean; error?: string }> | any;
  onResetSlides: () => Promise<void> | void;
  onReorderSlides?: (orderedItems: Array<{ id: string; sort_order?: number; sortOrder?: number } | string>) => Promise<{ success: boolean; sliders?: CarouselSlide[]; error?: string }>;
  canManageSlides?: boolean;
}

const GRADIENT_PRESETS = [
  { name: 'Amber to Rose', value: 'from-amber-500/80 to-rose-600/80', bg: 'bg-gradient-to-r from-amber-500 to-rose-600' },
  { name: 'Blue to Violet', value: 'from-blue-600/80 to-violet-600/80', bg: 'bg-gradient-to-r from-blue-600 to-violet-600' },
  { name: 'Rose to Emerald', value: 'from-rose-500/80 to-emerald-600/80', bg: 'bg-gradient-to-r from-rose-500 to-emerald-600' },
  { name: 'Purple to Indigo', value: 'from-purple-600/80 to-indigo-700/80', bg: 'bg-gradient-to-r from-purple-600 to-indigo-700' },
  { name: 'Dark Slate Premium', value: 'from-slate-900/90 to-slate-800/80', bg: 'bg-gradient-to-r from-slate-900 to-slate-800' },
];

export const AdminSlidesTab: React.FC<AdminSlidesTabProps> = ({
  slides,
  categories,
  onAddSlide,
  onUpdateSlide,
  onDeleteSlide,
  onResetSlides,
  onReorderSlides,
  canManageSlides = true,
}) => {
  const [localSlides, setLocalSlides] = useState<CarouselSlide[]>(() => {
    return [...slides].sort((a, b) => (Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0)));
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderSaveStatus, setOrderSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<CarouselSlide | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [headline, setHeadline] = useState('');
  const [subtext, setSubtext] = useState('');
  const [tag, setTag] = useState('');
  const [discountBadge, setDiscountBadge] = useState('');
  const [buttonText, setButtonText] = useState('Shop Collection');
  const [categoryId, setCategoryId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [accentGradient, setAccentGradient] = useState(GRADIENT_PRESETS[0].value);
  const [isActive, setIsActive] = useState(true);
  const [notice, setNotice] = useState('');
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

  // Sync local slides when parent slides change and there are no unsaved drag reorders
  useEffect(() => {
    if (!isDirty) {
      setLocalSlides([...slides].sort((a, b) => (Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0))));
    }
  }, [slides, isDirty]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const moveSlide = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= localSlides.length || toIndex >= localSlides.length) return;
    const reordered = [...localSlides];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const normalized = reordered.map((s, idx) => ({
      ...s,
      sort_order: idx + 1,
      sortOrder: idx + 1,
    }));
    setLocalSlides(normalized);
    setIsDirty(true);
    setOrderSaveStatus('idle');
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!canManageSlides) return;
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!canManageSlides) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (!canManageSlides) return;
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    const sourceIndex = sourceIndexStr ? parseInt(sourceIndexStr, 10) : draggedIndex;

    if (sourceIndex !== null && !isNaN(sourceIndex) && sourceIndex !== targetIndex) {
      moveSlide(sourceIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSaveOrder = async () => {
    if (!onReorderSlides || isSavingOrder || !canManageSlides) return;
    setIsSavingOrder(true);
    setOrderSaveStatus('saving');
    try {
      const payload = localSlides.map((s, idx) => ({
        id: s.id,
        sort_order: idx + 1,
      }));
      const res = await onReorderSlides(payload);
      if (res && res.success === false) {
        setOrderSaveStatus('error');
        showNotice(res.error || 'Failed to save slide order to D1 database');
      } else {
        setIsDirty(false);
        setOrderSaveStatus('saved');
        showNotice('Banner order saved successfully in D1 database!');
        setTimeout(() => setOrderSaveStatus('idle'), 3000);
      }
    } catch (err: any) {
      setOrderSaveStatus('error');
      showNotice(err?.message || 'Error communicating with D1 database');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleDiscardOrder = () => {
    setLocalSlides([...slides].sort((a, b) => (Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0))));
    setIsDirty(false);
    setOrderSaveStatus('idle');
    showNotice('Reverted unsaved order changes.');
  };

  const handleToggleActive = async (slide: CarouselSlide) => {
    if (!canManageSlides) return;
    const nextActive = slide.isActive === false ? true : false;
    // Optimistic update
    setLocalSlides((prev) => prev.map((s) => s.id === slide.id ? { ...s, isActive: nextActive } : s));
    try {
      const res = await onUpdateSlide(slide.id, { isActive: nextActive });
      if (res && res.success === false) {
        setLocalSlides((prev) => prev.map((s) => s.id === slide.id ? { ...s, isActive: !nextActive } : s));
        showNotice(res.error || 'Failed to update slide visibility');
      } else {
        showNotice(nextActive ? 'Slide is now active on homepage' : 'Slide deactivated (hidden from homepage)');
      }
    } catch (err: any) {
      setLocalSlides((prev) => prev.map((s) => s.id === slide.id ? { ...s, isActive: !nextActive } : s));
      showNotice(err?.message || 'Failed to update slide visibility');
    }
  };

  const openAddModal = () => {
    setEditingSlide(null);
    setTitle('');
    setHeadline('');
    setSubtext('');
    setTag('EXCLUSIVE COLLECTION');
    setDiscountBadge('SPECIAL OFFER');
    setButtonText('Shop Collection');
    setCategoryId(categories[0]?.id || '');
    setImageUrl('https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1400&q=80');
    setAccentGradient(GRADIENT_PRESETS[0].value);
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (slide: CarouselSlide) => {
    setEditingSlide(slide);
    setTitle(slide.title);
    setHeadline(slide.headline);
    setSubtext(slide.subtext);
    setTag(slide.tag);
    setDiscountBadge(slide.discountBadge);
    setButtonText(slide.buttonText || 'Shop Collection');
    setCategoryId(slide.categoryId || categories[0]?.id || '');
    setImageUrl(slide.imageUrl);
    setAccentGradient(slide.accentGradient || GRADIENT_PRESETS[0].value);
    setIsActive(slide.isActive !== false);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headline.trim() || !imageUrl.trim()) return;

    setIsSaving(true);
    try {
      if (editingSlide) {
        const res = await onUpdateSlide(editingSlide.id, {
          title,
          headline,
          subtext,
          tag,
          discountBadge,
          buttonText,
          categoryId,
          imageUrl,
          accentGradient,
          isActive,
        });
        if (res && res.success === false) {
          showNotice(res.error || 'Failed to update slide in D1 database');
          return;
        }
        showNotice('Slide updated successfully in D1 database!');
      } else {
        const res = await onAddSlide({
          title,
          headline,
          subtext,
          tag,
          discountBadge,
          buttonText,
          categoryId,
          imageUrl,
          accentGradient,
          isActive,
        });
        if (res && res.success === false) {
          showNotice(res.error || 'Failed to create slide in D1 database');
          return;
        }
        showNotice('New banner slide added to D1 database!');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      showNotice(err?.message || 'Error communicating with D1 database');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-900 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-rose-600" />
            Hero Carousel Slide Management (স্লাইডার ব্যানার)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Arrange banner order via drag-and-drop or position buttons. Master ratio is strictly <strong>5:2 (1200 × 480 px)</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Save Order Button */}
          {onReorderSlides && (
            <button
              id="save-slide-order-header-btn"
              onClick={handleSaveOrder}
              disabled={!isDirty || isSavingOrder || !canManageSlides}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                isDirty
                  ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse active:scale-95 cursor-pointer shadow-md'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
              title={isDirty ? 'Save newly arranged banner order to D1' : 'No unsaved order changes'}
            >
              {isSavingOrder ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Order...</span>
                </>
              ) : orderSaveStatus === 'saved' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Order Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Order</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => {
              setConfirmDialog({
                isOpen: true,
                title: 'Reset Carousel Slides?',
                message: 'Are you sure you want to reset all promotional hero slides back to original store defaults?',
                confirmText: 'Reset Defaults',
                variant: 'danger',
                onConfirm: () => {
                  onResetSlides();
                  setIsDirty(false);
                  showNotice('Slides restored to defaults.');
                },
              });
            }}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Reset to default seed slides"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>

          <button
            id="admin-add-slide-btn"
            onClick={openAddModal}
            disabled={!canManageSlides}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add New Slide
          </button>
        </div>
      </div>

      {/* Unsaved Changes Banner */}
      {isDirty && (
        <div
          id="unsaved-slide-order-banner"
          className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-950">
                Unsaved Banner Order (স্লাইডার ক্রম সংরক্ষিত নয়)
              </p>
              <p className="text-[11px] text-amber-700">
                You changed the slide order. Click <strong>Save Order</strong> to persist changes to the database and storefront.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              onClick={handleDiscardOrder}
              disabled={isSavingOrder}
              className="px-3 py-1.5 rounded-xl border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 text-xs font-bold transition-colors cursor-pointer"
            >
              Discard
            </button>
            <button
              id="save-slide-order-btn"
              onClick={handleSaveOrder}
              disabled={isSavingOrder || !canManageSlides}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSavingOrder ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Order</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Slide Cards List with Drag-and-Drop and Position Handles */}
      <div className="space-y-4" role="list" aria-label="Hero Carousel Slides Reorder List">
        {localSlides.map((slide, idx) => {
          const cat = categories.find((c) => c.id === slide.categoryId);
          const isSlideActive = slide.isActive !== false;
          const isBeingDragged = draggedIndex === idx;
          const isDraggedOver = dragOverIndex === idx;

          return (
            <div
              key={slide.id}
              id={`slide-row-${slide.id}`}
              role="listitem"
              draggable={canManageSlides}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              className={`bg-white rounded-2xl border transition-all duration-150 overflow-hidden shadow-xs hover:shadow-md ${
                isBeingDragged
                  ? 'opacity-40 border-dashed border-slate-400 scale-[0.99]'
                  : isDraggedOver
                  ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/10'
                  : isSlideActive
                  ? 'border-slate-200'
                  : 'border-slate-200 bg-slate-50/60 opacity-80'
              }`}
            >
              <div className="p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Left Side: Drag Handle, Position Number, Thumbnail & Details */}
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  {/* Drag Handle */}
                  <div
                    className={`flex items-center gap-1 shrink-0 ${
                      canManageSlides ? 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700' : 'text-slate-300 cursor-not-allowed'
                    }`}
                    title={canManageSlides ? 'Drag to reorder slide position' : 'Permission required to reorder'}
                    aria-label={`Drag handle for slide ${idx + 1}`}
                  >
                    <GripVertical className="w-5 h-5" />
                  </div>

                  {/* Position Badge */}
                  <div className="flex flex-col items-center justify-center shrink-0">
                    <span
                      id={`slide-pos-${slide.id}`}
                      className="w-8 h-8 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center shadow-xs"
                      title={`Current position: #${idx + 1}`}
                    >
                      #{idx + 1}
                    </span>
                    {/* Accessible Keyboard / Touch Up and Down buttons */}
                    <div className="flex items-center gap-0.5 mt-1">
                      <button
                        type="button"
                        onClick={() => moveSlide(idx, idx - 1)}
                        disabled={idx === 0 || !canManageSlides}
                        aria-label={`Move slide "${slide.title || slide.headline}" up`}
                        title="Move Up"
                        className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlide(idx, idx + 1)}
                        disabled={idx === localSlides.length - 1 || !canManageSlides}
                        aria-label={`Move slide "${slide.title || slide.headline}" down`}
                        title="Move Down"
                        className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Banner Thumbnail (Unified 5:2 Master Aspect Ratio) */}
                  <div className="relative w-32 sm:w-44 aspect-[1200/480] bg-slate-950 rounded-xl overflow-hidden shrink-0 shadow-xs border border-slate-200">
                    <img
                      src={slide.imageUrl}
                      alt={slide.headline}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-t ${slide.accentGradient || 'from-slate-950/80 to-transparent'} opacity-70`} />
                    {slide.tag && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-sm text-[8px] font-bold bg-white/20 text-white backdrop-blur-xs line-clamp-1 max-w-[90%]">
                        {slide.tag}
                      </span>
                    )}
                    {slide.discountBadge && (
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-sm text-[8px] font-black text-amber-300 bg-black/60 backdrop-blur-xs">
                        {slide.discountBadge}
                      </span>
                    )}
                  </div>

                  {/* Slide Info */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-slate-900 truncate">
                        {slide.title || slide.headline || 'Untitled Slide'}
                      </h4>
                      {/* Active / Inactive Badge */}
                      {isSlideActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-slate-200 text-slate-600 border border-slate-300">
                          Inactive (Hidden)
                        </span>
                      )}
                      {cat && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                          {cat.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-1 font-medium">
                      {slide.headline}
                    </p>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {slide.subtext || 'No additional description'}
                    </p>
                  </div>
                </div>

                {/* Right Side: Action Buttons */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  {/* Quick Active / Inactive Toggle Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(slide)}
                    disabled={!canManageSlides}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                      isSlideActive
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                    }`}
                    title={isSlideActive ? 'Click to deactivate slide' : 'Click to activate slide on homepage'}
                  >
                    {isSlideActive ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                        <span>Inactive</span>
                      </>
                    )}
                  </button>

                  {/* Edit Button */}
                  <button
                    id={`edit-slide-btn-${slide.id}`}
                    onClick={() => openEditModal(slide)}
                    disabled={!canManageSlides}
                    className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Edit</span>
                  </button>

                  {/* Delete Button */}
                  <button
                    id={`delete-slide-btn-${slide.id}`}
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: 'Delete Carousel Slide?',
                        message: `Are you sure you want to permanently delete slide "${slide.headline}"?`,
                        confirmText: 'Delete Slide',
                        variant: 'danger',
                        onConfirm: async () => {
                          const res = await onDeleteSlide(slide.id);
                          if (res && res.success === false) {
                            showNotice(res.error || 'Failed to delete slide from D1 database');
                          } else {
                            setLocalSlides((prev) => prev.filter((s) => s.id !== slide.id).map((s, i) => ({ ...s, sort_order: i + 1 })));
                            showNotice('Slide removed from D1 database.');
                          }
                        },
                      });
                    }}
                    disabled={!canManageSlides}
                    className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs flex items-center transition-colors cursor-pointer disabled:opacity-50"
                    title="Delete Slide"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / Add Slide Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="h-2 w-full rainbow-gradient-bg shrink-0" />

            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingSlide ? 'Edit Carousel Slide' : 'Create New Banner Slide'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Modify the banner image URL, promotional texts, active status, and target categories.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4">
              {/* Visibility Status Switch */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold text-slate-800">Banner Visibility (হোমপেজ প্রদর্শন)</span>
                  <span className="text-[11px] text-slate-500">Active banners are displayed on the public storefront hero slider.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 ${
                    isActive ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                  role="switch"
                  aria-checked={isActive}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      isActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Image with upload from device or link */}
              <ImageUploadField
                label="Banner Image (Hero Carousel) *"
                sublabel="Upload a high-resolution banner photo directly from your device or paste an external image link."
                value={imageUrl}
                onChange={(val) => setImageUrl(val)}
                recommendedSize="1200 × 480 px (or 1400 × 560 px)"
                aspectRatioLabel="5:2 Master Aspect Ratio (Unified All Devices)"
                targetAspectRatio={2.5}
                aspectRatioTolerance={0.35}
                maxDimension={1600}
                idPrefix="slide-banner"
                placeholder="https://images.unsplash.com/..."
                previewHeightClass="h-28"
              />

              {/* Headline */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Main Headline *
                </label>
                <input
                  id="slide-headline-input"
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g. Class & Character in Every Detail"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              {/* Title & Subtext */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Slide Title / Collection
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Men's Luxury Accessories"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Button Label
                  </label>
                  <input
                    type="text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    placeholder="Shop Collection"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Subtext description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Subtext Description
                </label>
                <textarea
                  rows={2}
                  value={subtext}
                  onChange={(e) => setSubtext(e.target.value)}
                  placeholder="e.g. Discover top-grain leather wallets, scratch-proof quartz watches, and stainless steel wristwear..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Badges and Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Tag Eyebrow
                  </label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="NEW 2026 COLLECTION"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Discount Badge
                  </label>
                  <input
                    type="text"
                    value={discountBadge}
                    onChange={(e) => setDiscountBadge(e.target.value)}
                    placeholder="UP TO 25% OFF"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Target Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Accent Gradient Preset */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Color Gradient Mood
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {GRADIENT_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setAccentGradient(p.value)}
                      className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                        accentGradient === p.value
                          ? 'border-slate-900 ring-2 ring-slate-900 bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full ${p.bg} shrink-0`} />
                      <span className="text-[11px] font-semibold text-slate-800 truncate">
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 flex gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="save-slide-submit-btn"
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to D1...</span>
                    </>
                  ) : (
                    editingSlide ? 'Update Slide' : 'Add Slide'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Confirm Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        variant={confirmDialog.variant}
      />
    </div>
  );
};
