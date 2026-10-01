import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  Package,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Plus,
  Trash2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Percent,
  FileText,
  CreditCard,
  Truck,
  Megaphone,
  Briefcase,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ExpenseType, ProfitAnalyticsSummary } from '../types';

export const AdminProfitAnalyticsTab: React.FC = () => {
  const {
    currentUser,
    profitSummary,
    fetchProfitAnalytics,
    expenses,
    fetchExpenses,
    addExpense,
    deleteExpense,
    showNotification,
  } = useStore();

  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'month' | 'previous_month' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // New Expense Form State
  const [newExpenseType, setNewExpenseType] = useState<ExpenseType>('facebook_ads');
  const [newExpenseAmount, setNewExpenseAmount] = useState<string>('');
  const [newExpenseDate, setNewExpenseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [newExpenseNote, setNewExpenseNote] = useState<string>('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!isSuperAdmin) return;
    setIsLoading(true);
    try {
      if (selectedPeriod === 'custom') {
        await Promise.allSettled([
          fetchProfitAnalytics('custom', { startDate: customStartDate, endDate: customEndDate }),
          fetchExpenses({ startDate: customStartDate, endDate: customEndDate }),
        ]);
      } else {
        await Promise.allSettled([
          fetchProfitAnalytics(selectedPeriod),
          fetchExpenses(),
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSuperAdmin, selectedPeriod, customStartDate, customEndDate, fetchProfitAnalytics, fetchExpenses]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-red-200 shadow-sm max-w-2xl mx-auto my-12">
        <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-600">
          Profit and Cost Analytics are strictly confidential internal business data accessible only to Super Administrators.
        </p>
      </div>
    );
  }

  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(newExpenseAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showNotification('error', 'Invalid Amount', 'Please enter a valid expense amount greater than 0.');
      return;
    }
    if (!newExpenseDate) {
      showNotification('error', 'Invalid Date', 'Please select a date for this expense.');
      return;
    }

    setIsSubmittingExpense(true);
    try {
      const ok = await addExpense({
        expenseType: newExpenseType,
        amount: amountNum,
        date: newExpenseDate,
        note: newExpenseNote.trim() || undefined,
      });

      if (ok) {
        setNewExpenseAmount('');
        setNewExpenseNote('');
        // Reload current period to update net profit
        loadData();
      }
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (window.confirm('Are you sure you want to permanently delete this expense record?')) {
      await deleteExpense(id);
      loadData();
    }
  };

  const summary: ProfitAnalyticsSummary = profitSummary || {
    period: selectedPeriod === 'previous_month' ? 'month' : selectedPeriod,
    revenue: 0,
    productCost: 0,
    grossProfit: 0,
    expenses: 0,
    netProfit: 0,
    totalOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    returnedOrders: 0,
    productsSold: 0,
    averageOrderValue: 0,
    averageProfitPerOrder: 0,
    expenseBreakdown: {
      facebookAds: 0,
      courier: 0,
      paymentGateway: 0,
      other: 0,
    },
  };

  const grossMargin = summary.revenue > 0 ? Math.round((summary.grossProfit / summary.revenue) * 100) : 0;
  const netMargin = summary.revenue > 0 ? Math.round((summary.netProfit / summary.revenue) * 100) : 0;

  const expenseTypeLabels: Record<ExpenseType, { label: string; icon: any; color: string }> = {
    facebook_ads: { label: 'Meta / Facebook Ads', icon: Megaphone, color: 'blue' },
    courier: { label: 'Courier & Delivery Cost', icon: Truck, color: 'cyan' },
    payment_gateway: { label: 'Payment Gateway Fees', icon: CreditCard, color: 'purple' },
    other: { label: 'Other Operating Expenses', icon: Briefcase, color: 'amber' },
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-inner">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-white">
                  Profit & Financial Analytics
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <ShieldCheck className="w-3 h-3" />
                  Super Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Authoritative Cloudflare D1 buying cost, historical profit snapshots, and net profit expense tracking.
              </p>
            </div>
          </div>
        </div>

        {/* Refresh & Controls */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
            title="Refresh analytics from Cloudflare D1"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* 2. Period Selector Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Period:
          </span>
          <button
            type="button"
            onClick={() => setSelectedPeriod('today')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedPeriod === 'today'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Today's Profit
          </button>
          <button
            type="button"
            onClick={() => setSelectedPeriod('month')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedPeriod === 'month'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Current Month
          </button>
          <button
            type="button"
            onClick={() => setSelectedPeriod('previous_month')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedPeriod === 'previous_month'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Previous Month
          </button>
          <button
            type="button"
            onClick={() => setSelectedPeriod('custom')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedPeriod === 'custom'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Custom Date Range
          </button>
        </div>

        {/* Custom Date Pickers */}
        {selectedPeriod === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 p-2 rounded-xl border border-slate-200">
            <span className="font-medium text-slate-600">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs font-medium focus:ring-1 focus:ring-emerald-500"
            />
            <span className="font-medium text-slate-600">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800 text-xs font-medium focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* 3. Primary Financial Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Sales Revenue */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Sales Revenue</span>
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-display text-slate-900">
            ৳ {summary.revenue.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Subtotal of completed sales</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
        </div>

        {/* Product Cost */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Total Product Cost</span>
            <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-display text-amber-700">
            ৳ {summary.productCost.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Buying Price × Quantity snapshot
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
        </div>

        {/* Gross Profit */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Gross Profit</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-display text-emerald-700">
            ৳ {summary.grossProfit.toLocaleString()}
          </div>
          <div className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
            <span>Margin: {grossMargin}%</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* Total Expenses */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Total Expenses</span>
            <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-display text-rose-700">
            ৳ {summary.expenses.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Ads + Courier + Fees + Other
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500" />
        </div>

        {/* Net Profit */}
        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Net Profit</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className={`text-2xl font-bold font-display ${summary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ৳ {summary.netProfit.toLocaleString()}
          </div>
          <div className="text-[11px] font-bold text-slate-300 mt-1 flex items-center gap-1">
            <span>Net Margin: {netMargin}%</span>
          </div>
          <div className={`absolute bottom-0 left-0 right-0 h-1.5 ${summary.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </div>
      </div>

      {/* 4. Operational Breakdown Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Orders</div>
          <div className="text-xl font-bold text-slate-800 mt-1">{summary.totalOrders}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Delivered</div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{summary.completedOrders}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center">
          <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Cancelled</div>
          <div className="text-xl font-bold text-rose-600 mt-1">{summary.cancelledOrders}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center">
          <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Returned</div>
          <div className="text-xl font-bold text-amber-700 mt-1">{summary.returnedOrders}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Units Sold</div>
          <div className="text-xl font-bold text-slate-800 mt-1">{summary.productsSold}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Avg Order Value</div>
          <div className="text-xl font-bold text-slate-800 mt-1">৳ {summary.averageOrderValue.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center col-span-2 sm:col-span-1">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Avg Profit / Order</div>
          <div className="text-xl font-bold text-emerald-700 mt-1">৳ {summary.averageProfitPerOrder.toLocaleString()}</div>
        </div>
      </div>

      {/* 5. Expense Breakdown & Expense Entry System */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Expense Breakdown & List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Categorized Expense Breakdown Cards */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              Expense Breakdown ({selectedPeriod})
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl">
                <div className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-blue-600" />
                  Meta / FB Ads
                </div>
                <div className="text-lg font-bold text-blue-950 mt-1">
                  ৳ {(summary.expenseBreakdown?.facebookAds || 0).toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 bg-cyan-50/70 border border-cyan-100 rounded-2xl">
                <div className="text-[11px] font-bold text-cyan-900 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-cyan-600" />
                  Courier Cost
                </div>
                <div className="text-lg font-bold text-cyan-950 mt-1">
                  ৳ {(summary.expenseBreakdown?.courier || 0).toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 bg-purple-50/70 border border-purple-100 rounded-2xl">
                <div className="text-[11px] font-bold text-purple-900 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                  Gateway Fees
                </div>
                <div className="text-lg font-bold text-purple-950 mt-1">
                  ৳ {(summary.expenseBreakdown?.paymentGateway || 0).toLocaleString()}
                </div>
              </div>

              <div className="p-3.5 bg-amber-50/70 border border-amber-100 rounded-2xl">
                <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-amber-600" />
                  Other Expenses
                </div>
                <div className="text-lg font-bold text-amber-950 mt-1">
                  ৳ {(summary.expenseBreakdown?.other || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Recorded Expenses History Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">Recorded Expenses Log</h3>
                <p className="text-xs text-slate-500">
                  {expenses.length} record(s) persisted in Cloudflare D1
                </p>
              </div>
            </div>

            {expenses.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium">No expenses recorded yet.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Use the form on the right to track Facebook Ads, Courier costs, or other overheads.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Expense Type</th>
                      <th className="py-3 px-4">Amount (BDT)</th>
                      <th className="py-3 px-4">Note</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.map((exp) => {
                      const meta = expenseTypeLabels[exp.expenseType] || expenseTypeLabels.other;
                      const Icon = meta.icon;
                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {exp.date}
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800">
                              <Icon className="w-3 h-3 text-slate-600" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            ৳ {exp.amount.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate">
                            {exp.note || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete expense"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Add New Expense Form */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 self-start">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Record New Expense</h3>
              <p className="text-[11px] text-slate-500">Direct Cloudflare D1 persistence</p>
            </div>
          </div>

          <form onSubmit={handleAddExpenseSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Expense Category *
              </label>
              <select
                value={newExpenseType}
                onChange={(e) => setNewExpenseType(e.target.value as ExpenseType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                required
              >
                <option value="facebook_ads">Meta / Facebook Ads Cost</option>
                <option value="courier">Courier / Delivery Cost</option>
                <option value="payment_gateway">Payment Gateway Fees</option>
                <option value="other">Other Operating Expenses</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Amount (BDT ৳) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">৳</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g. 1500"
                  value={newExpenseAmount}
                  onChange={(e) => setNewExpenseAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={newExpenseDate}
                onChange={(e) => setNewExpenseDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Note / Description (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Meta ads campaign #3 or packaging envelopes"
                value={newExpenseNote}
                onChange={(e) => setNewExpenseNote(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingExpense}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              {isSubmittingExpense ? 'Saving to D1...' : 'Add Expense Record'}
            </button>
          </form>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 leading-relaxed">
            <span className="font-bold text-slate-700 block mb-0.5">How Net Profit is calculated:</span>
            Gross Profit minus all recorded operating expenses. Changing or adding expenses immediately recalculates Net Profit.
          </div>
        </div>
      </div>
    </div>
  );
};
