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
  Key,
  Lock,
  Pause,
  Play,
  Square,
  Eye,
  EyeOff,
  Settings2,
  Sliders,
  FileText,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
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

interface TokenValidationInfo {
  valid: boolean;
  pageId?: string;
  pageName?: string;
  category?: string;
  permissions?: string[];
  error?: string;
}

export const AdminBroadcasterTab: React.FC = () => {
  // Campaign & Target Configuration
  const [pageId, setPageId] = useState('104829105829104');
  const [campaignId, setCampaignId] = useState(`camp-${new Date().toISOString().slice(0, 10)}`);

  // Secure Meta Page Token State
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenPreview, setTokenPreview] = useState('unconfigured');
  const [tokenStatus, setTokenStatus] = useState<'verified' | 'configured' | 'unconfigured'>('unconfigured');
  const [hasServerSecret, setHasServerSecret] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [validationResult, setValidationResult] = useState<TokenValidationInfo | null>(null);
  const [showCredentialsSection, setShowCredentialsSection] = useState(false);

  // Configurable Server Delay Settings (seconds)
  const [minDelaySec, setMinDelaySec] = useState<number>(2);
  const [maxDelaySec, setMaxDelaySec] = useState<number>(5);
  const [delayError, setDelayError] = useState<string | null>(null);

  // Multi-Template Variations separated by '|'
  const [messageTemplates, setMessageTemplates] = useState(
    'স্বাগতম {name}! রঙধনু ট্রেড এ আপনাকে স্বাগতম। আপনার অর্ডার ডেলিভারি ও বিশেষ অফার আপডেট। | ' +
    'হ্যালো {name}! রঙধনু ট্রেড এর বিশেষ ঈদ কালেকশন ও ডিসকাউন্ট এখন লাইভ। বিস্তারিত জানতে ইনবক্সে মেসেজ করুন।'
  );
  const [selectedPreviewVariation, setSelectedPreviewVariation] = useState<number>(0);
  const [testCustomerName, setTestCustomerName] = useState('আহমেদ');
  const [simulateWithoutName, setSimulateWithoutName] = useState(false);

  // Recipient Audience Input
  const [rawAudienceInput, setRawAudienceInput] = useState(
    '89012345678901 {"name": "আহমেদ"}\n' +
    '89012345678902 {"name": "রাকিব"}\n' +
    '89012345678903\n' +
    '89012345678901\n' +
    '99999999999999 {"is_bot": true}'
  );

  // Counters & Ledgers
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

  // Execution States
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [scanSummary, setScanSummary] = useState<any>(null);
  const [systemNotice, setSystemNotice] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
  } | null>(null);

  // Campaign Job State Engine (IDLE, RUNNING, PAUSED, STOPPED, COMPLETED)
  const [jobStatus, setJobStatus] = useState<'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'COMPLETED'>('IDLE');
  const [jobProgress, setJobProgress] = useState<{
    total: number;
    processed: number;
    delivered: number;
    ambiguous: number;
    failed: number;
    skipped: number;
    note?: string;
  }>({
    total: 0,
    processed: 0,
    delivered: 0,
    ambiguous: 0,
    failed: 0,
    skipped: 0,
  });

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<any>(null);

  // Auto-scroll terminal on new telemetry
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [telemetryLogs]);

  // Load config, stats, and history on mount and pageId change
  useEffect(() => {
    fetchConfig();
    fetchStats();
    fetchHistory();
    fetchJobStatus();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [pageId, statusFilter]);

  // Poll job status when running or paused
  useEffect(() => {
    if (jobStatus === 'RUNNING' || jobStatus === 'PAUSED') {
      pollIntervalRef.current = setInterval(() => {
        fetchJobStatus();
      }, 2000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [jobStatus, campaignId]);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`/api/broadcaster/config?pageId=${encodeURIComponent(pageId)}`);
      const data = await res.json();
      if (data.success && data.config) {
        setTokenPreview(data.config.tokenPreview || 'unconfigured');
        setTokenStatus(data.config.tokenStatus || 'unconfigured');
        if (data.config.minDelaySec != null) setMinDelaySec(data.config.minDelaySec);
        if (data.config.maxDelaySec != null) setMaxDelaySec(data.config.maxDelaySec);
        if (data.config.defaultMessageTemplates) {
          setMessageTemplates(data.config.defaultMessageTemplates);
        }
        setHasServerSecret(Boolean(data.config.hasServerSecret));
      }
    } catch (err) {
      console.warn('Failed to fetch broadcaster config:', err);
    }
  };

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

  const fetchJobStatus = async () => {
    try {
      const res = await fetch(`/api/broadcaster/job-status?campaignId=${encodeURIComponent(campaignId)}&pageId=${encodeURIComponent(pageId)}`);
      const data = await res.json();
      if (data.success && data.job) {
        setJobStatus(data.job.status || 'IDLE');
        setJobProgress({
          total: data.job.total_count || 0,
          processed: data.job.processed_count || 0,
          delivered: data.job.delivered_count || 0,
          ambiguous: data.job.ambiguous_count || 0,
          failed: data.job.failed_count || 0,
          skipped: data.job.skipped_count || 0,
          note: data.job.checkpoint_note || undefined,
        });
        if (data.job.status === 'RUNNING') {
          setIsDispatching(true);
        } else if (data.job.status === 'COMPLETED' || data.job.status === 'STOPPED') {
          setIsDispatching(false);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch job status:', err);
    }
  };

  // Save Token & Delay Settings
  const handleSaveConfig = async () => {
    const min = Number(minDelaySec);
    const max = Number(maxDelaySec);

    if (!Number.isFinite(min) || min < 0) {
      setDelayError('Min Delay must be a finite non-negative number of seconds.');
      return;
    }
    if (!Number.isFinite(max) || max < 0) {
      setDelayError('Max Delay must be a finite non-negative number of seconds.');
      return;
    }
    if (max < min) {
      setDelayError(`Max Delay (${max}s) cannot be less than Min Delay (${min}s).`);
      return;
    }
    if (max > 60) {
      setDelayError('Max Delay exceeds the safe ceiling of 60 seconds.');
      return;
    }
    setDelayError(null);
    setIsSavingConfig(true);

    try {
      const res = await fetch('/api/broadcaster/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          pageAccessToken: pageAccessToken.trim() || undefined,
          minDelaySec: min,
          maxDelaySec: max,
          defaultMessageTemplates: messageTemplates.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSystemNotice({
          type: 'success',
          text: 'Facebook Broadcaster configuration and credentials saved securely (AES-256-GCM encrypted).',
        });
        setPageAccessToken(''); // Purge sensitive raw token from memory immediately
        fetchConfig();
      } else {
        setSystemNotice({
          type: 'error',
          text: data.error || 'Failed to save broadcaster configuration.',
        });
      }
    } catch (err: any) {
      setSystemNotice({
        type: 'error',
        text: `Error saving config: ${err?.message || 'Network error'}`,
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Verify Page Token Connection via official Meta Graph API
  const handleVerifyToken = async () => {
    setIsVerifyingToken(true);
    setValidationResult(null);
    try {
      const res = await fetch('/api/broadcaster/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          pageAccessToken: pageAccessToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.validation) {
        setValidationResult(data.validation);
        setSystemNotice({
          type: 'success',
          text: `Meta Graph API Verified! Connected to "${data.validation.pageName}" (Page ID: ${data.validation.pageId}) with valid messaging permissions.`,
        });
        fetchConfig();
      } else {
        const errMsg = data.error || data.validation?.error || 'Token verification failed.';
        setValidationResult({ valid: false, error: errMsg });
        setSystemNotice({
          type: 'error',
          text: `Meta Verification Error: ${errMsg}`,
        });
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network error connecting to Meta Graph API';
      setValidationResult({ valid: false, error: errMsg });
      setSystemNotice({
        type: 'error',
        text: `Verification Failure: ${errMsg}`,
      });
    } finally {
      setIsVerifyingToken(false);
    }
  };

  // Parse audience textarea
  const parseAudienceInput = () => {
    const lines = rawAudienceInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.map((line) => {
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

  // Template variation helpers
  const parsedTemplates = messageTemplates
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean);

  const effectiveTemplates = parsedTemplates.length > 0 ? parsedTemplates : [messageTemplates.trim()];

  const renderTemplatePreview = (template: string, name: string | null) => {
    if (name && name.trim()) {
      return template.replace(/\{name\}/g, name.trim());
    }
    return template
      .replace(/\s*\{name\}\s*,/g, ',')
      .replace(/\s*\{name\}\s*!/g, '!')
      .replace(/\s*\{name\}\s*\./g, '.')
      .replace(/\s*\{name\}\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
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
        setSystemNotice({
          type: 'info',
          text: `Pre-filter Complete: ${data.eligibleCount} eligible to queue, ${data.stats.skippedHistorical} historical suppressed, ${data.stats.skippedDuplicateInScan} scan duplicates, ${data.stats.skippedBot} bot accounts.`,
        });
      } else {
        setSystemNotice({
          type: 'error',
          text: `Scan Error: ${data.error || 'Failed to scan recipients.'}`,
        });
      }
    } catch (err: any) {
      setSystemNotice({
        type: 'error',
        text: `Scan Failure: ${err?.message || 'Network error'}`,
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleDispatch = async (simulateTimeout = false, isResume = false) => {
    // Validate delays
    if (maxDelaySec < minDelaySec) {
      setSystemNotice({
        type: 'error',
        text: `Cannot dispatch: Max Delay (${maxDelaySec}s) is less than Min Delay (${minDelaySec}s).`,
      });
      return;
    }

    setIsDispatching(true);
    setJobStatus('RUNNING');
    setSystemNotice(null);

    try {
      const recipients = parseAudienceInput();
      setJobProgress({
        total: recipients.length,
        processed: 0,
        delivered: 0,
        ambiguous: 0,
        failed: 0,
        skipped: 0,
        note: isResume ? 'Resuming campaign execution...' : 'Starting campaign dispatch...',
      });

      const res = await fetch('/api/broadcaster/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          campaignId,
          messageText: messageTemplates,
          messageTemplates: effectiveTemplates,
          recipients,
          minDelaySec,
          maxDelaySec,
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

        setJobStatus(data.jobStatus || 'COMPLETED');
        setJobProgress({
          total: recipients.length,
          processed: data.totalProcessed,
          delivered: data.deliveredCount,
          ambiguous: data.ambiguousCount,
          failed: data.failedCount,
          skipped: data.skippedCount,
          note: data.checkpointNote,
        });

        setSystemNotice({
          type: data.jobStatus === 'PAUSED' ? 'warning' : 'success',
          text: data.jobStatus === 'PAUSED'
            ? `Campaign Paused: Safe checkpoint reached (${data.totalProcessed}/${recipients.length} processed).`
            : `Dispatch Finished: ${data.deliveredCount} Delivered, ${data.ambiguousCount} Ambiguous (Fail-Safe Locked), ${data.skippedCount} Skipped (Race-Guard / Ledger Lock).`,
        });

        fetchStats();
        fetchHistory();
      } else {
        setSystemNotice({
          type: 'error',
          text: `Dispatch Error: ${data.error || 'Failed to dispatch broadcast.'}`,
        });
        setJobStatus('IDLE');
      }
    } catch (err: any) {
      setSystemNotice({
        type: 'error',
        text: `Dispatch Failure: ${err?.message || 'Network error'}`,
      });
      setJobStatus('IDLE');
    } finally {
      setIsDispatching(false);
    }
  };

  // Real server-side Pause
  const handlePauseCampaign = async () => {
    try {
      const res = await fetch('/api/broadcaster/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      const data = await res.json();
      if (data.success) {
        setJobStatus('PAUSED');
        setSystemNotice({
          type: 'warning',
          text: `Campaign "${campaignId}" paused at safe checkpoint. Resuming will continue without repeating recipients.`,
        });
        fetchJobStatus();
      } else {
        setSystemNotice({ type: 'error', text: data.error || 'Failed to pause campaign.' });
      }
    } catch (err: any) {
      setSystemNotice({ type: 'error', text: `Failed to pause: ${err?.message}` });
    }
  };

  // Real server-side Resume
  const handleResumeCampaign = async () => {
    try {
      const res = await fetch('/api/broadcaster/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      const data = await res.json();
      if (data.success) {
        setJobStatus('RUNNING');
        setSystemNotice({
          type: 'success',
          text: `Campaign "${campaignId}" resumed. Processing next eligible recipient...`,
        });
        handleDispatch(false, true);
      } else {
        setSystemNotice({ type: 'error', text: data.error || 'Failed to resume campaign.' });
      }
    } catch (err: any) {
      setSystemNotice({ type: 'error', text: `Failed to resume: ${err?.message}` });
    }
  };

  // Real server-side Stop
  const handleStopCampaign = async () => {
    if (!window.confirm(`Are you sure you want to STOP campaign "${campaignId}"? Remaining unsent messages in this campaign will be aborted.`)) {
      return;
    }
    try {
      const res = await fetch('/api/broadcaster/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      const data = await res.json();
      if (data.success) {
        setJobStatus('STOPPED');
        setIsDispatching(false);
        setSystemNotice({
          type: 'info',
          text: `Campaign "${campaignId}" stopped by admin. Safe checkpoint recorded.`,
        });
        fetchJobStatus();
      } else {
        setSystemNotice({ type: 'error', text: data.error || 'Failed to stop campaign.' });
      }
    } catch (err: any) {
      setSystemNotice({ type: 'error', text: `Failed to stop: ${err?.message}` });
    }
  };

  const handleResetEphemeralMemory = async () => {
    if (
      !window.confirm(
        'Reset Ephemeral Scan Memory?\n\n' +
        'CRITICAL NOTE: Permanent delivery records ("One PSID = One Message Ever") are strictly protected in the D1 ledger and will NEVER be deleted or modified.\n\n' +
        'This action ONLY purges temporary scan caches and session queues.'
      )
    ) {
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
        setSystemNotice({
          type: 'info',
          text: `Protected Reset Complete: ${data.clearedEphemeralRows} transient scan rows cleared. Permanent delivery ledger intact (${data.permanentLedgerRowsProtected} delivery records permanently locked).`,
        });
        fetchStats();
        fetchHistory();
      }
    } catch (err: any) {
      setSystemNotice({
        type: 'error',
        text: `Reset error: ${err?.message || 'Failed to reset memory'}`,
      });
    } finally {
      setIsResetting(false);
    }
  };

  const loadSampleAudience = () => {
    const sample = [
      '89012345678901 {"name": "আহমেদ"}',
      '89012345678902 {"name": "রাকিব"}',
      '89012345678903',
      '89012345678901 {"name": "আহমেদ (ডুপ্লিকেট)"}', // Scan Duplicate
      '89012345678904 {"is_bot": true}', // Confirmed Bot
      '89012345678905 {"account_type": "bot"}', // Confirmed Bot
      '89012345678906 {"name": "সালমান"}',
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
      {/* Top Banner & Permanent Hard Deduplication Architecture */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Radio className="w-5 h-5 animate-pulse" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-wide">
                Facebook Broadcaster
              </h2>
              <span className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                One PSID = One Message Ever
              </span>
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                Permanent Hard Dedup Policy
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Enforces hard database-level uniqueness <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">UNIQUE(page_id, recipient_psid)</code>.
              This permanent ledger rule guarantees that no PSID ever receives a second message across any past or future campaign.
              Atomic upserts prevent race conditions, and ambiguous network timeouts fail safe without auto-retry.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setShowCredentialsSection(!showCredentialsSection)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-indigo-900/40 text-indigo-300 border border-indigo-700/50 hover:bg-indigo-800/40 rounded-xl transition shadow-xs"
            >
              <Key className="w-3.5 h-3.5" />
              {showCredentialsSection ? 'Hide Credentials' : 'Page Credentials & Delays'}
            </button>
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
                fetchJobStatus();
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 rounded-xl transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* SECURE FACEBOOK PAGE TOKEN & DELAY CONFIGURATION DRAWER / CARD */}
      {showCredentialsSection && (
        <div className="bg-slate-900 border border-indigo-700/40 rounded-2xl p-5 shadow-md space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">
                Facebook Page Access Token & Security Settings
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                AES-256-GCM Encrypted
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Current Token Status:</span>
              {tokenStatus === 'verified' && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> VERIFIED
                </span>
              )}
              {tokenStatus === 'configured' && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> CONFIGURED
                </span>
              )}
              {tokenStatus === 'unconfigured' && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> UNCONFIGURED
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Page ID */}
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Configured Facebook Page ID
              </label>
              <input
                type="text"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                placeholder="104829105829104"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                The Meta Page ID associated with your store or business.
              </p>
            </div>

            {/* Page Access Token Input */}
            <div className="md:col-span-8">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Page Access Token (Encrypted at Rest)
              </label>
              <div className="relative">
                <input
                  type={showTokenInput ? 'text' : 'password'}
                  value={pageAccessToken}
                  onChange={(e) => setPageAccessToken(e.target.value)}
                  placeholder={hasServerSecret ? `Saved Token Preview: ${tokenPreview} (Enter new token to overwrite)` : 'Paste Meta Page Access Token (starts with EAAG...)'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-10 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowTokenInput(!showTokenInput)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  title={showTokenInput ? 'Hide token' : 'Show token'}
                >
                  {showTokenInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-400 inline shrink-0" />
                Never exposed to client bundles, local storage, or logs. Resolved securely on the server via PBKDF2 AES-GCM.
              </p>
            </div>
          </div>

          {/* DELAY SETTINGS (Min Delay & Max Delay) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Configurable Server-Side Delay Settings</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Min Delay (seconds) — default: 2
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  value={minDelaySec}
                  onChange={(e) => {
                    setMinDelaySec(parseFloat(e.target.value) || 0);
                    setDelayError(null);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Max Delay (seconds) — default: 5 (Safe Ceiling: 60)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  value={maxDelaySec}
                  onChange={(e) => {
                    setMaxDelaySec(parseFloat(e.target.value) || 0);
                    setDelayError(null);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            {delayError && (
              <div className="text-xs text-rose-400 flex items-center gap-1 mt-1 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                {delayError}
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-normal">
              A random jitter delay between {minDelaySec}s and {maxDelaySec}s is enforced by the server between every eligible message dispatch.
              This prevents server concurrency spikes while strictly honoring Meta messaging platform limits.
            </p>
          </div>

          {/* Validation Info Box (if verified) */}
          {validationResult && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                validationResult.valid
                  ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-700/50 text-rose-200'
              }`}
            >
              {validationResult.valid ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Meta Graph API Connection Validated
                  </div>
                  <div>
                    <strong>Page:</strong> {validationResult.pageName} (ID: {validationResult.pageId})
                  </div>
                  {validationResult.category && (
                    <div>
                      <strong>Category:</strong> {validationResult.category}
                    </div>
                  )}
                  {validationResult.permissions && (
                    <div className="flex items-center gap-1 mt-1">
                      <strong>Permissions:</strong>
                      {validationResult.permissions.map((p) => (
                        <span key={p} className="px-1.5 py-0.5 rounded bg-emerald-900/60 border border-emerald-700/50 text-[10px] font-mono">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-rose-300">Validation Failed:</div>
                    <div className="mt-0.5 text-rose-200">{validationResult.error}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Credential Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <button
              onClick={handleVerifyToken}
              disabled={isVerifyingToken || isSavingConfig}
              className="px-3.5 py-2 text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 rounded-xl transition flex items-center gap-1.5 shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
              {isVerifyingToken ? 'Testing Graph API...' : 'Test Connection (Meta Graph API)'}
            </button>

            <button
              onClick={handleSaveConfig}
              disabled={isSavingConfig || isVerifyingToken}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              <Lock className="w-3.5 h-3.5" />
              {isSavingConfig ? 'Saving...' : 'Save Configuration & Encrypt Token'}
            </button>
          </div>
        </div>
      )}

      {/* System Notice Toast */}
      {systemNotice && (
        <div
          className={`text-xs px-4 py-3 rounded-xl flex items-center justify-between shadow-md ${
            systemNotice.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-700/50 text-emerald-200'
              : systemNotice.type === 'error'
              ? 'bg-rose-950/80 border border-rose-700/50 text-rose-200'
              : systemNotice.type === 'warning'
              ? 'bg-amber-950/80 border border-amber-700/50 text-amber-200'
              : 'bg-indigo-950/80 border border-indigo-700/50 text-indigo-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {systemNotice.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {systemNotice.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {systemNotice.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
            {systemNotice.type === 'info' && <Info className="w-4 h-4 text-indigo-400 shrink-0" />}
            <span>{systemNotice.text}</span>
          </div>
          <button onClick={() => setSystemNotice(null)} className="text-slate-400 hover:text-white font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* REAL SERVER-SIDE CAMPAIGN JOB CONTROLS (Pause, Resume, Stop) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
              <Zap className="w-4 h-4 text-indigo-400" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-wide">
                  Campaign Engine State:
                </span>
                {jobStatus === 'RUNNING' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                    RUNNING
                  </span>
                )}
                {jobStatus === 'PAUSED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                    <Pause className="w-3 h-3 text-amber-400" />
                    PAUSED AT CHECKPOINT
                  </span>
                )}
                {jobStatus === 'STOPPED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
                    <Square className="w-3 h-3 text-rose-400" />
                    STOPPED
                  </span>
                )}
                {jobStatus === 'COMPLETED' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    COMPLETED
                  </span>
                )}
                {jobStatus === 'IDLE' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    IDLE / READY
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Active Campaign ID: <code className="text-indigo-300 font-mono">{campaignId}</code>
                {jobProgress.note && <span className="ml-2 text-slate-500 font-sans">• {jobProgress.note}</span>}
              </div>
            </div>
          </div>

          {/* Job Control Buttons */}
          <div className="flex items-center gap-2">
            {jobStatus === 'RUNNING' && (
              <button
                onClick={handlePauseCampaign}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 rounded-xl transition flex items-center gap-1.5"
                title="Pause dispatch at next safe recipient boundary"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            )}

            {jobStatus === 'PAUSED' && (
              <button
                onClick={handleResumeCampaign}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-xl transition flex items-center gap-1.5"
                title="Resume dispatch from current checkpoint"
              >
                <Play className="w-3.5 h-3.5" />
                Resume
              </button>
            )}

            {(jobStatus === 'RUNNING' || jobStatus === 'PAUSED') && (
              <button
                onClick={handleStopCampaign}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 rounded-xl transition flex items-center gap-1.5"
                title="Gracefully abort remaining recipients"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar during Campaign Execution */}
        {jobProgress.total > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Progress: {jobProgress.processed} / {jobProgress.total} recipients (
                {Math.round((jobProgress.processed / jobProgress.total) * 100)}%)
              </span>
              <span className="space-x-2 text-[10px]">
                <span className="text-emerald-400">✓ {jobProgress.delivered} Delivered</span>
                <span className="text-amber-400">⚠ {jobProgress.ambiguous} Ambiguous</span>
                <span className="text-rose-400">✕ {jobProgress.failed} Failed</span>
                <span className="text-slate-400">⏭ {jobProgress.skipped} Skipped</span>
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  jobStatus === 'PAUSED'
                    ? 'bg-amber-500'
                    : jobStatus === 'STOPPED'
                    ? 'bg-rose-500'
                    : 'bg-indigo-500'
                }`}
                style={{
                  width: `${Math.min(100, Math.round((jobProgress.processed / jobProgress.total) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

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
        {/* Left Form: Parameters, Message Variations & Ingestion */}
        <div className="lg:col-span-6 space-y-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Zap className="w-4 h-4 text-indigo-400" />
            Campaign Dispatch & Template Variations
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

          {/* MESSAGE TEMPLATES (Separated by '|') */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                Message Variations (Separate templates with <code className="bg-slate-800 text-indigo-300 px-1 rounded">|</code>)
              </label>
              <span className="text-[11px] text-indigo-400 font-medium">
                {effectiveTemplates.length} Variation{effectiveTemplates.length > 1 ? 's' : ''} detected
              </span>
            </div>

            <textarea
              rows={3}
              value={messageTemplates}
              onChange={(e) => setMessageTemplates(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
              placeholder="Template 1 text with {name} | Template 2 variation with {name} | ..."
            />

            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Supports dynamic <code className="text-amber-300">{"{name}"}</code> substitution (cleanly omitted when recipient name is unavailable).</span>
            </div>
          </div>

          {/* INTERACTIVE SAFE PREVIEW DRAWER */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Safe Message Preview & Unicode Length Guard
              </span>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-slate-400 flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simulateWithoutName}
                    onChange={(e) => setSimulateWithoutName(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                  />
                  Preview without name
                </label>
              </div>
            </div>

            {/* Variation Selection Tabs */}
            {effectiveTemplates.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {effectiveTemplates.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedPreviewVariation(idx)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition ${
                      selectedPreviewVariation === idx
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Variation #{idx + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Rendered Text Preview */}
            {(() => {
              const activeTemplate = effectiveTemplates[selectedPreviewVariation] || effectiveTemplates[0] || '';
              const renderedPreview = renderTemplatePreview(
                activeTemplate,
                simulateWithoutName ? null : testCustomerName
              );
              const charCount = Array.from(renderedPreview).length;
              const isOverLimit = charCount > 2000;

              return (
                <div className="space-y-1.5">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                    {renderedPreview || <span className="text-slate-500 italic">No message text entered...</span>}
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">
                      Sample Recipient Name:{' '}
                      <input
                        type="text"
                        value={testCustomerName}
                        onChange={(e) => setTestCustomerName(e.target.value)}
                        disabled={simulateWithoutName}
                        className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white w-20 ml-1 inline"
                      />
                    </span>
                    <span className={`font-mono font-semibold ${isOverLimit ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {charCount} / 2000 chars (Unicode / Bangla Safe)
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* AUDIENCE INPUT */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300">
                Audience PSID List (One per line, optional inline JSON name/bot flags)
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
              rows={4}
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

          <p className="text-[11px] text-slate-400 text-center pt-1">
            ⚠️ Restricted strictly to eligible recipients and messaging use cases permitted under Meta Platform Policies.
          </p>
        </div>

        {/* Right Panel: Live Console Telemetry Terminal */}
        <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col h-[520px] shadow-inner">
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
                    <div className="text-[9px] text-slate-500 mt-1">
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
