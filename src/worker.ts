import { handleApiRequest } from './server/router';
import { Env } from './server/types';
import {
  ROBOTS_TXT_CONTENT,
  generateSitemapXml,
  generate404Html,
  injectProductSEOIntoHtml,
  injectCategorySEOIntoHtml,
  DEFAULT_SITE_NAME,
} from './utils/seo';
import { getAllCategories, getAllProducts, getStoreSettings, getProductById, getCategoryById } from './server/db';
import { INITIAL_CATEGORIES, INITIAL_PRODUCTS } from './data/seedData';
import { syncAllActiveCourierOrders } from './server/courier';
import { getSecurityHeaders } from './server/securityHeaders';

function getFallbackHtmlTemplate(siteName: string = DEFAULT_SITE_NAME): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${siteName} | রঙধনু ট্রেড - Online Shopping in Bangladesh</title>
    <meta name="description" content="${siteName} (রঙধনু ট্রেড / Rongdhonu) - বাংলাদেশের বিশ্বস্ত অনলাইন শপ।" />
    <link rel="canonical" href="https://rongdhonutrade.com/" />
    <meta name="robots" content="index, follow" />
    <meta property="og:site_name" content="${siteName}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://rongdhonutrade.com/" />
    <meta property="og:title" content="${siteName} | রঙধনু ট্রেড" />
    <meta property="og:description" content="${siteName} (রঙধনু ট্রেড / Rongdhonu) - Online Shopping in Bangladesh" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${siteName} | রঙধনু ট্রেড" />
    <meta name="twitter:description" content="${siteName} (রঙধনু ট্রেড / Rongdhonu) - Online Shopping in Bangladesh" />
  </head>
  <body class="bg-slate-50 text-slate-900 antialiased selection:bg-rose-500 selection:text-white">
    <div id="root"></div>
  </body>
