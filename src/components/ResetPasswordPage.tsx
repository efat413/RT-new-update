import React, { useState, useEffect } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  KeyRound,
} from 'lucide-react';
import { authApi } from '../services/authApi';
import { useStore } from '../context/StoreContext';
import { Header } from './Header';
import { Footer } from './Footer';

export const ResetPasswordPage: React.FC = () => {
  const { setIsAuthModalOpen, setAuthModalMode, setCurrentView } = useStore();

  const [token, setToken] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [tokenMissing, setTokenMissing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token') || '';
    if (!urlToken.trim()) {
      setTokenMissing(true);
      setErrorMessage('No password reset token was found in the link. Please request a new password reset.');
    } else {
      setToken(urlToken.trim());
      setTokenMissing(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!token) {
      setErrorMessage('Invalid or missing password reset token. Please request a new reset link.');
      return;
    }

    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedNew || trimmedNew.length < 6) {
      setErrorMessage('New password must be at least 6 characters long.');
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setErrorMessage('Passwords do not match. Please verify your new password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.resetPassword(token, trimmedNew);
      if (res.success) {
        setSuccessMessage(res.message || 'Your password has been successfully reset. You can now log in with your new password.');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setErrorMessage(res.message || res.error || 'Failed to reset password. The link may have expired or already been used.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'A network error occurred while resetting your password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenSignIn = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    setCurrentView('store');
    setAuthModalMode('login');
    setIsAuthModalOpen(true);
  };

  const handleRequestNewReset = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    setCurrentView('store');
    setAuthModalMode('forgot-password');
    setIsAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
      <div>
        <Header />

        <main className="max-w-md mx-auto px-4 py-12 sm:py-16">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden">
            {/* Rainbow Brand Top Accent */}
            <div className="h-2 w-full rainbow-gradient-bg" />

            <div className="p-6 sm:p-8 space-y-6">
              {/* Header Title */}
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-rose-500 via-amber-500 to-indigo-500 text-white flex items-center justify-center mx-auto shadow-md">
                  <KeyRound className="w-7 h-7" />
                </div>
                <h1 className="font-display font-extrabold text-2xl text-slate-900 tracking-tight">
                  Reset Password
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto">
                  Create a new secure password for your Rongodhonu Trade account.
                </p>
              </div>

              {/* Status Messages */}
              {errorMessage && (
                <div
                  id="reset-password-error-alert"
                  className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Reset Failed</p>
                    <p className="text-xs text-rose-600 leading-relaxed">{errorMessage}</p>
                    {tokenMissing && (
                      <button
                        type="button"
                        onClick={handleRequestNewReset}
                        className="mt-2 text-xs font-bold text-rose-800 underline hover:text-rose-950 inline-block cursor-pointer"
                      >
                        Request New Password Reset Link →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {successMessage ? (
                <div
                  id="reset-password-success-alert"
                  className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-center space-y-3 animate-fadeIn"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="font-display font-bold text-base text-emerald-900">
                    Password Reset Successful!
                  </h3>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    {successMessage}
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenSignIn}
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Sign In Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* New Password Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      New Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="new-password-input"
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        required
                        minLength={6}
                        disabled={isLoading || tokenMissing}
                        className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      Confirm New Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="confirm-password-input"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your new password"
                        required
                        minLength={6}
                        disabled={isLoading || tokenMissing}
                        className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        aria-label="Toggle confirm password visibility"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    id="submit-reset-password-btn"
                    type="submit"
                    disabled={isLoading || tokenMissing || !newPassword.trim() || !confirmPassword.trim()}
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Reset Password</span>
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={handleRequestNewReset}
                      className="text-xs text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                    >
                      Need a new reset link? Request again
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-400">
              Rongodhonu Trade Security • Cloudflare D1 PBKDF2 Encrypted
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
};
