/**
 * Responsive Image Delivery Utilities
 *
 * Provides intelligent, high-performance responsive image URL generation,
 * srcSet creation, and standardized viewport dimension presets.
 *
 * Supports:
 * 1. Cloudflare / internal media assets (/api/media/:key) via query params (?w=...&q=...)
 * 2. Dynamic CDN providers (Unsplash, Cloudinary, etc.) with automatic format and dimension negotiation
 * 3. Fallback for raw data URLs and static links
 * 4. Zero Cumulative Layout Shift (CLS) through explicit width, height, and aspect-ratio
 */

import type React from 'react';

export interface ResponsiveImagePreset {
  widths: number[];
  sizes: string;
  defaultWidth: number;
  width: number;
  height: number;
  aspectRatio: string;
}

export const STANDARD_AVAILABLE_IMAGE_WIDTHS = [240, 360, 480, 720, 1080] as const;
export type StandardAvailableImageWidth = typeof STANDARD_AVAILABLE_IMAGE_WIDTHS[number];

/**
 * Maps any requested target pixel width for internal media to the nearest supported available width.
 * Prevents requests for arbitrary or missing variants from downloading the full original image.
 */
export function getBestAvailableInternalWidth(targetWidth: number): StandardAvailableImageWidth {
  if (targetWidth <= 240) return 240;
  if (targetWidth <= 360) return 360;
  if (targetWidth <= 480) return 480;
  if (targetWidth <= 720) return 720;
  return 1080;
}

export const RESPONSIVE_IMAGE_PRESETS: Record<
  'card' | 'thumbnail' | 'detail' | 'banner' | 'logo',
  ResponsiveImagePreset
> = {
  // Product cards in 2-col (mobile) to 4-col (desktop) grids
  card: {
    widths: [240, 360, 480, 720],
    sizes: '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px',
    defaultWidth: 360,
    width: 360,
    height: 360,
    aspectRatio: '1 / 1',
  },
  // Small cart/wishlist/checkout thumbnails (48px - 88px rendered)
  thumbnail: {
    widths: [240, 360],
    sizes: '80px',
    defaultWidth: 240,
    width: 80,
    height: 80,
    aspectRatio: '1 / 1',
  },
  // Main product detail view in modal / page with high-res zoom
  detail: {
    widths: [480, 720, 1080],
    sizes: '(max-width: 768px) 100vw, 50vw',
    defaultWidth: 720,
    width: 800,
    height: 800,
    aspectRatio: '1 / 1',
  },
  // Master hero carousel banner (5:2 desktop aspect ratio)
  banner: {
    widths: [480, 720, 1080],
    sizes: '100vw',
    defaultWidth: 1080,
    width: 1200,
    height: 480,
    aspectRatio: '1200 / 480',
  },
  // Brand logo
  logo: {
    widths: [240],
    sizes: '48px',
    defaultWidth: 240,
    width: 48,
    height: 48,
    aspectRatio: '1 / 1',
  },
};

/**
 * Checks if the given URL is an internal media endpoint (/api/media/:key)
 */
export function isInternalMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('/api/media/') || url.includes('/api/media/');
}

/**
 * Checks if the given URL is an Unsplash image CDN URL
 */
export function isUnsplashUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.includes('images.unsplash.com');
}

/**
 * Checks if the given URL is a Cloudinary CDN URL
 */
export function isCloudinaryUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.includes('res.cloudinary.com');
}

/**
 * Checks if the given URL is a base64 Data URL or SVG (which scale losslessly or cannot be resized by URL)
 */
export function isFixedFormatUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return true;
  return (
    url.startsWith('data:image/') ||
    url.endsWith('.svg') ||
    url.endsWith('.ico') ||
    url.includes('api.qrserver.com')
  );
}

/**
 * Generates an optimized image URL for a specific target pixel width and quality.
 * Preserves existing URL parameters while safely updating width and quality directives.
 */
