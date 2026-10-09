import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  LayoutDashboard,
  Package,
  ShoppingBag,
  FolderTree,
  Settings,
  LogOut,
  TrendingUp,
  ArrowUpRight,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  Send,
  ExternalLink,
  Copy,
  CheckCircle,
  Truck,
  ArrowLeft,
  Search,
  Check,
  X,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  Calendar,
  DollarSign,
  ShieldCheck,
  User,
  Sliders,
  Star,
  Users,
  Mail,
  UserPlus,
  Minus,
  Building2,
  QrCode,
  Upload,
  UploadCloud,
  Image as ImageIcon,
  Images,
  Info,
  Layers,
  CheckCircle2,
  AlertCircle,
  Key,
  Loader2,
  Shield,
  ShieldAlert,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  XCircle,
  Ban,
  Bold,
  List,
  ListOrdered,
  FileText,
  Sparkles,
  HelpCircle,
  Globe,
  PhoneCall,
  MapPin,
  CreditCard,
  MessageCircle,
  RotateCcw,
  TicketPercent,
  Menu,
  Bug,
  Palette,
  TrendingDown,
  Hash,
  Ruler,
  Video,
  Play,
} from 'lucide-react';
import { extractYouTubeVideoId } from '../utils/youtube';
import { generateProductSlug } from '../utils/seo';
import {
  parseColorOption,
  formatColorOption,
  POPULAR_COLOR_PALETTES,
} from '../utils/productVariants';
import { useStore } from '../context/StoreContext';
import {
  Product,
  Category,
  Order,
  CourierProvider,
  ShippingStatus,
  StoreSettings,
  CarouselSlide,
  CourierApiConfig,
  UserAccount,
  UserRole,
  AdminPermissions,
  ProfitAnalyticsSummary,
  MIN_PASSWORD_LENGTH,
} from '../types';
import { BrandLogo } from './BrandLogo';
import { ConfirmModal } from './ConfirmModal';
import { ErrorBoundary } from './ErrorBoundary';
import { FormattedDescription } from './FormattedDescription';
import { ImageUploadField } from './ImageUploadField';
import { AdminSidebar } from './AdminSidebar';
import { STORAGE_KEYS } from '../context/storageKeys';

// Code-splitting: Lazy-load large admin-only feature tabs and modals
const FeaturedProductsManagement = React.lazy(() =>
  import('./Admin/FeaturedProductsManagement').then((m) => ({ default: m.FeaturedProductsManagement }))
);
const PermissionManagementModal = React.lazy(() =>
  import('./Admin/PermissionManagementModal').then((m) => ({ default: m.PermissionManagementModal }))
);
const AdminSlidesTab = React.lazy(() =>
  import('./AdminSlidesTab').then((m) => ({ default: m.AdminSlidesTab }))
);
const AdminCouriersTab = React.lazy(() =>
  import('./AdminCouriersTab').then((m) => ({ default: m.AdminCouriersTab }))
);
const AdminMarketingPixelsTab = React.lazy(() =>
  import('./AdminMarketingPixelsTab').then((m) => ({ default: m.AdminMarketingPixelsTab }))
);
const AdminVouchersTab = React.lazy(() =>
  import('./AdminVouchersTab').then((m) => ({ default: m.AdminVouchersTab }))
);
const AdminDebugTab = React.lazy(() =>
  import('./AdminDebugTab').then((m) => ({ default: m.AdminDebugTab }))
);
const AdminProfitAnalyticsTab = React.lazy(() =>
  import('./AdminProfitAnalyticsTab').then((m) => ({ default: m.AdminProfitAnalyticsTab }))
);
const AdminReviewsTab = React.lazy(() =>
  import('./AdminReviewsTab').then((m) => ({ default: m.AdminReviewsTab }))
);
import { useAdmin } from '../context/AdminContextDefinition';

const AdminTabFallback: React.FC = () => (
  <div className="py-24 flex flex-col items-center justify-center space-y-3 text-slate-400">
    <div className="w-8 h-8 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
    <span className="text-xs font-medium text-slate-500">Loading module...</span>
  </div>
);
import { uploadApi, profitAnalyticsApi, productsApi } from '../services/storeApi';
import { orderApi } from '../services/orderApi';
import { formatWhatsAppLink, normalizeWhatsAppNumber } from '../utils/phone';
import { copyToClipboardSafe } from '../utils/clipboard';
import { AdminProvider } from '../context/AdminProvider';

interface ConfidentialProfitBadgeProps {
  profitVal: number;
}

