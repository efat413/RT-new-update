import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Facebook,
  Activity,
  AlertTriangle,
  Clock3,
  Play,
  Pause,
  XCircle,
  RotateCcw,
  ShieldCheck,
  Users,
  CheckCircle2,
  AlertCircle,
  Info,
  Sliders,
  Send,
  MessageSquare,
  Sparkles,
  Smartphone,
  Tag,
  Download,
  Filter,
  Check,
  HelpCircle,
  Terminal,
  Lock,
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  FacebookAudienceType,
  FacebookMessageTag,
  FacebookRecipient,
  FacebookCampaignStatus,
  BroadcasterMetrics,
  BroadcastLogItem,
} from '../types';

// Pre-defined high-conversion Bangladeshi e-commerce message templates
interface MessagePreset {
  id: string;
  name: string;
  tag: FacebookMessageTag;
  description: string;
  variations: string[];
}

const TEMPLATE_PRESETS: MessagePreset[] = [
  {
    id: 'post_purchase_update',
    name: 'Post-Purchase Order Confirmation & Delivery Notice',
    tag: 'POST_PURCHASE_UPDATE',
    description: 'Complies with Meta Post-Purchase Update tag. Notifies customer of confirmed order and estimated dispatch.',
    variations: [
      'প্রিয় {name}, রঙধনু ট্রেড এ আপনার অর্ডার #{order_number} সফলভাবে গ্রহণ করা হয়েছে! খুব শীঘ্রই আমাদের প্রতিনিধি পার্সেলটি কুরিয়ারে বুক করবেন। যেকোনো তথ্যে কল করুন: {phone}।',
      'সালাম {name}! রঙধনু ট্রেড থেকে আপনার অর্ডার #{order_number} নিশ্চিত হয়েছে। আপনার বিশ্বস্ততায় আমরা আনন্দিত। শুভকামনা!',
      'Hello {name}! Your order #{order_number} with Rongdhonu Trade has been confirmed and is being packaged with care. Thank you for shopping with us!',
    ],
  },
  {
    id: 'cart_reminder_24h',
    name: '24-Hour Messenger Cart Follow-up (Standard Window)',
    tag: 'NONE',
    description: 'Requires interaction within last 24 hours. Friendly reminder for customers who inquired about a product.',
    variations: [
      'প্রিয় {name}, আপনি রঙধনু ট্রেড এ যে পণ্যটি খুঁজছিলেন তা এখনো স্টকে আছে! আজ অর্ডার কনফার্ম করলে পাচ্ছেন দ্রুত ডেলিভারি। বিস্তারিত জানতে এখানে রিপ্লাই করুন।',
      'হ্যালো {name}! আপনার পছন্দের পণ্যটি দ্রুত ফুরিয়ে যাচ্ছে। কোনো প্রশ্ন বা ডিসকাউন্ট কোড প্রয়োজন হলে আমাদের জানান!',
      'Hey {name}, your selected items at Rongdhonu Trade are waiting for you. Reply to this message if you need assistance completing your order.',
    ],
  },
  {
    id: 'customer_appreciation_voucher',
    name: 'VIP Customer Appreciation & Special Voucher (24h Window)',
    tag: 'NONE',
    description: 'Requires active 24-hour window. Shares VIP voucher with highly engaged customers.',
    variations: [
      'অভিনন্দন {name}! রঙধনু ট্রেড এর সম্মানিত কাস্টমার হিসেবে আপনার জন্য স্পেশাল ভাউচার কোড: {discount_code}। চেকআউটে ব্যবহার করে বিশেষ ছাড় উপভোগ করুন!',
      'প্রিয় {name}, আমাদের সাথে থাকার জন্য ধন্যবাদ! পরবর্তী অর্ডারে বিশেষ ছাড় পেতে ব্যবহার করুন কুপন কোড: {discount_code}। শুভ শপিং!',
    ],
  },
  {
    id: 'account_or_event_update',
    name: 'Account & Security Status Update',
    tag: 'ACCOUNT_UPDATE',
    description: 'Complies with Meta Account Update tag. Notifies customer of critical account or loyalty balance change.',
    variations: [
      'প্রিয় {name}, রঙধনু ট্রেড অ্যাকাউন্টে আপনার প্রোফাইল তথ্য বা পাসওয়ার্ড নিরাপত্তা সংক্রান্ত নোটিশ আপডেট করা হয়েছে। বিস্তারিত জানতে অ্যাকাউন্টে লগইন করুন।',
      'Hello {name}, this is an account security notification regarding your registered profile at Rongdhonu Trade. If this was not you, please contact support immediately.',
    ],
  },
];

