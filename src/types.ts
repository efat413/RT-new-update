export interface Product {
  id: string;
  slug?: string;
  title: string;
  price: number;
  originalPrice?: number;
  buyingPrice?: number; // Super Admin only
  buying_price?: number; // Alias for buyingPrice for seamless DB/API mapping
  unitProfit?: number; // Calculated helper: price - buyingPrice (Super Admin only)
  unit_profit?: number; // Alias for unitProfit for seamless DB/API mapping
  categoryId: string;
  description: string;
  imageUrl: string;
  images?: string[];
  stock: number;
  featured: boolean;
  featuredSortOrder?: number;
  rating: number;
  reviewsCount: number;
  specs?: string[];
  sizes?: string[];
  colors?: string[];
  sku?: string;
  videoUrl?: string;
  status?: 'active' | 'draft' | 'archived';
  createdAt: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  iconName?: string;
  description?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
  buyingPriceSnapshot?: number;
  sellingPriceSnapshot?: number;
  productCost?: number;
  productGrossProfit?: number;
}

export type DeliveryZone = 'inside_dhaka' | 'outside_dhaka';

export interface CustomerInfo {
  fullName: string;
  phone: string;
  district: string;
  deliveryZone: DeliveryZone;
  fullAddress: string;
  area?: string;
  alternativePhone?: string;
  notes?: string;
  email?: string;
  userId?: string;
}

export type PaymentMethod = 'dbbl' | 'cod' | 'card';

export type PaymentStatus = 'UNVERIFIED' | 'PAID' | 'DUE' | 'REFUNDED' | 'Paid' | 'Pending COD' | 'Pending' | 'PARTIAL' | 'Partial';

export type ShippingStatus = 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';

export type CourierProvider = string;

export interface CourierBooking {
  provider: string;
  waybillId: string;
  trackingUrl: string;
  consignmentId: string;
  bookedAt: string;
  status?: string;
  lastCheckedAt?: string;
}

export interface CourierApiConfig {
  id: string;
  name: string;
  code: string;
  // Security note: API keys and secrets must NEVER be persisted to browser storage or returned in plaintext
  apiKey?: string;
  secretKey?: string;
  hasCredentials?: boolean;
  baseUrl?: string;
  trackingUrlPattern: string;
  isActive: boolean;
  webhookUrl?: string; // Direct webhook endpoint triggered when courier is added/updated
  webhookSecret?: string;
  triggerWebhookOnAdd?: boolean; // Whether to fire webhook immediately when this courier is added
  notes?: string;
}

export interface CourierWebhookConfig {
  id: string;
  name: string; // e.g. "Zapier Courier Alert", "Slack / Discord Dispatch Bot"
  url: string; // HTTP / HTTPS POST endpoint
  secret?: string; // Optional token / signature secret (masked on client)
  hasSecret?: boolean; // Indicates whether a webhook secret is configured
  events: ('courier.added' | 'courier.updated' | 'courier.deleted' | 'courier.dispatched' | string)[];
  isActive: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  lastStatus?: number;
  lastError?: string;
}

export interface CourierWebhookLog {
  id: string;
  webhookId?: string;
  webhookUrl: string;
  event: string;
  timestamp: string;
  status: 'success' | 'failed';
  httpStatus?: number;
  latencyMs?: number;
  responsePreview?: string;
  courierName?: string;
  payload: any;
}

