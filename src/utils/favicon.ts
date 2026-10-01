/**
 * Dynamic Browser Favicon & Head Metadata Synchronizer
 * Dynamically replaces favicon links in the DOM with cache-busting to ensure immediate updates.
 */

export function updateDynamicFavicon(url?: string): void {
  if (typeof document === 'undefined' || !url) return;

  try {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;

    // Cache-buster query param so browsers don't hold onto stale icons
    const cacheBustedUrl = cleanUrl.startsWith('data:')
      ? cleanUrl
      : `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;

    // Remove any existing favicon and touch icon links
    const existingLinks = document.querySelectorAll(
      "link[rel*='icon'], link[rel*='apple-touch-icon'], link[rel*='shortcut']"
    );
    existingLinks.forEach((el) => el.remove());

    const head = document.getElementsByTagName('head')[0] || document.head;

    // Determine appropriate MIME type
    const mimeType = cleanUrl.endsWith('.svg')
      ? 'image/svg+xml'
      : cleanUrl.endsWith('.ico')
      ? 'image/x-icon'
      : cleanUrl.endsWith('.png')
      ? 'image/png'
      : 'image/jpeg';

    // 1. Standard icon
    const linkIcon = document.createElement('link');
    linkIcon.rel = 'icon';
    linkIcon.type = mimeType;
    linkIcon.href = cacheBustedUrl;
    head.appendChild(linkIcon);

    // 2. Shortcut icon
    const linkShortcut = document.createElement('link');
    linkShortcut.rel = 'shortcut icon';
    linkShortcut.type = mimeType;
    linkShortcut.href = cacheBustedUrl;
    head.appendChild(linkShortcut);

    // 3. Apple Touch icon
    const linkApple = document.createElement('link');
    linkApple.rel = 'apple-touch-icon';
    linkApple.href = cacheBustedUrl;
    head.appendChild(linkApple);
  } catch (err) {
    console.error('Failed to update dynamic favicon:', err);
  }
}
