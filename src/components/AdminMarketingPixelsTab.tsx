import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ExternalLink,
  Info,
  ChevronDown,
  ChevronUp,
  Terminal,
  Send,
  Eye,
  Sliders,
  Check,
  X,
  Copy,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { PixelEventLog } from '../types';

export const AdminMarketingPixelsTab: React.FC = () => {
  const {
    settings,
    updateSettings,
    pixelLogs,
    fireTestPixelEvent,
    clearPixelLogs,
    isMetaActive,
    isTikTokActive,
    isGtmActive,
    showNotification,
  } = useStore();

  // Local form state for pixel settings
  const [formData, setFormData] = useState({
    trackingEnabled: settings.trackingEnabled !== false,
    fbPixelId: settings.fbPixelId || '',
    fbTestEventCode: settings.fbTestEventCode || '',
    tiktokPixelId: settings.tiktokPixelId || '',
    tiktokTestEventCode: settings.tiktokTestEventCode || '',
    gtmId: settings.gtmId || '',
    advancedMatchingEnabled: settings.advancedMatchingEnabled !== false,
    trackingDebugMode: settings.trackingDebugMode !== false,
  });

  useEffect(() => {
    setFormData({
      trackingEnabled: settings.trackingEnabled !== false,
      fbPixelId: settings.fbPixelId || '',
      fbTestEventCode: settings.fbTestEventCode || '',
      tiktokPixelId: settings.tiktokPixelId || '',
      tiktokTestEventCode: settings.tiktokTestEventCode || '',
      gtmId: settings.gtmId || '',
      advancedMatchingEnabled: settings.advancedMatchingEnabled !== false,
      trackingDebugMode: settings.trackingDebugMode !== false,
    });
  }, [settings]);

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isFiringTest, setIsFiringTest] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await updateSettings({
      trackingEnabled: formData.trackingEnabled,
      fbPixelId: formData.fbPixelId.trim(),
      fbTestEventCode: formData.fbTestEventCode.trim(),
      tiktokPixelId: formData.tiktokPixelId.trim(),
      tiktokTestEventCode: formData.tiktokTestEventCode.trim(),
      gtmId: formData.gtmId.trim(),
      advancedMatchingEnabled: formData.advancedMatchingEnabled,
      trackingDebugMode: formData.trackingDebugMode,
    });
    if (res.success) {
      setSaveFeedback(true);
      setTimeout(() => setSaveFeedback(false), 4000);
    }
  };

  const handleTestEvent = (
    type: 'PageView' | 'ViewContent' | 'ProductView' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'
  ) => {
    setIsFiringTest(type);
    try {
      const log = fireTestPixelEvent(type);
      showNotification(
        'success',
        `Test ${type} Dispatched! 🎯`,
        `Event synced across ${log.platforms.map((p) => p.toUpperCase()).join(', ') || 'configured platforms'}.`
      );
    } finally {
      setTimeout(() => setIsFiringTest(null), 600);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-sm border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Enterprise Tracking Engine
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Advanced Matching (SHA-256)
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                BDT Standard Currency
              </span>
            </div>
            <h2 className="font-display font-extrabold text-2xl tracking-tight text-white flex items-center gap-2.5">
              <Activity className="w-6 h-6 text-rose-400" />
              Marketing Pixels & Social Synchronization
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Configure and orchestrate Meta (Facebook) Pixel, TikTok Pixel, and Google Tag Manager (GTM).
              Automatically hashes customer identifiers (email, Bangladeshi phone format) and broadcasts full e-commerce events with zero duplicate scripts.
            </p>
          </div>

          {/* Master Toggle Pill */}
          <div className="shrink-0 flex flex-col items-end gap-1.5 bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/80">
            <span className="text-[11px] font-semibold text-slate-400">Master Tracking Switch</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.trackingEnabled}
                onChange={(e) => setFormData({ ...formData, trackingEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
            <span className={`text-[10px] font-bold flex items-center gap-1 ${formData.trackingEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
              <span className={`w-2 h-2 rounded-full ${formData.trackingEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {formData.trackingEnabled ? 'Broadcasting Active' : 'Tracking Muted'}
            </span>
          </div>
        </div>
      </div>

      {saveFeedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Marketing pixel configuration saved successfully! Active pixel scripts have been synchronized.</span>
        </div>
      )}

      {/* Real-time Status Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Meta Pixel Badge */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isMetaActive
            ? 'bg-blue-50/50 border-blue-200 text-blue-900 shadow-xs'
            : 'bg-white border-slate-200 text-slate-600'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                f
              </div>
              <span className="font-bold text-xs text-slate-900">Meta (Facebook) Pixel</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
              isMetaActive
                ? 'bg-emerald-100 text-emerald-800 flex items-center gap-1'
                : !formData.trackingEnabled
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {isMetaActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />}
              {isMetaActive ? 'Active' : !formData.trackingEnabled ? 'Muted' : 'Not Set'}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 truncate">
            {formData.fbPixelId ? `ID: ${formData.fbPixelId}` : 'No Pixel ID provided'}
          </div>
          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Advanced Matching Enabled (SHA-256)</span>
          </div>
        </div>

        {/* TikTok Pixel Badge */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isTikTokActive
            ? 'bg-slate-900 border-slate-800 text-white shadow-xs'
            : 'bg-white border-slate-200 text-slate-600'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-400 to-rose-500 text-slate-950 flex items-center justify-center font-black text-xs shadow-xs">
                TT
              </div>
              <span className={`font-bold text-xs ${isTikTokActive ? 'text-white' : 'text-slate-900'}`}>TikTok Pixel</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
              isTikTokActive
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1'
                : !formData.trackingEnabled
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {isTikTokActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              {isTikTokActive ? 'Active' : !formData.trackingEnabled ? 'Muted' : 'Not Set'}
            </span>
          </div>
          <div className={`text-[11px] font-mono truncate ${isTikTokActive ? 'text-slate-400' : 'text-slate-500'}`}>
            {formData.tiktokPixelId ? `ID: ${formData.tiktokPixelId}` : 'No Pixel ID provided'}
          </div>
          <div className={`mt-2 text-[10px] flex items-center gap-1 ${isTikTokActive ? 'text-slate-300' : 'text-slate-500'}`}>
            <ShieldCheck className="w-3 h-3 text-cyan-400" />
            <span>ttq.identify() User Hashing Active</span>
          </div>
        </div>

        {/* Google Tag Manager Badge */}
        <div className={`p-4 rounded-2xl border transition-all ${
          isGtmActive
            ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900 shadow-xs'
            : 'bg-white border-slate-200 text-slate-600'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                GTM
              </div>
              <span className="font-bold text-xs text-slate-900">Google Tag Manager</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
              isGtmActive
                ? 'bg-emerald-100 text-emerald-800 flex items-center gap-1'
                : !formData.trackingEnabled
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {isGtmActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />}
              {isGtmActive ? 'Active' : !formData.trackingEnabled ? 'Muted' : 'Not Set'}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 truncate">
            {formData.gtmId ? `Container: ${formData.gtmId}` : 'No Container ID provided'}
          </div>
          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
            <Layers className="w-3 h-3 text-indigo-600" />
            <span>window.dataLayer standard pushes</span>
          </div>
        </div>
      </div>

      {/* Main Configuration Form */}
      <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
        <div>
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Sliders className="w-4 h-4 text-slate-600" />
            Platform Credentials & Test Event Codes
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter your tracking IDs. The system uses non-blocking asynchronous script injection that ensures scripts are initialized once and never duplicated.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Meta Pixel Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                Meta (Facebook) Pixel ID
              </span>
              <span className="text-[10px] font-normal text-slate-400">e.g. 1098472918234851</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.fbPixelId}
                onChange={(e) => setFormData({ ...formData, fbPixelId: e.target.value })}
                placeholder="Enter 15-16 digit Meta Pixel ID"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
              {formData.fbPixelId && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(formData.fbPixelId, 'fb')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  title="Copy Pixel ID"
                >
                  {copiedKey === 'fb' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              Find this in your Meta Business Suite &gt; Events Manager &gt; Data Sources.
            </p>
          </div>

          {/* Meta Test Event Code */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>Meta Test Event Code (Optional)</span>
              <span className="text-[10px] font-normal text-slate-400">e.g. TEST12345</span>
            </label>
            <input
              type="text"
              value={formData.fbTestEventCode}
              onChange={(e) => setFormData({ ...formData, fbTestEventCode: e.target.value })}
              placeholder="Paste code from Events Manager Test Events tab"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
            <p className="text-[10px] text-slate-400">
              When present, sends testEventCode with all fbq calls so events show instantly in Meta Test Events.
            </p>
          </div>

          {/* TikTok Pixel Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-950" />
                TikTok Pixel ID
              </span>
              <span className="text-[10px] font-normal text-slate-400">e.g. CH7F8G9H0J1K2L3M4N</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.tiktokPixelId}
                onChange={(e) => setFormData({ ...formData, tiktokPixelId: e.target.value })}
                placeholder="Enter TikTok Pixel ID"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800 transition-colors"
              />
              {formData.tiktokPixelId && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(formData.tiktokPixelId, 'tt')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  title="Copy Pixel ID"
                >
                  {copiedKey === 'tt' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              Found in TikTok Ads Manager &gt; Assets &gt; Events &gt; Web Events.
            </p>
          </div>

          {/* TikTok Test Event Code */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>TikTok Test Event Code (Optional)</span>
              <span className="text-[10px] font-normal text-slate-400">e.g. TEST_TT_99</span>
            </label>
            <input
              type="text"
              value={formData.tiktokTestEventCode}
              onChange={(e) => setFormData({ ...formData, tiktokTestEventCode: e.target.value })}
              placeholder="Paste code from TikTok Events Manager Test Events"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-800 transition-colors"
            />
            <p className="text-[10px] text-slate-400">
              Enables live event verification in TikTok Events Manager test console.
            </p>
          </div>

          {/* GTM Container ID Field */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                Google Tag Manager (GTM) Container ID
              </span>
              <span className="text-[10px] font-normal text-slate-400">e.g. GTM-RDN8429</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.gtmId}
                onChange={(e) => setFormData({ ...formData, gtmId: e.target.value })}
                placeholder="Enter GTM-XXXXXXX"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              />
              {formData.gtmId && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(formData.gtmId, 'gtm')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  title="Copy GTM ID"
                >
                  {copiedKey === 'gtm' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              Injects gtm.js and streams e-commerce dataLayer pushes for Google Analytics 4 (GA4), Google Ads Conversion Tracking, and custom server-side tags.
            </p>
          </div>
        </div>

        {/* Advanced Matching & Debugging Options */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Advanced Matching (SHA-256)
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Hashes customer emails and Bangladeshi phone numbers (formatted to standard E.164 <code className="text-slate-700 bg-slate-200/60 px-1 py-0.5 rounded">8801XXXXXXXXX</code>)
                before broadcasting to Meta and TikTok. Boosts event match quality to &gt;90%.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={formData.advancedMatchingEnabled}
                onChange={(e) => setFormData({ ...formData, advancedMatchingEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-indigo-600" />
                Browser Console Debug Logger
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Prints formatted console logs with event name, platform targets, and full payloads in browser DevTools. Useful for live developer inspection.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={formData.trackingDebugMode}
                onChange={(e) => setFormData({ ...formData, trackingDebugMode: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer flex items-center gap-2"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            Save & Sync Tracking Configuration
          </button>
        </div>
      </form>

      {/* Live Event Diagnostics & Verification Console */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Terminal className="w-4 h-4 text-rose-600" />
              Live Event Inspector & Diagnostics Console
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulate or monitor real e-commerce events with payload validation and SHA-256 Advanced Matching inspection.
            </p>
          </div>

          <button
            type="button"
            onClick={clearPixelLogs}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear Activity Log
          </button>
        </div>

        {/* Quick Test Firing Buttons */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-rose-600" />
            Fire Live Test Pixel Events:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isFiringTest !== null}
              onClick={() => handleTestEvent('PageView')}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-800 shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isFiringTest === 'PageView' ? 'Firing...' : 'Test PageView'}
            </button>
            <button
              type="button"
              disabled={isFiringTest !== null}
              onClick={() => handleTestEvent('ViewContent')}
              className="px-3 py-1.5 bg-white border border-blue-200 hover:bg-blue-50 text-blue-800 rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isFiringTest === 'ViewContent' ? 'Firing...' : 'Test ViewContent'}
            </button>
            <button
              type="button"
              disabled={isFiringTest !== null}
              onClick={() => handleTestEvent('ProductView')}
              className="px-3 py-1.5 bg-white border border-sky-200 hover:bg-sky-50 text-sky-800 rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isFiringTest === 'ProductView' ? 'Firing...' : 'Test ProductView'}
            </button>
            <button
              type="button"
              disabled={isFiringTest !== null}
              onClick={() => handleTestEvent('AddToCart')}
              className="px-3 py-1.5 bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isFiringTest === 'AddToCart' ? 'Firing...' : 'Test AddToCart'}
            </button>
            <button
              type="button"
              disabled={isFiringTest !== null}
              onClick={() => handleTestEvent('InitiateCheckout')}
              className="px-3 py-1.5 bg-white border border-purple-200 hover:bg-purple-50 text-purple-800 rounded-xl text-xs font-bold shadow-2xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isFiringTest === 'InitiateCheckout' ? 'Firing...' : 'Test InitiateCheckout'}
            </button>
            <button
              type="button"
              disabled={isFiringTest !== null}
              onClick={() => handleTestEvent('Purchase')}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isFiringTest === 'Purchase' ? 'Firing...' : 'Test Purchase (৳ BDT)'}
            </button>
          </div>
        </div>

        {/* Real-time Events Stream */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          {pixelLogs.length === 0 ? (
            <div className="py-12 text-center space-y-2 bg-slate-50/50">
              <Activity className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">No Pixel Events Logged Yet</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Click any of the test buttons above or browse the storefront (view product, add to cart, or place an order) to see events stream here in real time.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto font-sans">
              {pixelLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const isPurchase = log.eventName === 'Purchase';
                const isCart = log.eventName === 'AddToCart' || log.eventName === 'InitiateCheckout';

                return (
                  <div key={log.id} className="p-3.5 hover:bg-slate-50/80 transition-colors">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] font-mono text-slate-400">{log.timestamp}</span>
                        
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isPurchase
                            ? 'bg-rose-100 text-rose-800'
                            : isCart
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.eventName === 'ViewContent'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {log.eventName}
                        </span>

                        {log.value !== undefined && (
                          <span className="text-xs font-bold font-mono text-slate-800">
                            ৳{log.value.toLocaleString()} {log.currency || 'BDT'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Platform reach badges */}
                        <div className="flex items-center gap-1">
                          {log.platforms.map((plat) => (
                            <span
                              key={plat}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                plat === 'meta'
                                  ? 'bg-blue-600 text-white'
                                  : plat === 'tiktok'
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-indigo-600 text-white'
                              }`}
                            >
                              {plat}
                            </span>
                          ))}
                          {log.platforms.length === 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              {log.status === 'skipped' ? 'Skipped (Muted)' : 'No active targets'}
                            </span>
                          )}
                        </div>

                        {/* User match data badge */}
                        {log.hasUserData && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>Matched</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                          title="Inspect Event Payload JSON"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expandable JSON Payload Inspector */}
                    {isExpanded && (
                      <div className="mt-3 p-3 bg-slate-900 rounded-xl text-slate-200 font-mono text-[11px] overflow-x-auto space-y-2">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1">
                          <span>Event Payload Inspector</span>
                          {log.userDataSummary && (
                            <span className="text-emerald-400">
                              SHA-256 Hashed Identifiers: {log.userDataSummary}
                            </span>
                          )}
                        </div>
                        <pre className="text-emerald-300">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Engineer Verification & Testing Guide */}
      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 space-y-4">
        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-slate-600" />
          Analytics Engineer Verification Checklist:
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
          <div className="p-3 bg-white rounded-2xl border border-slate-200 space-y-1">
            <span className="font-bold text-blue-700 flex items-center gap-1">
              1. Meta Pixel Helper
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Install the official Chrome extension. Navigate the storefront and confirm green checkmarks for PageView, ViewContent, AddToCart, and Purchase with currency BDT.
            </p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-900 flex items-center gap-1">
              2. TikTok Pixel Helper
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Verify with TikTok Pixel Helper 2.0. Events like ViewContent, AddToCart, and CompletePayment will reflect with accurate product contents.
            </p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-slate-200 space-y-1">
            <span className="font-bold text-indigo-700 flex items-center gap-1">
              3. Google Tag Assistant
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Connect GTM Tag Assistant to view dataLayer pushes matching the GA4 standard e-commerce specification with hashed user data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
