/**
 * Browser fetch property descriptor compatibility helper.
 * Ensures window.fetch descriptor is configurable and writable so third-party
 * extensions or testing tools can safely wrap fetch without throwing TypeErrors.
 */
(function initFetchCompatibility() {
  if (typeof window === 'undefined') return;
  try {
    const win = window;

    // Suppress external browser extension unhandled exceptions
    try {
      win.addEventListener(
        'error',
        (event) => {
          const src = (event && (event.filename || (event.error && event.error.stack))) || '';
          if (
            typeof src === 'string' &&
            (src.includes('chrome-extension://') ||
              src.includes('moz-extension://') ||
              src.includes('safari-extension://'))
          ) {
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
            return true;
          }
        },
        true
      );
    } catch {}

    const rawFetch = win.fetch;
    let nativeFetch: any = typeof rawFetch === 'function' ? rawFetch.bind(win) : rawFetch;

    if (typeof Window !== 'undefined' && Window.prototype) {
      try {
        const protoDesc = Object.getOwnPropertyDescriptor(Window.prototype, 'fetch');
        if (protoDesc && !protoDesc.set && protoDesc.configurable) {
          Object.defineProperty(Window.prototype, 'fetch', {
            get: function () {
              return nativeFetch;
            },
            set: function (fn) {
              nativeFetch = fn;
            },
            configurable: true,
            enumerable: protoDesc.enumerable !== false,
          });
        }
      } catch {}
    }

    try {
      const winDesc = Object.getOwnPropertyDescriptor(win, 'fetch');
      if (!winDesc || (!winDesc.set && winDesc.configurable !== false)) {
        Object.defineProperty(win, 'fetch', {
          get: function () {
            return nativeFetch;
          },
          set: function (fn) {
            nativeFetch = fn;
          },
          configurable: true,
          enumerable: true,
        });
      }
    } catch {}
  } catch {}
})();

