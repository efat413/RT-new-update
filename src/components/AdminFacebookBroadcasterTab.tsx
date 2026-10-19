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
  Save,
  Trash2,
  Plus,
  Bookmark,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ConfirmModal } from './ConfirmModal';
import {
  FacebookAudienceType,
  FacebookMessageTag,
  FacebookRecipient,
  FacebookCampaignStatus,
  BroadcasterMetrics,
  BroadcastLogItem,
  FacebookCampaign,
  FacebookQueueItem,
  FacebookMessageTemplate,
} from '../types';
import {
  fetchFacebookStatus,
  testFacebookConnection,
  sendFacebookMessage,
  createFacebookCampaign,
  fetchFacebookCampaigns,
  fetchFacebookCampaignDetails,
  pauseFacebookCampaign,
  resumeFacebookCampaign,
  cancelFacebookCampaign,
  updateFacebookCampaignDelays,
  processFacebookCampaignNext,
  fetchFacebookRecipients,
  subscribeFacebookPage,
  fetchFacebookTemplates,
  saveFacebookTemplate,
  updateFacebookTemplate,
  deleteFacebookTemplate,
} from '../services/facebookApi';
import { FacebookConfigStatus } from '../server/facebookMessenger';
import {
  validateIncomingMessage24HourWindow,
  isRecipientEligibleFor24HourFilter,
} from '../utils/facebookPolicy';

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
  const [pageId, setPageId] = useState<string | null>(() => (settings as any)?.facebookPageId || null);
  const [pageName, setPageName] = useState<string | null>(null);

  // Templates & Variations
  const [selectedPresetId, setSelectedPresetId] = useState<string>('post_purchase_update');
  const [messageVariationsText, setMessageVariationsText] = useState<string>(
    TEMPLATE_PRESETS[0].variations.join('\n---\n')
  );

  // Saved Custom Message Templates (Cloudflare D1)
  const [savedTemplates, setSavedTemplates] = useState<FacebookMessageTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);
  const [selectedSavedTemplateId, setSelectedSavedTemplateId] = useState<string>('');
  const [templateName, setTemplateName] = useState<string>(TEMPLATE_PRESETS[0].name);
  const [activeTemplateSource, setActiveTemplateSource] = useState<'preset' | 'custom' | 'new'>('preset');
  const [isSavingTemplate, setIsSavingTemplate] = useState<boolean>(false);
  const [templateToDelete, setTemplateToDelete] = useState<FacebookMessageTemplate | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState<boolean>(false);

  // Dynamic Pacing Controls (Min / Max Random Delay - default 2-3 seconds per user requirement)
  const [minDelay, setMinDelay] = useState<number>(2.0);
  const [maxDelay, setMaxDelay] = useState<number>(3.0);
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);

  // Persistent Campaign Engine State (Cloudflare D1)
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [savedCampaigns, setSavedCampaigns] = useState<FacebookCampaign[]>([]);
  const timeoutTimerRef = useRef<any>(null);

  // Recipient Selection & Filtering
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'last_24_hours' | 'eligible' | 'ineligible'>('all');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set());
  const [showRecipientInspector, setShowRecipientInspector] = useState<boolean>(false);
  const [showSecretsGuide, setShowSecretsGuide] = useState<boolean>(false);
  const [configStatus, setConfigStatus] = useState<FacebookConfigStatus | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [persistedRecipients, setPersistedRecipients] = useState<any[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState<boolean>(false);

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
      message: 'Broadcaster Pro Engine initialized. Checking Cloudflare Worker Meta status...',
    },
    {
      id: 'init-2',
      timestamp: new Date().toLocaleTimeString(),
      level: 'warn',
      message: 'Notice: Delivery tracking relies on Meta delivery webhook receipts. Engine strictly separates API acceptance from verified delivery.',
    },
  ]);

  // Load saved campaigns from Cloudflare D1
  const loadSavedCampaigns = async () => {
    try {
      const res = await fetchFacebookCampaigns();
      if (res.success && res.campaigns) {
        setSavedCampaigns(res.campaigns);
      }
    } catch {}
  };

  // Load persisted Facebook Page recipients from D1
  const loadRecipients = async () => {
    setIsLoadingRecipients(true);
    try {
      const res = await fetchFacebookRecipients();
      if (res.success && Array.isArray(res.recipients)) {
        setPersistedRecipients(res.recipients);
        if (res.recipients.length > 0) {
          addLog('info', `[DIRECTORY SYNC] Loaded ${res.recipients.length} authentic Messenger contact(s) from D1 database.`);
        }
      }
    } catch {} finally {
      setIsLoadingRecipients(false);
    }
  };

  // Load custom saved message templates from Cloudflare D1
  const loadTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await fetchFacebookTemplates();
      if (res.success && Array.isArray(res.templates)) {
        setSavedTemplates(res.templates);
      } else if (res.error) {
        if (res.error.toLowerCase().includes('forbidden')) {
          addLog('warn', '[TEMPLATES] Unauthorized: Admin privileges required to view saved templates.');
        } else {
          addLog('warn', `[TEMPLATES] Could not load templates: ${res.error}`);
        }
      }
    } catch (err: any) {
      addLog('error', `[TEMPLATES] Network error loading templates: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Check backend Meta setup status and load saved campaigns, recipients, and templates on mount
  useEffect(() => {
    fetchFacebookStatus().then((res) => {
      if (res.success && res.status) {
        setConfigStatus(res.status);
        if (res.status.pageId) {
          setPageId(res.status.pageId);
        }
        if (res.status.pageName) {
          setPageName(res.status.pageName);
        }
        if (res.status.isOutboundReady || res.status.isConfigured) {
          addLog('success', `[BACKEND READY] Meta credentials verified on Cloudflare Worker (Page ID: ${res.status.pageId || 'Configured'}).`);
        } else {
          addLog('warn', `[SETUP REQUIRED] Meta credentials incomplete: ${res.status.outboundMissingRequirements?.length || res.status.missingRequirements?.length || 0} required configuration item(s) missing.`);
        }
        if (!res.status.isWebhookReady && (res.status.isOutboundReady || res.status.isConfigured)) {
          addLog('info', '[OUTBOUND READY] Outbound broadcasting is available. Inbound webhook delivery receipts are unconfigured (optional).');
        }
      }
    }).catch(() => {});
    loadSavedCampaigns();
    loadRecipients();
    loadTemplates();
  }, []);

  const handleTestMetaConnection = async () => {
    setIsTestingConnection(true);
    addLog('info', 'Testing Meta Graph API connection via Cloudflare Worker backend...');
    try {
      const res = await testFacebookConnection();
      setIsTestingConnection(false);

      if (res.success) {
        if (res.pageId) {
          setPageId(res.pageId);
        }
        if (res.pageName) {
          setPageName(res.pageName);
        }
        addLog('success', `[META CONNECTED] Authenticated as Page: "${res.pageName || res.pageId}" (ID: ${res.pageId}).`);
        showNotification('success', 'Meta API Connected', `Connected to Facebook Page: ${res.pageName || res.pageId}`);

        // Automatically ensure Facebook Page is subscribed to webhook events in Meta Graph API
        subscribeFacebookPage()
          .then((subRes) => {
            if (subRes.success) {
              addLog('success', '[PAGE WEBHOOK SUBSCRIBED] Facebook Page is subscribed to Messenger events (messages, deliveries, reads).');
            } else if (subRes.error) {
              addLog('info', `[PAGE SUBSCRIPTION NOTE] ${subRes.error}`);
            }
          })
          .catch(() => {});

        // Reload persisted recipients from D1
        loadRecipients();
      } else {
        if (res.mismatch) {
          addLog('error', `[PAGE ID MISMATCH] ${res.error}`);
          showNotification('error', 'Page ID Mismatch', res.error || 'Configured FB_PAGE_ID does not match authenticated Page ID.');
        } else {
          addLog('error', `[META CONNECTION FAILED] ${res.error || 'Check FB_PAGE_ACCESS_TOKEN and FB_PAGE_ID'}`);
          if (res.diagnostics && (res.diagnostics.code || res.diagnostics.category)) {
            const codeStr = res.diagnostics.code ? `Code: ${res.diagnostics.code}${res.diagnostics.subcode ? ` (Subcode: ${res.diagnostics.subcode})` : ''}` : '';
            const typeStr = res.diagnostics.type ? `Type: ${res.diagnostics.type}` : '';
            const diagDetails = [codeStr, typeStr, `Category: ${res.diagnostics.category}`].filter(Boolean).join(' | ');
            addLog('warn', `[META DIAGNOSTIC] ${diagDetails}`);
          }
          showNotification('error', 'Connection Test Failed', res.error || 'Failed to authenticate with Meta Graph API.');
        }
      }
    } catch (err: any) {
      setIsTestingConnection(false);
      addLog('error', `[META CONNECTION ERROR] ${err.message || 'Network error'}`);
    }
  };

  const consoleContainerRef = useRef<HTMLDivElement>(null);
  const isInitialMountRef = useRef<boolean>(true);
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

  // Live delay range modification: applies to future sends and persists to D1
  const handleUpdateMinDelay = (val: number) => {
    const newMin = Math.max(0.5, Math.min(val, maxDelay));
    setMinDelay(newMin);
    minDelayRef.current = newMin;

    if (activeCampaignId) {
      updateFacebookCampaignDelays(activeCampaignId, newMin, maxDelay)
        .then((res) => {
          if (res.success) {
            addLog(
              'pacing',
              `[PACING CONFIG UPDATED] Min delay changed to ${newMin.toFixed(1)}s (Range: ${newMin.toFixed(1)}s–${maxDelay.toFixed(1)}s). Applied to all future sends in D1.`
            );
          }
        })
        .catch(() => {});
    } else {
      addLog('pacing', `[PACING CONFIG] Delay range set to ${newMin.toFixed(1)}s–${maxDelay.toFixed(1)}s.`);
    }
  };

  const handleUpdateMaxDelay = (val: number) => {
    const newMax = Math.max(minDelay, val);
    setMaxDelay(newMax);
    maxDelayRef.current = newMax;

    if (activeCampaignId) {
      updateFacebookCampaignDelays(activeCampaignId, minDelay, newMax)
        .then((res) => {
          if (res.success) {
            addLog(
              'pacing',
              `[PACING CONFIG UPDATED] Max delay changed to ${newMax.toFixed(1)}s (Range: ${minDelay.toFixed(1)}s–${newMax.toFixed(1)}s). Applied to all future sends in D1.`
            );
          }
        })
        .catch(() => {});
    } else {
      addLog('pacing', `[PACING CONFIG] Delay range set to ${minDelay.toFixed(1)}s–${newMax.toFixed(1)}s.`);
    }
  };


  // Generate candidate recipients from actual store customers, orders, and recent interactions
  const allCandidates: FacebookRecipient[] = useMemo(() => {
    const list: FacebookRecipient[] = [];
    const now = Date.now();

    // 1. Add real Store Customers / Orders with authentic PSIDs
    const seenPhones = new Set<string>();
    orders.forEach((order) => {
      const phone = order.customer?.phone || '';
      if (!phone || seenPhones.has(phone)) return;
      seenPhones.add(phone);

      const orderTime = new Date(order.createdAt).getTime();
      const diffHours = (now - orderTime) / (60 * 60 * 1000);
      const isWithin24 = diffHours <= 24;

      // Extract authentic PSID if attached to order/customer record (never fabricate simulated IDs)
      const realPsid =
        (order as any).psid ||
        (order as any).facebookPsid ||
        (order.customer as any)?.psid ||
        (order.customer as any)?.facebookPsid;
      const psid = realPsid ? String(realPsid).trim() : undefined;

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

    // 2. Add real Registered Users with authentic PSIDs if available
    users.forEach((user) => {
      const realPsid = (user as any).psid || (user as any).facebookPsid;
      if (!realPsid) return;
      const phone = user.phone || '';
      if (phone && seenPhones.has(phone)) return;
      if (phone) seenPhones.add(phone);

      const userTime = new Date(user.createdAt || now).getTime();
      const diffHours = (now - userTime) / (60 * 60 * 1000);
      const isWithin24 = diffHours <= 24;

      let status: FacebookRecipient['eligibilityStatus'] = 'ineligible_no_psid';
      let reason = '';

      if (isWithin24) {
        status = 'eligible_24h';
        reason = `Active within 24h (${diffHours.toFixed(1)}h ago)`;
      } else if (selectedTag !== 'NONE') {
        status = 'eligible_tag';
        reason = `Eligible under tag [${selectedTag}]`;
      } else {
        status = 'requires_consent';
        reason = 'Outside 24h window without Meta Message Tag';
      }

      list.push({
        id: `user-${user.id}`,
        name: user.name || 'Registered Customer',
        phone,
        email: user.email,
        psid: String(realPsid).trim(),
        source: 'facebook_messenger',
        lastInteraction: user.createdAt || new Date(now).toISOString(),
        isWithin24Hours: isWithin24,
        hasMarketingConsent: true,
        eligibilityStatus: status,
        eligibilityReason: reason,
      });
    });

    // 3. Add authentic Facebook Page Contacts from Messenger Webhook & D1 database
    const seenPsids = new Set<string>();
    persistedRecipients.forEach((contact) => {
      const psid = contact.psid ? String(contact.psid).trim() : undefined;
      if (!psid || seenPsids.has(psid)) return;
      seenPsids.add(psid);

      // Page ID Isolation: if pageId is configured/selected, do not mix contacts belonging to a different Page
      if (pageId && contact.pageId && contact.pageId.trim() !== pageId.trim()) {
        return;
      }

      // Check genuine incoming message timestamp
      const incomingCheck = validateIncomingMessage24HourWindow(contact.lastIncomingMessageAt, now);
      const isWithin24Incoming = incomingCheck.isWithin24Hours;

      // Fallback interaction time for general non-window activity
      const interactionTime = new Date(contact.lastInteractionAt || contact.createdAt || now).getTime();
      const diffHours = (now - interactionTime) / (60 * 60 * 1000);
      const isWithin24 = isWithin24Incoming || (!contact.lastIncomingMessageAt && diffHours <= 24);

      let status: FacebookRecipient['eligibilityStatus'] = 'ineligible_no_psid';
      let reason = '';

      if (contact.consentStatus === 'opted_out') {
        status = 'opted_out';
        reason = 'Customer opted out / unsubscribed';
      } else if (isWithin24Incoming) {
        status = 'eligible_24h';
        reason = incomingCheck.diffHours !== undefined
          ? `Incoming message ${incomingCheck.diffHours}h ago (within 24h)`
          : 'Incoming message within 24h';
      } else if (isWithin24) {
        status = 'eligible_24h';
        reason = `Active within 24h (${diffHours.toFixed(1)}h ago)`;
      } else if (selectedTag !== 'NONE') {
        status = 'eligible_tag';
        reason = `Eligible under tag [${selectedTag}]`;
      } else {
        status = 'requires_consent';
        reason = 'Outside 24h window without Meta Message Tag';
      }

      list.push({
        id: contact.id || `fb_${psid}`,
        name: contact.name || 'Messenger User',
        phone: contact.phone || undefined,
        email: contact.email || undefined,
        psid,
        source: 'facebook_messenger',
        lastInteraction: contact.lastInteractionAt || contact.createdAt || new Date(now).toISOString(),
        lastIncomingMessageAt: contact.lastIncomingMessageAt || undefined,
        pageId: contact.pageId || undefined,
        isWithin24Hours: isWithin24,
        hasMarketingConsent: contact.consentStatus === 'consented' || isWithin24,
        eligibilityStatus: status,
        eligibilityReason: reason,
        lastMessageSnippet: contact.lastMessageSnippet || undefined,
      });
    });

    return list;
  }, [orders, users, persistedRecipients, selectedTag, pageId]);

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

  // Candidates matching the "Last 24 Hours" incoming message filter
  const last24hCandidates = useMemo(() => {
    return audienceCandidates.filter((r) => {
      if (r.source !== 'facebook_messenger' || !r.psid) return false;
      if (pageId && r.pageId && r.pageId.trim() !== pageId.trim()) return false;
      if (!r.lastIncomingMessageAt) return false;
      const res = isRecipientEligibleFor24HourFilter(r, pageId, Date.now());
      return res.eligible;
    });
  }, [audienceCandidates, pageId]);

  // Selected candidates based on user selection or defaults
  const eligibleCandidates = useMemo(() => {
    return audienceCandidates.filter(
      (r) => r.eligibilityStatus === 'eligible_24h' || r.eligibilityStatus === 'eligible_tag'
    );
  }, [audienceCandidates]);

  // Filtered audience candidates for the inspector drawer
  const filteredAudienceCandidates = useMemo(() => {
    return audienceCandidates.filter((r) => {
      if (recipientFilter === 'last_24_hours') {
        if (r.source !== 'facebook_messenger' || !r.psid) return false;
        if (pageId && r.pageId && r.pageId.trim() !== pageId.trim()) return false;
        if (!r.lastIncomingMessageAt) return false;
        const res = isRecipientEligibleFor24HourFilter(r, pageId, Date.now());
        return res.eligible;
      }
      if (recipientFilter === 'eligible') {
        return r.eligibilityStatus === 'eligible_24h' || r.eligibilityStatus === 'eligible_tag';
      }
      if (recipientFilter === 'ineligible') {
        return r.eligibilityStatus !== 'eligible_24h' && r.eligibilityStatus !== 'eligible_tag';
      }
      return true;
    });
  }, [audienceCandidates, recipientFilter, pageId]);

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

  // Auto scroll strictly inside the dedicated console container without moving the document
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (autoScroll && consoleContainerRef.current) {
      const container = consoleContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Apply built-in template preset (keeps custom templates safe)
  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    setSelectedSavedTemplateId('');
    setActiveTemplateSource('preset');
    const found = TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSelectedTag(found.tag);
      setTemplateName(found.name);
      setMessageVariationsText(found.variations.join('\n---\n'));
      addLog('info', `Loaded built-in template preset: "${found.name}" (Meta Tag: ${found.tag})`);
    }
  };

  // Start a fresh new custom template draft
  const handleCreateNewTemplate = () => {
    setSelectedPresetId('');
    setSelectedSavedTemplateId('');
    setActiveTemplateSource('new');
    setTemplateName('');
    setMessageVariationsText('');
    addLog('info', 'Started new custom message template draft.');
  };

  // Load custom template from D1 into message editor (DOES NOT start campaign)
  const handleLoadSavedTemplate = (tmplId: string) => {
    if (!tmplId) {
      setSelectedSavedTemplateId('');
      return;
    }
    const tmpl = savedTemplates.find((t) => t.id === tmplId);
    if (!tmpl) {
      showNotification('error', 'Template Not Found', 'Could not load the selected message template.');
      addLog('error', `Could not load template ID: ${tmplId}`);
      return;
    }
    setSelectedSavedTemplateId(tmpl.id);
    setSelectedPresetId('');
    setActiveTemplateSource('custom');
    setTemplateName(tmpl.templateName);
    setMessageVariationsText(tmpl.messageContent);
    if (tmpl.tag && tmpl.tag !== 'NONE') {
      setSelectedTag(tmpl.tag);
    }
    showNotification('info', 'Template Loaded', `Loaded template "${tmpl.templateName}" into message editor.`);
    addLog('info', `Loaded custom saved template: "${tmpl.templateName}" (Tag: ${tmpl.tag || 'NONE'})`);
  };

  // Save or update custom template in Cloudflare D1
  const handleSaveTemplate = async (isUpdate = false) => {
    const trimmedName = templateName.trim();
    const trimmedContent = messageVariationsText.trim();

    if (!trimmedName) {
      showNotification('error', 'Template Name Missing', 'Please enter a name for this message template.');
      addLog('warn', 'Template save failed: Template name is missing.');
      return;
    }
    if (!trimmedContent) {
      showNotification('error', 'Message Content Missing', 'Please enter message content or variations before saving.');
      addLog('warn', 'Template save failed: Message content is missing.');
      return;
    }

    setIsSavingTemplate(true);
    try {
      const targetId = isUpdate && selectedSavedTemplateId ? selectedSavedTemplateId : undefined;
      const res = targetId
        ? await updateFacebookTemplate(targetId, {
            templateName: trimmedName,
            messageContent: trimmedContent,
            tag: selectedTag,
          })
        : await saveFacebookTemplate({
            templateName: trimmedName,
            messageContent: trimmedContent,
            tag: selectedTag,
          });

      if (res.success && res.template) {
        const saved = res.template;
        setSelectedSavedTemplateId(saved.id);
        setSelectedPresetId('');
        setActiveTemplateSource('custom');
        showNotification(
          'success',
          isUpdate ? 'Template Updated' : 'Template Saved',
          `Template "${saved.templateName}" successfully ${isUpdate ? 'updated' : 'saved'} in Cloudflare D1.`
        );
        addLog(
          'success',
          `[TEMPLATE ${isUpdate ? 'UPDATED' : 'SAVED'}] "${saved.templateName}" (ID: ${saved.id}) stored in D1 database.`
        );
        await loadTemplates();
      } else {
        const errMsg = res.error || 'Failed to save template to database.';
        if (errMsg.toLowerCase().includes('forbidden')) {
          showNotification('error', 'Unauthorized', 'You do not have administrative privileges to manage templates.');
          addLog('error', '[TEMPLATE ERROR] Unauthorized operation: Admin privileges required.');
        } else {
          showNotification('error', 'Could Not Save Template', errMsg);
          addLog('error', `[TEMPLATE ERROR] Could not save template: ${errMsg}`);
        }
      }
    } catch (err: any) {
      showNotification('error', 'Network Error', err.message || 'Failed to save message template.');
      addLog('error', `[TEMPLATE ERROR] ${err.message || 'Network exception saving template'}`);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Confirm and delete custom template from Cloudflare D1
  const handleConfirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    setIsDeletingTemplate(true);
    try {
      const res = await deleteFacebookTemplate(templateToDelete.id);
      if (res.success) {
        showNotification('success', 'Template Deleted', `Template "${templateToDelete.templateName}" has been deleted.`);
        addLog('info', `[TEMPLATE DELETED] Deleted template "${templateToDelete.templateName}" from D1.`);
        if (selectedSavedTemplateId === templateToDelete.id) {
          setSelectedSavedTemplateId('');
          setActiveTemplateSource('new');
          setTemplateName('');
        }
        await loadTemplates();
      } else {
        const errMsg = res.error || 'Failed to delete template.';
        if (errMsg.toLowerCase().includes('forbidden')) {
          showNotification('error', 'Unauthorized', 'You do not have administrative privileges to delete templates.');
          addLog('error', '[TEMPLATE ERROR] Unauthorized deletion attempt.');
        } else {
          showNotification('error', 'Could Not Delete Template', errMsg);
          addLog('error', `[TEMPLATE ERROR] Could not delete template: ${errMsg}`);
        }
      }
    } catch (err: any) {
      showNotification('error', 'Network Error', err.message || 'Failed to delete template.');
      addLog('error', `[TEMPLATE ERROR] ${err.message || 'Network exception deleting template'}`);
    } finally {
      setIsDeletingTemplate(false);
      setTemplateToDelete(null);
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

  // Requirement 14: Clear selections when switching filters so recipients from another filter cannot accidentally enter the campaign
  const handleFilterChange = (newFilter: 'all' | 'last_24_hours' | 'eligible' | 'ineligible') => {
    if (newFilter === recipientFilter) return;
    setRecipientFilter(newFilter);
    setSelectedRecipientIds(new Set());
    const filterName =
      newFilter === 'last_24_hours'
        ? 'Last 24 Hours'
        : newFilter === 'eligible'
        ? 'Eligible'
        : newFilter === 'ineligible'
        ? 'Ineligible'
        : 'All';
    addLog('info', `Switched filter to "${filterName}". Selected recipients cleared to prevent cross-filter dispatches.`);
  };

  // Requirement 13: Select All action that selects only the recipients returned by the active Last 24 Hours filter
  const handleSelectAllLast24Hours = () => {
    if (last24hCandidates.length === 0) {
      setSelectedRecipientIds(new Set());
      showNotification('info', 'No Last 24 Hours Senders', 'No contacts sent an incoming message within the last 24 hours.');
      addLog('warn', 'No recipients matching Last 24 Hours incoming message filter.');
      return;
    }
    const ids = new Set(last24hCandidates.map((r) => r.id));
    setSelectedRecipientIds(ids);
    addLog('info', `Selected all ${ids.size} recipient(s) from Last 24 Hours filter.`);
  };

  const handleSelectAllInActiveFilter = () => {
    if (filteredAudienceCandidates.length === 0) {
      setSelectedRecipientIds(new Set());
      showNotification('info', 'No Matching Recipients', 'No recipients found for the active filter.');
      return;
    }
    const ids = new Set(filteredAudienceCandidates.map((r) => r.id));
    setSelectedRecipientIds(ids);
    addLog('info', `Selected all ${ids.size} recipient(s) in active filter view.`);
  };

  const handleSelectAllEligible = () => {
    if (eligibleCandidates.length === 0) {
      setSelectedRecipientIds(new Set());
      showNotification('info', 'No Eligible Recipients', 'No eligible recipients found.');
      addLog('warn', 'No eligible recipients found.');
      return;
    }
    const eligibleIds = new Set(eligibleCandidates.map((r) => r.id));
    setSelectedRecipientIds(eligibleIds);
    addLog('info', `Selected all ${eligibleIds.size} eligible recipient(s).`);
  };

  const handleDeselectAll = () => {
    setSelectedRecipientIds(new Set());
    addLog('info', 'Deselected all recipients.');
  };

  // START PERSISTENT CAMPAIGN IN D1
  const handleStartCampaign = async () => {
    if (parsedVariations.length === 0) {
      showNotification('error', 'Missing Message Template', 'Please enter at least one message variation.');
      return;
    }

    const queue = audienceCandidates.filter((r) => selectedRecipientIds.has(r.id));
    if (queue.length === 0) {
      showNotification('error', 'Empty Queue', 'Please select at least one eligible recipient for dispatch.');
      return;
    }

    isRunningRef.current = true;
    isPausedRef.current = false;
    isCancelledRef.current = false;

    addLog('info', `=== CREATING PERSISTENT CAMPAIGN IN CLOUDFLARE D1 (${queue.length} RECIPIENTS) ===`);

    const recipientList = queue.map((r) => {
      const variation = parsedVariations[Math.floor(Math.random() * parsedVariations.length)] || '';
      const personalized = variation
        .replace(/{name}/g, r.name)
        .replace(/{order_number}/g, r.orderNumber || 'N/A')
        .replace(/{phone}/g, settings?.phone || settings?.footer?.supportPhone || '01518739561')
        .replace(/{discount_code}/g, 'RONGDHONU10')
        .replace(/{shop_name}/g, settings?.siteName || 'Rongdhonu Trade');

      return {
        id: r.id,
        name: r.name,
        psid: r.psid,
        phone: r.phone,
        isWithin24Hours: r.isWithin24Hours,
        hasMarketingConsent: r.hasMarketingConsent,
        orderNumber: r.orderNumber,
        personalizedText: personalized,
      };
    });

    const createPayload = {
      name: `${audienceType === 'page_contacts' ? 'Page Contacts' : 'Store Customers'} Broadcast - ${new Date().toLocaleDateString('en-GB')}`,
      audienceType,
      tag: selectedTag,
      messageTemplate: parsedVariations[0] || '',
      minDelay: minDelayRef.current,
      maxDelay: maxDelayRef.current,
      recipients: recipientList,
    };

    try {
      const createRes = await createFacebookCampaign(createPayload);
      if (!createRes.success || !createRes.campaign) {
        showNotification('error', 'Campaign Creation Failed', createRes.error || 'Failed to persist campaign in D1');
        addLog('error', `Failed to create campaign in D1: ${createRes.error}`);
        isRunningRef.current = false;
        return;
      }

      const camp = createRes.campaign;
      setActiveCampaignId(camp.id);
      setCampaignStatus('running');
      setMetrics({
        queued: camp.totalQueued,
        accepted: camp.acceptedCount,
        delivered: camp.deliveredCount,
        skipped: camp.skippedCount,
        failed: camp.failedCount,
        remaining: camp.remainingCount,
      });

      addLog('success', `[D1 QUEUE READY] Campaign "${camp.name}" persisted (ID: ${camp.id}) with ${camp.totalQueued} items.`);
      addLog('info', `Pacing Engine: Configurable random delay between ${camp.minDelay.toFixed(1)}s and ${camp.maxDelay.toFixed(1)}s (dynamically adjustable during run).`);
      addLog('warn', `Notice: Delivered count strictly updates upon verified Meta delivery webhook watermark receipts.`);
      addLog('info', `Starting execution loop...`);

      loadSavedCampaigns();
      runCampaignStep(camp.id);
    } catch (err: any) {
      isRunningRef.current = false;
      showNotification('error', 'Campaign Error', err.message || 'Error starting campaign');
      addLog('error', `Campaign error: ${err.message}`);
    }
  };

  // EXECUTION RUNNER STEP (Interacts with persistent queue in D1)
  const runCampaignStep = async (campaignId: string) => {
    if (!isRunningRef.current || isCancelledRef.current || isPausedRef.current) return;

    try {
      const res = await processFacebookCampaignNext(campaignId);

      if (!res.success) {
        if (res.error?.includes('state') || res.error?.includes('paused') || res.error?.includes('cancelled')) {
          return;
        }
        addLog('warn', `Queue notice: ${res.error || 'Transient queue step issue'}`);
      }

      if (res.completed) {
        isRunningRef.current = false;
        setCampaignStatus('completed');
        setMetrics((prev) => ({ ...prev, remaining: 0 }));
        addLog('success', `=== CAMPAIGN COMPLETED: All queue items processed in D1 ===`);
        addLog('delivery', `Verification note: Final DELIVERED count will increment as Meta delivery webhook receipts arrive.`);
        showNotification('success', 'Campaign Complete', 'All broadcast queue items have been processed in D1.');
        loadSavedCampaigns();
        return;
      }

      if (res.item) {
        const item = res.item;
        const freshDelay = res.delayUsedSeconds ?? 2.5;

        if (item.status === 'accepted') {
          setMetrics((prev) => ({
            ...prev,
            accepted: prev.accepted + 1,
            remaining: Math.max(0, prev.remaining - 1),
          }));
          addLog('dispatch', `[ACCEPTED] Dispatched to ${item.recipientName} [PSID: ${item.psid?.slice(0, 10)}...] via Meta Tag: ${selectedTag} (Meta Message ID: ${item.metaMessageId})`);
        } else if (item.status === 'skipped') {
          setMetrics((prev) => ({
            ...prev,
            skipped: prev.skipped + 1,
            remaining: Math.max(0, prev.remaining - 1),
          }));
          addLog('warn', `[SKIPPED] ${item.recipientName}: ${item.skipReason || 'Meta policy restriction'}`);
        } else if (item.status === 'failed') {
          setMetrics((prev) => ({
            ...prev,
            failed: prev.failed + 1,
            remaining: Math.max(0, prev.remaining - 1),
          }));
          addLog('error', `[FAILED] ${item.recipientName}: ${item.errorMessage || 'Dispatch error'}`);
        }

        if (res.remainingCount != null) {
          setMetrics((prev) => ({ ...prev, remaining: res.remainingCount! }));
        }

        if (!isRunningRef.current || isCancelledRef.current || isPausedRef.current) return;

        addLog('pacing', `[PACING] Selected fresh random delay: ${freshDelay.toFixed(2)}s for next send...`);

        timeoutTimerRef.current = setTimeout(() => {
          runCampaignStep(campaignId);
        }, Math.round(freshDelay * 1000));
      } else {
        timeoutTimerRef.current = setTimeout(() => {
          runCampaignStep(campaignId);
        }, 2000);
      }
    } catch (err: any) {
      addLog('error', `Processing step error: ${err.message}`);
      timeoutTimerRef.current = setTimeout(() => {
        runCampaignStep(campaignId);
      }, 3000);
    }
  };

  // PAUSE CAMPAIGN
  const handlePauseCampaign = async () => {
    if (campaignStatus !== 'running' || !activeCampaignId) return;
    isPausedRef.current = true;
    isRunningRef.current = false;
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    setCampaignStatus('paused');

    try {
      await pauseFacebookCampaign(activeCampaignId);
      addLog('warn', `[PAUSED] Campaign paused in D1 by administrator. Current queue position preserved (Remaining: ${metrics.remaining}).`);
      showNotification('info', 'Campaign Paused', 'Campaign execution paused. Click Resume to continue.');
      loadSavedCampaigns();
    } catch {}
  };

  // RESUME CAMPAIGN
  const handleResumeCampaign = async () => {
    if (campaignStatus !== 'paused' || !activeCampaignId) return;
    isPausedRef.current = false;
    isRunningRef.current = true;
    setCampaignStatus('running');

    try {
      await resumeFacebookCampaign(activeCampaignId);
      addLog('success', `[RESUMED] Campaign resumed in D1. Continuing dispatch from next pending queue item...`);
      showNotification('success', 'Campaign Resumed', 'Continuing broadcast queue execution.');
      loadSavedCampaigns();
      runCampaignStep(activeCampaignId);
    } catch {}
  };

  // CANCEL CAMPAIGN
  const handleCancelCampaign = async () => {
    if (!activeCampaignId) return;
    isCancelledRef.current = true;
    isRunningRef.current = false;
    isPausedRef.current = false;
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    setCampaignStatus('cancelled');

    try {
      await cancelFacebookCampaign(activeCampaignId);
      setMetrics((prev) => ({ ...prev, remaining: 0 }));
      addLog('error', `[CANCELLED] Campaign cancelled in D1 by administrator. Remaining pending queue items aborted.`);
      showNotification('warning', 'Campaign Cancelled', 'The broadcast queue has been cancelled.');
      loadSavedCampaigns();
    } catch {}
  };

  // LOAD / SWITCH SAVED CAMPAIGN
  const handleSelectSavedCampaign = async (camp: FacebookCampaign) => {
    setActiveCampaignId(camp.id);
    setCampaignStatus(camp.status);
    setMinDelay(camp.minDelay);
    setMaxDelay(camp.maxDelay);
    minDelayRef.current = camp.minDelay;
    maxDelayRef.current = camp.maxDelay;
    setMetrics({
      queued: camp.totalQueued,
      accepted: camp.acceptedCount,
      delivered: camp.deliveredCount,
      skipped: camp.skippedCount,
      failed: camp.failedCount,
      remaining: camp.remainingCount,
    });
    addLog('info', `[LOADED CAMPAIGN] "${camp.name}" (ID: ${camp.id}) | Status: ${camp.status} | Remaining: ${camp.remainingCount}`);
    showNotification('info', 'Campaign Loaded', `Loaded campaign: ${camp.name}`);
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
            <span className={`w-2.5 h-2.5 rounded-full ${pageId ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-slate-700">Page ID:</span>
            {pageId ? (
              <div className="flex items-center gap-1.5">
                <code className="font-mono text-slate-900 font-bold">{pageId}</code>
                {pageName && (
                  <span className="text-[11px] text-slate-500 font-normal">({pageName})</span>
                )}
              </div>
            ) : (
              <span className="font-semibold text-amber-700">Facebook Page ID not configured</span>
            )}
          </div>

          <button
            type="button"
            id="broadcaster-test-connection-btn"
            disabled={isTestingConnection}
            onClick={handleTestMetaConnection}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Ping Meta Graph API with server-side Cloudflare Worker secrets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingConnection ? 'animate-spin' : ''}`} />
            <span>{isTestingConnection ? 'Testing...' : 'Test Connection'}</span>
          </button>

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
                In strict adherence to enterprise security guidelines, Page Access Tokens and App Secrets are never stored in browser storage or client bundles. They must be set as Cloudflare Worker secrets. Outbound broadcasting requires only a valid Page Access Token and Page ID.
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
                1. Set Page Access Token (Required for Outbound):
              </span>
              <code className="text-emerald-400 block break-all">npx wrangler secret put FB_PAGE_ACCESS_TOKEN</code>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
              <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">
                2. Set Authoritative Facebook Page ID (Required for Outbound):
              </span>
              <code className="text-emerald-400 block break-all">npx wrangler secret put FB_PAGE_ID</code>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
              <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">
                3. Set Meta App Secret (Optional - Webhook Signatures):
              </span>
              <code className="text-emerald-400 block break-all">npx wrangler secret put FB_APP_SECRET</code>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1">
              <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider">
                4. Set Webhook Verification Token (Optional - Webhook Handshake):
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
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-semibold text-blue-950">
                  Total in Group: <strong>{audienceCandidates.length}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-emerald-800">
                  Policy Eligible: <strong>{eligibleCandidates.length}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-indigo-700">
                  Last 24 Hours: <strong>{last24hCandidates.length}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-blue-700">
                  Selected for Queue: <strong>{selectedRecipientIds.size}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    handleFilterChange('last_24_hours');
                    setShowRecipientInspector(true);
                    if (last24hCandidates.length > 0) {
                      setSelectedRecipientIds(new Set(last24hCandidates.map((r) => r.id)));
                      addLog('info', `Selected all ${last24hCandidates.length} Last 24 Hours contact(s).`);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer shadow-2xs flex items-center gap-1"
                >
                  <Clock3 className="w-3 h-3" />
                  <span>Select Last 24 Hours ({last24hCandidates.length})</span>
                </button>
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
                <button
                  type="button"
                  onClick={loadRecipients}
                  disabled={isLoadingRecipients}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer border border-slate-300 disabled:opacity-50"
                  title="Reload recent Messenger contacts from D1"
                >
                  {isLoadingRecipients ? 'Syncing...' : 'Sync Contacts'}
                </button>
              </div>
            </div>

            {/* RECIPIENT INSPECTOR DRAWER / TABLE */}
            {showRecipientInspector && (
              <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden animate-in fade-in duration-150">
                <div className="bg-slate-100/80 px-4 py-2.5 flex items-center justify-between border-b border-slate-200 text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">Audience Recipient Directory</span>
                    {recipientFilter === 'last_24_hours' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        <Clock3 className="w-3 h-3 text-indigo-600" />
                        Last 24 Hours — {last24hCandidates.length} {last24hCandidates.length === 1 ? 'contact' : 'contacts'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Filter className="w-3.5 h-3.5 text-slate-500" />
                    <button
                      type="button"
                      onClick={() => handleFilterChange('all')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        recipientFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      All ({audienceCandidates.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFilterChange('last_24_hours')}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold cursor-pointer flex items-center gap-1 ${
                        recipientFilter === 'last_24_hours'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'
                      }`}
                    >
                      <Clock3 className="w-3 h-3" />
                      <span>Last 24 Hours ({last24hCandidates.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFilterChange('eligible')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        recipientFilter === 'eligible' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-800 hover:bg-emerald-50'
                      }`}
                    >
                      Eligible ({eligibleCandidates.length})
                    </button>
                    {recipientFilter === 'last_24_hours' && (
                      <button
                        type="button"
                        onClick={handleSelectAllLast24Hours}
                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 hover:bg-indigo-200 cursor-pointer border border-indigo-300 ml-1"
                        title="Select only recipients matching the active Last 24 Hours filter"
                      >
                        Select All ({last24hCandidates.length})
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs bg-white">
                  {filteredAudienceCandidates.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                      {recipientFilter === 'last_24_hours' ? (
                        <div className="space-y-2">
                          <Clock3 className="w-10 h-10 text-indigo-300 mx-auto mb-1 animate-pulse" />
                          <p className="font-bold text-slate-800 text-sm">
                            No Recent Message Senders Found
                          </p>
                          <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
                            No contacts sent an incoming message to this Facebook Page within the last 24 hours, or previous contact timestamps have exceeded the 24-hour Meta messaging window.
                          </p>
                          <p className="text-[10px] text-indigo-600 font-semibold mt-2">
                            Tip: To message contacts outside the 24-hour window, use an approved Message Tag like POST_PURCHASE_UPDATE.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-bold text-slate-700">
                            {recipientFilter === 'eligible'
                              ? 'No eligible recipients found'
                              : 'No recipients found'}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                            {recipientFilter === 'eligible'
                              ? 'No customer records in this audience currently meet Meta 24-hour messaging window or Tag criteria with a verified PSID.'
                              : 'No customer records available for the selected audience.'}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    filteredAudienceCandidates.map((r) => {
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
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 truncate">{r.name}</span>
                                {r.orderNumber && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                                    #{r.orderNumber}
                                  </span>
                                )}
                              </div>
                              {r.lastMessageSnippet && (
                                <div className="text-[11px] text-slate-600 truncate mt-0.5 max-w-md italic">
                                  "{r.lastMessageSnippet}"
                                </div>
                              )}
                              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                                <span>PSID: <code className="font-mono">{r.psid ? `${r.psid.slice(0, 12)}...` : 'None'}</code></span>
                                <span>•</span>
                                <span>{r.source === 'facebook_messenger' ? 'Messenger' : 'Website Order'}</span>
                                {r.lastIncomingMessageAt ? (
                                  <>
                                    <span>•</span>
                                    <span className="text-indigo-600 font-medium">
                                      Incoming: {new Date(r.lastIncomingMessageAt).toLocaleString('en-GB')}
                                    </span>
                                  </>
                                ) : r.lastInteraction ? (
                                  <>
                                    <span>•</span>
                                    <span>Activity: {new Date(r.lastInteraction).toLocaleString('en-GB')}</span>
                                  </>
                                ) : null}
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
                    })
                  )}
                </div>
              </div>
            )}
          </section>

          {/* STEP 2: MESSAGE TEMPLATES & VARIATIONS */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h3 className="font-extrabold text-slate-900 text-sm tracking-wide">
                  Message Templates & Content Variations
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">
                  {parsedVariations.length} Variation{parsedVariations.length !== 1 ? 's' : ''} Active
                </span>
                {selectedSavedTemplateId && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <Bookmark className="w-3 h-3 text-emerald-600" />
                    Saved in D1
                  </span>
                )}
              </div>
            </div>

            {/* TEMPLATE PICKER & ACTIONS BAR */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-blue-600" />
                  Saved Message Templates & Presets
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="broadcaster-create-template-btn"
                    onClick={handleCreateNewTemplate}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    title="Create a new custom template from scratch"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Template</span>
                  </button>
                  <button
                    type="button"
                    onClick={loadTemplates}
                    disabled={isLoadingTemplates}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    title="Refresh saved templates from D1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTemplates ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Custom Saved Templates Library (Cloudflare D1) */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Custom Saved Templates ({savedTemplates.length})
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      id="broadcaster-saved-templates-select"
                      value={selectedSavedTemplateId}
                      onChange={(e) => handleLoadSavedTemplate(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">
                        {savedTemplates.length === 0 ? '-- No custom templates saved yet --' : '-- Load a custom saved template --'}
                      </option>
                      {savedTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.templateName} [{t.tag || 'NONE'}]
                        </option>
                      ))}
                    </select>
                    {selectedSavedTemplateId && (
                      <button
                        type="button"
                        onClick={() => {
                          const tmpl = savedTemplates.find((t) => t.id === selectedSavedTemplateId);
                          if (tmpl) setTemplateToDelete(tmpl);
                        }}
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer shrink-0"
                        title="Delete this template from D1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Built-in Preset Templates */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Built-in Presets
                  </label>
                  <select
                    id="broadcaster-preset-select"
                    value={selectedPresetId}
                    onChange={(e) => handleSelectPreset(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">-- Choose a built-in preset --</option>
                    {TEMPLATE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} [{p.tag}]
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedPresetId && (
                <p className="text-[11px] text-slate-500">
                  {TEMPLATE_PRESETS.find((p) => p.id === selectedPresetId)?.description}
                </p>
              )}
            </div>

            {/* TEMPLATE NAME INPUT */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Template Name *
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="broadcaster-template-name-input"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Customer Follow-up, Order Confirmation, VIP Offer..."
                  maxLength={120}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="absolute right-3 top-2.5 text-[10px] text-slate-400">
                  {templateName.length}/120
                </span>
              </div>
            </div>

            {/* MESSAGE CONTENT / VARIATIONS EDITOR */}
            <div>
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Message Content / Variations <span className="font-normal normal-case text-slate-500">(Separate with <code className="bg-slate-100 px-1 rounded font-bold">---</code> or <code className="bg-slate-100 px-1 rounded font-bold">|</code>)</span>
                </label>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold">Click to insert:</span>
                  {['{name}', '{order_number}', '{discount_code}', '{phone}', '{shop_name}'].map((token) => (
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
                id="broadcaster-message-content-textarea"
                value={messageVariationsText}
                onChange={(e) => setMessageVariationsText(e.target.value)}
                placeholder="Enter message text or multiple variations separated by --- or | ..."
                maxLength={2000}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs font-sans leading-relaxed text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                <span>Use <code className="font-mono">{'{name}'}</code> to personalize with recipient name.</span>
                <span>{messageVariationsText.length}/2000</span>
              </div>
            </div>

            {/* TEMPLATE SAVE / UPDATE ACTION BUTTONS */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="broadcaster-save-template-btn"
                  onClick={() => handleSaveTemplate(false)}
                  disabled={isSavingTemplate}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingTemplate ? 'Saving...' : 'Save as New Template'}</span>
                </button>

                {selectedSavedTemplateId && (
                  <button
                    type="button"
                    id="broadcaster-update-template-btn"
                    onClick={() => handleSaveTemplate(true)}
                    disabled={isSavingTemplate}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                    title="Update existing saved template in D1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSavingTemplate ? 'Updating...' : 'Update Template'}</span>
                  </button>
                )}

                {selectedSavedTemplateId && (
                  <button
                    type="button"
                    id="broadcaster-delete-template-btn"
                    onClick={() => {
                      const tmpl = savedTemplates.find((t) => t.id === selectedSavedTemplateId);
                      if (tmpl) setTemplateToDelete(tmpl);
                    }}
                    disabled={isDeletingTemplate}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Template</span>
                  </button>
                )}
              </div>

              {activeTemplateSource === 'preset' && (
                <span className="text-[11px] text-slate-500 italic">
                  Built-in preset loaded. You can customize text and "Save as New Template".
                </span>
              )}
            </div>

            {/* LIVE PREVIEW OF FIRST VARIATION */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                  Live Messenger Bubble Preview ({sampleRecipient.name})
                </span>
                <span className="text-[11px] text-slate-400">Dynamic preview with sample data</span>
              </div>
              <div className="bg-white p-3.5 rounded-2xl rounded-tl-sm border border-slate-200 shadow-2xs max-w-md text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap break-words">
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
                  min="0.5"
                  max="15"
                  step="0.5"
                  value={minDelay}
                  onChange={(e) => handleUpdateMinDelay(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400">Min pause between eligible sends</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Maximum Delay:</span>
                  <span className="font-mono font-bold text-blue-700">{maxDelay.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="0.5"
                  value={maxDelay}
                  onChange={(e) => handleUpdateMaxDelay(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400">Max pause between eligible sends</span>
              </div>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-xl text-xs text-blue-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Live Dynamic Pacing Engine:</strong>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  For each eligible send, a fresh random delay within this range is selected. Authorized administrators can adjust this range live during an active campaign, and the new range persists in D1 and applies immediately to future sends.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
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
            <div
              ref={consoleContainerRef}
              className="flex-1 p-4 font-mono text-[11px] leading-relaxed overflow-y-auto space-y-1.5 bg-[#0b1120]"
            >
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

      {/* CONFIRMATION MODAL FOR TEMPLATE DELETION */}
      {templateToDelete && (
        <ConfirmModal
          isOpen={Boolean(templateToDelete)}
          onClose={() => setTemplateToDelete(null)}
          onConfirm={handleConfirmDeleteTemplate}
          title="Delete Message Template"
          message={`Are you sure you want to delete template "${templateToDelete.templateName}"?\n\nThis will permanently remove the template from Cloudflare D1 storage. This action cannot be undone.`}
          confirmText={isDeletingTemplate ? 'Deleting...' : 'Delete Template'}
          cancelText="Cancel"
          variant="danger"
        />
      )}
    </div>
  );
};
