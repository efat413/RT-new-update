# Rongdhonu Trade — Code-Based Performance Audit

Date: 2026-10-13
Scope: Source archive supplied in this conversation. This is not a live Lighthouse/PageSpeed run and does not represent measurements from real visitors.

## Existing optimizations confirmed in source

- The storefront uses a consolidated `/api/store/homepage` request for initial public store data, with a parallel-request fallback if that endpoint fails.
- Admin pages, product/category pages, and several drawers/modals are already split with `React.lazy`.
- Product/banner image helpers generate responsive `srcSet`/`sizes` variants and set intrinsic dimensions/aspect ratios.
- Product cards generally use lazy loading; the first banner and priority images are eager/high-priority.
- `public/_headers` gives hashed `/assets/*` files a one-year immutable cache and makes HTML revalidate. API responses are intentionally no-store.
- Vite already defines separate chunks for React, icons, tracking, seed data, and service modules.

## Changes made in this update

- Changed priority image decoding from synchronous to asynchronous in the responsive-image helper, hero banner, product cards, and brand logo. The images remain eager/high-priority where appropriate; this avoids explicitly requesting synchronous decode during initial rendering.
- No API contracts, database schema, checkout, courier, auth, or deployment configuration was changed.

## Remaining opportunities (need live measurements before code changes)

1. Run PageSpeed Insights or Lighthouse on the deployed homepage and a product page (mobile and desktop). Record LCP, INP, CLS, TTFB, transfer sizes, and the specific LCP element.
2. If LCP is the hero image, check its actual URL, byte size, response headers, and whether the media endpoint really returns resized/modern formats. Do not preload a URL until the dynamic banner URL and request behavior are confirmed.
3. Inspect `/api/store/homepage` response size and server timing. The response may include product data and images; if image bytes/base64 are embedded in D1-backed API responses, migrate media to a proper image/object service when budget allows. Avoid putting large binary payloads in D1 rows.
4. Inspect production JS chunk sizes from a clean build. Do not change manual chunking until measured; manual chunk changes can create circular chunk dependencies or increase requests.
5. The Google Fonts stylesheet is external and can contribute to render blocking. Consider self-hosting only the exact font subsets/weights in use, or test a non-blocking font strategy, after verifying visual and Bengali glyph coverage.

## Verification limits

The supplied project archive does not include `node_modules` or a lockfile, and dependencies were not installed in this environment. Therefore this update has not been build-, typecheck-, or browser-tested here. Review the diff and run `npm install`, `npm run lint`, `npm test`, and `npm run build` in your normal environment before deploying. If any regression appears, revert the image-decoding changes first.
