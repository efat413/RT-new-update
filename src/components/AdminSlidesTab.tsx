import React, { useState } from 'react';
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
  Tag,
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
}) => {
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

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
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
            Customize banner images, headlines, promotional badges, and target categories. Master ratio is strictly <strong>5:2 (1200 × 480 px)</strong> on all screen sizes.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
                  showNotice('Slides restored to defaults.');
                },
              });
            }}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Reset to default seed slides"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>

          <button
            id="admin-add-slide-btn"
            onClick={openAddModal}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all"
          >
            <Plus className="w-4 h-4" />
            Add New Slide
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Slide Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {slides.map((slide, idx) => {
          const cat = categories.find((c) => c.id === slide.categoryId);
          return (
            <div
              key={slide.id}
              className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all"
            >
              <div>
                {/* Visual Preview (5:2 Master Aspect Ratio matching storefront) */}
                <div className="relative aspect-[1200/480] w-full bg-slate-900 overflow-hidden">
                  <img
                    src={slide.imageUrl}
                    alt={slide.headline}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-t ${slide.accentGradient || 'from-slate-950/80 to-transparent'} opacity-80`} />
                  
                  {/* Overlay Badges */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-slate-900/90 text-white border border-white/20 backdrop-blur-sm">
                      Slide #{idx + 1}
                    </span>
                    {slide.tag && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white border border-white/20 backdrop-blur-sm">
                        {slide.tag}
                      </span>
                    )}
                  </div>

                  {slide.discountBadge && (
                    <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-amber-300 bg-black/60 border border-amber-400/40 backdrop-blur-sm">
                      {slide.discountBadge}
                    </span>
                  )}

                  {/* Bottom Preview info */}
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <h4 className="font-bold text-sm leading-tight drop-shadow-sm line-clamp-1">
                      {slide.headline}
                    </h4>
                    <p className="text-[11px] text-slate-300 line-clamp-1 mt-0.5">
                      {slide.subtext}
                    </p>
                  </div>
                </div>

                {/* Details Body */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Title: <strong className="text-slate-700">{slide.title || 'Untitled'}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                      {cat?.name || 'General Category'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {slide.subtext}
                  </p>

                  <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100">
                    <span>Button CTA: <strong>{slide.buttonText || 'Shop Collection'}</strong></span>
                    {slide.imageUrl && (
                      <a
                        href={slide.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 hover:underline flex items-center gap-1"
                      >
                        <ImageIcon className="w-3 h-3" />
                        View Image
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 pt-0 flex gap-2">
                <button
                  id={`edit-slide-btn-${slide.id}`}
                  onClick={() => openEditModal(slide)}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  Edit Content & Image
                </button>
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
                          showNotice('Slide removed from D1 database.');
                        }
                      },
                    });
                  }}
                  className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs flex items-center justify-center transition-colors"
                  title="Delete Slide"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
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
                    Modify the banner image URL, promotional texts, and target categories.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4">
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
                      className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
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
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
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
