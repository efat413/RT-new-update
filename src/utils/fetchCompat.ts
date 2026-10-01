/**
 * Browser fetch property descriptor compatibility helper.
 * Ensures window.fetch descriptor is configurable and writable so third-party
 * extensions or testing tools can safely wrap fetch without throwing TypeErrors.
 */
(function initFetchCompatibility() {
  if (typeof window === 'undefined') return;
  try {
    const win = window;
    let nativeFetch: any = typeof win.fetch === 'function' ? win.fetch.bind(win) : null;

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
            enumerable: true,
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