export interface CarouselSlide {
  id: string;
  title: string;
  headline: string;
  subtext: string;
  tag: string;
  discountBadge: string;
  categoryId: string;
  imageUrl: string;
  accentGradient?: string;
  buttonText?: string;
  sort_order?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface DbblPaymentDetails {
  senderBank: string;
  senderAccountOrPhone: string;
  transactionId: string;
  depositSlipUrl?: string;
}

export type ReviewSource =
  | 'Customer Submitted'
  | 'Facebook'
  | 'Messenger'
  | 'WhatsApp'
  | 'Instagram'
  | 'Manual';

export const REVIEW_SOURCES: ReviewSource[] = [
  'Customer Submitted',
  'Facebook',
  'Messenger',
  'WhatsApp',
  'Instagram',
  'Manual',
];

export interface ProductReview {
  id: string;
  productId: string;
  authorName: string;
  author?: string;
  rating: number; // 1 to 5
  comment: string;
  createdAt: string;
  date?: string;
  verifiedPurchase?: boolean;
  status?: 'approved' | 'pending' | 'rejected' | string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  source?: ReviewSource | string;
  customerImage?: string | null;
  screenshotAttachment?: string | null;
  // Verification helpers
  orderNumber?: string;
  customerPhone?: string;
}

export interface Coupon {
  code: string;
  discountType: 'percentage' | 'fixed' | 'free_shipping';
  discountValue: number;
  minSpend?: number;
  description: string;
  isActive: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string;
  userEmail?: string;
  customer: CustomerInfo;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  couponCode?: string;
  discountAmount?: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  transactionId?: string;
  dbblDetails?: DbblPaymentDetails;
  cardDetails?: {
    cardholderName: string;
    last4: string;
    cardBrand: string;
    savedForFuture?: boolean;
  };
  shippingStatus: ShippingStatus;
  courierBooking?: CourierBooking;
  // Direct Steadfast / Courier fields for 1-click live dispatch
  courierName?: string;
  courierWaybill?: string;
  consignmentId?: string;
  courierStatus?: string;
  lastCourierSync?: string;
  // Super Admin Cost & Profit snapshots
  totalCost?: number;
  totalGrossProfit?: number;
  // Advance Payment & Customer Due tracking
  advancePayment?: number;
  advancePaymentMethod?: string;
  advancePaymentNote?: string;
  advancePaymentUpdatedAt?: string;
  advancePaymentUpdatedBy?: string;
  customerDue?: number;
  dueAmount?: number;
  createdAt: string;
}

export type ExpenseType = 'facebook_ads' | 'courier' | 'payment_gateway' | 'other';

export interface Expense {
  id: string;
  expenseType: ExpenseType;
  amount: number;
  date: string; // YYYY-MM-DD
  note?: string;
  createdAt: string;
  createdBy?: string;
}

export interface ProfitAnalyticsSummary {
  period: 'today' | 'month' | 'custom';
  startDate?: string;
  endDate?: string;
  revenue: number;
  productCost: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  productsSold: number;
  averageOrderValue: number;
  averageProfitPerOrder: number;
  expenseBreakdown: {
    facebookAds: number;
    courier: number;
    paymentGateway: number;
    other: number;
  };
}

export interface DbblBankSettings {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  branchName: string;
  routingNumber: string;
  qrCodeUrl: string;
  instructions: string;
}

export interface FooterSettings {
  aboutText?: string;
  supportPhone?: string;
  supportEmail?: string;
  supportWhatsApp?: string;
  officeAddress?: string;
  supportHoursText?: string;
  categoriesTitle?: string;
  supportDeliveryTitle?: string;
  whatsAppButtonText?: string;
  deliveryInsideDhakaText?: string;
  deliveryOutsideDhakaText?: string;
  cashOnDeliveryText?: string;
  warrantyBadgeText?: string;
  acceptedPayments?: string[];
  courierPartners?: string[];
  showCourierPartners?: boolean;
  copyrightText?: string;
  privacyPolicyText?: string;
  termsOfServiceText?: string;
  returnRefundPolicyText?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
}

export interface StoreSettings {
  siteName: string;
  logoUrl: string;
  faviconUrl?: string;
  bannerUrl?: string;
  phone: string;
  address: string;
  insideDhakaFee: number;
  outsideDhakaFee: number;
  announcementText: string;
  topBarAnnouncementText?: string;
  bannerHeadline: string;
  bannerSubtext: string;
  currencySymbol: string;
  // Steadfast Courier API Direct Settings
  steadfastApiKey?: string;
  steadfastSecretKey?: string;
  // DBBL Bank Transfer & NexusPay Settings
  dbblBank?: DbblBankSettings;
  // Anti-Spam & Fraud Protection Settings
  antiSpamEnabled?: boolean;
  maxOrdersPerPhonePerDay?: number;
  blockedPhoneNumbers?: string[];
  // Dynamic Customizable Footer & Policies
  footer?: FooterSettings;
  // Marketing Pixels & Tracking Settings
  trackingEnabled?: boolean;
  fbPixelId?: string;
  fbTestEventCode?: string;
  tiktokPixelId?: string;
  tiktokTestEventCode?: string;
  gtmId?: string;
  googleAnalyticsId?: string;
  advancedMatchingEnabled?: boolean;
  trackingDebugMode?: boolean;
  // Authoritative Hero Slider Aspect Ratio & Fit
  sliderAspectRatio?: string; // Master ratio across all devices, defaults to '1200 / 480' (5:2)
  bannerFitMode?: 'contain' | 'cover'; // Defaults to 'contain' to strictly preserve complete banner without cropping
  // Courier Webhooks & Configs
  courierWebhooks?: CourierWebhookConfig[];
  courierConfigs?: CourierApiConfig[];
}

export interface TrackingUserData {
  email?: string;
  phone?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  district?: string;
  deliveryZone?: string;
}

export interface PixelEventLog {
  id: string;
  timestamp: string;
  eventName: string;
  platforms: ('meta' | 'tiktok' | 'gtm' | 'ga')[];
  status: 'success' | 'queued' | 'skipped';
  hasUserData: boolean;
  userDataSummary?: string;
  hashedUserData?: {
    em?: string;
    ph?: string;
    fn?: string;
    ln?: string;
    ct?: string;
    country?: string;
    [key: string]: string | undefined;
  };
  value?: number;
  currency?: string;
  payload: Record<string, any>;
  isDuplicate?: boolean;
  source?: string;
}

export type {
  PermissionKey,
  GranularPermissions,
  PermissionMetadata,
} from './server/permissions';

export const MIN_PASSWORD_LENGTH = 8;

export type UserRole = 'super_admin' | 'admin' | 'sub_admin' | 'customer';

export interface AdminPermissions {
  canManageOrders?: boolean;
  canManageProducts?: boolean;
  canManageCategories?: boolean;
  canManageAccounts?: boolean;
  canManageSettings?: boolean;
  canManageReviews?: boolean;
  'reviews.view'?: boolean;
  'reviews.approve'?: boolean;
  'reviews.delete'?: boolean;
  'reviews.create'?: boolean;
  'reviews.edit'?: boolean;
  [key: string]: any;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions?: AdminPermissions;
  phone?: string;
  address?: string;
  district?: string;
  deliveryZone?: DeliveryZone;
  createdAt: string;
}

export interface ToastNotificationData {
  id: string;
  type: 'success' | 'info' | 'error' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

/**
 * Deprecated client helper: Authorization decisions must remain strictly server-authoritative
 * based on user.role === 'super_admin'. Privileged identities are never hardcoded.
 */
export const isMasterAdminEmail = (_email?: string | null): boolean => {
  return false;
};
