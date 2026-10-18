import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock3, Facebook, Info, Play, RotateCcw, ShieldCheck } from 'lucide-react';

type Audience = 'page_contacts' | 'website_customers';

export const AdminFacebookBroadcasterTab: React.FC = () => {
  const [pageId, setPageId] = useState('');
  const [audience, setAudience] = useState<Audience>('page_contacts');
  const [messages, setMessages] = useState('Hello {name}, check this out! | Hi {name}, we have an offer. | Hey {name}, don\'t miss this deal!');
  const [minDelay, setMinDelay] = useState(2);
  const [maxDelay, setMaxDelay] = useState(5);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [consoleLines, setConsoleLines] = useState<string[]>(['[SYSTEM] Broadcaster interface ready. Meta API connection has not been configured.']);
  const variations = useMemo(() => messages.split('|').map((item) => item.trim()).filter(Boolean), [messages]);

  const start = () => {
    const next = [
      '[CHECK] Campaign draft validated.',
      `[AUDIENCE] ${audience === 'page_contacts' ? 'Eligible Facebook Page contacts' : 'Website customers with valid messaging permission'}`,
      `[CONFIG] ${variations.length} message variation(s); delay ${Math.min(minDelay, maxDelay).toFixed(1)}s–${Math.max(minDelay, maxDelay).toFixed(1)}s; duplicate skip ${skipDuplicates ? 'enabled' : 'disabled'}.`,
      '[BLOCKED] No message was sent. Configure and verify a Meta-approved Messenger API integration and eligible recipient source before sending.',
    ];
    setConsoleLines((old) => [...old, ...next].slice(-80));
  };

  return (
    <div className="space-y-5 p-3 sm:p-5 text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-xl font-black tracking-tight">Facebook Broadcaster</h2><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">Setup required</span></div>
          <p className="mt-1 text-sm text-slate-500">Campaign drafts, eligible audiences and delivery monitoring</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full bg-amber-500"/> Meta API: Not connected</div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(360px,1.25fr)]">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">Facebook Page ID
            <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="Enter your Facebook Page ID" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal normal-case outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-blue-900">Recipient group</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-800">
              <option value="page_contacts">Facebook Page contacts with messaging eligibility</option>
              <option value="website_customers">Website customers with valid Messenger permission</option>
            </select>
            <p className="mt-2 text-xs leading-5 text-blue-800">Only recipients eligible under Meta’s current messaging rules should be included. Website customers are not automatically eligible just because they placed an order.</p>
          </div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">Message variations <span className="font-normal normal-case">(separate with |)</span>
            <textarea value={messages} onChange={(e) => setMessages(e.target.value)} rows={5} placeholder="Hello {name}, ... | Hi {name}, ..." className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-3 text-sm font-normal normal-case leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <p className="-mt-2 text-xs text-slate-500">Use <code className="rounded bg-slate-100 px-1">{'{name}'}</code> as a first-name placeholder. Current variations: <strong>{variations.length}</strong>.</p>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-bold text-blue-950"><Clock3 size={16}/> Delay range</div><span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">{Math.min(minDelay,maxDelay).toFixed(1)}s – {Math.max(minDelay,maxDelay).toFixed(1)}s</span></div>
            <label className="block text-xs text-slate-600">Minimum: {minDelay.toFixed(1)}s<input type="range" min="1" max="30" step="0.5" value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} className="mt-2 w-full accent-blue-600" /></label>
            <label className="mt-3 block text-xs text-slate-600">Maximum: {maxDelay.toFixed(1)}s<input type="range" min="1" max="60" step="0.5" value={maxDelay} onChange={(e) => setMaxDelay(Number(e.target.value))} className="mt-2 w-full accent-blue-600" /></label>
            <p className="mt-3 text-xs leading-5 text-slate-500">Delay is a pacing setting, not a way to bypass Meta limits or prevent enforcement.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold"><input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="mt-0.5 accent-blue-600"/><span>Skip duplicate recipients <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">A future backend should track delivery history server-side; this demo does not save recipient memory.</span></span></label>
          </div>
          <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white shadow-sm transition hover:bg-blue-800"><Play size={16}/> Validate Campaign Setup</button>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><span>This initial panel does not send messages. The backend, Meta app review/permissions, secure token storage, recipient eligibility checks and webhook-based delivery tracking must be configured first.</span></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111827] text-slate-100 shadow-sm">
          <div className="border-b border-slate-700 bg-slate-800/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-bold"><Activity size={16} className="text-blue-400"/> Live Execution Console</div><span className="rounded-full bg-slate-700 px-2.5 py-1 text-[10px] font-semibold text-slate-300">Draft / Not sending</span></div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-400"><span>Setup validation only</span><span>0%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700"><div className="h-full w-0 rounded-full bg-blue-500"/></div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{[{label:'QUEUED',value:'0',color:'text-blue-400'},{label:'DELIVERED',value:'0',color:'text-emerald-400'},{label:'SKIPPED',value:'0',color:'text-amber-400'},{label:'FAILED',value:'0',color:'text-rose-400'},{label:'REMAINING',value:'0',color:'text-violet-400'}].map((item) => <div key={item.label} className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-center"><div className="text-[9px] tracking-wide text-slate-400">{item.label}</div><div className={`mt-1 text-lg font-black ${item.color}`}>{item.value}</div></div>)}</div>
          </div>
          <div className="min-h-[360px] space-y-2 p-4 font-mono text-[11px] leading-5 sm:min-h-[500px]">{consoleLines.map((line, index) => <p key={`${index}-${line}`} className={line.startsWith('[BLOCKED]') ? 'text-amber-300' : line.startsWith('[CHECK]') ? 'text-emerald-300' : 'text-slate-400'}>{line}</p>)}</div>
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/60 px-4 py-3"><span className="flex items-center gap-2 text-[10px] text-slate-500"><ShieldCheck size={13}/> No token stored in browser</span><button onClick={() => setConsoleLines(['[SYSTEM] Console cleared. No messages were sent.'])} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"><RotateCcw size={12}/> Clear console</button></div>
        </section>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><Info size={16} className="mt-0.5 shrink-0"/><p><strong>Next integration step:</strong> connect a Meta-approved Messenger API through authenticated Cloudflare Worker endpoints. Keep Page Access Tokens in Worker secrets, validate admin permissions server-side, and store eligible recipients, opt-in/consent records and delivery events in D1.</p></div>
    </div>
  );
};
