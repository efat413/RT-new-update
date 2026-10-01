import React from 'react';
import { OrderTrackingDropdown } from './OrderTrackingDropdown';

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
        <OrderTrackingDropdown onClose={onClose} />
      </div>
    </div>
  );
};
