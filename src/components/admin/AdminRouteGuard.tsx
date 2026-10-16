import React, { useState } from 'react';
import { Loader2, Mail, Lock, ShieldCheck, ArrowLeft, User } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { BrandLogo } from '../BrandLogo';
import { useStorefront } from '../../context/StorefrontContext';
import { useAuth } from '../../context/AuthContext';

export interface AdminRouteGuardProps {
  children: React.ReactNode;
}

export const AdminRouteGuard: React.FC<AdminRouteGuardProps> = ({ children }) => {
  const {
    adminUser,
    isAdminAuthenticated,
    isAdminAuthInitializing,
    adminAuthError,
    adminLogin,
    clearAdminError,
  } = useAdminAuth();

  const { setCurrentView } = useStorefront();
  const { setAuthModalMode, setIsAuthModalOpen } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Loading state while security session is being verified against the server
  if (isAdminAuthInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-white">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          <p className="text-sm font-medium text-slate-300">Verifying security session...</p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated state: Render Admin Management Portal Login
  if (!isAdminAuthenticated || !adminUser) {
    const handleLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      clearAdminError();
      setIsSubmitting(true);
      try {
        await adminLogin(username.trim(), password.trim());
      } finally {
        setIsSubmitting(false);
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
                Enter your administrative credentials (email or username) to access product controls, categories & couriers.
              </p>
            </div>

            {adminAuthError && (
              <div
                id="admin-auth-error-alert"
                className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold leading-relaxed animate-in fade-in duration-200"
              >
                {adminAuthError}
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
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                    required
                    disabled={isSubmitting}
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
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                    required
                    disabled={isSubmitting}
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
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-black disabled:bg-slate-700 text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-purple-300" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <span>Authorize & Open Admin Dashboard</span>
                )}
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
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-rose-600" />
                Regular Customer? Log in / Sign up to Store
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('store')}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center justify-center gap-1 mx-auto pt-1 cursor-pointer"
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

  // 3. Authenticated: Render protected admin dashboard
  return <>{children}</>;
};
