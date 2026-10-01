import React, { useState } from 'react';
import {
  Truck,
  Plus,
  Edit2,
  Trash2,
  RotateCcw,
  Check,
  X,
  ShieldCheck,
  Eye,
  EyeOff,
  Zap,
  Webhook,
  Clock,
  Copy,
  Radio,
  ExternalLink,
  Activity,
  CheckCircle2,
  AlertCircle,
  Play,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { CourierApiConfig, CourierWebhookConfig, CourierWebhookLog } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { orderApi } from '../services/orderApi';
import { useStore } from '../context/StoreContext';

interface AdminCouriersTabProps {
  courierConfigs: CourierApiConfig[];
  onAddCourier: (config: Omit<CourierApiConfig, 'id'>) => void;
  onUpdateCourier: (id: string, updates: Partial<CourierApiConfig>) => void;
  onDeleteCourier: (id: string) => void;
  onResetCouriers: () => void;
}

export const AdminCouriersTab: React.FC<AdminCouriersTabProps> = ({
  courierConfigs,
  onAddCourier,
  onUpdateCourier,
  onDeleteCourier,
  onResetCouriers,
}) => {
  const {
    courierWebhooks = [],
    courierWebhookLogs = [],
    addCourierWebhook,
    updateCourierWebhook,
    deleteCourierWebhook,
    testCourierWebhook,
    clearCourierWebhookLogs,
    showNotification,
  } = useStore();

  // Courier Add/Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourier, setEditingCourier] = useState<CourierApiConfig | null>(null);

  // Courier Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [trackingUrlPattern, setTrackingUrlPattern] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [triggerWebhookOnAdd, setTriggerWebhookOnAdd] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [notice, setNotice] = useState('');

  // Webhook Modal state
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<CourierWebhookConfig | null>(null);
  const [webhookName, setWebhookName] = useState('');
  const [webhookEndpointUrl, setWebhookEndpointUrl] = useState('');
  const [webhookEndpointSecret, setWebhookEndpointSecret] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['courier.added']);
  const [webhookActive, setWebhookActive] = useState(true);
  const [modalTestStatus, setModalTestStatus] = useState<{ testing: boolean; result?: { success: boolean; message: string } }>({
    testing: false,
  });

  // Webhook delivery test & logs UI states
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [webhookTestFeedback, setWebhookTestFeedback] = useState<Record<string, { success: boolean; message: string }>>({});
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null);
  const [selectedLogPayload, setSelectedLogPayload] = useState<CourierWebhookLog | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const openAddModal = () => {
    setEditingCourier(null);
    setName('');
    setCode('');
    setApiKey('');
    setSecretKey('');
    setBaseUrl('https://api.example-courier.com.bd/v1');
    setTrackingUrlPattern('https://example-courier.com.bd/track/{trackingCode}');
    setWebhookUrl('');
    setWebhookSecret('');
    setTriggerWebhookOnAdd(true);
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (c: CourierApiConfig) => {
    setEditingCourier(c);
    setName(c.name);
    setCode(c.code);
    setApiKey('');
    setSecretKey('');
    setBaseUrl(c.baseUrl || '');
    setTrackingUrlPattern(c.trackingUrlPattern || '');
    setWebhookUrl(c.webhookUrl || '');
    setWebhookSecret('');
    setTriggerWebhookOnAdd(c.triggerWebhookOnAdd !== false);
    setIsActive(c.isActive);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim()) return;

    const formattedCode = (code || name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let sanitizedBaseUrl = baseUrl.trim();
    // Auto-normalize legacy Steadfast domain that causes Cloudflare 530 Origin DNS error
    if (sanitizedBaseUrl.includes('portal.steadfast.com.bd')) {
      sanitizedBaseUrl = sanitizedBaseUrl.replace('portal.steadfast.com.bd', 'portal.packzy.com');
    }

    if (editingCourier) {
      onUpdateCourier(editingCourier.id, {
        name,
        code: formattedCode,
        baseUrl: sanitizedBaseUrl,
        trackingUrlPattern: trackingUrlPattern || undefined,
        webhookUrl: webhookUrl.trim() || undefined,
        triggerWebhookOnAdd,
        isActive,
      });
      showNotice(`Updated ${name} API configuration!`);
    } else {
      onAddCourier({
        name,
        code: formattedCode,
        baseUrl: sanitizedBaseUrl,
        trackingUrlPattern: trackingUrlPattern || undefined,
        webhookUrl: webhookUrl.trim() || undefined,
        triggerWebhookOnAdd,
        isActive,
      });
      showNotice(`Added ${name} to Courier Logistics! Webhook notification fired.`);
    }
    setIsModalOpen(false);
  };

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const toggleKeyVisibility = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Webhook Modal Helpers
  const openAddWebhookModal = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setEditingWebhook(null);
    setWebhookName('Store Webhook Receiver');
    setWebhookEndpointUrl(`${origin}/api/webhook/courier`);
    setWebhookEndpointSecret('');
    setWebhookEvents(['courier.added', 'courier.updated', 'courier.dispatched']);
    setWebhookActive(true);
    setModalTestStatus({ testing: false });
    setIsWebhookModalOpen(true);
  };

  const openEditWebhookModal = (w: CourierWebhookConfig) => {
    setEditingWebhook(w);
    setWebhookName(w.name);
    setWebhookEndpointUrl(w.url);
    setWebhookEndpointSecret(w.secret || '');
    setWebhookEvents(Array.isArray(w.events) && w.events.length > 0 ? w.events : ['courier.added']);
    setWebhookActive(w.isActive);
    setModalTestStatus({ testing: false });
    setIsWebhookModalOpen(true);
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookName.trim() || !webhookEndpointUrl.trim()) return;

    if (!webhookEndpointUrl.startsWith('http://') && !webhookEndpointUrl.startsWith('https://') && !webhookEndpointUrl.startsWith('/')) {
      showNotification('warning', 'Invalid URL', 'Webhook URL must begin with http:// or https:// or /');
      return;
    }

    const normalizedUrl = webhookEndpointUrl.trim().startsWith('/') && typeof window !== 'undefined'
      ? `${window.location.origin}${webhookEndpointUrl.trim()}`
      : webhookEndpointUrl.trim();

    if (editingWebhook) {
      await updateCourierWebhook(editingWebhook.id, {
        name: webhookName.trim(),
        url: normalizedUrl,
        secret: webhookEndpointSecret.trim() || undefined,
        events: webhookEvents,
        isActive: webhookActive,
      });
      showNotice(`Updated webhook "${webhookName}"`);
    } else {
      await addCourierWebhook({
        name: webhookName.trim(),
        url: normalizedUrl,
        secret: webhookEndpointSecret.trim() || undefined,
        events: webhookEvents,
        isActive: webhookActive,
      });
      showNotice(`Added webhook "${webhookName}" for courier events.`);
    }
    setIsWebhookModalOpen(false);
  };

  const handleTestSingleWebhook = async (w: CourierWebhookConfig) => {
    setTestingWebhookId(w.id);
    setWebhookTestFeedback((prev) => ({ ...prev, [w.id]: { success: false, message: 'Testing connection...' } }));

    try {
      const res = await testCourierWebhook({
        url: w.url,
        secret: w.secret,
        webhookId: w.id,
        event: 'courier.added',
        courier: {
          id: 'courier-sample-test',
          name: 'Steadfast Courier (Test Event)',
          code: 'steadfast',
          baseUrl: 'https://portal.packzy.com/api/v1',
          trackingUrlPattern: 'https://steadfast.com.bd/t/{trackingCode}',
          isActive: true,
        },
      });

      if (res.success) {
        setWebhookTestFeedback((prev) => ({
          ...prev,
          [w.id]: {
            success: true,
            message: `Success! HTTP ${res.status || 200} (${res.latencyMs || 0}ms)`,
          },
        }));
      } else {
        setWebhookTestFeedback((prev) => ({
          ...prev,
          [w.id]: {
            success: false,
            message: res.error || (res.status ? `HTTP ${res.status}` : 'Connection failed'),
          },
        }));
      }
    } catch (err: any) {
      setWebhookTestFeedback((prev) => ({
        ...prev,
        [w.id]: { success: false, message: err?.message || 'Failed to ping webhook' },
      }));
    } finally {
      setTestingWebhookId(null);
      setTimeout(() => {
        setWebhookTestFeedback((prev) => {
          const next = { ...prev };
          delete next[w.id];
          return next;
        });
      }, 7000);
    }
  };

  const handleModalTestWebhook = async () => {
    const raw = webhookEndpointUrl.trim();
    if (!raw || (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('/'))) {
      showNotification('warning', 'Invalid URL', 'Please enter a valid URL beginning with http:// or https:// or /');
      return;
    }

    const testUrl = raw.startsWith('/') && typeof window !== 'undefined'
      ? `${window.location.origin}${raw}`
      : raw;

    setModalTestStatus({ testing: true });
    try {
      const res = await testCourierWebhook({
        url: testUrl,
        secret: webhookEndpointSecret.trim() || undefined,
        event: 'courier.added',
        courier: {
          id: 'courier-test-modal',
          name: 'Sample Courier (Test Event)',
          code: 'sample-courier',
          baseUrl: 'https://portal.packzy.com/api/v1',
          isActive: true,
        },
      });

      setModalTestStatus({
        testing: false,
        result: {
          success: res.success,
          message: res.success
            ? `Success! Response HTTP ${res.status || 200} (${res.latencyMs || 0}ms)`
            : res.error || `HTTP ${res.status || 'Error'}`,
        },
      });
    } catch (err: any) {
      setModalTestStatus({
        testing: false,
        result: { success: false, message: err?.message || 'Connection test failed' },
      });
    }
  };

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard?.writeText(url);
    setCopiedWebhookId(id);
    setTimeout(() => setCopiedWebhookId(null), 2000);
  };

  const handleTestApi = async (c: CourierApiConfig) => {
    setTestingId(c.id);
    setTestResult(null);

    const isSteadfast = c.code.toLowerCase().includes('steadfast') || c.name.toLowerCase().includes('steadfast');

    if (isSteadfast) {
      let testBaseUrl = c.baseUrl?.trim();
      if (testBaseUrl && testBaseUrl.includes('portal.steadfast.com.bd')) {
        testBaseUrl = testBaseUrl.replace('portal.steadfast.com.bd', 'portal.packzy.com');
      }

      const res = await orderApi.testSteadfastConnection({
        apiKey: c.apiKey?.trim(),
        secretKey: c.secretKey?.trim(),
        baseUrl: testBaseUrl,
      });
      setTestingId(null);
      if (res.success) {
        setTestResult({
          id: c.id,
          success: true,
          message: `${res.message}${res.balance !== undefined ? ` • Current Balance: ৳${res.balance}` : ''}`,
        });
      } else {
        setTestResult({
          id: c.id,
          success: false,
          message: res.message || res.error || 'Connection failed. Please verify Steadfast API Key and Secret Key.',
        });
      }
    } else {
      setTestingId(null);
      setTestResult({
        id: c.id,
        success: false,
        message: `Live server test endpoint for "${c.name}" is not implemented. Production gateway is active for Steadfast Courier.`,
      });
    }

    setTimeout(() => setTestResult(null), 8000);
  };

  const activeWebhooksCount = courierWebhooks.filter((w) => w.isActive).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            Bangladeshi Courier APIs & Logistics
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Add courier delivery partners, configure live merchant keys, and manage logistics integrations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setConfirmDialog({
                isOpen: true,
                title: 'Reset Courier APIs to Default?',
                message: 'Are you sure you want to reset all Courier API configurations back to default settings (Steadfast, Pathao, RedX)?',
                confirmText: 'Reset Defaults',
                variant: 'danger',
                onConfirm: () => {
                  onResetCouriers();
                  showNotice('Restored default courier APIs.');
                },
              });
            }}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>

          <button
            id="admin-add-courier-btn"
            onClick={openAddModal}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add New Courier API
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Preset Quick Add Helpers */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
          Popular Bangladeshi Courier API Presets:
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setName('Paperfly Courier');
              setCode('paperfly');
              setApiKey('');
              setSecretKey('');
              setBaseUrl('https://api.paperfly.com.bd/v2');
              setTrackingUrlPattern('https://paperfly.com.bd/tracking/{trackingCode}');
              setWebhookUrl('');
              setWebhookSecret('');
              setTriggerWebhookOnAdd(true);
              setIsActive(false);
              setEditingCourier(null);
              setIsModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-emerald-600" />
            Paperfly
          </button>

          <button
            onClick={() => {
              setName('eCourier Express');
              setCode('ecourier');
              setApiKey('');
              setSecretKey('');
              setBaseUrl('https://backoffice.ecourier.com.bd/api/web/v2');
              setTrackingUrlPattern('https://ecourier.com.bd/tracking?id={trackingCode}');
              setWebhookUrl('');
              setWebhookSecret('');
              setTriggerWebhookOnAdd(true);
              setIsActive(false);
              setEditingCourier(null);
              setIsModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-emerald-600" />
            eCourier
          </button>

          <button
            onClick={() => {
              setName('Sundarban Courier');
              setCode('sundarban');
              setApiKey('');
              setSecretKey('');
              setBaseUrl('https://api.sundarbancourier.com/api/v1');
              setTrackingUrlPattern('https://sundarbancourier.com/track/{trackingCode}');
              setWebhookUrl('');
              setWebhookSecret('');
              setTriggerWebhookOnAdd(true);
              setIsActive(false);
              setEditingCourier(null);
              setIsModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-emerald-600" />
            Sundarban Courier
          </button>
        </div>
      </div>

      {/* Courier Configs List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {courierConfigs.map((c) => {
          const isRevealed = showKeys[c.id];
          const isTesting = testingId === c.id;
          const result = testResult?.id === c.id ? testResult : null;

          return (
            <div
              key={c.id}
              className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between space-y-4 hover:shadow-md transition-all"
            >
              <div className="space-y-3">
                {/* Header info */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                      <Truck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{c.name}</h4>
                      <span className="text-[11px] font-mono text-slate-400">code: {c.code}</span>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                      c.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {c.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>

                {/* API Details Box */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      API Endpoint Base
                    </span>
                    <span className="font-mono text-[11px] text-slate-700 break-all">{c.baseUrl}</span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        API Credentials Architecture
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-emerald-700 font-semibold break-all flex items-center gap-1.5 mt-0.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      {c.code.toLowerCase().includes('steadfast')
                        ? 'Production Worker Secrets (STEADFAST_API_KEY & STEADFAST_SECRET_KEY)'
                        : 'Server-side Environment Secrets'}
                    </span>
                  </div>

                  {c.webhookUrl && (
                    <div className="p-2 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1">
                      <div className="flex items-center gap-1.5 text-rose-900 font-bold text-[10px] uppercase tracking-wider">
                        <Webhook className="w-3 h-3 text-rose-600 shrink-0" />
                        <span>Direct Webhook on Add/Event</span>
                      </div>
                      <span className="font-mono text-[10px] text-rose-800 break-all block">
                        {c.webhookUrl}
                      </span>
                    </div>
                  )}

                  {c.code.toLowerCase().includes('steadfast') && (
                    <div className="p-2 rounded-xl bg-blue-50/80 border border-blue-200 space-y-1">
                      <div className="flex items-center gap-1.5 text-blue-900 font-bold text-[11px]">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Cloudflare Worker Secrets or UI</span>
                      </div>
                      <p className="text-[10px] text-blue-700 leading-tight">
                        You can enter keys directly by clicking <strong>Edit</strong> above, or configure credentials securely in server environment secrets.
                      </p>
                    </div>
                  )}

                  {c.trackingUrlPattern && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Tracking Pattern
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 break-all">
                        {c.trackingUrlPattern}
                      </span>
                    </div>
                  )}
                </div>

                {/* Test Result Message */}
                {result && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                      result.success
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{result.message}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => handleTestApi(c)}
                  disabled={isTesting}
                  className="py-1.5 px-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                  title="Test connection to Courier API"
                >
                  <Zap className={`w-3 h-3 text-amber-500 ${isTesting ? 'animate-spin' : ''}`} />
                  {isTesting ? 'Testing...' : 'Ping Test'}
                </button>

                <button
                  id={`edit-courier-btn-${c.id}`}
                  onClick={() => openEditModal(c)}
                  className="flex-1 py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                  Edit API
                </button>

                <button
                  id={`delete-courier-btn-${c.id}`}
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Remove Courier API?',
                      message: `Are you sure you want to permanently remove "${c.name}" courier logistics integration?`,
                      confirmText: 'Remove Courier',
                      variant: 'danger',
                      onConfirm: () => {
                        onDeleteCourier(c.id);
                        showNotice(`Removed ${c.name}`);
                      },
                    });
                  }}
                  className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer"
                  title="Remove Courier API"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* SECTION: COURIER WEBHOOKS & EVENT AUTOMATION                  */}
      {/* ============================================================ */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Webhook className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-base text-slate-900">
                  Courier Event Webhooks
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                  {activeWebhooksCount} Active
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Trigger automated HTTP POST requests whenever a courier is added (<code className="text-rose-600 font-mono">courier.added</code>), updated, or dispatched.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="admin-open-webhook-logs-btn"
              onClick={() => setIsLogsModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-slate-500" />
              <span>History Logs ({courierWebhookLogs.length})</span>
            </button>
            <button
              id="admin-add-webhook-btn"
              onClick={openAddWebhookModal}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs hover:shadow transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Webhook</span>
            </button>
          </div>
        </div>

        {/* Official Steadfast & Store Inbound Webhook Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50/70 to-slate-50 border border-blue-200/90 shadow-2xs space-y-3.5 overflow-hidden w-full">
          {/* Header Row: Title, Badge, Description & Ping Action */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-2.5 border-b border-blue-100/90">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-600 text-white shadow-2xs">
                  Live Webhook URLs
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  Official Live Webhook Listeners for Steadfast &amp; Courier Automation
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed max-w-2xl">
                To receive real-time delivery status updates from Steadfast Courier or external automation systems, copy this verified live webhook listener URL.
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                const targetUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/steadfast` : 'https://rongdhonutrade.com/api/webhook/steadfast';
                const res = await testCourierWebhook({
                  url: targetUrl,
                  event: 'courier.added',
                  courier: { id: 'sf-sample', name: 'Steadfast Test', code: 'steadfast' },
                });
                if (res.success) {
                  showNotice(`Live Webhook Receiver is Active and Verified (HTTP ${res.status || 200}, ${res.latencyMs || 0}ms)!`);
                } else {
                  showNotice(`Test: ${res.error || (res.status ? `HTTP ${res.status}` : 'Connection check')}`);
                }
              }}
              className="self-start sm:self-center shrink-0 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Ping Live Receiver</span>
            </button>
          </div>

          {/* Webhook URLs Grid - Fits completely inside with clean boundaries and no overflow */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full min-w-0">
            {/* Steadfast Webhook Listener Box */}
            <div className="p-3 bg-white/95 rounded-xl border border-blue-200/90 shadow-2xs flex flex-col justify-between gap-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  Steadfast:
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Real-time order sync</span>
              </div>
              <div className="flex items-center justify-between gap-2 bg-slate-50/90 px-3 py-2 rounded-lg border border-slate-200/80 min-w-0">
                <span className="text-xs font-mono text-blue-950 font-semibold break-all select-all min-w-0 flex-1">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/steadfast` : 'https://rongdhonutrade.com/api/webhook/steadfast'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyUrl(typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/steadfast` : 'https://rongdhonutrade.com/api/webhook/steadfast', 'inbound-sf-top')}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Copy Steadfast URL"
                >
                  {copiedWebhookId === 'inbound-sf-top' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhookId === 'inbound-sf-top' ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* General Courier Webhook Listener Box */}
            <div className="p-3 bg-white/95 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between gap-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                  General:
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Generic courier automation</span>
              </div>
              <div className="flex items-center justify-between gap-2 bg-slate-50/90 px-3 py-2 rounded-lg border border-slate-200/80 min-w-0">
                <span className="text-xs font-mono text-slate-800 font-semibold break-all select-all min-w-0 flex-1">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/courier` : 'https://rongdhonutrade.com/api/webhook/courier'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyUrl(typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/courier` : 'https://rongdhonutrade.com/api/webhook/courier', 'inbound-gen-top')}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold shrink-0 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Copy General Courier URL"
                >
                  {copiedWebhookId === 'inbound-gen-top' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhookId === 'inbound-gen-top' ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Webhooks List or Empty State */}
        {courierWebhooks.length === 0 ? (
          <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Webhook className="w-5 h-5" />
            </div>
            <div className="max-w-md mx-auto">
              <p className="text-xs font-bold text-slate-800">No Courier Webhooks Configured Yet</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Configure a webhook endpoint URL (e.g. Discord bot, Slack channel, Zapier, Make, or your custom server) to be notified immediately whenever a new courier is added!
              </p>
            </div>
            <button
              onClick={openAddWebhookModal}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Configure Webhook on Courier Add</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courierWebhooks.map((w) => {
              const isTesting = testingWebhookId === w.id;
              const feedback = webhookTestFeedback[w.id];

              return (
                <div
                  key={w.id}
                  className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-3 hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${w.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        <h4 className="font-bold text-xs text-slate-900">{w.name}</h4>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          w.isActive
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {w.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    {/* URL row */}
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 min-w-0">
                      <span className="truncate flex-1 min-w-0 text-[11px]">{w.url}</span>
                      <button
                        onClick={() => handleCopyUrl(w.url, w.id)}
                        className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer shrink-0"
                        title="Copy webhook URL"
                      >
                        {copiedWebhookId === w.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Subscribed Events Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Triggers:</span>
                      {w.events && w.events.length > 0 ? (
                        w.events.map((ev) => (
                          <span
                            key={ev}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                              ev === 'courier.added'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-slate-200/80 text-slate-700'
                            }`}
                          >
                            {ev}
                          </span>
                        ))
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-rose-100 text-rose-800">
                          courier.added
                        </span>
                      )}
                    </div>

                    {/* Test feedback */}
                    {feedback && (
                      <div
                        className={`p-2 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 ${
                          feedback.success
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {feedback.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        )}
                        <span className="truncate">{feedback.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2">
                    <button
                      onClick={() => handleTestSingleWebhook(w)}
                      disabled={isTesting}
                      className="py-1 px-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                      title="Send test ping with courier.added payload"
                    >
                      <Zap className={`w-3 h-3 text-amber-500 ${isTesting ? 'animate-spin' : ''}`} />
                      <span>{isTesting ? 'Pinging...' : 'Test Webhook'}</span>
                    </button>

                    <button
                      onClick={() => openEditWebhookModal(w)}
                      className="flex-1 py-1 px-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Edit2 className="w-3 h-3 text-blue-600" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => {
                        setConfirmDialog({
                          isOpen: true,
                          title: 'Remove Webhook?',
                          message: `Are you sure you want to delete the webhook "${w.name}"? It will no longer receive courier events.`,
                          confirmText: 'Delete Webhook',
                          variant: 'danger',
                          onConfirm: () => deleteCourierWebhook(w.id),
                        });
                      }}
                      className="py-1 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs flex items-center justify-center cursor-pointer transition-colors"
                      title="Remove Webhook"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODAL 1: ADD / EDIT COURIER API MODAL                        */}
      {/* ============================================================ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="h-2 w-full rainbow-gradient-bg shrink-0" />

            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingCourier ? `Configure ${editingCourier.name}` : 'Add New Courier API'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure live merchant API credentials and automated Webhook triggers.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Courier Provider Name *
                  </label>
                  <input
                    id="courier-name-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Steadfast Courier"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Code / Slug
                  </label>
                  <input
                    id="courier-code-input"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. steadfast"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Production Credentials Security Architecture</span>
                </div>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  Production credentials reside exclusively in Cloudflare Worker Secrets (<code className="font-mono bg-emerald-100 px-1 py-0.5 rounded">STEADFAST_API_KEY</code> &amp; <code className="font-mono bg-emerald-100 px-1 py-0.5 rounded">STEADFAST_SECRET_KEY</code>). Any keys entered below are used only for immediate server connection validation and are never persisted in browser storage or D1 database.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  API Key / Access Token (Validation Test Only)
                </label>
                <input
                  id="courier-api-key-input"
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Optional: Enter key to test immediate connection"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Secret Key / Client Secret (Validation Test Only)
                </label>
                <input
                  id="courier-secret-key-input"
                  type="text"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Optional: Enter secret to test immediate connection"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Base API Endpoint URL *
                </label>
                <input
                  id="courier-base-url-input"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://portal.packzy.com/api/v1"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  For Steadfast Courier, use <span className="font-mono text-emerald-700 font-bold">https://portal.packzy.com/api/v1</span> (official active gateway).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tracking URL Pattern
                </label>
                <input
                  id="courier-tracking-pattern-input"
                  type="text"
                  value={trackingUrlPattern}
                  onChange={(e) => setTrackingUrlPattern(e.target.value)}
                  placeholder="https://steadfast.com.bd/tracking/{trackingCode}"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Use <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600">{"{trackingCode}"}</code> as the placeholder.
                </p>
              </div>

              {/* Webhook Option When Added */}
              <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200/90 space-y-3">
                <div className="flex items-center gap-2 text-rose-950 font-bold text-xs">
                  <Webhook className="w-4 h-4 text-rose-600" />
                  <span>Webhook Notification On Add (নতুন কুরিয়ার যোগ হলে নোটিফিকেশন)</span>
                </div>
                <p className="text-[11px] text-rose-900/80 leading-relaxed">
                  Provide an optional direct webhook endpoint to automatically receive an HTTP POST event with the complete courier payload whenever this courier is created or updated.
                </p>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Direct Webhook URL
                    </label>
                    <button
                      type="button"
                      onClick={() => setWebhookUrl(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/courier`)}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer bg-white px-2 py-0.5 rounded-lg border border-rose-200 shadow-2xs hover:bg-rose-50"
                    >
                      <Zap className="w-3 h-3 text-amber-500" />
                      <span>Use Store Receiver (/api/webhook/courier)</span>
                    </button>
                  </div>
                  <input
                    id="courier-webhook-url-input"
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="e.g. /api/webhook/courier or https://hooks.zapier.com/..."
                    className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Accepts any external endpoint or the store&apos;s built-in live receiver (<code className="text-rose-600 font-mono">/api/webhook/courier</code>).
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Webhook Secret Token (Optional)
                  </label>
                  <input
                    id="courier-webhook-secret-input"
                    type="text"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="Sent in X-Webhook-Secret header"
                    className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="courier-trigger-webhook-checkbox"
                    type="checkbox"
                    checked={triggerWebhookOnAdd}
                    onChange={(e) => setTriggerWebhookOnAdd(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="courier-trigger-webhook-checkbox" className="text-xs font-semibold text-rose-950 cursor-pointer">
                    Trigger automated webhook event (<code className="text-rose-700 font-mono font-bold">courier.added</code>) immediately upon saving
                  </label>
                </div>

                {courierWebhooks.filter((w) => w.isActive && (w.events.includes('courier.added') || w.events.includes('*'))).length > 0 && (
                  <div className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-xl border border-emerald-200 flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      {courierWebhooks.filter((w) => w.isActive && (w.events.includes('courier.added') || w.events.includes('*'))).length} configured global webhook endpoint(s) will also be dispatched.
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="courier-active-checkbox"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                />
                <label htmlFor="courier-active-checkbox" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Enable this Courier for Dispatch &amp; Waybill Generation
                </label>
              </div>

              {/* Actions */}
              <div className="pt-3 flex gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="save-courier-submit-btn"
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  {editingCourier ? 'Save Configuration' : 'Add Courier & Fire Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: ADD / EDIT DEDICATED WEBHOOK MODAL                  */}
      {/* ============================================================ */}
      {isWebhookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="h-2 w-full bg-gradient-to-r from-rose-500 via-pink-500 to-purple-500 shrink-0" />

            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Webhook className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingWebhook ? `Edit Webhook: ${editingWebhook.name}` : 'Add Courier Webhook Endpoint'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Set up an automated HTTP POST webhook whenever a courier is added or modified.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsWebhookModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWebhook} className="p-6 overflow-y-auto space-y-4">
              {/* Presets Bar */}
              <div className="p-3 bg-gradient-to-r from-rose-50 to-blue-50 rounded-2xl border border-rose-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>Quick Endpoint Presets (সহজ সেটআপ)</span>
                  </span>
                  <span className="text-[10px] text-slate-500">Click to auto-fill</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : '';
                      setWebhookEndpointUrl(`${origin}/api/webhook/courier`);
                      if (!webhookName) setWebhookName('Store Built-in Receiver');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <span>⚡ Store Built-in Receiver</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : '';
                      setWebhookEndpointUrl(`${origin}/api/webhook/steadfast`);
                      if (!webhookName) setWebhookName('Steadfast Listener');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-[11px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <span>📦 Steadfast Listener</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setWebhookEndpointUrl('https://hooks.zapier.com/hooks/catch/');
                      if (!webhookName) setWebhookName('Zapier Courier Alert');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-[11px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <span>🌐 External CRM / Zapier</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Webhook Friendly Name *
                </label>
                <input
                  type="text"
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  placeholder="e.g. Zapier Courier Alert, Discord Logistics Bot, Internal ERP"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Webhook Destination URL *
                  </label>
                  {webhookEndpointUrl.includes('/api/webhook') && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      ✓ Built-in Store Receiver
                    </span>
                  )}
                </div>
                <input
                  type="url"
                  value={webhookEndpointUrl}
                  onChange={(e) => setWebhookEndpointUrl(e.target.value)}
                  placeholder="e.g. /api/webhook/courier or https://hooks.zapier.com/..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Destination endpoint that receives the JSON payload via HTTP POST.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Webhook Secret / Signature Token (Optional)
                </label>
                <input
                  type="text"
                  value={webhookEndpointSecret}
                  onChange={(e) => setWebhookEndpointSecret(e.target.value)}
                  placeholder="e.g. whsec_secret_token_12345"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Passed in the <code className="text-slate-700 font-mono">X-Webhook-Secret</code> header for secure origin authentication.
                </p>
              </div>

              {/* Subscribed Events Checklist */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Subscribe to Events (কোন কোন ঘটনায় ওয়েবহুক ট্রিগার হবে)
                </label>
                <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-white/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes('courier.added')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setWebhookEvents((prev) => [...prev, 'courier.added']);
                        } else {
                          setWebhookEvents((prev) => prev.filter((x) => x !== 'courier.added'));
                        }
                      }}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-900">Whenever a Courier is Added (<code className="font-mono text-rose-600">courier.added</code>)</span>
                      <p className="text-[11px] text-slate-500">Fired immediately whenever a courier provider is added in the panel.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-white/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes('courier.updated')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setWebhookEvents((prev) => [...prev, 'courier.updated']);
                        } else {
                          setWebhookEvents((prev) => prev.filter((x) => x !== 'courier.updated'));
                        }
                      }}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-900">Whenever a Courier is Updated (<code className="font-mono text-blue-600">courier.updated</code>)</span>
                      <p className="text-[11px] text-slate-500">Fired whenever courier credentials or active status are modified.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-white/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes('courier.dispatched')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setWebhookEvents((prev) => [...prev, 'courier.dispatched']);
                        } else {
                          setWebhookEvents((prev) => prev.filter((x) => x !== 'courier.dispatched'));
                        }
                      }}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-900">Whenever an Order is Dispatched (<code className="font-mono text-emerald-600">courier.dispatched</code>)</span>
                      <p className="text-[11px] text-slate-500">Fired when an order waybill or tracking code is generated.</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-white/80 transition-colors">
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes('courier.deleted')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setWebhookEvents((prev) => [...prev, 'courier.deleted']);
                        } else {
                          setWebhookEvents((prev) => prev.filter((x) => x !== 'courier.deleted'));
                        }
                      }}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-slate-900">Whenever a Courier is Deleted (<code className="font-mono text-slate-600">courier.deleted</code>)</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="webhook-active-checkbox"
                  type="checkbox"
                  checked={webhookActive}
                  onChange={(e) => setWebhookActive(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 cursor-pointer"
                />
                <label htmlFor="webhook-active-checkbox" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Enable this Webhook for live dispatch
                </label>
              </div>

              {/* Inline Test Button */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs">
                  <span className="font-bold text-slate-800">Test Webhook Endpoint</span>
                  <p className="text-[11px] text-slate-500">Send an instant test ping with a sample payload.</p>
                </div>
                <button
                  type="button"
                  onClick={handleModalTestWebhook}
                  disabled={modalTestStatus.testing}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Zap className={`w-3.5 h-3.5 text-amber-500 ${modalTestStatus.testing ? 'animate-spin' : ''}`} />
                  <span>{modalTestStatus.testing ? 'Pinging...' : 'Send Test Ping'}</span>
                </button>
              </div>

              {modalTestStatus.result && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    modalTestStatus.result.success
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    {modalTestStatus.result.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{modalTestStatus.result.message}</span>
                  </div>

                  {!modalTestStatus.result.success && !webhookEndpointUrl.includes('/api/webhook') && (
                    <button
                      type="button"
                      onClick={() => {
                        const origin = typeof window !== 'undefined' ? window.location.origin : '';
                        setWebhookEndpointUrl(`${origin}/api/webhook/courier`);
                        setModalTestStatus({ testing: false });
                      }}
                      className="px-2.5 py-1 bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 text-[11px] font-bold rounded-lg shrink-0 cursor-pointer shadow-2xs"
                    >
                      Switch to Store Receiver
                    </button>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 flex gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsWebhookModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  {editingWebhook ? 'Save Webhook' : 'Add Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: WEBHOOK DELIVERY LOGS MODAL                         */}
      {/* ============================================================ */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Webhook Delivery History ({courierWebhookLogs.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Detailed records of automated HTTP POST dispatches for courier events.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {courierWebhookLogs.length > 0 && (
                  <button
                    onClick={clearCourierWebhookLogs}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Clear History
                  </button>
                )}
                <button
                  onClick={() => setIsLogsModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {courierWebhookLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Activity className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold text-slate-500">No Webhook Dispatches Recorded Yet</p>
                  <p className="text-[11px] text-slate-400">
                    Add a courier or trigger a test ping to see live delivery status codes and payloads here.
                  </p>
                </div>
              ) : (
                courierWebhookLogs.map((log) => {
                  const isSuccess = log.status === 'success';

                  return (
                    <div
                      key={log.id}
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold uppercase ${
                              isSuccess
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {log.httpStatus ? `HTTP ${log.httpStatus}` : (isSuccess ? 'Success' : 'Failed')}
                          </span>

                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-200 text-slate-800">
                            {log.event}
                          </span>

                          {log.courierName && (
                            <span className="text-xs font-bold text-slate-700">
                              {log.courierName}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          {log.latencyMs !== undefined && (
                            <span className="font-mono">{log.latencyMs}ms</span>
                          )}
                          <span>•</span>
                          <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </div>
                      </div>

                      <div className="text-[11px] font-mono text-slate-600 truncate bg-white px-2.5 py-1.5 rounded-xl border border-slate-200">
                        {log.webhookUrl}
                      </div>

                      {log.responsePreview && (
                        <div className="text-[11px] font-mono text-slate-500 bg-slate-100 p-2 rounded-xl truncate">
                          Response: {log.responsePreview}
                        </div>
                      )}

                      {/* Expand JSON payload */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setSelectedLogPayload(selectedLogPayload?.id === log.id ? null : log)}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                        >
                          <FileText className="w-3 h-3" />
                          <span>{selectedLogPayload?.id === log.id ? 'Hide Sent Payload' : 'View Sent JSON Payload'}</span>
                        </button>

                        {selectedLogPayload?.id === log.id && (
                          <pre className="mt-2 p-3 bg-slate-900 text-emerald-400 rounded-xl text-[10px] font-mono overflow-x-auto max-h-48 border border-slate-800">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unified Confirm Modal */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        variant={confirmDialog.variant}
      />
    </div>
  );
};
