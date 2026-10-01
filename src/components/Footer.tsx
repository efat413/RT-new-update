import React, { useState } from 'react';
import {
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  Truck,
  RotateCcw,
  Clock,
  X,
  Facebook,
  Instagram,
  Youtube,
  MessageCircle,
  Settings,
  Lock,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { BrandLogo } from './BrandLogo';
import { formatWhatsAppLink } from '../utils/phone';

export const Footer: React.FC = () => {
  const {
    settings,
    categories,
    setSelectedCategory,
    setCurrentView,
    setSearchQuery,
    setQuickViewProduct,
    setSelectedProductId,
    openAdminSettingsSection,
    isAdminLoggedIn,
    currentUser,
    setAuthModalMode,
    setIsAuthModalOpen,
  } = useStore();
  const [activePolicyModal, setActivePolicyModal] = useState<{ title: string; content: string } | null>(null);

  const footer = settings.footer || {};
  const supportPhone = footer.supportPhone || settings.phone || '';
  const cleanPhone = supportPhone.startsWith('+')
    ? '+' + supportPhone.replace(/[^0-9]/g, '')
    : supportPhone.startsWith('880')
    ? '+' + supportPhone.replace(/[^0-9]/g, '')
    : supportPhone.replace(/[^0-9]/g, '');

  const ensureExternalUrl = (url?: string): string => {
    if (!url) return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const supportWhatsApp = footer.supportWhatsApp || settings.phone || supportPhone;
  const whatsAppLink = formatWhatsAppLink(
    supportWhatsApp,
    `Hello ${settings.siteName || 'Rongdhonu Trade'}! I need assistance with an order or inquiry.`
  );
  const supportEmail = footer.supportEmail || '';
  const officeAddress = footer.officeAddress || settings.address || '';
  const aboutText = footer.aboutText || settings.bannerSubtext || '';

  const categoriesTitle = footer.categoriesTitle || 'Product Categories';
  const supportDeliveryTitle = footer.supportDeliveryTitle || 'Customer Support & Delivery';
  const whatsAppButtonText = footer.whatsAppButtonText || 'WhatsApp Live Order Assistance';
  const supportHoursText = footer.supportHoursText || 'Daily 9:00 AM – 10:00 PM (Instant Response)';

  const insideDhakaText = footer.deliveryInsideDhakaText || `Inside Dhaka Delivery: 24-48 Hours (৳${settings.insideDhakaFee || 80})`;
  const outsideDhakaText = footer.deliveryOutsideDhakaText || `Outside Dhaka Courier: 48-72 Hours (৳${settings.outsideDhakaFee || 150})`;
  const codText = footer.cashOnDeliveryText || 'Cash on Delivery (COD) Available Nationwide';
  const warrantyBadgeText =
    footer.warrantyBadgeText && footer.warrantyBadgeText !== '7-Day Return & Replacement Warranty'
      ? footer.warrantyBadgeText
      : '';

  const courierPartners = footer.courierPartners && footer.courierPartners.length > 0
    ? footer.courierPartners
    : ['Steadfast Courier', 'Pathao Courier', 'RedX Logistics', 'Paperfly Express'];
  const showCourierPartners = footer.showCourierPartners !== false;

  const copyrightText = (footer.copyrightText || `© {year} ${settings.siteName || 'Rongdhonu Trade'}. All rights reserved.`)
    .replace('{year}', new Date().getFullYear().toString());

  const privacyPolicyText = footer.privacyPolicyText || 'We respect your privacy and protect personal data strictly for order fulfillment and courier tracking in accordance with digital commerce security standards.';
  const termsOfServiceText = footer.termsOfServiceText || 'By placing an order, customers agree to provide authentic contact details and receive parcel verification calls or SMS updates from our dispatch department.';
  const returnRefundPolicyText = footer.returnRefundPolicyText || 'Enjoy a 7-day hassle-free replacement warranty for defective or damaged goods upon receipt with authentic video unboxing proof.';

  const isPrivilegedAdmin =
    isAdminLoggedIn ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'sub_admin';

  return (
    <footer id="website-footer" className="bg-slate-900 text-slate-300 pt-12 pb-8 border-t border-slate-800 mt-16 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Admin Quick Action Banner: Allows Store Admins to Edit Dynamic Footer in 1 Click */}
        {isPrivilegedAdmin && (
          <div className="mb-8 p-3.5 rounded-2xl bg-gradient-to-r from-purple-900/60 via-slate-800 to-emerald-950/60 border border-purple-500/30 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Dynamic Footer & WhatsApp Support Active</span>
                  {supportWhatsApp && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-400/20">
                      Live: {supportWhatsApp}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-400">
                  All footer texts, WhatsApp hotline number, address, delivery badges, and legal policies are editable in real-time.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openAdminSettingsSection('footer')}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Edit Footer & WhatsApp Support</span>
            </button>
          </div>
        )}

        {/* Main Footer Links: Balanced 3-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-10 pb-12 border-b border-slate-800">
          {/* Column 1: Brand & Contact Info */}
          <div className="space-y-4">
            <a
              href="/"
              onClick={(e) => {
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
                e.preventDefault();
                setCurrentView('store');
                setSelectedProductId(null);
                setSelectedCategory(null);
                setSearchQuery('');
                setQuickViewProduct(null);
                if (window.location.pathname !== '/' || window.location.search) {
                  window.history.pushState({}, '', '/');
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="cursor-pointer inline-block group"
              title={`${settings.siteName || 'Rongdhonu Trade'} - Return to homepage`}
            >
              <BrandLogo size="md" />
            </a>
            {aboutText && (
              <p className="text-xs text-slate-400 leading-relaxed">
                {aboutText}
              </p>
            )}

            {(officeAddress || supportPhone || supportEmail) && (
              <div className="space-y-2 text-xs text-slate-400 pt-1">
                {officeAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-snug">{officeAddress}</span>
                  </div>
                )}
                {supportPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <a
                      href={`tel:${cleanPhone}`}
                      className="underline decoration-slate-600 underline-offset-4 hover:text-emerald-400 hover:decoration-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 rounded-xs font-mono transition-colors"
                    >
                      {supportPhone}
                    </a>
                  </div>
                )}
                {supportEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-sky-400 shrink-0" />
                    <a
                      href={`mailto:${supportEmail}`}
                      className="underline decoration-slate-600 underline-offset-4 hover:text-sky-400 hover:decoration-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 rounded-xs transition-colors"
                    >
                      {supportEmail}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Social Links if configured */}
            {(footer.facebookUrl || footer.instagramUrl || footer.youtubeUrl) && (
              <div className="flex items-center gap-3 pt-2">
                {footer.facebookUrl && (
                  <a
                    href={ensureExternalUrl(footer.facebookUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 flex items-center justify-center transition-all"
                    title="Follow on Facebook"
                  >
                    <Facebook className="w-4 h-4" />
                  </a>
                )}
                {footer.instagramUrl && (
                  <a
                    href={ensureExternalUrl(footer.instagramUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-pink-600 hover:text-white text-slate-400 flex items-center justify-center transition-all"
                    title="Follow on Instagram"
                  >
                    <Instagram className="w-4 h-4" />
                  </a>
                )}
                {footer.youtubeUrl && (
                  <a
                    href={ensureExternalUrl(footer.youtubeUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-red-600 hover:text-white text-slate-400 flex items-center justify-center transition-all"
                    title="Subscribe on YouTube"
                  >
                    <Youtube className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Column 2: Product Categories */}
          <div className="space-y-3">
            <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">
              {categoriesTitle}
            </h3>
            <ul className="space-y-2 text-xs">
              {categories.map((cat) => (
                <li key={cat.id}>
                  <button
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setCurrentView('store');
                      const el = document.getElementById('products-feed-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="hover:text-rose-400 transition-colors text-slate-400 text-left cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                    <span>{cat.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Customer Care & Delivery Info */}
          <div className="space-y-3.5">
            <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">
              {supportDeliveryTitle}
            </h3>
            <ul className="space-y-2.5 text-xs text-slate-400">
              {supportWhatsApp && (
                <li>
                  <a
                    href={whatsAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white text-emerald-300 font-semibold transition-all inline-flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/50 shadow-sm group"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
                    <div className="text-left">
                      <span className="block text-xs font-bold leading-tight">{whatsAppButtonText}</span>
                      <span className="block text-[10px] text-emerald-400/90 font-mono">{supportWhatsApp}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 ml-1 text-emerald-400/70" />
                  </a>
                </li>
              )}
              {supportHoursText && (
                <li className="flex items-start gap-2 text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{supportHoursText}</span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{insideDhakaText}</span>
              </li>
              <li className="flex items-start gap-2">
                <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{outsideDhakaText}</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{codText}</span>
              </li>
              {warrantyBadgeText && (
                <li className="flex items-start gap-2">
                  <RotateCcw className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  <span>{warrantyBadgeText}</span>
                </li>
              )}
            </ul>

            {/* Nationwide Courier Partners */}
            {showCourierPartners && courierPartners.length > 0 && (
              <div className="pt-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Official Delivery Partners:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {courierPartners.map((partner, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-semibold"
                    >
                      {partner}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom copyright & dynamic policies */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <p>{copyrightText}</p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <button
              type="button"
              onClick={() =>
                setActivePolicyModal({
                  title: 'Privacy Policy',
                  content: privacyPolicyText,
                })
              }
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() =>
                setActivePolicyModal({
                  title: 'Terms of Service',
                  content: termsOfServiceText,
                })
              }
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Terms of Service
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() =>
                setActivePolicyModal({
                  title: 'Return & Refund Policy',
                  content: returnRefundPolicyText,
                })
              }
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Return & Refund Policy
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                if (isPrivilegedAdmin) {
                  openAdminSettingsSection('footer');
                } else {
                  setAuthModalMode('login');
                  setIsAuthModalOpen(true);
                }
              }}
              className="hover:text-purple-400 text-slate-400 transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
              title="Admin settings for Footer & WhatsApp"
            >
              <Settings className="w-3 h-3 text-purple-400" />
              <span>Footer Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Policy Modal */}
      {activePolicyModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display font-bold text-lg text-slate-900">
                {activePolicyModal.title}
              </h3>
              <button
                type="button"
                onClick={() => setActivePolicyModal(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed max-h-72 overflow-y-auto pr-2 whitespace-pre-line">
              {activePolicyModal.content}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActivePolicyModal(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};