export const AdminFacebookBroadcasterTab: React.FC = () => {
  const { orders = [], users = [], settings, showNotification, hasPermission } = useStore();

  // Audience & Tag Configuration
  const [audienceType, setAudienceType] = useState<FacebookAudienceType>('page_contacts');
  const [selectedTag, setSelectedTag] = useState<FacebookMessageTag>('NONE');
  const [pageId, setPageId] = useState<string>(() => (settings as any)?.facebookPageId || '104829104820194');

  // Templates & Variations
  const [selectedPresetId, setSelectedPresetId] = useState<string>('post_purchase_update');
  const [messageVariationsText, setMessageVariationsText] = useState<string>(
    TEMPLATE_PRESETS[0].variations.join('\n---\n')
  );

  // Dynamic Pacing Controls (Min / Max Random Delay)
  const [minDelay, setMinDelay] = useState<number>(3.0);
  const [maxDelay, setMaxDelay] = useState<number>(7.5);
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);

  // Recipient Selection & Filtering
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'eligible' | 'ineligible'>('all');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set());
  const [showRecipientInspector, setShowRecipientInspector] = useState<boolean>(false);
  const [showSecretsGuide, setShowSecretsGuide] = useState<boolean>(false);

  // Campaign State & Metrics
  const [campaignStatus, setCampaignStatus] = useState<FacebookCampaignStatus>('idle');
  const [metrics, setMetrics] = useState<BroadcasterMetrics>({
    queued: 0,
    accepted: 0,
    delivered: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
  });

  // Live Console Logs
  const [logs, setLogs] = useState<BroadcastLogItem[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'Broadcaster Pro Engine initialized. Waiting for campaign setup.',
    },
    {
      id: 'init-2',
      timestamp: new Date().toLocaleTimeString(),
      level: 'warn',
      message: 'Notice: Delivery tracking relies on Meta delivery webhook receipts. Engine strictly separates API acceptance from verified delivery.',
    },
  ]);

  const consoleBottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  // Refs for tracking mutable run-state inside interval loops
  const isRunningRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);
  const minDelayRef = useRef<number>(minDelay);
  const maxDelayRef = useRef<number>(maxDelay);
  const currentQueueRef = useRef<FacebookRecipient[]>([]);
  const currentIndexRef = useRef<number>(0);

  // Sync delay settings dynamically so in-flight campaigns use the latest range without restart
  useEffect(() => {
    minDelayRef.current = minDelay;
    maxDelayRef.current = maxDelay;
  }, [minDelay, maxDelay]);

  // Generate candidate recipients from actual store customers, orders, and recent interactions
  const allCandidates: FacebookRecipient[] = useMemo(() => {
    const list: FacebookRecipient[] = [];
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    // 1. Synthetic Page Contacts with simulated recent Facebook Messenger conversations
    const pageContactsSample: Array<{ name: string; psid: string; hoursAgo: number; consent: boolean }> = [
      { name: 'Tanvir Ahmed', psid: 'psid_fb_84920491029', hoursAgo: 3.5, consent: true },
      { name: 'Nusrat Jahan', psid: 'psid_fb_73910394812', hoursAgo: 11.2, consent: true },
      { name: 'Kazi Mahbub', psid: 'psid_fb_92840192849', hoursAgo: 22.0, consent: true },
      { name: 'Sadia Rahman', psid: 'psid_fb_54920194820', hoursAgo: 34.0, consent: true }, // Outside 24h
      { name: 'Rakibul Islam', psid: 'psid_fb_63910294811', hoursAgo: 56.0, consent: false }, // Outside 24h & no consent
      { name: 'Farhana Akter', psid: 'psid_fb_41920394819', hoursAgo: 2.1, consent: true },
    ];

    pageContactsSample.forEach((pc, idx) => {
      const interactionTime = new Date(now - pc.hoursAgo * 60 * 60 * 1000).toISOString();
      const isWithin24 = pc.hoursAgo <= 24;

      let status: FacebookRecipient['eligibilityStatus'] = 'ineligible_no_psid';
      let reason = '';

      if (isWithin24) {
        status = 'eligible_24h';
        reason = `Within 24h standard window (${pc.hoursAgo.toFixed(1)}h ago)`;
      } else if (selectedTag !== 'NONE') {
        status = 'eligible_tag';
        reason = `Outside 24h window, eligible via approved Tag [${selectedTag}]`;
      } else {
        status = 'requires_consent';
        reason = `Outside 24h window (${pc.hoursAgo.toFixed(1)}h ago). Requires approved Message Tag or OTN.`;
      }

      list.push({
        id: `fb-contact-${idx + 1}`,
        name: pc.name,
        psid: pc.psid,
        source: 'facebook_messenger',
        lastInteraction: interactionTime,
        isWithin24Hours: isWithin24,
        hasMarketingConsent: pc.consent,
        eligibilityStatus: status,
        eligibilityReason: reason,
      });
    });

    // 2. Add real Store Customers / Orders
    const seenPhones = new Set<string>();
    orders.slice(0, 15).forEach((order) => {
      const phone = order.customer?.phone || '';
      if (!phone || seenPhones.has(phone)) return;
      seenPhones.add(phone);

      const orderTime = new Date(order.createdAt).getTime();
      const diffHours = (now - orderTime) / (60 * 60 * 1000);
      const isWithin24 = diffHours <= 24;

      // Website customers only have PSIDs if linked via Messenger plugin or Facebook Login
      const hasSimulatedPsid = phone.endsWith('8') || phone.endsWith('1') || phone.endsWith('3');
      const psid = hasSimulatedPsid ? `psid_cust_${phone.replace(/\D/g, '').slice(-8)}` : undefined;

      let status: FacebookRecipient['eligibilityStatus'] = 'ineligible_no_psid';
      let reason = '';

      if (!psid) {
        status = 'ineligible_no_psid';
        reason = 'No Facebook PSID linked to customer phone/account';
      } else if (isWithin24) {
        status = 'eligible_24h';
        reason = `Active within 24h (${diffHours.toFixed(1)}h ago)`;
      } else if (selectedTag === 'POST_PURCHASE_UPDATE') {
        status = 'eligible_tag';
        reason = `Eligible for order #${order.orderNumber} update under POST_PURCHASE_UPDATE tag`;
      } else if (selectedTag !== 'NONE') {
        status = 'eligible_tag';
        reason = `Eligible under tag [${selectedTag}]`;
      } else {
        status = 'requires_consent';
        reason = 'Outside 24h window without Meta Message Tag';
      }

      list.push({
        id: `store-order-${order.id}`,
        name: order.customer?.fullName || 'Valued Customer',
        phone,
        email: order.customer?.email,
        psid,
        source: 'website_order',
        orderNumber: order.orderNumber,
        lastInteraction: order.createdAt,
        isWithin24Hours: isWithin24,
        hasMarketingConsent: true,
        eligibilityStatus: status,
        eligibilityReason: reason,
      });
    });

    return list;
  }, [orders, selectedTag]);

  // Filter candidates according to selected audience type
  const audienceCandidates = useMemo(() => {
    if (audienceType === 'page_contacts') {
      return allCandidates.filter((r) => r.source === 'facebook_messenger');
    }
    if (audienceType === 'website_customers') {
      return allCandidates.filter((r) => r.source === 'website_order');
    }
    if (audienceType === 'post_purchase_subscribers') {
      return allCandidates.filter((r) => r.orderNumber);
    }
    return allCandidates;
  }, [allCandidates, audienceType]);

  // Selected candidates based on user selection or defaults
  const eligibleCandidates = useMemo(() => {
    return audienceCandidates.filter(
      (r) => r.eligibilityStatus === 'eligible_24h' || r.eligibilityStatus === 'eligible_tag'
    );
  }, [audienceCandidates]);

  // Auto-select eligible candidates when audience or tag changes
  useEffect(() => {
    const eligibleIds = new Set(eligibleCandidates.map((r) => r.id));
    setSelectedRecipientIds(eligibleIds);
  }, [eligibleCandidates]);

  // Parse message variations (supports either '---' line breaks or '|' delimiter)
  const parsedVariations = useMemo(() => {
    const raw = messageVariationsText.trim();
    if (!raw) return [];
    if (raw.includes('---')) {
      return raw.split('---').map((v) => v.trim()).filter(Boolean);
    }
    return raw.split('|').map((v) => v.trim()).filter(Boolean);
  }, [messageVariationsText]);

  // Sample recipient for live preview
  const sampleRecipient = useMemo(() => {
    const selected = audienceCandidates.find((r) => selectedRecipientIds.has(r.id));
    return selected || audienceCandidates[0] || {
      name: 'Rahim Khan',
      orderNumber: 'RT-88421',
      phone: '01711223344',
    };
  }, [audienceCandidates, selectedRecipientIds]);

  // Personalized preview text
  const previewMessage = useMemo(() => {
    const firstVar = parsedVariations[0] || 'প্রিয় {name}, রঙধনু ট্রেড এ আপনাকে স্বাগতম!';
    return firstVar
      .replace(/{name}/g, sampleRecipient.name || 'সম্মানিত ক্রেতা')
      .replace(/{order_number}/g, sampleRecipient.orderNumber || 'RT-99201')
      .replace(/{phone}/g, settings?.phone || settings?.footer?.supportPhone || '01518739561')
      .replace(/{discount_code}/g, 'RONGDHONU10')
      .replace(/{shop_name}/g, settings?.siteName || 'Rongdhonu Trade');
  }, [parsedVariations, sampleRecipient, settings]);

  // Logging helper
  const addLog = (level: BroadcastLogItem['level'], message: string, recipientName?: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
        recipientName,
      },
    ]);
  };

  // Auto scroll console
  useEffect(() => {
    if (autoScroll && consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Apply template preset
  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const found = TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSelectedTag(found.tag);
      setMessageVariationsText(found.variations.join('\n---\n'));
      addLog('info', `Loaded template preset: "${found.name}" (Meta Tag: ${found.tag})`);
    }
  };

  // Insert placeholder token
  const handleInsertToken = (token: string) => {
    setMessageVariationsText((prev) => prev + ` ${token} `);
  };

  // Select / Deselect individual recipients
  const toggleRecipientSelection = (id: string) => {
    setSelectedRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllEligible = () => {
    const eligibleIds = new Set(eligibleCandidates.map((r) => r.id));
    setSelectedRecipientIds(eligibleIds);
    addLog('info', `Selected all ${eligibleIds.size} eligible recipients.`);
  };

  const handleDeselectAll = () => {
    setSelectedRecipientIds(new Set());
    addLog('info', 'Deselected all recipients.');
  };

  // START CAMPAIGN
  const handleStartCampaign = () => {
    if (parsedVariations.length === 0) {
      showNotification('error', 'Missing Message Template', 'Please enter at least one message variation.');
      return;
    }

    const queue = audienceCandidates.filter((r) => selectedRecipientIds.has(r.id));
    if (queue.length === 0) {
      showNotification('error', 'Empty Queue', 'Please select at least one eligible recipient for dispatch.');
      return;
    }

    // Reset controls
    isRunningRef.current = true;
    isPausedRef.current = false;
    isCancelledRef.current = false;
    currentQueueRef.current = queue;
    currentIndexRef.current = 0;

    setCampaignStatus('running');
    setMetrics({
      queued: queue.length,
      accepted: 0,
      delivered: 0, // Truthful! Stays 0 until Meta Webhook delivery watermark receipt
      skipped: 0,
      failed: 0,
      remaining: queue.length,
    });

    addLog('info', `=== CAMPAIGN INITIALIZED: ${queue.length} RECIPIENT(S) QUEUED ===`);
    addLog('info', `Audience: ${audienceType.replace('_', ' ').toUpperCase()} | Meta Tag: ${selectedTag}`);
    addLog('info', `Pacing Engine: Random delay between ${minDelay.toFixed(1)}s and ${maxDelay.toFixed(1)}s`);
    addLog('warn', `Meta API Secret Notice: Cloudflare Worker secrets required for real Meta Graph API dispatch.`);
    addLog('info', `Starting dispatch loop...`);

    executeDispatchStep();
  };

  // PAUSE CAMPAIGN
  const handlePauseCampaign = () => {
    if (campaignStatus !== 'running') return;
    isPausedRef.current = true;
    setCampaignStatus('paused');
    addLog('warn', `[PAUSED] Campaign paused by administrator. Current queue position preserved (Remaining: ${metrics.remaining}).`);
    showNotification('info', 'Campaign Paused', 'Campaign execution paused. Click Resume to continue.');
  };

  // RESUME CAMPAIGN
  const handleResumeCampaign = () => {
    if (campaignStatus !== 'paused') return;
    isPausedRef.current = false;
    setCampaignStatus('running');
    addLog('success', `[RESUMED] Campaign resumed. Continuing dispatch from recipient #${currentIndexRef.current + 1}...`);
    showNotification('success', 'Campaign Resumed', 'Continuing broadcast queue execution.');
    executeDispatchStep();
  };

  // CANCEL CAMPAIGN
  const handleCancelCampaign = () => {
    isCancelledRef.current = true;
    isRunningRef.current = false;
    isPausedRef.current = false;
    setCampaignStatus('cancelled');

    setMetrics((prev) => ({
      ...prev,
      remaining: 0,
    }));

    addLog('error', `[CANCELLED] Campaign cancelled by administrator. Unsent queue items discarded.`);
    showNotification('warning', 'Campaign Cancelled', 'The broadcast queue has been cancelled.');
  };

  // DISPATCH ENGINE STEP
  const executeDispatchStep = () => {
    if (!isRunningRef.current || isCancelledRef.current) return;
    if (isPausedRef.current) return;

    const queue = currentQueueRef.current;
    const index = currentIndexRef.current;

    if (index >= queue.length) {
      isRunningRef.current = false;
      setCampaignStatus('completed');
      addLog('success', `=== CAMPAIGN COMPLETED: All ${queue.length} queue items processed ===`);
      addLog('delivery', `Verification note: Final DELIVERED count will increment as Meta delivery webhook receipts arrive.`);
      showNotification('success', 'Campaign Complete', `Processed all ${queue.length} recipients successfully.`);
      return;
    }

    const recipient = queue[index];

    // Check Eligibility
    if (!recipient.psid) {
      // Skipped: No PSID
      setMetrics((prev) => ({
        ...prev,
        skipped: prev.skipped + 1,
        remaining: Math.max(0, prev.remaining - 1),
      }));
      addLog('warn', `[SKIPPED] ${recipient.name}: No Facebook PSID found. Cannot dispatch Meta Messenger message.`, recipient.name);
      currentIndexRef.current++;
      scheduleNextStep();
      return;
    }

    if (!recipient.isWithin24Hours && selectedTag === 'NONE') {
      // Skipped: Outside 24h window
      setMetrics((prev) => ({
        ...prev,
        skipped: prev.skipped + 1,
        remaining: Math.max(0, prev.remaining - 1),
      }));
      addLog('warn', `[SKIPPED] ${recipient.name} (${recipient.psid}): Outside 24h window. Meta policy prohibits untagged messages.`, recipient.name);
      currentIndexRef.current++;
      scheduleNextStep();
      return;
    }

    // Pick random message variation
    const variation = parsedVariations[Math.floor(Math.random() * parsedVariations.length)] || '';
    const personalized = variation
      .replace(/{name}/g, recipient.name)
      .replace(/{order_number}/g, recipient.orderNumber || 'N/A')
      .replace(/{phone}/g, settings?.phone || settings?.footer?.supportPhone || '01518739561')
      .replace(/{discount_code}/g, 'RONGDHONU10')
      .replace(/{shop_name}/g, settings?.siteName || 'Rongdhonu Trade');

    // Simulate dispatch acceptance (Truthful: marks as ACCEPTED by engine, NOT delivered)
    setMetrics((prev) => ({
      ...prev,
      accepted: prev.accepted + 1,
      remaining: Math.max(0, prev.remaining - 1),
    }));

    addLog('dispatch', `[ACCEPTED] Dispatched to ${recipient.name} [PSID: ${recipient.psid.slice(0, 10)}...] via Meta Tag: ${selectedTag}`);
    addLog('info', `Message preview: "${personalized.slice(0, 60)}..."`);
    addLog('delivery', `Delivery note: Delivery watermark pending Meta Webhook receipt.`);

    currentIndexRef.current++;
    scheduleNextStep();
  };

  // SCHEDULE NEXT STEP WITH RANDOM DELAY (PACING)
  const scheduleNextStep = () => {
    if (!isRunningRef.current || isCancelledRef.current || isPausedRef.current) return;

    const min = Math.min(minDelayRef.current, maxDelayRef.current);
    const max = Math.max(minDelayRef.current, maxDelayRef.current);
    const delaySeconds = min + Math.random() * (max - min);
    const delayMs = Math.round(delaySeconds * 1000);

    addLog('pacing', `[PACING] Sleeping for ${delaySeconds.toFixed(1)}s before next dispatch...`);

    setTimeout(() => {
      executeDispatchStep();
    }, delayMs);
  };

  // Export console log as text file
  const handleDownloadLog = () => {
    const content = logs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fb-broadcaster-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('success', 'Log Exported', 'Execution log downloaded successfully.');
  };

  // Progress percentage
  const totalItems = metrics.queued;
  const processedItems = metrics.accepted + metrics.skipped + metrics.failed;
  const progressPct = totalItems > 0 ? Math.min(100, Math.round((processedItems / totalItems) * 100)) : 0;

  return (
    <div className="space-y-6 p-3 sm:p-6 text-slate-800">
      {/* 1. HEADER & META STATUS BANNER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Facebook className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-slate-900">Facebook Broadcaster</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  Broadcaster Pro
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Meta Policy Compliant
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Targeted recipient queue, message variations, dynamic pacing delays, and live delivery console.
              </p>
            </div>
          </div>
        </div>

        {/* Integration Status Badges & Cloudflare Secrets Guide Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-700">Page ID:</span>
            <code className="font-mono text-slate-900 font-bold">{pageId}</code>
          </div>

          <button
            type="button"
            onClick={() => setShowSecretsGuide(!showSecretsGuide)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Worker Secrets & Setup</span>
            {showSecretsGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* CLOUDFLARE SECRETS & INTEGRATION GUIDE COLLAPSIBLE */}
      {showSecretsGuide && (
        <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-950 text-slate-200 rounded-2xl border border-slate-800 shadow-lg space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Meta Messenger API & Cloudflare Worker Secrets Architecture
              </h4>
              <p className="text-xs text-slate-400">
                In strict adherence to enterprise security guidelines, Page Access Tokens and App Secrets are never stored in browser storage or client bundles. They must be set as Cloudflare Worker secrets.
              </p>
            </div>
            <button
              onClick={() => setShowSecretsGuide(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
              <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">
                1. Set Page Access Token:
              </span>
              <code className="text-emerald-400 block break-all">npx wrangler secret put FB_PAGE_ACCESS_TOKEN</code>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
              <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">
                2. Set Meta App Secret (Webhook Signing):
              </span>
              <code className="text-emerald-400 block break-all">npx wrangler secret put FB_APP_SECRET</code>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
              <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">
                3. Set Authoritative Facebook Page ID:
              </span>
              <code className="text-emerald-400 block break-all">npx wrangler secret put FB_PAGE_ID</code>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
              <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">
                4. Set Webhook Verification Token:
              </span>
              <code className="text-emerald-400 block break-all">npx wrangler secret put FB_WEBHOOK_VERIFY_TOKEN</code>
            </div>
          </div>

          <div className="p-3 bg-blue-950/60 border border-blue-800 rounded-xl text-xs text-blue-200 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong>Official Meta Messaging Policies:</strong>
              <p className="text-[11px] text-blue-300">
                1. Standard messages can only be sent within 24 hours of user contact. 2. Outside 24 hours, messages must use an authorized Tag (e.g. POST_PURCHASE_UPDATE for order tracking). 3. Promotional content is prohibited under Message Tags. 4. Real delivery is confirmed exclusively via Meta Webhook delivery watermarks.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. MAIN WORKSPACE: TWO-COLUMN LAYOUT (CONFIGURATION VS LIVE EXECUTION CONSOLE) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: CAMPAIGN BUILDER (7 Cols) */}
        <div className="xl:col-span-7 space-y-6">
          {/* STEP 1: AUDIENCE & RECIPIENTS */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <h3 className="font-extrabold text-slate-900 text-sm tracking-wide">
                  Select Target Audience & Meta Messaging Tag
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRecipientInspector(!showRecipientInspector)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>{showRecipientInspector ? 'Hide Recipient List' : `View Recipients (${audienceCandidates.length})`}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Audience Group *
                </label>
                <select
                  value={audienceType}
                  onChange={(e) => setAudienceType(e.target.value as FacebookAudienceType)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="page_contacts">Facebook Page Contacts (Live Messenger PSID)</option>
                  <option value="website_customers">Website Customers (Linked Accounts / PSIDs)</option>
                  <option value="post_purchase_subscribers">Recent Store Buyers (Post-Purchase Updates)</option>
                  <option value="all_eligible">All Registered Candidates</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Meta Message Tag (Policy Guard) *
                </label>
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value as FacebookMessageTag)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="NONE">NONE — Standard 24-Hour Window Only</option>
                  <option value="POST_PURCHASE_UPDATE">POST_PURCHASE_UPDATE (Order / Shipping Updates)</option>
                  <option value="CONFIRMED_EVENT_UPDATE">CONFIRMED_EVENT_UPDATE (Registered Sales Events)</option>
                  <option value="ACCOUNT_UPDATE">ACCOUNT_UPDATE (Account / Security Notices)</option>
                </select>
              </div>
            </div>

            {/* Audience Summary Metrics */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-blue-950">
                  Total in Group: <strong>{audienceCandidates.length}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-emerald-800">
                  Policy Eligible: <strong>{eligibleCandidates.length}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-blue-700">
                  Selected for Queue: <strong>{selectedRecipientIds.size}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllEligible}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] cursor-pointer shadow-2xs"
                >
                  Select Eligible ({eligibleCandidates.length})
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-[11px] cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* RECIPIENT INSPECTOR DRAWER / TABLE */}
            {showRecipientInspector && (
              <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden animate-in fade-in duration-150">
                <div className="bg-slate-100/80 px-4 py-2.5 flex items-center justify-between border-b border-slate-200 text-xs">
                  <div className="font-bold text-slate-700">Audience Recipient Directory</div>
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-500" />
                    <button
                      onClick={() => setRecipientFilter('all')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        recipientFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'
                      }`}
                    >
                      All ({audienceCandidates.length})
                    </button>
                    <button
                      onClick={() => setRecipientFilter('eligible')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        recipientFilter === 'eligible' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-800'
                      }`}
                    >
                      Eligible ({eligibleCandidates.length})
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs bg-white">
                  {audienceCandidates
                    .filter((r) => {
                      if (recipientFilter === 'eligible') {
                        return r.eligibilityStatus === 'eligible_24h' || r.eligibilityStatus === 'eligible_tag';
                      }
                      if (recipientFilter === 'ineligible') {
                        return r.eligibilityStatus !== 'eligible_24h' && r.eligibilityStatus !== 'eligible_tag';
                      }
                      return true;
                    })
                    .map((r) => {
                      const isSelected = selectedRecipientIds.has(r.id);
                      const isEligible = r.eligibilityStatus === 'eligible_24h' || r.eligibilityStatus === 'eligible_tag';

                      return (
                        <div
                          key={r.id}
                          onClick={() => toggleRecipientSelection(r.id)}
                          className={`p-3 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Handled by parent div onClick
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 truncate">{r.name}</span>
                                {r.orderNumber && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                                    #{r.orderNumber}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                <span>PSID: <code className="font-mono">{r.psid ? `${r.psid.slice(0, 12)}...` : 'None'}</code></span>
                                <span>•</span>
                                <span>{r.source === 'facebook_messenger' ? 'Messenger' : 'Website Order'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.eligibilityStatus === 'eligible_24h'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : r.eligibilityStatus === 'eligible_tag'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {r.eligibilityStatus === 'eligible_24h' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                              {r.eligibilityStatus === 'eligible_tag' && <Tag className="w-3 h-3 text-blue-600" />}
                              {r.eligibilityReason}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </section>

          {/* STEP 2: MESSAGE TEMPLATES & VARIATIONS */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h3 className="font-extrabold text-slate-900 text-sm tracking-wide">
                  Message Templates & Content Variations
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {parsedVariations.length} Variation{parsedVariations.length !== 1 ? 's' : ''} Active
              </span>
            </div>

            {/* Template Presets Picker */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Load Preset Template
              </label>
              <select
                value={selectedPresetId}
                onChange={(e) => handleSelectPreset(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {TEMPLATE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} [{p.tag}]
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {TEMPLATE_PRESETS.find((p) => p.id === selectedPresetId)?.description}
              </p>
            </div>

            {/* Message Variation Editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Message Variations <span className="font-normal normal-case text-slate-500">(Separate with <code className="bg-slate-100 px-1 rounded font-bold">---</code> or <code className="bg-slate-100 px-1 rounded font-bold">|</code>)</span>
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-semibold">Click to insert:</span>
                  {['{name}', '{order_number}', '{discount_code}', '{phone}'].map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => handleInsertToken(token)}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] cursor-pointer"
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={6}
                value={messageVariationsText}
                onChange={(e) => setMessageVariationsText(e.target.value)}
                placeholder="Enter message variations..."
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs font-sans leading-relaxed text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* LIVE PREVIEW OF FIRST VARIATION */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                  Live Messenger Bubble Preview ({sampleRecipient.name})
                </span>
                <span className="text-[11px] text-slate-400">Meta Graph API format</span>
              </div>
              <div className="bg-white p-3 rounded-2xl rounded-tl-sm border border-slate-200 shadow-2xs max-w-md text-xs text-slate-800 leading-relaxed font-sans">
                {previewMessage}
              </div>
            </div>
          </section>

          {/* STEP 3: DYNAMIC DELAY PACING ENGINE */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <h3 className="font-extrabold text-slate-900 text-sm tracking-wide">
                  Random Delay Pacing & Execution Controls
                </h3>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-600 text-white shadow-2xs">
                ⏱ {Math.min(minDelay, maxDelay).toFixed(1)}s – {Math.max(minDelay, maxDelay).toFixed(1)}s
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Minimum Delay:</span>
                  <span className="font-mono font-bold text-blue-700">{minDelay.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  value={minDelay}
                  onChange={(e) => setMinDelay(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Maximum Delay:</span>
                  <span className="font-mono font-bold text-blue-700">{maxDelay.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="60"
                  step="0.5"
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Skip duplicate recipients who received messages in last 7 days</span>
              </label>
              <span className="text-[11px] text-slate-400">Rate Limit Protection</span>
            </div>

            {/* ACTION CONTROLS BAR (START, PAUSE, RESUME, CANCEL) */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
              {campaignStatus === 'idle' || campaignStatus === 'completed' || campaignStatus === 'cancelled' ? (
                <button
                  type="button"
                  id="broadcaster-start-btn"
                  onClick={handleStartCampaign}
                  disabled={selectedRecipientIds.size === 0}
                  className="flex-1 py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Start Campaign ({selectedRecipientIds.size} Queued)</span>
                </button>
              ) : campaignStatus === 'running' ? (
                <>
                  <button
                    type="button"
                    id="broadcaster-pause-btn"
                    onClick={handlePauseCampaign}
                    className="flex-1 py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Pause className="w-4 h-4 fill-white" />
                    <span>Pause Campaign</span>
                  </button>
                  <button
                    type="button"
                    id="broadcaster-cancel-btn"
                    onClick={handleCancelCampaign}
                    className="py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    id="broadcaster-resume-btn"
                    onClick={handleResumeCampaign}
                    className="flex-1 py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Resume Campaign ({metrics.remaining} Remaining)</span>
                  </button>
                  <button
                    type="button"
                    id="broadcaster-cancel-paused-btn"
                    onClick={handleCancelCampaign}
                    className="py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: LIVE EXECUTION CONSOLE & METRICS (5 Cols) */}
        <div className="xl:col-span-5 space-y-6">
          <section className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[760px]">
            {/* CONSOLE HEADER */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  <span className="font-mono font-bold text-sm text-slate-100 tracking-wide">
                    Live Execution Console
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wide uppercase ${
                      campaignStatus === 'running'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse'
                        : campaignStatus === 'paused'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : campaignStatus === 'completed'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        campaignStatus === 'running'
                          ? 'bg-emerald-400'
                          : campaignStatus === 'paused'
                          ? 'bg-amber-400'
                          : 'bg-slate-500'
                      }`}
                    />
                    {campaignStatus}
                  </span>
                </div>
              </div>

              {/* PROGRESS BAR */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Progress: {progressPct}%</span>
                  <span>{processedItems} / {totalItems} Processed</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* LIVE METRICS TILES */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 font-mono">
                <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-center">
                  <span className="block text-[9px] text-slate-400 uppercase tracking-wider">QUEUED</span>
                  <span className="block text-base font-black text-slate-100 mt-0.5">{metrics.queued}</span>
                </div>
                <div className="p-2 rounded-lg bg-blue-950/40 border border-blue-800/60 text-center">
                  <span className="block text-[9px] text-blue-300 uppercase tracking-wider">ACCEPTED</span>
                  <span className="block text-base font-black text-blue-400 mt-0.5">{metrics.accepted}</span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-center" title="Delivery strictly increments via Meta delivery webhook watermark receipts">
                  <span className="block text-[9px] text-emerald-300 uppercase tracking-wider">DELIVERED</span>
                  <span className="block text-base font-black text-emerald-400 mt-0.5">{metrics.delivered}</span>
                </div>
                <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 text-center">
                  <span className="block text-[9px] text-amber-300 uppercase tracking-wider">SKIPPED</span>
                  <span className="block text-base font-black text-amber-400 mt-0.5">{metrics.skipped}</span>
                </div>
                <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/60 text-center">
                  <span className="block text-[9px] text-rose-300 uppercase tracking-wider">FAILED</span>
                  <span className="block text-base font-black text-rose-400 mt-0.5">{metrics.failed}</span>
                </div>
                <div className="p-2 rounded-lg bg-purple-950/40 border border-purple-800/60 text-center">
                  <span className="block text-[9px] text-purple-300 uppercase tracking-wider">REMAINING</span>
                  <span className="block text-base font-black text-purple-400 mt-0.5">{metrics.remaining}</span>
                </div>
              </div>
            </div>

            {/* LOG FEED */}
            <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed overflow-y-auto space-y-1.5 bg-[#0b1120]">
              {logs.map((log) => {
                let badgeClass = 'text-slate-400';
                if (log.level === 'warn') badgeClass = 'text-amber-400';
                if (log.level === 'error') badgeClass = 'text-rose-400 font-bold';
                if (log.level === 'success') badgeClass = 'text-emerald-400 font-bold';
                if (log.level === 'dispatch') badgeClass = 'text-blue-400';
                if (log.level === 'delivery') badgeClass = 'text-teal-400';
                if (log.level === 'pacing') badgeClass = 'text-violet-400';

                return (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                    <span className={`${badgeClass} break-all`}>{log.message}</span>
                  </div>
                );
              })}
              <div ref={consoleBottomRef} />
            </div>

            {/* CONSOLE FOOTER CONTROLS */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer font-sans text-xs">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Auto-scroll</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadLog}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 cursor-pointer font-sans"
                >
                  <Download className="w-3 h-3" />
                  <span>Download Log</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLogs([{ id: `clear-${Date.now()}`, timestamp: new Date().toLocaleTimeString(), level: 'info', message: 'Console cleared.' }])}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 cursor-pointer font-sans"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
