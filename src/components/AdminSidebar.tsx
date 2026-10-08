import React from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  FolderTree,
  Sliders,
  Truck,
  Settings,
  Users,
  Activity,
  TicketPercent,
  ChevronRight,
  Plus,
  ExternalLink,
  Lock,
  Bug,
  TrendingUp,
  MessageSquare,
} from 'lucide-react';

interface AdminSidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  isMobileNavOpen: boolean;
  setIsMobileNavOpen: (open: boolean) => void;
  ordersCount: number;
  productsCount: number;
  featuredProductsCount?: number;
  categoriesCount: number;
  slidesCount: number;
  couriersCount: number;
  couponsCount: number;
  usersCount: number;
  pendingOrdersCount: number;
  lowStockProductsCount: number;
  hasPermission: (perm: string) => boolean;
  orderStatusFilter: string;
  setOrderStatusFilter: (filter: any) => void;
  productStockFilter: string;
  setProductStockFilter: (filter: any) => void;
  settingsSectionFilter: string;
  setSettingsSectionFilter: (filter: any) => void;
  openAddModal: () => void;
  openAddCategoryModal: () => void;
  openCreateUserModal: () => void;
  currentUser: any;
  setCurrentView: (view: any) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  setActiveTab,
  isMobileNavOpen,
  setIsMobileNavOpen,
  ordersCount,
  productsCount,
  featuredProductsCount = 0,
  categoriesCount,
  slidesCount,
  couriersCount,
  couponsCount,
  usersCount,
  pendingOrdersCount,
  lowStockProductsCount,
  hasPermission,
  orderStatusFilter,
  setOrderStatusFilter,
  productStockFilter,
  setProductStockFilter,
  settingsSectionFilter,
  setSettingsSectionFilter,
  openAddModal,
  openAddCategoryModal,
  openCreateUserModal,
  currentUser,
  setCurrentView,
}) => {
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const menuItems = [
    {
      id: 'overview',
      label: 'Overview & Analytics',
      icon: LayoutDashboard,
      badge: null,
      color: 'sky',
      permission: null,
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'profit',
            label: 'Profit & Analytics',
            icon: TrendingUp,
            badge: 'Super Admin',
            color: 'emerald',
            permission: null,
          },
        ]
      : []),
    {
      id: 'orders',
      label: 'Manage Orders',
      icon: ShoppingBag,
      badge: ordersCount,
      color: 'emerald',
      permission: 'canManageOrders',
    },
    {
      id: 'products',
      label: 'Product Management',
      icon: Package,
      badge: productsCount,
      color: 'amber',
      permission: 'product.view',
    },
    {
      id: 'categories',
      label: 'Categories',
      icon: FolderTree,
      badge: categoriesCount,
      color: 'indigo',
      permission: 'canManageCategories',
    },
    {
      id: 'slides',
      label: 'Hero Slides',
      icon: Sliders,
      badge: slidesCount,
      color: 'pink',
      permission: 'canManageSettings',
    },
    {
      id: 'couriers',
      label: 'Courier APIs',
      icon: Truck,
      badge: couriersCount,
      color: 'cyan',
      permission: 'canManageSettings',
    },
    {
      id: 'settings',
      label: 'Store Settings',
      icon: Settings,
      badge: null,
      color: 'purple',
      permission: 'settings.manage',
    },
    {
      id: 'users',
      label: 'Accounts',
      icon: Users,
      badge: usersCount,
      color: 'rose',
      permission: 'canManageAccounts',
    },
    {
      id: 'pixels',
      label: 'Marketing Pixels',
      icon: Activity,
      badge: 'Live',
      color: 'teal',
      permission: 'canManageSettings',
    },
    {
      id: 'vouchers',
      label: 'Vouchers & Promos',
      icon: TicketPercent,
      badge: couponsCount,
      color: 'violet',
      permission: 'canManageSettings',
    },
    {
      id: 'reviews',
      label: 'Customer Reviews',
      icon: MessageSquare,
      badge: null,
      color: 'amber',
      permission: 'reviews.view',
    },
    {
      id: 'debug',
      label: 'App Debug & System Health',
      icon: Bug,
      badge: 'Diagnostics',
      color: 'amber',
      permission: null,
    },
  ];

  return (
    <aside
      id="admin-left-sidebar"
      className={`w-full md:w-64 lg:w-72 bg-slate-900 border-r border-slate-800 shrink-0 md:sticky md:top-[61px] md:h-[calc(100vh-61px)] md:overflow-y-auto z-30 transition-all ${
        isMobileNavOpen
          ? 'fixed inset-x-0 top-[61px] bottom-0 bg-slate-950/98 overflow-y-auto p-4 z-50 backdrop-blur-md flex flex-col'
          : 'hidden md:flex md:flex-col p-3 sm:p-4'
      }`}
    >
      {/* Sidebar Header */}
      <div className="px-3 py-2 text-[11px] font-bold tracking-wider uppercase text-slate-400 flex items-center justify-between border-b border-slate-800/60 pb-3 mb-2">
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          Menu Options
        </span>
        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
          11 Modules
        </span>
      </div>

      {/* Vertical list of the 10 menu options */}
      <nav className="space-y-1.5 flex-1" aria-label="Admin Navigation Menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isPermitted = !item.permission || hasPermission(item.permission);

          return (
            <div key={item.id} className="space-y-1">
              <button
                type="button"
                id={`admin-nav-${item.id}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileNavOpen(false);
                }}
                className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-slate-800 to-slate-850 text-white shadow-md border-l-4 border-l-rose-500 border-y border-r border-slate-700/60'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border-l-4 border-l-transparent border-y border-r border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      isActive
                        ? 'bg-rose-500 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="truncate">{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!isPermitted && (
                    <span title="Restricted Permission">
                      <Lock className="w-3 h-3 text-amber-400" />
                    </span>
                  )}
                  {item.badge !== null && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        isActive
                          ? 'bg-rose-500/30 text-rose-200 border border-rose-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-rose-400" />}
                </div>
              </button>

              {/* Contextual Sub-actions under Active Item */}
              {isActive && item.id === 'orders' && (
                <div className="pl-9 pr-2 py-1 space-y-1 text-[11px] animate-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setOrderStatusFilter('all');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      orderStatusFilter === 'all'
                        ? 'text-emerald-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    • All Orders ({ordersCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderStatusFilter('pending');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      orderStatusFilter === 'pending'
                        ? 'text-amber-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    • Pending Review ({pendingOrdersCount})
                  </button>
                </div>
              )}

              {isActive && item.id === 'products' && (
                <div className="pl-9 pr-2 py-1 space-y-1 text-[11px] animate-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setProductStockFilter('all');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      productStockFilter !== 'featured' && productStockFilter !== 'low'
                        ? 'text-amber-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    • All Products ({productsCount})
                  </button>
                  <button
                    type="button"
                    id="admin-sidebar-featured-products-btn"
                    onClick={() => {
                      setProductStockFilter('featured');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center justify-between ${
                      productStockFilter === 'featured'
                        ? 'text-rose-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>⭐ Featured Products</span>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded-full font-bold">
                      {featuredProductsCount}
                    </span>
                  </button>
                  {hasPermission('product.create') && (
                    <button
                      type="button"
                      id="admin-sidebar-add-product-btn"
                      onClick={() => {
                        openAddModal();
                        setIsMobileNavOpen(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded-md text-amber-400 hover:bg-slate-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      + New Product
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProductStockFilter('low');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      productStockFilter === 'low'
                        ? 'text-rose-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    • Low Stock ({lowStockProductsCount})
                  </button>
                </div>
              )}

              {isActive && item.id === 'categories' && (
                <div className="pl-9 pr-2 py-1 space-y-1 text-[11px] animate-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      if (hasPermission('canManageCategories')) {
                        openAddCategoryModal();
                        setIsMobileNavOpen(false);
                      }
                    }}
                    className="w-full text-left px-2 py-1 rounded-md text-indigo-400 hover:bg-slate-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    + New Category
                  </button>
                </div>
              )}

              {isActive && item.id === 'slides' && (
                <div className="pl-9 pr-2 py-1 space-y-1 text-[11px] animate-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      const btn = document.getElementById('btn-add-hero-slide');
                      if (btn) btn.click();
                      setIsMobileNavOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded-md text-pink-400 hover:bg-slate-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    + Add Slide Banner
                  </button>
                </div>
              )}

              {isActive && item.id === 'settings' && (
                <div className="pl-9 pr-2 py-1 space-y-1 text-[11px] animate-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsSectionFilter('all');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      settingsSectionFilter === 'all'
                        ? 'text-purple-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    • All Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsSectionFilter('general');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      settingsSectionFilter === 'general'
                        ? 'text-purple-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    • Store / Header Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsSectionFilter('delivery');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      settingsSectionFilter === 'delivery'
                        ? 'text-purple-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    • Delivery Rates
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsSectionFilter('bank');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      settingsSectionFilter === 'bank' || settingsSectionFilter === 'dbbl'
                        ? 'text-purple-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    • Bank & NexusPay
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsSectionFilter('footer');
                      setIsMobileNavOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      settingsSectionFilter === 'footer'
                        ? 'text-purple-400 font-bold bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    • Footer & WhatsApp Support
                  </button>
                </div>
              )}

              {isActive && item.id === 'users' && (
                <div className="pl-9 pr-2 py-1 space-y-1 text-[11px] animate-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      openCreateUserModal();
                      setIsMobileNavOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded-md text-rose-400 hover:bg-slate-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    + New Account
                  </button>
                </div>
              )}

              {isActive && item.id === 'vouchers' && (
                <div className="pl-9 pr-2 py-1 space-y-1 text-[11px] animate-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      const btn = document.getElementById('btn-create-new-voucher');
                      if (btn) btn.click();
                      setIsMobileNavOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded-md text-violet-400 hover:bg-slate-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    + New Promo Code
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Quick Info & Storefront Button in Sidebar Bottom */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2">
        <button
          type="button"
          onClick={() => setCurrentView('store')}
          className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>View Storefront</span>
        </button>
        <div className="px-1 flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-mono truncate max-w-[140px]">{currentUser?.email || 'admin'}</span>
          <span className="text-emerald-400 flex items-center gap-1 text-[10px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
          </span>
        </div>
      </div>
    </aside>
  );
};
