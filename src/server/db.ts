import {
  Order,
  CartItem,
  Product,
  Category,
  CarouselSlide,
  StoreSettings,
  Coupon,
  ProductReview,
  ReviewStatus,
  ReviewSource,
  UserAccount,
  Expense,
  ExpenseType,
  ProfitAnalyticsSummary,
} from '../types';
import {
  D1Database,
  D1PreparedStatement,
  OrderRow,
  ProductRow,
  CategoryRow,
  SliderRow,
  StoreSettingsRow,
  CouponRow,
  ReviewRow,
  UserRow,
  ExpenseRow,
  PasswordResetTokenRow,
} from './types';
import {
  INITIAL_SETTINGS,
} from '../data/seedData';
import { generateProductSlug } from '../utils/seo';
import { hashPassword } from './auth';
import {
  resolveUserPermissions,
  generateLegacyPermissionFlags,
} from './permissions';
import { sanitizeReviewImageReference } from './imageSecurity';

export const REQUIRED_TABLES = [
  'products',
  'categories',
  'sliders',
  'store_settings',
  'coupons',
  'reviews',
  'users',
  'orders',
  'expenses',
] as const;

/**
 * Diagnostic helper for read-only /api/health check.
 * Strictly verifies whether migration tables exist without modifying or creating anything.
 */
export async function checkTablesExist(db: D1Database): Promise<{ existing: string[]; missing: string[] }> {
  const res = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
  const existing = (res.results || []).map((r) => r.name);
  const missing = REQUIRED_TABLES.filter((t) => !existing.includes(t));
  return { existing, missing };
}

let cachedProductTableColumns: Set<string> | null = null;
let schemaHealingAttempted = false;

export async function getProductTableColumns(db: D1Database): Promise<Set<string>> {
  if (cachedProductTableColumns && cachedProductTableColumns.size > 0) {
    return cachedProductTableColumns;
  }
  try {
    const res = await db.prepare("SELECT name FROM pragma_table_info('products')").all<{ name: string }>();
    if (res.results && res.results.length > 0) {
      cachedProductTableColumns = new Set(res.results.map((r) => r.name.toLowerCase()));
      return cachedProductTableColumns;
    }
  } catch (err) {
    console.warn('[D1] Could not query pragma_table_info for products:', err);
  }
  return new Set([
    'id', 'slug', 'title', 'price', 'original_price', 'buying_price', 'featured_sort_order', 'video_url', 'category_id', 'description',
    'image_url', 'images_json', 'stock', 'featured', 'rating', 'reviews_count',
    'specs_json', 'sizes_json', 'colors_json', 'sku', 'status', 'created_at', 'updated_at'
  ]);
}

/**
 * Migration verification & self-healing helper.
 * Ensures the products table contains all required columns (e.g. video_url, buying_price, featured_sort_order)
 * without data loss, table drops, or resets.
 */
