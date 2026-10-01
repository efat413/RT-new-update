import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';

export const ToastNotification: React.FC = () => {
  const { notification, dismissNotification } = useStore();
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!notification) {
      setIsAnimating(false);
      return;
    }

    const duration = notification.duration || 5000;
    setIsAnimating(false);

    // Start progress countdown animation on next frame
    const animFrame = requestAnimationFrame(() => {
      setIsAnimating(true);
    });

    // Auto-dismiss safely using setTimeout outside of render
    const dismissTimer = setTimeout(() => {
      dismissNotification();
    }, duration);

    return () => {
      cancelAnimationFrame(animFrame);
      clearTimeout(dismissTimer);
    };
  }, [notification?.id, notification?.duration, dismissNotification]);

  if (!notification) return null;

  const duration = notification.duration || 5000;

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-sky-500 shrink-0" />;
    }
  };

  const getThemeClasses = () => {
    switch (notification.type) {
      case 'success':
        return {
          container: 'bg-white border-emerald-200/90 shadow-emerald-500/10',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          bar: 'bg-emerald-500',
        };
      case 'error':
        return {
          container: 'bg-white border-rose-200/90 shadow-rose-500/10',
          badge: 'bg-rose-50 text-rose-700 border-rose-200',
          bar: 'bg-rose-500',
        };
      case 'warning':
        return {
          container: 'bg-white border-amber-200/90 shadow-amber-500/10',
          badge: 'bg-amber-50 text-amber-700 border-amber-200',
          bar: 'bg-amber-500',
        };
      default:
        return {
          container: 'bg-white border-sky-200/90 shadow-sky-500/10',
          badge: 'bg-sky-50 text-sky-700 border-sky-200',
          bar: 'bg-sky-500',
        };
    }
  };

  const theme = getThemeClasses();

  return (
    <aside
      aria-label="Action Confirmation Notification"
      id="action-confirmation-toast"
      className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-[999999] w-[92%] sm:w-full max-w-md pointer-events-auto"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border-2 shadow-2xl p-4 transition-all duration-300 animate-in slide-in-from-top-4 fade-in ${theme.container}`}
      >
        {/* Progress Bar */}
        <div
          className={`absolute top-0 left-0 h-1 ${theme.bar}`}
          style={{
            width: isAnimating ? '0%' : '100%',
            transition: isAnimating ? `width ${duration}ms linear` : 'none',
          }}
        />

        <div className="flex items-start gap-3 pt-0.5">
          <div className="p-1 rounded-xl bg-slate-50 border border-slate-100 shadow-2xs">
            {getIcon()}
          </div>

          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
                {notification.title}
              </h4>
            </div>
            <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
              {notification.message}
            </p>
          </div>

          <button
            type="button"
            id="toast-close-btn"
            onClick={dismissNotification}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 -mr-1 -mt-1"
            title="Dismiss notification"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
