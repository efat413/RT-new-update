/**
 * YouTube URL Parsing & Embed Generator Utility
 * Supports all standard, shortened, shorts, live, and embed YouTube URL formats,
 * as well as direct HTML5 video file URLs.
 */

export function extractYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // If already a clean 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    // 1. Check for standard watch param: ?v=VIDEO_ID or &v=VIDEO_ID
    const vParamMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (vParamMatch && vParamMatch[1]) {
      return vParamMatch[1];
    }

    // 2. Check for youtu.be/VIDEO_ID or youtube.com/(embed|shorts|live|v)/VIDEO_ID or youtube-nocookie.com/embed/VIDEO_ID
    const youtuBeMatch = trimmed.match(
      /(?:youtu\.be\/|(?:youtube\.com|youtube-nocookie\.com)\/(?:embed|shorts|live|v)\/)([a-zA-Z0-9_-]{11})/
    );
    if (youtuBeMatch && youtuBeMatch[1]) {
      return youtuBeMatch[1];
    }

    // 3. Fallback regex for any youtube domain followed by an 11-char id
    const genericMatch = trimmed.match(
      /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/)?([a-zA-Z0-9_-]{11})/
    );
    if (genericMatch && genericMatch[1]) {
      return genericMatch[1];
    }
  } catch {
    // fallback safe return
  }

  return null;
}

export function isDirectVideoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:video/') || trimmed.startsWith('blob:')) return true;
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(trimmed);
}

export function isValidYouTubeUrl(url: string | null | undefined): boolean {
  return extractYouTubeVideoId(url) !== null;
}

export function getYouTubeEmbedUrl(
  urlOrId: string | null | undefined,
  options: { autoplay?: boolean; rel?: number; mute?: boolean } = { autoplay: true, rel: 0 }
): string | null {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) return null;

  const params = new URLSearchParams({
    autoplay: options.autoplay ? '1' : '0',
    rel: String(options.rel ?? 0),
    modestbranding: '1',
    playsinline: '1',
  });

  if (options.mute) {
    params.set('mute', '1');
  }

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function getYouTubeThumbnailUrl(
  urlOrId: string | null | undefined,
  quality: 'default' | 'mq' | 'hq' | 'maxres' = 'hq'
): string | null {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) return null;

  const qualityMap = {
    default: 'default.jpg',
    mq: 'mqdefault.jpg',
    hq: 'hqdefault.jpg',
    maxres: 'maxresdefault.jpg',
  };

  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality] || 'hqdefault.jpg'}`;
}