export async function ensureProductTableSchema(db: D1Database): Promise<Set<string>> {
  let columns = await getProductTableColumns(db);

  if (!schemaHealingAttempted) {
    schemaHealingAttempted = true;

    // Self-heal: video_url column (missing in initial schema.sql)
    if (!columns.has('video_url')) {
      try {
        await db.prepare('ALTER TABLE products ADD COLUMN video_url TEXT').run();
        cachedProductTableColumns = null;
        columns = await getProductTableColumns(db);
        console.log('[D1] Self-healed: added missing video_url column to products table.');
      } catch (err: any) {
        console.warn('[D1] video_url column addition notice:', err?.message || err);
      }
    }

    // Self-heal: buying_price column
    if (!columns.has('buying_price')) {
      try {
        await db.prepare('ALTER TABLE products ADD COLUMN buying_price REAL DEFAULT 0').run();
        cachedProductTableColumns = null;
        columns = await getProductTableColumns(db);
        console.log('[D1] Self-healed: added missing buying_price column to products table.');
      } catch (err: any) {
        console.warn('[D1] buying_price column addition notice:', err?.message || err);
      }
    }

    // Self-heal: featured_sort_order column
    if (!columns.has('featured_sort_order')) {
      try {
        await db.prepare('ALTER TABLE products ADD COLUMN featured_sort_order INTEGER DEFAULT 0').run();
        cachedProductTableColumns = null;
        columns = await getProductTableColumns(db);
        console.log('[D1] Self-healed: added missing featured_sort_order column to products table.');
      } catch (err: any) {
        console.warn('[D1] featured_sort_order column addition notice:', err?.message || err);
      }
    }

    // Self-heal: slug column and unique index
    if (!columns.has('slug')) {
      try {
        await db.prepare('ALTER TABLE products ADD COLUMN slug TEXT').run();
        await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug)').run();
        cachedProductTableColumns = null;
        columns = await getProductTableColumns(db);
        console.log('[D1] Self-healed: added missing slug column to products table.');
      } catch (err: any) {
        console.warn('[D1] slug column addition notice:', err?.message || err);
      }
    }

    // Self-heal: product_slug_history table and indexes for SEO 301 redirects
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS product_slug_history (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          slug TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
      `).run();
      await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_product_slug_history_slug ON product_slug_history(slug)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_product_slug_history_product_id ON product_slug_history(product_id)').run();
    } catch (err: any) {
      console.warn('[D1] product_slug_history table self-heal notice:', err?.message || err);
    }
  }

  return columns;
}

let cachedOrderTableColumns: Set<string> | null = null;
let orderSchemaHealingAttempted = false;

export async function getOrderTableColumns(db: D1Database): Promise<Set<string>> {
  if (cachedOrderTableColumns && cachedOrderTableColumns.size > 0) {
    return cachedOrderTableColumns;
  }
  try {
    const res = await db.prepare("SELECT name FROM pragma_table_info('orders')").all<{ name: string }>();
    if (res.results && res.results.length > 0) {
      cachedOrderTableColumns = new Set(res.results.map((r) => r.name.toLowerCase()));
      return cachedOrderTableColumns;
    }
  } catch (err) {
    console.warn('[D1] Could not query pragma_table_info for orders:', err);
  }
  return new Set([
    'id', 'order_number', 'user_id', 'user_email', 'customer_name', 'customer_phone',
    'customer_address', 'customer_district', 'customer_zone', 'customer_notes',
    'items_json', 'subtotal', 'delivery_fee', 'total_amount', 'total_cost', 'total_profit',
    'coupon_code', 'discount_amount', 'payment_method', 'payment_status', 'transaction_id',
    'shipping_status', 'courier_name', 'courier_waybill', 'consignment_id', 'courier_status',
    'courier_booking_json', 'dbbl_details_json', 'card_details_json', 'last_courier_sync',
    'advance_payment', 'advance_payment_method', 'advance_payment_note',
    'advance_payment_updated_at', 'advance_payment_updated_by', 'created_at', 'updated_at'
  ]);
}

export async function ensureOrderTableSchema(db: D1Database): Promise<Set<string>> {
  let columns = await getOrderTableColumns(db);

  if (!orderSchemaHealingAttempted) {
    orderSchemaHealingAttempted = true;

    // Self-heal: advance_payment column
    if (!columns.has('advance_payment')) {
      try {
        await db.prepare('ALTER TABLE orders ADD COLUMN advance_payment REAL NOT NULL DEFAULT 0').run();
        cachedOrderTableColumns = null;
        columns = await getOrderTableColumns(db);
        console.log('[D1] Self-healed: added missing advance_payment column to orders table.');
      } catch (err: any) {
        console.warn('[D1] advance_payment column addition notice:', err?.message || err);
      }
    }

    // Self-heal: advance_payment_method column
    if (!columns.has('advance_payment_method')) {
      try {
        await db.prepare('ALTER TABLE orders ADD COLUMN advance_payment_method TEXT').run();
        cachedOrderTableColumns = null;
        columns = await getOrderTableColumns(db);
        console.log('[D1] Self-healed: added missing advance_payment_method column to orders table.');
      } catch (err: any) {
        console.warn('[D1] advance_payment_method column addition notice:', err?.message || err);
      }
    }

    // Self-heal: advance_payment_note column
    if (!columns.has('advance_payment_note')) {
      try {
        await db.prepare('ALTER TABLE orders ADD COLUMN advance_payment_note TEXT').run();
        cachedOrderTableColumns = null;
        columns = await getOrderTableColumns(db);
        console.log('[D1] Self-healed: added missing advance_payment_note column to orders table.');
      } catch (err: any) {
        console.warn('[D1] advance_payment_note column addition notice:', err?.message || err);
      }
    }

    // Self-heal: advance_payment_updated_at column
    if (!columns.has('advance_payment_updated_at')) {
      try {
        await db.prepare('ALTER TABLE orders ADD COLUMN advance_payment_updated_at TEXT').run();
        cachedOrderTableColumns = null;
        columns = await getOrderTableColumns(db);
        console.log('[D1] Self-healed: added missing advance_payment_updated_at column to orders table.');
      } catch (err: any) {
        console.warn('[D1] advance_payment_updated_at column addition notice:', err?.message || err);
      }
    }

    // Self-heal: advance_payment_updated_by column
    if (!columns.has('advance_payment_updated_by')) {
      try {
        await db.prepare('ALTER TABLE orders ADD COLUMN advance_payment_updated_by TEXT').run();
        cachedOrderTableColumns = null;
        columns = await getOrderTableColumns(db);
        console.log('[D1] Self-healed: added missing advance_payment_updated_by column to orders table.');
      } catch (err: any) {
        console.warn('[D1] advance_payment_updated_by column addition notice:', err?.message || err);
      }
    }

    // Self-heal: index on advance_payment
    try {
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_advance_payment ON orders(advance_payment)').run();
    } catch {}
  }

  return columns;
}

export function buildSelectProductColumns(availableColumns: Set<string>, includeBuyingPrice?: boolean): string {
  const desired = [
    'id',
    'slug',
    'title',
    'price',
    'original_price',
    ...(includeBuyingPrice ? ['buying_price'] : []),
    'category_id',
    'description',
    'image_url',
    'images_json',
    'stock',
    'featured',
    'featured_sort_order',
    'rating',
    'reviews_count',
    'specs_json',
    'sizes_json',
    'colors_json',
    'sku',
    'video_url',
    'status',
    'created_at',
    'updated_at',
  ];
  return desired.filter((col) => availableColumns.has(col)).join(', ');
}

export async function ensureSchemaColumns(db: D1Database): Promise<void> {
  await ensureProductTableSchema(db);
  await ensureOrderTableSchema(db);
}

export interface SanitizationOptions {
  isSuperAdmin?: boolean;
  canViewBuyingPrice?: boolean;
  canViewProfit?: boolean;
}

/**
 * Normalizes an object key and checks if it matches any sensitive Buying Price or Cost field/alias.
 * Covers camelCase, snake_case, PascalCase, lowercase, and common procurement aliases.
 */
export function isBuyingPriceOrCostKey(key: string): boolean {
  const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    norm === 'buyingprice' ||
    norm === 'buyingcost' ||
    norm === 'purchaseprice' ||
    norm === 'purchasecost' ||
    norm === 'costprice' ||
    norm === 'productcost' ||
    norm === 'unitcost' ||
    norm === 'totalcost' ||
    norm === 'buyingpricesnapshot' ||
    norm === 'suppliercost' ||
    norm === 'supplierprice' ||
    norm === 'wholesaleprice' ||
    norm === 'wholesalecost' ||
    norm === 'itemcost'
  );
}

/**
 * Normalizes an object key and checks if it matches any sensitive Profit or Margin field/alias.
 * Covers camelCase, snake_case, PascalCase, lowercase, and common analytical aliases.
 */
export function isProfitKey(key: string): boolean {
  const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    norm === 'profit' ||
    norm === 'unitprofit' ||
    norm === 'unitgrossprofit' ||
    norm === 'unitnetprofit' ||
    norm === 'grossprofit' ||
    norm === 'netprofit' ||
    norm === 'profitmargin' ||
    norm === 'grossmargin' ||
    norm === 'netmargin' ||
    norm === 'totalprofit' ||
    norm === 'totalgrossprofit' ||
    norm === 'productgrossprofit' ||
    norm === 'productcost' ||
    norm === 'averageprofitperorder'
  );
}

/**
 * Universal recursive data scrubber that strips all unauthorized Buying Price, Cost, and Profit
 * fields from any nested object or array at arbitrary depth.
 */
export function deepSanitizeCostAndProfit<T>(
  data: T,
  roleOrOptions: boolean | SanitizationOptions
): T {
  const isSuper = typeof roleOrOptions === 'boolean' ? roleOrOptions : Boolean(roleOrOptions?.isSuperAdmin);
  const canViewBuyingPrice = isSuper || (typeof roleOrOptions === 'object' && Boolean(roleOrOptions.canViewBuyingPrice));
  const canViewProfit = isSuper || (typeof roleOrOptions === 'object' && Boolean(roleOrOptions.canViewProfit));

  // If Super Admin or user has both permissions, all fields remain legitimately accessible
  if (isSuper || (canViewBuyingPrice && canViewProfit)) {
    return data;
  }

  function scrub(val: any, seen: WeakSet<object> = new WeakSet()): any {
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') {
      if (typeof val === 'string') {
        if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
          try {
            const parsed = JSON.parse(val);
            if (parsed && typeof parsed === 'object') {
              const sanitized = scrub(parsed, seen);
              return JSON.stringify(sanitized);
            }
          } catch {}
        }
      }
      return val;
    }

    if (val instanceof Date || val instanceof RegExp) return val;
    if (seen.has(val)) return val;
    seen.add(val);

    if (Array.isArray(val)) {
      return val.map((item) => scrub(item, seen));
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(val)) {
      if (!canViewBuyingPrice && isBuyingPriceOrCostKey(key)) {
        continue;
      }
      if (!canViewProfit && isProfitKey(key)) {
        continue;
      }
      result[key] = scrub(value, seen);
    }
    return result;
  }

  return scrub(data);
}

/**
 * Sanitizes product objects so that internal Buying Price & Unit Profit
 * are STRICTLY visible only when authorized.
 */
export function sanitizeProductForRole(
  product: Product,
  roleOrOptions: boolean | SanitizationOptions
): Product {
  const isSuper = typeof roleOrOptions === 'boolean' ? roleOrOptions : Boolean(roleOrOptions?.isSuperAdmin);
  const canViewBuyingPrice = isSuper || (typeof roleOrOptions === 'object' && Boolean(roleOrOptions.canViewBuyingPrice));
  const canViewProfit = isSuper || (typeof roleOrOptions === 'object' && Boolean(roleOrOptions.canViewProfit));

  const price = Number(product.price) || 0;
  const rawBuyingPrice = product.buyingPrice != null
    ? product.buyingPrice
    : ((product as any).buying_price != null ? (product as any).buying_price : undefined);
  const buyingPrice = canViewBuyingPrice && rawBuyingPrice != null ? Number(rawBuyingPrice) : undefined;
  const unitProfit = canViewProfit && rawBuyingPrice != null ? (price - Number(rawBuyingPrice)) : undefined;

  const safeProduct: any = {
    ...product,
  };

  if (canViewBuyingPrice && buyingPrice !== undefined) {
    safeProduct.buyingPrice = buyingPrice;
  } else {
    delete safeProduct.buyingPrice;
    delete safeProduct.buying_price;
  }

  if (canViewProfit && unitProfit !== undefined) {
    safeProduct.unitProfit = unitProfit;
  } else {
    delete safeProduct.unitProfit;
    delete safeProduct.unit_profit;
  }

  return deepSanitizeCostAndProfit(safeProduct, { isSuperAdmin: isSuper, canViewBuyingPrice, canViewProfit }) as Product;
}

/**
 * Sanitizes order objects so that historical cost and gross profit snapshots
 * are STRICTLY visible only when authorized.
 */
export function sanitizeOrderForRole(
  order: Order,
  roleOrOptions: boolean | SanitizationOptions
): Order {
  const isSuper = typeof roleOrOptions === 'boolean' ? roleOrOptions : Boolean(roleOrOptions?.isSuperAdmin);
  const canViewBuyingPrice = isSuper || (typeof roleOrOptions === 'object' && Boolean(roleOrOptions.canViewBuyingPrice));
  const canViewProfit = isSuper || (typeof roleOrOptions === 'object' && Boolean(roleOrOptions.canViewProfit));

  const safeItems = (order.items || []).map((item) => {
    const safeProduct = sanitizeProductForRole(item.product, { isSuperAdmin: isSuper, canViewBuyingPrice, canViewProfit });
    const modifiedItem: any = {
      ...item,
      product: safeProduct,
    };

    if (canViewBuyingPrice && item.buyingPriceSnapshot != null) {
      modifiedItem.buyingPriceSnapshot = Number(item.buyingPriceSnapshot);
    } else {
      delete modifiedItem.buyingPriceSnapshot;
      delete modifiedItem.buying_price_snapshot;
    }

    if (canViewProfit) {
      if (item.productCost != null) modifiedItem.productCost = Number(item.productCost);
      if (item.productGrossProfit != null) modifiedItem.productGrossProfit = Number(item.productGrossProfit);
    } else {
      delete modifiedItem.productCost;
      delete modifiedItem.product_cost;
      delete modifiedItem.productGrossProfit;
      delete modifiedItem.product_gross_profit;
      delete modifiedItem.profit;
    }

    return modifiedItem;
  });

  const safeOrder: any = {
    ...order,
    items: safeItems,
  };

  if (canViewProfit) {
    if (order.totalCost != null) safeOrder.totalCost = Number(order.totalCost);
    if (order.totalGrossProfit != null) safeOrder.totalGrossProfit = Number(order.totalGrossProfit);
  } else {
    delete safeOrder.totalCost;
    delete safeOrder.total_cost;
    delete safeOrder.totalGrossProfit;
    delete safeOrder.total_gross_profit;
    delete safeOrder.netProfit;
    delete safeOrder.net_profit;
    delete safeOrder.totalProfit;
    delete safeOrder.total_profit;
    delete safeOrder.profit;
    delete safeOrder.grossProfit;
    delete safeOrder.gross_profit;
    delete safeOrder.profitMargin;
    delete safeOrder.profit_margin;
  }

  return deepSanitizeCostAndProfit(safeOrder, { isSuperAdmin: isSuper, canViewBuyingPrice, canViewProfit }) as Order;
}

/**
 * Sanitizes an order for public/unauthenticated customer order tracking.
 * Strictly hides:
 * - Full street address (replaces with masked area and district)
 * - Full customer phone (replaces with masked phone e.g. 017****5678)
 * - Full customer name (replaces with masked name e.g. M*** E***)
 * - Customer email (completely removed)
 * - Internal notes / admin notes (completely removed)
 * - Buying price, cost, and profit margins (completely removed)
 * - Internal database UUID (replaced with public orderNumber)
 */
export function sanitizeOrderForPublicTracking(order: Order): any {
  const cleanPhone = (order.customer?.phone || '').replace(/\D/g, '');
  const maskedPhone =
    cleanPhone.length >= 11
      ? `${cleanPhone.slice(0, 3)}****${cleanPhone.slice(-4)}`
      : cleanPhone.length > 4
      ? `${cleanPhone.slice(0, 2)}****${cleanPhone.slice(-2)}`
      : '****';

  const nameParts = (order.customer?.fullName || '').trim().split(/\s+/);
  const maskedName =
    nameParts
      .filter(Boolean)
      .map((part) => (part.length > 1 ? `${part[0]}***` : part))
      .join(' ') || 'Customer';

  const district = order.customer?.district || 'Bangladesh';
  const maskedAddress = `***, ${district}`;

  const safeItems = (order.items || []).map((item) => ({
    product: {
      title: item.product?.title || 'Product',
      imageUrl: item.product?.imageUrl || '',
      price: Number(item.product?.price || 0),
    },
    quantity: Number(item.quantity || 1),
    selectedSize: item.selectedSize || undefined,
    selectedColor: item.selectedColor || undefined,
    totalPrice: Number((item.product?.price || 0) * (item.quantity || 1)),
  }));

  return {
    id: order.orderNumber, // Use human orderNumber instead of internal DB UUID
    orderNumber: order.orderNumber,
    shippingStatus: order.shippingStatus,
    deliveryStatus: (order as any).deliveryStatus || order.shippingStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    updatedAt: (order as any).updatedAt || order.createdAt,
    customer: {
      fullName: maskedName,
      phone: maskedPhone,
      district,
      deliveryZone: order.customer?.deliveryZone || 'inside_dhaka',
      fullAddress: maskedAddress,
    },
    courierBooking: order.courierBooking
      ? {
          provider: order.courierBooking.provider,
          waybillId: order.courierBooking.waybillId,
          trackingUrl: order.courierBooking.trackingUrl,
          status: order.courierBooking.status,
        }
      : undefined,
    courierStatus: order.courierStatus,
    courierWaybill: order.courierWaybill,
    items: safeItems,
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    totalAmount: Number(order.totalAmount || 0),
    advancePayment: order.advancePayment != null ? Number(order.advancePayment) : 0,
    customerDue: order.customerDue != null ? Number(order.customerDue) : Math.max(0, Math.round(((Number(order.totalAmount) || 0) - (Number(order.advancePayment) || 0)) * 100) / 100),
    dueAmount: order.dueAmount != null ? Number(order.dueAmount) : Math.max(0, Math.round(((Number(order.totalAmount) || 0) - (Number(order.advancePayment) || 0)) * 100) / 100),
  };
}

// ==============================================================
// 1. PRODUCTS DATABASE OPERATIONS
// ==============================================================

export function rowToProduct(row: ProductRow): Product {
  let images: string[] = [];
  try {
    images = JSON.parse(row.images_json || '[]');
  } catch {
    images = row.image_url ? [row.image_url] : [];
  }

  let specs: any[] = [];
  try {
    specs = JSON.parse(row.specs_json || '[]');
  } catch {}

  let sizes: string[] = [];
  try {
    sizes = JSON.parse(row.sizes_json || '[]');
  } catch {}

  let colors: string[] = [];
  try {
    colors = JSON.parse(row.colors_json || '[]');
  } catch {}

  const price = Number(row.price) || 0;
  const buyingPrice = row.buying_price != null ? Number(row.buying_price) : undefined;
  const unitProfit = buyingPrice != null ? (price - buyingPrice) : undefined;

  return {
    id: row.id,
    slug: row.slug || undefined,
    title: row.title,
    price,
    originalPrice: row.original_price != null ? Number(row.original_price) : undefined,
    buyingPrice,
    unitProfit,
    categoryId: row.category_id,
    description: row.description || '',
    imageUrl: row.image_url,
    images: images.length > 0 ? images : [row.image_url],
    stock: Number(row.stock) || 0,
    featured: Boolean(row.featured),
    featuredSortOrder: row.featured_sort_order != null ? Number(row.featured_sort_order) : 0,
    rating: Number(row.rating) || 5.0,
    reviewsCount: row.reviews_count != null && Number.isFinite(Number(row.reviews_count))
      ? Number(row.reviews_count)
      : 0,
    specs,
    sizes,
    colors,
    sku: row.sku || undefined,
    videoUrl: row.video_url || undefined,
    status: (row.status as any) || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const PUBLIC_PRODUCT_COLUMNS =
  'id, slug, title, price, original_price, category_id, description, image_url, images_json, stock, featured, featured_sort_order, rating, reviews_count, specs_json, sizes_json, colors_json, sku, video_url, status, created_at, updated_at';

export const ADMIN_PRODUCT_COLUMNS =
  'id, slug, title, price, original_price, buying_price, category_id, description, image_url, images_json, stock, featured, featured_sort_order, rating, reviews_count, specs_json, sizes_json, colors_json, sku, video_url, status, created_at, updated_at';

export const CATEGORY_COLUMNS = 'id, name, slug, icon_name, description';

export const SLIDER_COLUMNS =
  'id, title, headline, subtext, tag, discount_badge, category_id, image_url, accent_gradient, button_text, sort_order';

export const COUPON_COLUMNS =
  'code, discount_type, discount_value, min_spend, description, is_active';

export const REVIEW_COLUMNS =
  'id, product_id, author_name, rating, comment, verified_purchase, status, source, approved_at, approved_by, updated_at, images_json, created_at';

export interface ProductFilter {
  category?: string;
  search?: string;
  featured?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';
  includeInactive?: boolean;
  status?: string;
  includeBuyingPrice?: boolean;
}

export interface PaginatedProductsResult {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function buildProductWhereClause(filter?: ProductFilter): { whereClause: string; bindings: any[] } {
  let where = ' WHERE 1=1';
  const bindings: any[] = [];

  // Public product data integrity: Exclude inactive/deleted products unless explicitly requested by authorized admin
  if (!filter?.includeInactive) {
    where += " AND (status = 'active' OR status = 'published' OR status IS NULL OR status = '')";
  } else if (filter?.status) {
    where += ' AND status = ?';
    bindings.push(filter.status);
  }

  if (filter?.category && filter.category !== 'all') {
    where += ' AND (category_id = ? OR category_id IN (SELECT id FROM categories WHERE slug = ?))';
    bindings.push(filter.category, filter.category);
  }

  if (filter?.featured !== undefined) {
    where += ' AND featured = ?';
    bindings.push(filter.featured ? 1 : 0);
  }

  const rawSearch = (filter?.search || '').trim();
  if (rawSearch) {
    // 1. Check exact or prefix SKU match (utilizes idx_products_sku)
    // 2. Substring match across title, description, and sku
    // Split search into individual words to support multi-word search in English and Bengali
    const tokens = rawSearch.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      const term = `%${tokens[0]}%`;
      where += ' AND (sku = ? OR sku LIKE ? OR title LIKE ? OR description LIKE ?)';
      bindings.push(tokens[0], `${tokens[0]}%`, term, term);
    } else {
      // Multiple tokens: all tokens must match either title, description, or sku
      for (const t of tokens.slice(0, 5)) { // Cap at 5 tokens to protect query complexity
        const term = `%${t}%`;
        where += ' AND (title LIKE ? OR description LIKE ? OR sku LIKE ?)';
        bindings.push(term, term, term);
      }
    }
  }

  return { whereClause: where, bindings };
}

function resolveProductOrderClause(sortBy?: string): string {
  switch (sortBy) {
    case 'price-asc':
      return ' ORDER BY price ASC, created_at DESC';
    case 'price-desc':
      return ' ORDER BY price DESC, created_at DESC';
    case 'rating':
      return ' ORDER BY rating DESC, created_at DESC';
    case 'featured':
      return ' ORDER BY featured DESC, created_at DESC';
    case 'newest':
    default:
      return ' ORDER BY created_at DESC';
  }
}

export async function getAllProducts(
  db: D1Database,
  filter?: ProductFilter
): Promise<Product[]> {
  const { whereClause, bindings } = buildProductWhereClause(filter);
  const orderClause = resolveProductOrderClause(filter?.sortBy);
  const availableColumns = await ensureProductTableSchema(db);
  const columns = buildSelectProductColumns(availableColumns, Boolean(filter?.includeBuyingPrice));

  let query = `SELECT ${columns} FROM products${whereClause}${orderClause}`;
  const queryBindings = [...bindings];

  if (filter?.limit && filter.limit > 0) {
    const safeLimit = Math.min(250, Math.max(1, filter.limit));
    const page = Math.max(1, filter.page || 1);
    const offset = (page - 1) * safeLimit;
    query += ' LIMIT ? OFFSET ?';
    queryBindings.push(safeLimit, offset);
  }

  const stmt = db.prepare(query);
  const bound = queryBindings.length > 0 ? stmt.bind(...queryBindings) : stmt;
  const result = await bound.all<ProductRow>();

  if (!result.results) return [];
  return result.results.map(rowToProduct);
}

export interface HomepageProductsOptions {
  perCategoryLimit?: number;
  featuredLimit?: number;
}

export interface HomepageProductsData {
  categoryProducts: Record<string, Product[]>;
  featuredProducts: Product[];
  uniqueProducts: Product[];
}

/**
 * Loads strictly the products required for the homepage directly via SQL LIMITs and batching.
 * Eliminates loading the entire products table into memory and avoids N+1 database queries.
 * Selects only public storefront fields without exposing internal buying prices.
 */
export async function getHomepageProducts(
  db: D1Database,
  categoryIds: string[],
  options?: HomepageProductsOptions
): Promise<HomepageProductsData> {
  const perCategoryLimit = Math.min(24, Math.max(1, options?.perCategoryLimit || 6));
  const featuredLimit = Math.min(24, Math.max(1, options?.featuredLimit || 8));

  // 1. Prepare batch queries for D1 (1 round trip for all product queries)
  const statements: D1PreparedStatement[] = [];

  // Statement 0: Featured products (SQL WHERE + ORDER BY + LIMIT)
  const featuredSql = `
    SELECT ${PUBLIC_PRODUCT_COLUMNS} FROM products 
    WHERE (status = 'active' OR status = 'published' OR status IS NULL OR status = '')
      AND (featured = 1 OR featured = 'true')
    ORDER BY CASE WHEN featured_sort_order IS NOT NULL AND featured_sort_order > 0 THEN featured_sort_order ELSE 99999 END ASC, created_at DESC 
    LIMIT ?
  `;
  statements.push(db.prepare(featuredSql).bind(featuredLimit));

  // Statements 1..N: Products per category (SQL WHERE + ORDER BY + LIMIT)
  for (const catId of categoryIds) {
    const catSql = `
      SELECT ${PUBLIC_PRODUCT_COLUMNS} FROM products 
      WHERE category_id = ? 
        AND (status = 'active' OR status = 'published' OR status IS NULL OR status = '')
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    statements.push(db.prepare(catSql).bind(catId, perCategoryLimit));
  }

  // Execute in 1 single D1 batch round trip (or concurrent fallback)
  let batchResults: any[];
  try {
    batchResults = typeof db.batch === 'function'
      ? await db.batch<ProductRow>(statements)
      : await Promise.all(statements.map((s) => s.all<ProductRow>()));
  } catch (err: any) {
    if (err?.message?.includes('featured_sort_order') || err?.message?.includes('no such column')) {
      const fallbackFeaturedSql = `
        SELECT ${PUBLIC_PRODUCT_COLUMNS} FROM products 
        WHERE (status = 'active' OR status = 'published' OR status IS NULL OR status = '')
          AND (featured = 1 OR featured = 'true')
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      statements[0] = db.prepare(fallbackFeaturedSql).bind(featuredLimit);
      batchResults = typeof db.batch === 'function'
        ? await db.batch<ProductRow>(statements)
        : await Promise.all(statements.map((s) => s.all<ProductRow>()));
    } else {
      throw err;
    }
  }

  // Process featured products
  const featuredRows = batchResults[0]?.results || [];
  const featuredProducts = featuredRows.map(rowToProduct);

  // Process category products
  const categoryProducts: Record<string, Product[]> = {};
  const collectedMap = new Map<string, Product>();

  categoryIds.forEach((catId, index) => {
    const rows = batchResults[index + 1]?.results || [];
    const prods = rows.map(rowToProduct);
    categoryProducts[catId] = prods;
    for (const p of prods) {
      collectedMap.set(p.id, p);
    }
  });

  // Also include featured products in uniqueProducts collection so quick view and details work seamlessly
  for (const p of featuredProducts) {
    if (!collectedMap.has(p.id)) {
      collectedMap.set(p.id, p);
    }
  }

  return {
    categoryProducts,
    featuredProducts,
    uniqueProducts: Array.from(collectedMap.values()),
  };
}

export async function getPaginatedProducts(
  db: D1Database,
  filter?: ProductFilter
): Promise<PaginatedProductsResult> {
  const { whereClause, bindings } = buildProductWhereClause(filter);
  const orderClause = resolveProductOrderClause(filter?.sortBy);
  const availableColumns = await ensureProductTableSchema(db);
  const columns = buildSelectProductColumns(availableColumns, Boolean(filter?.includeBuyingPrice));

  // Safe limits: default 24, max 250
  const safeLimit = Math.min(250, Math.max(1, Number(filter?.limit) || 24));
  const page = Math.max(1, Number(filter?.page) || 1);
  const offset = (page - 1) * safeLimit;

  // 1. Prepare COUNT statement
  const countQuery = `SELECT COUNT(*) as total FROM products${whereClause}`;
  const countStmt = db.prepare(countQuery);
  const boundCount = bindings.length > 0 ? countStmt.bind(...bindings) : countStmt;

  // 2. Prepare DATA statement
  const dataQuery = `SELECT ${columns} FROM products${whereClause}${orderClause} LIMIT ? OFFSET ?`;
  const dataStmt = db.prepare(dataQuery);
  const boundData = dataStmt.bind(...bindings, safeLimit, offset);

  // 3. Execute COUNT and DATA queries concurrently in a single batch round-trip
  let countRes: any;
  let dataRes: any;
  if (typeof db.batch === 'function') {
    const batchRes = await db.batch<any>([boundCount, boundData]);
    countRes = batchRes[0];
    dataRes = batchRes[1];
  } else {
    const [c, d] = await Promise.all([
      boundCount.first<{ total: number }>(),
      boundData.all<ProductRow>(),
    ]);
    countRes = { results: [c] };
    dataRes = d;
  }

  const total = Number(countRes?.results?.[0]?.total ?? countRes?.total ?? 0);
  const products = (dataRes?.results || []).map(rowToProduct);
  const totalPages = Math.ceil(total / safeLimit) || 1;

  return {
    products,
    total,
    page,
    limit: safeLimit,
    totalPages,
  };
}

export async function getProductById(
  db: D1Database,
  id: string,
  options?: { includeBuyingPrice?: boolean; publicOnly?: boolean }
): Promise<Product | null> {
  const availableColumns = await ensureProductTableSchema(db);
  const columns = buildSelectProductColumns(
    availableColumns,
    !options?.publicOnly && options?.includeBuyingPrice !== false
  );
  // Match either internal product ID or current SEO URL slug
  let row = await db
    .prepare(`SELECT ${columns} FROM products WHERE id = ? OR slug = ? LIMIT 1`)
    .bind(id, id)
    .first<ProductRow>();

  // If not found as current product or slug, resolve via historical slug in product_slug_history
  if (!row) {
    try {
      const pCols = columns
        .split(',')
        .map((col) => `p.${col.trim()}`)
        .join(', ');
      row = await db
        .prepare(`
          SELECT ${pCols}
          FROM product_slug_history psh
          JOIN products p ON psh.product_id = p.id
          WHERE psh.slug = ?
          LIMIT 1
        `)
        .bind(id)
        .first<ProductRow>();
    } catch {
      // Historical lookup gracefully proceeds if table empty or query fails
    }
  }

  return row ? rowToProduct(row) : null;
}

export async function getProductBySlug(
  db: D1Database,
  slug: string,
  options?: { includeBuyingPrice?: boolean; publicOnly?: boolean }
): Promise<Product | null> {
  const availableColumns = await ensureProductTableSchema(db);
  const columns = buildSelectProductColumns(
    availableColumns,
    !options?.publicOnly && options?.includeBuyingPrice !== false
  );
  let row = await db.prepare(`SELECT ${columns} FROM products WHERE slug = ? LIMIT 1`).bind(slug).first<ProductRow>();
  if (!row) {
    try {
      const pCols = columns
        .split(',')
        .map((col) => `p.${col.trim()}`)
        .join(', ');
      row = await db
        .prepare(`
          SELECT ${pCols}
          FROM product_slug_history psh
          JOIN products p ON psh.product_id = p.id
          WHERE psh.slug = ?
          LIMIT 1
        `)
        .bind(slug)
        .first<ProductRow>();
    } catch {}
  }
  return row ? rowToProduct(row) : null;
}

/**
 * Persists an old slug into product_slug_history when an admin modifies a product slug.
 * Uses parameterized queries and prevents duplicate history entries.
 */
export async function recordProductSlugHistory(
  db: D1Database,
  productId: string,
  oldSlug: string
): Promise<void> {
  const cleanSlug = (oldSlug || '').trim();
  const cleanProdId = (productId || '').trim();
  if (!cleanSlug || !cleanProdId) return;

  await ensureProductTableSchema(db);

  // Security Hardening: Use CSPRNG randomUUID for collision-resistant slug history identifier
  const historyRand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const historyId = `psh-${Date.now()}-${historyRand}`;
  try {
    await db
      .prepare(`
        INSERT INTO product_slug_history (id, product_id, slug, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(slug) DO UPDATE SET product_id = excluded.product_id, created_at = CURRENT_TIMESTAMP
      `)
      .bind(historyId, cleanProdId, cleanSlug)
      .run();
  } catch {
    try {
      await db.prepare('DELETE FROM product_slug_history WHERE slug = ?').bind(cleanSlug).run();
      await db
        .prepare('INSERT INTO product_slug_history (id, product_id, slug, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
        .bind(historyId, cleanProdId, cleanSlug)
        .run();
    } catch (fallbackErr) {
      console.warn('[D1 recordProductSlugHistory Error]:', fallbackErr);
    }
  }
}

/**
 * Finds a product and its current canonical slug by an old historical slug.
 */
export async function findProductBySlugHistory(
  db: D1Database,
  slug: string,
  options?: { includeBuyingPrice?: boolean; publicOnly?: boolean }
): Promise<{ productId: string; currentSlug: string; product: Product } | null> {
  const cleanSlug = (slug || '').trim();
  if (!cleanSlug) return null;

  const availableColumns = await ensureProductTableSchema(db);
  const columns = buildSelectProductColumns(
    availableColumns,
    !options?.publicOnly && options?.includeBuyingPrice !== false
  );
  const pCols = columns
    .split(',')
    .map((col) => `p.${col.trim()}`)
    .join(', ');

  try {
    const row = await db
      .prepare(`
        SELECT ${pCols}
        FROM product_slug_history psh
        JOIN products p ON psh.product_id = p.id
        WHERE psh.slug = ?
        LIMIT 1
      `)
      .bind(cleanSlug)
      .first<ProductRow>();

    if (!row) return null;
    const prod = rowToProduct(row);
    return {
      productId: prod.id,
      currentSlug: prod.slug || prod.id,
      product: prod,
    };
  } catch {
    return null;
  }
}

/**
 * Ensures unique SEO slug generation in Cloudflare D1.
 * Appends deterministic numerical suffixes (-2, -3) only when a slug collision occurs.
 */
export async function ensureUniqueSlugInD1(
  db: D1Database,
  baseSlug: string,
  excludeProductId?: string
): Promise<string> {
  const cleanBase = (baseSlug || 'product').toLowerCase().trim();
  let candidate = cleanBase;
  let counter = 1;

  while (counter <= 100) {
    const existing = excludeProductId
      ? await db
          .prepare('SELECT id FROM products WHERE slug = ? AND id != ? LIMIT 1')
          .bind(candidate, excludeProductId)
          .first<{ id: string }>()
      : await db
          .prepare('SELECT id FROM products WHERE slug = ? LIMIT 1')
          .bind(candidate)
          .first<{ id: string }>();

    // Also check if candidate is claimed in product_slug_history by another product
    let existingHistory: { product_id: string } | null = null;
    if (!existing) {
      try {
        existingHistory = excludeProductId
          ? await db
              .prepare('SELECT product_id FROM product_slug_history WHERE slug = ? AND product_id != ? LIMIT 1')
              .bind(candidate, excludeProductId)
              .first<{ product_id: string }>()
          : await db
              .prepare('SELECT product_id FROM product_slug_history WHERE slug = ? LIMIT 1')
              .bind(candidate)
              .first<{ product_id: string }>();
      } catch {}
    }

    if (!existing && !existingHistory) {
      return candidate;
    }

    counter++;
    candidate = `${cleanBase}-${counter}`;
  }

  return `${cleanBase}-${Date.now().toString().slice(-4)}`;
}

/**
 * Batch-retrieves multiple products by ID in a single SQL query.
 * Eliminates N+1 database queries when verifying cart and checkout items.
 */
export async function getProductsByIds(
  db: D1Database,
  ids: string[],
  options?: { includeBuyingPrice?: boolean; publicOnly?: boolean }
): Promise<Product[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
  if (uniqueIds.length === 0) return [];
  const availableColumns = await ensureProductTableSchema(db);
  const columns = buildSelectProductColumns(
    availableColumns,
    !options?.publicOnly && options?.includeBuyingPrice !== false
  );
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const stmt = db.prepare(`SELECT ${columns} FROM products WHERE id IN (${placeholders})`).bind(...uniqueIds);
  const result = await stmt.all<ProductRow>();
  return (result.results || []).map(rowToProduct);
}

export async function insertProduct(db: D1Database, input: any): Promise<Product> {
  const id = input.id || `prod-${Date.now()}`;

  // Check if product already exists to preserve stable records
  const existing = await db.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
  if (existing) {
    return updateProductInD1(db, id, input);
  }

  // Ensure table schema has required columns (self-heals missing video_url / buying_price / featured_sort_order)
  const availableColumns = await ensureProductTableSchema(db);

  const title = (input.title || input.name || 'Untitled Product').trim();
  const price = Math.max(0, Number(input.price) || 0);
  const originalPrice = input.originalPrice != null && !isNaN(Number(input.originalPrice))
    ? Math.max(0, Number(input.originalPrice))
    : (input.oldPrice != null && !isNaN(Number(input.oldPrice)) ? Math.max(0, Number(input.oldPrice)) : 0);
  // Root cause remediation: Check both camelCase buyingPrice and snake_case buying_price
  const rawInputBuyingPrice = input.buyingPrice !== undefined && input.buyingPrice !== null
    ? input.buyingPrice
    : ((input as any).buying_price !== undefined && (input as any).buying_price !== null ? (input as any).buying_price : null);
  const buyingPrice = rawInputBuyingPrice !== null && !isNaN(Number(rawInputBuyingPrice))
    ? Math.max(0, Number(rawInputBuyingPrice))
    : 0;
  const categoryId = (typeof input.categoryId === 'string' && input.categoryId.trim())
    || (typeof input.category === 'string' && input.category.trim())
    || 'cat-mens-accessories';
  const description = typeof input.description === 'string' ? input.description : '';
  const imageUrl = (typeof input.imageUrl === 'string' && input.imageUrl.trim())
    || (Array.isArray(input.images) && typeof input.images[0] === 'string' && input.images[0].trim())
    || '';
  const images = Array.isArray(input.images) && input.images.length > 0
    ? input.images.filter((img: any) => typeof img === 'string' && img.trim().length > 0)
    : (imageUrl ? [imageUrl] : []);
  const stock = Math.max(0, Math.floor(Number(input.stock) || 0));
  const featured = input.featured ? 1 : 0;
  const featuredSortOrder = input.featuredSortOrder != null && !isNaN(Number(input.featuredSortOrder))
    ? Math.max(0, Math.floor(Number(input.featuredSortOrder)))
    : 0;
  // Ratings and reviewsCount are strictly derived from approved reviews (no fake counts or manual overrides)
  const rating = 5.0;
  const reviewsCount = 0;
  const specs = Array.isArray(input.specs) ? input.specs : [];
  const sizes = Array.isArray(input.sizes) ? input.sizes : [];
  const colors = Array.isArray(input.colors) ? input.colors : [];
  const sku = (typeof input.sku === 'string' && input.sku.trim()) || null;
  const videoUrl = (typeof input.videoUrl === 'string' && input.videoUrl.trim())
    || (typeof input.youtubeUrl === 'string' && input.youtubeUrl.trim())
    || null;
  const status = typeof input.status === 'string' && input.status.trim() ? input.status.trim() : 'active';
  const createdAt = (typeof input.createdAt === 'string' && input.createdAt.trim()) || new Date().toISOString();

  // Automatic SEO slug generation with uniqueness guarantee
  const initialSlug = (typeof input.slug === 'string' && input.slug.trim())
    ? generateProductSlug(input.slug)
    : generateProductSlug(title);
  const finalSlug = await ensureUniqueSlugInD1(db, initialSlug || id);

  // Dynamically assemble only the columns that actually exist in the products table!
  const candidateFields: { col: string; val: any }[] = [
    { col: 'id', val: id },
    { col: 'slug', val: finalSlug },
    { col: 'title', val: title },
    { col: 'price', val: price },
    { col: 'original_price', val: originalPrice },
    { col: 'buying_price', val: buyingPrice },
    { col: 'category_id', val: categoryId },
    { col: 'description', val: description },
    { col: 'image_url', val: imageUrl },
    { col: 'images_json', val: JSON.stringify(images) },
    { col: 'stock', val: stock },
    { col: 'featured', val: featured },
    { col: 'featured_sort_order', val: featuredSortOrder },
    { col: 'rating', val: rating },
    { col: 'reviews_count', val: reviewsCount },
    { col: 'specs_json', val: JSON.stringify(specs) },
    { col: 'sizes_json', val: JSON.stringify(sizes) },
    { col: 'colors_json', val: JSON.stringify(colors) },
    { col: 'sku', val: sku },
    { col: 'video_url', val: videoUrl },
    { col: 'status', val: status },
    { col: 'created_at', val: createdAt },
  ];

  const activeFields = candidateFields.filter((f) => availableColumns.has(f.col));
  const colNames = [...activeFields.map((f) => f.col), 'updated_at'].join(', ');
  const placeholders = [...activeFields.map(() => '?'), 'CURRENT_TIMESTAMP'].join(', ');
  const bindings = activeFields.map((f) => f.val);

  try {
    await db
      .prepare(`INSERT INTO products (${colNames}) VALUES (${placeholders})`)
      .bind(...bindings)
      .run();
  } catch (insertErr: any) {
    console.error('[D1 insertProduct Error]:', insertErr);
    throw new Error(`D1 INSERT INTO products failed: ${insertErr?.message || insertErr}`);
  }

  const created = await getProductById(db, id, { includeBuyingPrice: true });
  if (!created) throw new Error('Failed to retrieve newly created product from D1');
  return created;
}

export async function updateProductInD1(
  db: D1Database,
  id: string,
  updates: Partial<Product>
): Promise<Product> {
  const existing = await getProductById(db, id, { includeBuyingPrice: true });
  if (!existing) {
    throw new Error('Product not found.');
  }

  const availableColumns = await ensureProductTableSchema(db);

  const title = updates.title !== undefined ? updates.title.trim() : existing.title;
  const price = updates.price !== undefined ? Math.max(0, Number(updates.price)) : existing.price;
  const originalPrice = updates.originalPrice !== undefined ? Math.max(0, Number(updates.originalPrice)) : (existing.originalPrice ?? 0);
  // Root cause remediation: Support both camelCase updates.buyingPrice and snake_case updates.buying_price
  const rawUpdateBuyingPrice = updates.buyingPrice !== undefined && updates.buyingPrice !== null
    ? updates.buyingPrice
    : ((updates as any).buying_price !== undefined && (updates as any).buying_price !== null ? (updates as any).buying_price : undefined);
  const buyingPrice = rawUpdateBuyingPrice !== undefined && !isNaN(Number(rawUpdateBuyingPrice))
    ? Math.max(0, Number(rawUpdateBuyingPrice))
    : (existing.buyingPrice ?? (existing as any).buying_price ?? 0);
  const categoryId = updates.categoryId !== undefined ? updates.categoryId : existing.categoryId;
  const description = updates.description !== undefined ? updates.description : existing.description;
  const imageUrl = updates.imageUrl !== undefined ? updates.imageUrl : existing.imageUrl;
  const images = updates.images !== undefined ? updates.images : existing.images;
  const stock = updates.stock !== undefined ? Math.max(0, Math.floor(Number(updates.stock))) : existing.stock;
  const featured = updates.featured !== undefined ? (updates.featured ? 1 : 0) : (existing.featured ? 1 : 0);
  // Ratings and reviewsCount are strictly derived from approved reviews (preserve existing without manual overrides)
  const rating = existing.rating ?? 5.0;
  const reviewsCount = existing.reviewsCount ?? 0;
  const specs = updates.specs !== undefined ? updates.specs : existing.specs;
  const sizes = updates.sizes !== undefined ? updates.sizes : existing.sizes;
  const colors = updates.colors !== undefined ? updates.colors : existing.colors;
  const sku = updates.sku !== undefined ? updates.sku : (existing.sku || null);
  const videoUrl = updates.videoUrl !== undefined ? (updates.videoUrl || null) : (existing.videoUrl || null);
  const status = updates.status !== undefined ? updates.status : (existing.status || 'active');
  const featuredSortOrder = updates.featuredSortOrder !== undefined
    ? Math.max(0, Math.floor(Number(updates.featuredSortOrder)))
    : (existing.featuredSortOrder ?? 0);

  // Slug stability rule: Preserve existing slug unless explicitly edited or missing
  let resolvedSlug = existing.slug;
  let slugChanged = false;
  if (updates.slug !== undefined && typeof updates.slug === 'string' && updates.slug.trim()) {
    const requestedSlug = generateProductSlug(updates.slug);
    if (requestedSlug && requestedSlug !== existing.slug) {
      resolvedSlug = await ensureUniqueSlugInD1(db, requestedSlug, id);
      if (resolvedSlug !== existing.slug) {
        slugChanged = true;
      }
    }
  } else if (!resolvedSlug) {
    const autoSlug = generateProductSlug(title || existing.title);
    resolvedSlug = await ensureUniqueSlugInD1(db, autoSlug || id, id);
    if (existing.slug && resolvedSlug !== existing.slug) {
      slugChanged = true;
    }
  }

  const candidateUpdates: { col: string; val: any }[] = [
    { col: 'slug', val: resolvedSlug },
    { col: 'title', val: title },
    { col: 'price', val: price },
    { col: 'original_price', val: originalPrice },
    { col: 'buying_price', val: buyingPrice },
    { col: 'category_id', val: categoryId },
    { col: 'description', val: description },
    { col: 'image_url', val: imageUrl },
    { col: 'images_json', val: JSON.stringify(images) },
    { col: 'stock', val: stock },
    { col: 'featured', val: featured },
    { col: 'featured_sort_order', val: featuredSortOrder },
    { col: 'rating', val: rating },
    { col: 'reviews_count', val: reviewsCount },
    { col: 'specs_json', val: JSON.stringify(specs) },
    { col: 'sizes_json', val: JSON.stringify(sizes) },
    { col: 'colors_json', val: JSON.stringify(colors) },
    { col: 'sku', val: sku },
    { col: 'video_url', val: videoUrl },
    { col: 'status', val: status },
  ];

  const activeUpdates = candidateUpdates.filter((u) => availableColumns.has(u.col));
  const setClauses = [...activeUpdates.map((u) => `${u.col} = ?`), 'updated_at = CURRENT_TIMESTAMP'].join(', ');
  const bindings = [...activeUpdates.map((u) => u.val), existing.id];

  try {
    await db
      .prepare(`UPDATE products SET ${setClauses} WHERE id = ?`)
      .bind(...bindings)
      .run();
  } catch (err: any) {
    console.error('[D1 updateProductInD1 Error]:', err);
    throw new Error(`D1 UPDATE products failed: ${err?.message || err}`);
  }

  // Preserve previous slug in slug history for seamless 301 redirects
  if (slugChanged && existing.slug && existing.slug.trim() && resolvedSlug && resolvedSlug !== existing.slug) {
    try {
      await recordProductSlugHistory(db, existing.id, existing.slug.trim());
      // Delete resolvedSlug from history if it previously existed to prevent loops
      await db.prepare('DELETE FROM product_slug_history WHERE slug = ?').bind(resolvedSlug).run();
    } catch (histErr) {
      console.warn('[D1 updateProductInD1 Notice]: Could not record slug history:', histErr);
    }
  }

  const updated = await getProductById(db, existing.id, { includeBuyingPrice: true });
  if (!updated) throw new Error('Failed to retrieve updated product');
  return updated;
}

/**
 * Sets product featured status and optional deterministic display order in Cloudflare D1.
 * Authoritative, minimal update that strictly preserves the original category and all other attributes.
 */
export async function setProductFeaturedInD1(
  db: D1Database,
  id: string,
  isFeatured: boolean,
  featuredSortOrder?: number
): Promise<Product> {
  const existing = await getProductById(db, id);
  if (!existing) {
    throw new Error('Product not found.');
  }

  const sortOrder = featuredSortOrder !== undefined
    ? Math.max(0, Number(featuredSortOrder))
    : (existing.featuredSortOrder ?? 0);

  const featuredVal = isFeatured ? 1 : 0;

  try {
    await db
      .prepare(`
        UPDATE products SET
          featured = ?,
          featured_sort_order = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(featuredVal, sortOrder, id)
      .run();
  } catch (err: any) {
    if (err?.message?.includes('featured_sort_order') || err?.message?.includes('no such column')) {
      await db
        .prepare(`
          UPDATE products SET
            featured = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(featuredVal, id)
        .run();
    } else {
      throw err;
    }
  }

  const updated = await getProductById(db, id);
  if (!updated) throw new Error('Failed to retrieve updated product');
  return updated;
}

export async function deleteProductFromD1(db: D1Database, id: string): Promise<boolean> {
  // Use atomic D1 batch to delete product, historical slugs, and associated reviews in a single round-trip
  const batchRes = await db.batch([
    db.prepare('DELETE FROM reviews WHERE product_id = ?').bind(id),
    db.prepare('DELETE FROM product_slug_history WHERE product_id = ?').bind(id),
    db.prepare('DELETE FROM products WHERE id = ?').bind(id),
  ]);
  const deleteRes = batchRes[2];
  if (!deleteRes.success) {
    console.error('Failed to delete product from database:', deleteRes.error);
    throw new Error('Failed to delete product.');
  }
  return true;
}

// ==============================================================
// 2. CATEGORIES DATABASE OPERATIONS
// ==============================================================

export function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    iconName: row.icon_name || undefined,
    description: row.description || '',
  };
}

export async function getAllCategories(db: D1Database): Promise<Category[]> {
  const result = await db.prepare(`SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY name ASC`).all<CategoryRow>();
  return (result.results || []).map(rowToCategory);
}

export async function getCategoryById(db: D1Database, idOrSlug: string): Promise<Category | null> {
  const query = `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = ? OR slug = ? OR LOWER(slug) = LOWER(?) LIMIT 1`;
  const row = await db.prepare(query).bind(idOrSlug, idOrSlug, idOrSlug).first<CategoryRow>();
  return row ? rowToCategory(row) : null;
}

export async function insertCategory(db: D1Database, input: any): Promise<Category> {
  const id = input.id || `cat-${Date.now()}`;

  const existing = await db.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first();
  if (existing) {
    return updateCategoryInD1(db, id, input);
  }

  const name = (input.name || 'Untitled Category').trim();
  const slug = (input.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
  const iconName = input.iconName || null;
  const description = input.description || '';
  const createdAt = input.createdAt || new Date().toISOString();

  await db
    .prepare(`
      INSERT INTO categories (id, name, slug, icon_name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(id, name, slug, iconName, description, createdAt)
    .run();

  const created = await getCategoryById(db, id);
  if (!created) throw new Error('Failed to retrieve inserted category');
  return created;
}

export async function updateCategoryInD1(db: D1Database, id: string, updates: Partial<Category>): Promise<Category> {
  const existing = await getCategoryById(db, id);
  if (!existing) throw new Error('Category not found.');

  const name = updates.name !== undefined ? updates.name.trim() : existing.name;
  const slug = updates.slug !== undefined ? updates.slug.trim() : existing.slug;
  const iconName = updates.iconName !== undefined ? updates.iconName : existing.iconName;
  const description = updates.description !== undefined ? updates.description : existing.description;

  await db
    .prepare(`
      UPDATE categories SET
        name = ?,
        slug = ?,
        icon_name = ?,
        description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(name, slug, iconName || null, description || null, id)
    .run();

  const updated = await getCategoryById(db, id);
  if (!updated) throw new Error('Failed to retrieve updated category');
  return updated;
}

export async function deleteCategoryFromD1(db: D1Database, idOrSlug: string): Promise<boolean> {
  const res = await db.prepare('DELETE FROM categories WHERE id = ? OR slug = ?').bind(idOrSlug, idOrSlug).run();
  if (!res.success) {
    console.error('Failed to delete category from database:', res.error);
    throw new Error('Failed to delete category.');
  }
  return true;
}

// ==============================================================
// 3. SLIDERS / HERO BANNERS DATABASE OPERATIONS
// ==============================================================

let cachedSliderTableColumns: Set<string> | null = null;
let sliderSchemaHealingAttempted = false;

export async function getSliderTableColumns(db: D1Database): Promise<Set<string>> {
  if (cachedSliderTableColumns) return cachedSliderTableColumns;
  try {
    const res = await db.prepare("PRAGMA table_info('sliders')").all<{ name: string }>();
    if (res.results && res.results.length > 0) {
      cachedSliderTableColumns = new Set(res.results.map((r) => r.name.toLowerCase()));
      return cachedSliderTableColumns;
    }
  } catch (err: any) {
    console.warn('[D1] Could not query pragma_table_info for sliders:', err);
  }
  return new Set([
    'id', 'title', 'headline', 'subtext', 'tag', 'discount_badge',
    'category_id', 'image_url', 'accent_gradient', 'button_text', 'sort_order', 'is_active'
  ]);
}

export async function ensureSliderTableSchema(db: D1Database): Promise<Set<string>> {
  let columns = await getSliderTableColumns(db);
  if (!sliderSchemaHealingAttempted) {
    sliderSchemaHealingAttempted = true;
    if (!columns.has('is_active')) {
      try {
        await db.prepare('ALTER TABLE sliders ADD COLUMN is_active INTEGER DEFAULT 1').run();
        cachedSliderTableColumns = null;
        columns = await getSliderTableColumns(db);
        console.log('[D1] Self-healed: added missing is_active column to sliders table.');
      } catch (err: any) {
        console.warn('[D1] is_active column addition notice:', err?.message || err);
      }
    }
  }
  return columns;
}

export function rowToSlider(row: SliderRow): CarouselSlide {
  return {
    id: row.id,
    title: row.title,
    headline: row.headline,
    subtext: row.subtext || '',
    tag: row.tag || '',
    discountBadge: row.discount_badge || '',
    categoryId: row.category_id || '',
    imageUrl: row.image_url,
    accentGradient: row.accent_gradient || undefined,
    buttonText: row.button_text || undefined,
    sort_order: row.sort_order != null ? Number(row.sort_order) : 0,
    sortOrder: row.sort_order != null ? Number(row.sort_order) : 0,
    isActive: row.is_active != null ? Boolean(row.is_active) : true,
  };
}

export async function getAllSliders(db: D1Database): Promise<CarouselSlide[]> {
  const cols = await ensureSliderTableSchema(db);
  const selectCols = cols.has('is_active')
    ? `${SLIDER_COLUMNS}, is_active`
    : SLIDER_COLUMNS;
  const result = await db.prepare(`SELECT ${selectCols} FROM sliders ORDER BY sort_order ASC, created_at ASC`).all<SliderRow>();
  return (result.results || []).map(rowToSlider);
}

export async function getSliderById(db: D1Database, id: string): Promise<CarouselSlide | null> {
  const cols = await ensureSliderTableSchema(db);
  const selectCols = cols.has('is_active')
    ? `${SLIDER_COLUMNS}, is_active`
    : SLIDER_COLUMNS;
  const row = await db.prepare(`SELECT ${selectCols} FROM sliders WHERE id = ? LIMIT 1`).bind(id).first<SliderRow>();
  return row ? rowToSlider(row) : null;
}

export async function insertSlider(db: D1Database, input: any): Promise<CarouselSlide> {
  const id = input.id || `slide-${Date.now()}`;

  const existing = await db.prepare('SELECT id FROM sliders WHERE id = ?').bind(id).first();
  if (existing) {
    return updateSliderInD1(db, id, input);
  }

  const cols = await ensureSliderTableSchema(db);

  // If sortOrder is not provided or <= 0, place new slide at the end (max sort_order + 1)
  let sortOrder = input.sortOrder != null || input.sort_order != null
    ? Number(input.sortOrder ?? input.sort_order)
    : 0;
  if (!sortOrder || sortOrder <= 0) {
    try {
      const maxRow = await db.prepare('SELECT MAX(sort_order) as max_order FROM sliders').first<{ max_order: number | null }>();
      sortOrder = (maxRow?.max_order ?? 0) + 1;
    } catch {
      sortOrder = 1;
    }
  }

  const title = (input.title || '').trim();
  const headline = (input.headline || '').trim();
  const subtext = input.subtext || '';
  const tag = input.tag || '';
  const discountBadge = input.discountBadge || '';
  const categoryId = input.categoryId || '';
  const imageUrl = input.imageUrl || '';
  const accentGradient = input.accentGradient || '';
  const buttonText = input.buttonText || 'Shop Now';
  const isActive = input.isActive !== undefined ? (input.isActive ? 1 : 0) : (input.is_active !== undefined ? (Number(input.is_active) ? 1 : 0) : 1);

  if (cols.has('is_active')) {
    await db
      .prepare(`
        INSERT INTO sliders (
          id, title, headline, subtext, tag, discount_badge, category_id,
          image_url, accent_gradient, button_text, sort_order, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `)
      .bind(
        id,
        title,
        headline,
        subtext,
        tag,
        discountBadge,
        categoryId,
        imageUrl,
        accentGradient,
        buttonText,
        sortOrder,
        isActive
      )
      .run();
  } else {
    await db
      .prepare(`
        INSERT INTO sliders (
          id, title, headline, subtext, tag, discount_badge, category_id,
          image_url, accent_gradient, button_text, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `)
      .bind(
        id,
        title,
        headline,
        subtext,
        tag,
        discountBadge,
        categoryId,
        imageUrl,
        accentGradient,
        buttonText,
        sortOrder
      )
      .run();
  }

  const row = await getSliderById(db, id);
  if (!row) throw new Error('Failed to retrieve inserted slider');
  return row;
}

export async function updateSliderInD1(db: D1Database, id: string, updates: Partial<CarouselSlide> & { sort_order?: number; sortOrder?: number; isActive?: boolean; is_active?: number }): Promise<CarouselSlide> {
  const existing = await getSliderById(db, id);
  if (!existing) throw new Error('Slider not found.');

  const cols = await ensureSliderTableSchema(db);

  const title = updates.title ?? existing.title;
  const headline = updates.headline ?? existing.headline;
  const subtext = updates.subtext ?? existing.subtext;
  const tag = updates.tag ?? existing.tag;
  const discountBadge = updates.discountBadge ?? existing.discountBadge;
  const categoryId = updates.categoryId ?? existing.categoryId;
  const imageUrl = updates.imageUrl ?? existing.imageUrl;
  const accentGradient = updates.accentGradient ?? existing.accentGradient;
  const buttonText = updates.buttonText ?? existing.buttonText;
  const sortOrder = updates.sort_order ?? updates.sortOrder ?? existing.sort_order ?? 0;
  
  const isActive = updates.isActive !== undefined 
    ? (updates.isActive ? 1 : 0) 
    : (updates.is_active !== undefined ? (Number(updates.is_active) ? 1 : 0) : (existing.isActive !== false ? 1 : 0));

  if (cols.has('is_active')) {
    await db
      .prepare(`
        UPDATE sliders SET
          title = ?,
          headline = ?,
          subtext = ?,
          tag = ?,
          discount_badge = ?,
          category_id = ?,
          image_url = ?,
          accent_gradient = ?,
          button_text = ?,
          sort_order = ?,
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        title,
        headline,
        subtext,
        tag,
        discountBadge,
        categoryId,
        imageUrl,
        accentGradient || null,
        buttonText || null,
        sortOrder,
        isActive,
        id
      )
      .run();
  } else {
    await db
      .prepare(`
        UPDATE sliders SET
          title = ?,
          headline = ?,
          subtext = ?,
          tag = ?,
          discount_badge = ?,
          category_id = ?,
          image_url = ?,
          accent_gradient = ?,
          button_text = ?,
          sort_order = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        title,
        headline,
        subtext,
        tag,
        discountBadge,
        categoryId,
        imageUrl,
        accentGradient || null,
        buttonText || null,
        sortOrder,
        id
      )
      .run();
  }

  const row = await getSliderById(db, id);
  if (!row) throw new Error('Failed to retrieve updated slider');
  return row;
}

export async function reorderSlidersInD1(
  db: D1Database,
  orderedItems: Array<{ id: string; sort_order?: number; sortOrder?: number } | string>
): Promise<CarouselSlide[]> {
  if (!Array.isArray(orderedItems) || orderedItems.length === 0) {
    throw new Error('Invalid order payload: non-empty array expected');
  }

  // Extract and validate unique slide IDs
  const rawIds = orderedItems.map((item) => (typeof item === 'string' ? item : item.id)).filter(Boolean);
  const uniqueIds = Array.from(new Set(rawIds));
  if (uniqueIds.length !== orderedItems.length) {
    throw new Error('Duplicate slide IDs detected in ordering request');
  }

  // Fetch all current sliders from DB to verify IDs exist
  const currentSliders = await getAllSliders(db);
  const currentMap = new Map(currentSliders.map((s) => [s.id, s]));

  for (const id of uniqueIds) {
    if (!currentMap.has(id)) {
      throw new Error(`Slide not found with ID: ${id}`);
    }
  }

  // Normalize sequential order 1, 2, 3, ... N
  const statements: D1PreparedStatement[] = [];
  uniqueIds.forEach((id, index) => {
    const normalizedSortOrder = index + 1;
    statements.push(
      db.prepare('UPDATE sliders SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(normalizedSortOrder, id)
    );
  });

  // Handle any slides in DB that weren't included in the request: place them after normalized (N + 1, N + 2...)
  let nextOrder = uniqueIds.length + 1;
  for (const slide of currentSliders) {
    if (!uniqueIds.includes(slide.id)) {
      statements.push(
        db.prepare('UPDATE sliders SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(nextOrder++, slide.id)
      );
    }
  }

  if (statements.length > 0) {
    if (typeof db.batch === 'function') {
      await db.batch(statements);
    } else {
      await Promise.all(statements.map((s) => s.run()));
    }
  }

  return getAllSliders(db);
}

export async function deleteSliderFromD1(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare('DELETE FROM sliders WHERE id = ?').bind(id).run();
  if (!res.success) return false;

  // Normalize remaining slides' sort_order: 1, 2, 3...
  try {
    const remaining = await getAllSliders(db);
    if (remaining.length > 0 && typeof db.batch === 'function') {
      const reindexStatements = remaining.map((s, idx) =>
        db.prepare('UPDATE sliders SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(idx + 1, s.id)
      );
      await db.batch(reindexStatements);
    }
  } catch (err: any) {
    console.warn('[D1] deleteSlider reindexing notice:', err?.message || err);
  }

  return true;
}

// ==============================================================
// 4. STORE SETTINGS DATABASE OPERATIONS (SAFE CONTROLLED MERGING & D1 VERIFICATION)
// ==============================================================

/**
 * Controlled deep merge helper for StoreSettings:
 * Merges intentionally supplied updates without obliterating existing nested fields.
 */
export function controlledMergeSettings(current: StoreSettings, updates: Partial<StoreSettings>): StoreSettings {
  const merged: StoreSettings = {
    ...current,
    ...updates,
  };

  // Synchronize Top Bar Announcement Text
  if (updates.topBarAnnouncementText !== undefined) {
    merged.topBarAnnouncementText = updates.topBarAnnouncementText;
    merged.announcementText = updates.topBarAnnouncementText;
  } else if (updates.announcementText !== undefined) {
    merged.announcementText = updates.announcementText;
    merged.topBarAnnouncementText = updates.announcementText;
  }

  // Controlled deep merge for dbblBank:
  if (updates.dbblBank !== undefined) {
    merged.dbblBank = {
      ...(current.dbblBank || {
        bankName: '',
        accountHolderName: '',
        accountNumber: '',
        branchName: '',
        routingNumber: '',
        qrCodeUrl: '',
        instructions: '',
      }),
      ...updates.dbblBank,
    };
  }

  // Controlled deep merge for footer:
  if (updates.footer !== undefined) {
    merged.footer = {
      ...(current.footer || {}),
      ...updates.footer,
    };
    if (Array.isArray(updates.footer.courierPartners)) {
      merged.footer.courierPartners = [...updates.footer.courierPartners];
    }
    if (Array.isArray(updates.footer.acceptedPayments)) {
      merged.footer.acceptedPayments = [...updates.footer.acceptedPayments];
    }
  }

  // Controlled merge for blockedPhoneNumbers array:
  if (updates.blockedPhoneNumbers !== undefined) {
    merged.blockedPhoneNumbers = Array.isArray(updates.blockedPhoneNumbers)
      ? [...updates.blockedPhoneNumbers]
      : [];
  }

  // Controlled merge for courierWebhooks array (preserve stored secrets if client submits masked asterisks):
  if (updates.courierWebhooks !== undefined) {
    if (Array.isArray(updates.courierWebhooks)) {
      const existingMap = new Map<string, string>();
      if (Array.isArray(current.courierWebhooks)) {
        for (const w of current.courierWebhooks) {
          if (w.id && w.secret) {
            existingMap.set(w.id, w.secret);
          }
        }
      }
      merged.courierWebhooks = updates.courierWebhooks.map((w: any) => {
        let secret = w.secret;
        if (secret === '••••••••' || (typeof secret === 'string' && secret.startsWith('****')) || (secret === undefined && w.hasSecret)) {
          secret = existingMap.get(w.id) || undefined;
        }
        return {
          ...w,
          secret: secret ? String(secret).trim() : undefined,
        };
      });
    } else {
      merged.courierWebhooks = [];
    }
  }

  // Security constraint: Production courier API credentials must never be persisted into D1 store_settings
  delete (merged as any).steadfastApiKey;
  delete (merged as any).steadfastSecretKey;

  return merged;
}

export interface LegacyCourierCredentialsReport {
  hasLegacyCredentials: boolean;
  hasLegacyApiKey: boolean;
  hasLegacySecretKey: boolean;
  legacyApiKeyMasked?: string;
  legacySecretKeyMasked?: string;
}

/**
 * Detects whether legacy plaintext courier credentials exist in D1 store_settings table.
 * Does NOT return plaintext secrets. Used to advise administrators on migration to Worker Secrets.
 */
export async function detectLegacyD1CourierCredentials(db: D1Database): Promise<LegacyCourierCredentialsReport> {
  try {
    const row = await db
      .prepare('SELECT settings_json FROM store_settings WHERE id = "default" LIMIT 1')
      .first<StoreSettingsRow>();
    if (!row || !row.settings_json) {
      return { hasLegacyCredentials: false, hasLegacyApiKey: false, hasLegacySecretKey: false };
    }
    const parsed = JSON.parse(row.settings_json);
    const hasKey = typeof parsed.steadfastApiKey === 'string' && parsed.steadfastApiKey.trim().length > 0 && !parsed.steadfastApiKey.startsWith('••');
    const hasSecret = typeof parsed.steadfastSecretKey === 'string' && parsed.steadfastSecretKey.trim().length > 0 && !parsed.steadfastSecretKey.startsWith('••');
    return {
      hasLegacyCredentials: hasKey || hasSecret,
      hasLegacyApiKey: hasKey,
      hasLegacySecretKey: hasSecret,
      legacyApiKeyMasked: hasKey ? '••••••••' : undefined,
      legacySecretKeyMasked: hasSecret ? '••••••••' : undefined,
    };
  } catch (err) {
    console.error('Failed to inspect legacy credentials in D1:', err);
    return { hasLegacyCredentials: false, hasLegacyApiKey: false, hasLegacySecretKey: false };
  }
}

/**
 * Safely removes legacy courier credentials (steadfastApiKey, steadfastSecretKey) from D1 store_settings.
 * Should be called after Worker Secrets (STEADFAST_API_KEY, STEADFAST_SECRET_KEY) are configured.
 */
export async function cleanupLegacyCourierCredentialsFromD1(db: D1Database): Promise<{
  success: boolean;
  cleaned: boolean;
  message: string;
}> {
  const row = await db
    .prepare('SELECT settings_json FROM store_settings WHERE id = "default" LIMIT 1')
    .first<StoreSettingsRow>();
  if (!row || !row.settings_json) {
    return { success: true, cleaned: false, message: 'No store settings record found in D1.' };
  }
  try {
    const parsed = JSON.parse(row.settings_json);
    let changed = false;
    if ('steadfastApiKey' in parsed) {
      delete parsed.steadfastApiKey;
      changed = true;
    }
    if ('steadfastSecretKey' in parsed) {
      delete parsed.steadfastSecretKey;
      changed = true;
    }
    if (changed) {
      await db
        .prepare('UPDATE store_settings SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = "default"')
        .bind(JSON.stringify(parsed))
        .run();
      return {
        success: true,
        cleaned: true,
        message: 'Legacy courier credentials were safely removed from D1 settings.',
      };
    }
    return {
      success: true,
      cleaned: false,
      message: 'D1 store settings are already clean of legacy credentials.',
    };
  } catch (err: any) {
    console.error('Failed to cleanup legacy courier credentials in D1:', err);
    throw new Error('Failed to clean legacy courier credentials from D1.');
  }
}

export function parseStoreSettingsRow(row: { settings_json?: string } | null | undefined): StoreSettings {
  if (!row || !row.settings_json) {
    return INITIAL_SETTINGS;
  }

  try {
    const parsed = JSON.parse(row.settings_json);
    if (!parsed || typeof parsed !== 'object') {
      return INITIAL_SETTINGS;
    }
    const effectiveAnnouncement = parsed.topBarAnnouncementText !== undefined && parsed.topBarAnnouncementText !== null
      ? parsed.topBarAnnouncementText
      : (parsed.announcementText !== undefined && parsed.announcementText !== null ? parsed.announcementText : '');

    // D1 is authoritative. Return exact values stored in D1 without hardcoding fallbacks.
    return {
      ...INITIAL_SETTINGS,
      ...parsed,
      fbPixelId: parsed.fbPixelId !== undefined ? parsed.fbPixelId : (INITIAL_SETTINGS.fbPixelId || ''),
      fbTestEventCode: parsed.fbTestEventCode !== undefined ? parsed.fbTestEventCode : (INITIAL_SETTINGS.fbTestEventCode || ''),
      gtmId: parsed.gtmId !== undefined ? parsed.gtmId : (INITIAL_SETTINGS.gtmId || ''),
      tiktokPixelId: parsed.tiktokPixelId !== undefined ? parsed.tiktokPixelId : (INITIAL_SETTINGS.tiktokPixelId || ''),
      tiktokTestEventCode: parsed.tiktokTestEventCode !== undefined ? parsed.tiktokTestEventCode : (INITIAL_SETTINGS.tiktokTestEventCode || ''),
      trackingEnabled: parsed.trackingEnabled !== undefined ? parsed.trackingEnabled : INITIAL_SETTINGS.trackingEnabled,
      advancedMatchingEnabled: parsed.advancedMatchingEnabled !== undefined ? parsed.advancedMatchingEnabled : INITIAL_SETTINGS.advancedMatchingEnabled,
      trackingDebugMode: parsed.trackingDebugMode !== undefined ? parsed.trackingDebugMode : INITIAL_SETTINGS.trackingDebugMode,
      topBarAnnouncementText: effectiveAnnouncement,
      announcementText: effectiveAnnouncement,
      dbblBank: {
        ...INITIAL_SETTINGS.dbblBank,
        ...(parsed.dbblBank || {}),
      },
      footer: {
        ...INITIAL_SETTINGS.footer,
        ...(parsed.footer || {}),
        warrantyBadgeText:
          parsed.footer?.warrantyBadgeText === '7-Day Return & Replacement Warranty'
            ? ''
            : (parsed.footer?.warrantyBadgeText || ''),
        courierPartners: Array.isArray(parsed.footer?.courierPartners) && parsed.footer.courierPartners.length > 0
          ? parsed.footer.courierPartners
          : INITIAL_SETTINGS.footer.courierPartners,
      },
      blockedPhoneNumbers: Array.isArray(parsed.blockedPhoneNumbers)
        ? parsed.blockedPhoneNumbers
        : (INITIAL_SETTINGS.blockedPhoneNumbers || []),
      courierWebhooks: Array.isArray(parsed.courierWebhooks)
        ? parsed.courierWebhooks
        : (INITIAL_SETTINGS.courierWebhooks || []),
    };
  } catch (err) {
    console.error('Failed to parse settings_json from D1:', err);
    return INITIAL_SETTINGS;
  }
}

export async function getStoreSettings(db: D1Database): Promise<StoreSettings> {
  const row = await db
    .prepare('SELECT settings_json FROM store_settings WHERE id = "default" LIMIT 1')
    .first<StoreSettingsRow>();

  return parseStoreSettingsRow(row);
}

/**
 * Batches settings, categories, and sliders into a single D1 round-trip.
 * Drastically reduces homepage latency and eliminates 2 redundant round-trips.
 */
export async function getHomepageMetadata(db: D1Database): Promise<{
  settings: StoreSettings;
  categories: Category[];
  sliders: CarouselSlide[];
}> {
  const stmtSettings = db.prepare('SELECT settings_json FROM store_settings WHERE id = "default" LIMIT 1');
  const stmtCategories = db.prepare(`SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY name ASC`);
  const stmtSliders = db.prepare(`SELECT ${SLIDER_COLUMNS} FROM sliders ORDER BY sort_order ASC, created_at ASC`);

  let resSettings: any;
  let resCategories: any[] = [];
  let resSliders: any[] = [];

  if (typeof db.batch === 'function') {
    const batch = await db.batch<any>([stmtSettings, stmtCategories, stmtSliders]);
    resSettings = batch[0]?.results?.[0];
    resCategories = batch[1]?.results || [];
    resSliders = batch[2]?.results || [];
  } else {
    const [s, c, sl] = await Promise.all([
      stmtSettings.first<StoreSettingsRow>(),
      stmtCategories.all<CategoryRow>(),
      stmtSliders.all<SliderRow>(),
    ]);
    resSettings = s;
    resCategories = c.results || [];
    resSliders = sl.results || [];
  }

  const settings = parseStoreSettingsRow(resSettings);
  const categories = resCategories.map(rowToCategory);
  const sliders = resSliders.map(rowToSlider).filter((s) => s.isActive !== false);

  return { settings, categories, sliders };
}

/**
 * Batches lightweight sitemap categories and products in a single round-trip.
 * Strictly selects only the fields required for sitemap generation without loading the entire catalog into memory.
 */
export async function getSitemapData(db: D1Database): Promise<{
  categories: Array<{ id: string; slug: string }>;
  products: Array<{ id: string; slug?: string; status?: string; featured: boolean; createdAt: string }>;
}> {
  const availableColumns = await ensureProductTableSchema(db);
  const selectSlug = availableColumns.has('slug') ? 'slug, ' : '';

  const stmtCategories = db.prepare('SELECT id, slug FROM categories ORDER BY name ASC');
  const stmtProducts = db.prepare(`
    SELECT id, ${selectSlug}status, featured, created_at
    FROM products
    WHERE (status = 'active' OR status = 'published' OR status IS NULL OR status = '')
    ORDER BY created_at DESC
  `);

  let catRows: any[] = [];
  let prodRows: any[] = [];

  if (typeof db.batch === 'function') {
    const batch = await db.batch<any>([stmtCategories, stmtProducts]);
    catRows = batch[0]?.results || [];
    prodRows = batch[1]?.results || [];
  } else {
    const [cats, prods] = await Promise.all([
      stmtCategories.all<{ id: string; slug: string }>(),
      stmtProducts.all<any>(),
    ]);
    catRows = cats.results || [];
    prodRows = prods.results || [];
  }

  return {
    categories: catRows.map((r) => ({ id: r.id, slug: r.slug || r.id })),
    products: prodRows.map((r) => ({
      id: r.id,
      slug: (typeof r.slug === 'string' && r.slug.trim()) ? r.slug.trim() : undefined,
      status: r.status,
      featured: Boolean(r.featured),
      createdAt: r.created_at,
    })),
  };
}

export async function updateStoreSettingsInD1(db: D1Database, updates: Partial<StoreSettings>): Promise<StoreSettings> {
  // Never persist courier credentials into D1 settings_json
  const safeUpdates = { ...updates };
  delete (safeUpdates as any).steadfastApiKey;
  delete (safeUpdates as any).steadfastSecretKey;

  // 1. Read existing canonical settings from D1
  const current = await getStoreSettings(db);

  // 2. Controlled deep merge
  const merged = controlledMergeSettings(current, safeUpdates);
  delete (merged as any).steadfastApiKey;
  delete (merged as any).steadfastSecretKey;
  const settingsJson = JSON.stringify(merged);

  // 3. Persist to Cloudflare D1 with atomic UPSERT (eliminates 3 redundant queries)
  const res = await db
    .prepare(
      `INSERT INTO store_settings (id, settings_json, updated_at)
       VALUES ('default', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         settings_json = excluded.settings_json,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(settingsJson)
    .run();

  if (res.success === false) {
    console.error('Failed to execute UPSERT on store_settings table:', res.error);
    throw new Error('Failed to update store settings.');
  }

  return merged;
}

// Media assets persistence in Cloudflare D1 media_assets table
export async function saveMediaAssetInD1(
  db: D1Database,
  id: string,
  contentType: string,
  dataBase64: string,
  size: number
): Promise<void> {
  if (!db) {
    throw new Error('Database connection is not available for media persistence.');
  }
  const cleanId = (id || '').trim();
  if (!cleanId) {
    throw new Error('Media asset ID cannot be empty.');
  }
  const res = await db
    .prepare(`
      INSERT OR REPLACE INTO media_assets (id, content_type, data, size, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(cleanId, contentType, dataBase64, size)
    .run();
  if (!res || res.success === false) {
    throw new Error((res && res.error) || 'Failed to save media asset in D1.');
  }
}

export async function getMediaAssetFromD1(
  db: D1Database,
  id: string
): Promise<{ contentType: string; dataBase64: string } | null> {
  try {
    const row = await db
      .prepare('SELECT content_type, data FROM media_assets WHERE id = ? LIMIT 1')
      .bind(id)
      .first<{ content_type: string; data: string }>();

    if (!row) return null;
    return {
      contentType: row.content_type || 'image/jpeg',
      dataBase64: row.data,
    };
  } catch {
    return null;
  }
}

export async function mediaAssetExistsInD1(
  db: D1Database,
  id: string
): Promise<boolean> {
  const cleanId = (id || '').trim();
  if (!cleanId) return false;
  try {
    const row = await db
      .prepare('SELECT id FROM media_assets WHERE id = ? LIMIT 1')
      .bind(cleanId)
      .first<{ id: string }>();
    return Boolean(row);
  } catch {
    return false;
  }
}

export const D1_BLOB_CHUNK_SIZE = 768 * 1024; // 768 KB safe ceiling per D1 statement/row

/**
 * High-performance, zero-OOM binary-to-base64 encoder.
 * Eliminates character-by-character string concatenations causing Worker memory spikes.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  const CHUNK_SIZE = 0x8000; // 32 KB chunking avoids stack overflow & V8 GC spikes
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * High-performance, memory-efficient base64-to-Uint8Array decoder.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Persists customer & admin review photos directly in Cloudflare D1 as binary BLOBs.
 * Atomically chunks blobs exceeding 768KB into indexed sub-rows to respect SQLite D1 limits.
 * Catches and rolls back partially inserted chunks if any write fails.
 */
export async function saveReviewImageBlobInD1(
  db: D1Database,
  id: string,
  reviewId: string | null,
  productId: string,
  mimeType: string,
  buffer: ArrayBuffer | Uint8Array
): Promise<void> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const totalSize = bytes.byteLength;
  const numChunks = Math.max(1, Math.ceil(totalSize / D1_BLOB_CHUNK_SIZE));
  const insertedIds: string[] = [];

  try {
    if (numChunks === 1) {
      const payloadBuffer =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes.buffer
          : bytes.slice().buffer;
      const res = await db
        .prepare(
          `INSERT INTO review_images (id, review_id, product_id, mime_type, file_size, data)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(id, reviewId, productId, mimeType, totalSize, payloadBuffer)
        .run();
      if (res.success === false) {
        throw new Error(res.error || 'Failed to insert review image blob into D1.');
      }
      insertedIds.push(id);
    } else {
      for (let i = 0; i < numChunks; i++) {
        const chunkId = i === 0 ? id : `${id}_chunk_${i}`;
        const start = i * D1_BLOB_CHUNK_SIZE;
        const end = Math.min(start + D1_BLOB_CHUNK_SIZE, totalSize);
        const chunkBytes = bytes.slice(start, end);
        const res = await db
          .prepare(
            `INSERT INTO review_images (id, review_id, product_id, mime_type, file_size, data)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(chunkId, reviewId, productId, mimeType, totalSize, chunkBytes.buffer)
          .run();
        if (res.success === false) {
          throw new Error(res.error || `Failed to insert chunk ${i} of review image.`);
        }
        insertedIds.push(chunkId);
      }
    }
  } catch (err: any) {
    if (insertedIds.length > 0) {
      try {
        for (const inserted of insertedIds) {
          await db.prepare('DELETE FROM review_images WHERE id = ?').bind(inserted).run();
        }
      } catch (rollbackErr) {
        console.error('[D1 Rollback Error] Failed to delete orphaned chunks:', rollbackErr);
      }
    }
    throw err;
  }
}

/**
 * Retrieves and reassembles a review image from D1 binary BLOB storage.
 * Performs a LEFT JOIN on the parent reviews table to verify review moderation status.
 * Supports transparent single-row retrieval and multi-chunk reassembly.
 */
export async function getReviewImageBlobFromD1(
  db: D1Database,
  id: string
): Promise<{
  mimeType: string;
  fileSize: number;
  data: Uint8Array;
  reviewStatus: string | null;
  reviewId: string | null;
} | null> {
  try {
    const rows = await db
      .prepare(
        `SELECT ri.id, ri.review_id, ri.mime_type, ri.file_size, ri.data, r.status AS review_status
         FROM review_images ri
         LEFT JOIN reviews r ON ri.review_id = r.id
         WHERE ri.id = ? OR ri.id LIKE ?
         ORDER BY ri.id ASC`
      )
      .bind(id, `${id}_chunk_%`)
      .all<{
        id: string;
        review_id: string | null;
        mime_type: string;
        file_size: number;
        data: any;
        review_status: string | null;
      }>();

    if (!rows.results || rows.results.length === 0) return null;

    const first = rows.results[0];
    const mimeType = first.mime_type || 'image/jpeg';
    const totalFileSize = Number(first.file_size) || 0;
    const reviewStatus = first.review_status ?? null;
    const reviewId = first.review_id ?? null;

    const toUint8Array = (raw: any): Uint8Array => {
      if (raw instanceof Uint8Array) return raw;
      if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
      if (Array.isArray(raw)) return new Uint8Array(raw);
      if (typeof raw === 'string') {
        return base64ToUint8Array(raw);
      }
      return new Uint8Array(0);
    };

    if (rows.results.length === 1) {
      const data = toUint8Array(first.data);
      return { mimeType, fileSize: totalFileSize || data.byteLength, data, reviewStatus, reviewId };
    }

    const sorted = rows.results.slice().sort((a, b) => {
      if (a.id === id) return -1;
      if (b.id === id) return 1;
      const numA = parseInt(a.id.replace(`${id}_chunk_`, ''), 10) || 0;
      const numB = parseInt(b.id.replace(`${id}_chunk_`, ''), 10) || 0;
      return numA - numB;
    });

    const chunkArrays = sorted.map((r) => toUint8Array(r.data));
    const combinedLength = chunkArrays.reduce((sum, c) => sum + c.byteLength, 0);
    const combined = new Uint8Array(combinedLength);
    let offset = 0;
    for (const c of chunkArrays) {
      combined.set(c, offset);
      offset += c.byteLength;
    }

    return { mimeType, fileSize: totalFileSize || combined.byteLength, data: combined, reviewStatus, reviewId };
  } catch (err) {
    console.warn('[D1 Review Image Fetch Error]:', err);
    return null;
  }
}

export async function deleteReviewImageFromD1(
  db: D1Database,
  id: string
): Promise<void> {
  try {
    await db.prepare('DELETE FROM review_images WHERE id = ? OR id LIKE ?').bind(id, `${id}_chunk_%`).run();
  } catch {}
}

// ==============================================================
// 5. COUPONS / VOUCHERS DATABASE OPERATIONS
// ==============================================================

export function rowToCoupon(row: CouponRow): Coupon {
  return {
    code: row.code,
    discountType: row.discount_type as any,
    discountValue: Number(row.discount_value) || 0,
    minSpend: row.min_spend != null ? Number(row.min_spend) : undefined,
    description: row.description || '',
    isActive: Boolean(row.is_active),
  };
}

export async function getAllCoupons(db: D1Database, activeOnly: boolean = false): Promise<Coupon[]> {
  const query = activeOnly
    ? `SELECT ${COUPON_COLUMNS} FROM coupons WHERE is_active = 1 ORDER BY code ASC`
    : `SELECT ${COUPON_COLUMNS} FROM coupons ORDER BY code ASC`;
  const result = await db.prepare(query).all<CouponRow>();
  return (result.results || []).map(rowToCoupon);
}

export async function insertCoupon(db: D1Database, coupon: Coupon): Promise<Coupon> {
  const code = coupon.code.toUpperCase().trim();

  const existing = await db.prepare('SELECT code FROM coupons WHERE code = ?').bind(code).first();
  if (existing) {
    return updateCouponInD1(db, code, coupon);
  }

  await db
    .prepare(`
      INSERT INTO coupons (code, discount_type, discount_value, min_spend, description, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(
      code,
      coupon.discountType,
      Number(coupon.discountValue) || 0,
      coupon.minSpend != null ? Number(coupon.minSpend) : null,
      coupon.description || '',
      coupon.isActive ? 1 : 0
    )
    .run();

  const row = await db.prepare(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE code = ?`).bind(code).first<CouponRow>();
  if (!row) throw new Error('Failed to retrieve inserted coupon');
  return rowToCoupon(row);
}

export async function getCouponByCode(db: D1Database, code: string): Promise<Coupon | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const row = await db.prepare(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE UPPER(code) = ? LIMIT 1`).bind(clean).first<CouponRow>();
  return row ? rowToCoupon(row) : null;
}

export async function updateCouponInD1(db: D1Database, code: string, updates: Partial<Coupon>): Promise<Coupon> {
  const existing = await db.prepare(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE code = ?`).bind(code).first<CouponRow>();
  if (!existing) throw new Error('Coupon not found.');

  const current = rowToCoupon(existing);
  const discountType = updates.discountType ?? current.discountType;
  const discountValue = updates.discountValue != null ? Number(updates.discountValue) : current.discountValue;
  const minSpend = updates.minSpend !== undefined ? (updates.minSpend != null ? Number(updates.minSpend) : null) : (current.minSpend ?? null);
  const description = updates.description ?? current.description;
  const isActive = updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : (current.isActive ? 1 : 0);

  await db
    .prepare(`
      UPDATE coupons SET
        discount_type = ?,
        discount_value = ?,
        min_spend = ?,
        description = ?,
        is_active = ?
      WHERE code = ?
    `)
    .bind(discountType, discountValue, minSpend, description, isActive, code)
    .run();

  const row = await db.prepare(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE code = ?`).bind(code).first<CouponRow>();
  if (!row) throw new Error('Failed to retrieve updated coupon');
  return rowToCoupon(row);
}

export async function deleteCouponFromD1(db: D1Database, code: string): Promise<boolean> {
  const res = await db.prepare('DELETE FROM coupons WHERE code = ?').bind(code).run();
  return res.success;
}

// ==============================================================
// 6. PRODUCT REVIEWS DATABASE OPERATIONS
// ==============================================================

let cachedReviewTableColumns: Set<string> | null = null;

export async function getReviewTableColumns(db: D1Database): Promise<Set<string>> {
  if (cachedReviewTableColumns && cachedReviewTableColumns.size > 0) {
    return cachedReviewTableColumns;
  }
  try {
    const res = await db.prepare("SELECT name FROM pragma_table_info('reviews')").all<{ name: string }>();
    if (res.results && res.results.length > 0) {
      cachedReviewTableColumns = new Set(res.results.map((r) => r.name.toLowerCase()));
      return cachedReviewTableColumns;
    }
  } catch (err) {
    console.warn('[D1] Could not query pragma_table_info for reviews:', err);
  }
  return new Set([
    'id', 'product_id', 'author_name', 'rating', 'comment', 'verified_purchase',
    'status', 'source', 'approved_at', 'approved_by', 'updated_at', 'images_json', 'created_at'
  ]);
}

export async function ensureReviewTableSchema(db: D1Database): Promise<Set<string>> {
  let columns = await getReviewTableColumns(db);

  if (!columns.has('status')) {
    try {
      await db.prepare("ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'").run();
      cachedReviewTableColumns = null;
    } catch {}
  }
  if (!columns.has('source')) {
    try {
      await db.prepare("ALTER TABLE reviews ADD COLUMN source TEXT NOT NULL DEFAULT 'customer'").run();
      cachedReviewTableColumns = null;
    } catch {}
  }
  if (!columns.has('approved_at')) {
    try {
      await db.prepare('ALTER TABLE reviews ADD COLUMN approved_at TEXT').run();
      cachedReviewTableColumns = null;
    } catch {}
  }
  if (!columns.has('approved_by')) {
    try {
      await db.prepare('ALTER TABLE reviews ADD COLUMN approved_by TEXT').run();
      cachedReviewTableColumns = null;
    } catch {}
  }
  if (!columns.has('updated_at')) {
    try {
      await db.prepare('ALTER TABLE reviews ADD COLUMN updated_at TEXT').run();
      cachedReviewTableColumns = null;
    } catch {}
  }
  if (!columns.has('images_json')) {
    try {
      await db.prepare("ALTER TABLE reviews ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]'").run();
      cachedReviewTableColumns = null;
    } catch {}
  }

  return getReviewTableColumns(db);
}

export function rowToReview(row: ReviewRow): ProductReview {
  let images: string[] = [];
  try {
    if (row.images_json) {
      const parsed = JSON.parse(row.images_json);
      if (Array.isArray(parsed)) {
        images = parsed.filter((img) => typeof img === 'string' && img.trim().length > 0);
      }
    }
  } catch {}

  const rawStatus = (row.status || '').toLowerCase().trim();
  const status: ReviewStatus = rawStatus === 'approved' || rawStatus === 'rejected' || rawStatus === 'pending'
    ? (rawStatus as ReviewStatus)
    : (row.status ? 'pending' : 'approved');

  const rawSource = String(row.source || '').toLowerCase().trim();
  const validSources: ReviewSource[] = ['admin', 'manual', 'whatsapp', 'facebook', 'messenger', 'instagram', 'customer'];
  const source: ReviewSource = validSources.includes(rawSource as ReviewSource)
    ? (rawSource as ReviewSource)
    : 'customer';

  return {
    id: row.id,
    productId: row.product_id,
    authorName: row.author_name,
    author: row.author_name,
    rating: Number(row.rating) || 5,
    comment: row.comment,
    verifiedPurchase: Boolean(row.verified_purchase),
    status,
    source,
    approvedAt: row.approved_at || undefined,
    approvedBy: row.approved_by || undefined,
    updatedAt: row.updated_at || undefined,
    images: images.length > 0 ? images : undefined,
    imagesJson: row.images_json || '[]',
    createdAt: row.created_at,
    date: row.created_at ? new Date(row.created_at).toLocaleDateString('en-GB') : undefined,
  };
}

export interface ReviewQueryFilter {
  productId?: string;
  status?: string;
  includeAllStatus?: boolean;
  limit?: number;
  offset?: number;
}

export async function getAllReviews(
  db: D1Database,
  filter?: ReviewQueryFilter | string
): Promise<ProductReview[]> {
  await ensureReviewTableSchema(db);

  let productId: string | undefined;
  let status: string | undefined;
  let includeAllStatus = false;

  if (typeof filter === 'string') {
    productId = filter;
  } else if (filter && typeof filter === 'object') {
    productId = filter.productId;
    status = filter.status;
    includeAllStatus = Boolean(filter.includeAllStatus);
  }

  let whereClauses: string[] = [];
  const bindings: any[] = [];

  if (productId) {
    whereClauses.push('product_id = ?');
    bindings.push(productId);
  }

  if (status && status !== 'all') {
    whereClauses.push('status = ?');
    bindings.push(status);
  } else if (!includeAllStatus && !status) {
    // Public default: ONLY show approved reviews
    whereClauses.push("status = 'approved'");
  }

  const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `SELECT * FROM reviews${whereSql} ORDER BY created_at DESC`;

  const stmt = db.prepare(query);
  const bound = bindings.length > 0 ? stmt.bind(...bindings) : stmt;
  const result = await bound.all<ReviewRow>();

  return (result.results || []).map(rowToReview);
}

export async function getReviewById(db: D1Database, id: string): Promise<ProductReview | null> {
  await ensureReviewTableSchema(db);
  const row = await db.prepare('SELECT * FROM reviews WHERE id = ? LIMIT 1').bind(id).first<ReviewRow>();
  return row ? rowToReview(row) : null;
}

/**
 * Derives product ratings and reviews count STRICTLY from approved reviews in D1.
 * Unapproved (pending) and rejected reviews are never counted towards public stats.
 */
export async function recalculateProductRatingFromApprovedReviews(
  db: D1Database,
  productId: string
): Promise<{ rating: number; reviewsCount: number }> {
  const cleanId = (productId || '').trim();
  if (!cleanId) return { rating: 5.0, reviewsCount: 0 };

  try {
    await ensureReviewTableSchema(db);

    const stats = await db
      .prepare(`
        SELECT
          COUNT(id) AS total_count,
          AVG(rating) AS avg_rating
        FROM reviews
        WHERE product_id = ? AND status = 'approved'
      `)
      .bind(cleanId)
      .first<{ total_count: number; avg_rating: number | null }>();

    const reviewsCount = stats && Number.isFinite(Number(stats.total_count)) ? Number(stats.total_count) : 0;
    const rawAvg = stats && stats.avg_rating != null ? Number(stats.avg_rating) : 5.0;
    const rating = reviewsCount > 0 ? Math.round(rawAvg * 10) / 10 : 5.0;

    await db
      .prepare(`
        UPDATE products
        SET rating = ?, reviews_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(rating, reviewsCount, cleanId)
      .run();

    return { rating, reviewsCount };
  } catch (err) {
    console.warn('[D1 recalculateProductRatingFromApprovedReviews Error]:', err);
    return { rating: 5.0, reviewsCount: 0 };
  }
}

export async function insertReview(db: D1Database, input: any): Promise<ProductReview> {
  const availableColumns = await ensureReviewTableSchema(db);

  const id = input.id || `rev-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
  const productId = input.productId;
  const authorName = (input.authorName || input.author || 'Customer').trim();
  const rating = Math.min(5, Math.max(1, Math.round(Number(input.rating) || 5)));
  const comment = (input.comment || '').trim();
  const verifiedPurchase = input.verifiedPurchase === true ? 1 : 0;

  const rawStatus = (input.status || '').toLowerCase().trim();
  const status: ReviewStatus = rawStatus === 'approved' || rawStatus === 'rejected' || rawStatus === 'pending'
    ? (rawStatus as ReviewStatus)
    : 'pending';

  const rawInputSource = String(input.source || '').toLowerCase().trim();
  const validInsertSources: ReviewSource[] = ['admin', 'manual', 'whatsapp', 'facebook', 'messenger', 'instagram', 'customer'];
  const source: ReviewSource = validInsertSources.includes(rawInputSource as ReviewSource)
    ? (rawInputSource as ReviewSource)
    : 'customer';
  const createdAt = input.createdAt || new Date().toISOString();
  const approvedAt = status === 'approved' ? (input.approvedAt || createdAt) : null;
  const approvedBy = status === 'approved' ? (input.approvedBy || (source === 'admin' ? 'admin' : 'system')) : null;

  let imagesJson = '[]';
  const rawImagesList = Array.isArray(input.images)
    ? input.images
    : (typeof input.imagesJson === 'string'
      ? (() => { try { return JSON.parse(input.imagesJson); } catch { return []; } })()
      : []);
  if (Array.isArray(rawImagesList)) {
    const validImgs: string[] = [];
    for (const img of rawImagesList.slice(0, 5)) {
      const sanitized = sanitizeReviewImageReference(img);
      if (sanitized) validImgs.push(sanitized);
    }
    imagesJson = JSON.stringify(validImgs);
  }

  const candidateFields = [
    { col: 'id', val: id },
    { col: 'product_id', val: productId },
    { col: 'author_name', val: authorName },
    { col: 'rating', val: rating },
    { col: 'comment', val: comment },
    { col: 'verified_purchase', val: verifiedPurchase },
    { col: 'status', val: status },
    { col: 'source', val: source },
    { col: 'approved_at', val: approvedAt },
    { col: 'approved_by', val: approvedBy },
    { col: 'images_json', val: imagesJson },
    { col: 'created_at', val: createdAt },
  ];

  const activeFields = candidateFields.filter((f) => availableColumns.has(f.col));
  const colNames = [...activeFields.map((f) => f.col), 'updated_at'].join(', ');
  const placeholders = [...activeFields.map(() => '?'), 'CURRENT_TIMESTAMP'].join(', ');
  const bindings = activeFields.map((f) => f.val);

  await db
    .prepare(`INSERT INTO reviews (${colNames}) VALUES (${placeholders})`)
    .bind(...bindings)
    .run();

  // If created directly in approved status, update product rating & review count
  if (status === 'approved') {
    await recalculateProductRatingFromApprovedReviews(db, productId);
  }

  const row = await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(id).first<ReviewRow>();
  if (!row) throw new Error('Failed to retrieve inserted review');
  return rowToReview(row);
}

export async function updateReviewInD1(
  db: D1Database,
  id: string,
  updates: {
    status?: ReviewStatus;
    approvedBy?: string;
    comment?: string;
    rating?: number;
    authorName?: string;
    images?: string[];
    verifiedPurchase?: boolean;
  }
): Promise<ProductReview | null> {
  const availableColumns = await ensureReviewTableSchema(db);

  const existing = await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(id).first<ReviewRow>();
  if (!existing) return null;

  const newStatus = updates.status !== undefined ? updates.status : (existing.status as ReviewStatus || 'pending');
  const now = new Date().toISOString();
  let approvedAt = existing.approved_at;
  let approvedBy = existing.approved_by;

  if (updates.status === 'approved' && existing.status !== 'approved') {
    approvedAt = now;
    approvedBy = updates.approvedBy || 'admin';
  } else if (updates.status === 'rejected' || updates.status === 'pending') {
    approvedAt = null;
    approvedBy = null;
  }

  const comment = updates.comment !== undefined ? updates.comment.trim() : existing.comment;
  const rating = updates.rating !== undefined ? Math.min(5, Math.max(1, Math.round(Number(updates.rating)))) : existing.rating;
  const authorName = updates.authorName !== undefined ? updates.authorName.trim() : existing.author_name;
  let imagesJson = existing.images_json || '[]';
  if (updates.images !== undefined && Array.isArray(updates.images)) {
    const validImgs: string[] = [];
    for (const img of updates.images.slice(0, 5)) {
      const sanitized = sanitizeReviewImageReference(img);
      if (sanitized) validImgs.push(sanitized);
    }
    imagesJson = JSON.stringify(validImgs);
  }
  const verifiedPurchase = updates.verifiedPurchase !== undefined
    ? (updates.verifiedPurchase ? 1 : 0)
    : existing.verified_purchase;

  const candidateUpdates: { col: string; val: any }[] = [
    { col: 'status', val: newStatus },
    { col: 'approved_at', val: approvedAt },
    { col: 'approved_by', val: approvedBy },
    { col: 'comment', val: comment },
    { col: 'rating', val: rating },
    { col: 'author_name', val: authorName },
    { col: 'images_json', val: imagesJson },
    { col: 'verified_purchase', val: verifiedPurchase },
  ];

  const activeUpdates = candidateUpdates.filter((u) => availableColumns.has(u.col));
  const setClauses = [...activeUpdates.map((u) => `${u.col} = ?`), 'updated_at = CURRENT_TIMESTAMP'].join(', ');
  const bindings = [...activeUpdates.map((u) => u.val), id];

  await db
    .prepare(`UPDATE reviews SET ${setClauses} WHERE id = ?`)
    .bind(...bindings)
    .run();

  // Recalculate product rating strictly from approved reviews!
  await recalculateProductRatingFromApprovedReviews(db, existing.product_id);

  const updatedRow = await db.prepare('SELECT * FROM reviews WHERE id = ?').bind(id).first<ReviewRow>();
  return updatedRow ? rowToReview(updatedRow) : null;
}

/**
 * Server-authoritative purchase verification.
 * Strictly verifies whether an identity legitimately owns a valid order containing the product.
 * - Authenticated: verified strictly against server-authenticated userId and/or auth email.
 * - Unauthenticated guest: email alone can NEVER grant verified status. Requires strong proof (orderNumber + phone).
 */
export async function verifyCustomerPurchaseInD1(
  db: D1Database,
  params: {
    authenticatedUserId?: string | null;
    authenticatedEmail?: string | null;
    guestOrderNumber?: string | null;
    guestPhone?: string | null;
    productId: string;
  }
): Promise<boolean> {
  const cleanProdId = (params.productId || '').trim();
  if (!cleanProdId) return false;

  const authUserId = (params.authenticatedUserId || '').trim();
  const authEmail = (params.authenticatedEmail || '').trim().toLowerCase();
  const guestOrderNo = (params.guestOrderNumber || '').trim();
  const guestPhone = (params.guestPhone || '').replace(/\D/g, '');

  let whereClauses: string[] = [];
  let bindings: any[] = [];

  if (authUserId || authEmail) {
    // Authenticated customer: strictly verify by server-side authenticated identity
    const identityClauses: string[] = [];
    if (authUserId) {
      identityClauses.push('user_id = ?');
      bindings.push(authUserId);
    }
    if (authEmail) {
      identityClauses.push('LOWER(user_email) = ?');
      bindings.push(authEmail);
    }
    whereClauses.push(`(${identityClauses.join(' OR ')})`);
  } else if (guestOrderNo && guestPhone.length === 11) {
    // Guest customer: strictly requires BOTH order number AND exact 11-digit phone proof
    whereClauses.push('(order_number = ? AND customer_phone LIKE ?)');
    bindings.push(guestOrderNo, `%${guestPhone.slice(-11)}%`);
  } else {
    // Unauthenticated without strong proof: client email alone can NEVER verify a purchase
    return false;
  }

  // Business rules: order must not be cancelled, and must contain the product
  whereClauses.push("shipping_status != 'Cancelled'");
  whereClauses.push('items_json LIKE ?');
  bindings.push(`%${cleanProdId}%`);

  const sql = `
    SELECT id, items_json FROM orders
    WHERE ${whereClauses.join(' AND ')}
    LIMIT 10
  `;

  try {
    const res = await db.prepare(sql).bind(...bindings).all<{ id: string; items_json: string }>();
    const orders = res.results || [];
    for (const ord of orders) {
      try {
        const items = JSON.parse(ord.items_json || '[]');
        if (Array.isArray(items)) {
          const hasItem = items.some((it: any) =>
            it?.product?.id === cleanProdId ||
            it?.product?.slug === cleanProdId ||
            it?.id === cleanProdId ||
            it?.productId === cleanProdId
          );
          if (hasItem) return true;
        }
      } catch {}
    }
    return false;
  } catch (err) {
    console.error('[D1 verifyCustomerPurchaseInD1 Error]:', err);
    return false;
  }
}

export async function deleteReviewFromD1(db: D1Database, id: string): Promise<boolean> {
  const existing = await db.prepare('SELECT product_id FROM reviews WHERE id = ?').bind(id).first<{ product_id: string }>();
  // Atomically delete associated binary review image blobs and sub-chunks
  try {
    await db.prepare('DELETE FROM review_images WHERE review_id = ?').bind(id).run();
  } catch (imgErr) {
    console.warn('[D1 Review Image Purge Warning]:', imgErr);
  }
  const res = await db.prepare('DELETE FROM reviews WHERE id = ?').bind(id).run();
  if (existing && existing.product_id) {
    await recalculateProductRatingFromApprovedReviews(db, existing.product_id);
  }
  return res.success;
}

// ==============================================================
// 7. USERS DATABASE OPERATIONS (SECURE HASHING & SANITIZATION)
// ==============================================================

export function rowToUser(row: UserRow): UserAccount {
  let permissions: any = undefined;
  if (row.role === 'super_admin') {
    const granular = resolveUserPermissions('super_admin', null);
    permissions = {
      canManageOrders: true,
      canManageProducts: true,
      canManageCategories: true,
      canManageAccounts: true,
      canManageSettings: true,
      ...granular,
    };
  } else if (row.role === 'customer') {
    permissions = undefined;
  } else {
    const granular = resolveUserPermissions(row.role, row.permissions_json);
    const legacy = generateLegacyPermissionFlags(granular);
    permissions = {
      ...legacy,
      ...granular,
    };
  }

  // Never leak password or password hash to frontend
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: (row.role as any) || 'customer',
    permissions,
    phone: row.phone || undefined,
    address: row.address || undefined,
    district: row.district || undefined,
    deliveryZone: (row.delivery_zone as any) || undefined,
    createdAt: row.created_at,
  };
}

export async function getAllUsers(db: D1Database): Promise<UserAccount[]> {
  const result = await db.prepare('SELECT * FROM users ORDER BY created_at ASC').all<UserRow>();
  return (result.results || []).map(rowToUser);
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  const query = 'SELECT * FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1';
  return db.prepare(query).bind(clean).first<UserRow>();
}

export async function getUserByEmailOrUsername(db: D1Database, identifier: string): Promise<UserRow | null> {
  const trimmed = (identifier || '').trim();
  if (!trimmed) return null;
  const cleanEmail = trimmed.toLowerCase();
  // Identity Lookup Hardening: Match exclusively on unique identifiers (email or user ID).
  // Non-unique display names ('name' column) are strictly excluded to prevent account selection ambiguity.
  const query = 'SELECT * FROM users WHERE LOWER(TRIM(email)) = ? OR id = ? LIMIT 1';
  return db.prepare(query).bind(cleanEmail, trimmed).first<UserRow>();
}

export async function insertUser(db: D1Database, input: any): Promise<UserAccount> {
  const id = input.id || `user-${Date.now()}`;

  const existing = await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (existing) {
    return updateUserInD1(db, id, input);
  }

  const name = (input.name || 'User').trim();
  const email = (input.email || '').toLowerCase().trim();
  // Hash password if supplied
  const password = input.password ? await hashPassword(input.password) : null;
  const role = input.role || 'customer';
  const permissions = input.permissions ? JSON.stringify(input.permissions) : null;
  const phone = input.phone || null;
  const address = input.address || null;
  const district = input.district || null;
  const deliveryZone = input.deliveryZone || 'inside_dhaka';
  const createdAt = input.createdAt || new Date().toISOString();

  await db
    .prepare(`
      INSERT INTO users (
        id, name, email, password, role, permissions_json, phone, address, district, delivery_zone, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(id, name, email, password, role, permissions, phone, address, district, deliveryZone, createdAt)
    .run();

  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!row) throw new Error('Failed to retrieve inserted user');
  return rowToUser(row);
}

export async function updateUserInD1(db: D1Database, id: string, updates: Partial<UserAccount> & { password?: string }): Promise<UserAccount> {
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!existing) throw new Error('User not found.');

  const current = rowToUser(existing);
  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  const email = updates.email !== undefined ? updates.email.toLowerCase().trim() : current.email;
  // Hash new password if updated
  const password = updates.password ? await hashPassword(updates.password) : (existing.password || null);
  const role = updates.role ?? current.role;
  let permissions = updates.permissions !== undefined ? (updates.permissions === null ? null : JSON.stringify(updates.permissions)) : existing.permissions_json;
  if (role === 'customer') {
    permissions = null;
  }
  const phone = updates.phone !== undefined ? updates.phone : (current.phone || null);
  const address = updates.address !== undefined ? updates.address : (current.address || null);
  const district = updates.district !== undefined ? updates.district : (current.district || null);
  const deliveryZone = updates.deliveryZone !== undefined ? updates.deliveryZone : (current.deliveryZone || 'inside_dhaka');

  await db
    .prepare(`
      UPDATE users SET
        name = ?,
        email = ?,
        password = ?,
        role = ?,
        permissions_json = ?,
        phone = ?,
        address = ?,
        district = ?,
        delivery_zone = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(name, email, password, role, permissions, phone, address, district, deliveryZone, id)
    .run();

  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!row) throw new Error('Failed to retrieve updated user');
  return rowToUser(row);
}

export async function updateUserPasswordInD1(db: D1Database, id: string, newPasswordPlain: string): Promise<boolean> {
  try {
    const hashedPassword = await hashPassword(newPasswordPlain);
    const res = await db
      .prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(hashedPassword, id)
      .run();

    const changes = res.meta?.changes ?? (res as any)?.changes ?? (res as any)?.meta?.rows_written;
    if (changes !== undefined && changes !== null) {
      return Boolean(res.success && changes > 0);
    }
    return Boolean(res.success);
  } catch (err) {
    console.error('Database error in updateUserPasswordInD1:', err);
    return false;
  }
}

export async function unclaimPasswordResetToken(db: D1Database, tokenId: string): Promise<void> {
  try {
    await db
      .prepare('UPDATE password_reset_tokens SET used_at = NULL WHERE id = ?')
      .bind(tokenId)
      .run();
  } catch (err) {
    console.error('Error unclaiming reset token in D1:', err);
  }
}

export async function deleteUserFromD1(db: D1Database, id: string): Promise<boolean> {
  try {
    // Safely clear any pending password reset tokens for this user first
    try {
      await db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(id).run();
    } catch (tokenErr) {
      console.warn('Notice: Non-fatal error cleaning password reset tokens for user:', tokenErr);
    }

    const res = await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    const changes = res.meta?.changes ?? (res as any)?.changes ?? (res as any)?.meta?.rows_written;
    if (changes !== undefined && changes !== null) {
      return Boolean(res.success && changes > 0);
    }
    return Boolean(res.success);
  } catch (err) {
    console.error('Database error in deleteUserFromD1:', err);
    return false;
  }
}

// ==============================================================
// 7.1 PASSWORD RESET TOKENS (SECURE HASHED STORAGE)
// ==============================================================

export async function createPasswordResetToken(
  db: D1Database,
  userId: string,
  tokenHash: string,
  expiresAt: number
): Promise<void> {
  // Security Hardening: Use cryptographically secure randomUUID for token record identifier
  const tokenRecordRand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const id = `prt-${Date.now()}-${tokenRecordRand}`;
  const now = Date.now();
  // Invalidate any previous unused reset tokens for this user so only the newest token is active
  try {
    await db
      .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
      .bind(now, userId)
      .run();
  } catch {}

  await db
    .prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `)
    .bind(id, userId, tokenHash, expiresAt, now)
    .run();
}

export async function getPasswordResetToken(
  db: D1Database,
  tokenHash: string
): Promise<PasswordResetTokenRow | null> {
  const row = await db
    .prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ? LIMIT 1')
    .bind(tokenHash)
    .first<PasswordResetTokenRow>();
  return row || null;
}

/**
 * Atomically claims an unexpired, unused password reset token.
 * Prevents race conditions where concurrent requests try to use the same token.
 * Uses atomic UPDATE with used_at IS NULL AND expires_at > now.
 * Returns { success: true, tokenRecord } ONLY IF exactly 1 row was successfully updated.
 */
export async function claimPasswordResetToken(
  db: D1Database,
  tokenHash: string
): Promise<{ success: boolean; tokenRecord?: PasswordResetTokenRow | null }> {
  const now = Date.now();

  // 1. Try atomic claim with RETURNING clause in SQLite / D1
  try {
    const claimed = await db
      .prepare(
        'UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING id, user_id, token_hash, expires_at, used_at, created_at'
      )
      .bind(now, tokenHash, now)
      .first<PasswordResetTokenRow>();

    if (claimed && claimed.id) {
      return { success: true, tokenRecord: claimed };
    }
  } catch {
    // If the D1 driver or simulation does not support RETURNING, fall back to atomic UPDATE + changes check
  }

  // 2. Atomic UPDATE ensuring single-use and expiration constraints
  const res = await db
    .prepare(
      'UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?'
    )
    .bind(now, tokenHash, now)
    .run();

  const changes = res.meta?.changes ?? (res as any).changes ?? res.meta?.rows_written ?? 0;
  if (changes !== 1) {
    // Zero rows were updated: token is already used, expired, or invalid.
    return { success: false, tokenRecord: null };
  }

  // The token was uniquely claimed by this request. Retrieve the record.
  const tokenRecord = await db
    .prepare('SELECT id, user_id, token_hash, expires_at, used_at, created_at FROM password_reset_tokens WHERE token_hash = ? AND used_at = ? LIMIT 1')
    .bind(tokenHash, now)
    .first<PasswordResetTokenRow>();

  return { success: Boolean(tokenRecord), tokenRecord: tokenRecord || null };
}

export async function markPasswordResetTokenUsed(
  db: D1Database,
  id: string
): Promise<boolean> {
  const now = Date.now();
  const res = await db
    .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .bind(now, id)
    .run();
  const changes = res.meta?.changes ?? (res as any).changes ?? res.meta?.rows_written ?? 0;
  return changes === 1;
}


// ==============================================================
// 8. ORDERS DATABASE OPERATIONS (ATOMIC TRANSACTIONS & STOCK INTEGRITY)
// ==============================================================

export function rowToOrder(row: OrderRow): Order {
  let items = [];
  try {
    items = JSON.parse(row.items_json || '[]');
  } catch (e) {
    items = [];
  }

  let courierBooking = undefined;
  if (row.courier_booking_json) {
    try {
      courierBooking = JSON.parse(row.courier_booking_json);
    } catch {}
  }

  let dbblDetails = undefined;
  if (row.dbbl_details_json) {
    try {
      dbblDetails = JSON.parse(row.dbbl_details_json);
    } catch {}
  }

  let cardDetails = undefined;
  if (row.card_details_json) {
    try {
      cardDetails = JSON.parse(row.card_details_json);
    } catch {}
  }

  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id || undefined,
    userEmail: row.user_email || undefined,
    customer: {
      fullName: row.customer_name,
      phone: row.customer_phone,
      fullAddress: row.customer_address,
      district: row.customer_district || '',
      deliveryZone: (row.customer_zone as any) || 'inside_dhaka',
      notes: row.customer_notes || undefined,
      email: row.user_email || undefined,
      userId: row.user_id || undefined,
    },
    items,
    subtotal: Number(row.subtotal) || 0,
    deliveryFee: Number(row.delivery_fee) || 0,
    totalAmount: Number(row.total_amount) || 0,
    couponCode: row.coupon_code || undefined,
    discountAmount: Number(row.discount_amount) || 0,
    paymentMethod: (row.payment_method as any) || 'COD',
    paymentStatus: (row.payment_status as any) || 'Pending',
    transactionId: row.transaction_id || undefined,
    shippingStatus: (row.shipping_status as any) || 'Pending',
    courierName: row.courier_name || undefined,
    courierWaybill: row.courier_waybill || undefined,
    consignmentId: row.consignment_id || undefined,
    courierStatus: row.courier_status || undefined,
    courierBooking,
    dbblDetails,
    cardDetails,
    lastCourierSync: row.last_courier_sync || undefined,
    totalCost: row.total_cost != null ? Number(row.total_cost) : (items.reduce((s: number, it: any) => s + (Number(it.productCost) || (Number(it.buyingPriceSnapshot || it.product?.buyingPrice || 0) * (Number(it.quantity) || 1))), 0)),
    totalGrossProfit: row.total_profit != null ? Number(row.total_profit) : ((Number(row.subtotal) || 0) - (row.total_cost != null ? Number(row.total_cost) : (items.reduce((s: number, it: any) => s + (Number(it.productCost) || (Number(it.buyingPriceSnapshot || it.product?.buyingPrice || 0) * (Number(it.quantity) || 1))), 0)))),
    advancePayment: row.advance_payment != null && !isNaN(Number(row.advance_payment)) ? Math.max(0, Number(row.advance_payment)) : 0,
    advancePaymentMethod: row.advance_payment_method || undefined,
    advancePaymentNote: row.advance_payment_note || undefined,
    advancePaymentUpdatedAt: row.advance_payment_updated_at || undefined,
    advancePaymentUpdatedBy: row.advance_payment_updated_by || undefined,
    customerDue: (row.payment_status === 'Paid' || row.payment_status === 'PAID')
      ? 0
      : Math.max(0, Math.round(((Number(row.total_amount) || 0) - (row.advance_payment != null && !isNaN(Number(row.advance_payment)) ? Math.max(0, Number(row.advance_payment)) : 0)) * 100) / 100),
    dueAmount: (row.payment_status === 'Paid' || row.payment_status === 'PAID')
      ? 0
      : Math.max(0, Math.round(((Number(row.total_amount) || 0) - (row.advance_payment != null && !isNaN(Number(row.advance_payment)) ? Math.max(0, Number(row.advance_payment)) : 0)) * 100) / 100),
    createdAt: row.created_at,
  };
}

export const DEFAULT_ORDER_PAGE_SIZE = 25;
export const MAX_ORDER_PAGE_SIZE = 100;

export interface OrderFilter {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  payment?: string;
  sortBy?: 'newest' | 'oldest' | 'amount-desc' | 'amount-asc' | string;
}

export interface OrderSummaryStats {
  totalAll: number;
  pendingCount: number;
  shippedCount: number;
  deliveredCount: number;
  cancelledCount: number;
  unverifiedDbblCount: number;
  totalRevenue: number;
  totalDeliveryValue: number;
  cancelledOrdersValue: number;
  cancelledProductsValue: number;
}

export interface PaginatedOrdersResult {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  summary: OrderSummaryStats;
}

export function sanitizeOrderPaginationParams(
  rawPage?: number | string | null,
  rawLimit?: number | string | null
): { page: number; limit: number; offset: number } {
  const parsedPage = typeof rawPage === 'string' ? parseInt(rawPage, 10) : Number(rawPage);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;

  const parsedLimit = typeof rawLimit === 'string' ? parseInt(rawLimit, 10) : Number(rawLimit);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit >= 1
      ? Math.min(MAX_ORDER_PAGE_SIZE, Math.floor(parsedLimit))
      : DEFAULT_ORDER_PAGE_SIZE;

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function buildOrderWhereClause(filter?: OrderFilter): { whereClause: string; bindings: any[] } {
  let where = ' WHERE 1=1';
  const bindings: any[] = [];

  // 1. Shipping / Courier Status Filter (database-level)
  const rawStatus = (filter?.status || '').trim();
  if (rawStatus && rawStatus.toLowerCase() !== 'all') {
    const statusKey = rawStatus.toLowerCase();
    if (statusKey === 'pending') {
      where += ` AND (
        LOWER(shipping_status) IN ('pending', 'processing')
        OR LOWER(COALESCE(courier_status, '')) LIKE '%pending%'
        OR LOWER(COALESCE(courier_status, '')) LIKE '%pickup%'
      )`;
    } else if (statusKey === 'processing') {
      where += ` AND LOWER(shipping_status) = 'processing'`;
    } else if (statusKey === 'shipped') {
      where += ` AND (
        LOWER(shipping_status) = 'shipped'
        OR LOWER(COALESCE(courier_status, '')) LIKE '%ship%'
        OR LOWER(COALESCE(courier_status, '')) LIKE '%transit%'
      )`;
    } else if (statusKey === 'delivered') {
      where += ` AND (
        LOWER(shipping_status) = 'delivered'
        OR LOWER(COALESCE(courier_status, '')) LIKE '%deliver%'
      )`;
    } else if (statusKey === 'cancelled') {
      where += ` AND (
        LOWER(shipping_status) = 'cancelled'
        OR LOWER(COALESCE(courier_status, '')) LIKE '%cancel%'
        OR LOWER(COALESCE(courier_status, '')) LIKE '%return%'
      )`;
    } else {
      where += ` AND LOWER(shipping_status) = ?`;
      bindings.push(statusKey);
    }
  }

  // 2. Payment Status / Payment Method Filter (database-level)
  const rawPayment = (filter?.payment || '').trim();
  if (rawPayment && rawPayment.toLowerCase() !== 'all') {
    const paymentKey = rawPayment.toUpperCase();
    if (paymentKey === 'PAID') {
      where += ` AND UPPER(payment_status) = 'PAID'`;
    } else if (paymentKey === 'PARTIAL' || paymentKey === 'PARTIALLY_PAID') {
      where += ` AND (UPPER(payment_status) = 'PARTIAL' OR UPPER(payment_status) = 'PARTIALLY_PAID')`;
    } else if (paymentKey === 'DUE') {
      where += ` AND UPPER(payment_status) != 'PAID'`;
    } else if (rawPayment.toLowerCase() === 'dbbl') {
      where += ` AND LOWER(payment_method) = 'dbbl'`;
    } else if (rawPayment.toLowerCase() === 'cod') {
      where += ` AND LOWER(payment_method) = 'cod'`;
    }
  }

  // 3. Search Query Filter (database-level)
  const rawSearch = (filter?.search || '').trim();
  if (rawSearch) {
    const s = `%${rawSearch}%`;
    where += ` AND (
      order_number LIKE ?
      OR customer_phone LIKE ?
      OR customer_name LIKE ?
      OR customer_address LIKE ?
      OR COALESCE(customer_district, '') LIKE ?
      OR COALESCE(transaction_id, '') LIKE ?
      OR COALESCE(courier_waybill, '') LIKE ?
      OR COALESCE(consignment_id, '') LIKE ?
    )`;
    bindings.push(s, s, s, s, s, s, s, s);
  }

  return { whereClause: where, bindings };
}

function resolveOrderSortClause(sortBy?: string): string {
  switch ((sortBy || '').toLowerCase()) {
    case 'oldest':
    case 'date-asc':
    case 'created_asc':
      return ' ORDER BY created_at ASC, id ASC';
    case 'amount-desc':
    case 'total-desc':
      return ' ORDER BY total_amount DESC, created_at DESC';
    case 'amount-asc':
    case 'total-asc':
      return ' ORDER BY total_amount ASC, created_at DESC';
    case 'newest':
    case 'date-desc':
    case 'created_desc':
    default:
      return ' ORDER BY created_at DESC, id DESC';
  }
}

export async function getOrderSummaryStats(db: D1Database): Promise<OrderSummaryStats> {
  const row = await db
    .prepare(`
      SELECT
        COUNT(*) as total_all,
        SUM(CASE WHEN LOWER(shipping_status) IN ('pending', 'processing') OR LOWER(COALESCE(courier_status, '')) LIKE '%pending%' OR LOWER(COALESCE(courier_status, '')) LIKE '%pickup%' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN LOWER(shipping_status) = 'shipped' OR LOWER(COALESCE(courier_status, '')) LIKE '%ship%' OR LOWER(COALESCE(courier_status, '')) LIKE '%transit%' THEN 1 ELSE 0 END) as shipped_count,
        SUM(CASE WHEN LOWER(shipping_status) = 'delivered' OR LOWER(COALESCE(courier_status, '')) LIKE '%deliver%' THEN 1 ELSE 0 END) as delivered_count,
        SUM(CASE WHEN LOWER(shipping_status) = 'cancelled' OR LOWER(COALESCE(courier_status, '')) LIKE '%cancel%' OR LOWER(COALESCE(courier_status, '')) LIKE '%return%' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN LOWER(payment_method) = 'dbbl' AND UPPER(payment_status) != 'PAID' THEN 1 ELSE 0 END) as unverified_dbbl_count,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(delivery_fee), 0) as total_delivery_value,
        COALESCE(SUM(CASE WHEN LOWER(shipping_status) = 'cancelled' OR LOWER(COALESCE(courier_status, '')) LIKE '%cancel%' OR LOWER(COALESCE(courier_status, '')) LIKE '%return%' THEN total_amount ELSE 0 END), 0) as cancelled_orders_value,
        COALESCE(SUM(CASE WHEN LOWER(shipping_status) = 'cancelled' OR LOWER(COALESCE(courier_status, '')) LIKE '%cancel%' OR LOWER(COALESCE(courier_status, '')) LIKE '%return%' THEN subtotal ELSE 0 END), 0) as cancelled_products_value
      FROM orders
    `)
    .first<Record<string, any>>();

  return {
    totalAll: Number(row?.total_all) || 0,
    pendingCount: Number(row?.pending_count) || 0,
    shippedCount: Number(row?.shipped_count) || 0,
    deliveredCount: Number(row?.delivered_count) || 0,
    cancelledCount: Number(row?.cancelled_count) || 0,
    unverifiedDbblCount: Number(row?.unverified_dbbl_count) || 0,
    totalRevenue: Number(row?.total_revenue) || 0,
    totalDeliveryValue: Number(row?.total_delivery_value) || 0,
    cancelledOrdersValue: Number(row?.cancelled_orders_value) || 0,
    cancelledProductsValue: Number(row?.cancelled_products_value) || 0,
  };
}

export async function getPaginatedOrders(
  db: D1Database,
  filter?: OrderFilter
): Promise<PaginatedOrdersResult> {
  const { page, limit, offset } = sanitizeOrderPaginationParams(filter?.page, filter?.limit);
  const { whereClause, bindings } = buildOrderWhereClause(filter);
  const orderClause = resolveOrderSortClause(filter?.sortBy);

  // 1. Filtered total count
  const countQuery = `SELECT COUNT(*) as total FROM orders${whereClause}`;
  const countStmt = db.prepare(countQuery);
  const boundCount = bindings.length > 0 ? countStmt.bind(...bindings) : countStmt;
  const countRow = await boundCount.first<{ total: number }>();
  const total = Number(countRow?.total) || 0;

  // 2. Paginated rows at database level
  const dataQuery = `SELECT * FROM orders${whereClause}${orderClause} LIMIT ? OFFSET ?`;
  const dataStmt = db.prepare(dataQuery);
  const boundData = dataStmt.bind(...bindings, limit, offset);
  const result = await boundData.all<OrderRow>();
  const orders = (result.results || []).map(rowToOrder);

  // 3. Aggregate summary stats across orders table
  const summary = await getOrderSummaryStats(db);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    orders,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    summary,
  };
}

export async function getAllOrders(
  db: D1Database,
  options?: OrderFilter
): Promise<Order[]> {
  const { limit, offset } = sanitizeOrderPaginationParams(options?.page, options?.limit);
  const { whereClause, bindings } = buildOrderWhereClause(options);
  const orderClause = resolveOrderSortClause(options?.sortBy);

  const query = `SELECT * FROM orders${whereClause}${orderClause} LIMIT ? OFFSET ?`;
  const stmt = db.prepare(query);
  const bound = stmt.bind(...bindings, limit, offset);
  const result = await bound.all<OrderRow>();

  if (!result.results) return [];
  return result.results.map(rowToOrder);
}

export async function getOrderById(db: D1Database, idOrNumber: string): Promise<Order | null> {
  await ensureOrderTableSchema(db);
  const query = 'SELECT * FROM orders WHERE id = ? OR order_number = ? LIMIT 1';
  const row = await db.prepare(query).bind(idOrNumber, idOrNumber).first<OrderRow>();
  return row ? rowToOrder(row) : null;
}

export async function findOrderByCourierIdentifier(
  db: D1Database,
  identifier: { invoice?: string | number; consignmentId?: string | number; trackingCode?: string }
): Promise<Order | null> {
  const inv = identifier.invoice !== undefined ? String(identifier.invoice).trim() : '';
  const cid = identifier.consignmentId !== undefined ? String(identifier.consignmentId).trim() : '';
  const track = identifier.trackingCode ? String(identifier.trackingCode).trim() : '';

  if (!inv && !cid && !track) return null;

  // 1. Try orderNumber, id, or invoice
  if (inv) {
    const cleanInv = inv.replace(/^#/, '');
    const direct = await db
      .prepare('SELECT * FROM orders WHERE id = ? OR order_number = ? OR order_number = ? LIMIT 1')
      .bind(inv, inv, cleanInv)
      .first<OrderRow>();
    if (direct) return rowToOrder(direct);
  }

  // 2. Try consignment_id
  if (cid) {
    const byCid = await db
      .prepare('SELECT * FROM orders WHERE consignment_id = ? OR consignment_id LIKE ? LIMIT 1')
      .bind(cid, `%${cid}%`)
      .first<OrderRow>();
    if (byCid) return rowToOrder(byCid);
  }

  // 3. Try courier_waybill
  if (track) {
    const byTrack = await db
      .prepare('SELECT * FROM orders WHERE courier_waybill = ? OR courier_waybill LIKE ? LIMIT 1')
      .bind(track, `%${track}%`)
      .first<OrderRow>();
    if (byTrack) return rowToOrder(byTrack);
  }

  return null;
}

/**
 * Cryptographically secure, collision-resistant order number generator for Rongdhonu Trade.
 * Produces customer-facing format: RT-YYYY-XXXXXXXX (e.g. RT-2026-48291053).
 * Uses native Web Crypto API CSPRNG combined with high-resolution clock entropy for 100 million space per year.
 */
export function generateSecureOrderNumber(year: number = new Date().getFullYear()): string {
  const randomBytes = new Uint32Array(2);
  // Cryptographically secure pseudorandom number generation (CSPRNG)
  crypto.getRandomValues(randomBytes);
  // Generate 8 collision-resistant digits (10,000,000 to 99,999,999) mixing CSPRNG with millisecond clock
  const timeEntropy = (Date.now() & 0x3fffffff) >>> 0;
  const combined = ((randomBytes[0] ^ timeEntropy) >>> 0);
  const randNum = 10000000 + (combined % 90000000);
  return `RT-${year}-${randNum}`;
}

export async function insertOrder(
  db: D1Database,
  order: Order,
  options?: { isPrivilegedAdmin?: boolean }
): Promise<Order> {
  if (!order) {
    throw new Error('Invalid order payload: order object is required.');
  }

  // 1. Prevent IDOR: Never return an existing order on duplicate submit!
  let orderId = (order.id || '').trim();
  if (orderId) {
    const existing = await getOrderById(db, orderId);
    if (existing) {
      throw new Error(`Order with ID "${orderId}" already exists. Cannot overwrite existing order.`);
    }
  } else {
    // Security Hardening: Use CSPRNG randomUUID for collision-resistant order ID
    const randPart = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    orderId = `ord-${Date.now()}-${randPart}`;
  }

  // Ensure collision-free unique orderNumber with bounded retry loop.
  // Prefer authoritative server-side generation over client-side generation.
  const maxRetries = 5;
  let orderNumber = generateSecureOrderNumber();
  let attempts = 0;
  let uniqueFound = false;

  while (attempts < maxRetries && !uniqueFound) {
    const existingByNum = await getOrderById(db, orderNumber);
    if (!existingByNum) {
      uniqueFound = true;
      break;
    }
    orderNumber = generateSecureOrderNumber();
    attempts++;
  }

  if (!uniqueFound) {
    const fallbackBuf = new Uint32Array(1);
    crypto.getRandomValues(fallbackBuf);
    const fallbackRand = 100 + (fallbackBuf[0] % 900);
    orderNumber = `RT-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${fallbackRand}`;
  }

  // 2. Validate customer information
  if (!order.customer?.fullName || !order.customer?.phone || !order.customer?.fullAddress) {
    throw new Error('Customer full name, phone number, and delivery address are required.');
  }

  const cleanCustomerPhone = order.customer.phone.replace(/\D/g, '');
  if (cleanCustomerPhone.length < 11) {
    throw new Error('A valid 11-digit Bangladeshi contact phone number is required.');
  }

  // 3. Validate items & prevent missing items
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error('Order must contain at least one item.');
  }

  // 4. Parallel Batch Fetch: Retrieve Store Settings, Product records, and optional Coupon concurrently
  const productIds = Array.from(
    new Set(
      order.items
        .map((it) => it?.product?.id)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    )
  );
  const cleanCouponCode = order.couponCode && order.couponCode.trim() ? order.couponCode.trim().toUpperCase() : '';

  const [storeSettings, couponRow, d1ProductList] = await Promise.all([
    getStoreSettings(db),
    cleanCouponCode
      ? db
          .prepare(`SELECT ${COUPON_COLUMNS} FROM coupons WHERE UPPER(code) = ?`)
          .bind(cleanCouponCode)
          .first<CouponRow>()
      : Promise.resolve(null),
    getProductsByIds(db, productIds, { includeBuyingPrice: true }),
  ]);

  const productMap = new Map<string, Product>();
  for (const p of d1ProductList) {
    productMap.set(p.id, p);
  }

  // Anti-Spam & Blocked Numbers Enforcement
  if (storeSettings.blockedPhoneNumbers && Array.isArray(storeSettings.blockedPhoneNumbers)) {
    const isBlocked = storeSettings.blockedPhoneNumbers.some((p: string) => {
      const cleanP = (p || '').replace(/\D/g, '');
      return cleanP && (cleanCustomerPhone === cleanP || cleanCustomerPhone.endsWith(cleanP));
    });
    if (isBlocked) {
      throw new Error('Order submission is temporarily restricted for this contact number. Please reach out to customer support.');
    }
  }

  if (storeSettings.antiSpamEnabled) {
    const maxPerDay = Number(storeSettings.maxOrdersPerPhonePerDay) || 3;
    const phoneSuffix = cleanCustomerPhone.slice(-11);
    const recentCheck = await db
      .prepare("SELECT COUNT(*) as count FROM orders WHERE customer_phone LIKE ? AND created_at >= datetime('now', '-1 day')")
      .bind(`%${phoneSuffix}%`)
      .first<{ count: number }>();
    if (recentCheck && recentCheck.count >= maxPerDay) {
      throw new Error(`Daily order limit (${maxPerDay} orders/day) reached for this phone number. Please contact customer support for bulk orders.`);
    }
  }

  // 4. Validate items & prevent negative / zero / fractional quantities
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error('Order must contain at least one item.');
  }

  let authoritativeSubtotal = 0;
  let totalOrderCost = 0;
  const verifiedItems: CartItem[] = [];

  for (const it of order.items) {
    const prodId = it?.product?.id;
    const requestedQty = Number(it?.quantity);

    if (!prodId) {
      throw new Error('Order item is missing a valid product ID.');
    }

    if (!Number.isInteger(requestedQty) || requestedQty < 1 || requestedQty > 100) {
      throw new Error(`Invalid item quantity for "${it?.product?.title || prodId}". Must be an integer between 1 and 100.`);
    }

    const d1Product = productMap.get(prodId);
    if (!d1Product) {
      throw new Error(`Product "${it?.product?.title || prodId}" does not exist.`);
    }

    if (d1Product.stock < requestedQty) {
      throw new Error(
        `Insufficient stock for "${d1Product.title}". Requested: ${requestedQty}, Available: ${d1Product.stock}`
      );
    }

    const sellingPrice = Number(d1Product.price) || 0;
    const buyingPrice = Number(d1Product.buyingPrice) || 0;
    const itemRevenue = sellingPrice * requestedQty;
    const itemCost = buyingPrice * requestedQty;
    const itemGrossProfit = itemRevenue - itemCost;

    authoritativeSubtotal += itemRevenue;
    totalOrderCost += itemCost;

    verifiedItems.push({
      ...it,
      quantity: requestedQty,
      buyingPriceSnapshot: buyingPrice,
      sellingPriceSnapshot: sellingPrice,
      productCost: itemCost,
      productGrossProfit: itemGrossProfit,
      product: {
        ...d1Product,
      },
    });
  }

  const totalGrossProfit = authoritativeSubtotal - totalOrderCost;

  // 5. Authoritative delivery fee from D1 store settings
  const deliveryZone = order.customer.deliveryZone === 'outside_dhaka' ? 'outside_dhaka' : 'inside_dhaka';
  const authoritativeDeliveryFee = deliveryZone === 'outside_dhaka'
    ? Number(storeSettings.outsideDhakaFee) || 150
    : Number(storeSettings.insideDhakaFee) || 80;

  // 6. Authoritative promo / voucher validation and discount calculation
  let authoritativeDiscount = 0;
  let finalCouponCode: string | null = null;

  if (couponRow && couponRow.is_active) {
    const coupon = rowToCoupon(couponRow);
    const minSpend = coupon.minSpend || 0;
    if (authoritativeSubtotal >= minSpend) {
      finalCouponCode = coupon.code;
      if (coupon.discountType === 'percentage') {
        const clampedPercentage = Math.min(100, Math.max(0, Number(coupon.discountValue) || 0));
        authoritativeDiscount = Math.round((authoritativeSubtotal * clampedPercentage) / 100);
      } else if (coupon.discountType === 'fixed') {
        authoritativeDiscount = Math.min(authoritativeSubtotal, Math.max(0, Number(coupon.discountValue) || 0));
      } else if (coupon.discountType === 'free_shipping') {
        authoritativeDiscount = authoritativeDeliveryFee;
      }
    }
  }

  authoritativeDiscount = Math.min(authoritativeSubtotal, Math.max(0, authoritativeDiscount));

  // 7. Authoritative total amount
  const authoritativeTotalAmount = Math.max(0, authoritativeSubtotal + authoritativeDeliveryFee - authoritativeDiscount);

  // 8. Authoritative Security Enforcement: Forced initial Payment and Shipping status
  // Client cannot claim "PAID" or "Shipped" on order creation!
  const paymentMethod = order.paymentMethod === 'dbbl' ? 'dbbl' : 'COD';
  const paymentStatus = paymentMethod === 'dbbl' ? 'Unverified' : 'Pending';
  const shippingStatus = 'Pending';

  // Format recipient address cleanly
  let customerFullAddress = order.customer.fullAddress.trim();
  if (order.customer.area && !customerFullAddress.toLowerCase().includes(order.customer.area.trim().toLowerCase())) {
    customerFullAddress = `${customerFullAddress}, ${order.customer.area.trim()}`;
  }

  // 9. Construct atomic D1 batch transaction (order insertion + stock deductions)
  await ensureOrderTableSchema(db);

  const isPrivilegedAdmin = options?.isPrivilegedAdmin === true || (order as any)._isPrivilegedAdmin === true;
  const rawAdvance = isPrivilegedAdmin && order.advancePayment != null ? Number(order.advancePayment) : 0;
  const initialAdvance = Number.isFinite(rawAdvance) && rawAdvance > 0
    ? Math.min(authoritativeTotalAmount, Math.max(0, rawAdvance))
    : 0;
  const advanceMethod = initialAdvance > 0 && order.advancePaymentMethod ? String(order.advancePaymentMethod).trim() : null;
  const advanceNote = initialAdvance > 0 && order.advancePaymentNote ? String(order.advancePaymentNote).trim() : null;
  const advanceUpdatedAt = initialAdvance > 0 ? (order.advancePaymentUpdatedAt || new Date().toISOString()) : null;
  const advanceUpdatedBy = initialAdvance > 0 ? (order.advancePaymentUpdatedBy || order.userId || 'system') : null;

  const insertSql = `
    INSERT INTO orders (
      id, order_number, user_id, user_email,
      customer_name, customer_phone, customer_address, customer_district, customer_zone, customer_notes,
      items_json, subtotal, delivery_fee, total_amount, coupon_code, discount_amount,
      payment_method, payment_status, transaction_id,
      shipping_status, courier_name, courier_waybill, consignment_id, courier_status,
      courier_booking_json, dbbl_details_json, card_details_json, last_courier_sync,
      total_cost, total_profit,
      advance_payment, advance_payment_method, advance_payment_note, advance_payment_updated_at, advance_payment_updated_by,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, CURRENT_TIMESTAMP
    );
  `;

  const stockStatements = verifiedItems.map((it) => {
    const qty = Number(it.quantity) || 1;
    return db
      .prepare(
        'UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE -1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .bind(qty, qty, it.product.id);
  });

  let currentOrderNumber = orderNumber;
  let batchSuccess = false;
  let collisionRetries = 0;

  while (!batchSuccess && collisionRetries < maxRetries) {
    const orderInsertStmt = db
      .prepare(insertSql)
      .bind(
        orderId,
        currentOrderNumber,
        order.userId || null,
        order.userEmail || null,
        order.customer.fullName.trim(),
        cleanCustomerPhone,
        customerFullAddress,
        order.customer.district || null,
        deliveryZone,
        order.customer.notes || null,
        JSON.stringify(verifiedItems),
        authoritativeSubtotal,
        authoritativeDeliveryFee,
        authoritativeTotalAmount,
        finalCouponCode,
        authoritativeDiscount,
        paymentMethod,
        paymentStatus,
        order.transactionId || null,
        shippingStatus,
        null, // Courier name initial null
        null, // Courier waybill initial null
        null, // Consignment ID initial null
        null, // Courier status initial null
        null,
        order.dbblDetails ? JSON.stringify(order.dbblDetails) : null,
        null,
        null,
        totalOrderCost,
        totalGrossProfit,
        initialAdvance,
        advanceMethod,
        advanceNote,
        advanceUpdatedAt,
        advanceUpdatedBy,
        order.createdAt || new Date().toISOString()
      );

    try {
      const batchResults = await db.batch([orderInsertStmt, ...stockStatements]);
      const failed = batchResults.find((r) => !r.success);
      if (failed) {
        const errorText = failed.error || '';
        if (errorText.includes('UNIQUE constraint') && errorText.includes('order_number') && collisionRetries + 1 < maxRetries) {
          collisionRetries++;
          currentOrderNumber = generateSecureOrderNumber();
          continue;
        }
        if (errorText.includes('INSUFFICIENT_STOCK')) {
          throw new Error('One or more items in your cart sold out during checkout. Please refresh your cart.');
        }
        console.error('Database transaction error during order placement batch:', errorText);
        throw new Error('Database transaction failed during order placement.');
      }

      // Verify that every stock update statement actually affected exactly 1 row
      const stockResults = batchResults.slice(1);
      let stockFailureIndex = -1;

      for (let i = 0; i < verifiedItems.length; i++) {
        const sRes = stockResults[i];
        const changes = sRes?.meta?.changes ?? (sRes as any)?.changes ?? sRes?.meta?.rows_written ?? 0;
        if (changes < 1) {
          stockFailureIndex = i;
          break;
        }
      }

      if (stockFailureIndex !== -1) {
        // Atomic rollback: Delete the placed order and revert any stock deductions that succeeded in a single batch
        const rollbackStatements: D1PreparedStatement[] = [
          db.prepare('DELETE FROM orders WHERE id = ?').bind(orderId),
        ];
        for (let i = 0; i < verifiedItems.length; i++) {
          if (i === stockFailureIndex) continue;
          const sRes = stockResults[i];
          const changes = sRes?.meta?.changes ?? (sRes as any)?.changes ?? sRes?.meta?.rows_written ?? 0;
          if (changes >= 1) {
            const qty = Number(verifiedItems[i].quantity) || 1;
            rollbackStatements.push(
              db
                .prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .bind(qty, verifiedItems[i].product.id)
            );
          }
        }
        await db.batch(rollbackStatements).catch((rbErr) => {
          console.error('Rollback batch error:', rbErr);
        });
        const failedItem = verifiedItems[stockFailureIndex];
        throw new Error(`Insufficient stock for "${failedItem.product.title}". Stock was claimed by a concurrent order.`);
      }

      batchSuccess = true;
    } catch (batchErr: any) {
      const errorMsg = batchErr?.message || '';
      if (errorMsg.includes('UNIQUE constraint') && errorMsg.includes('order_number') && collisionRetries + 1 < maxRetries) {
        collisionRetries++;
        currentOrderNumber = generateSecureOrderNumber();
        continue;
      }
      if (errorMsg.includes('INSUFFICIENT_STOCK')) {
        throw new Error('One or more items in your cart sold out during checkout. Please refresh your cart.');
      }
      throw batchErr;
    }
  }

  if (!batchSuccess) {
    throw new Error('Could not allocate a unique order number after multiple attempts. Please try again.');
  }

  const saved = await getOrderById(db, orderId);
  if (!saved) throw new Error('Order could not be verified in D1 after batch insert');
  return saved;
}

export async function updateOrderInD1(
  db: D1Database,
  id: string,
  updates: Partial<Order>
): Promise<Order> {
  const existing = await getOrderById(db, id);
  if (!existing) {
    throw new Error(`Order with ID "${id}" does not exist in D1 database.`);
  }

  const merged: Order = {
    ...existing,
    ...updates,
    customer: updates.customer ? { ...existing.customer, ...updates.customer } : existing.customer,
    items: updates.items ? updates.items : existing.items,
    dbblDetails: updates.dbblDetails !== undefined ? updates.dbblDetails : existing.dbblDetails,
    courierBooking: updates.courierBooking !== undefined ? updates.courierBooking : existing.courierBooking,
  };

  // Recalculate cost & gross profit snapshots if items are updated
  let calculatedCost = merged.totalCost != null ? merged.totalCost : existing.totalCost;
  let calculatedProfit = merged.totalGrossProfit != null ? merged.totalGrossProfit : existing.totalGrossProfit;
  if (updates.items && Array.isArray(updates.items)) {
    let costSum = 0;
    for (const it of updates.items) {
      const buyingPrice = Number(it.buyingPriceSnapshot ?? it.product?.buyingPrice ?? 0);
      const qty = Number(it.quantity) || 1;
      costSum += buyingPrice * qty;
    }
    calculatedCost = costSum;
    calculatedProfit = Number(merged.subtotal) - costSum;
  }

  const updateSql = `
    UPDATE orders SET
      customer_name = ?,
      customer_phone = ?,
      customer_address = ?,
      customer_district = ?,
      customer_zone = ?,
      customer_notes = ?,
      items_json = ?,
      subtotal = ?,
      delivery_fee = ?,
      total_amount = ?,
      coupon_code = ?,
      discount_amount = ?,
      payment_method = ?,
      payment_status = ?,
      transaction_id = ?,
      shipping_status = ?,
      courier_name = ?,
      courier_waybill = ?,
      consignment_id = ?,
      courier_status = ?,
      courier_booking_json = ?,
      dbbl_details_json = ?,
      card_details_json = ?,
      last_courier_sync = ?,
      total_cost = ?,
      total_profit = ?,
      advance_payment = ?,
      advance_payment_method = ?,
      advance_payment_note = ?,
      advance_payment_updated_at = ?,
      advance_payment_updated_by = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?;
  `;

  const advancePaymentToSave = merged.advancePayment != null && !isNaN(Number(merged.advancePayment))
    ? Math.max(0, Number(merged.advancePayment))
    : (existing.advancePayment ?? 0);
  const advanceMethodToSave = merged.advancePaymentMethod !== undefined
    ? (merged.advancePaymentMethod || null)
    : (existing.advancePaymentMethod || null);
  const advanceNoteToSave = merged.advancePaymentNote !== undefined
    ? (merged.advancePaymentNote || null)
    : (existing.advancePaymentNote || null);
  const advanceUpdatedAtToSave = merged.advancePaymentUpdatedAt !== undefined
    ? (merged.advancePaymentUpdatedAt || null)
    : (existing.advancePaymentUpdatedAt || null);
  const advanceUpdatedByToSave = merged.advancePaymentUpdatedBy !== undefined
    ? (merged.advancePaymentUpdatedBy || null)
    : (existing.advancePaymentUpdatedBy || null);

  // 1. Handle atomic stock restoration on order cancellation BEFORE general updates
  if (updates.shippingStatus === 'Cancelled') {
    if (existing.shippingStatus !== 'Cancelled') {
      // Conditional atomic status transition: Only the first concurrent request transitions from non-cancelled
      const cancelTransition = await db
        .prepare(
          "UPDATE orders SET shipping_status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shipping_status != 'Cancelled'"
        )
        .bind(id)
        .run();

      const transitionChanges =
        cancelTransition.meta?.changes ??
        (cancelTransition as any)?.changes ??
        (cancelTransition as any)?.rows_written ??
        0;

      if (transitionChanges > 0) {
        // Exactly ONE request wins this atomic transition. Restore stock in an atomic batch.
        if (Array.isArray(existing.items)) {
          const restoreStmts = existing.items
            .filter((it) => it?.product?.id && it.quantity > 0)
            .map((it) =>
              db
                .prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .bind(it.quantity, it.product.id)
            );
          if (restoreStmts.length > 0) {
            const batchResults = await db.batch(restoreStmts);
            const failed = batchResults.find((r) => !r.success);
            if (failed) {
              console.error('Failed to restore product stock on order cancellation:', failed.error);
              // Revert order status back if stock restoration failed
              await db
                .prepare('UPDATE orders SET shipping_status = ? WHERE id = ?')
                .bind(existing.shippingStatus, id)
                .run()
                .catch(() => {});
              throw new Error('Failed to restore product stock on order cancellation.');
            }
          }
        }
      }
      // If transitionChanges === 0, a concurrent request already cancelled the order.
      // We do NOT restore stock again!
    }
  }

  // 2. If order was uncancelled (moved back from Cancelled to active), re-deduct stock BEFORE general updates
  if (existing.shippingStatus === 'Cancelled' && updates.shippingStatus && updates.shippingStatus !== 'Cancelled') {
    const uncancelTransition = await db
      .prepare(
        "UPDATE orders SET shipping_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shipping_status = 'Cancelled'"
      )
      .bind(updates.shippingStatus, id)
      .run();

    const transitionChanges =
      uncancelTransition.meta?.changes ??
      (uncancelTransition as any)?.changes ??
      (uncancelTransition as any)?.rows_written ??
      0;

    if (transitionChanges > 0) {
      if (Array.isArray(existing.items)) {
        const deductStmts = existing.items
          .filter((it) => it?.product?.id && it.quantity > 0)
          .map((it) =>
            db
              .prepare(
                'UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE -1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
              )
              .bind(it.quantity, it.quantity, it.product.id)
          );
        if (deductStmts.length > 0) {
          try {
            const batchResults = await db.batch(deductStmts);
            const failed = batchResults.find((r) => !r.success);
            if (failed) {
              throw new Error(failed.error || 'Failed to re-deduct stock');
            }
          } catch (deductErr: any) {
            // Revert back to Cancelled if insufficient stock to un-cancel
            await db
              .prepare("UPDATE orders SET shipping_status = 'Cancelled' WHERE id = ?")
              .bind(id)
              .run()
              .catch(() => {});
            throw new Error('Cannot re-activate order: insufficient stock available to fulfill items.');
          }
        }
      }
    }
  }

  await db
    .prepare(updateSql)
    .bind(
      merged.customer.fullName,
      merged.customer.phone,
      merged.customer.fullAddress,
      merged.customer.district || null,
      merged.customer.deliveryZone || 'inside_dhaka',
      merged.customer.notes || null,
      JSON.stringify(merged.items || []),
      merged.subtotal,
      merged.deliveryFee,
      merged.totalAmount,
      merged.couponCode || null,
      merged.discountAmount || 0,
      merged.paymentMethod,
      merged.paymentStatus,
      merged.transactionId || null,
      merged.shippingStatus,
      merged.courierName || null,
      merged.courierWaybill || null,
      merged.consignmentId || null,
      merged.courierStatus || null,
      merged.courierBooking ? JSON.stringify(merged.courierBooking) : null,
      merged.dbblDetails ? JSON.stringify(merged.dbblDetails) : null,
      merged.cardDetails ? JSON.stringify(merged.cardDetails) : null,
      merged.lastCourierSync || null,
      calculatedCost != null ? calculatedCost : null,
      calculatedProfit != null ? calculatedProfit : null,
      advancePaymentToSave,
      advanceMethodToSave,
      advanceNoteToSave,
      advanceUpdatedAtToSave,
      advanceUpdatedByToSave,
      id
    )
    .run();

  const updated = await getOrderById(db, id);
  if (!updated) throw new Error('Failed to retrieve updated order from D1');
  return updated;
}

export async function deleteOrderFromD1(db: D1Database, id: string): Promise<boolean> {
  const existing = await getOrderById(db, id);
  if (!existing) {
    return true; // Already deleted, idempotent
  }

  const deleteStmt = db.prepare('DELETE FROM orders WHERE id = ? OR order_number = ?').bind(id, id);

  // If order was not cancelled or delivered, restore stock atomically in the SAME batch with deletion
  if (existing.shippingStatus !== 'Cancelled' && existing.shippingStatus !== 'Delivered') {
    if (Array.isArray(existing.items)) {
      const restoreStmts = existing.items
        .filter((it) => it?.product?.id && it.quantity > 0)
        .map((it) =>
          db
            .prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .bind(it.quantity, it.product.id)
        );
      if (restoreStmts.length > 0) {
        const batchResults = await db.batch([...restoreStmts, deleteStmt]);
        const failed = batchResults.find((r) => !r.success);
        if (failed) {
          console.error('Failed to atomically restore stock and delete order:', failed.error);
          throw new Error('Failed to delete order.');
        }
        return true;
      }
    }
  }

  const res = await deleteStmt.run();
  if (!res.success) {
    console.error('Failed to delete order from database:', res.error);
    throw new Error('Failed to delete order.');
  }
  return true;
}

// ==============================================================
// 9. EXPENSES DATABASE OPERATIONS
// ==============================================================

export function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    expenseType: row.expense_type as ExpenseType,
    amount: Number(row.amount) || 0,
    date: row.date,
    note: row.note || undefined,
    createdAt: row.created_at,
    createdBy: row.created_by || undefined,
  };
}

export async function getAllExpenses(
  db: D1Database,
  filter?: { startDate?: string; endDate?: string; expenseType?: string }
): Promise<Expense[]> {
  let query = 'SELECT * FROM expenses WHERE 1=1';
  const bindings: any[] = [];

  if (filter?.startDate) {
    query += ' AND date >= ?';
    bindings.push(filter.startDate);
  }
  if (filter?.endDate) {
    query += ' AND date <= ?';
    bindings.push(filter.endDate);
  }
  if (filter?.expenseType && filter.expenseType !== 'all') {
    query += ' AND expense_type = ?';
    bindings.push(filter.expenseType);
  }

  query += ' ORDER BY date DESC, created_at DESC';

  const res = await db.prepare(query).bind(...bindings).all<ExpenseRow>();
  return (res.results || []).map(rowToExpense);
}

export async function insertExpense(
  db: D1Database,
  expense: { id?: string; expenseType: string; amount: number; date: string; note?: string },
  createdBy?: string
): Promise<Expense> {
  // Security Hardening: Use CSPRNG randomUUID for expense identifier
  const expenseRand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const id = expense.id || `exp-${Date.now()}-${expenseRand}`;
  const expenseType = expense.expenseType || 'other';
  const amount = Math.max(0, Number(expense.amount) || 0);
  const date = expense.date || new Date().toISOString().slice(0, 10);
  const note = expense.note ? expense.note.trim() : null;

  await db
    .prepare(
      'INSERT INTO expenses (id, expense_type, amount, date, note, created_at, created_by) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)'
    )
    .bind(id, expenseType, amount, date, note, createdBy || null)
    .run();

  const row = await db.prepare('SELECT * FROM expenses WHERE id = ?').bind(id).first<ExpenseRow>();
  if (!row) throw new Error('Failed to retrieve newly created expense from D1');
  return rowToExpense(row);
}

export async function deleteExpenseFromD1(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare('DELETE FROM expenses WHERE id = ?').bind(id).run();
  if (!res.success) {
    console.error('Failed to delete expense from database:', res.error);
    throw new Error('Failed to delete expense.');
  }
  return true;
}

// ==============================================================
// 10. PROFIT & FINANCIAL ANALYTICS AGGREGATION
// ==============================================================

export async function getProfitAnalytics(
  db: D1Database,
  params: {
    period: 'today' | 'month' | 'previous_month' | 'custom';
    startDate?: string;
    endDate?: string;
  }
): Promise<ProfitAnalyticsSummary> {
  let orderDateCondition = '';
  let expenseDateCondition = '';
  const orderBindings: any[] = [];
  const expenseBindings: any[] = [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonthStr = now.toISOString().slice(0, 7);

  // Calculate previous month string
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  if (params.period === 'today') {
    const targetDate = params.startDate || todayStr;
    orderDateCondition = 'substr(created_at, 1, 10) = ?';
    expenseDateCondition = 'date = ?';
    orderBindings.push(targetDate);
    expenseBindings.push(targetDate);
  } else if (params.period === 'previous_month') {
    orderDateCondition = 'substr(created_at, 1, 7) = ?';
    expenseDateCondition = 'substr(date, 1, 7) = ?';
    orderBindings.push(prevMonthStr);
    expenseBindings.push(prevMonthStr);
  } else if (params.period === 'month') {
    const targetMonth = params.startDate ? params.startDate.slice(0, 7) : currentMonthStr;
    orderDateCondition = 'substr(created_at, 1, 7) = ?';
    expenseDateCondition = 'substr(date, 1, 7) = ?';
    orderBindings.push(targetMonth);
    expenseBindings.push(targetMonth);
  } else {
    // custom
    const start = params.startDate || '1970-01-01';
    const end = params.endDate || '2099-12-31';
    orderDateCondition = 'substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?';
    expenseDateCondition = 'date >= ? AND date <= ?';
    orderBindings.push(start, end);
    expenseBindings.push(start, end);
  }

  // 1. Fetch orders in the period to aggregate
  const ordersQuery = `
    SELECT
      id, order_number, subtotal, delivery_fee, total_amount, shipping_status, payment_status,
      courier_status, total_cost, total_profit, items_json, created_at
    FROM orders
    WHERE ${orderDateCondition}
  `;
  const ordersResult = await db.prepare(ordersQuery).bind(...orderBindings).all<any>();
  const ordersList = ordersResult.results || [];

  let totalOrders = ordersList.length;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let returnedOrders = 0;
  let totalRevenue = 0;
  let totalProductCost = 0;
  let productsSold = 0;

  for (const o of ordersList) {
    const isCancelled =
      o.shipping_status === 'Cancelled' ||
      o.payment_status === 'REFUNDED' ||
      o.courier_status === 'Returned / Cancelled';

    if (isCancelled) {
      cancelledOrders++;
      if (o.courier_status === 'Returned / Cancelled' || o.payment_status === 'REFUNDED') {
        returnedOrders++;
      }
      continue; // Cancelled orders do NOT count towards completed revenue/profit!
    }

    if (o.shipping_status === 'Delivered') {
      completedOrders++;
    }

    // Revenue: product sales revenue (subtotal)
    const rev = Number(o.subtotal) || 0;
    totalRevenue += rev;

    // Cost: order total_cost (or calculated from items if legacy)
    let cost = o.total_cost != null ? Number(o.total_cost) : 0;
    if (cost === 0 && o.items_json) {
      try {
        const items = JSON.parse(o.items_json);
        if (Array.isArray(items)) {
          cost = items.reduce(
            (sum: number, it: any) =>
              sum +
              (Number(it.productCost) ||
                (Number(it.buyingPriceSnapshot || it.product?.buyingPrice || 0) * (Number(it.quantity) || 1))),
            0
          );
        }
      } catch {}
    }
    totalProductCost += cost;

    // Count products sold
    if (o.items_json) {
      try {
        const items = JSON.parse(o.items_json);
        if (Array.isArray(items)) {
          for (const it of items) {
            productsSold += Number(it.quantity) || 1;
          }
        }
      } catch {}
    }
  }

  const grossProfit = totalRevenue - totalProductCost;
  const activeOrdersCount = totalOrders - cancelledOrders;
  const averageOrderValue = activeOrdersCount > 0 ? Math.round(totalRevenue / activeOrdersCount) : 0;
  const averageProfitPerOrder = activeOrdersCount > 0 ? Math.round(grossProfit / activeOrdersCount) : 0;

  // 2. Fetch expenses in the period
  const expensesQuery = `
    SELECT expense_type, amount, date FROM expenses
    WHERE ${expenseDateCondition}
  `;
  const expensesResult = await db.prepare(expensesQuery).bind(...expenseBindings).all<ExpenseRow>();
  const expensesList = expensesResult.results || [];

  let totalExpenses = 0;
  const expenseBreakdown = {
    facebookAds: 0,
    courier: 0,
    paymentGateway: 0,
    other: 0,
  };

  for (const exp of expensesList) {
    const amt = Number(exp.amount) || 0;
    totalExpenses += amt;
    if (exp.expense_type === 'facebook_ads') {
      expenseBreakdown.facebookAds += amt;
    } else if (exp.expense_type === 'courier') {
      expenseBreakdown.courier += amt;
    } else if (exp.expense_type === 'payment_gateway') {
      expenseBreakdown.paymentGateway += amt;
    } else {
      expenseBreakdown.other += amt;
    }
  }

  const netProfit = grossProfit - totalExpenses;

  return {
    period: params.period === 'previous_month' ? 'month' : params.period,
    startDate: params.startDate,
    endDate: params.endDate,
    revenue: totalRevenue,
    productCost: totalProductCost,
    grossProfit,
    expenses: totalExpenses,
    netProfit,
    totalOrders,
    completedOrders,
    cancelledOrders,
    returnedOrders,
    productsSold,
    averageOrderValue,
    averageProfitPerOrder,
    expenseBreakdown,
  };
}

// ==============================================================
// 12. AUDIT LOGS DATABASE OPERATIONS
// ==============================================================

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: any;
  ipAddress?: string;
}

export async function insertAuditLogInD1(
  db: D1Database,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<AuditLogEntry> {
  // Security Hardening: Use CSPRNG randomUUID for audit log entry identifier
  const auditRand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const id = `audit-${Date.now()}-${auditRand}`;
  const timestamp = new Date().toISOString();
  const detailsJson = entry.details ? JSON.stringify(entry.details) : null;

  try {
    await db
      .prepare(`
        INSERT INTO audit_logs (id, timestamp, actor_id, actor_email, actor_role, action, target_id, target_type, details_json, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        timestamp,
        entry.actorId || null,
        entry.actorEmail || null,
        entry.actorRole || null,
        entry.action,
        entry.targetId || null,
        entry.targetType || null,
        detailsJson,
        entry.ipAddress || null
      )
      .run();
  } catch (err) {
    console.error('Failed to write audit log to D1:', err);
  }

  return {
    id,
    timestamp,
    ...entry,
  };
}

export interface PaginatedAuditLogsResult {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getPaginatedAuditLogsFromD1(
  db: D1Database,
  options?: { page?: number; limit?: number; offset?: number }
): Promise<PaginatedAuditLogsResult> {
  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 200;

  const rawLimit = Number(options?.limit);
  const limit = !isNaN(rawLimit) && rawLimit > 0
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  let page = 1;
  let offset = 0;

  if (options?.page !== undefined) {
    page = Math.max(1, Math.floor(Number(options.page)) || 1);
    offset = (page - 1) * limit;
  } else if (options?.offset !== undefined) {
    offset = Math.max(0, Math.floor(Number(options.offset)) || 0);
    page = Math.floor(offset / limit) + 1;
  }

  try {
    const countRow = await db
      .prepare('SELECT COUNT(*) as total FROM audit_logs')
      .first<{ total: number }>();
    const total = Number(countRow?.total) || 0;

    const { results } = await db
      .prepare(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset)
      .all<any>();

    const logs = (results || []).map((row) => {
      let details = undefined;
      if (row.details_json) {
        try {
          details = JSON.parse(row.details_json);
        } catch {}
      }
      return {
        id: row.id,
        timestamp: row.timestamp,
        actorId: row.actor_id || undefined,
        actorEmail: row.actor_email || undefined,
        actorRole: row.actor_role || undefined,
        action: row.action,
        targetId: row.target_id || undefined,
        targetType: row.target_type || undefined,
        details,
        ipAddress: row.ip_address || undefined,
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      logs,
      total,
      page,
      limit,
      totalPages,
    };
  } catch (err) {
    console.error('Error querying audit logs from D1:', err);
    return {
      logs: [],
      total: 0,
      page,
      limit,
      totalPages: 1,
    };
  }
}

export async function getAuditLogsFromD1(
  db: D1Database,
  options?: { limit?: number; offset?: number; page?: number }
): Promise<AuditLogEntry[]> {
  const result = await getPaginatedAuditLogsFromD1(db, options);
  return result.logs;
}

/**
 * Atomically checks and records a courier webhook request fingerprint.
 * Prevents race conditions and duplicate processing from concurrent or replayed requests.
 *
 * Implements atomic registration using the PRIMARY KEY constraint on `webhook_replays(fingerprint)`.
 * Eliminates the SELECT-then-INSERT race condition:
 * 1. Opportunistically prunes expired records (where expires_at < now) to maintain table efficiency.
 * 2. Atomically attempts to insert the fingerprint.
 * 3. If the fingerprint already exists (concurrent request or unexpired replay), the PRIMARY KEY constraint
 *    conflicts and is safely identified as a duplicate/replay (isReplay: true).
 * 4. Avoids logging sensitive payload data or expected constraint violations.
 */
export async function checkAndRecordWebhookFingerprint(
  db: D1Database,
  fingerprint: string,
  ttlSeconds: number = 600
): Promise<{ isReplay: boolean }> {
  if (!db || !fingerprint) return { isReplay: false };
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  try {
    // 1. Opportunistic lazy cleanup of expired entries (keeps table compact without unbounded growth)
    await db
      .prepare('DELETE FROM webhook_replays WHERE expires_at < ?')
      .bind(now)
      .run()
      .catch(() => {});

    // 2. Atomic insertion: Attempt to register the fingerprint directly.
    // The PRIMARY KEY (UNIQUE) constraint on `webhook_replays(fingerprint)` guarantees atomicity:
    // exactly one concurrent request can successfully insert this fingerprint.
    const insertRes = await db
      .prepare('INSERT INTO webhook_replays (fingerprint, created_at, expires_at) VALUES (?, ?, ?)')
      .bind(fingerprint, now, expiresAt)
      .run();

    const changes = insertRes.meta?.changes ?? (insertRes as any)?.changes ?? insertRes.meta?.rows_written ?? 1;
    if (changes === 0) {
      // Row was ignored or not inserted due to conflict
      return { isReplay: true };
    }

    // Successfully claimed and registered fingerprint
    return { isReplay: false };
  } catch (err: any) {
    const errMsg = (err?.message || String(err)).toLowerCase();

    // Catch UNIQUE / PRIMARY KEY constraint violations (conflict with existing fingerprint)
    if (
      errMsg.includes('unique') ||
      errMsg.includes('constraint') ||
      errMsg.includes('primary key') ||
      errMsg.includes('sqlite_constraint') ||
      errMsg.includes('already exists') ||
      errMsg.includes('d1_error')
    ) {
      // Replay / concurrent duplicate detected atomically via database constraint
      return { isReplay: true };
    }

    // Safety fallback: verify if the unexpired fingerprint exists in the database
    try {
      const existing = await db
        .prepare('SELECT fingerprint FROM webhook_replays WHERE fingerprint = ? AND expires_at >= ?')
        .bind(fingerprint, now)
        .first();

      if (existing) {
        return { isReplay: true };
      }
    } catch {
      // Ignore fallback query failure
    }

    console.warn('Unexpected non-constraint database error recording webhook replay fingerprint:', err?.message || err);
    return { isReplay: false };
  }
}
