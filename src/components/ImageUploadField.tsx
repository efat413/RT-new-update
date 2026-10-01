import React, { useState, useRef, useEffect } from 'react';
import { Upload, Link as LinkIcon, Image as ImageIcon, CheckCircle2, AlertCircle, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { processImageFile } from '../utils/imageUpload';
import { uploadApi } from '../services/storeApi';
import { getResponsiveImageUrl } from '../utils/responsiveImage';

interface ImageUploadFieldProps {
  label: string;
  sublabel?: string;
  value: string;
  onChange: (url: string) => void;
  recommendedSize?: string;
  aspectRatioLabel?: string;
  targetAspectRatio?: number;
  aspectRatioTolerance?: number;
  maxDimension?: number;
  idPrefix?: string;
  placeholder?: string;
  previewHeightClass?: string;
  isIcon?: boolean;
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  label,
  sublabel,
  value,
  onChange,
  recommendedSize,
  aspectRatioLabel,
  targetAspectRatio,
  aspectRatioTolerance = 0.35,
  maxDimension = 1400,
  idPrefix = 'image-upload',
  placeholder = 'https://example.com/image.jpg',
  previewHeightClass = 'h-36',
  isIcon = false,
}) => {
  const isDataUrl = value && value.startsWith('data:image/');
  const [sourceMode, setSourceMode] = useState<'upload' | 'url'>(isDataUrl ? 'upload' : 'upload');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [detectedDimensions, setDetectedDimensions] = useState<{ width: number; height: number; ratio: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) {
      setDetectedDimensions(null);
      setImageLoadError(false);
      return;
    }

    let isMounted = true;
    const img = new Image();
    img.onload = () => {
      if (!isMounted) return;
      if (img.naturalWidth && img.naturalHeight) {
        setDetectedDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight,
          ratio: img.naturalWidth / img.naturalHeight,
        });
        setImageLoadError(false);
      }
    };
    img.onerror = () => {
      if (!isMounted) return;
      setImageLoadError(true);
      setDetectedDimensions(null);
    };
    img.src = value;

    return () => {
      isMounted = false;
    };
  }, [value]);

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setErrorMessage(null);
    setImageLoadError(false);

    // Provide instant local image preview immediately upon selection so the user sees their new image with zero delay
    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result && typeof reader.result === 'string') {
          onChange(reader.result);
        }
      };
      reader.readAsDataURL(file);
    } catch {}

    try {
      setIsProcessing(true);
      // Upload directly to Cloudflare Worker upload endpoint (R2 / D1 media assets)
      const uploadRes = await uploadApi.upload(file);
      if (uploadRes.success && uploadRes.url) {
        onChange(uploadRes.url);
        setSourceMode('upload');
      } else {
        // Safe fallback: compress image with safe dimensions
        const safeDataUrl = await processImageFile(file, Math.min(maxDimension, 600));
        onChange(safeDataUrl);
        setSourceMode('upload');
      }
    } catch (err: any) {
      try {
        const safeDataUrl = await processImageFile(file, Math.min(maxDimension, 600));
        onChange(safeDataUrl);
        setSourceMode('upload');
      } catch (fallbackErr: any) {
        setErrorMessage(fallbackErr?.message || 'Could not process selected image.');
      }
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-2.5 bg-slate-50/70 p-3.5 sm:p-4 rounded-2xl border border-slate-200">
      {/* Label & Hints */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
            {label}
          </label>
          {sublabel && <p className="text-[11px] text-slate-500">{sublabel}</p>}
        </div>
        {(recommendedSize || aspectRatioLabel) && (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
            {aspectRatioLabel && (
              <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700">
                {aspectRatioLabel}
              </span>
            )}
            {recommendedSize && (
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60 font-mono">
                {recommendedSize}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mode Selector Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          id={`${idPrefix}-mode-device`}
          onClick={() => setSourceMode('upload')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            sourceMode === 'upload'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload from Device</span>
        </button>
        <button
          type="button"
          id={`${idPrefix}-mode-url`}
          onClick={() => setSourceMode('url')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            sourceMode === 'url'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          <span>Paste Image Link</span>
        </button>
      </div>

      {/* Upload from Device Input */}
      {sourceMode === 'upload' && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
              : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/80'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />

          {isProcessing ? (
            <div className="flex flex-col items-center justify-center py-2 space-y-2">
              <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
              <p className="text-xs font-semibold text-slate-600">Processing & optimizing image...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-1 space-y-1.5">
              <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Upload className="w-4 h-4" />
              </div>
              <p className="text-xs font-bold text-slate-700">
                Click to browse device or drag & drop image here
              </p>
              <p className="text-[11px] text-slate-400">
                Supports PNG, JPG, WEBP, SVG, ICO up to 10MB
              </p>
            </div>
          )}
        </div>
      )}

      {/* Paste Image Link Input */}
      {sourceMode === 'url' && (
        <div className="space-y-1.5">
          <div className="relative">
            <input
              type="url"
              id={`${idPrefix}-url-input`}
              value={value}
              onChange={(e) => {
                setImageLoadError(false);
                onChange(e.target.value);
              }}
              placeholder={placeholder}
              className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>
          <p className="text-[11px] text-slate-500">
            Paste any direct image link from Unsplash, Imgur, Pinterest, Cloudinary, etc.
          </p>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Live Preview Area */}
      {value && (
        <div className="relative bg-white border border-slate-200 rounded-xl p-2.5 flex items-center gap-3">
          <div
            className={`relative rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 ${
              isIcon ? 'w-14 h-14' : previewHeightClass + ' w-28 sm:w-36'
            }`}
          >
            {!imageLoadError ? (
              <img
                src={getResponsiveImageUrl(value, 360)}
                alt="Preview"
                width={144}
                height={144}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
                onError={() => setImageLoadError(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-2 text-center text-slate-400">
                <ImageIcon className="w-5 h-5 text-slate-300" />
                <span className="text-[9px] text-rose-500 font-bold mt-1">Image Error</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-xs font-bold text-slate-800 truncate">
                {isDataUrl ? 'Device Image Ready' : 'Linked Image Ready'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-xs sm:max-w-sm">
              {isDataUrl ? `Embedded Data URL (${Math.round(value.length / 1024)} KB)` : value}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  if (sourceMode === 'upload') {
                    fileInputRef.current?.click();
                  } else {
                    const el = document.getElementById(`${idPrefix}-url-input`);
                    if (el) el.focus();
                  }
                }}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                Change Image
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setImageLoadError(false);
                }}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aspect Ratio Validation & Warning */}
      {value && detectedDimensions && targetAspectRatio && (
        <>
          {Math.abs(detectedDimensions.ratio - targetAspectRatio) > aspectRatioTolerance ? (
            <div className="flex items-start gap-2.5 text-xs text-amber-900 bg-amber-50/90 border border-amber-300/80 p-3 rounded-xl shadow-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <span>Aspect Ratio Notice</span>
                  <span className="px-1.5 py-0.2 rounded bg-amber-200/70 text-amber-900 font-mono text-[10px]">
                    {detectedDimensions.width} × {detectedDimensions.height} px ({detectedDimensions.ratio.toFixed(2)}:1)
                  </span>
                </div>
                <p className="text-amber-800/90">
                  The recommended master slider ratio is{' '}
                  <strong className="text-amber-950 font-bold">
                    {targetAspectRatio === 2.5 ? '5:2 (2.5:1, e.g. 1200 × 480 px)' : `${targetAspectRatio}:1`}
                  </strong>
                  . Your image will be preserved without stretching or distortion, but matching 5:2 guarantees seamless edge-to-edge coverage on all phones, tablets, and desktops.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-emerald-800 bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Perfect Ratio:</strong> {detectedDimensions.width} × {detectedDimensions.height} px ({detectedDimensions.ratio.toFixed(2)}:1) matches the 5:2 master ratio for all screen sizes.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