</html>`;
}

// Known valid React client-side SPA routes that serve index.html with HTTP 200
const VALID_SPA_ROUTES = new Set([
  '/',
  '/admin',
  '/reset-password',
  '/tracking',
  '/account',
  '/checkout',
  '/cart',
]);

function isValidSpaRoute(pathname: string): boolean {
  if (VALID_SPA_ROUTES.has(pathname)) return true;
  if (pathname.startsWith('/admin/')) return true;
  return false;
}

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const url = new URL(request.url);
    const secHeaders = getSecurityHeaders();

    // 1. API router
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApiRequest(request, env, ctx);
      } catch (err: any) {
        console.error('[Worker API Unhandled Error]:', err);
        return new Response(JSON.stringify({ success: false, error: 'Internal server error.' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        });
      }
    }

    // 2. Technical SEO: robots.txt
    if (url.pathname === '/robots.txt') {
      return new Response(ROBOTS_TXT_CONTENT, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=UTF-8',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    }

    // 3. Technical SEO: Dynamic XML Sitemap generated from authoritative D1 database
    if (url.pathname === '/sitemap.xml') {
      let categories: any[] = [];
      let products: any[] = [];

      if (env.DB) {
        try {
          const [dbCats, dbProds] = await Promise.all([
            getAllCategories(env.DB),
            getAllProducts(env.DB),
          ]);
          if (Array.isArray(dbCats)) {
            categories = dbCats;
          }
          if (Array.isArray(dbProds)) {
            products = dbProds;
          }
        } catch (err) {
          console.warn('Worker could not query D1 for sitemap:', err);
        }
      } else {
        categories = INITIAL_CATEGORIES;
        products = INITIAL_PRODUCTS;
      }

      const xml = generateSitemapXml(categories, products);
      return new Response(xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=UTF-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      });
    }

    // 4. Static assets (/assets/* or files with standard file extensions like .js, .css, .png, .ico, etc.)
    const isStaticAsset = url.pathname.startsWith('/assets/') || /\.[a-zA-Z0-9]{2,5}$/.test(url.pathname);
    if (isStaticAsset && env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status === 404) {
        return new Response(
          generate404Html('Resource Not Found', `The requested asset "${url.pathname}" could not be found.`),
          {
            status: 404,
            statusText: 'Not Found',
            headers: {
              'Content-Type': 'text/html; charset=UTF-8',
              'X-Robots-Tag': 'noindex, follow',
              ...secHeaders,
            },
          }
        );
      }
      return assetRes;
    }

    // 5. Technical SEO & SSR: Check for Product URL (query param or pathname)
    if (url.searchParams.has('product') || url.searchParams.has('p') || url.pathname.startsWith('/product/')) {
      const prodParam = (
        url.searchParams.get('product') ||
        url.searchParams.get('p') ||
        url.pathname.replace(/^\/product\//, '').replace(/\/$/, '')
      ).trim();

      if (prodParam) {
        let product = null;
        if (env.DB) {
          try {
            product = await getProductById(env.DB, prodParam);
          } catch {}
        } else {
          product = INITIAL_PRODUCTS.find(
            (p) => p.id === prodParam || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === prodParam
          ) || null;
        }

        // Return genuine 404 for missing or inactive/deleted products
        if (!product || (product as any).status === 'inactive' || (product as any).isDeleted) {
          return new Response(
            generate404Html('Product Not Found', `The product "${prodParam}" was not found or has been removed.`),
            {
              status: 404,
              statusText: 'Not Found',
              headers: {
                'Content-Type': 'text/html; charset=UTF-8',
                'X-Robots-Tag': 'noindex, follow',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                ...secHeaders,
              },
            }
          );
        }

        // Graceful migration from old ?product= query URLs to canonical /product/:id route (301 Permanent Redirect)
        if (url.searchParams.has('product') || url.searchParams.has('p')) {
          const canonicalUrl = new URL(`/product/${encodeURIComponent(product.id)}`, request.url);
          return Response.redirect(canonicalUrl.toString(), 301);
        }

        // Product is valid: Generate Server-Side Rendered SEO HTML response with HTTP 200
        let categoryName: string | undefined = undefined;
        if (product.categoryId) {
          let cat = null;
          if (env.DB) {
            try {
              cat = await getCategoryById(env.DB, product.categoryId);
            } catch {}
          } else {
            cat = INITIAL_CATEGORIES.find((c) => c.id === product.categoryId) || null;
          }
          if (cat) categoryName = cat.name;
        }

        let siteName = DEFAULT_SITE_NAME;
        if (env.DB) {
          try {
            const settings = await getStoreSettings(env.DB);
            if (settings?.siteName) siteName = settings.siteName;
          } catch {}
        }

        let html = '';
        if (env.ASSETS) {
          try {
            const assetRes = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString(), {
              headers: request.headers,
            }));
            if (assetRes.ok) {
              html = await assetRes.text();
            }
          } catch {}
        }
        if (!html) {
          html = getFallbackHtmlTemplate(siteName);
        }

        const injectedHtml = injectProductSEOIntoHtml(html, product, categoryName, siteName);
        return new Response(injectedHtml, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=UTF-8',
            'Cache-Control': 'public, max-age=120, s-maxage=600',
            ...secHeaders,
          },
        });
      }
    }

    // 6. Technical SEO & SSR: Check for Category URL (query param or pathname)
    if (url.searchParams.has('category') || url.searchParams.has('cat') || url.pathname.startsWith('/category/')) {
      const catParam = (
        url.searchParams.get('category') ||
        url.searchParams.get('cat') ||
        url.pathname.replace(/^\/category\//, '').replace(/\/$/, '')
      ).trim();

      if (catParam) {
        let category = null;
        if (env.DB) {
          try {
            category = await getCategoryById(env.DB, catParam);
            if (!category) {
              const allCats = await getAllCategories(env.DB);
              category = allCats.find((c) => c.slug.toLowerCase() === catParam.toLowerCase() || c.id === catParam) || null;
            }
          } catch {}
        } else {
          category = INITIAL_CATEGORIES.find(
            (c) => c.slug.toLowerCase() === catParam.toLowerCase() || c.id === catParam
          ) || null;
        }

        // Return genuine 404 for invalid category
        if (!category) {
          return new Response(
            generate404Html('Category Not Found', `The category "${catParam}" was not found.`),
            {
              status: 404,
              statusText: 'Not Found',
              headers: {
                'Content-Type': 'text/html; charset=UTF-8',
                'X-Robots-Tag': 'noindex, follow',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                ...secHeaders,
              },
            }
          );
        }

        // Graceful migration from old ?category= query URLs to canonical /category/:slug route (301 Permanent Redirect)
        if (url.searchParams.has('category') || url.searchParams.has('cat')) {
          const canonicalUrl = new URL(`/category/${encodeURIComponent(category.slug || category.id)}`, url.origin);
          return Response.redirect(canonicalUrl.toString(), 301);
        }

        // Category is valid: Generate Server-Side Rendered SEO HTML response with HTTP 200
        let siteName = DEFAULT_SITE_NAME;
        if (env.DB) {
          try {
            const settings = await getStoreSettings(env.DB);
            if (settings?.siteName) siteName = settings.siteName;
          } catch {}
        }

        let html = '';
        if (env.ASSETS) {
          try {
            const assetRes = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString(), {
              headers: request.headers,
            }));
            if (assetRes.ok) {
              html = await assetRes.text();
            }
          } catch {}
        }
        if (!html) {
          html = getFallbackHtmlTemplate(siteName);
        }

        const injectedHtml = injectCategorySEOIntoHtml(html, category, siteName);
        return new Response(injectedHtml, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=UTF-8',
            'Cache-Control': 'public, max-age=120, s-maxage=600',
            ...secHeaders,
          },
        });
      }
    }

    // 7. Valid React SPA client-side routes: return index.html with HTTP 200 and security headers
    if (isValidSpaRoute(url.pathname)) {
      const isPrivateSpaRoute = url.pathname.startsWith('/admin') || url.pathname === '/account' || url.pathname === '/checkout';
      const shellCacheControl = isPrivateSpaRoute
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=0, must-revalidate';

      if (env.ASSETS) {
        const indexRes = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString(), {
          headers: request.headers,
        }));
        if (indexRes.ok) {
          const html = await indexRes.text();
          return new Response(html, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=UTF-8',
              'Cache-Control': shellCacheControl,
              ...secHeaders,
            },
          });
        }
      }
      return new Response(getFallbackHtmlTemplate(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': shellCacheControl,
          ...secHeaders,
        },
      });
    }

    // 8. Arbitrary non-existing route: return a genuine HTTP 404 with HTML and security headers
    return new Response(
      generate404Html('Page Not Found', `The page "${url.pathname}" could not be found on Rongdhonu Trade.`),
      {
        status: 404,
        statusText: 'Not Found',
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'X-Robots-Tag': 'noindex, follow',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...secHeaders,
        },
      }
    );
  },

  /**
   * Cloudflare Cron Trigger (Runs every 15 minutes)
   * Automatically synchronizes active Steadfast courier parcel statuses
   */
  async scheduled(event: any, env: Env, ctx?: any): Promise<void> {
    if (!env.DB) return;
    try {
      const apiKey = (env.STEADFAST_API_KEY || '').trim();
      const secretKey = (env.STEADFAST_SECRET_KEY || '').trim();
      if (apiKey && secretKey) {
        const result = await syncAllActiveCourierOrders(env.DB, { apiKey, secretKey });
        console.log(`[Courier Cron Sync] Checked ${result.totalChecked} orders, updated ${result.updatedCount}.`);
      }
    } catch (err) {
      console.error('[Courier Cron Sync Error]:', err);
    }
  },
};