const ConfidentialProfitBadge: React.FC<ConfidentialProfitBadgeProps> = ({ profitVal }) => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible((prev) => !prev);
  };

  const isLoss = profitVal < 0;

  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 font-mono select-none ${
      isLoss ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
    }`}>
      {isLoss ? (
        <TrendingDown className="w-3 h-3 text-rose-600 shrink-0" />
      ) : (
        <TrendingUp className="w-3 h-3 text-emerald-600 shrink-0" />
      )}
      <button
        type="button"
        onClick={toggleVisibility}
        className={`p-0.5 rounded focus:outline-hidden focus:ring-1 transition-colors inline-flex items-center justify-center shrink-0 cursor-pointer ${
          isLoss
            ? 'text-rose-700 hover:text-rose-950 hover:bg-rose-200/70 focus:ring-rose-500'
            : 'text-emerald-700 hover:text-emerald-950 hover:bg-emerald-200/70 focus:ring-emerald-500'
        }`}
        title={isVisible ? (isLoss ? 'Hide loss' : 'Hide profit') : (isLoss ? 'Show loss' : 'Show profit')}
        aria-label={isVisible ? (isLoss ? 'Hide loss' : 'Hide profit') : (isLoss ? 'Show loss' : 'Show profit')}
      >
        {isVisible ? (
          <EyeOff className={`w-3 h-3 ${isLoss ? 'text-rose-700' : 'text-emerald-700'}`} />
        ) : (
          <Eye className={`w-3 h-3 ${isLoss ? 'text-rose-600' : 'text-emerald-600'}`} />
        )}
      </button>
      <span>
        {isLoss ? 'Loss: ' : 'Profit: '}
        {isVisible ? (isLoss ? `-৳${Math.abs(profitVal).toLocaleString()}` : `৳${profitVal.toLocaleString()}`) : '••••'}
      </span>
    </span>
  );
};

/**
 * Helper to compute subtotal for order items in the order edit modal.
 * Declared at module level to prevent Temporal Dead Zone ReferenceError during initial render.
 */
export const getEditOrderSubtotal = (items: any[]): number => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const p =
      item?.sellingPriceSnapshot != null && !isNaN(Number(item.sellingPriceSnapshot))
        ? Number(item.sellingPriceSnapshot)
        : Number(item?.product?.price || 0);
    return sum + p * Number(item?.quantity || 1);
  }, 0);
};

const AdminPanelContent: React.FC = () => {
  const {
    products,
    categories,
    orders,
    settings,
    isAdminLoggedIn,
    isAuthInitializing,
    adminLogin,
    adminLogout,
    setCurrentView,
    addProduct,
    updateProduct,
    deleteProduct,
    increaseStock,
    addCategory,
    updateCategory,
    deleteCategory,
    updateOrderStatus,
    updateOrder,
    verifyAndMarkPaid,
    deleteOrder,
    deleteCustomer,
    bookCourier,
    bookWithCourier,
    bookWithSteadfast,
    syncCourierStatus,
    syncAllCourierStatuses,
    cancelCourierBooking,
    slides,
    addSlide,
    updateSlide,
    deleteSlide,
    resetSlides,
    reorderSlides,
    courierConfigs,
    addCourierConfig,
    updateCourierConfig,
    deleteCourierConfig,
    resetCourierConfigs,
    updateSettings,
    resetToDefaultSeed,
    users,
    currentUser,
    adjustProductRating,
    fetchUsers,
    deleteUser,
    resetCustomerPassword,
    changeSuperAdminPassword,
    updateUserRoleAndPermissions,
    hasPermission,
    setIsAuthModalOpen,
    setAuthModalMode,
    isUserAccountModalOpen,
    setIsUserAccountModalOpen,
    setUserAccountModalTab,
    showNotification,
    coupons,
    adminActiveTab,
    setAdminActiveTab,
    adminSettingsSection,
    setSelectedCategory,
    setSearchQuery,
    isOrdersLoading,
    orderPage,
    setOrderPage,
    orderPageSize,
    setOrderPageSize,
    orderTotalCount,
    orderTotalPages,
    orderSummary,
    setOrderQueryFilters,
    featuredProducts,
    toggleProductFeatured,
  } = useStore();

  // Authentication states (start empty for security, no auto-fill)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [accountFeedback, setAccountFeedback] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState('');

  // 1-Click Steadfast Booking States
  const [isBookingSteadfast, setIsBookingSteadfast] = useState<string | null>(null);
  const [isSyncingCouriers, setIsSyncingCouriers] = useState(false);
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const [steadfastNotice, setSteadfastNotice] = useState<{
    id: string;
    message: string;
    isError?: boolean;
  } | null>(null);

  // RBAC & Permissions Management Modal States
  const [permissionsModalUser, setPermissionsModalUser] = useState<UserAccount | null>(null);
  const [selectedStaffUserId, setSelectedStaffUserId] = useState<string>('');

  const admin = useAdmin();

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'overview' | 'profit' | 'orders' | 'products' | 'reviews' | 'categories' | 'slides' | 'couriers' | 'settings' | 'users' | 'pixels' | 'vouchers' | 'debug'
  >((adminActiveTab as any) || 'overview');

  const handleSelectTab = useCallback((tabId: string) => {
    const targetTab = tabId === 'customers' || tabId === 'accounts' ? 'users' : tabId;
    setActiveTab(targetTab as any);
    setAdminActiveTab(targetTab);
  }, [setAdminActiveTab]);

  const handleManualLogout = useCallback(() => {
    setIsAdminProfileDropdownOpen(false);
    adminLogout();
    setCurrentView('store');
    try {
      localStorage.removeItem(STORAGE_KEYS.ADMIN_LAST_TAB);
      localStorage.removeItem(STORAGE_KEYS.ADMIN_LAST_ACTIVITY);
    } catch {}
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
  }, [adminLogout, setCurrentView]);

  // Product stock filter
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const [stockQuickAddAmount, setStockQuickAddAmount] = useState<Record<string, number>>({});
  const [stockSuccessNotice, setStockSuccessNotice] = useState<string | null>(null);

  // Product CRUD states
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodTitle, setProdTitle] = useState('');
  const [prodSlug, setProdSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [prodPrice, setProdPrice] = useState<number | string>(0);
  const [prodOriginalPrice, setProdOriginalPrice] = useState<number>(0);
  const [prodBuyingPrice, setProdBuyingPrice] = useState<number | string>('');
  const [showBuyingPrice, setShowBuyingPrice] = useState(false);
  const [showUnitProfit, setShowUnitProfit] = useState(false);
  const [prodCategory, setProdCategory] = useState('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodImage, setProdImage] = useState('');
  const [prodImageMode, setProdImageMode] = useState<'single' | 'multiple'>('single');
  const [prodGalleryImages, setProdGalleryImages] = useState<string[]>([]);
  const [newGalleryInput, setNewGalleryInput] = useState('');
  const [bulkGalleryInput, setBulkGalleryInput] = useState('');
  const [isBulkInputOpen, setIsBulkInputOpen] = useState(false);
  const [prodImageSource, setProdImageSource] = useState<'upload' | 'url'>('upload');
  const [isDraggingPrimary, setIsDraggingPrimary] = useState(false);
  const [isDraggingGallery, setIsDraggingGallery] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const primaryFileInputRef = useRef<HTMLInputElement>(null);
  const galleryFileInputRef = useRef<HTMLInputElement>(null);
  const [prodStock, setProdStock] = useState<number>(10);
  const [prodFeatured, setProdFeatured] = useState(false);
  const [prodRating, setProdRating] = useState<number>(5.0);
  const [prodReviewsCount, setProdReviewsCount] = useState<number>(0);
  const [prodVideoUrl, setProdVideoUrl] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Description formatting states & ref
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDescPreview, setShowDescPreview] = useState(false);

  // Custom Product Sizes & Colors states
  const [prodSizes, setProdSizes] = useState<string[]>([]);
  const [newSizeInput, setNewSizeInput] = useState('');
  const [numericSizeVal, setNumericSizeVal] = useState('');
  const [numericSizeUnit, setNumericSizeUnit] = useState<string>('none');
  const [customNumericSuffix, setCustomNumericSuffix] = useState('');
  const [showRangeTool, setShowRangeTool] = useState(false);
  const [rangeStart, setRangeStart] = useState<number | ''>(28);
  const [rangeEnd, setRangeEnd] = useState<number | ''>(38);
  const [rangeStep, setRangeStep] = useState<number | ''>(2);
  const [rangeUnit, setRangeUnit] = useState<string>('none');

  const [prodColors, setProdColors] = useState<string[]>([]);
  const [newColorInput, setNewColorInput] = useState('');
  const [newColorHex, setNewColorHex] = useState('#1e3a8a');
  const [displaySpecificColor, setDisplaySpecificColor] = useState(true);

  // Quick Rating Adjustment Modal State
  const [ratingModalProduct, setRatingModalProduct] = useState<Product | null>(null);
  const [customRatingValue, setCustomRatingValue] = useState<number>(5.0);
  const [customReviewsCount, setCustomReviewsCount] = useState<number>(0);
  const [ratingSaveSuccess, setRatingSaveSuccess] = useState<string | null>(null);

  // Category CRUD states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');

  // D1 Database saving and error states
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Courier parcel booking modal states
  const [courierModalOrder, setCourierModalOrder] = useState<Order | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<CourierProvider>('Steadfast');
  const [rowSelectedCouriers, setRowSelectedCouriers] = useState<Record<string, string>>({});
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);
  const [courierDeliveryType, setCourierDeliveryType] = useState<number>(0); // 0 = Home Delivery, 1 = Point Delivery / Hub Pickup
  const [courierRecipientName, setCourierRecipientName] = useState('');
  const [courierRecipientPhone, setCourierRecipientPhone] = useState('');
  const [courierAltPhone, setCourierAltPhone] = useState('');
  const [courierRecipientEmail, setCourierRecipientEmail] = useState('');
  const [courierRecipientAddress, setCourierRecipientAddress] = useState('');
  const [courierRecipientArea, setCourierRecipientArea] = useState('');
  const [courierRecipientDistrict, setCourierRecipientDistrict] = useState('');
  const [courierCodAmount, setCourierCodAmount] = useState<number>(0);
  const [courierWeight, setCourierWeight] = useState('0.5');
  const [courierTotalLot, setCourierTotalLot] = useState<number>(1);
  const [courierItemDescription, setCourierItemDescription] = useState('');
  const [courierNote, setCourierNote] = useState('');
  const [courierBookingError, setCourierBookingError] = useState<string | null>(null);
  const [courierForceDuplicate, setCourierForceDuplicate] = useState(false);
  const [inlineSfApiKey, setInlineSfApiKey] = useState('');
  const [inlineSfSecretKey, setInlineSfSecretKey] = useState('');
  const [showInlineSfKeys, setShowInlineSfKeys] = useState(false);
  const [isTestingSettingsSf, setIsTestingSettingsSf] = useState(false);
  const [settingsSfTestResult, setSettingsSfTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Order Edit Modal state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerDistrict, setEditCustomerDistrict] = useState('');
  const [editCustomerAddress, setEditCustomerAddress] = useState('');
  const [editCustomerNotes, setEditCustomerNotes] = useState('');
  const [editCustomerZone, setEditCustomerZone] = useState<'inside_dhaka' | 'outside_dhaka'>('inside_dhaka');
  const [editDeliveryFee, setEditDeliveryFee] = useState<number>(80);
  const [editTotalAmount, setEditTotalAmount] = useState<number>(0);
  const [editShippingStatus, setEditShippingStatus] = useState<ShippingStatus>('Pending');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'DUE' | 'PAID' | 'UNVERIFIED' | 'Pending COD'>('DUE');
  const [editBankTrxId, setEditBankTrxId] = useState('');
  const [editSenderBank, setEditSenderBank] = useState('');
  const [editSenderAccount, setEditSenderAccount] = useState('');
  const [editCourierProvider, setEditCourierProvider] = useState('');
  const [editCourierWaybill, setEditCourierWaybill] = useState('');
  const [editOrderItems, setEditOrderItems] = useState<any[]>([]);
  const [isAddItemToOrderOpen, setIsAddItemToOrderOpen] = useState(false);
  const [selectedAddProductId, setSelectedAddProductId] = useState('');
  const [orderItemCustomAdjust, setOrderItemCustomAdjust] = useState<Record<number, string>>({});
  const [editAdvancePayment, setEditAdvancePayment] = useState<number | string>(0);
  const [editAdvanceMethod, setEditAdvanceMethod] = useState<string>('Cash / Advance');
  const [editAdvanceNote, setEditAdvanceNote] = useState<string>('');

  // Password Reset Modal state
  const [resettingUser, setResettingUser] = useState<UserAccount | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  // Super Admin Password Change & Testing Credentials Visibility
  const [isSuperAdminPwModalOpen, setIsSuperAdminPwModalOpen] = useState(false);
  const [superAdminCurrentPw, setSuperAdminCurrentPw] = useState('');
  const [superAdminNewPw, setSuperAdminNewPw] = useState('');
  const [superAdminConfirmPw, setSuperAdminConfirmPw] = useState('');
  const [showSuperAdminPwInputs, setShowSuperAdminPwInputs] = useState(false);
  const [superAdminPwError, setSuperAdminPwError] = useState('');
  const [visibleCredentialsPasswords, setVisibleCredentialsPasswords] = useState<Record<string, boolean>>({});

  // Screenshot Preview Modal
  const [previewSlipUrl, setPreviewSlipUrl] = useState<string | null>(null);

  // Settings local state initialized directly from canonical StoreContext / D1 settings
  const [settingsForm, setSettingsForm] = useState<StoreSettings>(settings);
  const [settingsSavedNotice, setSettingsSavedNotice] = useState(false);
  const [isSettingsFormDirty, setIsSettingsFormDirty] = useState(false);

  // In-app unified confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'danger',
    onConfirm: () => {},
  });

  // Navigation & Sub-nav States
  const [isAdminProfileDropdownOpen, setIsAdminProfileDropdownOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const adminProfileDropdownRef = useRef<HTMLDivElement>(null);
  const [isSubNavExpanded, setIsSubNavExpanded] = useState(true);

  // Tabs scroll container ref & bidirectional navigation handlers
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const handleScrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      const scrollAmount = direction === 'left' ? -280 : 280;
      tabsContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Status & entity filters across modules
  // 1. Orders & Courier API status filter: displays only selected status items and hides the rest
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'Pending' | 'Shipped' | 'Delivered' | 'Cancelled'>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'all' | 'PAID' | 'DUE' | 'dbbl' | 'cod'>('all');
  const [orderSortBy, setOrderSortBy] = useState<'newest' | 'oldest' | 'amount-desc' | 'amount-asc'>('newest');

  // Synchronize Admin Orders filter/search/sort state with server-side paginated query in StoreContext
  const prevOrderFilterKeyRef = useRef<string>('all__all____newest__25');
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedSearch = orderSearch.trim();
      const filterKey = `${orderStatusFilter}__${orderPaymentFilter}__${trimmedSearch}__${orderSortBy}__${orderPageSize}`;
      if (prevOrderFilterKeyRef.current !== filterKey) {
        prevOrderFilterKeyRef.current = filterKey;
        setOrderPage(1);
      }
      setOrderQueryFilters((prev) => {
        if (
          prev.status === orderStatusFilter &&
          prev.payment === orderPaymentFilter &&
          prev.search === trimmedSearch &&
          prev.sortBy === orderSortBy
        ) {
          return prev;
        }
        return {
          status: orderStatusFilter,
          payment: orderPaymentFilter,
          search: trimmedSearch,
          sortBy: orderSortBy,
        };
      });
    }, orderSearch.trim() ? 220 : 0);

    return () => clearTimeout(timer);
  }, [orderStatusFilter, orderPaymentFilter, orderSearch, orderSortBy, orderPageSize, setOrderPage, setOrderQueryFilters]);

  // 2. Product Management filters
  const [productStockFilter, setProductStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'featured'>('all');
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('all');
  const [productsSubView, setProductsSubView] = useState<'all' | 'featured'>('all');

  // 3. Categories filters
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'with_products' | 'empty'>('all');
  const [categorySearch, setCategorySearch] = useState('');

  // 4. Overview & Analytics focus filter
  const [overviewFocusFilter, setOverviewFocusFilter] = useState<'all' | 'revenue' | 'orders_health' | 'inventory'>('all');

  // 5. Store Settings section filter
  const [settingsSectionFilter, setSettingsSectionFilter] = useState<'all' | 'bank' | 'delivery' | 'footer' | 'general' | 'pixels' | 'courier'>(
    (adminSettingsSection as any) || 'all'
  );

  // 6. Accounts role filter
  const [accountRoleFilter, setAccountRoleFilter] = useState<'all' | 'super_admin' | 'sub_admin' | 'admin' | 'customer'>('all');

  // Sync tab & section when externally requested via openAdminSettingsSection or deep-linking
  useEffect(() => {
    if (adminActiveTab) {
      setActiveTab(adminActiveTab as any);
    }
  }, [adminActiveTab]);

  useEffect(() => {
    if (adminSettingsSection) {
      setSettingsSectionFilter(adminSettingsSection as any);
    }
  }, [adminSettingsSection]);

  // Keep settingsForm fresh when canonical store settings update from D1, but NEVER overwrite while user is on settings tab or has unsaved edits
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    if (activeTab === 'settings') {
      // If user just navigated to the settings tab from another tab and form is not dirty, load latest canonical settings
      if (prevActiveTabRef.current !== 'settings' && !isSettingsFormDirty && !isSavingSettings) {
        setSettingsForm(settings);
      }
      // While activeTab === 'settings', do NOT allow background polling (every 7s) to overwrite form state
    } else {
      // When on other tabs and form is clean, keep settings in sync
      if (!isSettingsFormDirty && !isSavingSettings) {
        setSettingsForm(settings);
      }
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab, settings, isSettingsFormDirty, isSavingSettings]);

  // Robust field updater helpers that reliably flag form dirty and preserve state
  const updateSetting = <K extends keyof StoreSettings>(field: K, value: StoreSettings[K]) => {
    setIsSettingsFormDirty(true);
    setSettingsForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateFooterSetting = (field: string, value: any) => {
    setIsSettingsFormDirty(true);
    setSettingsForm((prev) => ({
      ...prev,
      footer: {
        ...(prev.footer || {}),
        [field]: value,
      },
    }));
  };

  const updateDbblSetting = (field: string, value: any) => {
    setIsSettingsFormDirty(true);
    setSettingsForm((prev) => ({
      ...prev,
      dbblBank: {
        ...(prev.dbblBank || {
          bankName: '',
          accountHolderName: '',
          accountNumber: '',
          branchName: '',
          routingNumber: '',
          qrCodeUrl: '',
          instructions: '',
        }),
        [field]: value,
      },
    }));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        adminProfileDropdownRef.current &&
        !adminProfileDropdownRef.current.contains(event.target as Node)
      ) {
        setIsAdminProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Privileged check: Strictly requires valid authenticated admin session AND privileged user role
  const isPrivilegedAdmin =
    isAdminLoggedIn &&
    Boolean(
      currentUser &&
      (currentUser.role === 'super_admin' ||
        currentUser.role === 'admin' ||
        currentUser.role === 'sub_admin')
    );

  // Super Admin security check: Strictly Super Administrator only
  const isSuperAdmin = Boolean(
    isPrivilegedAdmin &&
    currentUser &&
    currentUser.role === 'super_admin'
  );

  // Granular financial permissions for buying prices and profit visibility
  const canViewBuyingPrice = Boolean(
    isSuperAdmin ||
    hasPermission('product.view_buying_price') ||
    hasPermission('product.manage_buying_price') ||
    hasPermission('product.buying_price')
  );

  const canViewProfit = Boolean(
    isSuperAdmin ||
    hasPermission('product.view_profit') ||
    hasPermission('report.profit')
  );

  const canManageOrders = Boolean(
    isSuperAdmin ||
    hasPermission('order.manage') ||
    hasPermission('canManageOrders')
  );

  // Computed values for current order being edited (Authoritative live preview)
  const editComputedSubtotal = useMemo(() => {
    return getEditOrderSubtotal(editOrderItems);
  }, [editOrderItems]);

  const editComputedDiscount = editingOrder?.discountAmount || 0;
  const editComputedGrandTotal = Math.max(0, editComputedSubtotal + editDeliveryFee - editComputedDiscount);

  const editParsedAdvance = useMemo(() => {
    if (typeof editAdvancePayment === 'number') return editAdvancePayment;
    if (!editAdvancePayment || String(editAdvancePayment).trim() === '') return 0;
    return Number(editAdvancePayment);
  }, [editAdvancePayment]);

  const isEditAdvanceInvalid = typeof editAdvancePayment === 'string' && editAdvancePayment.trim() !== '' && isNaN(Number(editAdvancePayment));
  const isEditAdvanceNegative = !isEditAdvanceInvalid && editParsedAdvance < 0;
  const isEditAdvanceExceedingTotal = !isEditAdvanceInvalid && !isEditAdvanceNegative && editParsedAdvance > editComputedGrandTotal;

  const editAdvanceValidationError = useMemo(() => {
    if (isEditAdvanceInvalid) {
      return 'Invalid advance payment amount: Please enter a valid number.';
    }
    if (isEditAdvanceNegative) {
      return 'Invalid advance payment: Advance payment cannot be negative (must be 0 or more).';
    }
    if (isEditAdvanceExceedingTotal) {
      return `Advance payment (৳${editParsedAdvance.toLocaleString()} BDT) cannot exceed order total (৳${editComputedGrandTotal.toLocaleString()} BDT).`;
    }
    return null;
  }, [isEditAdvanceInvalid, isEditAdvanceNegative, isEditAdvanceExceedingTotal, editParsedAdvance, editComputedGrandTotal]);

  const editComputedCustomerDue = Math.max(
    0,
    Math.round((editComputedGrandTotal - (isEditAdvanceInvalid || isEditAdvanceNegative ? 0 : editParsedAdvance)) * 100) / 100
  );

  const { editLiveCost, editLiveProfit } = useMemo(() => {
    let costSum = 0;
    for (const it of editOrderItems) {
      const bp = it.buyingPriceSnapshot != null
        ? Number(it.buyingPriceSnapshot)
        : (it.product?.buyingPrice != null ? Number(it.product.buyingPrice) : 0);
      costSum += bp * Number(it.quantity || 1);
    }
    return {
      editLiveCost: costSum,
      editLiveProfit: editComputedSubtotal - costSum,
    };
  }, [editOrderItems, editComputedSubtotal]);

  // Executive Dashboard Profit & Financial summaries
  const [todayProfit, setTodayProfit] = useState<ProfitAnalyticsSummary | null>(null);
  const [monthProfit, setMonthProfit] = useState<ProfitAnalyticsSummary | null>(null);

  useEffect(() => {
    if (canViewProfit) {
      profitAnalyticsApi.getSummary({ period: 'today' }).then((res) => setTodayProfit(res)).catch(() => {});
      profitAnalyticsApi.getSummary({ period: 'month' }).then((res) => setMonthProfit(res)).catch(() => {});
    }
  }, [canViewProfit, orders.length]);

  // Auto-Sync: When Admin Panel loads, run a background sync for active 'Shipped' orders to capture real-time delivery confirmations
  useEffect(() => {
    if (isPrivilegedAdmin && (hasPermission('order.manage') || hasPermission('courier.dispatch') || hasPermission('canManageOrders'))) {
      const activeShipped = orders.filter(
        (o) =>
          (o.shippingStatus === 'Shipped' || o.courierStatus === 'In Transit') &&
          (o.courierWaybill || o.courierBooking?.waybillId || o.consignmentId)
      );
      if (activeShipped.length > 0) {
        syncAllCourierStatuses().catch(() => {});
      }
    }
  }, [isPrivilegedAdmin]);

  // Synchronize users directory directly from authoritative D1 database when Users tab is opened
  useEffect(() => {
    if (activeTab === 'users' && hasPermission('canManageAccounts')) {
      fetchUsers().catch(() => {});
    }
  }, [activeTab, hasPermission, fetchUsers]);

  // --- INACTIVITY AUTO-LOGOUT (30 MINUTES CONTINUOUS INACTIVITY) ---
  const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const ACTIVITY_THROTTLE_MS = 3000; // 3 seconds write throttle
  const ADMIN_ACTIVITY_KEY = STORAGE_KEYS.ADMIN_LAST_ACTIVITY;

  useEffect(() => {
    if (!isPrivilegedAdmin) return;

    let lastRecorded = Date.now();
    try {
      localStorage.setItem(ADMIN_ACTIVITY_KEY, lastRecorded.toString());
    } catch {}

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastRecorded > ACTIVITY_THROTTLE_MS) {
        lastRecorded = now;
        try {
          localStorage.setItem(ADMIN_ACTIVITY_KEY, now.toString());
        } catch {}
      }
    };

    // Meaningful interactions: movement, click, typing, scrolling, touching across Admin Panel
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'pointerdown'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    // Check timer every 10 seconds
    const interval = setInterval(() => {
      let lastActivityTime = lastRecorded;
      try {
        const stored = localStorage.getItem(ADMIN_ACTIVITY_KEY);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed)) {
            lastActivityTime = Math.max(lastActivityTime, parsed);
          }
        }
      } catch {}

      if (Date.now() - lastActivityTime >= INACTIVITY_TIMEOUT_MS) {
        // 30 minutes of inactivity reached!
        try {
          localStorage.removeItem(ADMIN_ACTIVITY_KEY);
        } catch {}
        // Invalidate session on server and client using existing authentication architecture
        adminLogout();
        setAuthError('You have been automatically logged out due to 30 minutes of inactivity. Please log in again.');
      }
    }, 10000);

    // Synchronize across multiple open browser tabs of the same authenticated Admin session
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === ADMIN_ACTIVITY_KEY && e.newValue) {
        const val = parseInt(e.newValue, 10);
        if (!isNaN(val)) {
          lastRecorded = Math.max(lastRecorded, val);
        }
      } else if (e.key === STORAGE_KEYS.ADMIN_AUTH && e.newValue === null) {
        adminLogout();
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
      window.removeEventListener('storage', handleStorageEvent);
      clearInterval(interval);
    };
  }, [isPrivilegedAdmin, adminLogout]);

  // While startup server-session verification (/api/auth/me) is in flight, show clean loading screen
  if (isAuthInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <p className="text-sm font-medium text-slate-300">Verifying security session...</p>
        </div>
      </div>
    );
  }

  // --- LOGIN SCREEN ---
  if (!isPrivilegedAdmin) {
    const handleLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      const success = await adminLogin(username.trim(), password.trim());
      if (!success) {
        setAuthError('Invalid credentials. Check your admin email/username and password.');
      }
    };

    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 py-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
          <div className="h-2 w-full rainbow-gradient-bg" />

          <div className="p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-2">
                <BrandLogo size="lg" />
              </div>
              <h2 className="text-2xl font-bold font-display text-slate-800">
                Admin Management Portal
              </h2>
              <p className="text-xs text-slate-500">
                Enter your administrative credentials (email or username) to access product controls, rating adjustments, categories & couriers.
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {authError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Admin Email / Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-username-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin@rongdhonutrade.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Admin Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    required
                  />
                </div>
              </div>

              {/* Secure Admin Portal Notice */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Enter authorized administrator credentials to access the management portal.</span>
              </div>

              <button
                id="admin-login-submit-btn"
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all"
              >
                Authorize & Open Admin Dashboard
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100 space-y-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('login');
                  setIsAuthModalOpen(true);
                  setCurrentView('store');
                }}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <User className="w-3.5 h-3.5 text-rose-600" />
                Regular Customer? Log in / Sign up to Store
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('store')}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center justify-center gap-1 mx-auto pt-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to Storefront
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- METRICS COMPUTATION (Backed by authoritative server-side D1 summary stats) ---
  const totalRevenue = orderSummary ? orderSummary.totalRevenue : orders.reduce((sum, ord) => sum + ord.totalAmount, 0);
  const totalOrdersCount = orderSummary ? orderSummary.totalAll : (orderTotalCount || orders.length);
  const totalProductsCount = products.length;
  const lowStockProducts = products.filter((p) => p.stock <= 5);

  // Dedicated Admin Dashboard metrics requested:
  // 1. Total Delivery Value
  const totalDeliveryValue = orderSummary ? orderSummary.totalDeliveryValue : orders.reduce((sum, ord) => sum + (ord.deliveryFee || 0), 0);

  // 2. Cancelled Orders & Count
  const cancelledOrders = orders.filter(
    (ord) => ord.shippingStatus === 'Cancelled' || ord.courierStatus === 'Returned / Cancelled'
  );
  const cancelledOrdersCount = orderSummary ? orderSummary.cancelledCount : cancelledOrders.length;

  // 3. Total Value of Cancelled Products
  const totalCancelledProductsValue = orderSummary
    ? orderSummary.cancelledProductsValue
    : cancelledOrders.reduce((sum, ord) => {
        if (ord.items && ord.items.length > 0) {
          return sum + ord.items.reduce((itemSum, it) => itemSum + ((it.product?.price || 0) * it.quantity), 0);
        }
        return sum + (ord.subtotal ?? Math.max(0, ord.totalAmount - (ord.deliveryFee || 0)));
      }, 0);

  const totalCancelledOrdersValue = orderSummary
    ? orderSummary.cancelledOrdersValue
    : cancelledOrders.reduce((sum, ord) => sum + ord.totalAmount, 0);

  // Status breakdown counts (matching case-insensitively and across status variants)
  const pendingOrdersCount = orderSummary
    ? orderSummary.pendingCount
    : orders.filter(
        (ord) =>
          (ord.shippingStatus || '').toLowerCase() === 'pending' ||
          ((ord as any).status || '').toLowerCase() === 'pending' ||
          ((ord as any).status || '').toLowerCase() === 'processing'
      ).length;
  const shippedOrdersCount = orderSummary
    ? orderSummary.shippedCount
    : orders.filter(
        (ord) =>
          (ord.shippingStatus || '').toLowerCase() === 'shipped' ||
          ((ord as any).status || '').toLowerCase() === 'shipped'
      ).length;
  const deliveredOrdersCount = orderSummary
    ? orderSummary.deliveredCount
    : orders.filter(
        (ord) =>
          (ord.shippingStatus || '').toLowerCase() === 'delivered' ||
          ((ord as any).status || '').toLowerCase() === 'delivered'
      ).length;

  // Real-time backend system warning counter for the App Debug & Warnings tab
  const totalWarningsCount = useMemo(() => {
    let count = 0;
    const outOfStock = products.filter((p) => p.stock === 0).length;
    const pendingOrd = orderSummary
      ? orderSummary.pendingCount
      : orders.filter(
          (o) => (o.shippingStatus || '').toLowerCase() === 'pending' || ((o as any).status || '').toLowerCase() === 'pending'
        ).length;
    const unverifiedDBBL = orderSummary
      ? orderSummary.unverifiedDbblCount
      : orders.filter(
          (o) => o.paymentMethod === 'dbbl' && (o.paymentStatus === 'DUE' || o.paymentStatus === 'Pending COD')
        ).length;
    count += outOfStock;
    count += pendingOrd;
    count += unverifiedDBBL;
    const steadfast = courierConfigs.find((c) => c.code.toLowerCase().includes('steadfast'));
    if (!steadfast || !steadfast.apiKey || steadfast.apiKey.includes('YOUR_')) {
      count += 1;
    }
    return count;
  }, [products, orders, orderSummary, courierConfigs]);

  // Orders displayed in table:
  // Server-side pagination and database-level filtering return the exact page slice in `orders`,
  // while keeping local optimistic responsiveness for immediate status/search feedback.
  const displayedOrders = orders.filter((ord) => {
    // 1. Shipping Status Filter
    if (orderStatusFilter !== 'all') {
      const filterKey = orderStatusFilter.toLowerCase();
      const currentShipping = (ord.shippingStatus || '').toLowerCase();
      const currentStatus = ((ord as any).status || '').toLowerCase();
      const currentCourier = (ord.courierStatus || '').toLowerCase();

      if (filterKey === 'cancelled') {
        const isCancelled =
          currentShipping === 'cancelled' ||
          currentStatus === 'cancelled' ||
          currentCourier.includes('cancel') ||
          currentCourier.includes('return');
        if (!isCancelled) return false;
      } else if (filterKey === 'pending') {
        const isPending =
          currentShipping === 'pending' ||
          currentStatus === 'pending' ||
          currentStatus === 'processing' ||
          currentCourier.includes('pending') ||
          currentCourier.includes('pickup');
        if (!isPending) return false;
      } else if (filterKey === 'shipped') {
        const isShipped =
          currentShipping === 'shipped' ||
          currentStatus === 'shipped' ||
          currentCourier.includes('ship') ||
          currentCourier.includes('transit');
        if (!isShipped) return false;
      } else if (filterKey === 'delivered') {
        const isDelivered =
          currentShipping === 'delivered' ||
          currentStatus === 'delivered' ||
          currentCourier.includes('deliver');
        if (!isDelivered) return false;
      } else {
        if (currentShipping !== filterKey && currentStatus !== filterKey) {
          return false;
        }
      }
    }

    // 2. Payment Filter
    if (orderPaymentFilter !== 'all') {
      const isPaid = ord.paymentStatus === 'Paid' || ord.paymentStatus === 'PAID';
      if (orderPaymentFilter === 'PAID' && !isPaid) return false;
      if (orderPaymentFilter === 'DUE' && isPaid) return false;
      if (orderPaymentFilter === 'dbbl' && ord.paymentMethod !== 'dbbl') return false;
      if (orderPaymentFilter === 'cod' && ord.paymentMethod !== 'cod') return false;
    }

    // 3. Search query
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase().trim();
      const matchNum = ord.orderNumber.toLowerCase().includes(q);
      const matchName = ord.customer.fullName.toLowerCase().includes(q);
      const matchPhone = ord.customer.phone.includes(q);
      const matchAddress = ord.customer.fullAddress.toLowerCase().includes(q) || (ord.customer.district && ord.customer.district.toLowerCase().includes(q));
      const matchWaybill = ord.courierBooking?.waybillId?.toLowerCase().includes(q);
      const matchTrx = ord.transactionId?.toLowerCase().includes(q);
      if (!matchNum && !matchName && !matchPhone && !matchAddress && !matchWaybill && !matchTrx) {
        return false;
      }
    }
    return true;
  });

  // Filtered Products list:
  const inStockProductsCount = products.filter((p) => p.stock > 5).length;
  const outOfStockProductsCount = products.filter((p) => p.stock === 0).length;
  const featuredProductsCount = products.filter((p) => p.featured).length;

  const displayedProducts = products.filter((p) => {
    // Stock filter
    if (productStockFilter === 'low_stock' && p.stock > 5) return false;
    if (productStockFilter === 'out_of_stock' && p.stock !== 0) return false;
    if (productStockFilter === 'in_stock' && p.stock <= 5) return false;
    if (productStockFilter === 'featured' && !p.featured) return false;
    if (filterLowStockOnly && p.stock > 5) return false;

    // Category filter
    if (productCategoryFilter !== 'all' && p.categoryId !== productCategoryFilter) return false;

    // Search query
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchDesc = p.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    return true;
  });

  // Filtered Categories list:
  const displayedCategories = categories.filter((cat) => {
    const productCount = products.filter((p) => p.categoryId === cat.id).length;
    if (categoryFilter === 'with_products' && productCount === 0) return false;
    if (categoryFilter === 'empty' && productCount > 0) return false;
    if (categorySearch.trim()) {
      const q = categorySearch.toLowerCase();
      const matchName = cat.name.toLowerCase().includes(q);
      const matchDesc = cat.description ? cat.description.toLowerCase().includes(q) : false;
      if (!matchName && !matchDesc) return false;
    }
    return true;
  });

  // Filtered Accounts list:
  const displayedUsers = users.filter((u) => {
    const isSuperAdminAccount = u.role === 'super_admin';
    if (accountRoleFilter !== 'all') {
      if (accountRoleFilter === 'super_admin' && !isSuperAdminAccount) return false;
      if (accountRoleFilter === 'sub_admin' && u.role !== 'sub_admin') return false;
      if (accountRoleFilter === 'admin' && u.role !== 'admin') return false;
      if (accountRoleFilter === 'customer' && u.role !== 'customer') return false;
    }
    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      const matchName = u.name.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      const matchRole = u.role.toLowerCase().includes(q);
      const matchPhone = u.phone ? u.phone.includes(q) : false;
      if (!matchName && !matchEmail && !matchRole && !matchPhone) return false;
    }
    return true;
  });

  // --- PRODUCT IMAGE PROCESSING & UPLOAD HELPERS ---
  const processImageFile = async (file: File): Promise<string> => {
    if (!file.type.startsWith('image/')) {
      throw new Error(`"${file.name}" is not a recognized image. Please select a JPG, PNG, WebP, GIF, or SVG file.`);
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error(`"${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed is 15MB.`);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file from device.'));
      reader.onload = () => {
        const rawResult = reader.result as string;
        if (file.type === 'image/svg+xml' || file.size < 60 * 1024) {
          resolve(rawResult);
          return;
        }

        const img = new Image();
        img.onerror = () => resolve(rawResult);
        img.onload = () => {
          try {
            const maxDim = 1200;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(rawResult);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const compressed = canvas.toDataURL(mime, 0.85);
            resolve(compressed);
          } catch {
            resolve(rawResult);
          }
        };
        img.src = rawResult;
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePrimaryFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      setIsProcessingImage(true);
      const dataUrl = await processImageFile(file);
      setProdImage(dataUrl);
      setProdImageSource('upload');
      showNotification('success', 'Cover Photo Uploaded', `Loaded "${file.name}" from your device.`);
    } catch (err: any) {
      showNotification('error', 'Upload Failed', err.message || 'Could not process image.');
    } finally {
      setIsProcessingImage(false);
      if (primaryFileInputRef.current) {
        primaryFileInputRef.current.value = '';
      }
    }
  };

  const handleGalleryFilesSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      setIsProcessingImage(true);
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          try {
            const dataUrl = await processImageFile(file);
            newUrls.push(dataUrl);
          } catch {
            // skip invalid file
          }
        }
      }
      if (newUrls.length > 0) {
        setProdGalleryImages((prev) => [...prev, ...newUrls]);
        showNotification(
          'success',
          'Gallery Photos Added',
          `Added ${newUrls.length} image${newUrls.length > 1 ? 's' : ''} from your device to the gallery.`
        );
      } else {
        showNotification('error', 'No Valid Images', 'Please select valid image files.');
      }
    } catch (err: any) {
      showNotification('error', 'Gallery Upload Error', err.message || 'Could not process images.');
    } finally {
      setIsProcessingImage(false);
      if (galleryFileInputRef.current) {
        galleryFileInputRef.current.value = '';
      }
    }
  };

  // --- PRODUCT CRUD HANDLERS ---
  const openNewProductModal = () => {
    if (!hasPermission('product.create')) {
      showNotification('error', 'Access Denied', 'Permission required: product.create to add new products.');
      return;
    }
    setEditingProduct(null);
    setProductFormError(null);
    setProdTitle('');
    setProdSlug('');
    setIsSlugManuallyEdited(false);
    setProdPrice(1000);
    setProdOriginalPrice(1300);
    setProdBuyingPrice('');
    setShowBuyingPrice(false);
    setShowUnitProfit(false);
    setProdCategory(categories[0]?.id || '');
    setProdDescription('');
    setShowDescPreview(false);
    setProdImage('');
    setProdImageSource('upload');
    setIsDraggingPrimary(false);
    setIsDraggingGallery(false);
    setProdGalleryImages([]);
    setProdImageMode('single');
    setNewGalleryInput('');
    setBulkGalleryInput('');
    setIsBulkInputOpen(false);
    setProdStock(15);
    setProdFeatured(false);
    setProdRating(5.0);
    setProdReviewsCount(0);
    setProdVideoUrl('');
    setProdSizes([]);
    setNewSizeInput('');
    setNumericSizeVal('');
    setNumericSizeUnit('none');
    setCustomNumericSuffix('');
    setShowRangeTool(false);
    setProdColors([]);
    setNewColorInput('');
    setNewColorHex('#1e3a8a');
    setDisplaySpecificColor(true);
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product: Product) => {
    if (!hasPermission('product.update')) {
      showNotification('error', 'Access Denied', 'Permission required: product.update to edit products.');
      return;
    }
    setEditingProduct(product);
    setProductFormError(null);
    setProdTitle(product.title);
    setProdSlug(product.slug || generateProductSlug(product.title));
    setIsSlugManuallyEdited(true);
    setProdPrice(product.price);
    setProdOriginalPrice(product.originalPrice || 0);

    // Root cause fix & debugging:
    // Support both camelCase (buyingPrice) and snake_case (buying_price) representations.
    // If the product in the local table was loaded before authentication was elevated,
    // also fetch the fresh single-product details asynchronously to ensure the persisted
    // buying price is reliably populated into the edit form state.
    const initialBuyingPrice = product.buyingPrice != null
      ? product.buyingPrice
      : ((product as any).buying_price != null ? (product as any).buying_price : '');
    setProdBuyingPrice(initialBuyingPrice);
    setShowBuyingPrice(false);
    setShowUnitProfit(false);

    if (isSuperAdmin || hasPermission('product.view_buying_price') || hasPermission('product.manage_buying_price')) {
      productsApi.getById(product.id).then((freshProduct) => {
        if (freshProduct) {
          const freshBp = freshProduct.buyingPrice != null
            ? freshProduct.buyingPrice
            : ((freshProduct as any).buying_price != null ? (freshProduct as any).buying_price : null);
          if (freshBp != null) {
            setProdBuyingPrice(freshBp);
            setEditingProduct((prev) => (prev && prev.id === product.id ? { ...prev, buyingPrice: freshBp } : prev));
          }
        }
      }).catch(() => {});
    }

    setProdCategory(product.categoryId);
    setProdDescription(product.description);
    setShowDescPreview(false);
    setProdImage(product.imageUrl);
    setProdImageSource(product.imageUrl.startsWith('data:') ? 'upload' : 'url');
    setIsDraggingPrimary(false);
    setIsDraggingGallery(false);

    // Extract any additional gallery images
    const extraImages = (product.images && product.images.length > 0)
      ? product.images.filter((img) => img && img.trim() && img.trim() !== product.imageUrl.trim())
      : [];
    setProdGalleryImages(extraImages);
    setProdImageMode(extraImages.length > 0 ? 'multiple' : 'single');
    setNewGalleryInput('');
    setBulkGalleryInput('');
    setIsBulkInputOpen(false);

    setProdStock(product.stock);
    setProdFeatured(product.featured);
    setProdRating(product.rating || 5.0);
    setProdReviewsCount(product.reviewsCount ?? 0);
    setProdVideoUrl(product.videoUrl || '');
    setProdSizes(product.sizes ? [...product.sizes] : []);
    setNewSizeInput('');
    setNumericSizeVal('');
    setNumericSizeUnit('none');
    setCustomNumericSuffix('');
    setShowRangeTool(false);
    setProdColors(product.colors ? [...product.colors] : []);
    setNewColorInput('');
    setNewColorHex('#1e3a8a');
    setDisplaySpecificColor(true);
    setIsProductModalOpen(true);
  };

  // Description rich text formatting helpers (bold, numbered lists, bullet lists, symbols)
  const handleInsertFormatting = (prefix: string, suffix: string = '', defaultPlaceholder: string = '') => {
    const textarea = descTextareaRef.current;
    if (!textarea) {
      setProdDescription((prev) => prev + prefix + defaultPlaceholder + suffix);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = prodDescription;
    const selectedText = currentText.substring(start, end);

    let insertion = '';
    if (selectedText) {
      insertion = `${prefix}${selectedText}${suffix}`;
    } else {
      insertion = `${prefix}${defaultPlaceholder}${suffix}`;
    }

    const newText = currentText.substring(0, start) + insertion + currentText.substring(end);
    setProdDescription(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursor = start + insertion.length;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const handleInsertNumberedList = () => {
    const textarea = descTextareaRef.current;
    if (!textarea) {
      setProdDescription((prev) => prev + (prev.endsWith('\n') ? '' : '\n') + '1. Feature one\n2. Feature two\n3. Feature three');
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = prodDescription;
    const selectedText = currentText.substring(start, end);

    if (selectedText) {
      const lines = selectedText.split('\n');
      const numbered = lines.map((line, i) => `${i + 1}. ${line.replace(/^\d+\.\s*/, '')}`).join('\n');
      const newText = currentText.substring(0, start) + numbered + currentText.substring(end);
      setProdDescription(newText);
    } else {
      const prefix = currentText.length === 0 || currentText.endsWith('\n') ? '' : '\n';
      const insertion = `${prefix}1. Feature one\n2. Feature two\n3. Feature three`;
      const newText = currentText.substring(0, start) + insertion + currentText.substring(end);
      setProdDescription(newText);
    }
    setTimeout(() => textarea.focus(), 0);
  };

  const handleInsertBulletList = () => {
    const textarea = descTextareaRef.current;
    if (!textarea) {
      setProdDescription((prev) => prev + (prev.endsWith('\n') ? '' : '\n') + '• Highlight one\n• Highlight two\n• Highlight three');
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = prodDescription;
    const selectedText = currentText.substring(start, end);

    if (selectedText) {
      const lines = selectedText.split('\n');
      const bulleted = lines.map((line) => `• ${line.replace(/^[•\-\*]\s*/, '')}`).join('\n');
      const newText = currentText.substring(0, start) + bulleted + currentText.substring(end);
      setProdDescription(newText);
    } else {
      const prefix = currentText.length === 0 || currentText.endsWith('\n') ? '' : '\n';
      const insertion = `${prefix}• Highlight one\n• Highlight two\n• Highlight three`;
      const newText = currentText.substring(0, start) + insertion + currentText.substring(end);
      setProdDescription(newText);
    }
    setTimeout(() => textarea.focus(), 0);
  };

  // --- VARIANT HELPER HANDLERS (Numerical Sizes & Colors) ---
  const handleAddNumericalSize = () => {
    const raw = numericSizeVal.toString().trim();
    if (!raw) return;
    let formattedSize = raw;
    if (numericSizeUnit === 'EU') formattedSize = `EU ${raw}`;
    else if (numericSizeUnit === 'US') formattedSize = `US ${raw}`;
    else if (numericSizeUnit === 'UK') formattedSize = `UK ${raw}`;
    else if (numericSizeUnit === 'inch') formattedSize = `${raw}"`;
    else if (numericSizeUnit === 'mm') formattedSize = `${raw}mm`;
    else if (numericSizeUnit === 'cm') formattedSize = `${raw}cm`;
    else if (numericSizeUnit === 'ml') formattedSize = `${raw}ml`;
    else if (numericSizeUnit === 'gm') formattedSize = `${raw}gm`;
    else if (numericSizeUnit === 'kg') formattedSize = `${raw}kg`;
    else if (numericSizeUnit === 'custom' && customNumericSuffix.trim()) {
      formattedSize = `${raw}${customNumericSuffix.trim()}`;
    }

    if (!prodSizes.includes(formattedSize)) {
      setProdSizes((prev) => [...prev, formattedSize]);
      setNumericSizeVal('');
    }
  };

  const handleAddRangeSizes = () => {
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    const step = Number(rangeStep) || 1;
    if (isNaN(start) || isNaN(end) || step <= 0 || start > end) return;

    const newItems: string[] = [];
    for (let v = start; v <= end; v += step) {
      let formatted = v.toString();
      if (rangeUnit === 'EU') formatted = `EU ${v}`;
      else if (rangeUnit === 'US') formatted = `US ${v}`;
      else if (rangeUnit === 'UK') formatted = `UK ${v}`;
      else if (rangeUnit === 'inch') formatted = `${v}"`;
      else if (rangeUnit === 'mm') formatted = `${v}mm`;
      else if (rangeUnit === 'cm') formatted = `${v}cm`;
      if (!prodSizes.includes(formatted) && !newItems.includes(formatted)) {
        newItems.push(formatted);
      }
    }
    if (newItems.length > 0) {
      setProdSizes((prev) => [...prev, ...newItems]);
      setShowRangeTool(false);
    }
  };

  const handleAddColor = () => {
    const name = newColorInput.trim();
    if (!name) return;
    const formatted = formatColorOption(name, newColorHex, displaySpecificColor);
    if (formatted && !prodColors.includes(formatted)) {
      setProdColors((prev) => [...prev, formatted]);
      setNewColorInput('');
    }
  };

  const handleProductFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericProdPrice = typeof prodPrice === 'string' ? parseInt(prodPrice, 10) : prodPrice;
    if (!prodTitle.trim() || isNaN(numericProdPrice) || numericProdPrice <= 0) {
      setProductFormError('Please enter a valid product title and price.');
      return;
    }

    setProductFormError(null);
    setIsSavingProduct(true);

    const primaryImg =
      prodImage.trim() ||
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80';

    // In multiple mode, collect valid additional gallery images; in single mode, only primaryImg is used
    const validGallery =
      prodImageMode === 'multiple'
        ? prodGalleryImages
            .map((img) => img.trim())
            .filter((img) => img && img !== primaryImg)
        : [];
    const allImages = [primaryImg, ...validGallery];

    const canManageBuying = isSuperAdmin || hasPermission('product.manage_buying_price');
    const buyingPriceVal =
      canManageBuying && prodBuyingPrice !== '' && !isNaN(Number(prodBuyingPrice))
        ? Math.max(0, Number(prodBuyingPrice))
        : undefined;

    if (editingProduct && !hasPermission('product.update')) {
      setProductFormError('Permission denied: product.update required to update products.');
      return;
    }
    if (!editingProduct && !hasPermission('product.create')) {
      setProductFormError('Permission denied: product.create required to add new products.');
      return;
    }

    try {
      const finalReviewsCount =
        prodReviewsCount === '' || prodReviewsCount === undefined
          ? 0
          : Math.max(0, Math.floor(Number(prodReviewsCount)));

      if (editingProduct) {
        const res = await updateProduct(editingProduct.id, {
          title: prodTitle.trim(),
          slug: prodSlug.trim() || undefined,
          price: Number(prodPrice),
          originalPrice: prodOriginalPrice ? Number(prodOriginalPrice) : undefined,
          ...(buyingPriceVal !== undefined ? { buyingPrice: buyingPriceVal } : {}),
          categoryId: prodCategory,
          description: prodDescription.trim(),
          imageUrl: primaryImg,
          images: allImages.length > 1 ? allImages : [primaryImg],
          stock: Number(prodStock),
          featured: prodFeatured,
          rating: Number(prodRating) || 5.0,
          reviewsCount: finalReviewsCount,
          sizes: prodSizes.length > 0 ? prodSizes : undefined,
          colors: prodColors.length > 0 ? prodColors : undefined,
          videoUrl: prodVideoUrl.trim(),
        });
        if (res && res.success === false) {
          setProductFormError(res.error || 'Failed to update product in D1 database');
          return;
        }
      } else {
        const res = await addProduct({
          title: prodTitle.trim(),
          slug: prodSlug.trim() || undefined,
          price: Number(prodPrice),
          originalPrice: prodOriginalPrice ? Number(prodOriginalPrice) : undefined,
          ...(buyingPriceVal !== undefined ? { buyingPrice: buyingPriceVal } : {}),
          categoryId: prodCategory || categories[0]?.id || 'cat-general',
          description: prodDescription.trim(),
          imageUrl: primaryImg,
          images: allImages.length > 1 ? allImages : [primaryImg],
          stock: Number(prodStock),
          featured: prodFeatured,
          rating: Number(prodRating) || 5.0,
          reviewsCount: finalReviewsCount,
          specs: ['Standard 1-year authentic warranty', 'Verified Bangladeshi import'],
          sizes: prodSizes.length > 0 ? prodSizes : undefined,
          colors: prodColors.length > 0 ? prodColors : undefined,
          videoUrl: prodVideoUrl.trim() || undefined,
        });
        if (res && res.success === false) {
          setProductFormError(res.error || 'Failed to create product in D1 database');
          return;
        }
      }

      setIsProductModalOpen(false);
    } catch (err: any) {
      setProductFormError(err?.message || 'Error communicating with D1 database');
    } finally {
      setIsSavingProduct(false);
    }
  };

  // --- QUICK RATING ADJUSTMENT HANDLERS ---
  const openRatingAdjustmentModal = (product: Product) => {
    setRatingModalProduct(product);
    setCustomRatingValue(product.rating || 5.0);
    setCustomReviewsCount(product.reviewsCount ?? 0);
  };

  const handleSaveRatingAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratingModalProduct) return;
    const sanitizedReviewsCount =
      customReviewsCount === '' || customReviewsCount === undefined
        ? 0
        : Math.max(0, Math.floor(Number(customReviewsCount)));
    adjustProductRating(ratingModalProduct.id, customRatingValue, sanitizedReviewsCount);
    setRatingSaveSuccess(
      sanitizedReviewsCount > 0
        ? `Rating for "${ratingModalProduct.title}" adjusted to ${customRatingValue}★ (${sanitizedReviewsCount} reviews)!`
        : `Rating for "${ratingModalProduct.title}" adjusted to ${customRatingValue}★ (0 reviews / No customer reviews)!`
    );
    setTimeout(() => setRatingSaveSuccess(null), 3500);
    setRatingModalProduct(null);
  };

  // --- ADMIN ADD REVIEW DIRECT HANDLERS ---
  const [adminReviewModalProduct, setAdminReviewModalProduct] = useState<Product | null>(null);
  const [adminReviewAuthor, setAdminReviewAuthor] = useState('Verified Customer');
  const [adminReviewRating, setAdminReviewRating] = useState(5);
  const [adminReviewComment, setAdminReviewComment] = useState('');
  const [adminReviewStatus, setAdminReviewStatus] = useState<'approved' | 'pending'>('pending');
  const [adminReviewVerified, setAdminReviewVerified] = useState(true);
  const [adminReviewNote, setAdminReviewNote] = useState('Staff Added');
  const [adminReviewSubmitting, setAdminReviewSubmitting] = useState(false);
  const [adminReviewError, setAdminReviewError] = useState<string | null>(null);

  const openAdminAddReviewModal = (product: Product) => {
    setAdminReviewModalProduct(product);
    setAdminReviewAuthor('Verified Customer');
    setAdminReviewRating(5);
    setAdminReviewComment('');
    setAdminReviewStatus('pending');
    setAdminReviewVerified(true);
    setAdminReviewNote('Staff Added');
    setAdminReviewError(null);
  };

  const handleSaveAdminReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminReviewModalProduct || !adminReviewComment.trim()) return;

    if (adminReviewAuthor.trim().length < 2 || adminReviewAuthor.trim().length > 60) {
      setAdminReviewError('Author name must be between 2 and 60 characters.');
      return;
    }

    if (adminReviewComment.trim().length < 3 || adminReviewComment.trim().length > 1000) {
      setAdminReviewError('Review comment must be between 3 and 1000 characters.');
      return;
    }

    setAdminReviewSubmitting(true);
    setAdminReviewError(null);

    try {
      if (!admin?.adminCreateReview) {
        throw new Error('Review management is not available.');
      }

      const res = await admin.adminCreateReview({
        productId: adminReviewModalProduct.id,
        authorName: adminReviewAuthor.trim() || 'Verified Customer',
        rating: adminReviewRating,
        comment: adminReviewComment.trim(),
        status: adminReviewStatus,
        verifiedPurchase: adminReviewVerified,
        moderationNote: adminReviewNote.trim() || undefined,
      });

      if (res.success) {
        setAdminReviewModalProduct(null);
      } else {
        setAdminReviewError(res.error || 'Failed to create review.');
      }
    } catch (err: any) {
      setAdminReviewError(err?.message || 'Failed to create review.');
    } finally {
      setAdminReviewSubmitting(false);
    }
  };

  // --- CATEGORY CRUD HANDLERS ---
  const openNewCategoryModal = () => {
    setEditingCategory(null);
    setCategoryFormError(null);
    setCatName('');
    setCatDescription('');
    setIsCategoryModalOpen(true);
  };

  const openEditCategoryModal = (category: Category) => {
    setEditingCategory(category);
    setCategoryFormError(null);
    setCatName(category.name);
    setCatDescription(category.description || '');
    setIsCategoryModalOpen(true);
  };

  const handleCategoryFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    setCategoryFormError(null);
    setIsSavingCategory(true);
    try {
      if (editingCategory) {
        const res = await updateCategory(editingCategory.id, {
          name: catName.trim(),
          description: catDescription.trim(),
        });
        if (res && res.success === false) {
          setCategoryFormError(res.error || 'Failed to update category in D1');
          return;
        }
      } else {
        const res = await addCategory({
          name: catName.trim(),
          description: catDescription.trim(),
        });
        if (res && res.success === false) {
          setCategoryFormError(res.error || 'Failed to create category in D1');
          return;
        }
      }
      setIsCategoryModalOpen(false);
    } catch (err: any) {
      setCategoryFormError(err?.message || 'Error communicating with D1 database');
    } finally {
      setIsSavingCategory(false);
    }
  };

  // --- COURIER PARCEL BOOKING HANDLERS ---
  const openCourierBookingModal = (order: Order, preferredCourier?: string) => {
    setCourierModalOrder(order);
    const activeCourier = courierConfigs.find((c) => c.isActive)?.code;
    const chosenCourier = preferredCourier || rowSelectedCouriers[order.id] || order.courierBooking?.provider || order.courierName || activeCourier || courierConfigs[0]?.code || 'Steadfast';
    setSelectedCourier(chosenCourier);
    setCourierBookingError(null);
    setCourierForceDuplicate(false);

    // Delivery Type: 0 = Home Delivery, 1 = Point Delivery / Hub Pickup
    setCourierDeliveryType(0);

    // Recipient Information
    setCourierRecipientName(order.customer.fullName || '');
    setCourierRecipientPhone(order.customer.phone || '');
    setCourierAltPhone('');
    setCourierRecipientEmail(order.customer.email || order.userEmail || '');
    setCourierRecipientAddress(order.customer.fullAddress || '');
    setCourierRecipientArea('');
    setCourierRecipientDistrict(order.customer.district || 'Dhaka');

    // Parcel Information: Cash on Delivery amount (Courier COD = Customer Due)
    const effectiveDue = order.customerDue != null && !isNaN(Number(order.customerDue))
      ? Math.max(0, Number(order.customerDue))
      : Math.max(0, Math.round(((Number(order.totalAmount) || 0) - (Number(order.advancePayment) || 0)) * 100) / 100);
    const isPaid = order.paymentStatus === 'Paid' || order.paymentStatus === 'PAID' || effectiveDue === 0;
    setCourierCodAmount(isPaid ? 0 : effectiveDue);
    setCourierWeight('0.5');

    const totalQty = Array.isArray(order.items) && order.items.length > 0
      ? order.items.reduce((sum, it) => sum + (it.quantity || 1), 0)
      : 1;
    setCourierTotalLot(totalQty);

    const desc = Array.isArray(order.items) && order.items.length > 0
      ? order.items.map((it) => `${it.product?.title || 'Product'} x ${it.quantity}`).join(', ')
      : 'E-commerce Item';
    setCourierItemDescription(desc);

    setCourierNote(order.customer.notes || `Order #${order.orderNumber} - Rongdhonu Trade`);

    // Reset temporary validation keys on open
    setInlineSfApiKey('');
    setInlineSfSecretKey('');
    setCourierBookingError(null);
  };

  const handleModalCourierChange = (newCourier: string) => {
    setSelectedCourier(newCourier);
    setCourierBookingError(null);
    setInlineSfApiKey('');
    setInlineSfSecretKey('');
  };

  const copyTrackingLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedTrackingId(id);
    setTimeout(() => setCopiedTrackingId(null), 2000);
  };

  const handleExecuteCourierBooking = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!courierModalOrder) return;

    if (!courierRecipientName.trim() || courierRecipientName.trim().length < 3) {
      setCourierBookingError('Recipient name must be at least 3 characters.');
      return;
    }

    const cleanPhone = courierRecipientPhone.trim().replace(/[^0-9]/g, '');
    const bdPhoneRegex = /^01[3-9]\d{8}$/;
    if (!bdPhoneRegex.test(cleanPhone)) {
      setCourierBookingError('Recipient phone must be a valid 11-digit Bangladeshi mobile number (013-019XXXXXXXX).');
      return;
    }

    if (courierAltPhone.trim()) {
      const cleanAlt = courierAltPhone.trim().replace(/[^0-9]/g, '');
      if (!bdPhoneRegex.test(cleanAlt)) {
        setCourierBookingError('Alternative phone must be a valid 11-digit Bangladeshi mobile number.');
        return;
      }
    }

    if (!courierRecipientAddress.trim() || courierRecipientAddress.trim().length < 5) {
      setCourierBookingError('Delivery address must contain at least 5 characters with detailed road/house/thana.');
      return;
    }

    if (!courierRecipientDistrict.trim()) {
      setCourierBookingError('District is required for courier delivery route.');
      return;
    }

    if (courierCodAmount < 0) {
      setCourierBookingError('Cash on Delivery (COD) amount cannot be negative.');
      return;
    }

    const hasExistingConsignment = Boolean(courierModalOrder.consignmentId || courierModalOrder.courierWaybill);
    if (hasExistingConsignment && !courierForceDuplicate) {
      setCourierBookingError(
        `Order #${courierModalOrder.orderNumber} is already booked (Consignment: #${courierModalOrder.consignmentId || courierModalOrder.courierWaybill}). Please check the "Confirm duplicate booking" box below if you intend to create another parcel.`
      );
      return;
    }

    setCourierBookingError(null);
    setIsBookingLoading(true);

    try {
      const addressParts: string[] = [courierRecipientAddress.trim()];
      if (courierRecipientArea.trim() && !courierRecipientAddress.toLowerCase().includes(courierRecipientArea.toLowerCase())) {
        addressParts.push(courierRecipientArea.trim());
      }
      if (courierRecipientDistrict.trim() && !courierRecipientAddress.toLowerCase().includes(courierRecipientDistrict.toLowerCase())) {
        addressParts.push(courierRecipientDistrict.trim());
      }
      const combinedAddress = addressParts.join(', ').substring(0, 250);

      const isSf = selectedCourier.toLowerCase().includes('steadfast');
      const chosenConfig = courierConfigs.find(
        (c) => c.code.toLowerCase() === selectedCourier.toLowerCase() || c.name.toLowerCase() === selectedCourier.toLowerCase() || c.id === selectedCourier
      ) || courierConfigs[0];
      const courierDisplayName = chosenConfig?.name || selectedCourier;

      const apiKeyToSend = inlineSfApiKey.trim() || (isSf ? settings.steadfastApiKey : chosenConfig?.apiKey) || undefined;
      const secretKeyToSend = inlineSfSecretKey.trim() || (isSf ? settings.steadfastSecretKey : chosenConfig?.secretKey) || undefined;

      const res = await bookWithCourier(courierModalOrder, selectedCourier, {
        delivery_type: courierDeliveryType,
        recipient_name: courierRecipientName.trim(),
        recipient_phone: cleanPhone,
        alternative_phone: courierAltPhone.trim().replace(/[^0-9]/g, '') || undefined,
        recipient_email: courierRecipientEmail.trim() || undefined,
        recipient_address: combinedAddress,
        area: courierRecipientArea.trim() || undefined,
        district: courierRecipientDistrict.trim() || undefined,
        cod_amount: Number(courierCodAmount),
        item_description: courierItemDescription.trim() || undefined,
        total_lot: Number(courierTotalLot) || 1,
        weight: Number(courierWeight) || 0.5,
        note: courierNote.trim() || undefined,
        apiKey: apiKeyToSend,
        secretKey: secretKeyToSend,
        baseUrl: chosenConfig?.baseUrl,
        trackingUrlPattern: chosenConfig?.trackingUrlPattern,
      } as any);

      if (res.success) {
        // Clear any temporary credentials from component state immediately
        setInlineSfApiKey('');
        setInlineSfSecretKey('');
        if (res.trackingCode) {
          const pattern = chosenConfig?.trackingUrlPattern || (isSf ? 'https://steadfast.com.bd/t/{trackingCode}' : 'https://steadfast.com.bd/t/{trackingCode}');
          const trackingUrl = pattern.includes('{trackingCode}') ? pattern.replace('{trackingCode}', res.trackingCode) : `${pattern}/${res.trackingCode}`;
          copyTrackingLink(trackingUrl, res.trackingCode);
        }
        setCourierModalOrder(null);
      } else {
        setCourierBookingError(res.message || `${courierDisplayName} rejected parcel creation.`);
      }
    } catch (err: any) {
      setCourierBookingError(err?.message || `Error communicating with ${selectedCourier} Courier API.`);
    } finally {
      setIsBookingLoading(false);
    }
  };

  // Skip Courier toggle handler
  const handleSkipCourierStatusChange = (orderId: string, status: ShippingStatus) => {
    updateOrderStatus(orderId, status);
  };

  // --- ORDER EDIT & DELETE HANDLERS ---
  const handleUpdateOrderItemPrice = (index: number, newPrice: number | string) => {
    let priceToStore: number | string = newPrice;
    let numericPrice = 0;

    if (typeof newPrice === 'string') {
      const trimmed = newPrice.trim();
      if (trimmed === '') {
        priceToStore = '';
        numericPrice = 0;
      } else {
        const parsed = parseInt(trimmed, 10);
        numericPrice = isNaN(parsed) ? 0 : Math.max(0, parsed);
        priceToStore = trimmed;
      }
    } else {
      numericPrice = Math.max(0, Math.round(newPrice));
      priceToStore = numericPrice;
    }

    const nextItems = editOrderItems.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        product: {
          ...item.product,
          price: priceToStore,
        },
        sellingPriceSnapshot: numericPrice,
      };
    });
    setEditOrderItems(nextItems);
    const subtotal = getEditOrderSubtotal(nextItems);
    const discount = editingOrder?.discountAmount || 0;
    setEditTotalAmount(Math.max(0, subtotal + editDeliveryFee - discount));
  };

  const handleBlurOrderItemPrice = (index: number) => {
    const item = editOrderItems[index];
    if (!item) return;
    const cur = item.product?.price;
    if (cur === '' || cur == null || isNaN(Number(cur))) {
      handleUpdateOrderItemPrice(index, 0);
    } else {
      handleUpdateOrderItemPrice(index, Math.max(0, parseInt(String(cur), 10)));
    }
  };

  const handleAdjustOrderItemPriceDelta = (index: number, delta: number) => {
    const currentPrice = Number(editOrderItems[index]?.product?.price || 0);
    const targetPrice = Math.max(0, Math.round(currentPrice + delta));
    handleUpdateOrderItemPrice(index, targetPrice);
  };

  const handleResetOrderItemToPublishedPrice = (index: number) => {
    const item = editOrderItems[index];
    if (!item) return;
    const published = products.find((p) => p.id === item.product?.id);
    const catalogPrice = published ? published.price : Number(item.product?.price || 0);
    handleUpdateOrderItemPrice(index, catalogPrice);
  };

  const handleUpdateOrderItemQuantity = (index: number, newQty: number) => {
    const validQty = Math.max(1, Math.round(newQty));
    const nextItems = editOrderItems.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        quantity: validQty,
      };
    });
    setEditOrderItems(nextItems);
    const subtotal = getEditOrderSubtotal(nextItems);
    const discount = editingOrder?.discountAmount || 0;
    setEditTotalAmount(Math.max(0, subtotal + editDeliveryFee - discount));
  };

  const handleUpdateOrderItemSize = (index: number, newSize: string) => {
    const nextItems = editOrderItems.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        selectedSize: newSize.trim() || undefined,
      };
    });
    setEditOrderItems(nextItems);
  };

  const handleUpdateOrderItemColor = (index: number, newColor: string) => {
    const nextItems = editOrderItems.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        selectedColor: newColor.trim() || undefined,
      };
    });
    setEditOrderItems(nextItems);
  };

  const handleRemoveOrderItem = (index: number) => {
    if (editOrderItems.length <= 1) {
      showNotification('error', 'Cannot Remove Item', 'An order must contain at least one product.');
      return;
    }
    const nextItems = editOrderItems.filter((_, i) => i !== index);
    setEditOrderItems(nextItems);
    const subtotal = getEditOrderSubtotal(nextItems);
    const discount = editingOrder?.discountAmount || 0;
    setEditTotalAmount(Math.max(0, subtotal + editDeliveryFee - discount));
  };

  const handleAddPublishedProductToOrder = () => {
    if (!selectedAddProductId) return;
    const pub = products.find((p) => p.id === selectedAddProductId);
    if (!pub) return;

    const existingIdx = editOrderItems.findIndex((it) => it.product?.id === pub.id);
    let nextItems: any[];
    if (existingIdx >= 0) {
      nextItems = editOrderItems.map((it, idx) =>
        idx === existingIdx ? { ...it, quantity: (it.quantity || 1) + 1 } : it
      );
    } else {
      const newItem = {
        product: { ...pub },
        quantity: 1,
        selectedSize: pub.sizes?.[0],
        selectedColor: pub.colors?.[0],
        sellingPriceSnapshot: pub.price,
        buyingPriceSnapshot: pub.buyingPrice,
      };
      nextItems = [...editOrderItems, newItem];
    }
    setEditOrderItems(nextItems);
    const subtotal = getEditOrderSubtotal(nextItems);
    const discount = editingOrder?.discountAmount || 0;
    setEditTotalAmount(Math.max(0, subtotal + editDeliveryFee - discount));
    setSelectedAddProductId('');
    setIsAddItemToOrderOpen(false);
  };

  const openEditOrderModal = (order: Order) => {
    setEditingOrder(order);
    const initialItems = order.items ? JSON.parse(JSON.stringify(order.items)) : [];
    setEditOrderItems(initialItems);
    setOrderItemCustomAdjust({});
    setIsAddItemToOrderOpen(false);
    setSelectedAddProductId('');
    setEditCustomerName(order.customer.fullName);
    setEditCustomerPhone(order.customer.phone);
    setEditCustomerDistrict(order.customer.district);
    setEditCustomerAddress(order.customer.fullAddress);
    setEditCustomerNotes(order.customer.notes || '');
    const zone = order.customer.deliveryZone || 'inside_dhaka';
    setEditCustomerZone(zone);
    const fee = order.deliveryFee || (zone === 'inside_dhaka' ? (settings.insideDhakaFee || 80) : (settings.outsideDhakaFee || 150));
    setEditDeliveryFee(fee);
    const subtotal = getEditOrderSubtotal(initialItems) || order.subtotal;
    const discount = order.discountAmount || 0;
    setEditTotalAmount(Math.max(0, subtotal + fee - discount));
    setEditAdvancePayment(order.advancePayment != null ? Number(order.advancePayment) : 0);
    setEditAdvanceMethod(order.advancePaymentMethod || 'Cash / Advance');
    setEditAdvanceNote(order.advancePaymentNote || '');
    setEditShippingStatus(order.shippingStatus);
    setEditPaymentStatus(order.paymentStatus as any);
    setEditBankTrxId(order.transactionId || order.dbblDetails?.transactionId || '');
    setEditSenderBank(order.dbblDetails?.senderBank || '');
    setEditSenderAccount(order.dbblDetails?.senderAccountOrPhone || '');
    setEditCourierProvider(order.courierBooking?.provider || '');
    setEditCourierWaybill(order.courierBooking?.waybillId || '');
  };

  const handleAdminZoneChange = (newZone: 'inside_dhaka' | 'outside_dhaka') => {
    setEditCustomerZone(newZone);
    const fee = newZone === 'inside_dhaka' ? (settings.insideDhakaFee || 80) : (settings.outsideDhakaFee || 150);
    setEditDeliveryFee(fee);
    if (editingOrder) {
      const subtotal = getEditOrderSubtotal(editOrderItems);
      const discount = editingOrder.discountAmount || 0;
      setEditTotalAmount(Math.max(0, subtotal + fee - discount));
    }
  };

  const handleSaveOrderEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    const subtotal = getEditOrderSubtotal(editOrderItems);
    const discount = editingOrder.discountAmount || 0;
    const totalAmount = Math.max(0, subtotal + editDeliveryFee - discount);

    const parsedAdvance = typeof editAdvancePayment === 'number'
      ? editAdvancePayment
      : (!editAdvancePayment || String(editAdvancePayment).trim() === '')
      ? 0
      : Number(editAdvancePayment);

    // Validation 1: Valid numeric format
    if (typeof editAdvancePayment === 'string' && editAdvancePayment.trim() !== '' && isNaN(Number(editAdvancePayment))) {
      showNotification('error', 'Invalid Advance Payment', 'Advance payment must be a valid numeric amount.');
      return;
    }

    // Validation 2: Non-negative
    if (parsedAdvance < 0) {
      showNotification('error', 'Invalid Advance Payment', 'Advance payment cannot be negative. Value must be 0 or more.');
      return;
    }

    // Validation 3 & 4: Advance cannot exceed order total / price reduction conflict
    if (parsedAdvance > totalAmount) {
      showNotification(
        'error',
        'Cannot Reduce Below Advance Payment',
        `Advance payment (৳${parsedAdvance.toLocaleString()}) cannot exceed the order total (৳${totalAmount.toLocaleString()}).`
      );
      return;
    }

    const validatedAdvance = parsedAdvance;
    const customerDue = Math.max(0, Math.round((totalAmount - validatedAdvance) * 100) / 100);

    let totalCost = 0;
    const enrichedItems = editOrderItems.map((it) => {
      const unitPrice =
        it.sellingPriceSnapshot != null && !isNaN(Number(it.sellingPriceSnapshot))
          ? Number(it.sellingPriceSnapshot)
          : Number(it.product?.price || 0);
      const buyingPrice =
        it.buyingPriceSnapshot != null && !isNaN(Number(it.buyingPriceSnapshot))
          ? Number(it.buyingPriceSnapshot)
          : it.product?.buyingPrice != null && !isNaN(Number(it.product.buyingPrice))
          ? Number(it.product.buyingPrice)
          : 0;
      const qty = Number(it.quantity) || 1;
      const itemCost = buyingPrice * qty;
      const itemProfit = (unitPrice - buyingPrice) * qty;
      totalCost += itemCost;
      return {
        ...it,
        quantity: qty,
        product: {
          ...it.product,
          price: unitPrice,
        },
        sellingPriceSnapshot: unitPrice,
        buyingPriceSnapshot: buyingPrice,
        productCost: itemCost,
        productGrossProfit: itemProfit,
      };
    });
    // Requirement 6: Do NOT clamp loss with Math.max(0, ...)
    // Advance Payment never reduces profit
    const totalGrossProfit = subtotal - totalCost;

    let nextPaymentStatus = editPaymentStatus;
    if (validatedAdvance > 0) {
      if (customerDue === 0 && totalAmount > 0) {
        nextPaymentStatus = 'PAID' as any;
      } else if (customerDue > 0) {
        nextPaymentStatus = 'PARTIAL' as any;
      }
    } else if (validatedAdvance === 0 && (editPaymentStatus === 'PARTIAL' as any || editPaymentStatus === 'PAID' as any || editPaymentStatus === 'Paid' as any)) {
      nextPaymentStatus = (editingOrder.paymentMethod === 'dbbl' ? 'UNVERIFIED' : 'DUE') as any;
    }

    updateOrder(editingOrder.id, {
      items: enrichedItems,
      subtotal,
      deliveryFee: editDeliveryFee,
      totalAmount,
      totalCost,
      totalGrossProfit,
      advancePayment: validatedAdvance,
      advancePaymentMethod: editAdvanceMethod.trim() || undefined,
      advancePaymentNote: editAdvanceNote.trim() || undefined,
      customerDue,
      dueAmount: customerDue,
      customer: {
        ...editingOrder.customer,
        fullName: editCustomerName.trim(),
        phone: editCustomerPhone.trim(),
        district: editCustomerDistrict.trim(),
        fullAddress: editCustomerAddress.trim(),
        notes: editCustomerNotes.trim(),
        deliveryZone: editCustomerZone,
      },
      shippingStatus: editShippingStatus,
      paymentStatus: nextPaymentStatus,
      transactionId: editBankTrxId.trim() || undefined,
      dbblDetails:
        editingOrder.paymentMethod === 'dbbl'
          ? {
              senderBank: editSenderBank.trim() || 'Dutch-Bangla Bank',
              senderAccountOrPhone: editSenderAccount.trim(),
              transactionId: editBankTrxId.trim(),
              depositSlipUrl: editingOrder.dbblDetails?.depositSlipUrl,
            }
          : editingOrder.dbblDetails,
      courierBooking:
        editCourierProvider && editCourierWaybill
          ? {
              provider: editCourierProvider as CourierProvider,
              waybillId: editCourierWaybill.trim(),
              consignmentId: editingOrder.courierBooking?.consignmentId || `CON-${Date.now()}`,
              trackingUrl:
                editingOrder.courierBooking?.trackingUrl ||
                `https://tracking.example.com/${editCourierWaybill.trim()}`,
              bookedAt: editingOrder.courierBooking?.bookedAt || new Date().toISOString(),
            }
          : editCourierProvider === ''
          ? undefined
          : editingOrder.courierBooking,
    });

    showNotification(
      'success',
      'Order Updated',
      `Order #${editingOrder.orderNumber} successfully updated with adjusted product prices (৳${totalAmount.toLocaleString()} BDT).`
    );

    setEditingOrder(null);
  };

  // --- PASSWORD RESET HANDLERS ---
  const handleGenerateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    // Security Hardening: Use CSPRNG crypto.getRandomValues for password generation
    const randomBytes = new Uint32Array(12);
    crypto.getRandomValues(randomBytes);
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(randomBytes[i] % chars.length);
    }
    setNewPasswordValue(result);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !newPasswordValue.trim()) return;

    if (newPasswordValue.trim().length < MIN_PASSWORD_LENGTH) {
      setAccountFeedback('New password must be at least 8 characters long.');
      setTimeout(() => setAccountFeedback(null), 4000);
      return;
    }

    const res = await resetCustomerPassword(resettingUser.email, newPasswordValue.trim());
    if (res.success) {
      setAccountFeedback(`Password for ${resettingUser.email} was reset to: ${newPasswordValue.trim()}`);
      setTimeout(() => setAccountFeedback(null), 6000);
      setResettingUser(null);
      setNewPasswordValue('');
    } else {
      setAccountFeedback(res.message || 'Failed to reset password.');
      setTimeout(() => setAccountFeedback(null), 4000);
    }
  };

  const handleDeleteOrder = (order: Order) => {
    const isDelivered = order.shippingStatus === 'Delivered';
    const msg = isDelivered
      ? `Are you sure you want to permanently delete Order #${order.orderNumber}?\n\n(Note: Order is already marked Delivered, inventory will NOT be restocked).`
      : `Are you sure you want to permanently delete Order #${order.orderNumber}?\n\nThis will remove the order and automatically RESTOCK ${order.items.reduce((s, i) => s + i.quantity, 0)} item(s) back into inventory.`;

    setConfirmDialog({
      isOpen: true,
      title: `Delete Order #${order.orderNumber}?`,
      message: msg,
      confirmText: 'Delete Order',
      cancelText: 'Cancel',
      variant: 'danger',
      onConfirm: () => {
        deleteOrder(order.id, true);
        setAccountFeedback(`Order #${order.orderNumber} deleted successfully.`);
        setTimeout(() => setAccountFeedback(null), 3500);
      },
    });
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSettingsFormDirty(true);

    // Fast data URL fallback immediately for responsive preview
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
        updateDbblSetting('qrCodeUrl', reader.result as string);
      }
    };
    reader.readAsDataURL(file);

    try {
      const uploadRes = await uploadApi.upload(file);
      if (uploadRes.success && uploadRes.url) {
        updateDbblSetting('qrCodeUrl', uploadRes.url);
      }
    } catch {}
    e.target.value = '';
  };

  // --- SETTINGS SAVE (AWAITED PERSISTENCE TO CLOUDFLARE D1) ---
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('settings.manage')) {
      setSettingsError('Access Denied: Protected store-level settings can be managed only by Super Administrator.');
      return;
    }
    setIsSavingSettings(true);
    setSettingsError(null);
    try {
      const res = await updateSettings({
        ...settingsForm,
        gtmId: settings.gtmId,
        tiktokPixelId: settings.tiktokPixelId,
        tiktokTestEventCode: settings.tiktokTestEventCode,
        fbPixelId: settings.fbPixelId,
        fbTestEventCode: settings.fbTestEventCode,
        trackingEnabled: settings.trackingEnabled,
        advancedMatchingEnabled: settings.advancedMatchingEnabled,
        trackingDebugMode: settings.trackingDebugMode,
      });
      if (res.success && res.settings) {
        setSettingsForm(res.settings);
        setIsSettingsFormDirty(false);
        setSettingsSavedNotice(true);
        setTimeout(() => setSettingsSavedNotice(false), 3500);
      } else {
        const errMessage = res.error || 'Failed to save settings to D1 database';
        setSettingsError(errMessage);
      }
    } catch (err: any) {
      setSettingsError(err?.message || 'Error communicating with D1 database');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // --- 1-CLICK COURIER DISPATCH HANDLER ---
  const handleOneClickCourierBooking = async (order: Order, courierCodeOrName?: string) => {
    if (!hasPermission('canManageOrders')) {
      setAccountFeedback('Access Denied: You lack the "canManageOrders" permission required to book couriers.');
      setTimeout(() => setAccountFeedback(null), 4000);
      return;
    }
    const defaultCourier = courierConfigs.find((c) => c.isActive)?.code || courierConfigs[0]?.code || 'Steadfast';
    const courierToUse = courierCodeOrName || rowSelectedCouriers[order.id] || defaultCourier;
    const chosenConfig = courierConfigs.find(
      (c) => c.code.toLowerCase() === courierToUse.toLowerCase() || c.name.toLowerCase() === courierToUse.toLowerCase() || c.id === courierToUse
    );
    const courierDisplayName = chosenConfig?.name || courierToUse;

    setIsBookingSteadfast(order.id);
    try {
      const res = await bookWithCourier(order, courierToUse);
      if (res.success) {
        setSteadfastNotice({
          id: order.id,
          message: res.message,
        });
        setTimeout(() => setSteadfastNotice(null), 6000);
      } else {
        setAccountFeedback(res.message || `Failed to book order with ${courierDisplayName}.`);
        setTimeout(() => setAccountFeedback(null), 4000);
      }
    } catch (err: any) {
      setAccountFeedback(err?.message || `Error occurred while communicating with ${courierDisplayName} API.`);
      setTimeout(() => setAccountFeedback(null), 4000);
    } finally {
      setIsBookingSteadfast(null);
    }
  };

  const handleOneClickSteadfastBooking = (order: Order) => handleOneClickCourierBooking(order, 'Steadfast');

  // --- COURIER PARCEL STATUS SYNC HANDLERS ---
  const handleSyncSingleCourier = async (orderId: string) => {
    setSyncingOrderId(orderId);
    try {
      const res = await syncCourierStatus(orderId);
      setAccountFeedback(res.message);
      setTimeout(() => setAccountFeedback(null), 4500);
    } catch (err: any) {
      setAccountFeedback(err?.message || 'Failed to sync courier parcel status.');
      setTimeout(() => setAccountFeedback(null), 4000);
    } finally {
      setSyncingOrderId(null);
    }
  };

  const handleSyncAllCouriers = async () => {
    setIsSyncingCouriers(true);
    try {
      const res = await syncAllCourierStatuses();
      setAccountFeedback(res.message);
      setTimeout(() => setAccountFeedback(null), 5000);
    } catch (err: any) {
      setAccountFeedback(err?.message || 'Failed to synchronize courier statuses.');
      setTimeout(() => setAccountFeedback(null), 4000);
    } finally {
      setIsSyncingCouriers(false);
    }
  };

  // --- ROLE & PERMISSIONS MODAL HANDLERS ---
  const openManagePermissionsModal = (targetUser: UserAccount) => {
    // Permission Management requires: permission.manage + super_admin
    if (!currentUser || currentUser.role !== 'super_admin' || !hasPermission('permission.manage')) {
      showNotification('error', 'Access Denied', 'Only Master Super Administrators are authorized to manage permissions.');
      return;
    }
    // Super Admin accounts cannot be edited via ordinary permission editing
    if (targetUser.role === 'super_admin') {
      showNotification('warning', 'Action Prohibited', 'Super Administrator accounts cannot be modified through ordinary permission editing.');
      return;
    }
    setPermissionsModalUser(targetUser);
  };

  const handleSuperAdminPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuperAdminPwError('');

    if (!superAdminNewPw || superAdminNewPw.trim().length < MIN_PASSWORD_LENGTH) {
      setSuperAdminPwError('New password must be at least 8 characters long.');
      return;
    }

    if (superAdminNewPw !== superAdminConfirmPw) {
      setSuperAdminPwError('New password and confirmation do not match.');
      return;
    }

    const res = await changeSuperAdminPassword(superAdminNewPw.trim(), superAdminCurrentPw.trim() || undefined);
    if (!res.success) {
      setSuperAdminPwError(res.message);
    } else {
      showNotification(
        'success',
        'Password Updated Successfully! 🔐',
        'Super Admin master password has been changed in Cloudflare D1.'
      );
      setAccountFeedback('Super Admin master password changed successfully!');
      setTimeout(() => setAccountFeedback(null), 5000);
      setIsSuperAdminPwModalOpen(false);
      setSuperAdminCurrentPw('');
      setSuperAdminNewPw('');
      setSuperAdminConfirmPw('');
      setSuperAdminPwError('');
    }
  };

  const toggleCredentialPasswordVisibility = (userId: string) => {
    setVisibleCredentialsPasswords((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const renderPermissionRestrictedNotice = (permKey: string, moduleName: string) => (
    <div className="p-8 sm:p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-xs max-w-xl mx-auto my-12 space-y-4 animate-in fade-in duration-200">
      <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100 shadow-2xs">
        <Lock className="w-7 h-7" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-xl font-bold font-display text-slate-900">
          Access Restricted: {moduleName}
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          Your current account role does not have the <code className="bg-slate-100 px-1.5 py-0.5 rounded text-rose-600 font-mono font-bold text-xs">{permKey}</code> permission required to view or perform operations in this module.
        </p>
      </div>
      <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400">
        Contact the Super Administrator or store owner to adjust your RBAC permissions.
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20">
      {/* Top Admin Header Bar */}
      <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile Menu Options Toggle Button */}
            <button
              type="button"
              id="admin-mobile-nav-toggle"
              onClick={() => setIsMobileNavOpen((prev) => !prev)}
              className="md:hidden p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
              title="Toggle Menu Options List"
              aria-label="Toggle navigation menu"
            >
              {isMobileNavOpen ? <X className="w-5 h-5 text-rose-400" /> : <Menu className="w-5 h-5 text-slate-200" />}
            </button>

            <button
              onClick={() => setCurrentView('store')}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Back to Storefront"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div
              onClick={() => {
                setCurrentView('store');
                setSelectedCategory(null);
                setSearchQuery('');
              }}
              className="cursor-pointer"
              title="Return to Storefront Homepage"
              role="button"
              tabIndex={0}
            >
              <BrandLogo size="sm" showText={false} />
            </div>
            <button
              onClick={() => setIsUserAccountModalOpen(true)}
              className="text-left group transition-opacity hover:opacity-90"
              title="View Admin Profile"
            >
              <h1 className="font-display font-bold text-sm sm:text-base leading-tight group-hover:text-purple-300 transition-colors">
                Rongdhonu Trade Control Center
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-emerald-400 font-mono">
                  {currentUser?.email || ''}
                </p>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    currentUser?.role === 'super_admin'
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                      : currentUser?.role === 'sub_admin'
                      ? 'bg-purple-400/20 text-purple-300 border border-purple-400/40'
                      : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/40'
                  }`}
                >
                  {currentUser?.role === 'super_admin'
                    ? 'Super Admin'
                    : currentUser?.role === 'sub_admin'
                    ? 'Sub-Admin Staff'
                    : 'Admin'}
                </span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative" ref={adminProfileDropdownRef}>
              <button
                id="admin-profile-header-btn"
                type="button"
                onClick={() => setIsAdminProfileDropdownOpen((prev) => !prev)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5 border border-slate-700/60 shadow-2xs cursor-pointer"
                title="View Admin Profile & Privileges"
              >
                <User className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">Profile</span>
                <ChevronDown
                  className={`w-3 h-3 text-slate-400 transition-transform ${
                    isAdminProfileDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isAdminProfileDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-1.5 z-50 animate-scaleUp overflow-hidden text-slate-200">
                  <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple-700 text-white font-bold flex items-center justify-center text-xs shrink-0">
                        {currentUser?.name?.charAt(0).toUpperCase() || 'A'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-bold text-white truncate">
                            {currentUser?.name || 'Administrator'}
                          </h4>
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-purple-900/60 text-purple-300 border border-purple-700">
                            {currentUser?.role === 'super_admin'
                              ? 'Super Admin'
                              : currentUser?.role === 'sub_admin'
                              ? 'Sub-Admin'
                              : 'Admin'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {currentUser?.email}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Option to access Admin Dashboard */}
                  <div className="p-2 border-b border-slate-800 bg-purple-950/20">
                    <button
                      type="button"
                      id="admin-dropdown-dashboard-btn"
                      onClick={() => {
                        setIsAdminProfileDropdownOpen(false);
                        handleSelectTab('overview');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="w-3.5 h-3.5" />
                        <span>Admin Dashboard</span>
                      </div>
                      <span className="text-[10px] text-purple-200 font-medium">Overview</span>
                    </button>
                  </div>

                  <div className="p-1.5 space-y-0.5 text-xs">
                    <button
                      type="button"
                      id="admin-dropdown-orders-btn"
                      onClick={() => {
                        setIsAdminProfileDropdownOpen(false);
                        setUserAccountModalTab('orders');
                        setIsUserAccountModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-left cursor-pointer"
                    >
                      <ShoppingBag className="w-4 h-4 text-rose-400" />
                      <span>My Orders</span>
                    </button>

                    <button
                      type="button"
                      id="admin-dropdown-profile-btn"
                      onClick={() => {
                        setIsAdminProfileDropdownOpen(false);
                        setUserAccountModalTab('profile');
                        setIsUserAccountModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-left cursor-pointer"
                    >
                      <User className="w-4 h-4 text-purple-400" />
                      <span>Edit Profile Info</span>
                    </button>

                    <button
                      type="button"
                      id="admin-dropdown-privileges-btn"
                      onClick={() => {
                        setIsAdminProfileDropdownOpen(false);
                        setUserAccountModalTab('profile');
                        setIsUserAccountModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-left cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      <span>Admin Profile & Privileges</span>
                    </button>

                    <button
                      type="button"
                      id="admin-dropdown-storefront-btn"
                      onClick={() => {
                        setIsAdminProfileDropdownOpen(false);
                        setCurrentView('store');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors text-left cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                      <span>View Storefront</span>
                    </button>
                  </div>

                  <div className="p-1.5 border-t border-slate-800">
                    <button
                      type="button"
                      id="admin-dropdown-logout-btn"
                      onClick={handleManualLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-rose-950/30 text-rose-400 hover:text-rose-300 font-bold text-xs transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick App Debug & Warnings Launcher */}
            <button
              id="admin-header-debug-btn"
              type="button"
              onClick={() => {
                handleSelectTab('debug');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border shadow-2xs ${
                activeTab === 'debug'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20 ring-2 ring-amber-400/40'
                  : totalWarningsCount > 0
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Open App Debug Panel to view warnings and system health diagnostics"
            >
              <Bug className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Debug Panel</span>
              {totalWarningsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                  {totalWarningsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentView('store')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors hidden sm:flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Storefront
            </button>

            <button
              id="admin-logout-btn"
              onClick={handleManualLogout}
              className="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>

      </header>

      {/* Dashboard Body: Left Sidebar Navigation List + Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row w-full max-w-[1600px] mx-auto min-h-[calc(100vh-64px)]">
        {/* ======================================================== */}
        {/* LEFT SIDEBAR NAVIGATION: 10 MENU OPTIONS LIST            */}
        {/* ======================================================== */}
        <AdminSidebar
          activeTab={activeTab}
          setActiveTab={handleSelectTab}
          isMobileNavOpen={isMobileNavOpen}
          setIsMobileNavOpen={setIsMobileNavOpen}
          ordersCount={totalOrdersCount}
          productsCount={products.length}
          featuredProductsCount={featuredProductsCount}
          categoriesCount={categories.length}
          slidesCount={slides.length}
          couriersCount={courierConfigs.length}
          couponsCount={coupons.length}
          usersCount={users.length}
          reviewsCount={admin?.adminReviewsTotal ?? 0}
          pendingReviewsCount={admin?.adminReviewsCounts?.pending ?? 0}
          pendingOrdersCount={pendingOrdersCount}
          lowStockProductsCount={products.filter((p) => p.stock < 5).length}
          hasPermission={hasPermission}
          orderStatusFilter={orderStatusFilter}
          setOrderStatusFilter={setOrderStatusFilter}
          productStockFilter={productStockFilter}
          setProductStockFilter={setProductStockFilter}
          settingsSectionFilter={settingsSectionFilter}
          setSettingsSectionFilter={setSettingsSectionFilter}
          openAddModal={openNewProductModal}
          openAddCategoryModal={openNewCategoryModal}
          openCreateUserModal={() => setIsUserAccountModalOpen(true)}
          currentUser={currentUser}
          setCurrentView={setCurrentView}
        />

        {/* ======================================================== */}
        {/* MAIN CONTENT PANE (RIGHT OF SIDEBAR)                     */}
        {/* ======================================================== */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 bg-slate-100 overflow-y-auto">
        {/* ============================================================ */}
        {/* TAB 1: OVERVIEW & ANALYTICS                                  */}
        {/* ============================================================ */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Overview Focus Filter Bar */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  Analytics Filter:
                </span>
                <button
                  type="button"
                  id="overview-filter-all"
                  onClick={() => setOverviewFocusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    overviewFocusFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All Metrics
                </button>
                <button
                  type="button"
                  id="overview-filter-revenue"
                  onClick={() => setOverviewFocusFilter('revenue')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    overviewFocusFilter === 'revenue'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                  }`}
                >
                  Revenue & Delivery Value
                </button>
                <button
                  type="button"
                  id="overview-filter-orders-health"
                  onClick={() => setOverviewFocusFilter('orders_health')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    overviewFocusFilter === 'orders_health'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-sky-50 hover:bg-sky-100 text-sky-800'
                  }`}
                >
                  Order Status Breakdown
                </button>
                <button
                  type="button"
                  id="overview-filter-inventory"
                  onClick={() => setOverviewFocusFilter('inventory')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    overviewFocusFilter === 'inventory'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-purple-50 hover:bg-purple-100 text-purple-800'
                  }`}
                >
                  Inventory & Stock Health
                </button>
              </div>

              {overviewFocusFilter !== 'all' && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Filtered to: <strong className="text-slate-800 capitalize">{overviewFocusFilter.replace('_', ' ')}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setOverviewFocusFilter('all')}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Show All
                  </button>
                </div>
              )}
            </div>

            {/* Top Metric Cards - Core Metrics */}
            <div className="space-y-4">
              {/* Executive Super Admin Profit Dashboard Cards */}
              {isSuperAdmin && (overviewFocusFilter === 'all' || overviewFocusFilter === 'revenue') && (
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-lg border border-slate-700/60 relative overflow-hidden space-y-5 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-extrabold text-white">Profit & Financial Overview</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                            Super Admin Only
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">Authoritative server-side cost and net profitability calculated from D1</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('profit');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-900/30 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                    >
                      <span>Open Profit & Analytics</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* TODAY CARD */}
                    <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700/80 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                          <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider">TODAY</h4>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">{new Date().toISOString().slice(0, 10)}</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/40">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Revenue</span>
                          <span className="text-lg font-extrabold text-white font-display">
                            ৳ {todayProfit ? todayProfit.revenue.toLocaleString() : '0'}
                          </span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/40">
                          <span className="text-[10px] font-bold text-amber-400/90 uppercase tracking-wider block">Product Cost</span>
                          <span className="text-lg font-extrabold text-amber-300 font-display">
                            ৳ {todayProfit ? todayProfit.productCost.toLocaleString() : '0'}
                          </span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/40">
                          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">Gross Profit</span>
                          <span className="text-lg font-extrabold text-sky-300 font-display">
                            ৳ {todayProfit ? todayProfit.grossProfit.toLocaleString() : '0'}
                          </span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/40">
                          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Expenses</span>
                          <span className="text-lg font-extrabold text-rose-300 font-display">
                            ৳ {todayProfit ? todayProfit.expenses.toLocaleString() : '0'}
                          </span>
                        </div>
                        <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-500/40 sm:col-span-2">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Net Profit</span>
                          <span className="text-xl font-extrabold text-emerald-300 font-display">
                            ৳ {todayProfit ? todayProfit.netProfit.toLocaleString() : '0'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* MONTH CARD */}
                    <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700/80 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-sky-400" />
                          <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider">THIS MONTH</h4>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/40">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Revenue</span>
                          <span className="text-lg font-extrabold text-white font-display">
                            ৳ {monthProfit ? monthProfit.revenue.toLocaleString() : '0'}
                          </span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/40">
                          <span className="text-[10px] font-bold text-amber-400/90 uppercase tracking-wider block">Product Cost</span>
                          <span className="text-lg font-extrabold text-amber-300 font-display">
                            ৳ {monthProfit ? monthProfit.productCost.toLocaleString() : '0'}
                          </span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/40">
                          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">Gross Profit</span>
                          <span className="text-lg font-extrabold text-sky-300 font-display">
                            ৳ {monthProfit ? monthProfit.grossProfit.toLocaleString() : '0'}
                          </span>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/40">
                          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Expenses</span>
                          <span className="text-lg font-extrabold text-rose-300 font-display">
                            ৳ {monthProfit ? monthProfit.expenses.toLocaleString() : '0'}
                          </span>
                        </div>
                        <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-500/40 sm:col-span-2">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Net Profit</span>
                          <span className="text-xl font-extrabold text-emerald-300 font-display">
                            ৳ {monthProfit ? monthProfit.netProfit.toLocaleString() : '0'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Primary Order & Delivery Analytics */}
              {(overviewFocusFilter === 'all' || overviewFocusFilter === 'revenue') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-150">
                {/* 1. Total Number of Orders on Website */}
                <div
                  onClick={() => {
                    setActiveTab('orders');
                    setOrderStatusFilter('all');
                  }}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
                  title="Click to view all orders in Manage Orders"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                      Total Orders
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-extrabold font-display text-slate-900">
                      {totalOrdersCount}
                    </span>
                    <p className="text-[11px] text-blue-600 font-semibold mt-1 flex items-center gap-1">
                      <span>Click to view orders list →</span>
                    </p>
                  </div>
                </div>

                {/* 2. Total Delivery Value */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Total Delivery Value
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                      <Truck className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-extrabold font-display text-sky-700">
                      ৳ {totalDeliveryValue.toLocaleString()}
                    </span>
                    <p className="text-[11px] text-slate-500 font-semibold mt-1">
                      Shipping fees across all orders
                    </p>
                  </div>
                </div>

                {/* 3. Number of Cancelled Orders */}
                <div
                  onClick={() => {
                    setActiveTab('orders');
                    setOrderStatusFilter('Cancelled');
                  }}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group"
                  title="Click to display ONLY Cancelled orders"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-rose-600 transition-colors">
                      Cancelled Orders
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Ban className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-extrabold font-display text-rose-600">
                      {cancelledOrdersCount}
                    </span>
                    <p className="text-[11px] text-rose-600/80 font-semibold mt-1">
                      {orders.length > 0 ? ((cancelledOrdersCount / orders.length) * 100).toFixed(1) : 0}% cancellation • Filter →
                    </p>
                  </div>
                </div>

                {/* 4. Total Value of Cancelled Products */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Cancelled Products Value
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <XCircle className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-extrabold font-display text-amber-700">
                      ৳ {totalCancelledProductsValue.toLocaleString()}
                    </span>
                    <p className="text-[11px] text-amber-700/80 font-semibold mt-1">
                      Lost value from cancelled items
                    </p>
                  </div>
                </div>
              </div>
              )}

              {/* Order Status Direct Filter Cards */}
              {(overviewFocusFilter === 'all' || overviewFocusFilter === 'orders_health') && (
              <div className="space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Interactive Order Status Filter Cards (Click any to filter orders)
                  </h4>
                  <span className="text-[11px] text-slate-400">Select an option to display only those items</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Pending Status Filter Card */}
                  <div
                    onClick={() => {
                      setActiveTab('orders');
                      setOrderStatusFilter('Pending');
                    }}
                    className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 hover:border-amber-400 hover:shadow-md cursor-pointer transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-600" />
                        Pending Orders
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 font-mono text-xs font-bold">
                        {pendingOrdersCount}
                      </span>
                    </div>
                    <p className="text-xs text-amber-700/80 mt-2 font-medium">
                      Awaiting courier booking or warehouse packaging.
                    </p>
                    <span className="mt-3 text-[11px] font-bold text-amber-800 flex items-center gap-1 group-hover:underline">
                      Filter & Display Only Pending ({pendingOrdersCount}) →
                    </span>
                  </div>

                  {/* Shipped Status Filter Card */}
                  <div
                    onClick={() => {
                      setActiveTab('orders');
                      setOrderStatusFilter('Shipped');
                    }}
                    className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200/80 hover:border-sky-400 hover:shadow-md cursor-pointer transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sky-800 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-sky-600" />
                        Shipped Orders
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-sky-200/70 text-sky-900 font-mono text-xs font-bold">
                        {shippedOrdersCount}
                      </span>
                    </div>
                    <p className="text-xs text-sky-700/80 mt-2 font-medium">
                      Dispatched with courier tracking and waybill active.
                    </p>
                    <span className="mt-3 text-[11px] font-bold text-sky-800 flex items-center gap-1 group-hover:underline">
                      Filter & Display Only Shipped ({shippedOrdersCount}) →
                    </span>
                  </div>

                  {/* Delivered Status Filter Card */}
                  <div
                    onClick={() => {
                      setActiveTab('orders');
                      setOrderStatusFilter('Delivered');
                    }}
                    className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 hover:border-emerald-400 hover:shadow-md cursor-pointer transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Delivered Orders
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-200/70 text-emerald-900 font-mono text-xs font-bold">
                        {deliveredOrdersCount}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-700/80 mt-2 font-medium">
                      Customer received parcel; payment completed.
                    </p>
                    <span className="mt-3 text-[11px] font-bold text-emerald-800 flex items-center gap-1 group-hover:underline">
                      Filter & Display Only Delivered ({deliveredOrdersCount}) →
                    </span>
                  </div>

                  {/* Cancelled Status Filter Card */}
                  <div
                    onClick={() => {
                      setActiveTab('orders');
                      setOrderStatusFilter('Cancelled');
                    }}
                    className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 hover:border-rose-400 hover:shadow-md cursor-pointer transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                        <XCircle className="w-4 h-4 text-rose-600" />
                        Cancelled Orders
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-200/70 text-rose-900 font-mono text-xs font-bold">
                        {cancelledOrdersCount}
                      </span>
                    </div>
                    <p className="text-xs text-rose-700/80 mt-2 font-medium">
                      Returned by courier or rejected before dispatch.
                    </p>
                    <span className="mt-3 text-[11px] font-bold text-rose-800 flex items-center gap-1 group-hover:underline">
                      Filter & Display Only Cancelled ({cancelledOrdersCount}) →
                    </span>
                  </div>
                </div>
              </div>
              )}

              {/* Secondary Highlights (Revenue, Catalog Items, Delivered, Stock) */}
              {(overviewFocusFilter === 'all' || overviewFocusFilter === 'inventory' || overviewFocusFilter === 'revenue') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-150">
                {/* Total Revenue */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Total Revenue
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-extrabold font-display text-slate-900">
                      ৳ {totalRevenue.toLocaleString()}
                    </span>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                      Total sales volume (BDT)
                    </p>
                  </div>
                </div>

                {/* Delivered Orders */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Delivered Orders
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-extrabold font-display text-slate-900">
                      {orders.filter(o => o.shippingStatus === 'Delivered').length}
                    </span>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                      Successfully fulfilled orders
                    </p>
                  </div>
                </div>

                {/* Total Products */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Catalog Items
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                      <Package className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-extrabold font-display text-slate-900">
                      {totalProductsCount}
                    </span>
                    <p className="text-[11px] text-slate-500 font-semibold mt-1">
                      Across {categories.length} Categories
                    </p>
                  </div>
                </div>

                {/* Low Stock Alerts */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Low Stock Alerts
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span
                      className={`text-2xl font-extrabold font-display ${
                        lowStockProducts.length > 0 ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {lowStockProducts.length} Items
                    </span>
                    <p className="text-[11px] text-slate-500 font-semibold mt-1">
                      Inventory &lt;= 5 units remaining
                    </p>
                  </div>
                </div>
              </div>
              )}
            </div>

            {/* Low Stock Alert Banner & List */}
            {(overviewFocusFilter === 'all' || overviewFocusFilter === 'inventory') && lowStockProducts.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-3 animate-in fade-in duration-150">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-rose-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    Inventory Warning: Low Stock Items Requiring Restock
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('debug');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                    >
                      <Bug className="w-3.5 h-3.5" />
                      <span>Open App Debug Panel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('products');
                        setProductStockFilter('low_stock');
                      }}
                      className="text-xs font-bold text-rose-700 hover:underline cursor-pointer"
                    >
                      Filter in Product Management →
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {lowStockProducts.map((p) => (
                    <div
                      key={p.id}
                      className="bg-white p-3 rounded-xl border border-rose-200 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={p.imageUrl}
                          alt={p.title}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                        <div className="truncate">
                          <p className="font-bold text-slate-800 truncate">{p.title}</p>
                          <p className="text-rose-600 font-semibold">Stock: {p.stock} left</p>
                        </div>
                      </div>
                      {hasPermission('product.update') && (
                        <button
                          onClick={() => openEditProductModal(p)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px]"
                        >
                          Restock
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Orders Overview */}
            {(overviewFocusFilter === 'all' || overviewFocusFilter === 'orders_health') && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden animate-in fade-in duration-150">
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-slate-800 text-base">
                    Recent Customer Orders
                  </h3>
                  <p className="text-xs text-slate-500">Live feed of store orders and payment status</p>
                </div>
                <button
                  onClick={() => setActiveTab('orders')}
                  className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
                >
                  View All Orders & Dispatch
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-slate-100 overflow-x-auto">
                {orders.slice(0, 5).map((ord) => (
                  <div
                    key={ord.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{ord.orderNumber}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ord.paymentStatus === 'Paid' || ord.paymentStatus === 'PAID'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {ord.paymentStatus} ({ord.paymentMethod.toUpperCase()})
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ord.shippingStatus === 'Shipped'
                              ? 'bg-blue-100 text-blue-700'
                              : ord.shippingStatus === 'Delivered'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {ord.shippingStatus}
                        </span>
                      </div>
                      <p className="text-slate-600">
                        <strong>{ord.customer.fullName}</strong> ({ord.customer.phone}) • {ord.customer.fullAddress}, {ord.customer.district}
                      </p>
                      <p className="text-slate-400 text-[11px]">
                        Items: {ord.items.map((i) => `${i.product.title} (x${i.quantity})`).join(', ')}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold font-display text-slate-900 block">
                        ৳ {ord.totalAmount.toLocaleString()} BDT
                      </span>
                      {ord.courierBooking ? (
                        <span className="text-[10px] font-mono text-emerald-600 block mt-0.5">
                          {ord.courierBooking.provider}: {ord.courierBooking.waybillId}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 block mt-0.5">
                          Awaiting Courier Dispatch
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: ORDERS & COURIER LOGISTICS                            */}
        {/* ============================================================ */}
        {activeTab === 'orders' && (
          !hasPermission('canManageOrders') ? (
            renderPermissionRestrictedNotice('canManageOrders', 'Manage Orders')
          ) : (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-900">
                  Order Management & Courier API Integration
                </h2>
                <p className="text-xs text-slate-500">
                  Dispatch packages via simulated Bangladeshi courier APIs (Steadfast / Pathao / RedX), sync parcel status in real time, or manage bookings manually.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="sync-all-courier-btn"
                  onClick={handleSyncAllCouriers}
                  disabled={isSyncingCouriers || !hasPermission('canManageOrders')}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
                  title="Query courier APIs to update all dispatched parcel statuses automatically"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCouriers ? 'animate-spin' : ''}`} />
                  <span>{isSyncingCouriers ? 'Syncing Parcels...' : 'Sync Courier Statuses'}</span>
                </button>
              </div>
            </div>

            {/* Order Status & Entity Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Specific Status Options (Pending, Shipped, Delivered, Cancelled) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    Status Filter:
                  </span>
                  <button
                    type="button"
                    id="filter-order-status-all"
                    onClick={() => setOrderStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      orderStatusFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span>All Orders</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px] font-mono">
                      {totalOrdersCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    id="filter-order-status-pending"
                    onClick={() => setOrderStatusFilter('Pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      orderStatusFilter === 'Pending'
                        ? 'bg-amber-500 text-white shadow-xs ring-2 ring-amber-300'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/70'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pending</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/30 text-[10px] font-mono">
                      {pendingOrdersCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    id="filter-order-status-shipped"
                    onClick={() => setOrderStatusFilter('Shipped')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      orderStatusFilter === 'Shipped'
                        ? 'bg-sky-600 text-white shadow-xs ring-2 ring-sky-300'
                        : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200/70'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Shipped</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/30 text-[10px] font-mono">
                      {shippedOrdersCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    id="filter-order-status-delivered"
                    onClick={() => setOrderStatusFilter('Delivered')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      orderStatusFilter === 'Delivered'
                        ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/70'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Delivered</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/30 text-[10px] font-mono">
                      {deliveredOrdersCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    id="filter-order-status-cancelled"
                    onClick={() => setOrderStatusFilter('Cancelled')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      orderStatusFilter === 'Cancelled'
                        ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-300'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/70'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancelled</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/30 text-[10px] font-mono">
                      {cancelledOrdersCount}
                    </span>
                  </button>
                </div>

                {/* Search, Payment Filter & Sort */}
                <div className="flex items-center gap-2 flex-1 max-w-xl flex-wrap sm:flex-nowrap">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      id="orders-search-input"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Search order #, customer, phone, waybill..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 transition-all"
                    />
                    {orderSearch && (
                      <button
                        type="button"
                        onClick={() => setOrderSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <select
                    id="orders-payment-filter"
                    value={orderPaymentFilter}
                    onChange={(e) => setOrderPaymentFilter(e.target.value as any)}
                    className="py-1.5 px-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-slate-900 cursor-pointer"
                  >
                    <option value="all">All Payments</option>
                    <option value="PAID">Paid / Verified</option>
                    <option value="DUE">Due / Pending</option>
                    <option value="dbbl">DBBL / NexusPay</option>
                    <option value="cod">Cash On Delivery</option>
                  </select>

                  <select
                    id="orders-sort-select"
                    value={orderSortBy}
                    onChange={(e) => setOrderSortBy(e.target.value as any)}
                    className="py-1.5 px-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-slate-900 cursor-pointer"
                    title="Sort orders"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="amount-desc">Amount: High to Low</option>
                    <option value="amount-asc">Amount: Low to High</option>
                  </select>
                </div>
              </div>

              {/* Active Filter Status Indicator & Counter */}
              {(orderStatusFilter !== 'all' || orderPaymentFilter !== 'all' || orderSearch.trim()) && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs text-slate-700 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-medium">
                      Filter Active: Displaying{' '}
                      <strong className="font-bold text-slate-900">
                        {orderStatusFilter !== 'all' ? orderStatusFilter : 'matching'}
                      </strong>{' '}
                      orders ({orderTotalCount} matching, {displayedOrders.length} on this page) —{' '}
                      <span className="text-slate-500">
                        {Math.max(0, totalOrdersCount - orderTotalCount)} orders hidden
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderStatusFilter('all');
                      setOrderPaymentFilter('all');
                      setOrderSearch('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Clear Filter / Show All ({totalOrdersCount})
                  </button>
                </div>
              )}
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="p-3.5">Order / Date</th>
                      <th className="p-3.5">Customer & Delivery</th>
                      <th className="p-3.5">Items Ordered</th>
                      <th className="p-3.5">Payment & Bank Verification</th>
                      <th className="p-3.5">Shipping Status</th>
                      <th className="p-3.5">Courier Logistics</th>
                      <th className="p-3.5 text-right">Order Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {totalOrdersCount === 0 && displayedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          No customer orders placed yet.
                        </td>
                      </tr>
                    ) : displayedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500">
                          <Filter className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                          <p className="font-bold text-sm text-slate-800">
                            No {orderStatusFilter !== 'all' ? `"${orderStatusFilter}"` : ''} orders match your current filter.
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            All other orders ({totalOrdersCount} total) are currently hidden by this filter.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setOrderStatusFilter('all');
                              setOrderPaymentFilter('all');
                              setOrderSearch('');
                            }}
                            className="mt-3 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Show All Orders ({totalOrdersCount})
                          </button>
                        </td>
                      </tr>
                    ) : (
                      displayedOrders.map((ord) => {
                        const isPaid = ord.paymentStatus === 'Paid' || ord.paymentStatus === 'PAID';
                        const isDbbl = ord.paymentMethod === 'dbbl';

                        return (
                          <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Order & Date */}
                            <td className="p-3.5 align-top">
                              <span className="font-mono font-bold text-slate-900 block">
                                {ord.orderNumber}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {new Date(ord.createdAt).toLocaleDateString('en-GB', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                              <span className="text-[9px] text-slate-400 font-mono">
                                {new Date(ord.createdAt).toLocaleTimeString('en-GB', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </td>

                            {/* Customer */}
                            <td className="p-3.5 align-top">
                              <p className="font-bold text-slate-900">{ord.customer.fullName}</p>
                              <a
                                href={`tel:${ord.customer.phone.replace(/[^0-9+]/g, '')}`}
                                className="text-rose-600 hover:underline font-mono text-[11px] block font-semibold"
                              >
                                {ord.customer.phone}
                              </a>
                              <p className="text-slate-600 text-[11px] mt-1 max-w-[220px]">
                                {ord.customer.fullAddress}, <span className="font-medium text-slate-800">{ord.customer.district}</span>
                              </p>
                              {ord.customer.notes && (
                                <p className="text-[10px] text-slate-500 italic mt-1 bg-slate-50 p-1 rounded border border-slate-100 max-w-[220px]">
                                  Note: "{ord.customer.notes}"
                                </p>
                              )}
                            </td>

                            {/* Items */}
                            <td className="p-3.5 align-top">
                              <div className="space-y-1.5 max-w-[220px]">
                                {ord.items.map((it, idx) => (
                                  <div key={idx} className="text-slate-700 text-[11px] border-b border-slate-100 last:border-0 pb-1 last:pb-0">
                                    <div className="flex items-start justify-between gap-1">
                                      <span className="truncate font-medium">• {it.product.title}</span>
                                      <span className="font-bold text-slate-900 shrink-0">x{it.quantity}</span>
                                    </div>
                                    {(() => {
                                      const canViewBuying = isSuperAdmin || hasPermission('product.view_buying_price');
                                      const canViewProfit = isSuperAdmin || hasPermission('product.view_profit');
                                      if (!canViewBuying && !canViewProfit) return null;
                                      const hasCost = canViewBuying && it.buyingPriceSnapshot !== undefined;
                                      const profitVal = it.productGrossProfit != null
                                        ? it.productGrossProfit
                                        : (it.buyingPriceSnapshot !== undefined ? (((it.sellingPriceSnapshot ?? it.product.price) - it.buyingPriceSnapshot) * it.quantity) : undefined);
                                      const hasProfit = canViewProfit && profitVal !== undefined;
                                      if (!hasCost && !hasProfit) return null;
                                      const isLoss = (profitVal || 0) < 0;
                                      return (
                                        <div className={`flex items-center gap-1.5 mt-0.5 text-[9px] font-mono ${isLoss ? 'text-rose-600' : 'text-emerald-700'}`}>
                                          {hasCost && <span>Cost: ৳{it.buyingPriceSnapshot}</span>}
                                          {hasCost && hasProfit && <span>•</span>}
                                          {hasProfit && <span>{isLoss ? `Loss: -৳${Math.abs(profitVal!)}` : `Profit: ৳${profitVal}`}</span>}
                                        </div>
                                      );
                                    })()}
                                    {(it.selectedSize || it.selectedColor) && (
                                      <div className="flex items-center gap-1 mt-0.5 ml-2 flex-wrap">
                                        {it.selectedSize && (
                                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[9px] font-semibold">
                                            Size: {it.selectedSize}
                                          </span>
                                        )}
                                        {it.selectedColor && (() => {
                                          const parsed = parseColorOption(it.selectedColor);
                                          return (
                                            <span className="px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-slate-800 text-[9px] font-semibold flex items-center gap-1">
                                              <span>Color:</span>
                                              <span
                                                className={`w-1.5 h-1.5 rounded-full border shadow-2xs shrink-0 ${
                                                  parsed.isLight ? 'border-slate-300' : 'border-black/20'
                                                }`}
                                                style={{ backgroundColor: parsed.hex }}
                                              />
                                              <span>{parsed.name}</span>
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>

                            {/* Amount & Payment & Bank Details */}
                            <td className="p-3.5 align-top">
                              <div className="space-y-1.5 min-w-[200px]">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold font-display text-slate-900 text-sm">
                                    ৳ {ord.totalAmount.toLocaleString()}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                      isPaid
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        : ord.paymentStatus === 'UNVERIFIED'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                                    }`}
                                  >
                                    {ord.paymentStatus}
                                  </span>
                                </div>

                                <div className="text-[10px] text-slate-500 font-medium">
                                  Method:{' '}
                                  <span className="font-bold text-slate-700 uppercase">
                                    {isDbbl ? 'DBBL / NexusPay' : 'Cash on Delivery'}
                                  </span>
                                </div>

                                {/* Advance Payment & Customer Due display badge */}
                                {ord.advancePayment != null && Number(ord.advancePayment) > 0 && (
                                  <div className="p-1.5 bg-blue-50/70 border border-blue-100 rounded-lg text-[10px] space-y-0.5 font-mono">
                                    <div className="flex items-center justify-between text-blue-800">
                                      <span>Advance:</span>
                                      <span className="font-bold">৳{Number(ord.advancePayment).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-900 font-bold border-t border-blue-200/50 pt-0.5">
                                      <span>Due (COD):</span>
                                      <span className="text-emerald-700">
                                        ৳{(ord.customerDue ?? Math.max(0, Math.round(((Number(ord.totalAmount) || 0) - (Number(ord.advancePayment) || 0)) * 100) / 100)).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {canViewProfit && ord.totalGrossProfit !== undefined && (
                                  <div className={`p-1.5 border rounded-lg flex items-center justify-between text-[10px] font-mono ${
                                    ord.totalGrossProfit < 0
                                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  }`}>
                                    {canViewBuyingPrice && ord.totalCost !== undefined ? (
                                      <span>Cost: ৳{(ord.totalCost || 0).toLocaleString()}</span>
                                    ) : (
                                      <span className="text-slate-500 font-sans text-[9px] uppercase tracking-wider font-semibold">Net Result</span>
                                    )}
                                    <span className="font-bold">
                                      {ord.totalGrossProfit < 0
                                        ? `Loss: -৳${Math.abs(ord.totalGrossProfit).toLocaleString()}`
                                        : `Profit: ৳${ord.totalGrossProfit.toLocaleString()}`}
                                    </span>
                                  </div>
                                )}

                                {/* DBBL Bank Transfer Details Box */}
                                {isDbbl && (
                                  <div className="p-2 bg-blue-50/70 border border-blue-100 rounded-xl space-y-1 text-[10px] text-slate-700">
                                    <div className="flex items-center gap-1 font-bold text-blue-900">
                                      <Building2 className="w-3 h-3 text-blue-600" />
                                      <span>Direct DBBL Transfer</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">TrxID: </span>
                                      <strong className="font-mono font-bold text-slate-900">
                                        {ord.transactionId || ord.dbblDetails?.transactionId || 'None'}
                                      </strong>
                                    </div>
                                    {ord.dbblDetails?.senderBank && (
                                      <div>
                                        <span className="text-slate-500">From Bank: </span>
                                        <span className="font-medium text-slate-800">{ord.dbblDetails.senderBank}</span>
                                      </div>
                                    )}
                                    {ord.dbblDetails?.senderAccountOrPhone && (
                                      <div>
                                        <span className="text-slate-500">Sender A/C or Phone: </span>
                                        <strong className="font-mono text-slate-800">
                                          {ord.dbblDetails.senderAccountOrPhone}
                                        </strong>
                                      </div>
                                    )}

                                    {/* Deposit Slip / Screenshot Preview */}
                                    {ord.dbblDetails?.depositSlipUrl && (
                                      <div className="pt-1">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewSlipUrl(ord.dbblDetails!.depositSlipUrl!)}
                                          className="flex items-center gap-1 text-[10px] font-bold text-blue-700 hover:text-blue-900 hover:underline bg-white px-2 py-1 rounded border border-blue-200"
                                        >
                                          <ImageIcon className="w-3 h-3 text-blue-500" />
                                          View Deposit Screenshot
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* 1-Click Verify & Mark PAID Button */}
                                {!isPaid && (
                                  <button
                                    type="button"
                                    onClick={() => verifyAndMarkPaid(ord.id)}
                                    className="w-full mt-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center justify-center gap-1 shadow-xs hover:shadow transition-all active:scale-95"
                                    title="Verify Bank Transfer and mark order as PAID"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Verify & Mark PAID
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Shipping Status */}
                            <td className="p-3.5 align-top">
                              <select
                                value={ord.shippingStatus}
                                onChange={(e) =>
                                  updateOrderStatus(ord.id, e.target.value as ShippingStatus)
                                }
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
                                  ord.shippingStatus === 'Shipped'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : ord.shippingStatus === 'Delivered'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : ord.shippingStatus === 'Processing'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Processing">Processing</option>
                                <option value="Shipped">Shipped</option>
                                <option value="Delivered">Delivered</option>
                                <option value="Cancelled">Cancelled</option>
                              </select>

                              {/* Skip Courier Option */}
                              <div className="mt-1.5">
                                <button
                                  onClick={() => {
                                    const nextStatus =
                                      ord.shippingStatus === 'Shipped' ? 'Delivered' : 'Shipped';
                                    handleSkipCourierStatusChange(ord.id, nextStatus);
                                  }}
                                  className="text-[10px] text-slate-500 hover:text-slate-800 underline block"
                                  title="Update status directly without calling Courier API"
                                >
                                  Skip Courier Booking
                                </button>
                              </div>
                            </td>

                            {/* Courier API Action */}
                            <td className="p-3.5 align-top">
                              {ord.courierBooking ? (
                                <div className="space-y-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200 text-[11px] min-w-[160px]">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="font-bold text-slate-800 truncate">
                                      {ord.courierBooking.provider}
                                    </span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                                      (ord.courierStatus || ord.shippingStatus) === 'Delivered'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : (ord.courierStatus || ord.shippingStatus) === 'Cancelled'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-blue-100 text-blue-800'
                                    }`}>
                                      {ord.courierStatus || ord.shippingStatus}
                                    </span>
                                  </div>
                                  <span className="font-mono text-slate-700 block font-semibold text-[10px]">
                                    {ord.courierBooking.waybillId}
                                  </span>
                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 mt-1">
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() =>
                                          copyTrackingLink(
                                            ord.courierBooking!.trackingUrl,
                                            ord.courierBooking!.waybillId
                                          )
                                        }
                                        className="text-rose-600 hover:text-rose-700 font-semibold text-[10px] flex items-center gap-0.5"
                                        title="Copy Tracking ID"
                                      >
                                        <Copy className="w-3 h-3" />
                                        <span>
                                          {copiedTrackingId === ord.courierBooking.waybillId
                                            ? 'Copied!'
                                            : 'Copy'}
                                        </span>
                                      </button>
                                      <a
                                        href={ord.courierBooking.trackingUrl || `https://steadfast.com.bd/t/${ord.courierBooking.waybillId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-400 hover:text-slate-600"
                                        title="Open live tracking page"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>

                                    {/* Auto-Sync Courier Status Button */}
                                    <button
                                      type="button"
                                      disabled={syncingOrderId === ord.id || !hasPermission('canManageOrders')}
                                      onClick={() => handleSyncSingleCourier(ord.id)}
                                      className="px-2 py-0.5 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                                      title="Sync status from courier API"
                                    >
                                      <RefreshCw className={`w-2.5 h-2.5 ${syncingOrderId === ord.id ? 'animate-spin text-purple-700' : ''}`} />
                                      <span>Sync</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5 min-w-[155px]">
                                  {/* Courier Provider Selector Dropdown for this row */}
                                  <div className="flex items-center gap-1">
                                    <Truck className="w-3 h-3 text-slate-400 shrink-0" />
                                    <select
                                      id={`courier-select-${ord.id}`}
                                      value={rowSelectedCouriers[ord.id] || courierConfigs.find(c => c.isActive)?.code || courierConfigs[0]?.code || 'Steadfast'}
                                      onChange={(e) => setRowSelectedCouriers((prev) => ({ ...prev, [ord.id]: e.target.value }))}
                                      className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-[10px] font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs cursor-pointer truncate"
                                      title="Select courier service"
                                    >
                                      {courierConfigs.map((c) => (
                                        <option key={c.id || c.code} value={c.code || c.name}>
                                          {c.name} {c.isActive ? '' : '(Inactive)'}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* 1-Click Courier Dispatch Button */}
                                  {ord.shippingStatus === 'Pending' && (
                                    <button
                                      id={`send-steadfast-btn-${ord.id}`}
                                      type="button"
                                      disabled={isBookingSteadfast === ord.id || !hasPermission('canManageOrders')}
                                      onClick={() => handleOneClickCourierBooking(ord, rowSelectedCouriers[ord.id])}
                                      className="w-full px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-xs hover:shadow active:scale-95 transition-all"
                                      title={`1-Click Dispatch to ${(courierConfigs.find(c => c.code.toLowerCase() === (rowSelectedCouriers[ord.id] || 'steadfast').toLowerCase() || c.name.toLowerCase() === (rowSelectedCouriers[ord.id] || 'steadfast').toLowerCase())?.name || rowSelectedCouriers[ord.id] || 'Courier')} API`}
                                    >
                                      {isBookingSteadfast === ord.id ? (
                                        <>
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                          <span>Booking...</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-xs">📦</span>
                                          <span className="truncate">
                                            Send to {(courierConfigs.find(c => c.code.toLowerCase() === (rowSelectedCouriers[ord.id] || 'steadfast').toLowerCase() || c.name.toLowerCase() === (rowSelectedCouriers[ord.id] || 'steadfast').toLowerCase())?.name || rowSelectedCouriers[ord.id] || 'Courier').replace(/ Courier| Logistics| Express/gi, '')}
                                          </span>
                                        </>
                                      )}
                                    </button>
                                  )}

                                  {/* Feedback notification if this order was just booked */}
                                  {steadfastNotice && steadfastNotice.id === ord.id && (
                                    <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[9px] text-emerald-800 font-semibold animate-fadeIn">
                                      ✓ {steadfastNotice.message}
                                    </div>
                                  )}

                                  <button
                                    id={`send-courier-btn-${ord.id}`}
                                    type="button"
                                    disabled={!hasPermission('canManageOrders')}
                                    onClick={() => openCourierBookingModal(ord, rowSelectedCouriers[ord.id])}
                                    className="w-full px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold text-[10px] flex items-center justify-center gap-1 transition-all"
                                    title="Open full parcel booking form with custom delivery type, recipient details, and COD"
                                  >
                                    <Send className="w-2.5 h-2.5 text-blue-600" />
                                    <span>Enter Parcel (API)</span>
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Order Actions (Edit & Delete) */}
                            <td className="p-3.5 align-top text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  id={`edit-order-btn-${ord.id}`}
                                  disabled={!hasPermission('canManageOrders')}
                                  onClick={() => openEditOrderModal(ord)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 hover:text-slate-900 transition-colors"
                                  title={hasPermission('canManageOrders') ? "Edit Order Details" : "Permission required"}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  id={`delete-order-btn-${ord.id}`}
                                  disabled={!hasPermission('canManageOrders')}
                                  onClick={() => handleDeleteOrder(ord)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-600 hover:text-rose-800 transition-colors"
                                  title={hasPermission('canManageOrders') ? "Delete Order (Restores Stock)" : "Permission required"}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Server-Side Pagination Footer */}
              <div
                id="admin-orders-pagination"
                className="px-4 py-3.5 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3 flex-wrap text-slate-600">
                  <span>
                    Showing{' '}
                    <strong className="font-bold text-slate-900">
                      {orderTotalCount === 0
                        ? 0
                        : Math.min(orderTotalCount, (orderPage - 1) * orderPageSize + 1)}
                    </strong>
                    –
                    <strong className="font-bold text-slate-900">
                      {orderTotalCount === 0
                        ? 0
                        : Math.min(orderTotalCount, (orderPage - 1) * orderPageSize + displayedOrders.length)}
                    </strong>{' '}
                    of <strong className="font-bold text-slate-900">{orderTotalCount}</strong> orders
                    {isOrdersLoading && (
                      <span className="ml-2 inline-flex items-center gap-1 text-slate-400 font-medium">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading...
                      </span>
                    )}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <label htmlFor="orders-page-size-select" className="text-slate-500 font-medium">
                      Rows per page:
                    </label>
                    <select
                      id="orders-page-size-select"
                      value={orderPageSize}
                      onChange={(e) => {
                        const nextSize = Math.min(100, Math.max(1, Number(e.target.value) || 25));
                        setOrderPageSize(nextSize);
                        setOrderPage(1);
                      }}
                      className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-800 font-bold text-xs focus:outline-hidden focus:ring-2 focus:ring-slate-900 cursor-pointer"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    id="orders-prev-page-btn"
                    disabled={orderPage <= 1 || isOrdersLoading}
                    onClick={() => setOrderPage((prev) => Math.max(1, prev - 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none text-slate-700 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: Math.min(5, Math.max(1, orderTotalPages)) }, (_, idx) => {
                      const totalP = Math.max(1, orderTotalPages);
                      let startPage = Math.max(1, orderPage - 2);
                      if (startPage + 4 > totalP) {
                        startPage = Math.max(1, totalP - 4);
                      }
                      const pageNum = startPage + idx;
                      if (pageNum > totalP) return null;
                      const isCurrent = pageNum === orderPage;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          id={`orders-page-btn-${pageNum}`}
                          onClick={() => setOrderPage(pageNum)}
                          disabled={isOrdersLoading}
                          className={`min-w-[30px] h-7 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    id="orders-next-page-btn"
                    disabled={orderPage >= orderTotalPages || isOrdersLoading}
                    onClick={() => setOrderPage((prev) => Math.min(orderTotalPages, prev + 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none text-slate-700 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 3: PRODUCT MANAGEMENT                                    */}
        {/* ============================================================ */}
        {activeTab === 'products' && (
          !hasPermission('product.view') ? (
            renderPermissionRestrictedNotice('product.view', 'Product Management & Stock Management')
          ) : (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-900">
                  Dynamic Product Management
                </h2>
                <p className="text-xs text-slate-500">
                  Add, modify prices, edit stock, or delete products with immediate persistent sync.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products..."
                    className="pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {hasPermission('product.create') && (
                  <button
                    id="admin-add-product-btn"
                    onClick={openNewProductModal}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Add New Product
                  </button>
                )}
              </div>
            </div>

            {/* Sub-navigation Tabs: All Products vs Featured Products */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <button
                type="button"
                id="subtab-all-products"
                onClick={() => {
                  setProductsSubView('all');
                  if (productStockFilter === 'featured') setProductStockFilter('all');
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  productsSubView === 'all' && productStockFilter !== 'featured'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>All Products ({products.length})</span>
              </button>

              <button
                type="button"
                id="subtab-featured-products"
                onClick={() => {
                  setProductsSubView('featured');
                  setProductStockFilter('featured');
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  productsSubView === 'featured' || productStockFilter === 'featured'
                    ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-sm'
                    : 'bg-white hover:bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Featured Products ({featuredProductsCount})</span>
              </button>
            </div>

            {(productsSubView === 'featured' || productStockFilter === 'featured') ? (
              <ErrorBoundary compact fallbackTitle="Featured Products Unavailable" fallbackMessage="Could not load featured products management module.">
                <React.Suspense fallback={<AdminTabFallback />}>
                  <FeaturedProductsManagement
                    products={products}
                    categories={categories}
                    featuredProducts={featuredProducts}
                    onToggleFeatured={toggleProductFeatured}
                    hasPermission={hasPermission}
                    isSuperAdmin={isSuperAdmin}
                    onOpenEditModal={openEditProductModal}
                  />
                </React.Suspense>
              </ErrorBoundary>
            ) : (
              <>

            {/* Low Stock Alert & Quick Restock Banner */}
            {products.some((p) => p.stock <= 5) && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-amber-950">
                      {products.filter((p) => p.stock <= 5).length} Products Running Low on Stock! (স্টক প্রায় শেষ)
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Restock inventory directly below with 1-click increment buttons (+5, +10, +25, +50) or custom count.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      filterLowStockOnly
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    {filterLowStockOnly ? 'Show All Products' : 'Show Low Stock Only'}
                  </button>

                  <button
                    onClick={() => {
                      const low = products.filter((p) => p.stock <= 5);
                      low.forEach((p) => increaseStock(p.id, 10));
                      setStockSuccessNotice(`Successfully added +10 stock to ${low.length} low-stock items!`);
                      setTimeout(() => setStockSuccessNotice(null), 3500);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Restock All (+10)
                  </button>
                </div>
              </div>
            )}

            {stockSuccessNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{stockSuccessNotice}</span>
              </div>
            )}

            {ratingSaveSuccess && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <Star className="w-4 h-4 fill-amber-500 text-amber-600 shrink-0" />
                <span>{ratingSaveSuccess}</span>
              </div>
            )}

            {/* Product Status & Category Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Stock Level Filter Options */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    Stock Filter:
                  </span>
                  <button
                    type="button"
                    id="filter-product-all"
                    onClick={() => {
                      setProductStockFilter('all');
                      setFilterLowStockOnly(false);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      productStockFilter === 'all' && !filterLowStockOnly
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    All ({products.length})
                  </button>

                  <button
                    type="button"
                    id="filter-product-in-stock"
                    onClick={() => {
                      setProductStockFilter('in_stock');
                      setFilterLowStockOnly(false);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      productStockFilter === 'in_stock'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    In Stock (&gt;5) ({inStockProductsCount})
                  </button>

                  <button
                    type="button"
                    id="filter-product-low-stock"
                    onClick={() => {
                      setProductStockFilter('low_stock');
                      setFilterLowStockOnly(false);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      productStockFilter === 'low_stock' || filterLowStockOnly
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-800'
                    }`}
                  >
                    Low Stock (&le;5) ({lowStockProducts.length})
                  </button>

                  <button
                    type="button"
                    id="filter-product-out-of-stock"
                    onClick={() => {
                      setProductStockFilter('out_of_stock');
                      setFilterLowStockOnly(false);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      productStockFilter === 'out_of_stock'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
                    }`}
                  >
                    Out of Stock ({outOfStockProductsCount})
                  </button>

                  <button
                    type="button"
                    id="filter-product-featured"
                    onClick={() => {
                      setProductStockFilter('featured');
                      setFilterLowStockOnly(false);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      productStockFilter === 'featured'
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'bg-violet-50 hover:bg-violet-100 text-violet-800'
                    }`}
                  >
                    Featured ({featuredProductsCount})
                  </button>
                </div>

                {/* Category Dropdown Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 shrink-0">Category:</span>
                  <select
                    value={productCategoryFilter}
                    onChange={(e) => setProductCategoryFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer"
                  >
                    <option value="all">All Categories ({categories.length})</option>
                    {categories.map((cat) => {
                      const count = products.filter((p) => p.categoryId === cat.id).length;
                      return (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Active Filter Indicator */}
              {(productStockFilter !== 'all' || productCategoryFilter !== 'all' || filterLowStockOnly || productSearch.trim()) && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-600">
                      Active Product Filter:
                    </span>
                    {productStockFilter !== 'all' && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-bold">
                        Stock: {productStockFilter.replace('_', ' ')}
                      </span>
                    )}
                    {productCategoryFilter !== 'all' && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[11px] font-bold">
                        Category: {categories.find((c) => c.id === productCategoryFilter)?.name || productCategoryFilter}
                      </span>
                    )}
                    {productSearch.trim() && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[11px] font-bold">
                        Search: &quot;{productSearch}&quot;
                      </span>
                    )}
                    <span className="text-slate-500 font-medium">
                      Displaying <strong>{displayedProducts.length}</strong> of {products.length} products
                      {products.length - displayedProducts.length > 0 && (
                        <span className="text-rose-600 font-semibold ml-1">
                          ({products.length - displayedProducts.length} hidden by filter)
                        </span>
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setProductStockFilter('all');
                      setProductCategoryFilter('all');
                      setFilterLowStockOnly(false);
                      setProductSearch('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer transition-colors"
                  >
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>

            {/* Products Grid Table */}
            {displayedProducts.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <Package className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm">No products match the selected filter</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  All {products.length} products are currently hidden by your active filter criteria. Clear or adjust your filter options to view items.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setProductStockFilter('all');
                    setProductCategoryFilter('all');
                    setFilterLowStockOnly(false);
                    setProductSearch('');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-colors cursor-pointer"
                >
                  Show All Products ({products.length})
                </button>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {displayedProducts
                .map((product) => {
                  const cat = categories.find((c) => c.id === product.categoryId);
                  return (
                    <div
                      key={product.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className="relative aspect-video w-full bg-slate-100 overflow-hidden">
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            className="w-full h-full object-cover"
                          />
                          {product.images && product.images.length > 1 && (
                            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold text-white bg-slate-900/80 backdrop-blur-xs flex items-center gap-1 shadow-xs">
                              <Images className="w-3 h-3 text-rose-400" />
                              {product.images.length} photos
                            </span>
                          )}
                          {product.featured && (
                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold text-white bg-slate-900 border border-slate-700/80">
                              Featured
                            </span>
                          )}
                          <span
                            className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${
                              product.stock === 0
                                ? 'bg-rose-600 ring-2 ring-rose-300'
                                : product.stock <= 5
                                ? 'bg-rose-500'
                                : 'bg-slate-900/80'
                            }`}
                          >
                            {product.stock === 0 ? 'Out of Stock' : `Stock: ${product.stock}`}
                          </span>
                        </div>

                        <div className="p-4 space-y-2">
                          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
                            {cat ? cat.name : 'Category'}
                          </span>
                          <h4 className="font-bold text-sm text-slate-800 line-clamp-1">
                            {product.title}
                          </h4>
                          <div className="flex items-baseline gap-2 pt-1">
                            <span className="text-base font-bold font-display text-slate-900">
                              ৳ {product.price.toLocaleString()}
                            </span>
                            {product.originalPrice && (
                              <span className="text-xs text-slate-400 line-through">
                                ৳ {product.originalPrice.toLocaleString()}
                              </span>
                            )}
                          </div>

                          {/* Product Variants (Sizes & Colors) preview */}
                          {((product.sizes && product.sizes.length > 0) || (product.colors && product.colors.length > 0)) && (
                            <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-xs gap-1 flex-wrap">
                              {product.sizes && product.sizes.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] text-slate-400 font-bold">Sizes:</span>
                                  {product.sizes.slice(0, 3).map((sz, sIdx) => (
                                    <span key={sIdx} className="px-1.5 py-0.2 bg-slate-100 rounded text-[10px] font-bold text-slate-700">
                                      {sz}
                                    </span>
                                  ))}
                                  {product.sizes.length > 3 && (
                                    <span className="text-[10px] text-slate-400 font-bold">+{product.sizes.length - 3}</span>
                                  )}
                                </div>
                              )}
                              {product.colors && product.colors.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <div className="flex items-center -space-x-1">
                                    {product.colors.slice(0, 4).map((col, cIdx) => {
                                      const parsed = parseColorOption(col);
                                      return (
                                        <span
                                          key={cIdx}
                                          className="w-3 h-3 rounded-full border border-white shadow-2xs shrink-0"
                                          style={{ backgroundColor: parsed.hex }}
                                          title={parsed.name}
                                        />
                                      );
                                    })}
                                  </div>
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    {product.colors.length} {product.colors.length === 1 ? 'col' : 'cols'}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Confidential Cost & Unit Profit Badge */}
                          {(() => {
                            const canViewBuying = isSuperAdmin || hasPermission('product.view_buying_price');
                            const canViewProfit = isSuperAdmin || hasPermission('product.view_profit');
                            if (!canViewBuying && !canViewProfit) return null;

                            const rawCost = product.buyingPrice !== undefined ? product.buyingPrice : (product as any).buying_price;
                            const hasCost = canViewBuying && rawCost !== undefined && rawCost !== null;
                            const costVal = hasCost ? Number(rawCost) : 0;

                            const rawProfit = product.unitProfit !== undefined
                              ? product.unitProfit
                              : ((product as any).unit_profit !== undefined ? (product as any).unit_profit : (hasCost ? product.price - costVal : undefined));
                            const hasProfit = canViewProfit && rawProfit !== undefined && rawProfit !== null;
                            const profitVal = hasProfit ? Number(rawProfit) : 0;

                            if (!hasCost && !hasProfit) return null;

                            return (
                              <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between text-xs">
                                {hasCost ? (
                                  <span className="text-[11px] text-slate-500 font-medium">
                                    Cost: <strong className="text-slate-800 font-semibold font-mono">৳{costVal.toLocaleString()}</strong>
                                  </span>
                                ) : <span />}
                                {hasProfit ? (
                                  <ConfidentialProfitBadge profitVal={profitVal} />
                                ) : null}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Stock Restock Quick Controls */}
                      <div className="px-4 py-2.5 bg-slate-50/90 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[11px] font-bold text-slate-500">
                            Available Units:
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                              product.stock === 0
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : product.stock <= 5
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {product.stock === 0 ? 'Out of Stock' : `${product.stock} in stock`}
                          </span>
                        </div>

                        {/* Quick stock buttons */}
                        {hasPermission('product.update') && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                                Add:
                              </span>
                              {[5, 10, 25, 50].map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => {
                                    increaseStock(product.id, amt);
                                    setStockSuccessNotice(`Added +${amt} stock to "${product.title}"! (New: ${product.stock + amt})`);
                                    setTimeout(() => setStockSuccessNotice(null), 3000);
                                  }}
                                  className="flex-1 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 font-bold text-[11px] shadow-xs active:scale-95 transition-all"
                                  title={`Increase stock by ${amt}`}
                                >
                                  +{amt}
                                </button>
                              ))}
                            </div>

                            {/* Custom amount increment */}
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <input
                                type="number"
                                min="1"
                                placeholder="Custom"
                                value={stockQuickAddAmount[product.id] || ''}
                                onChange={(e) =>
                                  setStockQuickAddAmount({
                                    ...stockQuickAddAmount,
                                    [product.id]: parseInt(e.target.value, 10) || 0,
                                  })
                                }
                                className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const amt = stockQuickAddAmount[product.id] || 0;
                                  if (amt > 0) {
                                    increaseStock(product.id, amt);
                                    setStockSuccessNotice(`Added +${amt} stock to "${product.title}"!`);
                                    setStockQuickAddAmount({ ...stockQuickAddAmount, [product.id]: 0 });
                                    setTimeout(() => setStockSuccessNotice(null), 3000);
                                  }
                                }}
                                className="flex-1 py-1 px-2 rounded-lg bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                Add Custom
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Product Rating & Reviews */}
                      <div className="px-4 py-2 bg-amber-50/70 border-t border-amber-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          <span className="font-bold text-slate-800">
                            {product.rating !== undefined ? product.rating.toFixed(1) : '5.0'}
                          </span>
                          <span className="text-slate-400 text-[11px]">
                            {(product.reviewsCount ?? 0) > 0 ? `(${product.reviewsCount} revs)` : '(No reviews)'}
                          </span>
                        </div>
                        {hasPermission('review.manage') && (
                          <button
                            id={`admin-add-review-${product.id}`}
                            type="button"
                            onClick={() => openAdminAddReviewModal(product)}
                            className="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                            title="Add customer review directly for this product"
                          >
                            <Plus className="w-3 h-3 text-rose-600" />
                            Add Review
                          </button>
                        )}
                      </div>

                      {(hasPermission('product.update') || hasPermission('product.delete')) && (
                        <div className="p-3 border-t border-slate-100 flex items-center gap-2 bg-white">
                          {hasPermission('product.update') && (
                            <>
                              <button
                                id={`edit-product-${product.id}`}
                                onClick={() => openEditProductModal(product)}
                                className="flex-1 py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 hover:bg-slate-100 transition-colors shadow-xs"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                                <span>Edit Details</span>
                              </button>
                              <button
                                id={`toggle-featured-card-${product.id}`}
                                type="button"
                                onClick={() => toggleProductFeatured(product.id, !product.featured)}
                                className={`py-1.5 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer border ${
                                  product.featured
                                    ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                                title={product.featured ? 'Remove from Featured' : 'Add to Featured'}
                              >
                                <Sparkles className={`w-3.5 h-3.5 ${product.featured ? 'text-rose-500 fill-rose-500' : 'text-slate-400'}`} />
                                <span className="hidden sm:inline">{product.featured ? 'Featured' : 'Feature'}</span>
                              </button>
                            </>
                          )}
                          {hasPermission('product.delete') && (
                            <button
                              id={`delete-product-${product.id}`}
                              onClick={() => {
                                if (!hasPermission('product.delete')) {
                                  showNotification('error', 'Access Denied', 'Permission required: product.delete');
                                  return;
                                }
                                setConfirmDialog({
                                  isOpen: true,
                                  title: `Delete "${product.title}"?`,
                                  message: `Are you sure you want to permanently delete "${product.title}"? This action cannot be undone.`,
                                  confirmText: 'Delete Product',
                                  cancelText: 'Cancel',
                                  variant: 'danger',
                                  onConfirm: async () => {
                                    const res = await deleteProduct(product.id);
                                    if (res && res.success === false) {
                                      setStockSuccessNotice(`Failed to delete product from D1: ${res.error}`);
                                    } else {
                                      setStockSuccessNotice(`Product "${product.title}" deleted.`);
                                    }
                                    setTimeout(() => setStockSuccessNotice(null), 3000);
                                  },
                                });
                              }}
                              className="py-1.5 px-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1 hover:bg-rose-100 transition-colors cursor-pointer"
                              title={`Delete ${product.title}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            )}
            </>
            )}
          </div>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 4: CATEGORIES CRUD                                       */}
        {/* ============================================================ */}
        {activeTab === 'categories' && (
          !hasPermission('canManageCategories') ? (
            renderPermissionRestrictedNotice('canManageCategories', 'Categories Management')
          ) : (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-xl text-slate-900">
                  Dynamic Category Management
                </h2>
                <p className="text-xs text-slate-500">
                  Add, rename, or remove product categories. Storefront navigation and filters update instantaneously.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Search categories..."
                    className="pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {categorySearch && (
                    <button
                      onClick={() => setCategorySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  id="admin-add-category-btn"
                  onClick={openNewCategoryModal}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Add New Category
                </button>
              </div>
            </div>

            {/* Category Filter Options Bar */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  Category Filter:
                </span>

                <button
                  type="button"
                  id="filter-cat-all"
                  onClick={() => setCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    categoryFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All Categories ({categories.length})
                </button>

                <button
                  type="button"
                  id="filter-cat-with-products"
                  onClick={() => setCategoryFilter('with_products')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    categoryFilter === 'with_products'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800'
                  }`}
                >
                  With Products ({categories.filter((c) => products.some((p) => p.categoryId === c.id)).length})
                </button>

                <button
                  type="button"
                  id="filter-cat-empty"
                  onClick={() => setCategoryFilter('empty')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    categoryFilter === 'empty'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800'
                  }`}
                >
                  Empty Categories ({categories.filter((c) => !products.some((p) => p.categoryId === c.id)).length})
                </button>
              </div>

              {(categoryFilter !== 'all' || categorySearch.trim()) && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">
                    Showing <strong>{displayedCategories.length}</strong> of {categories.length}
                    {categories.length - displayedCategories.length > 0 && (
                      <span className="text-rose-600 font-semibold ml-1">
                        ({categories.length - displayedCategories.length} hidden)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('all');
                      setCategorySearch('');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* Categories Grid */}
            {displayedCategories.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <FolderTree className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm">No categories match the filter</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  All {categories.length} categories are hidden by your current filter. Clear the filter to view all categories.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter('all');
                    setCategorySearch('');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-colors cursor-pointer"
                >
                  Show All Categories ({categories.length})
                </button>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {displayedCategories.map((cat) => {
                const count = products.filter((p) => p.categoryId === cat.id).length;
                return (
                  <div
                    key={cat.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between space-y-4 hover:border-indigo-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                          {cat.name.slice(0, 1)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('products');
                            setProductCategoryFilter(cat.id);
                            setProductStockFilter('all');
                          }}
                          className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 transition-colors cursor-pointer"
                          title="Click to display ONLY products in this category"
                        >
                          {count} Products (Filter →)
                        </button>
                      </div>
                      <h3 className="font-display font-bold text-base text-slate-900 mt-3">
                        {cat.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {cat.description || 'Category for store collections.'}
                      </p>
                      <span className="inline-block mt-2 font-mono text-[10px] text-slate-400">
                        slug: /{cat.slug}
                      </span>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => openEditCategoryModal(cat)}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 border border-slate-200 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                        Rename / Edit
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: `Delete Category "${cat.name}"?`,
                            message: `Are you sure you want to delete category "${cat.name}"? Products inside may become uncategorized.`,
                            confirmText: 'Delete Category',
                            cancelText: 'Cancel',
                            variant: 'danger',
                            onConfirm: async () => {
                              await deleteCategory(cat.id);
                            },
                          });
                        }}
                        className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs border border-rose-200 transition-colors cursor-pointer"
                        title={`Delete ${cat.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 5: STORE SETTINGS                                        */}
        {/* ============================================================ */}
        {activeTab === 'settings' && (
          !hasPermission('settings.manage') ? (
            renderPermissionRestrictedNotice('settings.manage', 'Store Settings & Configuration (Super Admin Only)')
          ) : (
          <div className="space-y-6 animate-in fade-in duration-200 max-w-3xl">
            <div>
              <h2 className="font-display font-bold text-xl text-slate-900">
                Store Customization & Delivery Settings
              </h2>
              <p className="text-xs text-slate-500">
                Configure brand name, address, contact hotline, delivery fees, and promo headlines.
              </p>
            </div>

            {settingsSavedNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Settings saved successfully to Cloudflare D1! Persistent across all visits.</span>
              </div>
            )}

            {settingsError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                <X className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Save Error: {settingsError}</span>
              </div>
            )}

            {/* Store Settings Section Filter Bar */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                Settings Filter:
              </span>
              <button
                type="button"
                id="filter-settings-all"
                onClick={() => setSettingsSectionFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  settingsSectionFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                All Settings
              </button>
              <button
                type="button"
                id="filter-settings-general"
                onClick={() => setSettingsSectionFilter('general')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  settingsSectionFilter === 'general'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
                }`}
              >
                Store / Header Settings
              </button>
              <button
                type="button"
                id="filter-settings-delivery"
                onClick={() => setSettingsSectionFilter('delivery')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  settingsSectionFilter === 'delivery'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800'
                }`}
              >
                Delivery Fees
              </button>
              <button
                type="button"
                id="filter-settings-bank"
                onClick={() => setSettingsSectionFilter('bank')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  settingsSectionFilter === 'bank'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-800'
                }`}
              >
                DBBL Bank & NexusPay
              </button>
              <button
                type="button"
                id="filter-settings-footer"
                onClick={() => setSettingsSectionFilter('footer')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  settingsSectionFilter === 'footer'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-800'
                }`}
              >
                Footer & Legal Policies
              </button>
              <button
                type="button"
                id="filter-settings-pixels"
                onClick={() => setSettingsSectionFilter('pixels')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  settingsSectionFilter === 'pixels'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
                }`}
              >
                Marketing Pixels & Tracking
              </button>
            </div>

            {settingsSectionFilter !== 'all' && (
              <div className="flex items-center justify-between text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
                <span>
                  Filtering active: Only showing <strong>{
                    settingsSectionFilter === 'general' ? 'Store / Header Settings' :
                    settingsSectionFilter === 'delivery' ? 'Delivery Fees' :
                    settingsSectionFilter === 'bank' ? 'DBBL Bank & NexusPay' :
                    settingsSectionFilter === 'footer' ? 'Footer & Legal Policies' : 'Marketing Pixels & Tracking'
                  }</strong>. Other sections are hidden.
                </span>
                <button
                  type="button"
                  onClick={() => setSettingsSectionFilter('all')}
                  className="font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Show All Settings
                </button>
              </div>
            )}

            {/* MARKETING PIXELS & ADVANCED MATCHING SECTION */}
            {(settingsSectionFilter === 'all' || settingsSectionFilter === 'pixels') && (
              <div id="settings-pixels-section" className="space-y-4">
                <ErrorBoundary compact fallbackTitle="Pixels Unavailable" fallbackMessage="Could not load marketing pixels management.">
                  <React.Suspense fallback={<AdminTabFallback />}>
                    <AdminMarketingPixelsTab />
                  </React.Suspense>
                </ErrorBoundary>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              {/* General & Contact Section */}
              {(settingsSectionFilter === 'all' || settingsSectionFilter === 'general') && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Store Name
                    </label>
                    <input
                      type="text"
                      value={settingsForm.siteName}
                      onChange={(e) => updateSetting('siteName', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      required
                    />
                  </div>

                  {/* Website Brand Logo Upload/Link Field */}
                  <ImageUploadField
                    label="Website Logo"
                    sublabel="Upload brand logo directly from your device (PNG, JPG, WEBP, SVG) or paste an image link."
                    value={settingsForm.logoUrl}
                    onChange={(val) => updateSetting('logoUrl', val)}
                    recommendedSize="500 × 500 px"
                    aspectRatioLabel="Square / Transparent PNG"
                    maxDimension={800}
                    idPrefix="store-brand-logo"
                    placeholder="https://i.pinimg.com/... or upload image"
                    previewHeightClass="h-20"
                  />

                  {/* Website Favicon / Browser Tab Icon Upload/Link Field */}
                  <ImageUploadField
                    label="Website Icon / Favicon"
                    sublabel="Upload browser tab icon directly from your device (.ico, .png, .svg) or paste an icon link."
                    value={settingsForm.faviconUrl || ''}
                    onChange={(val) => updateSetting('faviconUrl', val)}
                    recommendedSize="64 × 64 px"
                    aspectRatioLabel="1:1 App Icon"
                    maxDimension={256}
                    idPrefix="store-tab-icon"
                    placeholder="https://example.com/favicon.png or upload icon"
                    previewHeightClass="h-16"
                    isIcon={true}
                  />

                  {/* Storefront Promotional Banner Upload/Link Field */}
                  <ImageUploadField
                    label="Storefront Promotional Banner"
                    sublabel="Upload promotional banner directly from your device or paste a wide banner link."
                    value={settingsForm.bannerUrl || ''}
                    onChange={(val) => updateSetting('bannerUrl', val)}
                    recommendedSize="1200 × 480 px (or 1400 × 560 px)"
                    aspectRatioLabel="5:2 Master Ratio (Unified All Devices)"
                    targetAspectRatio={2.5}
                    aspectRatioTolerance={0.35}
                    maxDimension={1600}
                    idPrefix="store-promo-banner"
                    placeholder="https://images.unsplash.com/... or upload banner"
                    previewHeightClass="h-28"
                  />

                  {/* Slider Master Aspect Ratio & Fit Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                        Slider Master Aspect Ratio (All Devices)
                      </label>
                      <select
                        value={settingsForm.sliderAspectRatio || '1200 / 480'}
                        onChange={(e) => updateSetting('sliderAspectRatio', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="1200 / 480">5:2 Master Ratio (1200 × 480 px) - Default</option>
                        <option value="21 / 9">21:9 Cinema Ultra-Wide (1400 × 600 px)</option>
                        <option value="16 / 9">16:9 Standard Wide (1280 × 720 px)</option>
                        <option value="3 / 1">3:1 Panorama Banner (1500 × 500 px)</option>
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Phones, tablets, and laptops all render this identical ratio with automatic height calculation.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                        Banner Image Fitting Strategy
                      </label>
                      <select
                        value={settingsForm.bannerFitMode || 'contain'}
                        onChange={(e) => updateSetting('bannerFitMode', e.target.value as 'contain' | 'cover')}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="contain">Contain (Full Image Preserved - Zero Cropping)</option>
                        <option value="cover">Cover (Fill Whole Frame - May Crop Edges)</option>
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Contain guarantees 100% of promotional text and artwork is never cropped on any device.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Contact Phone / WhatsApp Hotline
                      </label>
                      <input
                        type="text"
                        value={settingsForm.phone}
                        onChange={(e) => updateSetting('phone', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Physical Store Address
                      </label>
                      <input
                        type="text"
                        value={settingsForm.address}
                        onChange={(e) => updateSetting('address', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="top-bar-announcement-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Top Bar Announcement Text
                      </label>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                        Optional
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-1.5">
                      Optional. Leave empty to hide the announcement bar.
                    </p>
                    <textarea
                      id="top-bar-announcement-input"
                      rows={2}
                      value={
                        settingsForm.topBarAnnouncementText !== undefined && settingsForm.topBarAnnouncementText !== null
                          ? settingsForm.topBarAnnouncementText
                          : (settingsForm.announcementText ?? '')
                      }
                      onChange={(e) => {
                        setIsSettingsFormDirty(true);
                        setSettingsForm((prev) => ({
                          ...prev,
                          topBarAnnouncementText: e.target.value,
                          announcementText: e.target.value,
                        }));
                      }}
                      placeholder="e.g. 🚚 সারাদেশে ফ্রি ডেলিভারি চলছে! or 🌟 Flash Sale Active!"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all resize-y"
                    />
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      {((settingsForm.topBarAnnouncementText ?? settingsForm.announcementText ?? '').trim().length > 0) ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Top Bar will be <strong>visible</strong> at the top of the storefront.</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                          <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                          <span>Top Bar is <strong>hidden</strong> (empty or whitespace only).</span>
                        </div>
                      )}
                      {(settingsForm.topBarAnnouncementText || settingsForm.announcementText) && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsSettingsFormDirty(true);
                            setSettingsForm((prev) => ({
                              ...prev,
                              topBarAnnouncementText: '',
                              announcementText: '',
                            }));
                          }}
                          className="text-[10px] text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                        >
                          Clear Text
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Delivery Fees Section */}
              {(settingsSectionFilter === 'all' || settingsSectionFilter === 'delivery') && (
                <div className="pt-2">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Delivery Rates</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Delivery Fee - Inside Dhaka (৳ BDT)
                      </label>
                      <input
                        type="number"
                        value={settingsForm.insideDhakaFee}
                        onChange={(e) => updateSetting('insideDhakaFee', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Delivery Fee - Outside Dhaka (৳ BDT)
                      </label>
                      <input
                        type="number"
                        value={settingsForm.outsideDhakaFee}
                        onChange={(e) => updateSetting('outsideDhakaFee', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Dynamic DBBL Bank Transfer & NexusPay Settings Section */}
              {(settingsSectionFilter === 'all' || settingsSectionFilter === 'bank') && (
                <div className="pt-4 border-t border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-sm text-slate-900">
                        DBBL Bank Transfer & NexusPay Settings
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Dynamic Dutch-Bangla Bank credentials presented to customers during checkout.
                      </p>
                    </div>
                  </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        value={settingsForm.dbblBank?.bankName || ''}
                        onChange={(e) => updateDbblSetting('bankName', e.target.value)}
                        placeholder="Dutch-Bangla Bank PLC"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Account Holder Name
                      </label>
                      <input
                        type="text"
                        value={settingsForm.dbblBank?.accountHolderName || ''}
                        onChange={(e) => updateDbblSetting('accountHolderName', e.target.value)}
                        placeholder="Rongdhonu Trade / Personal Name"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={settingsForm.dbblBank?.accountNumber || ''}
                        onChange={(e) => updateDbblSetting('accountNumber', e.target.value)}
                        placeholder="148.151.0029341"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Branch Name
                      </label>
                      <input
                        type="text"
                        value={settingsForm.dbblBank?.branchName || ''}
                        onChange={(e) => updateDbblSetting('branchName', e.target.value)}
                        placeholder="Uttara Branch, Dhaka"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Routing Number
                      </label>
                      <input
                        type="text"
                        value={settingsForm.dbblBank?.routingNumber || ''}
                        onChange={(e) => updateDbblSetting('routingNumber', e.target.value)}
                        placeholder="090264000"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      NexusPay / Bangla QR Code (Image URL or Upload)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <QrCode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={settingsForm.dbblBank?.qrCodeUrl || ''}
                          onChange={(e) => updateDbblSetting('qrCodeUrl', e.target.value)}
                          placeholder="https://... or upload image"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors">
                          <Upload className="w-3.5 h-3.5 text-blue-600" />
                          <span>Upload QR</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleQrUpload}
                            className="hidden"
                          />
                        </label>
                        {settingsForm.dbblBank?.qrCodeUrl && (
                          <button
                            type="button"
                            onClick={() => updateDbblSetting('qrCodeUrl', '')}
                            className="px-3 py-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                            title="Remove QR code image"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {settingsForm.dbblBank?.qrCodeUrl && (
                      <div className="mt-2 flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 w-fit">
                        <img
                          src={settingsForm.dbblBank.qrCodeUrl}
                          alt="NexusPay QR Preview"
                          className="w-14 h-14 object-contain rounded border border-slate-100"
                        />
                        <div className="text-[10px] text-slate-500">
                          <span className="font-bold text-slate-700 block">QR Code Preview</span>
                          <span>Shown on checkout for DBBL / NexusPay orders</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Payment Instructions for Checkout
                    </label>
                    <textarea
                      rows={2}
                      value={settingsForm.dbblBank?.instructions || ''}
                      onChange={(e) => updateDbblSetting('instructions', e.target.value)}
                      placeholder="Transfer instructions displayed to customers..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
              </div>
              )}

              {/* Dynamic Steadfast Courier API Settings Section */}
              {(settingsSectionFilter === 'all' || settingsSectionFilter === 'delivery' || settingsSectionFilter === 'courier') && (
                <div className="pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-sm text-slate-900">
                          Steadfast Courier API Settings
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Direct live parcel booking &amp; consignment generation with Steadfast Courier.
                        </p>
                      </div>
                    </div>
                    <a
                      href="https://portal.steadfast.com.bd/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                    >
                      <span>Steadfast Portal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Steadfast API Key
                        </label>
                        <input
                          type={showInlineSfKeys ? 'text' : 'password'}
                          value={settingsForm.steadfastApiKey || ''}
                          onChange={(e) => updateSetting('steadfastApiKey', e.target.value)}
                          placeholder="Enter your Steadfast API Key"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Steadfast Secret Key
                        </label>
                        <input
                          type={showInlineSfKeys ? 'text' : 'password'}
                          value={settingsForm.steadfastSecretKey || ''}
                          onChange={(e) => updateSetting('steadfastSecretKey', e.target.value)}
                          placeholder="Enter your Steadfast Secret Key"
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80 text-xs">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setShowInlineSfKeys(!showInlineSfKeys)}
                          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                        >
                          {showInlineSfKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          <span>{showInlineSfKeys ? 'Hide Keys' : 'Reveal Keys'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isTestingSettingsSf || !settingsForm.steadfastApiKey}
                          onClick={async () => {
                            setIsTestingSettingsSf(true);
                            const res = await orderApi.testSteadfastConnection({
                              apiKey: settingsForm.steadfastApiKey?.trim(),
                              secretKey: settingsForm.steadfastSecretKey?.trim(),
                            });
                            setIsTestingSettingsSf(false);
                            setSettingsSfTestResult({
                              success: res.success,
                              message: res.success
                                ? `${res.message}${res.balance !== undefined ? ` • Current Balance: ৳${res.balance}` : ''}`
                                : res.message || res.error || 'Connection test failed',
                            });
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                          {isTestingSettingsSf ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Test Connection &amp; Balance</span>
                            </>
                          )}
                        </button>
                      </div>

                      <span className="text-[10px] text-slate-500">
                        Saved directly to Cloudflare D1 settings upon "Save Store Settings".
                      </span>
                    </div>

                    {settingsSfTestResult && (
                      <div
                        className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                          settingsSfTestResult.success
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                      >
                        {settingsSfTestResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span>{settingsSfTestResult.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic Footer & Customer Policy Customization Section */}
              {(settingsSectionFilter === 'all' || settingsSectionFilter === 'footer') && (
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Dynamic Footer & Customer Policy Settings
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Customize all storefront footer texts, contact addresses, column headings, delivery badges, and policy modals in real-time.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-700 text-[10px] font-bold">
                    Dynamic Footer
                  </span>
                </div>

                {/* 1. Brand Description & Copyright */}
                <div className="space-y-3">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    1. Brand Story & Copyright Notice
                  </h5>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Footer About / Brand Intro
                      </label>
                      <textarea
                        rows={2}
                        value={settingsForm.footer?.aboutText || ''}
                        onChange={(e) => updateFooterSetting('aboutText', e.target.value)}
                        placeholder="Short intro shown under the logo in the footer..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Copyright Notice (Use {'{year}'} for dynamic current year)
                      </label>
                      <input
                        type="text"
                        value={settingsForm.footer?.copyrightText || ''}
                        onChange={(e) => updateFooterSetting('copyrightText', e.target.value)}
                        placeholder="© {year} Rongdhonu Trade. All rights reserved."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Contact & Office Address & Operating Hours */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    2. Support Hotline, WhatsApp Helpline & Operating Hours
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Support Hotline Phone (Voice Calls)
                      </label>
                      <div className="relative">
                        <PhoneCall className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={settingsForm.footer?.supportPhone || ''}
                          onChange={(e) => updateFooterSetting('supportPhone', e.target.value)}
                          placeholder="+8801518739561"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Support Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="email"
                          value={settingsForm.footer?.supportEmail || ''}
                          onChange={(e) => updateFooterSetting('supportEmail', e.target.value)}
                          placeholder="support@rongdhonutrade.com"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Primary WhatsApp Support Hotline Card */}
                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-300/80 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <MessageCircle className="w-4 h-4 text-emerald-600" />
                        <span>Support WhatsApp Number (Live Order Assistance & Hotline)</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-800 text-[10px] font-bold">
                          Store-Wide Active
                        </span>
                      </label>
                      {settingsForm.phone && settingsForm.footer?.supportWhatsApp !== settingsForm.phone && (
                        <button
                          type="button"
                          onClick={() => updateFooterSetting('supportWhatsApp', settingsForm.phone)}
                          className="text-[11px] text-emerald-700 hover:text-emerald-900 underline font-semibold cursor-pointer"
                        >
                          Sync with Store Phone ({settingsForm.phone})
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <PhoneCall className="w-4 h-4 text-emerald-600 absolute left-3.5 top-2.5" />
                      <input
                        type="text"
                        value={settingsForm.footer?.supportWhatsApp || ''}
                        onChange={(e) => updateFooterSetting('supportWhatsApp', e.target.value)}
                        placeholder="+8801518739561 or 017XXXXXXXX"
                        className="w-full pl-10 pr-24 py-2 bg-white border border-emerald-400 focus:border-emerald-600 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500/30 font-mono shadow-2xs"
                      />
                      <div className="absolute right-2 top-1.5 flex items-center gap-1">
                        <a
                          href={formatWhatsAppLink(
                            settingsForm.footer?.supportWhatsApp || settingsForm.phone || '',
                            `Testing ${settingsForm.siteName || 'Store'} WhatsApp support connection!`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                          title="Open WhatsApp in new tab to test connectivity"
                        >
                          <span>Test Link</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-0.5">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                        <span>Target:</span>
                        <span className="font-bold">
                          https://wa.me/{normalizeWhatsAppNumber(settingsForm.footer?.supportWhatsApp || settingsForm.phone || '')}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Updates footer WhatsApp badge, mobile menu hotline, floating chat button, and order tracking contact.
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Physical Office / Warehouse Address
                      </label>
                      <div className="relative">
                        <MapPin className="w-3.5 h-3.5 text-rose-500 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={settingsForm.footer?.officeAddress || ''}
                          onChange={(e) => updateFooterSetting('officeAddress', e.target.value)}
                          placeholder="House 14, Sector 7, Uttara, Dhaka 1230, Bangladesh"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Support Operating Hours Badge
                      </label>
                      <div className="relative">
                        <Clock className="w-3.5 h-3.5 text-amber-500 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={settingsForm.footer?.supportHoursText || ''}
                          onChange={(e) => updateFooterSetting('supportHoursText', e.target.value)}
                          placeholder="Daily 9:00 AM – 10:00 PM (Instant Response)"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Footer Column Titles & Action Labels */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    3. Footer Column Titles & WhatsApp Action
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Categories Column Title
                      </label>
                      <input
                        type="text"
                        value={settingsForm.footer?.categoriesTitle || ''}
                        onChange={(e) => updateFooterSetting('categoriesTitle', e.target.value)}
                        placeholder="Product Categories"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Support & Delivery Column Title
                      </label>
                      <input
                        type="text"
                        value={settingsForm.footer?.supportDeliveryTitle || ''}
                        onChange={(e) => updateFooterSetting('supportDeliveryTitle', e.target.value)}
                        placeholder="Customer Support & Delivery"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        WhatsApp Live Order Button Text
                      </label>
                      <div className="relative">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-500 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={settingsForm.footer?.whatsAppButtonText || ''}
                          onChange={(e) => updateFooterSetting('whatsAppButtonText', e.target.value)}
                          placeholder="WhatsApp Live Order Assistance"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Delivery Service & Guarantee Badges */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    4. Delivery & Guarantee Badges
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Inside Dhaka Badge Text
                      </label>
                      <input
                        type="text"
                        value={settingsForm.footer?.deliveryInsideDhakaText || ''}
                        onChange={(e) => updateFooterSetting('deliveryInsideDhakaText', e.target.value)}
                        placeholder="Inside Dhaka Delivery: 24-48 Hours (৳80)"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Outside Dhaka Badge Text
                      </label>
                      <input
                        type="text"
                        value={settingsForm.footer?.deliveryOutsideDhakaText || ''}
                        onChange={(e) => updateFooterSetting('deliveryOutsideDhakaText', e.target.value)}
                        placeholder="Outside Dhaka Courier: 48-72 Hours (৳150)"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Cash on Delivery Badge Text
                      </label>
                      <input
                        type="text"
                        value={settingsForm.footer?.cashOnDeliveryText || ''}
                        onChange={(e) => updateFooterSetting('cashOnDeliveryText', e.target.value)}
                        placeholder="Cash on Delivery (COD) Available Nationwide"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Warranty & Return Badge Text (Optional)
                      </label>
                      <input
                        type="text"
                        value={
                          settingsForm.footer?.warrantyBadgeText === '7-Day Return & Replacement Warranty'
                            ? ''
                            : (settingsForm.footer?.warrantyBadgeText || '')
                        }
                        onChange={(e) => updateFooterSetting('warrantyBadgeText', e.target.value)}
                        placeholder="Leave blank to hide warranty badge"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Courier & Logistics Partners */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      5. Official Logistics & Courier Partners
                    </h5>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={settingsForm.footer?.showCourierPartners !== false}
                        onChange={(e) => updateFooterSetting('showCourierPartners', e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                      />
                      <span>Show Delivery Partners on Footer</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Logistics & Courier Partners (Separate with commas)</span>
                      <span className="text-[10px] text-slate-400">Comma separated</span>
                    </label>
                    <input
                      type="text"
                      value={settingsForm.footer?.courierPartners?.join(', ') || ''}
                      onChange={(e) =>
                        updateFooterSetting(
                          'courierPartners',
                          e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean)
                        )
                      }
                      placeholder="Steadfast Courier, Pathao Courier, RedX Logistics, Paperfly Express"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(settingsForm.footer?.courierPartners || []).map((cp, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold"
                        >
                          {cp}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 6. Social Media Links */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    6. Social Media Links (Optional)
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Facebook Page URL
                      </label>
                      <input
                        type="url"
                        value={settingsForm.footer?.facebookUrl || ''}
                        onChange={(e) => updateFooterSetting('facebookUrl', e.target.value)}
                        placeholder="https://facebook.com/yourpage"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Instagram Profile URL
                      </label>
                      <input
                        type="url"
                        value={settingsForm.footer?.instagramUrl || ''}
                        onChange={(e) => updateFooterSetting('instagramUrl', e.target.value)}
                        placeholder="https://instagram.com/yourprofile"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        YouTube Channel URL
                      </label>
                      <input
                        type="url"
                        value={settingsForm.footer?.youtubeUrl || ''}
                        onChange={(e) => updateFooterSetting('youtubeUrl', e.target.value)}
                        placeholder="https://youtube.com/@yourchannel"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 7. Legal Policies */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    7. Legal Policies (Viewed in Customer Footer Popups)
                  </h5>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Privacy Policy Content
                      </label>
                      <textarea
                        rows={3}
                        value={settingsForm.footer?.privacyPolicyText || ''}
                        onChange={(e) => updateFooterSetting('privacyPolicyText', e.target.value)}
                        placeholder="Detailed privacy terms..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Terms of Service Content
                      </label>
                      <textarea
                        rows={3}
                        value={settingsForm.footer?.termsOfServiceText || ''}
                        onChange={(e) => updateFooterSetting('termsOfServiceText', e.target.value)}
                        placeholder="Detailed terms of service..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Return & 7-Day Replacement Policy Content
                      </label>
                      <textarea
                        rows={3}
                        value={settingsForm.footer?.returnRefundPolicyText || ''}
                        onChange={(e) => updateFooterSetting('returnRefundPolicyText', e.target.value)}
                        placeholder="Detailed return, exchange and replacement warranty policy..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
              )}

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: 'Reset to Default Seed Data?',
                        message: 'Are you sure you want to reset all products, categories, orders, and settings back to original seed defaults?',
                        confirmText: 'Yes, Reset Everything',
                        cancelText: 'Cancel',
                        variant: 'danger',
                        onConfirm: () => {
                          resetToDefaultSeed();
                          setSettingsForm(settings);
                          setIsSettingsFormDirty(false);
                        },
                      });
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-rose-300 text-rose-600 hover:bg-rose-50 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reset to Seed Data
                  </button>

                  {isSettingsFormDirty && (
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsForm(settings);
                        setIsSettingsFormDirty(false);
                        setSettingsError(null);
                      }}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="Discard unsaved changes and reload current saved settings"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Discard Changes</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  {isSettingsFormDirty && (
                    <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span>Unsaved Changes</span>
                    </span>
                  )}

                  <button
                    id="save-settings-btn"
                    type="submit"
                    disabled={isSavingSettings}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingSettings ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                        <span>Saving to D1...</span>
                      </>
                    ) : (
                      <span>Save Store Settings</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 6: HERO SLIDES MANAGEMENT                                 */}
        {/* ============================================================ */}
        {activeTab === 'slides' && (
          !hasPermission('canManageSettings') ? (
            renderPermissionRestrictedNotice('canManageSettings', 'Hero Slides')
          ) : (
            <ErrorBoundary compact fallbackTitle="Slides Unavailable" fallbackMessage="Could not load hero slides manager.">
              <React.Suspense fallback={<AdminTabFallback />}>
                <AdminSlidesTab
                  slides={slides}
                  categories={categories}
                  onAddSlide={addSlide}
                  onUpdateSlide={updateSlide}
                  onDeleteSlide={deleteSlide}
                  onResetSlides={resetSlides}
                  onReorderSlides={reorderSlides}
                  canManageSlides={hasPermission('canManageSettings')}
                />
              </React.Suspense>
            </ErrorBoundary>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 7: COURIER APIS MANAGEMENT                               */}
        {/* ============================================================ */}
        {activeTab === 'couriers' && (
          !hasPermission('canManageSettings') ? (
            renderPermissionRestrictedNotice('canManageSettings', 'Courier APIs')
          ) : (
            <ErrorBoundary compact fallbackTitle="Couriers Unavailable" fallbackMessage="Could not load courier management.">
              <React.Suspense fallback={<AdminTabFallback />}>
                <AdminCouriersTab
                  courierConfigs={courierConfigs}
                  onAddCourier={addCourierConfig}
                  onUpdateCourier={updateCourierConfig}
                  onDeleteCourier={deleteCourierConfig}
                  onResetCouriers={resetCourierConfigs}
                />
              </React.Suspense>
            </ErrorBoundary>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 8: USER & ADMIN ACCOUNTS MANAGEMENT                      */}
        {/* ============================================================ */}
        {activeTab === 'users' && (
          !hasPermission('canManageAccounts') ? (
            renderPermissionRestrictedNotice('canManageAccounts', 'Accounts Directory')
          ) : (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display font-bold text-xl text-slate-800">
                  User & Admin Accounts Directory
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Manage registered store administrators and regular customer accounts with email and password authentication.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  id="admin-change-superadmin-pwd-header-btn"
                  onClick={() => {
                    setSuperAdminCurrentPw('');
                    setSuperAdminNewPw('');
                    setSuperAdminConfirmPw('');
                    setSuperAdminPwError('');
                    setIsSuperAdminPwModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
                  title="Change master password for Super Admin account"
                >
                  <Key className="w-4 h-4" />
                  <span>Change Super Admin Password</span>
                </button>

                <button
                  id="admin-create-account-btn"
                  onClick={() => {
                    setAuthModalMode('signup');
                    setIsAuthModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Register New Account
                </button>
              </div>
            </div>

            {/* Super Admin Security Banner & Self Password Management */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 via-amber-100/40 to-orange-50 border border-amber-200 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">Super Admin Master Security</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200/80 text-amber-900 uppercase tracking-wide border border-amber-300">
                      Root RBAC Authority
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Active Account: <code className="font-mono font-bold text-slate-800 bg-white/80 px-1.5 py-0.5 rounded border border-amber-200">{currentUser?.email || 'Super Administrator'}</code> (Protected account with unrestricted store privileges).
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="super-admin-banner-change-pw-btn"
                onClick={() => {
                  setSuperAdminCurrentPw('');
                  setSuperAdminNewPw('');
                  setSuperAdminConfirmPw('');
                  setSuperAdminPwError('');
                  setIsSuperAdminPwModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-2xl bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 font-bold text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto"
              >
                <Key className="w-3.5 h-3.5 text-amber-600" />
                <span>Update Password</span>
              </button>
            </div>

            {/* Super Admin Exclusive: Granular Permission Management Selector */}
            {currentUser?.role === 'super_admin' && hasPermission('permission.manage') && (
              <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-50 via-indigo-50/50 to-slate-50 border border-purple-200 rounded-3xl space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-slate-800">
                          Admin & Sub-Admin RBAC Permission Manager
                        </h4>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                          Super Admin Only
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Select an Admin or Sub Admin account to configure granular module privileges. Super Administrator accounts maintain full authority and cannot be modified.
                      </p>
                    </div>
                  </div>

                  {/* Selector Controls */}
                  <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
                    <select
                      id="rbac-quick-select-user"
                      value={selectedStaffUserId}
                      onChange={(e) => setSelectedStaffUserId(e.target.value)}
                      className="px-3 py-2 bg-white border border-purple-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 flex-1 sm:flex-initial"
                    >
                      <option value="">-- Choose Staff Account --</option>
                      {users
                        .filter(
                          (u) => u.role === 'admin' || u.role === 'sub_admin'
                        )
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role.toUpperCase()}) — {u.email}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      id="rbac-open-config-btn"
                      disabled={!selectedStaffUserId}
                      onClick={() => {
                        const target = users.find((u) => u.id === selectedStaffUserId);
                        if (target) {
                          openManagePermissionsModal(target);
                        }
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Configure Permissions</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Notification alert */}
            {accountFeedback && (
              <div
                id="account-feedback-alert"
                className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between animate-fadeIn"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{accountFeedback}</span>
                </div>
                <button
                  onClick={() => setAccountFeedback(null)}
                  className="text-emerald-700 hover:text-emerald-900 text-xs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Quick Metrics (Clickable to Filter) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setAccountRoleFilter('all')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  accountRoleFilter === 'all'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-800'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accountRoleFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    <Users className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accountRoleFilter === 'all' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                    Show All
                  </span>
                </div>
                <div className={`text-xs font-medium ${accountRoleFilter === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>All Registered</div>
                <div className="text-xl font-bold font-display">{users.length}</div>
              </button>

              <button
                type="button"
                onClick={() => setAccountRoleFilter('super_admin')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  accountRoleFilter === 'super_admin'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500'
                    : 'bg-white hover:bg-amber-50/50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accountRoleFilter === 'super_admin' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-700'}`}>
                    <Shield className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accountRoleFilter === 'super_admin' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'}`}>
                    Filter
                  </span>
                </div>
                <div className={`text-xs font-medium ${accountRoleFilter === 'super_admin' ? 'text-amber-100' : 'text-slate-500'}`}>Super Admins</div>
                <div className="text-xl font-bold font-display">
                  {users.filter((u) => u.role === 'super_admin').length}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAccountRoleFilter('sub_admin')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  accountRoleFilter === 'sub_admin'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500'
                    : 'bg-white hover:bg-purple-50/50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accountRoleFilter === 'sub_admin' ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-700'}`}>
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accountRoleFilter === 'sub_admin' ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-800'}`}>
                    Filter
                  </span>
                </div>
                <div className={`text-xs font-medium ${accountRoleFilter === 'sub_admin' ? 'text-purple-100' : 'text-slate-500'}`}>Sub-Admin Staff</div>
                <div className="text-xl font-bold font-display">
                  {users.filter((u) => u.role === 'sub_admin').length}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAccountRoleFilter('customer')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                  accountRoleFilter === 'customer'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500'
                    : 'bg-white hover:bg-blue-50/50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accountRoleFilter === 'customer' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-700'}`}>
                    <User className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${accountRoleFilter === 'customer' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'}`}>
                    Filter
                  </span>
                </div>
                <div className={`text-xs font-medium ${accountRoleFilter === 'customer' ? 'text-blue-100' : 'text-slate-500'}`}>Customers</div>
                <div className="text-xl font-bold font-display">
                  {users.filter((u) => u.role === 'customer').length}
                </div>
              </button>
            </div>

            {/* Accounts Table with Search & Role Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 sm:px-5 border-b border-slate-100 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">Registered Accounts Directory</h4>
                    <span className="text-xs text-slate-400">Total registered profiles: {users.length}</span>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      placeholder="Search accounts by name, email..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                    />
                    {accountSearch && (
                      <button
                        onClick={() => setAccountSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Role Filter Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    Role Filter:
                  </span>

                  <button
                    type="button"
                    id="filter-role-all"
                    onClick={() => setAccountRoleFilter('all')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      accountRoleFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    All ({users.length})
                  </button>

                  <button
                    type="button"
                    id="filter-role-super-admin"
                    onClick={() => setAccountRoleFilter('super_admin')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      accountRoleFilter === 'super_admin'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-800'
                    }`}
                  >
                    Super Admins ({users.filter((u) => u.role === 'super_admin').length})
                  </button>

                  <button
                    type="button"
                    id="filter-role-sub-admin"
                    onClick={() => setAccountRoleFilter('sub_admin')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      accountRoleFilter === 'sub_admin'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-purple-50 hover:bg-purple-100 text-purple-800'
                    }`}
                  >
                    Sub-Admins ({users.filter((u) => u.role === 'sub_admin').length})
                  </button>

                  <button
                    type="button"
                    id="filter-role-admin"
                    onClick={() => setAccountRoleFilter('admin')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      accountRoleFilter === 'admin'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
                    }`}
                  >
                    Admins ({users.filter((u) => u.role === 'admin').length})
                  </button>

                  <button
                    type="button"
                    id="filter-role-customer"
                    onClick={() => setAccountRoleFilter('customer')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      accountRoleFilter === 'customer'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-50 hover:bg-blue-100 text-blue-800'
                    }`}
                  >
                    Customers ({users.filter((u) => u.role === 'customer').length})
                  </button>
                </div>

                {/* Filter Feedback indicator */}
                {(accountRoleFilter !== 'all' || accountSearch.trim()) && (
                  <div className="flex items-center justify-between text-xs pt-1 text-slate-500">
                    <div>
                      Displaying <strong>{displayedUsers.length}</strong> of {users.length} accounts
                      {users.length - displayedUsers.length > 0 && (
                        <span className="text-rose-600 font-semibold ml-1">
                          ({users.length - displayedUsers.length} hidden by filter)
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountRoleFilter('all');
                        setAccountSearch('');
                      }}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                    >
                      Reset Filter
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Email Address</th>
                      <th className="px-5 py-3">Phone</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Date Registered</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                          <div className="max-w-xs mx-auto space-y-2">
                            <Users className="w-8 h-8 text-slate-300 mx-auto" />
                            <div className="font-bold text-slate-700 text-sm">No accounts found</div>
                            <div className="text-xs text-slate-400">
                              All {users.length} accounts are currently hidden by your active filter.
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setAccountRoleFilter('all');
                                setAccountSearch('');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-colors cursor-pointer"
                            >
                              Clear Filter ({users.length} Accounts)
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                    displayedUsers
                      .map((u) => {
                        const isPrimaryMaster = u.role === 'super_admin';
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700">
                                  {u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                                </div>
                                <div>
                                  <span className="font-bold text-slate-900 block">{u.name}</span>
                                  {currentUser?.id === u.id && (
                                    <span className="text-[10px] text-emerald-600 font-semibold">(Active Session)</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 font-medium text-slate-600">{u.email}</td>
                            <td className="px-5 py-3.5 text-slate-600 font-mono text-[11px]">{u.phone || '—'}</td>
                            <td className="px-5 py-3.5">
                              {isPrimaryMaster || u.role === 'super_admin' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  <Shield className="w-3 h-3 text-amber-600" />
                                  Super Admin
                                </span>
                              ) : u.role === 'sub_admin' ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                                    <ShieldCheck className="w-3 h-3 text-purple-600" />
                                    Sub-Admin Staff
                                  </span>
                                  {u.permissions && (
                                    <div className="text-[9px] text-slate-400 font-mono">
                                      {[
                                        u.permissions.canManageOrders && 'Orders',
                                        u.permissions.canManageProducts && 'Products',
                                        u.permissions.canManageCategories && 'Categories',
                                        u.permissions.canManageAccounts && 'Accounts',
                                        u.permissions.canManageSettings && 'Settings',
                                      ]
                                        .filter(Boolean)
                                        .join(', ') || 'No permissions'}
                                    </div>
                                  )}
                                </div>
                              ) : u.role === 'admin' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  <ShieldCheck className="w-3 h-3 text-rose-600" />
                                  Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  <User className="w-3 h-3 text-blue-600" />
                                  Customer
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                              {new Date(u.createdAt).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {isPrimaryMaster ? (
                                <span
                                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                                  title="Super Administrator account is permanently protected against deletion or modification"
                                >
                                  ★ Super Admin Protected
                                </span>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Manage Role & Granular Permissions Button (Super Admin Exclusive) */}
                                  {currentUser?.role === 'super_admin' && hasPermission('permission.manage') && u.role !== 'super_admin' && (
                                    <button
                                      type="button"
                                      id={`permissions-btn-${u.id}`}
                                      onClick={() => openManagePermissionsModal(u)}
                                      className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs active:scale-95 cursor-pointer"
                                      title={`Manage Granular Permissions for ${u.name}`}
                                    >
                                      <Shield className="w-3 h-3 text-purple-600" />
                                      <span>Manage Permissions</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    id={`reset-pwd-btn-${u.id}`}
                                    onClick={() => {
                                      setResettingUser(u);
                                      setNewPasswordValue('');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs active:scale-95"
                                    title={`Reset password for ${u.name} (${u.email})`}
                                  >
                                    <Key className="w-3 h-3 text-amber-600" />
                                    <span>Reset Password</span>
                                  </button>

                                  <button
                                    type="button"
                                    id={`delete-user-${u.id}`}
                                    onClick={() => {
                                      setConfirmDialog({
                                        isOpen: true,
                                        title: `Delete Account "${u.name}"?`,
                                        message: `Are you sure you want to permanently delete account "${u.name}" (${u.email})? This user will no longer be able to log in.`,
                                        confirmText: 'Delete Account',
                                        cancelText: 'Cancel',
                                        variant: 'danger',
                                        onConfirm: async () => {
                                          const res = await deleteUser(u.id);
                                          setAccountFeedback(
                                            res.message || (res.success ? `Account for ${u.name} deleted.` : 'Failed to delete account.')
                                          );
                                          setTimeout(() => setAccountFeedback(null), 4000);
                                        },
                                      });
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title={`Delete account for ${u.name}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      }))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pre-configured Account Credentials for Testing & RBAC Verification (All Users except Super Admin) */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Lock className="w-4 h-4 text-slate-600" />
                    Pre-configured Account Credentials for Testing & RBAC Verification
                  </span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Credentials for testing accounts (Super Admin excluded). Passwords remain masked by default; click the eye icon to reveal them, and click "Grant Permissions" to modify access.
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-full border border-slate-200 self-start sm:self-auto">
                  {users.filter(u => u.role !== 'super_admin').length} Non-Super Admin Accounts
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {users
                  .filter((u) => u.role !== 'super_admin')
                  .map((u) => {
                    const isPwVisible = Boolean(visibleCredentialsPasswords[u.id]);
                    return (
                      <div
                        key={`credential-card-${u.id}`}
                        className={`p-3.5 bg-white rounded-2xl border transition-all flex flex-col justify-between ${
                          u.role === 'admin'
                            ? 'border-indigo-200 shadow-2xs'
                            : u.role === 'sub_admin'
                            ? 'border-purple-200 shadow-2xs'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 ${
                                u.role === 'admin'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : u.role === 'sub_admin'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {u.role === 'admin' ? (
                                <Shield className="w-3 h-3 text-indigo-600" />
                              ) : u.role === 'sub_admin' ? (
                                <ShieldCheck className="w-3 h-3 text-purple-600" />
                              ) : (
                                <User className="w-3 h-3 text-slate-500" />
                              )}
                              {u.role.replace('_', ' ')}
                            </span>

                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {u.id.slice(0, 10)}
                            </span>
                          </div>

                          <div>
                            <div className="font-bold text-xs text-slate-900 truncate">{u.name}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <code className="font-mono text-slate-700 font-semibold">{u.email}</code>
                            </div>
                          </div>

                          {/* Masked Password Field with Eye Toggle */}
                          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">PW:</span>
                              <code className="font-mono text-xs font-bold text-slate-800 tracking-wider truncate">
                                {isPwVisible ? ((u as any).password || 'N/A') : '••••••••'}
                              </code>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleCredentialPasswordVisibility(u.id)}
                              className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors shrink-0 cursor-pointer"
                              title={isPwVisible ? "Hide password" : "Show password (Super Admin)"}
                            >
                              {isPwVisible ? (
                                <EyeOff className="w-3.5 h-3.5 text-slate-700" />
                              ) : (
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                              )}
                            </button>
                          </div>

                          {/* Permissions summary */}
                          <div className="text-[10px] text-slate-500">
                            {u.role === 'admin' ? (
                              <span className="text-indigo-600 font-medium">Full Access across all store modules</span>
                            ) : u.role === 'sub_admin' ? (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {u.permissions?.canManageOrders && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold border border-purple-100">Orders</span>
                                )}
                                {u.permissions?.canManageProducts && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold border border-purple-100">Products</span>
                                )}
                                {u.permissions?.canManageCategories && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold border border-purple-100">Categories</span>
                                )}
                                {u.permissions?.canManageAccounts && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold border border-purple-100">Accounts</span>
                                )}
                                {u.permissions?.canManageSettings && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold border border-purple-100">Settings</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">Regular Storefront Customer (Shopping & Wishlist)</span>
                            )}
                          </div>
                        </div>

                        {/* Super Admin Grant Permissions Action */}
                        {currentUser?.role === 'super_admin' && hasPermission('permission.manage') && u.role !== 'super_admin' && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => openManagePermissionsModal(u)}
                              className="w-full py-1.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                              title={`Grant or modify RBAC permissions for ${u.name}`}
                            >
                              <Shield className="w-3.5 h-3.5" />
                              <span>Grant Permissions</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 9: MARKETING PIXELS & ADVANCED MATCHING SYNCHRONIZATION   */}
        {/* ============================================================ */}
        {activeTab === 'pixels' && (
          !hasPermission('canManageSettings') ? (
            renderPermissionRestrictedNotice('canManageSettings', 'Marketing Pixels & Event Tracking')
          ) : (
            <ErrorBoundary compact fallbackTitle="Pixels Unavailable" fallbackMessage="Could not load marketing pixels tab.">
              <React.Suspense fallback={<AdminTabFallback />}>
                <AdminMarketingPixelsTab />
              </React.Suspense>
            </ErrorBoundary>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 10: PROMO VOUCHERS & DISCOUNT PERCENTAGES                */}
        {/* ============================================================ */}
        {activeTab === 'vouchers' && (
          !hasPermission('canManageSettings') ? (
            renderPermissionRestrictedNotice('canManageSettings', 'Promo Vouchers & Discounts')
          ) : (
            <ErrorBoundary compact fallbackTitle="Vouchers Unavailable" fallbackMessage="Could not load promo vouchers tab.">
              <React.Suspense fallback={<AdminTabFallback />}>
                <AdminVouchersTab />
              </React.Suspense>
            </ErrorBoundary>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 11: APP DEBUG & SYSTEM HEALTH DIAGNOSTICS                */}
        {/* ============================================================ */}
        {activeTab === 'debug' && (
          <ErrorBoundary compact fallbackTitle="Debug Unavailable" fallbackMessage="Could not load system debug tab.">
            <React.Suspense fallback={<AdminTabFallback />}>
              <AdminDebugTab onNavigateTab={(tab) => setActiveTab(tab as any)} />
            </React.Suspense>
          </ErrorBoundary>
        )}

        {/* ============================================================ */}
        {/* TAB 12: PROFIT & FINANCIAL ANALYTICS (SUPER ADMIN ONLY)      */}
        {/* ============================================================ */}
        {activeTab === 'profit' && (
          !isSuperAdmin ? (
            renderPermissionRestrictedNotice('canManageSettings' as any, 'Profit & Financial Analytics (Super Admin Only)')
          ) : (
            <ErrorBoundary compact fallbackTitle="Profit Analytics Unavailable" fallbackMessage="Could not load profit analytics tab.">
              <React.Suspense fallback={<AdminTabFallback />}>
                <AdminProfitAnalyticsTab />
              </React.Suspense>
            </ErrorBoundary>
          )
        )}

        {/* ============================================================ */}
        {/* TAB 13: PRODUCT REVIEWS MODERATION & MANAGEMENT             */}
        {/* ============================================================ */}
        {activeTab === 'reviews' && (
          !hasPermission('review.manage') ? (
            renderPermissionRestrictedNotice('review.manage' as any, 'Product Review Moderation')
          ) : (
            <ErrorBoundary compact fallbackTitle="Reviews Unavailable" fallbackMessage="Could not load review moderation tab.">
              <React.Suspense fallback={<AdminTabFallback />}>
                <AdminReviewsTab />
              </React.Suspense>
            </ErrorBoundary>
          )
        )}
        </main>
      </div>

      {/* ============================================================ */}
      {/* MODAL: STEADFAST COURIER PARCEL BOOKING FORM                 */}
      {/* ============================================================ */}
      {courierModalOrder && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-4 sm:my-6 flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]">
            <div className="h-2 w-full rainbow-gradient-bg shrink-0" />

            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                    <span>Courier Parcel Booking (API)</span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase font-mono">
                      Live API
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dispatch Order <strong className="text-slate-800">#{courierModalOrder.orderNumber}</strong> • Select courier provider and verify dispatch parameters
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCourierModalOrder(null)}
                className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Close parcel booking"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteCourierBooking} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {/* Existing Consignment Duplicate Warning */}
              {(courierModalOrder.consignmentId || courierModalOrder.courierWaybill) && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Warning: Parcel Already Booked</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Order #{courierModalOrder.orderNumber} already has an existing {courierModalOrder.courierName || 'courier'} consignment (ID: <strong className="font-mono">{courierModalOrder.consignmentId || 'N/A'}</strong>, Tracking: <strong className="font-mono">{courierModalOrder.courierWaybill || 'N/A'}</strong>). Re-booking will generate another consignment with the selected courier.
                  </p>
                  <label className="flex items-center gap-2 pt-1 font-bold text-[11px] text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={courierForceDuplicate}
                      onChange={(e) => setCourierForceDuplicate(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300"
                    />
                    <span>Yes, create another parcel anyway (Override duplicate check)</span>
                  </label>
                </div>
              )}

              {/* Error Notice */}
              {courierBookingError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 font-semibold leading-snug">{courierBookingError}</div>
                </div>
              )}

              {/* STEP 1: SELECT COURIER PROVIDER (DROPDOWN MENU) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <label htmlFor="modal-courier-select" className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-600" />
                    <span>1. Select Courier Service (কুরিয়ার সার্ভিস নির্বাচন করুন) *</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                    {courierConfigs.length} couriers available
                  </span>
                </div>

                <select
                  id="modal-courier-select"
                  value={selectedCourier}
                  onChange={(e) => handleModalCourierChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs cursor-pointer"
                >
                  {courierConfigs.map((c) => {
                    const isConfigured = Boolean(
                      (c.code.toLowerCase().includes('steadfast') && (settings.steadfastApiKey || c.apiKey)) ||
                      c.apiKey
                    );
                    return (
                      <option key={c.id || c.code} value={c.code || c.name}>
                        {c.name} {c.isActive ? '• Active' : '• Inactive'} {isConfigured ? '✓ (API Ready)' : '⚠ (Missing API Key)'}
                      </option>
                    );
                  })}
                </select>

                {/* Selected Courier Summary Info & Quick Link */}
                {(() => {
                  const currentConfig = courierConfigs.find(
                    (c) => c.code.toLowerCase() === selectedCourier.toLowerCase() || c.name.toLowerCase() === selectedCourier.toLowerCase() || c.id === selectedCourier
                  ) || courierConfigs[0];
                  const isConfigured = Boolean(
                    (selectedCourier.toLowerCase().includes('steadfast') && Boolean(settings.steadfastApiKey || currentConfig?.hasCredentials)) ||
                    currentConfig?.hasCredentials ||
                    currentConfig?.apiKey
                  );
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-600 border-t border-slate-200/60 mt-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${currentConfig?.isActive ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <span className="font-bold text-slate-800">{currentConfig?.name || selectedCourier}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${isConfigured ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                          {isConfigured ? 'API Connected' : 'Credentials Needed'}
                        </span>
                        {currentConfig?.baseUrl && (
                          <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                            {currentConfig.baseUrl}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCourierModalOrder(null);
                          setActiveTab('couriers' as any);
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Configure in Courier APIs Tab</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Dynamic Courier API Credentials Setup (shown if keys are missing or error mentions credentials) */}
              {(() => {
                const isSf = selectedCourier.toLowerCase().includes('steadfast');
                const currentConfig = courierConfigs.find(
                  (c) => c.code.toLowerCase() === selectedCourier.toLowerCase() || c.name.toLowerCase() === selectedCourier.toLowerCase() || c.id === selectedCourier
                );
                const hasKey = isSf
                  ? Boolean(settings.steadfastApiKey || inlineSfApiKey.trim() || currentConfig?.hasCredentials)
                  : Boolean(currentConfig?.hasCredentials || currentConfig?.apiKey || inlineSfApiKey.trim());
                const isMissing = !hasKey || (courierBookingError && courierBookingError.toLowerCase().includes('credential'));
                if (!isMissing) return null;

                const courierDisplayName = currentConfig?.name || selectedCourier;
                return (
                  <div className="p-4 bg-blue-50/90 border border-blue-200 rounded-2xl text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-blue-950">
                        <Key className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>{courierDisplayName} API Credentials Required</span>
                      </div>
                      {isSf ? (
                        <a
                          href="https://portal.steadfast.com.bd/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1"
                        >
                          <span>Steadfast Portal</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : currentConfig?.baseUrl ? (
                        <span className="text-[10px] font-mono text-blue-700">
                          {currentConfig.baseUrl}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-blue-800 leading-relaxed">
                      Enter your {courierDisplayName} API Key {isSf ? 'and Secret Key' : '(and Secret Key if required)'} below. They will be saved so you can dispatch parcels immediately:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          API Key / Access Token *
                        </label>
                        <input
                          type="text"
                          value={inlineSfApiKey}
                          onChange={(e) => {
                            setInlineSfApiKey(e.target.value);
                            if (courierBookingError) setCourierBookingError(null);
                          }}
                          placeholder={`Paste ${courierDisplayName} API Key...`}
                          className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Secret Key / Token {isSf ? '*' : '(Optional)'}
                        </label>
                        <input
                          type="text"
                          value={inlineSfSecretKey}
                          onChange={(e) => {
                            setInlineSfSecretKey(e.target.value);
                            if (courierBookingError) setCourierBookingError(null);
                          }}
                          placeholder={`Paste ${courierDisplayName} Secret Key...`}
                          className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 2. Delivery Type Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  1. Delivery Service Type (ডেলিভারির ধরন)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCourierDeliveryType(0)}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      courierDeliveryType === 0
                        ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500 font-bold text-emerald-900 shadow-2xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold block">🏠 Home Delivery</span>
                      {courierDeliveryType === 0 && <Check className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block font-normal">
                      Direct door-to-door delivery to recipient address (type = 0)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCourierDeliveryType(1)}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      courierDeliveryType === 1
                        ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500 font-bold text-emerald-900 shadow-2xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold block">📍 Point Delivery / Hub Pickup</span>
                      {courierDeliveryType === 1 && <Check className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block font-normal">
                      Recipient collects parcel from Steadfast local hub (type = 1)
                    </span>
                  </button>
                </div>
              </div>

              {/* 2. Recipient Information */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  2. Recipient Information (গ্রাহকের তথ্য)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Recipient Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={courierRecipientName}
                      onChange={(e) => setCourierRecipientName(e.target.value)}
                      placeholder="e.g. Tanvir Ahmed"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Recipient Phone (11-digits BD) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={courierRecipientPhone}
                      onChange={(e) => setCourierRecipientPhone(e.target.value)}
                      placeholder="017XXXXXXXX"
                      maxLength={11}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Alternative Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      value={courierAltPhone}
                      onChange={(e) => setCourierAltPhone(e.target.value)}
                      placeholder="018XXXXXXXX"
                      maxLength={11}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Recipient Email (Optional)
                    </label>
                    <input
                      type="email"
                      value={courierRecipientEmail}
                      onChange={(e) => setCourierRecipientEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Street / House / Village Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={courierRecipientAddress}
                      onChange={(e) => setCourierRecipientAddress(e.target.value)}
                      placeholder="House 12, Road 4, Sector 7"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Area / Thana (Optional)
                    </label>
                    <input
                      type="text"
                      value={courierRecipientArea}
                      onChange={(e) => setCourierRecipientArea(e.target.value)}
                      placeholder="Uttara"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    District / City <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={courierRecipientDistrict}
                    onChange={(e) => setCourierRecipientDistrict(e.target.value)}
                    placeholder="Dhaka, Gazipur, Chattogram, Sylhet, etc."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* 3. Parcel Details */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  3. Parcel &amp; Payment Specifications (পার্সেল ও পেমেন্ট বিবরণী)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      COD Collection Amount (৳) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-bold text-xs">৳</span>
                      <input
                        type="number"
                        required
                        min="0"
                        step="1"
                        value={courierCodAmount}
                        onChange={(e) => setCourierCodAmount(Number(e.target.value))}
                        className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block font-medium">
                      {courierModalOrder.paymentStatus === 'Paid' || courierModalOrder.paymentStatus === 'PAID' || courierModalOrder.customerDue === 0
                        ? 'Order is prepaid / fully paid (Collection = ৳0)'
                        : (Number(courierModalOrder.advancePayment) || 0) > 0
                        ? `Customer Due: ৳${courierModalOrder.customerDue ?? Math.max(0, (courierModalOrder.totalAmount || 0) - (courierModalOrder.advancePayment || 0))} (Total: ৳${courierModalOrder.totalAmount} − Advance: ৳${courierModalOrder.advancePayment})`
                        : `Order total is ৳${courierModalOrder.totalAmount}`}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Parcel Weight (kg)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={courierWeight}
                      onChange={(e) => setCourierWeight(e.target.value)}
                      placeholder="0.5"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Total Lot (Item Qty)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={courierTotalLot}
                      onChange={(e) => setCourierTotalLot(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Item Description Summary
                  </label>
                  <input
                    type="text"
                    value={courierItemDescription}
                    onChange={(e) => setCourierItemDescription(e.target.value)}
                    placeholder="Product A x 1, Product B x 2"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Delivery Note / Special Instruction for Rider
                  </label>
                  <textarea
                    rows={2}
                    value={courierNote}
                    onChange={(e) => setCourierNote(e.target.value)}
                    placeholder="Call customer before delivery..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCourierModalOrder(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  id="confirm-courier-booking-btn"
                  type="submit"
                  disabled={isBookingLoading}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isBookingLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Creating {courierConfigs.find(c => c.code.toLowerCase() === selectedCourier.toLowerCase() || c.name.toLowerCase() === selectedCourier.toLowerCase() || c.id === selectedCourier)?.name || selectedCourier} Consignment...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Book Parcel via {courierConfigs.find(c => c.code.toLowerCase() === selectedCourier.toLowerCase() || c.name.toLowerCase() === selectedCourier.toLowerCase() || c.id === selectedCourier)?.name || selectedCourier}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: PRODUCT CREATE / EDIT                                 */}
      {/* ============================================================ */}
      {isProductModalOpen && ((editingProduct && hasPermission('product.update')) || (!editingProduct && hasPermission('product.create'))) && (
        <div
          id="product-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsProductModalOpen(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-4 sm:my-6 flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]">
            <div className="h-2 w-full rainbow-gradient-bg shrink-0" />

            {/* Modal Header (Fixed at top) */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900">
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingProduct
                    ? 'Modify details, price, inventory stock, images, and variations.'
                    : 'Fill in details below to publish a new product to the catalog.'}
                </p>
              </div>
              <button
                type="button"
                id="close-product-modal-btn"
                onClick={() => setIsProductModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProductFormSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Product Title *
                  </label>
                  <input
                    id="product-modal-title"
                    type="text"
                    value={prodTitle}
                    onChange={(e) => {
                      setProdTitle(e.target.value);
                      if (!editingProduct && !isSlugManuallyEdited) {
                        setProdSlug(generateProductSlug(e.target.value));
                      }
                    }}
                    placeholder="e.g. Luxury Quartz Watch"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      SEO URL Slug
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Preview: /product/{prodSlug || '...'}
                    </span>
                  </div>
                  <input
                    id="product-modal-slug"
                    type="text"
                    value={prodSlug}
                    onChange={(e) => {
                      setIsSlugManuallyEdited(true);
                      setProdSlug(generateProductSlug(e.target.value));
                    }}
                    placeholder="e.g. excel-ep-06-20000mah-22-5w-power-bank"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    SEO-friendly URL path slug. Converts spaces to hyphens and preserves model numbers.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Price (BDT ৳) *
                      </label>
                      {editingProduct && (
                        <span className="text-[10px] text-slate-400">
                          Published: ৳{editingProduct.price.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {/* Integrated Price Stepper & Direct Keypad Input Box */}
                    {(() => {
                      const canEditSellingPrice = Boolean(!editingProduct ? hasPermission('product.create') : (isSuperAdmin || hasPermission('product.update')));
                      return (
                        <div className="space-y-1">
                          <div className={`flex items-center rounded-xl border bg-white overflow-hidden shadow-2xs ${
                            canEditSellingPrice
                              ? 'border-slate-300 focus-within:ring-2 focus-within:ring-rose-500 focus-within:border-rose-500'
                              : 'border-slate-200 bg-slate-100 opacity-80'
                          }`}>
                            <button
                              type="button"
                              disabled={!canEditSellingPrice}
                              onClick={() => {
                                const cur = Number(prodPrice) || 0;
                                setProdPrice(Math.max(0, cur - 50));
                              }}
                              className={`px-3 py-2 text-slate-700 font-extrabold text-sm border-r border-slate-200 select-none ${
                                canEditSellingPrice
                                  ? 'bg-slate-100 hover:bg-slate-200 cursor-pointer active:scale-95 transition-all'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                              }`}
                              title={canEditSellingPrice ? "Decrease price by ৳50" : "Permission product.update required"}
                            >
                              -
                            </button>
                            <div className="relative flex-1">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 select-none">৳</span>
                              <input
                                id="product-modal-price"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                disabled={!canEditSellingPrice}
                                readOnly={!canEditSellingPrice}
                                value={prodPrice === '' ? '' : prodPrice}
                                onChange={(e) => {
                                  if (!canEditSellingPrice) return;
                                  const cleaned = e.target.value.replace(/[^0-9]/g, '');
                                  setProdPrice(cleaned);
                                }}
                                onFocus={(e) => canEditSellingPrice && e.target.select()}
                                onBlur={() => {
                                  if (!canEditSellingPrice) return;
                                  if (prodPrice === '' || isNaN(Number(prodPrice))) {
                                    setProdPrice(0);
                                  } else {
                                    setProdPrice(Math.max(0, parseInt(String(prodPrice), 10)));
                                  }
                                }}
                                className={`w-full pl-6 pr-2 py-2 text-xs font-bold font-mono ${
                                  canEditSellingPrice
                                    ? 'text-slate-900 bg-transparent focus:outline-hidden'
                                    : 'text-slate-500 bg-slate-100 cursor-not-allowed select-none'
                                }`}
                                placeholder="0"
                                title={canEditSellingPrice ? "Type specific price using keypad to increase or decrease" : "Read-only"}
                                required
                              />
                            </div>
                            <button
                              type="button"
                              disabled={!canEditSellingPrice}
                              onClick={() => {
                                const cur = Number(prodPrice) || 0;
                                setProdPrice(cur + 50);
                              }}
                              className={`px-3 py-2 text-slate-700 font-extrabold text-sm border-l border-slate-200 select-none ${
                                canEditSellingPrice
                                  ? 'bg-slate-100 hover:bg-slate-200 cursor-pointer active:scale-95 transition-all'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                              }`}
                              title={canEditSellingPrice ? "Increase price by ৳50" : "Permission product.update required"}
                            >
                              +
                            </button>
                          </div>
                          {!canEditSellingPrice && (
                            <p className="text-[10px] text-amber-700">
                              Permission required: product.update to edit selling price.
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Quick Increase / Decrease Preset Controls */}
                    {(!editingProduct || isSuperAdmin || hasPermission('product.update')) && (
                      <div className="space-y-1.5 mt-2">
                        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100/90 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight pl-1">
                            Quick:
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Number(prodPrice) || 0;
                                setProdPrice(Math.max(0, cur - 100));
                              }}
                              className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                              title="Decrease by ৳100"
                            >
                              -100
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Number(prodPrice) || 0;
                                setProdPrice(Math.max(0, cur - 50));
                              }}
                              className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                              title="Decrease by ৳50"
                            >
                              -50
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Number(prodPrice) || 0;
                                setProdPrice(cur + 50);
                              }}
                              className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                              title="Increase by ৳50"
                            >
                              +50
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Number(prodPrice) || 0;
                                setProdPrice(cur + 100);
                              }}
                              className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                              title="Increase by ৳100"
                            >
                              +100
                            </button>
                          </div>

                          {editingProduct && Number(prodPrice) !== editingProduct.price && (
                            <button
                              type="button"
                              onClick={() => setProdPrice(editingProduct.price)}
                              className="text-[10px] text-slate-500 hover:text-slate-800 underline ml-auto cursor-pointer"
                              title="Reset to published price"
                            >
                              Reset
                            </button>
                          )}
                        </div>

                        {editingProduct && Number(prodPrice) !== editingProduct.price && (
                          <div className="text-[10px] font-medium flex items-center gap-1">
                            {Number(prodPrice) > editingProduct.price ? (
                              <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-bold flex items-center gap-0.5">
                                <TrendingUp className="w-2.5 h-2.5" />
                                +৳{(Number(prodPrice) - editingProduct.price).toLocaleString()} increased (+{Math.round(((Number(prodPrice) - editingProduct.price) / (editingProduct.price || 1)) * 100)}%)
                              </span>
                            ) : (
                              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-bold flex items-center gap-0.5">
                                <TrendingDown className="w-2.5 h-2.5" />
                                -৳{(editingProduct.price - Number(prodPrice)).toLocaleString()} decreased (-{Math.round(((editingProduct.price - Number(prodPrice)) / (editingProduct.price || 1)) * 100)}%)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Original Price (Optional)
                    </label>
                    <input
                      type="number"
                      value={prodOriginalPrice}
                      onChange={(e) => setProdOriginalPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                {/* Published product order history alert */}
                {editingProduct && (() => {
                  const ordersWithProduct = orders.filter((o) =>
                    o.items?.some((it) => it.product?.id === editingProduct.id)
                  );
                  if (ordersWithProduct.length === 0) return null;
                  return (
                    <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start gap-2 text-xs">
                      <ShoppingBag className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-blue-900 block text-[11px]">
                          Published Product with Placed Orders ({ordersWithProduct.length} order{ordersWithProduct.length > 1 ? 's' : ''})
                        </span>
                        <p className="text-[10px] text-blue-700 leading-tight mt-0.5">
                          Customers have previously placed orders for this published product. Updating the price here updates the live website price for all future orders. To increase or decrease the price of products on already-placed customer orders, use the 'Edit' button on that specific order in the Orders tab.
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Financial Buying Price & Calculated Profit */}
                {(() => {
                  const canViewBuying = isSuperAdmin || hasPermission('product.view_buying_price');
                  const canManageBuying = isSuperAdmin || hasPermission('product.manage_buying_price');
                  const canViewProfit = isSuperAdmin || hasPermission('product.view_profit');

                  if (!canViewBuying && !canViewProfit) return null;

                  return (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          Financial: Buying Price & Unit Profit
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          canManageBuying ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {canManageBuying ? 'Confidential' : 'Read Only'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        {canViewBuying ? (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label htmlFor="product-modal-buying-price" className="block text-xs font-bold text-slate-700">
                                Buying Price (৳) {!canManageBuying && <span className="text-[10px] text-amber-700 font-normal">(Read Only)</span>}
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowBuyingPrice((prev) => !prev)}
                                className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-100/60 rounded-md transition-colors inline-flex items-center cursor-pointer"
                                title={showBuyingPrice ? 'Hide Buying Price' : 'Show Buying Price'}
                                aria-label={showBuyingPrice ? 'Hide Buying Price' : 'Show Buying Price'}
                              >
                                {showBuyingPrice ? (
                                  <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                                )}
                              </button>
                            </div>
                            <input
                              id="product-modal-buying-price"
                              type={showBuyingPrice ? 'number' : 'password'}
                              inputMode="numeric"
                              min="0"
                              step="any"
                              value={prodBuyingPrice}
                              readOnly={!canManageBuying}
                              disabled={!canManageBuying}
                              onChange={(e) => {
                                if (canManageBuying) {
                                  setProdBuyingPrice(e.target.value);
                                }
                              }}
                              placeholder={canManageBuying ? 'e.g. 500' : '—'}
                              className={`w-full px-3 py-2 border rounded-xl text-xs font-medium ${
                                canManageBuying
                                  ? 'bg-white border-emerald-300 text-slate-800 focus:ring-2 focus:ring-emerald-500'
                                  : 'bg-slate-100 border-slate-300 text-slate-500 cursor-not-allowed select-none'
                              }`}
                            />
                            {!canManageBuying && (
                              <p className="text-[10px] text-amber-700 mt-1">
                                product.manage_buying_price is required to edit Buying Price.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div />
                        )}
                        {canViewProfit ? (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-bold text-slate-700">
                                Unit Profit / Margin
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowUnitProfit((prev) => !prev)}
                                className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-100/60 rounded-md transition-colors inline-flex items-center cursor-pointer"
                                title={showUnitProfit ? 'Hide Profit Amount' : 'Show Profit Amount'}
                                aria-label={showUnitProfit ? 'Hide Profit Amount' : 'Show Profit Amount'}
                              >
                                {showUnitProfit ? (
                                  <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                                )}
                              </button>
                            </div>
                            <div className="px-3 py-2 bg-emerald-100/60 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-between min-h-[38px]">
                              {showUnitProfit ? (
                                <>
                                  <span>
                                    ৳ {prodBuyingPrice !== '' && !isNaN(Number(prodBuyingPrice))
                                      ? Math.max(0, Number(prodPrice) - Number(prodBuyingPrice)).toLocaleString()
                                      : (editingProduct?.unitProfit !== undefined ? Number(editingProduct.unitProfit).toLocaleString() : '—')}
                                  </span>
                                  {prodBuyingPrice !== '' && !isNaN(Number(prodBuyingPrice)) && Number(prodBuyingPrice) > 0 && Number(prodPrice) > 0 && (
                                    <span className="text-[10px] font-semibold text-emerald-700">
                                      ({Math.round(((Number(prodPrice) - Number(prodBuyingPrice)) / Number(prodPrice)) * 100)}% margin)
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="font-mono tracking-widest text-slate-500 font-semibold select-none">৳ ••••••</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div />
                        )}
                      </div>
                      <p className="text-[10px] text-emerald-700 leading-tight">
                        Buying price is strictly protected. Only authorized administrators with permission can view or manage cost and profit.
                      </p>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Category *
                    </label>
                    <select
                      value={prodCategory}
                      onChange={(e) => setProdCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Stock Quantity *
                    </label>
                    <input
                      type="number"
                      value={prodStock}
                      onChange={(e) => setProdStock(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      required
                    />
                  </div>
                </div>

                {/* Product Images Configuration: Single Image or Multiple Images Gallery */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                          Product Images & Media
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {prodImageMode === 'single'
                            ? 'Single cover photo mode'
                            : `Multiple images gallery (${1 + prodGalleryImages.length} total)`}
                        </span>
                      </div>
                    </div>

                    {/* Image Mode Switcher: Prompt to enable multiple images or stay with single */}
                    <div className="inline-flex p-0.5 bg-slate-200/80 rounded-xl border border-slate-300/70 text-xs font-bold self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setProdImageMode('single')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          prodImageMode === 'single'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Add just 1 single product image"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        Single Image
                      </button>
                      <button
                        type="button"
                        onClick={() => setProdImageMode('multiple')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          prodImageMode === 'multiple'
                            ? 'bg-white text-rose-600 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Add multiple images for rich customer product slideshow"
                      >
                        <Images className="w-3.5 h-3.5 text-rose-600" />
                        Multiple Images ({1 + prodGalleryImages.length})
                      </button>
                    </div>
                  </div>

                  {/* Contextual User Prompt / Tip Banner */}
                  <div
                    className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                      prodImageMode === 'single'
                        ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                        : 'bg-rose-50/80 border-rose-200 text-rose-950'
                    }`}
                  >
                    <Info
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        prodImageMode === 'single' ? 'text-blue-600' : 'text-rose-600'
                      }`}
                    />
                    <div className="text-[11px] leading-relaxed">
                      {prodImageMode === 'single' ? (
                        <>
                          <strong>Single Image Mode:</strong> Enter 1 primary image URL below. If you want to showcase additional angles, color variants, or close-ups, click the <strong>Multiple Images</strong> tab above anytime!
                        </>
                      ) : (
                        <>
                          <strong>Multiple Images Gallery Mode:</strong> The primary cover photo is displayed on product cards and catalogs, while all gallery photos appear in an interactive customer photo carousel. You can also save with just 1 image whenever you wish.
                        </>
                      )}
                    </div>
                  </div>

                  {/* Primary / Cover Image Selection (Upload from Device vs Image URL) */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-slate-800 flex items-center gap-1">
                        <span>Primary Cover Image</span>
                        <span className="text-rose-500">*</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          (Shown in catalogs & cards)
                        </span>
                      </label>

                      {/* Source Selector: Upload from Device vs Image URL */}
                      <div className="inline-flex p-0.5 bg-slate-200/80 rounded-lg border border-slate-300/70 text-[11px] font-bold self-start sm:self-auto">
                        <button
                          type="button"
                          id="btn-img-source-upload"
                          onClick={() => setProdImageSource('upload')}
                          className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                            prodImageSource === 'upload'
                              ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                              : 'text-slate-600 hover:text-slate-900 font-medium'
                          }`}
                        >
                          <Upload className="w-3 h-3 text-rose-600" />
                          Upload from Device
                        </button>
                        <button
                          type="button"
                          id="btn-img-source-url"
                          onClick={() => setProdImageSource('url')}
                          className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                            prodImageSource === 'url'
                              ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                              : 'text-slate-600 hover:text-slate-900 font-medium'
                          }`}
                        >
                          <Globe className="w-3 h-3 text-blue-600" />
                          Image URL
                        </button>
                      </div>
                    </div>

                    {/* Hidden input for primary file upload */}
                    <input
                      ref={primaryFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                      onChange={(e) => handlePrimaryFileSelect(e.target.files)}
                      className="hidden"
                      id="primary-product-image-file-input"
                    />

                    {/* Option 1: Upload from Device */}
                    {prodImageSource === 'upload' && (
                      <div className="space-y-2">
                        {/* Drag and drop upload zone */}
                        <div
                          id="primary-image-dropzone"
                          onClick={() => primaryFileInputRef.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDraggingPrimary(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            setIsDraggingPrimary(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDraggingPrimary(false);
                            handlePrimaryFileSelect(e.dataTransfer.files);
                          }}
                          className={`relative border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                            isDraggingPrimary
                              ? 'border-rose-500 bg-rose-50/80 ring-2 ring-rose-200'
                              : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/60'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-2xs">
                            <UploadCloud className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              <span className="text-rose-600 underline">Click to choose a photo</span> or drag and drop here
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Supports JPG, PNG, WebP, GIF, SVG (up to 15MB)
                            </p>
                          </div>
                          {isProcessingImage && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Optimizing & loading photo...
                            </span>
                          )}
                        </div>

                        {/* Current Cover Preview Card if image is set */}
                        {prodImage && (
                          <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 bg-slate-100 shadow-2xs">
                                <img
                                  src={prodImage}
                                  alt="Cover preview"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src =
                                      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=200&q=80';
                                  }}
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-800 truncate">
                                    Current Cover Photo
                                  </span>
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                      prodImage.startsWith('data:')
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                                    }`}
                                  >
                                    <Check className="w-2.5 h-2.5" />
                                    {prodImage.startsWith('data:') ? 'Device Upload' : 'Web URL'}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 truncate max-w-[240px] sm:max-w-xs mt-0.5">
                                  {prodImage.startsWith('data:') ? 'Photo loaded from device' : prodImage}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => primaryFileInputRef.current?.click()}
                                className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                onClick={() => setProdImage('')}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Remove photo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Option 2: Image URL */}
                    {prodImageSource === 'url' && (
                      <div className="space-y-2">
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={prodImage}
                            onChange={(e) => setProdImage(e.target.value)}
                            placeholder="Paste image link: https://images.unsplash.com/..."
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                          />
                          {prodImage && (
                            <button
                              type="button"
                              onClick={() => setProdImage('')}
                              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors shrink-0 cursor-pointer"
                              title="Clear URL"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {prodImage && (
                          <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 bg-slate-100 shadow-2xs">
                                <img
                                  src={prodImage}
                                  alt="Cover preview"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src =
                                      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=200&q=80';
                                  }}
                                />
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-slate-800 block truncate">
                                  Live URL Preview
                                </span>
                                <span className="text-[10px] text-slate-400 truncate max-w-[240px] sm:max-w-xs block mt-0.5">
                                  {prodImage}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 shrink-0">
                              Active Cover
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Multiple Images Options & List */}
                  {prodImageMode === 'multiple' && (
                    <div className="pt-3 border-t border-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Images className="w-3.5 h-3.5 text-rose-500" />
                          Additional Gallery Photos ({prodGalleryImages.length})
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => galleryFileInputRef.current?.click()}
                            className="text-[11px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Upload className="w-3 h-3" />
                            Upload from Device
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setIsBulkInputOpen(!isBulkInputOpen)}
                            className="text-[11px] text-slate-600 hover:text-slate-800 font-bold underline transition-colors cursor-pointer"
                          >
                            {isBulkInputOpen ? 'Hide Bulk Paste' : '+ Bulk Paste URLs'}
                          </button>
                        </div>
                      </div>

                      {/* Hidden input for gallery file upload */}
                      <input
                        ref={galleryFileInputRef}
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                        onChange={(e) => handleGalleryFilesSelect(e.target.files)}
                        className="hidden"
                        id="gallery-product-image-file-input"
                      />

                      {/* Gallery Drag & Drop Dropzone */}
                      <div
                        id="gallery-image-dropzone"
                        onClick={() => galleryFileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingGallery(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          setIsDraggingGallery(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingGallery(false);
                          handleGalleryFilesSelect(e.dataTransfer.files);
                        }}
                        className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all flex items-center justify-center gap-2 ${
                          isDraggingGallery
                            ? 'border-rose-500 bg-rose-50/80 ring-2 ring-rose-200'
                            : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/60'
                        }`}
                      >
                        <UploadCloud className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-600">
                          Drop additional photos here, or <span className="text-rose-600 font-bold underline">browse from device</span>
                        </span>
                      </div>

                      {/* Bulk Paste URLs Box */}
                      {isBulkInputOpen && (
                        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                          <span className="text-[11px] font-bold text-slate-700 block">
                            Paste Multiple Image URLs (one per line or comma-separated):
                          </span>
                          <textarea
                            rows={3}
                            value={bulkGalleryInput}
                            onChange={(e) => setBulkGalleryInput(e.target.value)}
                            placeholder="https://images.unsplash.com/photo-1...&#10;https://images.unsplash.com/photo-2...&#10;https://images.unsplash.com/photo-3..."
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setBulkGalleryInput('');
                                setIsBulkInputOpen(false);
                              }}
                              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const urls = bulkGalleryInput
                                  .split(/[\n,]+/)
                                  .map((u) => u.trim())
                                  .filter((u) => u.startsWith('http') || u.startsWith('data:'));
                                if (urls.length > 0) {
                                  setProdGalleryImages((prev) =>
                                    Array.from(new Set([...prev, ...urls]))
                                  );
                                  setBulkGalleryInput('');
                                  setIsBulkInputOpen(false);
                                }
                              }}
                              className="px-3 py-1 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                              Add All URLs
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Single URL quick addition field */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newGalleryInput}
                          onChange={(e) => setNewGalleryInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newGalleryInput.trim()) {
                                setProdGalleryImages((prev) => [...prev, newGalleryInput.trim()]);
                                setNewGalleryInput('');
                              }
                            }
                          }}
                          placeholder="Or paste an image URL & click Add..."
                          className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newGalleryInput.trim()) {
                              setProdGalleryImages((prev) => [...prev, newGalleryInput.trim()]);
                              setNewGalleryInput('');
                            }
                          }}
                          className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add URL
                        </button>
                      </div>

                      {/* Gallery Thumbnails List */}
                      {prodGalleryImages.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {prodGalleryImages.map((imgUrl, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-200 text-xs shadow-2xs group hover:border-slate-300 transition-colors"
                            >
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                <img
                                  src={imgUrl}
                                  alt={`Gallery ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src =
                                      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=200&q=80';
                                  }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-800 text-[11px]">
                                    Gallery Photo #{idx + 2}
                                  </span>
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      imgUrl.startsWith('data:')
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {imgUrl.startsWith('data:') ? 'Device' : 'URL'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                                    {imgUrl.startsWith('data:') ? 'Local file' : imgUrl}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Swap with primary cover image
                                    const oldCover = prodImage;
                                    setProdImage(imgUrl);
                                    setProdGalleryImages((prev) =>
                                      prev.map((u, i) => (i === idx ? oldCover : u))
                                    );
                                  }}
                                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] transition-colors cursor-pointer"
                                  title="Set this photo as primary cover"
                                >
                                  Make Cover
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProdGalleryImages((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    );
                                  }}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Remove this photo"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic bg-white p-2.5 rounded-xl border border-dashed border-slate-200 text-center">
                          No additional gallery images added yet. You can upload photos from your device or paste image URLs above.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Product Description with Rich Formatting Toolbar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      Product Description *
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {prodDescription.length} chars
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowDescPreview(!showDescPreview)}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-colors flex items-center gap-1 cursor-pointer ${
                          showDescPreview
                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        <span>{showDescPreview ? 'Edit Text' : 'Preview Format'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Formatting Toolbar */}
                  <div className="p-2 bg-slate-100/90 border border-slate-200 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Bold button */}
                        <button
                          type="button"
                          onClick={() => handleInsertFormatting('**', '**', 'Bold Text')}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                          title="Bold Text (**text**)"
                        >
                          <Bold className="w-3.5 h-3.5 text-slate-900" />
                          <span>Bold</span>
                        </button>

                        {/* Numbered List button */}
                        <button
                          type="button"
                          onClick={handleInsertNumberedList}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                          title="Numbered List (1. Item)"
                        >
                          <ListOrdered className="w-3.5 h-3.5 text-blue-600" />
                          <span>1, 2, 3 List</span>
                        </button>

                        {/* Bullet List button */}
                        <button
                          type="button"
                          onClick={handleInsertBulletList}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                          title="Bullet List (• Item)"
                        >
                          <List className="w-3.5 h-3.5 text-emerald-600" />
                          <span>• Bullet List</span>
                        </button>
                      </div>

                      {/* Quick symbols */}
                      <div className="flex items-center gap-1 flex-wrap pl-1 border-l border-slate-200">
                        <span className="text-[10px] text-slate-400 font-medium">Symbols:</span>
                        {['✓', '★', '⚡', '৳', '➤', '🔥', '✔', '•', '◆'].map((sym) => (
                          <button
                            key={sym}
                            type="button"
                            onClick={() => handleInsertFormatting(sym + ' ')}
                            className="w-6 h-6 rounded bg-white hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                            title={`Insert ${sym}`}
                          >
                            {sym}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {showDescPreview ? (
                    <div className="p-3.5 bg-white border border-slate-200 rounded-xl min-h-[380px] max-h-[640px] overflow-y-auto">
                      <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        Live Customer View Preview:
                      </div>
                      <FormattedDescription content={prodDescription || '*(No description typed yet)*'} />
                    </div>
                  ) : (
                    <textarea
                      ref={descTextareaRef}
                      rows={12}
                      value={prodDescription}
                      onChange={(e) => setProdDescription(e.target.value)}
                      placeholder="Detailed specs and description for customers... Use **bold text**, numbered lists (1. 2. 3.), bullet points (•), or quick symbols above."
                      className="w-full min-h-[260px] px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500 font-sans leading-relaxed resize-y"
                      required
                    />
                  )}
                  <p className="text-[10px] text-slate-400 italic">
                    Tip: Select text and click <strong>Bold</strong>, or click <strong>1, 2, 3 List</strong> or <strong>• Bullet List</strong> to auto-structure features and specifications.
                  </p>
                </div>

                {/* Product Video Section: Link YouTube Video for Video Play Button */}
                <div className="p-4 bg-rose-50/60 border border-rose-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                        <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                          Product Video (YouTube Link)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Links a playable video to the Video Play Button on the product view page.
                        </span>
                      </div>
                    </div>
                    {prodVideoUrl && extractYouTubeVideoId(prodVideoUrl) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        Linked
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      YouTube Video URL (Optional)
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Video className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          id="product-modal-video-url"
                          type="text"
                          value={prodVideoUrl}
                          onChange={(e) => setProdVideoUrl(e.target.value)}
                          placeholder="e.g. https://www.youtube.com/watch?v=... or https://youtu.be/..."
                          className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        {prodVideoUrl && (
                          <button
                            type="button"
                            onClick={() => setProdVideoUrl('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                            title="Clear video link"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {prodVideoUrl && extractYouTubeVideoId(prodVideoUrl) && (
                        <a
                          href={prodVideoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 border border-slate-200 shrink-0 transition-colors"
                          title="Test YouTube link"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Preview</span>
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Paste any YouTube link (Standard, Shorts, or Share link). When provided, customers can click the video play button next to full-screen view to watch in a pop-up or floating window.
                    </p>

                    {/* Video Live Thumbnail Preview if valid YouTube URL */}
                    {prodVideoUrl && extractYouTubeVideoId(prodVideoUrl) && (
                      <div className="mt-2.5 p-2 bg-white border border-rose-200 rounded-xl flex items-center gap-3 shadow-2xs">
                        <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-black shrink-0 border border-slate-200">
                          <img
                            src={`https://img.youtube.com/vi/${extractYouTubeVideoId(prodVideoUrl)}/hqdefault.jpg`}
                            alt="YouTube Thumbnail"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                            <Play className="w-3.5 h-3.5 fill-white text-white" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            YouTube Video Detected
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            Video ID: {extractYouTubeVideoId(prodVideoUrl)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Product Review Rating & Reviews Adjustment Section */}
                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
                        <Star className="w-3.5 h-3.5 fill-white" />
                      </div>
                      <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                        Product Review Rating Controls
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                      Storefront Display
                    </span>
                  </div>

                  {/* Rating Stepper with - / + buttons and Live Star Visualizer */}
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1.5 flex items-center justify-between">
                      <span>Rating Score (1.0 to 5.0)</span>
                      <span className="text-sm font-extrabold text-amber-900 font-mono">
                        {prodRating.toFixed(1)} ★
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      {/* Decrease button */}
                      <button
                        type="button"
                        id="product-rating-decrease-btn"
                        onClick={() =>
                          setProdRating((prev) =>
                            Math.max(1.0, Math.round((prev - 0.1) * 10) / 10)
                          )
                        }
                        className="w-10 h-10 rounded-xl bg-white hover:bg-amber-100 active:scale-95 border border-amber-300 text-amber-900 font-extrabold text-base flex items-center justify-center shadow-2xs transition-all shrink-0"
                        title="Decrease rating by 0.1"
                      >
                        <Minus className="w-4 h-4 text-amber-800" />
                      </button>

                      {/* Interactive Slider */}
                      <div className="flex-1 px-1">
                        <input
                          id="product-modal-rating-slider"
                          type="range"
                          min="1.0"
                          max="5.0"
                          step="0.1"
                          value={prodRating}
                          onChange={(e) => setProdRating(parseFloat(e.target.value))}
                          className="w-full accent-amber-600 cursor-pointer h-2 bg-amber-200 rounded-lg"
                        />
                      </div>

                      {/* Increase button */}
                      <button
                        type="button"
                        id="product-rating-increase-btn"
                        onClick={() =>
                          setProdRating((prev) =>
                            Math.min(5.0, Math.round((prev + 0.1) * 10) / 10)
                          )
                        }
                        className="w-10 h-10 rounded-xl bg-white hover:bg-amber-100 active:scale-95 border border-amber-300 text-amber-900 font-extrabold text-base flex items-center justify-center shadow-2xs transition-all shrink-0"
                        title="Increase rating by 0.1"
                      >
                        <Plus className="w-4 h-4 text-amber-800" />
                      </button>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] font-bold text-amber-800 uppercase mr-1">
                        Presets:
                      </span>
                      {[5.0, 4.9, 4.8, 4.7, 4.5, 4.0].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setProdRating(preset)}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all ${
                            Math.abs(prodRating - preset) < 0.05
                              ? 'bg-amber-600 text-white shadow-2xs'
                              : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-200'
                          }`}
                        >
                          {preset.toFixed(1)} ★
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reviews Count Section */}
                  <div className="pt-2 border-t border-amber-200/70">
                    <label className="block text-xs font-bold text-amber-900 mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span>Customer Reviews</span>
                        <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md border border-amber-200">
                          Optional
                        </span>
                      </div>
                      <span className="font-mono font-bold text-amber-900 text-xs">
                        {prodReviewsCount > 0 ? `${prodReviewsCount} reviews` : '0 reviews (No reviews)'}
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setProdReviewsCount(0)}
                        className={`px-2 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                          prodReviewsCount === 0
                            ? 'bg-amber-800 text-white border-amber-900 shadow-2xs'
                            : 'bg-white hover:bg-amber-100 border-amber-300 text-amber-800'
                        }`}
                        title="Set to 0 reviews (No customer reviews)"
                      >
                        0 (None)
                      </button>
                      <button
                        type="button"
                        onClick={() => setProdReviewsCount((prev) => Math.max(0, prev - 5))}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold transition-colors"
                        title="Decrease 5 reviews"
                      >
                        -5
                      </button>
                      <button
                        type="button"
                        onClick={() => setProdReviewsCount((prev) => Math.max(0, prev - 1))}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold transition-colors"
                        title="Decrease 1 review"
                      >
                        -1
                      </button>
                      <input
                        id="product-modal-reviews-count"
                        type="number"
                        min="0"
                        value={prodReviewsCount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setProdReviewsCount(val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
                        }}
                        className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-center text-slate-800 focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setProdReviewsCount((prev) => prev + 1)}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold transition-colors"
                        title="Increase 1 review"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => setProdReviewsCount((prev) => prev + 5)}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold transition-colors"
                        title="Increase 5 reviews"
                      >
                        +5
                      </button>
                    </div>
                  </div>

                  {/* Storefront Badge Preview */}
                  <div className="p-2.5 bg-white/90 rounded-xl border border-amber-200 flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-[11px] font-medium">
                      Storefront preview:
                    </span>
                    {prodReviewsCount > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center text-amber-500">
                          {[1, 2, 3, 4, 5].map((starIdx) => (
                            <Star
                              key={starIdx}
                              className={`w-3.5 h-3.5 ${
                                starIdx <= Math.round(prodRating)
                                  ? 'fill-amber-400 text-amber-500'
                                  : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="font-bold text-slate-800 text-xs font-mono">
                          {prodRating.toFixed(1)}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          ({prodReviewsCount} {prodReviewsCount === 1 ? 'review' : 'reviews'})
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
                        <span>No customer reviews yet</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Custom Product Size & Color Options (Variants) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-800 text-white flex items-center justify-center shadow-xs">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Product Size & Color Options (Custom Variants)
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Optional
                    </span>
                  </div>

                  {/* 1. SIZE OPTIONS */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Ruler className="w-3.5 h-3.5 text-slate-500" />
                        Size Options ({prodSizes.length} added)
                      </label>
                      {prodSizes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setProdSizes([])}
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Clear all sizes
                        </button>
                      )}
                    </div>

                    {/* Custom Numerical Size Options Entry Panel */}
                    <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                          <Hash className="w-3 h-3 text-indigo-600" />
                          Add Custom Numerical Sizes
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Shoes, Waist, Watch Cases, Rings, Dimensions
                        </span>
                      </div>

                      {/* Numerical Input + Unit Selector + Add Button */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <input
                            id="new-product-custom-numeric-size-input"
                            type="number"
                            step="any"
                            value={numericSizeVal}
                            onChange={(e) => setNumericSizeVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNumericalSize();
                              }
                            }}
                            placeholder="Enter numeric value (e.g. 32, 42, 8.5, 40)"
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 hover:bg-white border border-slate-300 focus:bg-white rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-600 transition-colors"
                          />
                          <Hash className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        </div>

                        <select
                          id="new-product-numeric-size-unit"
                          value={numericSizeUnit}
                          onChange={(e) => setNumericSizeUnit(e.target.value)}
                          className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-600 cursor-pointer"
                        >
                          <option value="none">No unit (Raw number e.g. 32)</option>
                          <option value="EU">EU prefix (e.g. EU 42)</option>
                          <option value="US">US prefix (e.g. US 9)</option>
                          <option value="UK">UK prefix (e.g. UK 8)</option>
                          <option value="inch">Inches " (e.g. 32")</option>
                          <option value="mm">Millimeters mm (e.g. 40mm)</option>
                          <option value="cm">Centimeters cm (e.g. 30cm)</option>
                          <option value="ml">Volume ml (e.g. 100ml)</option>
                          <option value="gm">Grams gm (e.g. 250gm)</option>
                          <option value="kg">Kilograms kg (e.g. 1kg)</option>
                          <option value="custom">Custom Suffix...</option>
                        </select>

                        {numericSizeUnit === 'custom' && (
                          <input
                            type="text"
                            value={customNumericSuffix}
                            onChange={(e) => setCustomNumericSuffix(e.target.value)}
                            placeholder="suffix (e.g. GB, oz)"
                            className="w-24 px-2 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-600"
                          />
                        )}

                        <button
                          type="button"
                          id="add-custom-numeric-size-btn"
                          onClick={handleAddNumericalSize}
                          disabled={!numericSizeVal.toString().trim()}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
                        >
                          + Add Number Size
                        </button>
                      </div>

                      {/* Quick Numerical Presets */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                          <span>Quick numerical presets:</span>
                          <button
                            type="button"
                            onClick={() => setShowRangeTool(!showRangeTool)}
                            className="text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                          >
                            {showRangeTool ? 'Hide Range Tool' : '+ Add Sequential Range...'}
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          <span className="text-[10px] font-bold text-slate-400 self-center mr-1">Shoes:</span>
                          {['38', '39', '40', '41', '42', '43', '44', '45'].map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => {
                                if (!prodSizes.includes(sz)) setProdSizes((prev) => [...prev, sz]);
                              }}
                              disabled={prodSizes.includes(sz)}
                              className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[11px] font-mono font-bold text-slate-700 disabled:opacity-30 cursor-pointer transition-colors"
                            >
                              +{sz}
                            </button>
                          ))}

                          <span className="text-[10px] font-bold text-slate-400 self-center ml-2 mr-1">Waist:</span>
                          {['28', '30', '32', '34', '36', '38', '40'].map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => {
                                if (!prodSizes.includes(sz)) setProdSizes((prev) => [...prev, sz]);
                              }}
                              disabled={prodSizes.includes(sz)}
                              className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[11px] font-mono font-bold text-slate-700 disabled:opacity-30 cursor-pointer transition-colors"
                            >
                              +{sz}
                            </button>
                          ))}

                          <span className="text-[10px] font-bold text-slate-400 self-center ml-2 mr-1">Watch:</span>
                          {['38mm', '40mm', '42mm', '44mm', '45mm'].map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => {
                                if (!prodSizes.includes(sz)) setProdSizes((prev) => [...prev, sz]);
                              }}
                              disabled={prodSizes.includes(sz)}
                              className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[11px] font-mono font-bold text-slate-700 disabled:opacity-30 cursor-pointer transition-colors"
                            >
                              +{sz}
                            </button>
                          ))}
                        </div>

                        {/* Expandable Sequential Range Tool */}
                        {showRangeTool && (
                          <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2 mt-2">
                            <div className="text-[11px] font-bold text-indigo-900 flex items-center justify-between">
                              <span>Generate Sequential Numerical Range</span>
                              <span className="text-[10px] text-indigo-600 font-normal">e.g. 28 to 38 in steps of 2</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <label className="flex items-center gap-1 font-semibold text-slate-700">
                                <span>From:</span>
                                <input
                                  type="number"
                                  value={rangeStart}
                                  onChange={(e) => setRangeStart(e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                                />
                              </label>
                              <label className="flex items-center gap-1 font-semibold text-slate-700">
                                <span>To:</span>
                                <input
                                  type="number"
                                  value={rangeEnd}
                                  onChange={(e) => setRangeEnd(e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                                />
                              </label>
                              <label className="flex items-center gap-1 font-semibold text-slate-700">
                                <span>Step:</span>
                                <input
                                  type="number"
                                  value={rangeStep}
                                  onChange={(e) => setRangeStep(e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-14 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                                />
                              </label>
                              <select
                                value={rangeUnit}
                                onChange={(e) => setRangeUnit(e.target.value)}
                                className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                              >
                                <option value="none">No unit</option>
                                <option value="EU">EU prefix</option>
                                <option value="US">US prefix</option>
                                <option value="UK">UK prefix</option>
                                <option value="inch">" (inches)</option>
                                <option value="mm">mm</option>
                              </select>
                              <button
                                type="button"
                                onClick={handleAddRangeSizes}
                                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                              >
                                + Generate Range
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Standard Letter Sizes Quick Add */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] text-slate-400 font-medium">Standard letter sizes:</span>
                      {['S', 'M', 'L', 'XL', 'XXL', 'Free Size'].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => {
                            if (!prodSizes.includes(sz)) {
                              setProdSizes((prev) => [...prev, sz]);
                            }
                          }}
                          disabled={prodSizes.includes(sz)}
                          className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 hover:border-slate-400 text-[11px] font-semibold text-slate-700 disabled:opacity-40 disabled:hover:border-slate-200 transition-colors cursor-pointer"
                        >
                          +{sz}
                        </button>
                      ))}
                    </div>

                    {/* Freeform Custom Size Text Input */}
                    <div className="flex gap-2">
                      <input
                        id="new-product-custom-size-input"
                        type="text"
                        value={newSizeInput}
                        onChange={(e) => setNewSizeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = newSizeInput.trim();
                            if (val && !prodSizes.includes(val)) {
                              setProdSizes((prev) => [...prev, val]);
                              setNewSizeInput('');
                            }
                          }
                        }}
                        placeholder="Or type any text size (e.g. Free Size, One Size Fits All) & press Enter"
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-slate-900"
                      />
                      <button
                        type="button"
                        id="add-custom-size-btn"
                        onClick={() => {
                          const val = newSizeInput.trim();
                          if (val && !prodSizes.includes(val)) {
                            setProdSizes((prev) => [...prev, val]);
                            setNewSizeInput('');
                          }
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        + Add Size
                      </button>
                    </div>

                    {/* Current Added Sizes Chips */}
                    {prodSizes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {prodSizes.map((sz, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xs"
                          >
                            <span>{sz}</span>
                            <button
                              type="button"
                              onClick={() => setProdSizes((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-slate-300 hover:text-white cursor-pointer"
                              title={`Remove size ${sz}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        No size options added. Product will sell as standard single size.
                      </p>
                    )}
                  </div>

                  {/* 2. COLOR OPTIONS */}
                  <div className="space-y-3 pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-rose-500" />
                        Color Options ({prodColors.length} added)
                      </label>
                      {prodColors.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setProdColors([])}
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Clear all colors
                        </button>
                      )}
                    </div>

                    {/* Option checkbox to display the specific color next to its name */}
                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer select-none hover:bg-slate-50 transition-colors shadow-2xs">
                      <input
                        id="product-display-specific-color-toggle"
                        type="checkbox"
                        checked={displaySpecificColor}
                        onChange={(e) => setDisplaySpecificColor(e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-rose-600" />
                          Display specific color next to its name
                        </span>
                        <p className="text-[11px] text-slate-500 leading-tight">
                          Shows an authentic visual color swatch dot next to the color name so viewers and customers can easily identify the exact color shade.
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${displaySpecificColor ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                        {displaySpecificColor ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>

                    {/* Color Creator Bar: Swatch Picker + Hex + Name + Add Button */}
                    <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-2xs">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        {/* Visual Color Picker (Native HTML5 picker) */}
                        <div className="flex items-center gap-2 shrink-0">
                          <label
                            htmlFor="new-product-color-picker"
                            className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors shadow-2xs"
                            title="Click to pick a specific color"
                          >
                            <span
                              className="w-5 h-5 rounded-full border border-black/20 shadow-xs shrink-0"
                              style={{ backgroundColor: newColorHex }}
                            />
                            <span className="text-xs font-bold font-mono text-slate-700">
                              {newColorHex.toUpperCase()}
                            </span>
                            <input
                              id="new-product-color-picker"
                              type="color"
                              value={newColorHex}
                              onChange={(e) => setNewColorHex(e.target.value)}
                              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            />
                          </label>
                        </div>

                        {/* Color Name Input */}
                        <input
                          id="new-product-custom-color-input"
                          type="text"
                          value={newColorInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewColorInput(val);
                            // Auto-detect hex if user types a known color name
                            const cleanKey = val.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const matchHex = (POPULAR_COLOR_PALETTES.find((p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey))?.hex;
                            if (matchHex) {
                              setNewColorHex(matchHex);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddColor();
                            }
                          }}
                          placeholder="Color name (e.g. Navy Blue, Emerald Green, Space Gray, Rose Gold)"
                          className="flex-1 px-3 py-1.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500 transition-colors"
                        />

                        {/* Add Color Button */}
                        <button
                          type="button"
                          id="add-custom-color-btn"
                          onClick={handleAddColor}
                          disabled={!newColorInput.trim()}
                          className="px-3.5 py-1.5 bg-slate-900 hover:bg-black disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
                        >
                          + Add Color
                        </button>
                      </div>

                      {/* Live Viewer Preview */}
                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Viewer Preview:
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs">
                            {displaySpecificColor && (
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-2xs shrink-0"
                                style={{ backgroundColor: newColorHex }}
                              />
                            )}
                            <span>{newColorInput.trim() || 'Color Name'}</span>
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          How viewers will see this option
                        </span>
                      </div>

                      {/* Popular Color Palettes for Instant 1-Click Addition */}
                      <div className="pt-1 space-y-1">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Popular colors (click to select & pick shade):
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto">
                          {POPULAR_COLOR_PALETTES.map((c) => {
                            const isAdded = prodColors.some(
                              (col) => parseColorOption(col).name.toLowerCase() === c.name.toLowerCase()
                            );
                            return (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => {
                                  setNewColorInput(c.name);
                                  setNewColorHex(c.hex);
                                  if (!isAdded) {
                                    const formatted = formatColorOption(c.name, c.hex, displaySpecificColor);
                                    if (!prodColors.includes(formatted)) {
                                      setProdColors((prev) => [...prev, formatted]);
                                    }
                                  }
                                }}
                                disabled={isAdded}
                                className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-[11px] font-semibold text-slate-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                                  style={{ backgroundColor: c.hex }}
                                />
                                <span>+{c.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Current Added Colors Chips */}
                    {prodColors.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {prodColors.map((col, idx) => {
                          const parsed = parseColorOption(col);
                          return (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xs border border-slate-800"
                            >
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-2xs shrink-0"
                                style={{ backgroundColor: parsed.hex }}
                              />
                              <span>{parsed.name}</span>
                              {parsed.hasExplicitHex && (
                                <span className="text-[10px] text-slate-400 font-mono font-normal">
                                  {parsed.hex}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setProdColors((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-white cursor-pointer ml-0.5"
                                title={`Remove color ${parsed.name}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        No custom color options added. Product will sell without color variant selection.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="product-featured-checkbox"
                    type="checkbox"
                    checked={prodFeatured}
                    onChange={(e) => setProdFeatured(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                  />
                  <label
                    htmlFor="product-featured-checkbox"
                    className="text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Feature this product on homepage hero and top highlights
                  </label>
                </div>
              </div>
              </div>

              {/* Error Message Banner */}
              {productFormError && (
                <div className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{productFormError}</span>
                </div>
              )}

              {/* Action Buttons (Sticky Footer) */}
              <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center gap-3 shrink-0 z-10">
                <button
                  type="button"
                  disabled={isSavingProduct}
                  onClick={() => setIsProductModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  id="save-product-submit-btn"
                  type="submit"
                  disabled={isSavingProduct}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingProduct ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to D1...</span>
                    </>
                  ) : (
                    editingProduct ? 'Update Product' : 'Create Product'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: QUICK ADJUST PRODUCT RATING                           */}
      {/* ============================================================ */}
      {ratingModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="h-2 w-full rainbow-gradient-bg" />

            <form onSubmit={handleSaveRatingAdjustment} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                    <Star className="w-5 h-5 fill-amber-500 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900">
                      Adjust Product Rating
                    </h3>
                    <p className="text-[11px] text-slate-500">Custom admin option for social proof & ratings</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRatingModalProduct(null)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Target Product Summary */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <img
                  src={ratingModalProduct.imageUrl}
                  alt={ratingModalProduct.title}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-xs text-slate-900 truncate">
                    {ratingModalProduct.title}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Current: <strong className="text-amber-600">{ratingModalProduct.rating ? ratingModalProduct.rating.toFixed(1) : '5.0'}★</strong> ({(ratingModalProduct.reviewsCount ?? 0) > 0 ? `${ratingModalProduct.reviewsCount} reviews` : 'No customer reviews'})
                  </p>
                </div>
              </div>

              {/* Rating Slider & Number */}
              <div className="space-y-3 p-4 bg-amber-50/50 border border-amber-200 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                    New Rating Score
                  </label>
                  <div className="flex items-baseline gap-1 bg-white px-3 py-1 rounded-xl border border-amber-300 shadow-2xs font-mono font-extrabold text-base text-amber-700">
                    <span>{customRatingValue.toFixed(1)}</span>
                    <span className="text-xs text-slate-400">/ 5.0</span>
                  </div>
                </div>

                {/* Stepper with - / + buttons and Range Slider */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCustomRatingValue((prev) =>
                        Math.max(1.0, Math.round((prev - 0.1) * 10) / 10)
                      )
                    }
                    className="w-9 h-9 rounded-xl bg-white hover:bg-amber-100 active:scale-95 border border-amber-300 text-amber-900 font-extrabold flex items-center justify-center shadow-2xs transition-all shrink-0"
                    title="Decrease rating by 0.1"
                  >
                    <Minus className="w-4 h-4 text-amber-800" />
                  </button>

                  <div className="flex-1 px-1">
                    <input
                      id="rating-slider-input"
                      type="range"
                      min="1.0"
                      max="5.0"
                      step="0.1"
                      value={customRatingValue}
                      onChange={(e) => setCustomRatingValue(parseFloat(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer h-2 bg-amber-200 rounded-lg"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setCustomRatingValue((prev) =>
                        Math.min(5.0, Math.round((prev + 0.1) * 10) / 10)
                      )
                    }
                    className="w-9 h-9 rounded-xl bg-white hover:bg-amber-100 active:scale-95 border border-amber-300 text-amber-900 font-extrabold flex items-center justify-center shadow-2xs transition-all shrink-0"
                    title="Increase rating by 0.1"
                  >
                    <Plus className="w-4 h-4 text-amber-800" />
                  </button>
                </div>

                {/* Quick Rating Presets */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Presets:</span>
                  {[5.0, 4.9, 4.8, 4.7, 4.5, 4.0].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCustomRatingValue(r)}
                      className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                        customRatingValue === r
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-amber-100'
                      }`}
                    >
                      {r}★
                    </button>
                  ))}
                </div>
              </div>

              {/* Reviews Count */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span>Total Reviews Count</span>
                    <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">
                      Optional
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {customReviewsCount > 0 ? `${customReviewsCount} reviews` : '0 (No reviews)'}
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="rating-reviews-count-input"
                    type="number"
                    min="0"
                    value={customReviewsCount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomReviewsCount(val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCustomReviewsCount(0)}
                      className={`px-2 py-1 ${
                        customReviewsCount === 0
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      } font-bold text-xs rounded-lg transition-colors`}
                      title="Set to 0 reviews"
                    >
                      0 (None)
                    </button>
                    {[10, 50, 128, 250].map((rc) => (
                      <button
                        key={rc}
                        type="button"
                        onClick={() => setCustomReviewsCount(rc)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors"
                      >
                        +{rc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRatingModalProduct(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  id="save-rating-adjustment-submit-btn"
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Apply Rating
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DIRECT PRODUCT REVIEW CREATION (ADMIN)                */}
      {/* ============================================================ */}
      {adminReviewModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="h-2 w-full rainbow-gradient-bg" />

            <form onSubmit={handleSaveAdminReview} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900">
                      Add Product Review
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Create customer review for "{adminReviewModalProduct.title}"
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminReviewModalProduct(null)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {adminReviewError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{adminReviewError}</span>
                </div>
              )}

              {/* Target Product Summary */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <img
                  src={adminReviewModalProduct.imageUrl}
                  alt={adminReviewModalProduct.title}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-xs text-slate-900 truncate">
                    {adminReviewModalProduct.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Current: {adminReviewModalProduct.rating ? adminReviewModalProduct.rating.toFixed(1) : '5.0'}★ ({adminReviewModalProduct.reviewsCount ?? 0} revs)
                  </p>
                </div>
              </div>

              {/* Author & Rating */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Customer Name *
                  </label>
                  <input
                    id="admin-direct-review-author-input"
                    type="text"
                    value={adminReviewAuthor}
                    onChange={(e) => setAdminReviewAuthor(e.target.value)}
                    required
                    placeholder="e.g. Tanvir Ahmed"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Rating (1 to 5) *
                  </label>
                  <div className="flex items-center gap-1 py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setAdminReviewRating(star)}
                        className="p-1 hover:scale-110 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= adminReviewRating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-200'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="font-black text-slate-800 ml-1 text-sm">{adminReviewRating}★</span>
                  </div>
                </div>
              </div>

              {/* Customer Review Comment */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Customer Review Comment *
                </label>
                <textarea
                  id="admin-direct-review-comment-input"
                  value={adminReviewComment}
                  onChange={(e) => setAdminReviewComment(e.target.value)}
                  rows={3}
                  required
                  placeholder="Authentic feedback about quality, delivery, and customer experience..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                />
              </div>

              {/* Verified Customer Badge Toggle */}
              <label className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="font-bold text-xs text-slate-800 block">
                      Verified Customer Badge (ভেরিফাইড কাস্টমার ব্যাজ)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Show official green Verified Customer badge on storefront
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={adminReviewVerified}
                  onChange={(e) => setAdminReviewVerified(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                />
              </label>

              {/* Status Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Moderation Status *
                </label>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      adminReviewStatus === 'approved'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="adminDirectReviewStatus"
                      value="approved"
                      checked={adminReviewStatus === 'approved'}
                      onChange={() => setAdminReviewStatus('approved')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold block">Approved</span>
                      <span className="text-[10px] text-slate-500">Live now & recalculates rating</span>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      adminReviewStatus === 'pending'
                        ? 'bg-amber-50 border-amber-300 text-amber-950 ring-2 ring-amber-500/20'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="adminDirectReviewStatus"
                      value="pending"
                      checked={adminReviewStatus === 'pending'}
                      onChange={() => setAdminReviewStatus('pending')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="font-bold block">Pending</span>
                      <span className="text-[10px] text-slate-500">Save in review queue</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Internal Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Internal Staff Note (Optional)
                </label>
                <input
                  type="text"
                  value={adminReviewNote}
                  onChange={(e) => setAdminReviewNote(e.target.value)}
                  placeholder="e.g. Phone order feedback / verified WhatsApp customer"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdminReviewModalProduct(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  id="admin-save-direct-review-submit-btn"
                  type="submit"
                  disabled={adminReviewSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {adminReviewSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Review</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CATEGORY CREATE / EDIT                                */}
      {/* ============================================================ */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="h-2 w-full rainbow-gradient-bg" />

            <form onSubmit={handleCategoryFormSubmit} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-lg text-slate-900">
                  {editingCategory ? 'Edit Category' : 'Add New Category'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Category Name *
                  </label>
                  <input
                    id="category-modal-name"
                    type="text"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="e.g. Smartphone Accessories"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={catDescription}
                    onChange={(e) => setCatDescription(e.target.value)}
                    placeholder="Brief description for category banner..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {/* Admin Live Category Preview */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Category Preview
                  </span>
                  <div className="font-display font-bold text-sm text-slate-900">
                    {catName.trim() || 'Category Name'}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed break-words whitespace-pre-wrap">
                    {catDescription.trim() || 'Category description will appear here...'}
                  </p>
                </div>
              </div>

              {categoryFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{categoryFormError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingCategory}
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  id="save-category-submit-btn"
                  type="submit"
                  disabled={isSavingCategory}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingCategory ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to D1...</span>
                    </>
                  ) : (
                    editingCategory ? 'Update Category' : 'Save Category'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ============================================================ */}
      {/* MODAL: FULL ORDER EDIT                                       */}
      {/* ============================================================ */}
      {editingOrder && (
        <div
          id="edit-order-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingOrder(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-2xl sm:max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-4 sm:my-6 flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]">
            <div className="h-2 w-full rainbow-gradient-bg shrink-0" />

            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-rose-600" />
                  Edit Order #{editingOrder.orderNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Modify customer details, increase or decrease product prices, and adjust delivery &amp; payment data.
                </p>
              </div>
              <button
                type="button"
                id="close-order-modal-btn"
                onClick={() => setEditingOrder(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOrderEdit} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 space-y-5 overflow-y-auto flex-1">

              {/* Customer Information */}
              <div className="space-y-3">
                <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1">
                  Customer &amp; Shipping Destination
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Recipient Full Name *
                    </label>
                    <input
                      type="text"
                      value={editCustomerName}
                      onChange={(e) => setEditCustomerName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Contact Phone *
                    </label>
                    <input
                      type="text"
                      value={editCustomerPhone}
                      onChange={(e) => setEditCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Shipping Zone *
                    </label>
                    <select
                      value={editCustomerZone}
                      onChange={(e) => handleAdminZoneChange(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-rose-500"
                    >
                      <option value="inside_dhaka">Inside Dhaka (৳{settings.insideDhakaFee || 80})</option>
                      <option value="outside_dhaka">Outside Dhaka (৳{settings.outsideDhakaFee || 150})</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      District / City *
                    </label>
                    <input
                      type="text"
                      value={editCustomerDistrict}
                      onChange={(e) => setEditCustomerDistrict(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Full Address *
                  </label>
                  <input
                    type="text"
                    value={editCustomerAddress}
                    onChange={(e) => setEditCustomerAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Special Delivery Instructions
                  </label>
                  <input
                    type="text"
                    value={editCustomerNotes}
                    onChange={(e) => setEditCustomerNotes(e.target.value)}
                    placeholder="e.g. Call before delivery"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* ============================================================ */}
              {/* SECTION: ORDERED PRODUCTS & PRICE ADJUSTMENTS                 */}
              {/* ============================================================ */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <div>
                    <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <ShoppingBag className="w-4 h-4 text-rose-600" />
                      Ordered Products &amp; Price Adjustments
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Increase or decrease the unit price of published products in this order. Subtotal and grand total recalculate dynamically.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddItemToOrderOpen(!isAddItemToOrderOpen)}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddItemToOrderOpen ? 'Close Catalog' : 'Add Published Product'}</span>
                  </button>
                </div>

                {/* Add product from published store catalog drawer */}
                {isAddItemToOrderOpen && (
                  <div className="p-3 bg-rose-50/50 border border-rose-200 rounded-2xl space-y-2">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Select Published Product from Website Catalog to Add:
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedAddProductId}
                        onChange={(e) => setSelectedAddProductId(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="">-- Choose a published product --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} — Published at ৳{p.price.toLocaleString()} ({p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddPublishedProductToOrder}
                        disabled={!selectedAddProductId}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                      >
                        Add to Order
                      </button>
                    </div>
                  </div>
                )}

                {/* List of Ordered Products */}
                <div className="space-y-3">
                  {editOrderItems.map((item, idx) => {
                    const publishedProd = products.find((p) => p.id === item.product?.id);
                    const catalogPrice = publishedProd ? publishedProd.price : Number(item.product?.price || 0);
                    const orderUnitPrice = Number(item.product?.price || 0);
                    const delta = orderUnitPrice - catalogPrice;
                    const itemTotal = orderUnitPrice * Number(item.quantity || 1);
                    const availableSizes = Array.from(
                      new Set([
                        ...(publishedProd?.sizes || []),
                        ...(item.product?.sizes || []),
                        ...(item.selectedSize ? [item.selectedSize] : []),
                      ].filter(Boolean) as string[])
                    );
                    const availableColors = Array.from(
                      new Set([
                        ...(publishedProd?.colors || []),
                        ...(item.product?.colors || []),
                        ...(item.selectedColor ? [item.selectedColor] : []),
                      ].filter(Boolean) as string[])
                    );

                    return (
                      <div
                        key={item.product?.id ? `${item.product.id}-${idx}` : idx}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-3 shadow-2xs"
                      >
                        {/* Product Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.product?.imageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100'}
                              alt={item.product?.title || 'Product'}
                              className="w-12 h-12 rounded-xl object-cover border border-slate-100 shrink-0 bg-slate-100"
                            />
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs text-slate-900 truncate">
                                {item.product?.title || 'Unknown Product'}
                              </h4>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                  Catalog Published: <strong className="text-slate-800">৳{catalogPrice.toLocaleString()}</strong>
                                </span>
                                {item.selectedSize && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono">
                                    Size: {item.selectedSize}
                                  </span>
                                )}
                                {item.selectedColor && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                                    Color: {item.selectedColor}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {editOrderItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOrderItem(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Remove product from this order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Variant Selection: Color & Size Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 pb-1 border-t border-slate-100">
                          {/* Color Option Selector */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label
                                htmlFor={`order-item-color-select-${idx}`}
                                className="text-[10px] font-bold uppercase tracking-wider text-slate-600"
                              >
                                Product Color
                              </label>
                              {item.selectedColor && (
                                <span className="text-[10px] font-semibold text-rose-600 flex items-center gap-1">
                                  {(() => {
                                    const parsed = parseColorOption(item.selectedColor);
                                    return (
                                      <>
                                        <span
                                          className={`w-2 h-2 rounded-full border shadow-2xs inline-block ${
                                            parsed.isLight ? 'border-slate-300' : 'border-black/20'
                                          }`}
                                          style={{ backgroundColor: parsed.hex }}
                                        />
                                        <span className="truncate max-w-[100px]">{parsed.name}</span>
                                      </>
                                    );
                                  })()}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <select
                                id={`order-item-color-select-${idx}`}
                                value={item.selectedColor || ''}
                                onChange={(e) => {
                                  if (e.target.value === '__custom__') {
                                    handleUpdateOrderItemColor(idx, item.selectedColor || 'Custom');
                                  } else {
                                    handleUpdateOrderItemColor(idx, e.target.value);
                                  }
                                }}
                                className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all cursor-pointer"
                              >
                                <option value="">-- No Color / None --</option>
                                {availableColors.map((col) => {
                                  const parsed = parseColorOption(col);
                                  return (
                                    <option key={col} value={col}>
                                      {parsed.name}
                                    </option>
                                  );
                                })}
                                <option value="__custom__">Custom / Other Color...</option>
                              </select>
                              {(!availableColors.includes(item.selectedColor || '') && Boolean(item.selectedColor)) && (
                                <input
                                  type="text"
                                  value={item.selectedColor || ''}
                                  onChange={(e) => handleUpdateOrderItemColor(idx, e.target.value)}
                                  placeholder="Type color"
                                  className="w-28 px-2 py-1.5 bg-white border border-rose-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                                  title="Enter custom color name"
                                />
                              )}
                            </div>
                          </div>

                          {/* Size Option Selector */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label
                                htmlFor={`order-item-size-select-${idx}`}
                                className="text-[10px] font-bold uppercase tracking-wider text-slate-600"
                              >
                                Product Size / Option
                              </label>
                              {item.selectedSize && (
                                <span className="text-[10px] font-extrabold text-slate-800 font-mono">
                                  {item.selectedSize}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <select
                                id={`order-item-size-select-${idx}`}
                                value={item.selectedSize || ''}
                                onChange={(e) => {
                                  if (e.target.value === '__custom__') {
                                    handleUpdateOrderItemSize(idx, item.selectedSize || 'Custom');
                                  } else {
                                    handleUpdateOrderItemSize(idx, e.target.value);
                                  }
                                }}
                                className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500 focus:bg-white transition-all cursor-pointer"
                              >
                                <option value="">-- No Size / None --</option>
                                {availableSizes.map((sz) => (
                                  <option key={sz} value={sz}>
                                    {sz}
                                  </option>
                                ))}
                                <option value="__custom__">Custom / Other Size...</option>
                              </select>
                              {(!availableSizes.includes(item.selectedSize || '') && Boolean(item.selectedSize)) && (
                                <input
                                  type="text"
                                  value={item.selectedSize || ''}
                                  onChange={(e) => handleUpdateOrderItemSize(idx, e.target.value)}
                                  placeholder="Type size"
                                  className="w-24 px-2 py-1.5 bg-white border border-rose-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                                  title="Enter custom size"
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Interactive Price Adjustment Row */}
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                          {/* Unit price editing & Quick buttons */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                Order Unit Price (৳)
                              </label>
                              {delta > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  <TrendingUp className="w-2.5 h-2.5" />
                                  +৳{delta.toLocaleString()} increased (+{Math.round((delta / (catalogPrice || 1)) * 100)}%)
                                </span>
                              )}
                              {delta < 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <TrendingDown className="w-2.5 h-2.5" />
                                  -৳{Math.abs(delta).toLocaleString()} discounted (-{Math.round((Math.abs(delta) / (catalogPrice || 1)) * 100)}%)
                                </span>
                              )}
                              {delta === 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200/80 text-slate-600">
                                  Catalog price
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Quick Decrement buttons */}
                              <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => handleAdjustOrderItemPriceDelta(idx, -100)}
                                  className="px-2 py-1 text-[10px] font-bold hover:bg-slate-100 text-slate-700 border-r border-slate-200 cursor-pointer"
                                  title="Decrease by ৳100"
                                >
                                  -100
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustOrderItemPriceDelta(idx, -50)}
                                  className="px-2 py-1 text-[10px] font-bold hover:bg-slate-100 text-slate-700 border-r border-slate-200 cursor-pointer"
                                  title="Decrease by ৳50"
                                >
                                  -50
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustOrderItemPriceDelta(idx, -10)}
                                  className="px-1.5 py-1 text-[10px] font-bold hover:bg-slate-100 text-slate-700 cursor-pointer"
                                  title="Decrease by ৳10"
                                >
                                  -10
                                </button>
                              </div>

                              {/* Integrated Numeric Input with Direct Keypad Typing */}
                              <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden shadow-2xs focus-within:ring-2 focus-within:ring-rose-500">
                                <button
                                  type="button"
                                  onClick={() => handleAdjustOrderItemPriceDelta(idx, -10)}
                                  className="px-2 py-1 text-xs font-bold hover:bg-rose-50 text-rose-600 border-r border-slate-200 cursor-pointer active:scale-95 transition-all select-none"
                                  title="Decrease by ৳10"
                                >
                                  -
                                </button>
                                <div className="relative w-24">
                                  <span className="absolute left-2 top-1 text-xs font-bold text-slate-400 select-none">৳</span>
                                  <input
                                    id={`order-item-price-${idx}`}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={item.product?.price === '' ? '' : (item.product?.price ?? '')}
                                    onChange={(e) => {
                                      const cleaned = e.target.value.replace(/[^0-9]/g, '');
                                      handleUpdateOrderItemPrice(idx, cleaned);
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    onBlur={() => handleBlurOrderItemPrice(idx)}
                                    className="w-full pl-5 pr-2 py-1 bg-white text-xs font-bold text-slate-900 focus:outline-hidden font-mono"
                                    placeholder="0"
                                    title="Type specific price directly using keypad"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustOrderItemPriceDelta(idx, 10)}
                                  className="px-2 py-1 text-xs font-bold hover:bg-emerald-50 text-emerald-600 border-l border-slate-200 cursor-pointer active:scale-95 transition-all select-none"
                                  title="Increase by ৳10"
                                >
                                  +
                                </button>
                              </div>

                              {/* Quick Increment buttons */}
                              <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => handleAdjustOrderItemPriceDelta(idx, 10)}
                                  className="px-1.5 py-1 text-[10px] font-bold hover:bg-slate-100 text-slate-700 border-r border-slate-200 cursor-pointer"
                                  title="Increase by ৳10"
                                >
                                  +10
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustOrderItemPriceDelta(idx, 50)}
                                  className="px-2 py-1 text-[10px] font-bold hover:bg-slate-100 text-slate-700 border-r border-slate-200 cursor-pointer"
                                  title="Increase by ৳50"
                                >
                                  +50
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustOrderItemPriceDelta(idx, 100)}
                                  className="px-2 py-1 text-[10px] font-bold hover:bg-slate-100 text-slate-700 cursor-pointer"
                                  title="Increase by ৳100"
                                >
                                  +100
                                </button>
                              </div>

                              {delta !== 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleResetOrderItemToPublishedPrice(idx)}
                                  className="px-1.5 py-1 text-[10px] font-medium text-slate-500 hover:text-slate-800 underline cursor-pointer"
                                  title="Reset back to published website catalog price"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Quantity & line total */}
                          <div className="flex items-center gap-3">
                            <div className="space-y-0.5 text-center">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                                Qty
                              </label>
                              <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderItemQuantity(idx, Number(item.quantity || 1) - 1)}
                                  className="px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-100 border-r border-slate-200 cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="px-2.5 py-0.5 text-xs font-bold font-mono text-slate-800">
                                  {item.quantity || 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderItemQuantity(idx, Number(item.quantity || 1) + 1)}
                                  className="px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-100 border-l border-slate-200 cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div className="space-y-0.5 text-right min-w-[80px]">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                                Item Total
                              </label>
                              <span className="font-bold text-xs text-slate-900 block font-mono">
                                ৳{itemTotal.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Dynamically Recalculated Order Breakdown */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-[11px] font-medium">Products Subtotal:</span>
                    <span className="font-bold font-mono text-slate-800">
                      ৳{getEditOrderSubtotal(editOrderItems).toLocaleString()} BDT
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="text-[11px] font-medium">
                      Delivery Fee ({editCustomerZone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}):
                    </span>
                    <span className="font-bold font-mono text-slate-800">
                      ৳{editDeliveryFee} BDT
                    </span>
                  </div>
                  {editingOrder.discountAmount ? (
                    <div className="flex items-center justify-between text-emerald-700">
                      <span className="text-[11px] font-medium">Discount Applied ({editingOrder.couponCode || 'Coupon'}):</span>
                      <span className="font-bold font-mono">-৳{editingOrder.discountAmount.toLocaleString()} BDT</span>
                    </div>
                  ) : null}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 text-[10px] block uppercase font-bold">Recalculated Grand Total</span>
                      <span className="text-[10px] text-slate-400">Dynamically synced across all order tabs &amp; invoices</span>
                    </div>
                    <span className="font-display font-bold text-base text-rose-600">
                      ৳{editComputedGrandTotal.toLocaleString()} BDT
                    </span>
                  </div>

                  {/* Advance Payment & Customer Due preview */}
                  <div className="pt-2 border-t border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-blue-700">
                      <span className="text-[11px] font-medium">
                        Advance Payment ({editAdvanceMethod || 'Advance'}):
                      </span>
                      <span className="font-bold font-mono">
                        -৳{editParsedAdvance.toLocaleString()} BDT
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-800 font-bold">
                      <span className="text-[11px]">Customer Due Amount (COD):</span>
                      <span className="font-mono text-xs text-emerald-700 font-bold">
                        ৳{editComputedCustomerDue.toLocaleString()} BDT
                      </span>
                    </div>
                  </div>

                  {/* Permission-Guarded Profit / Loss Estimation */}
                  {canViewProfit && (() => {
                    return (
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-500">Estimated Cost &amp; Profit:</span>
                        <div className="flex items-center gap-2">
                          {canViewBuyingPrice && (
                            <>
                              <span className="text-slate-600">Cost: ৳{editLiveCost.toLocaleString()}</span>
                              <span className="text-slate-300">•</span>
                            </>
                          )}
                          <span className={editLiveProfit < 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                            {editLiveProfit < 0 ? `Loss: -৳${Math.abs(editLiveProfit).toLocaleString()}` : `Profit: ৳${editLiveProfit.toLocaleString()}`}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Advance Conflict Warning */}
                  {editAdvanceValidationError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        <strong>Validation Error:</strong> {editAdvanceValidationError}
                      </span>
                    </div>
                  )}
                </div>

                {/* Dedicated Advance Payment Management Area */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                        <CreditCard className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="font-display font-bold text-xs text-slate-900 flex items-center gap-2">
                          Advance Payment &amp; Customer Due
                          {editComputedCustomerDue === 0 && editComputedGrandTotal > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Paid in Full (Due: ৳0)
                            </span>
                          ) : editParsedAdvance > 0 && editComputedCustomerDue > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                              Partial Advance
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                              Full Due (COD)
                            </span>
                          )}
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          Authorized admin management for customer advance deposits. Live recalculation.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                        Order Total
                      </span>
                      <span className="text-sm font-bold font-mono text-slate-900 block mt-0.5">
                        ৳{editComputedGrandTotal.toLocaleString()} BDT
                      </span>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-blue-200 shadow-2xs">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 block">
                        Advance Paid
                      </span>
                      <span className="text-sm font-bold font-mono text-blue-700 block mt-0.5">
                        ৳{editParsedAdvance.toLocaleString()} BDT
                      </span>
                    </div>

                    <div className={`p-2.5 bg-white rounded-xl border shadow-2xs ${editComputedCustomerDue === 0 ? 'border-emerald-300 bg-emerald-50/20' : 'border-amber-300 bg-amber-50/20'}`}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-700 block">
                        Customer Due
                      </span>
                      <span className={`text-sm font-bold font-mono block mt-0.5 ${editComputedCustomerDue === 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
                        ৳{editComputedCustomerDue.toLocaleString()} BDT
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">
                        Advance Payment Amount (৳)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold text-xs">৳</span>
                        <input
                          id="order-edit-advance-input"
                          type="number"
                          min="0"
                          step="1"
                          disabled={!canManageOrders}
                          value={editAdvancePayment}
                          onChange={(e) => setEditAdvancePayment(e.target.value)}
                          placeholder="0"
                          className="w-full pl-6 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <button
                          type="button"
                          disabled={!canManageOrders}
                          onClick={() => setEditAdvancePayment(0)}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Reset (৳0)
                        </button>
                        <button
                          type="button"
                          disabled={!canManageOrders}
                          onClick={() => setEditAdvancePayment(editComputedGrandTotal)}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold cursor-pointer disabled:opacity-50"
                        >
                          Full (৳{editComputedGrandTotal.toLocaleString()})
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">
                        Payment Method / Channel
                      </label>
                      <select
                        id="order-edit-advance-method-select"
                        disabled={!canManageOrders}
                        value={editAdvanceMethod}
                        onChange={(e) => setEditAdvanceMethod(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="Cash / Advance">Cash in Hand / Delivery Point</option>
                        <option value="bKash">bKash Personal / Merchant</option>
                        <option value="Nagad">Nagad</option>
                        <option value="Rocket">DBBL Rocket</option>
                        <option value="Bank Transfer">Bank Transfer / DBBL</option>
                        <option value="Upay">Upay</option>
                        <option value="Other">Other Gateway</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-1">
                        TrxID / Reference Note
                      </label>
                      <input
                        id="order-edit-advance-note-input"
                        type="text"
                        disabled={!canManageOrders}
                        value={editAdvanceNote}
                        onChange={(e) => setEditAdvanceNote(e.target.value)}
                        placeholder="e.g. TrxID 9K28F... / Slip #44"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Status & Payment Verification */}
              <div className="space-y-3 pt-2">
                <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1">
                  Order & Payment Status
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Shipping Status
                    </label>
                    <select
                      value={editShippingStatus}
                      onChange={(e) => setEditShippingStatus(e.target.value as ShippingStatus)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-rose-500"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Processing">Processing</option>
                      <option value="Shipped">Shipped</option>
                      <option value="Delivered">Delivered</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Payment Verification Status
                    </label>
                    <select
                      value={editPaymentStatus}
                      onChange={(e) => setEditPaymentStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-rose-500"
                    >
                      <option value="PAID">PAID</option>
                      <option value="UNVERIFIED">UNVERIFIED</option>
                      <option value="DUE">DUE</option>
                      <option value="Pending COD">Pending COD</option>
                    </select>
                  </div>
                </div>

                {/* DBBL Bank Info Fields */}
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      Bank Transfer Verification Details
                    </span>
                    <span className="text-[10px] text-blue-600 font-semibold">
                      Method: {editingOrder.paymentMethod.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Bank Transaction ID (TrxID)
                      </label>
                      <input
                        type="text"
                        value={editBankTrxId}
                        onChange={(e) => setEditBankTrxId(e.target.value)}
                        placeholder="e.g. DBBL98234190"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Sender Bank Name
                      </label>
                      <input
                        type="text"
                        value={editSenderBank}
                        onChange={(e) => setEditSenderBank(e.target.value)}
                        placeholder="e.g. Dutch-Bangla / NexusPay"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Sender A/C or Phone
                      </label>
                      <input
                        type="text"
                        value={editSenderAccount}
                        onChange={(e) => setEditSenderAccount(e.target.value)}
                        placeholder="e.g. 01712345678"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Courier Waybill Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Courier Logistics Provider
                    </label>
                    <select
                      value={editCourierProvider}
                      onChange={(e) => setEditCourierProvider(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-rose-500"
                    >
                      <option value="">None / Not Booked</option>
                      {courierConfigs.map((c) => (
                        <option key={c.id || c.code} value={c.code || c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Waybill / Tracking ID
                    </label>
                    <input
                      type="text"
                      value={editCourierWaybill}
                      onChange={(e) => setEditCourierWaybill(e.target.value)}
                      placeholder="e.g. STDF-123456"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
              </div>
              </div>

              {/* Modal Buttons (Sticky Footer) */}
              <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center gap-3 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="save-order-edit-btn"
                  type="submit"
                  disabled={Boolean(editAdvanceValidationError)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  Save Order Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DEPOSIT SLIP SCREENSHOT PREVIEW                       */}
      {/* ============================================================ */}
      {previewSlipUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm">Customer Deposit Slip / Transfer Screenshot</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSlipUrl(null)}
                className="p-1 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[70vh] overflow-auto">
              <img
                src={previewSlipUrl}
                alt="Deposit Slip"
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-md border border-slate-200"
              />
            </div>

            <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Verify this transfer with your Dutch-Bangla Bank statement.
              </span>
              <button
                type="button"
                onClick={() => setPreviewSlipUrl(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: RESET CUSTOMER PASSWORD                               */}
      {/* ============================================================ */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="h-2 w-full bg-linear-to-r from-amber-500 via-rose-500 to-indigo-500" />

            <form onSubmit={handleResetPasswordSubmit} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900">
                      Reset Customer Password
                    </h3>
                    <p className="text-xs text-slate-500">
                      Update login credentials for customer account
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setResettingUser(null);
                    setNewPasswordValue('');
                  }}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Target User Snapshot */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Customer Name:</span>
                  <span className="font-bold text-slate-800">{resettingUser.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Email Address:</span>
                  <span className="font-mono font-bold text-slate-800">{resettingUser.email}</span>
                </div>
                {resettingUser.phone && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Phone:</span>
                    <span className="font-mono text-slate-700">{resettingUser.phone}</span>
                  </div>
                )}
              </div>

              {/* Password Input & Quick Generator */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    New Password *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Generate Random Password
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="admin-new-password-input"
                    type="text"
                    value={newPasswordValue}
                    onChange={(e) => setNewPasswordValue(e.target.value)}
                    placeholder="Enter or generate new password..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Minimum 8 characters. You can click "Generate Random Password" to auto-create a strong password.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setResettingUser(null);
                    setNewPasswordValue('');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="confirm-reset-password-btn"
                  disabled={!newPasswordValue.trim() || newPasswordValue.trim().length < MIN_PASSWORD_LENGTH}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  Save & Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: GRANULAR ADMIN RBAC PERMISSION MANAGEMENT             */}
      {/* ============================================================ */}
      {permissionsModalUser && (
        <ErrorBoundary compact fallbackTitle="Permission Modal Unavailable" fallbackMessage="Could not load permissions management modal.">
          <React.Suspense fallback={null}>
            <PermissionManagementModal
              targetUser={permissionsModalUser}
              isOpen={Boolean(permissionsModalUser)}
              onClose={() => setPermissionsModalUser(null)}
              onSaveSuccess={(updatedUser) => {
                if (updatedUser.role === 'customer') {
                  if (selectedStaffUserId === updatedUser.id) {
                    setSelectedStaffUserId('');
                  }
                  setAccountFeedback(`Successfully converted ${updatedUser.name} to Customer and revoked admin access.`);
                } else {
                  setAccountFeedback(`Successfully saved granular permissions for ${updatedUser.name} (${updatedUser.role.toUpperCase()}).`);
                }
                setTimeout(() => setAccountFeedback(null), 4000);
              }}
            />
          </React.Suspense>
        </ErrorBoundary>
      )}

      {/* Super Admin Password Change Modal */}
      {isSuperAdminPwModalOpen && (
        <div
          id="super-admin-pw-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSuperAdminPwModalOpen(false);
          }}
        >
          <div
            id="super-admin-pw-modal-dialog"
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
          >
            <div className="p-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Change Super Admin Password</h4>
                  <p className="text-[11px] text-amber-100">Master Account: {currentUser?.email || 'Super Administrator'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSuperAdminPwModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center text-white/90 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSuperAdminPasswordChange} className="p-5 space-y-4">
              {superAdminPwError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{superAdminPwError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Current Password (optional verification)
                </label>
                <div className="relative">
                  <input
                    type={showSuperAdminPwInputs ? 'text' : 'password'}
                    value={superAdminCurrentPw}
                    onChange={(e) => setSuperAdminCurrentPw(e.target.value)}
                    placeholder="Enter current password (if set)"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSuperAdminPwInputs(!showSuperAdminPwInputs)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showSuperAdminPwInputs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  New Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showSuperAdminPwInputs ? 'text' : 'password'}
                    value={superAdminNewPw}
                    onChange={(e) => setSuperAdminNewPw(e.target.value)}
                    placeholder="Minimum 8 characters"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSuperAdminPwInputs(!showSuperAdminPwInputs)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showSuperAdminPwInputs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 block">
                  Must be at least 8 characters. This updates your master login password across all admin sessions.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Confirm New Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type={showSuperAdminPwInputs ? 'text' : 'password'}
                  value={superAdminConfirmPw}
                  onChange={(e) => setSuperAdminConfirmPw(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSuperAdminPwModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="confirm-change-super-admin-pw-btn"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Key className="w-4 h-4" />
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified In-App Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
      />
    </div>
  );
};

export const AdminPanel: React.FC = () => {
  return (
    <AdminProvider>
      <AdminPanelContent />
    </AdminProvider>
  );
};
