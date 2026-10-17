import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Send,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Trash2,
  Terminal,
  Search,
  Filter,
  Copy,
  Users,
  Zap,
  Info,
} from 'lucide-react';

interface TelemetryLogItem {
  id: string;
  recipient_psid: string;
  timestamp: string;
  reason: string;
  status: string;
  campaign_id: string;
  page_id: string;
  message_id?: string | null;
  details?: string;
}

interface DeliveryHistoryItem {
  id: string;
  page_id: string;
  recipient_psid: string;
  campaign_id: string;
  status: 'QUEUED' | 'DELIVERED' | 'FAILED' | 'AMBIGUOUS';
  message_id?: string | null;
  queued_at: string;
  delivered_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

interface BroadcasterStats {
  totalDeliveries: number;
  deliveredCount: number;
  ambiguousCount: number;
  failedCount: number;
  queuedCount: number;
}

export const AdminBroadcasterTab: React.FC = () => {
  const [pageId, setPageId] = useState('104829105829104');
  const [campaignId, setCampaignId] = useState(`camp-${new Date().toISOString().slice(0, 10)}`);
  const [messageText, setMessageText] = useState('স্বাগতম রঙধনু ট্রেড এ! আপনার অর্ডার ডেলিভারি ও বিশেষ অফার আপডেট।');
  const [rawAudienceInput, setRawAudienceInput] = useState(
    '89012345678901\n89012345678902\n89012345678903\n89012345678901\n99999999999999 {"is_bot": true}'
  );

  const [stats, setStats] = useState<BroadcasterStats>({
    totalDeliveries: 0,
    deliveredCount: 0,
    ambiguousCount: 0,
    failedCount: 0,
    queuedCount: 0,
  });

  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLogItem[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELIVERED' | 'AMBIGUOUS' | 'FAILED' | 'QUEUED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [scanSummary, setScanSummary] = useState<any>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal on new telemetry
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [telemetryLogs]);

  // Load stats and history on mount and pageId change
  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, [pageId, statusFilter]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/broadcaster/stats?pageId=${encodeURIComponent(pageId)}`);
      const data = await res.json();
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.warn('Failed to fetch broadcaster stats:', err);
    }
  };

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      let url = `/api/broadcaster/history?pageId=${encodeURIComponent(pageId)}&limit=100`;
      if (statusFilter !== 'ALL') url += `&status=${statusFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setDeliveryHistory(data.deliveries || []);
        setHistoryTotal(data.total || 0);
      }
    } catch (err) {
      console.warn('Failed to fetch delivery history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const parseAudienceInput = () => {
    const lines = rawAudienceInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.map((line) => {
      // Check for inline JSON e.g. "8901234 {"is_bot": true}"
      const jsonMatch = line.match(/^(\S+)\s*(\{.*\})$/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[2]);
          return { psid: jsonMatch[1], ...parsed };
        } catch {
          return { psid: line };
        }
      }
      return { psid: line };
    });
  };

  const handleScanAndFilter = async () => {
    setIsScanning(true);
    setSystemNotice(null);
    try {
      const recipients = parseAudienceInput();
      const res = await fetch('/api/broadcaster/scan-and-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, campaignId, recipients }),
      });
      const data = await res.json();
      if (data.success) {
        setScanSummary(data);
        const newLogs = (data.telemetryLogs || []).map((l: any, idx: number) => ({
          ...l,
          id: `scan-${Date.now()}-${idx}`,
        }));
        setTelemetryLogs((prev) => [...prev, ...newLogs]);
        setSystemNotice(
          `Pre-filter Complete: ${data.eligibleCount} eligible to queue, ${data.stats.skippedHistorical} historical suppressed, ${data.stats.skippedDuplicateInScan} scan duplicates, ${data.stats.skippedBot} bot accounts.`
        );
      } else {
        setSystemNotice(`Scan Error: ${data.error || 'Failed to scan recipients.'}`);
      }
    } catch (err: any) {
      setSystemNotice(`Scan Failure: ${err?.message || 'Network error'}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDispatch = async (simulateTimeout = false) => {
    setIsDispatching(true);
    setSystemNotice(null);
    try {
      const recipients = parseAudienceInput();
      const res = await fetch('/api/broadcaster/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          campaignId,
          messageText,
          recipients,
          simulateTimeout,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const newLogs = (data.telemetryLogs || []).map((l: any, idx: number) => ({
          ...l,
          id: `disp-${Date.now()}-${idx}`,
        }));
        setTelemetryLogs((prev) => [...prev, ...newLogs]);
        setSystemNotice(
          `Dispatch Completed: ${data.deliveredCount} Delivered, ${data.ambiguousCount} Ambiguous (Fail-Safe Locked), ${data.skippedCount} Skipped (Race-Guard / Ledger Lock).`
        );
        fetchStats();
        fetchHistory();
      } else {
        setSystemNotice(`Dispatch Error: ${data.error || 'Failed to dispatch broadcast.'}`);
      }
    } catch (err: any) {
      setSystemNotice(`Dispatch Failure: ${err?.message || 'Network error'}`);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleResetEphemeralMemory = async () => {
    if (!window.confirm('Reset Ephemeral Scan Memory?\n\nNote: Permanent delivery records (One PSID = One Message Ever) are ALWAYS protected and will NOT be deleted.')) {
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch('/api/broadcaster/reset-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId }),
      });
      const data = await res.json();
      if (data.success) {
        setSystemNotice(
          `Protected Reset Complete: ${data.clearedEphemeralRows} scan items cleared. Permanent delivery ledger intact (${data.permanentLedgerRowsProtected} delivery records locked).`
        );
        fetchStats();
        fetchHistory();
      }
    } catch (err: any) {
      setSystemNotice(`Reset error: ${err?.message || 'Failed to reset memory'}`);
    } finally {
      setIsResetting(false);
    }
  };

  const loadSampleAudience = () => {
    const sample = [
      '89012345678901',
      '89012345678902',
      '89012345678903',
      '89012345678901', // Scan Duplicate
      '89012345678904 {"is_bot": true}', // Confirmed Bot
      '89012345678905 {"account_type": "bot"}', // Confirmed Bot
      '89012345678906',
    ].join('\n');
    setRawAudienceInput(sample);
  };

  const filteredHistory = deliveryHistory.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.recipient_psid.toLowerCase().includes(q) ||
      item.campaign_id.toLowerCase().includes(q) ||
      (item.message_id && item.message_id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Security Constitution */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Radio className="w-5 h-5 animate-pulse" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-wide">
                Facebook Broadcaster
              </h2>
              <span className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                One PSID = One Message Ever
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Enforces hard database-level uniqueness <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">UNIQUE(page_id, recipient_psid)</code>,
              atomic concurrency reservation, pre-filtering against permanent D1 history, and ambiguous timeout fail-safe locking.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleResetEphemeralMemory}
              disabled={isResetting}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-rose-950/40 text-rose-300 border border-rose-800/50 hover:bg-rose-900/40 rounded-xl transition"
              title="Clears only ephemeral scan cache. Permanent delivery ledger is strictly immutable."
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Memory (Safe)
            </button>
            <button
              onClick={() => {
                fetchStats();
                fetchHistory();
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 rounded-xl transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Ledger
            </button>
          </div>
        </div>
      </div>

      {/* System Notice Toast */}
      {systemNotice && (
        <div className="bg-indigo-950/80 border border-indigo-700/50 text-indigo-200 text-xs px-4 py-3 rounded-xl flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>{systemNotice}</span>
          </div>
          <button onClick={() => setSystemNotice(null)} className="text-indigo-400 hover:text-white font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Permanent Ledger</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-display">{stats.totalDeliveries}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Total PSID Records Locked</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Delivered (Confirmed)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2 font-display">{stats.deliveredCount}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">HTTP 200 + Meta Message ID</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Ambiguous (Fail-Safe)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2 font-display">{stats.ambiguousCount}</div>
          <div className="text-[11px] text-amber-500 mt-0.5">Timeout Locked (No Retry)</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Failed Upstream</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2 font-display">{stats.failedCount}</div>
          <div className="text-[11px] text-rose-500 mt-0.5">Meta API Error Response</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>In-Flight / Queued</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-sky-400 mt-2 font-display">{stats.queuedCount}</div>
          <div className="text-[11px] text-sky-500 mt-0.5">Atomic Reservation Active</div>
        </div>
      </div>

      {/* Main Campaign Configuration & Audience Ingestion */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Parameters & Ingestion */}
        <div className="lg:col-span-6 space-y-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Zap className="w-4 h-4 text-indigo-400" />
            Campaign Dispatch & Recipient Ingestion
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Facebook Page ID</label>
              <input
                type="text"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                placeholder="104829105829104"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Campaign ID</label>
              <input
                type="text"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                placeholder="camp-eid-2026"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Message Broadcast Content</label>
            <textarea
              rows={2}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              placeholder="Type message text..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300">
                Audience PSID List (One per line, optional inline JSON bot flags)
              </label>
              <button
                type="button"
                onClick={loadSampleAudience}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                + Load Test Audience
              </button>
            </div>
            <textarea
              rows={5}
              value={rawAudienceInput}
              onChange={(e) => setRawAudienceInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              placeholder="Enter Page-Scoped IDs (one per line)..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              onClick={handleScanAndFilter}
              disabled={isScanning || isDispatching}
              className="flex-1 min-w-[140px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center justify-center gap-2 shadow-xs"
            >
              <Users className="w-4 h-4 text-indigo-400" />
              {isScanning ? 'Scanning...' : '1. Scan & Pre-Filter'}
            </button>

            <button
              onClick={() => handleDispatch(false)}
              disabled={isScanning || isDispatching}
              className="flex-1 min-w-[140px] px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20"
            >
              <Send className="w-4 h-4" />
              {isDispatching ? 'Dispatching...' : '2. Dispatch Broadcast'}
            </button>

            <button
              onClick={() => handleDispatch(true)}
              disabled={isScanning || isDispatching}
              className="px-3 py-2.5 bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 text-xs font-medium rounded-xl border border-amber-800/40 transition flex items-center gap-1.5"
              title="Simulates network timeout to demonstrate AMBIGUOUS fail-safe locking."
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Test Timeout Fail-Safe
            </button>
          </div>
        </div>

        {/* Right Panel: Live Console Telemetry Terminal */}
        <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col h-[430px] shadow-inner">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-200 tracking-wider">LIVE CONSOLE TELEMETRY</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <button
              onClick={() => setTelemetryLogs([])}
              className="text-[11px] text-slate-400 hover:text-slate-200"
            >
              Clear Log
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
            {telemetryLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
                Awaiting scan or dispatch telemetry events...
              </div>
            ) : (
              telemetryLogs.map((log) => {
                let badgeClass = 'bg-slate-800 text-slate-300';
                if (log.reason.includes('Already messaged (historical)')) {
                  badgeClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
                } else if (log.reason.includes('Duplicate in current scan')) {
                  badgeClass = 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
                } else if (log.reason.includes('Ineligible / Bot account')) {
                  badgeClass = 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
                } else if (log.reason.includes('Confirmed by Meta')) {
                  badgeClass = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
                } else if (log.reason.includes('Ambiguous network timeout')) {
                  badgeClass = 'bg-orange-500/20 text-orange-300 border border-orange-500/30';
                } else if (log.reason.includes('Upstream API error')) {
                  badgeClass = 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
                }

                return (
                  <div key={log.id} className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 leading-snug">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 font-bold">{log.recipient_psid}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${badgeClass}`}>
                        {log.reason}
                      </span>
                    </div>
                    {log.message_id && (
                      <div className="text-[10px] text-emerald-400/90 mt-0.5">
                        Meta Message ID: {log.message_id}
                      </div>
                    )}
                    {log.details && (
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {log.details}
                      </div>
                    )}
                    <div className="text-[9px] text-slate-400 mt-1">
                      {log.timestamp} • Campaign: {log.campaign_id}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>

      {/* Permanent Delivery Ledger Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Permanent D1 Delivery Ledger ({historyTotal} Total Locked PSIDs)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Strictly immutable audit ledger. One PSID can never receive more than one message across any campaign.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search PSID..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="DELIVERED">Delivered</option>
              <option value="AMBIGUOUS">Ambiguous (Locked)</option>
              <option value="FAILED">Failed</option>
              <option value="QUEUED">Queued</option>
            </select>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <th className="py-2.5 px-3">Recipient PSID</th>
                <th className="py-2.5 px-3">Campaign</th>
                <th className="py-2.5 px-3">Delivery Status</th>
                <th className="py-2.5 px-3">Meta Message ID</th>
                <th className="py-2.5 px-3">Delivered / Queued At</th>
                <th className="py-2.5 px-3">Lock Rationale / Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading delivery ledger...
                  </td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                    No delivery records in D1 ledger for current filter.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-850 transition">
                    <td className="py-2.5 px-3 font-bold text-white tracking-wider">{row.recipient_psid}</td>
                    <td className="py-2.5 px-3 text-slate-300">{row.campaign_id}</td>
                    <td className="py-2.5 px-3">
                      {row.status === 'DELIVERED' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          DELIVERED
                        </span>
                      )}
                      {row.status === 'AMBIGUOUS' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          AMBIGUOUS (LOCKED)
                        </span>
                      )}
                      {row.status === 'FAILED' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          FAILED
                        </span>
                      )}
                      {row.status === 'QUEUED' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          QUEUED
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">{row.message_id || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px] font-sans">
                      {row.delivered_at || row.queued_at}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px] max-w-xs truncate font-sans">
                      {row.error_message || 'Confirmed delivery'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