export function getResponsiveImageUrl(url: string, width: number, quality: number = 82): string {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();

  // 1. Data URLs and vector assets cannot / should not be transformed via query parameters
  if (isFixedFormatUrl(cleanUrl)) {
    return cleanUrl;
  }

  // 2. Internal Cloudflare / D1 / R2 media endpoints (/api/media/:key)
  // Maps to genuine available pregenerated/transformed variant widths (240, 360, 480, 720, 1080)
  if (isInternalMediaUrl(cleanUrl)) {
    const availableWidth = getBestAvailableInternalWidth(width);
    try {
      const isAbsolute = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://');
      const dummyBase = 'https://rongdhonutrade.com';
      const parsed = new URL(cleanUrl, dummyBase);

      parsed.searchParams.set('w', availableWidth.toString());
      if (quality && quality !== 82) {
        parsed.searchParams.set('q', quality.toString());
      }
      return isAbsolute ? parsed.toString() : `${parsed.pathname}?${parsed.searchParams.toString()}`;
    } catch {
      const separator = cleanUrl.includes('?') ? '&' : '?';
      return `${cleanUrl}${separator}w=${availableWidth}`;
    }
  }

  // 3. Unsplash CDN URLs: dynamically resize with auto=format for modern WebP/AVIF delivery
  if (isUnsplashUrl(cleanUrl)) {
    try {
      const parsed = new URL(cleanUrl);
      parsed.searchParams.set('w', width.toString());
      parsed.searchParams.set('q', quality.toString());
      parsed.searchParams.set('auto', 'format');
      if (!parsed.searchParams.has('fit')) {
        parsed.searchParams.set('fit', 'crop');
      }
      return parsed.toString();
    } catch {
      return cleanUrl;
    }
  }

  // 4. Cloudinary CDN URLs: insert width and quality transformation flags
  if (isCloudinaryUrl(cleanUrl)) {
    try {
      const uploadIdx = cleanUrl.indexOf('/upload/');
      if (uploadIdx !== -1) {
        const prefix = cleanUrl.substring(0, uploadIdx + 8);
        const suffix = cleanUrl.substring(uploadIdx + 8);
        // If transformations already present, replace or append
        return `${prefix}w_${width},q_${quality},f_auto/${suffix}`;
      }
    } catch {
      return cleanUrl;
    }
  }

  // 5. Unknown external images (e.g. Pinterest, Imgur direct, personal blogs)
  // Safely return original URL to guarantee 100% backward compatibility
  return cleanUrl;
}

/**
 * Builds a standardized HTML srcset string for the provided image URL across target widths.
 * Returns undefined for URLs that cannot be resized (e.g. Data URLs, SVGs), allowing the browser
 * to gracefully fall back to the standard src attribute.
 */
export function getResponsiveSrcSet(
  url: string,
  widths: number[],
  quality: number = 82
): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  if (isFixedFormatUrl(url)) return undefined;

  // Real Image Transformation Check:
  // Supports CDNs (Unsplash, Cloudinary) and internal media endpoints (/api/media/:key)
  const isInternal = isInternalMediaUrl(url);
  const hasGenuineResizing = isInternal || isUnsplashUrl(url) || isCloudinaryUrl(url);
  if (!hasGenuineResizing) {
    return undefined;
  }

  // Filter out duplicates and sort ascending.
  // For internal media, candidate widths must strictly map to available standard widths.
  const targetWidths = isInternal
    ? widths.map(getBestAvailableInternalWidth)
    : widths;
  const uniqueWidths = Array.from(new Set(targetWidths)).sort((a, b) => a - b);
  if (uniqueWidths.length === 0) return undefined;

  const entries = uniqueWidths.map((w) => `${getResponsiveImageUrl(url, w, quality)} ${w}w`);
  return entries.join(', ');
}

/**
 * Complete set of props ready to spread directly onto an <img> element for optimal responsive delivery.
 */
export interface ResponsiveImagePropsOptions {
  priority?: boolean;
  quality?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function getResponsiveImageProps(
  url: string,
  presetKey: keyof typeof RESPONSIVE_IMAGE_PRESETS,
  options?: ResponsiveImagePropsOptions
) {
  const preset = RESPONSIVE_IMAGE_PRESETS[presetKey];
  const isPriority = Boolean(options?.priority);
  const q = options?.quality || (presetKey === 'detail' || presetKey === 'banner' ? 85 : 80);

  const src = getResponsiveImageUrl(url, preset.defaultWidth, q);
  const srcSet = getResponsiveSrcSet(url, preset.widths, q);

  return {
    src,
    srcSet,
    sizes: preset.sizes,
    width: preset.width,
    height: preset.height,
    loading: isPriority ? ('eager' as const) : ('lazy' as const),
    decoding: isPriority ? ('sync' as const) : ('async' as const),
    fetchPriority: isPriority ? ('high' as const) : ('auto' as const),
    style: {
      aspectRatio: preset.aspectRatio,
      ...options?.style,
    },
  };
}
