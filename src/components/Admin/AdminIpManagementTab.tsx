import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Ban,
  RotateCcw,
  Search,
  RefreshCw,
  Lock,
  Plus,
  AlertCircle,
  Copy,
  Calendar,
  User,
  Check,
} from 'lucide-react';
import { orderApi } from '../../services/orderApi';
import { ConfirmModal } from '../ConfirmModal';
import { copyToClipboardSafe } from '../../utils/clipboard';

export interface AdminIpManagementTabProps {
  canViewIp: boolean;
  canBlockIp: boolean;
  showNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  onRefreshOrders?: () => void;
}

export interface BlockedIpItem {
  id: string;
  ip_address: string;
  reason?: string | null;
  blocked_by?: string | null;
  blocked_at: string;
  updated_at?: string;
}

export const AdminIpManagementTab: React.FC<AdminIpManagementTabProps> = ({
  canViewIp,
  canBlockIp,
  showNotification,
  onRefreshOrders,
}) => {
  const [blockedIps, setBlockedIps] = useState<BlockedIpItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  // Manual IP block input states
  const [manualIp, setManualIp] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [validationError, setValidationError] = useState('');

  // Confirmation modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'block' | 'unblock'>('block');
  const [modalTargetIp, setModalTargetIp] = useState('');
  const [modalTargetReason, setModalTargetReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load blocked IPs list
  const loadBlockedIps = useCallback(async () => {
    if (!canViewIp && !canBlockIp) return;
    setIsLoading(true);
    try {
      const res = await orderApi.getBlockedIps();
      if (res.success && Array.isArray(res.blockedIps)) {
        setBlockedIps(res.blockedIps);
      } else {
        showNotification('error', 'Error Loading IPs', res.error || 'Failed to fetch blocked IP list.');
      }
    } catch (err: any) {
      showNotification('error', 'Network Error', err?.message || 'Failed to communicate with server.');
    } finally {
      setIsLoading(false);
    }
  }, [canViewIp, canBlockIp, showNotification]);

  useEffect(() => {
    loadBlockedIps();
  }, [loadBlockedIps]);

  // IP format validator (IPv4 or IPv6)
  const isValidIpAddress = (ip: string): boolean => {
    const trimmed = ip.trim();
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$|^:(:[0-9a-fA-F]{1,4}){1,7}$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed);
  };

  const handleInitiateManualBlock = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!canBlockIp) {
      showNotification('error', 'Permission Denied', 'You do not have permission to block customer IP addresses.');
      return;
    }

    const cleanIp = manualIp.trim();
    if (!cleanIp) {
      setValidationError('Please enter a valid IP address.');
      return;
    }

    if (!isValidIpAddress(cleanIp)) {
      setValidationError('Please enter a valid IPv4 (e.g. 103.145.24.42) or IPv6 address.');
      return;
    }

    // Check if already blocked
    if (blockedIps.some((item) => item.ip_address === cleanIp)) {
      setValidationError(`IP address ${cleanIp} is already on the active blocklist.`);
      return;
    }

    setModalMode('block');
    setModalTargetIp(cleanIp);
    setModalTargetReason(manualReason.trim());
    setIsModalOpen(true);
  };

  const handleInitiateUnblock = (ip: string) => {
    if (!canBlockIp) {
      showNotification('error', 'Permission Denied', 'You do not have permission to unblock customer IP addresses.');
      return;
    }

    setModalMode('unblock');
    setModalTargetIp(ip);
    setModalTargetReason('');
    setIsModalOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!modalTargetIp) return;
    setIsSubmitting(true);

    try {
      if (modalMode === 'block') {
        const res = await orderApi.blockIp(modalTargetIp, modalTargetReason.trim() || undefined);
        if (res.success) {
          showNotification(
            'success',
            'IP Blocked',
            `IP ${modalTargetIp} has been blocked successfully. All future order submissions from this IP will be rejected server-side.`
          );
          setManualIp('');
          setManualReason('');
          setValidationError('');
          setIsModalOpen(false);
          await loadBlockedIps();
          if (onRefreshOrders) onRefreshOrders();
        } else {
          showNotification('error', 'Block Failed', res.error || 'Failed to block IP address.');
        }
      } else {
        const res = await orderApi.unblockIp(modalTargetIp);
        if (res.success) {
          showNotification(
            'success',
            'IP Unblocked',
            `IP ${modalTargetIp} has been unblocked. Legitimate orders from this IP will be accepted normally.`
          );
          setIsModalOpen(false);
          await loadBlockedIps();
          if (onRefreshOrders) onRefreshOrders();
        } else {
          showNotification('error', 'Unblock Failed', res.error || 'Failed to unblock IP address.');
        }
      }
    } catch (err: any) {
      showNotification('error', 'Error', err?.message || 'Failed to update IP blocklist.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyIp = (ip: string) => {
    copyToClipboardSafe(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  // Filter list by search query
  const filteredList = blockedIps.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.ip_address.toLowerCase().includes(q) ||
      (item.reason && item.reason.toLowerCase().includes(q)) ||
      (item.blocked_by && item.blocked_by.toLowerCase().includes(q))
    );
  });

  if (!canViewIp && !canBlockIp) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-8 space-y-4 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Access Restricted</h3>
        <p className="text-xs text-slate-600">
          You do not have the required permission (<code>orders.view_ip</code> or <code>orders.block_ip</code>) to access the IP Management &amp; Blocklist module.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="admin-ip-management-tab">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-2xs">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">IP Management &amp; Blocklist</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                Server-Authoritative
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspect customer originating IPs, enforce network-level fraud guards, and block abusive order sources.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadBlockedIps}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Blocklist"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Ban className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Blocked IPs</span>
            <span className="text-xl font-black text-slate-900">{blockedIps.length}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Backend Enforcement</span>
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active (D1 &amp; Memory Tier)
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Your Authorization</span>
            <span className="text-xs font-bold text-slate-800">
              {canBlockIp ? 'Full Access (View, Block & Unblock)' : 'Read-Only (View IP Only)'}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Block Form (Requires orders.block_ip or Super Admin) */}
      {canBlockIp ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <Plus className="w-4 h-4 text-rose-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Manually Block Customer IP Address
            </h3>
          </div>

          <form onSubmit={handleInitiateManualBlock} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Customer IP Address (IPv4 or IPv6) *
                </label>
                <input
                  type="text"
                  value={manualIp}
                  onChange={(e) => {
                    setManualIp(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder="e.g. 103.145.24.42"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden font-mono"
                />
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Reason / Audit Note (Optional)
                </label>
                <input
                  type="text"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="e.g. Fraudulent order, fake delivery info, abuse"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-2 flex items-end">
                <button
                  type="submit"
                  id="btn-manual-block-ip"
                  className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Block IP</span>
                </button>
              </div>
            </div>

            {validationError && (
              <p className="text-xs text-rose-600 flex items-center gap-1 font-medium animate-fadeIn">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{validationError}</span>
              </p>
            )}
          </form>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            You have <code>orders.view_ip</code> access. You may inspect the active blocklist, but the <code>orders.block_ip</code> permission is required to add or remove IP blocks.
          </span>
        </div>
      )}

      {/* Search and Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by IP address, reason, admin..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
            />
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            Showing {filteredList.length} of {blockedIps.length} blocked IP{blockedIps.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/70 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Customer IP</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Reason / Notes</th>
                <th className="py-3 px-4">Blocked By</th>
                <th className="py-3 px-4">Date &amp; Time</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No Blocked IP Addresses</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {searchQuery
                        ? 'No blocked IPs match your search query.'
                        : 'There are currently no customer IPs blocked. Legitimate traffic is allowed unimpeded.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredList.map((entry) => (
                  <tr key={entry.id || entry.ip_address} className="hover:bg-slate-50/80 transition-colors">
                    {/* IP */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200">
                          {entry.ip_address}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyIp(entry.ip_address)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors cursor-pointer"
                          title="Copy IP"
                        >
                          {copiedIp === entry.ip_address ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        <ShieldAlert className="w-3 h-3 text-rose-600" />
                        Blocked
                      </span>
                    </td>

                    {/* Reason */}
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={entry.reason || 'None'}>
                      {entry.reason ? (
                        <span className="text-slate-800 font-medium">{entry.reason}</span>
                      ) : (
                        <span className="text-slate-400 italic">No reason specified</span>
                      )}
                    </td>

                    {/* Blocked By */}
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        <User className="w-3 h-3 text-slate-400" />
                        {entry.blocked_by || 'admin'}
                      </span>
                    </td>

                    {/* Blocked At */}
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {entry.blocked_at
                          ? new Date(entry.blocked_at).toLocaleString('en-US', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      {canBlockIp ? (
                        <button
                          type="button"
                          onClick={() => handleInitiateUnblock(entry.ip_address)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Unblock IP</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Read-only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={isModalOpen}
        onClose={() => {
          if (!isSubmitting) {
            setIsModalOpen(false);
          }
        }}
        onConfirm={handleConfirmAction}
        title={modalMode === 'block' ? 'Block Customer IP Address' : 'Unblock Customer IP Address'}
        message={
          modalMode === 'block'
            ? `Blocking IP address "${modalTargetIp}" will immediately reject any future public order submissions from this device or network. Are you sure you want to proceed?`
            : `Are you sure you want to unblock customer IP address "${modalTargetIp}"? Public orders from this IP will be accepted normally.`
        }
        confirmText={
          isSubmitting
            ? modalMode === 'block'
              ? 'Blocking...'
              : 'Unblocking...'
            : modalMode === 'block'
            ? 'Block IP'
            : 'Unblock IP'
        }
        cancelText="Cancel"
        variant={modalMode === 'block' ? 'danger' : 'primary'}
      >
        <div className="mt-2.5 space-y-2">
          <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
            <span className="text-slate-600 font-medium">Target IP:</span>
            <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
              {modalTargetIp}
            </span>
          </div>

          {modalMode === 'block' && modalTargetReason && (
            <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100 text-xs">
              <span className="text-rose-700 font-semibold block mb-0.5">Reason:</span>
              <span className="text-slate-800">{modalTargetReason}</span>
            </div>
          )}
        </div>
      </ConfirmModal>
    </div>
  );
};
