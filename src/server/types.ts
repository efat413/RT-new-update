import {
  Order,
  Product,
  Category,
  CarouselSlide,
  StoreSettings,
  Coupon,
  ProductReview,
  UserAccount,
} from '../types';

export interface D1Result<T = any> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: Record<string, any>;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  all<T = any>(): Promise<D1Result<T>>;
  first<T = any>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result<any>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = any>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<any>;
}

export interface R2ObjectBody {
  body: ReadableStream;
  httpMetadata?: {
    contentType?: string;
  };
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: any, options?: any): Promise<any>;
  delete(key: string): Promise<void>;
}

export interface Env {
  DB?: D1Database;
  R2?: R2Bucket;
  BUCKET?: R2Bucket;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
  ADMIN_SECRET?: string;
  COURIER_WEBHOOK_SECRET?: string;
  STEADFAST_API_KEY?: string;
  STEADFAST_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  APP_URL?: string;
  PRODUCTION_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
  SUPER_ADMIN_EMAILS?: string;
  SUPER_ADMIN_USER_IDS?: string;
  [key: string]: any;
}

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  used_at: number | null;
  created_at: number;
}


export interface MediaAssetRow {
  id: string;
  content_type: string;
  data: string;
  size: number;
  created_at: string;
}

export interface OrderRow {
  id: string;
  order_number: string;
  user_id: string | null;
  user_email: string | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_district: string | null;
  customer_zone: string | null;
  customer_notes: string | null;
  items_json: string;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  coupon_code: string | null;
  discount_amount: number;
  payment_method: string;
  payment_status: string;
  transaction_id: string | null;
  shipping_status: string;
  courier_name: string | null;
  courier_waybill: string | null;
  consignment_id: string | null;
  courier_status: string | null;
  courier_booking_json: string | null;
  dbbl_details_json: string | null;
  card_details_json: string | null;
  last_courier_sync: string | null;
  total_cost: number | null;
  total_profit: number | null;
  advance_payment?: number | null;
  advance_payment_method?: string | null;
  advance_payment_note?: string | null;
  advance_payment_updated_at?: string | null;
  advance_payment_updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  slug?: string | null;
  title: string;
  price: number;
  original_price: number | null;
  buying_price: number | null;
  category_id: string;
  description: string;
  image_url: string;
  images_json: string;
  stock: number;
  featured: number;
  featured_sort_order?: number | null;
  rating: number;
  reviews_count: number;
  specs_json: string | null;
  sizes_json: string | null;
  colors_json: string | null;
  sku: string | null;
  video_url: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseRow {
  id: string;
  expense_type: string;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  icon_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SliderRow {
  id: string;
  title: string;
  headline: string;
  subtext: string | null;
  tag: string | null;
  discount_badge: string | null;
  category_id: string | null;
  image_url: string;
  accent_gradient: string | null;
  button_text: string | null;
  sort_order: number;
  is_active?: number | null;
  created_at: string;
  updated_at: string;
}

export interface StoreSettingsRow {
  id: string;
  settings_json: string;
  updated_at: string;
}

export interface CouponRow {
  code: string;
  discount_type: string;
  discount_value: number;
  min_spend: number | null;
  description: string | null;
  is_active: number;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  product_id: string;
  author_name: string;
  rating: number;
  comment: string;
  verified_purchase: number;
  status?: string;
  approved_at?: string | null;
  approved_by?: string | null;
  created_at: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password?: string | null;
  role: string;
  permissions_json: string | null;
  phone: string | null;
  address: string | null;
  district: string | null;
  delivery_zone: string | null;
  created_at: string;
  updated_at: string;
}

export type {
  Order,
  Product,
  Category,
  CarouselSlide,
  StoreSettings,
  Coupon,
  ProductReview,
  UserAccount,
};
