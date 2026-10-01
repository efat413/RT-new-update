import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

const OrderTrackingDropdown = React.lazy(() =>
  import('./OrderTrackingDropdown').then((m) => ({ default: m.OrderTrackingDropdown }))
);

export interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Backwards-compatible wrapper that renders the right-side OrderTrackingDropdown
 */
export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-2xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Right side dropdown/panel */}
      <div className="fixed top-16 right-3 left-3 sm:left-auto sm:right-4 sm:w-[460px] max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 overflow-hidden flex flex-col animate-dropdownRight">
        <ErrorBoundary compact fallbackTitle="Order Tracking Unavailable" fallbackMessage="Could not load order tracking module.">
          <React.Suspense
            fallback={
              <div className="p-8 flex flex-col items-center justify-center space-y-3 text-slate-400">
                <div className="w-8 h-8 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
                <span className="text-xs font-semibold text-slate-500">Loading Order Tracking...</span>
              </div>
            }
          >
            <OrderTrackingDropdown onClose={onClose} />
          </React.Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};
