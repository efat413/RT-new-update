import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Maximize2,
  Minimize2,
  ExternalLink,
  Play,
  Tv,
  AlertCircle,
  Video,
} from 'lucide-react';
import { Product } from '../types';
import { extractYouTubeVideoId, getYouTubeEmbedUrl, isDirectVideoUrl } from '../utils/youtube';

export interface ProductVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  initialMode?: 'popup' | 'floating';
  onEnterFloatingMode?: () => void;
}

export const ProductVideoModal: React.FC<ProductVideoModalProps> = ({
  isOpen,
  onClose,
  product,
  initialMode = 'popup',
  onEnterFloatingMode,
}) => {
  const [windowMode, setWindowMode] = useState<'popup' | 'floating'>(initialMode);
  const [isMinimized, setIsMinimized] = useState(false);

  // Sync initial mode on open
  useEffect(() => {
    if (isOpen) {
      setWindowMode(initialMode);
      setIsMinimized(false);
    }
  }, [isOpen, initialMode]);

  // Handle Escape key to close video modal without closing underlying modals
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  const rawVideoUrl = product.videoUrl?.trim() || '';
  const videoId = extractYouTubeVideoId(rawVideoUrl);
  const isDirectVideo = !videoId && isDirectVideoUrl(rawVideoUrl);
  const embedUrl = videoId ? getYouTubeEmbedUrl(videoId, { autoplay: true, rel: 0 }) : null;
  const youtubeWatchUrl = videoId
    ? `https://www.youtube.com/watch?v=${videoId}`
    : rawVideoUrl || undefined;

  const handleSwitchToFloating = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsMinimized(false);
    setWindowMode('floating');
    if (onEnterFloatingMode) {
      onEnterFloatingMode();
    }
  };

  // 1. FLOATING WINDOW MODE (Docked at bottom right so user can browse store)
  if (windowMode === 'floating') {
    const floatingContent = (
      <aside
        id="product-floating-video-window"
        aria-label="Floating product video window"
        onClick={(e) => e.stopPropagation()}
        className={`fixed z-[100020] bottom-4 right-4 sm:bottom-6 sm:right-6 transition-all duration-300 ease-out shadow-2xl rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-900 text-white flex flex-col ${
          isMinimized ? 'w-72 sm:w-80 h-14' : 'w-[90vw] sm:w-[380px] md:w-[440px] max-w-full'
        }`}
      >
        {/* Floating Window Title Bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/95 border-b border-slate-800 select-none shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight">
                {product.title}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">Product Video Demo</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Toggle Minimize Content */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized((prev) => !prev);
              }}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title={isMinimized ? 'Expand video' : 'Minimize video window'}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Switch to Full Modal Popup */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(false);
                setWindowMode('popup');
              }}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Expand to Full Pop-up Window"
            >
              <Tv className="w-3.5 h-3.5" />
            </button>

            {/* External link */}
            {youtubeWatchUrl && (
              <a
                href={youtubeWatchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                title="Watch on YouTube"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Close */}
            <button
              type="button"
              id="close-floating-video-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
              title="Close video"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Player Body (Hidden when minimized) */}
        {!isMinimized && (
          <div className="relative aspect-video w-full bg-black">
            {embedUrl ? (
              <iframe
                id="product-floating-video-iframe"
                src={embedUrl}
                title={`${product.title} Video Preview`}
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full border-0"
              />
            ) : isDirectVideo ? (
              <video
                id="product-floating-video-element"
                src={rawVideoUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-slate-400">
                <AlertCircle className="w-7 h-7 text-amber-400 mb-2" />
                <p className="text-xs font-semibold text-white">Video Link Not Available</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                  Please link a valid YouTube video in the admin panel product details.
                </p>
              </div>
            )}
          </div>
        )}
      </aside>
    );

    return typeof document !== 'undefined'
      ? createPortal(floatingContent, document.body)
      : floatingContent;
  }

  // 2. POP-UP MODAL MODE (Centered with backdrop)
  const popupContent = (
    <div
      id="product-video-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-video-title"
      className="fixed inset-0 z-[100020] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 text-white"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-950/90 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0 mr-3">
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </div>
            <div className="min-w-0">
              <h3 id="product-video-title" className="text-sm sm:text-base font-bold text-white truncate">
                {product.title}
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="font-semibold text-rose-400">Official Product Video Demo</span>
                <span>•</span>
                <span>৳{product.price.toLocaleString()}</span>
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Switch to Floating Window Mode */}
            <button
              type="button"
              id="product-video-float-toggle-btn"
              onClick={handleSwitchToFloating}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition-all cursor-pointer shadow-xs active:scale-95"
              title="Float video window to continue browsing store"
            >
              <Tv className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Floating Mode</span>
            </button>

            {/* Open in YouTube */}
            {youtubeWatchUrl && (
              <a
                href={youtubeWatchUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 text-xs font-semibold border border-slate-700/60 transition-all shadow-xs"
                title="Watch on YouTube"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>YouTube</span>
              </a>
            )}

            {/* Close Button */}
            <button
              type="button"
              id="close-product-video-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition-all cursor-pointer"
              title="Close video (Esc)"
              aria-label="Close video pop-up"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Player Stage */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center">
          {embedUrl ? (
            <iframe
              id="product-video-iframe"
              src={embedUrl}
              title={`${product.title} YouTube Video`}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : isDirectVideo ? (
            <video
              id="product-video-element"
              src={rawVideoUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <div className="p-8 text-center max-w-md space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
                <Video className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-white">No Video Linked Yet</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                A video link has not been assigned to this product yet. Store administrators can paste any YouTube URL (watch, shorts, or share link) in the product details editor.
              </p>
              {product.videoUrl && (
                <p className="text-[11px] font-mono bg-slate-800 px-3 py-1.5 rounded-xl text-rose-300 break-all">
                  Configured: {product.videoUrl}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Bottom Helpful Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-950/80 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
          <p className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>High-definition streaming via YouTube player</span>
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="product-video-float-bottom-btn"
              onClick={handleSwitchToFloating}
              className="hover:text-purple-300 transition-colors font-medium flex items-center gap-1 cursor-pointer"
            >
              <Tv className="w-3 h-3 text-purple-400" />
              <span>Browse store while watching (Floating window)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(popupContent, document.body)
    : popupContent;
};
