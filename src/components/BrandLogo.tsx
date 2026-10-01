import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { getResponsiveImageUrl } from '../utils/responsiveImage';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  textClassName?: string;
  customLogoUrl?: string;
  priority?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
  textClassName = '',
  customLogoUrl,
  priority = false,
  onClick,
}) => {
  const [imageError, setImageError] = useState(false);
  const { settings } = useStore();

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  };

  const textSizes = {
    sm: 'text-xs sm:text-sm md:text-base',
    md: 'text-base sm:text-xl',
    lg: 'text-lg sm:text-2xl',
    xl: 'text-2xl sm:text-3xl',
  };

  // Direct logo image URL from store settings, prop, or fallback
  const LOGO_SRC = (customLogoUrl !== undefined ? customLogoUrl : settings?.logoUrl)?.trim() || '';
  const displayTitle = settings?.siteName || 'Rongdhonu Trade';

  // Automatically reset image error state whenever logo source updates
  useEffect(() => {
    setImageError(false);
  }, [LOGO_SRC]);

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`flex items-center gap-2.5 ${onClick ? 'cursor-pointer select-none group' : ''} ${className}`}
    >
      <div
        className={`${sizeClasses[size]} relative flex items-center justify-center rounded-2xl p-0.5 shadow-sm transition-transform duration-300 hover:scale-105 overflow-hidden bg-white border border-slate-200/80`}
      >
        <div className="w-full h-full rounded-xl bg-white flex items-center justify-center overflow-hidden">
          {LOGO_SRC && !imageError ? (
            <img
              key={LOGO_SRC}
              src={getResponsiveImageUrl(LOGO_SRC, 240)}
              alt={`${displayTitle} Logo`}
              width={48}
              height={48}
              loading={priority ? 'eager' : 'lazy'}
              decoding={priority ? 'sync' : 'async'}
              fetchPriority={priority ? 'high' : 'auto'}
              className="w-full h-full object-contain rounded-lg"
              style={{ aspectRatio: '1 / 1' }}
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
            />
          ) : (
            <svg
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full"
            >
              <defs>
                <linearGradient id="rainbow1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="25%" stopColor="#f59e0b" />
                  <stop offset="50%" stopColor="#10b981" />
                  <stop offset="75%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
                <linearGradient id="glowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
              </defs>
              {/* Rainbow Arcs */}
              <path
                d="M 6 38 A 18 18 0 0 1 42 38"
                stroke="url(#rainbow1)"
                strokeWidth="4.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 12 38 A 12 12 0 0 1 36 38"
                stroke="#0ea5e9"
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 18 38 A 6 6 0 0 1 30 38"
                stroke="#10b981"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
              {/* Star sparkle on top */}
              <circle cx="24" cy="18" r="3.5" fill="#f59e0b" />
              <polygon
                points="24,11 26,16 31,16 27,19 28.5,24 24,21 19.5,24 21,19 17,16 22,16"
                fill="#f59e0b"
              />
            </svg>
          )}
        </div>
      </div>

      {showText && (
        <div className="flex items-center whitespace-nowrap">
          <span
            className={`font-display font-extrabold tracking-tight leading-none whitespace-nowrap ${
              textClassName || textSizes[size]
            } text-slate-900`}
          >
            {displayTitle}
          </span>
        </div>
      )}
    </div>
  );
};
