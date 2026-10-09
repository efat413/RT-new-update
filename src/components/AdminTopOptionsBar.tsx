import React, { useRef, useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
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
  Bug,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export interface AdminTopOptionsBarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  ordersCount: number;
  productsCount: number;
  categoriesCount: number;
  slidesCount: number;
  couriersCount: number;
  couponsCount: number;
  usersCount: number;
  pendingOrdersCount: number;
  warningsCount: number;
  hasPermission?: (permission: any) => boolean;
}

export const AdminTopOptionsBar: React.FC<AdminTopOptionsBarProps> = ({
  activeTab,
  setActiveTab,
  ordersCount,
  productsCount,
  categoriesCount,
  slidesCount,
  couriersCount,
  couponsCount,
  usersCount,
  pendingOrdersCount,
  warningsCount,
  hasPermission = (_perm?: any) => true,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const optionsList = [
    {
      id: 'overview',
      label: 'Overview & Analytics',
      icon: LayoutDashboard,
      badge: null,
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      permission: null,
    },
    {
      id: 'orders',
      label: 'Manage Orders',
      icon: ShoppingBag,
      badge: pendingOrdersCount > 0 ? `${pendingOrdersCount} Pending` : `${ordersCount}`,
      badgeColor: pendingOrdersCount > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-700 text-slate-300',
      permission: 'canManageOrders',
    },
    {
      id: 'products',
      label: 'Product Management',
      icon: Package,
      badge: `${productsCount}`,
      badgeColor: 'bg-slate-700 text-slate-300',
      permission: 'product.view',
    },
    {
      id: 'categories',
      label: 'Categories',
      icon: FolderTree,
      badge: `${categoriesCount}`,
      badgeColor: 'bg-slate-700 text-slate-300',
      permission: 'canManageCategories',
    },
    {
      id: 'slides',
      label: 'Hero Slides',
      icon: Sliders,
      badge: `${slidesCount}`,
      badgeColor: 'bg-slate-700 text-slate-300',
      permission: 'canManageSettings',
    },
    {
      id: 'couriers',
      label: 'Courier APIs',
      icon: Truck,
      badge: `${couriersCount}`,
      badgeColor: 'bg-slate-700 text-slate-300',
      permission: 'canManageSettings',
    },
    {
      id: 'settings',
      label: 'Store Settings',
      icon: Settings,
      badge: null,
      badgeColor: '',
      permission: 'settings.manage',
    },
    {
      id: 'users',
      label: 'Accounts',
      icon: Users,
      badge: `${usersCount}`,
      badgeColor: 'bg-slate-700 text-slate-300',
      permission: 'canManageAccounts',
    },
    {
      id: 'pixels',
      label: 'Marketing Pixels',
      icon: Activity,
      badge: 'Live',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      permission: 'canManageSettings',
    },
    {
      id: 'vouchers',
      label: 'Vouchers & Promos',
      icon: TicketPercent,
      badge: `${couponsCount}`,
      badgeColor: 'bg-slate-700 text-slate-300',
      permission: 'canManageSettings',
    },
    {
      id: 'debug',
      label: 'App Debug & System Health',
      icon: Bug,
      badge: warningsCount > 0 ? `${warningsCount} Warning${warningsCount > 1 ? 's' : ''}` : 'Operational',
      badgeColor:
        warningsCount > 0
          ? 'bg-amber-500 text-slate-950 font-black animate-pulse shadow-xs'
          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      permission: null,
    },
  ];

  const checkScrollability = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 4;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 6;
    setCanScrollLeft(!atStart);
    setCanScrollRight(!atEnd);
  };

  useEffect(() => {
    checkScrollability();
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScrollability);
    window.addEventListener('resize', checkScrollability);
    return () => {
      el.removeEventListener('scroll', checkScrollability);
      window.removeEventListener('resize', checkScrollability);
    };
  }, []);

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -260, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 260, behavior: 'smooth' });
    }
  };

  const handleSelectOption = (optionId: string) => {
    setActiveTab(optionId);
    // Smooth scroll the selected element into view
    const target = document.getElementById(`top-nav-opt-${optionId}`);
    if (target && scrollContainerRef.current) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  return (
    <div
      id="admin-top-options-nav-bar"
      className="bg-slate-900 border-b border-slate-800 shadow-md sticky top-[61px] z-25 select-none"
    >
      <div className="max-w-[1600px] mx-auto px-2 sm:px-4 py-2 flex items-center gap-1 sm:gap-2">
        {/* Left Arrow Icon Button */}
        <button
          type="button"
          id="admin-nav-scroll-left-btn"
          onClick={handleScrollLeft}
          disabled={!canScrollLeft}
          aria-label="Scroll options bar to the left"
          title="Navigate options left"
          className={`shrink-0 p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
            canScrollLeft
              ? 'bg-slate-800 hover:bg-rose-600 text-white shadow-sm border border-slate-700 active:scale-95'
              : 'bg-slate-900/60 text-slate-600 border border-slate-800 cursor-not-allowed opacity-40'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Scrollable Horizontal Options Bar */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto flex items-center gap-1.5 sm:gap-2 no-scrollbar scroll-smooth py-1 px-0.5"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {optionsList.map((opt) => {
            const Icon = opt.icon;
            const isActive = activeTab === opt.id;
            const isPermitted = !opt.permission || hasPermission(opt.permission);

            return (
              <button
                key={opt.id}
                type="button"
                id={`top-nav-opt-${opt.id}`}
                onClick={() => handleSelectOption(opt.id)}
                className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
                  isActive
                    ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-950/40 ring-2 ring-rose-400/40'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/70 hover:border-slate-600'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-white' : opt.id === 'debug' ? 'text-amber-400' : 'text-slate-400'
                  }`}
                />
                <span>{opt.label}</span>

                {!isPermitted && (
                  <span title="Restricted Permission">
                    <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                  </span>
                )}

                {opt.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold leading-tight ${
                      isActive ? 'bg-white text-rose-700 shadow-2xs' : opt.badgeColor
                    }`}
                  >
                    {opt.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Arrow Icon Button */}
        <button
          type="button"
          id="admin-nav-scroll-right-btn"
          onClick={handleScrollRight}
          disabled={!canScrollRight}
          aria-label="Scroll options bar to the right"
          title="Navigate options right"
          className={`shrink-0 p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
            canScrollRight
              ? 'bg-slate-800 hover:bg-rose-600 text-white shadow-sm border border-slate-700 active:scale-95'
              : 'bg-slate-900/60 text-slate-600 border border-slate-800 cursor-not-allowed opacity-40'
          }`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
