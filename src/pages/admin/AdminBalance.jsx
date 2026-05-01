import { useEffect, useState, useCallback } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';

const fmt = (n, sym = '$') =>
  `${sym}${Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

const today = () => new Date().toISOString().slice(0, 10);

const IcBack   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
const IcScissors = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 2v4m0 0a2 2 0 100 4 2 2 0 000-4zm0 4l12 6M6 22v-4m0 0a2 2 0 110-4 2 2 0 010 4zm0-4l12-6" /></svg>;
const IcRefresh = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
const IcChevron = ({ open }) => <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;

export default function AdminBalance() {
  const { profile } = useAuth();
  const sym = profile?.currency_symbol || '$';

  const [activeTab, setActiveTab] = useState('vendedor');

  // Sellers
  const [sellers, setSellers] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState('');

  // Filters (shared between tabs where applicable)
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [lotteryId, setLotteryId]   = useState('');
  const [drawTimeId, setDrawTimeId] = useState('');
  const [lotteries, setLotteries]   = useState([]);
  const [drawTimes, setDrawTimes]   = useState([]);

  // "Hoy" tab date
  const [todayFilter, setTodayFilter] = useState(today());

  // Data
  const [balance, setBalance]       = useState(null);
  const [detail, setDetail]         = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [allSellers, setAllSellers] = useState([]);
  const [showDetail, setShowDetail] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  // Loading
  const [loading, setLoading]       = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  // Settlement modal
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount]       = useState('');
  const [settleNotes, setSettleNotes]         = useState('');
  const [settling, setSettling]               = useState(false);
  const [settleError, setSettleError]         = useState('');

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    loadSellers();
    loadLotteries();
  }, [profile]);

  useEffect(() => {
    if (lotteryId) loadDrawTimes(lotteryId);
    else { setDrawTimes([]); setDrawTimeId(''); }
  }, [lotteryId]);

  useEffect(() => {
    if (selectedSellerId && activeTab === 'vendedor') loadBalance();
  }, [selectedSellerId, dateFrom, dateTo, lotteryId, drawTimeId]);

  useEffect(() => {
    if (activeTab === 'hoy') loadAllSellers();
  }, [activeTab, todayFilter, lotteryId, drawTimeId]);

  // ── Loaders ───────────────────────────────────────────────
  async function loadSellers() {
    const { data } = await db.from('profiles')
      .select('id, full_name, seller_percentage')
      .eq('parent_admin_id', profile.id)
      .eq('role', 'seller')
      .eq('is_active', true)
      .order('full_name');
    setSellers(data || []);
  }

  async function loadLotteries() {
    const { data } = await db.from('lotteries')
      .select('id, display_name')
      .eq('admin_id', profile.id)
      .eq('is_active', true)
      .order('display_name');
    setLotteries(data || []);
  }

  async function loadDrawTimes(lotId) {
    const { data } = await db.from('draw_times')
      .select('id, time_label')
      .eq('lottery_id', lotId)
      .eq('is_active', true)
      .order('time_label');
    setDrawTimes(data || []);
  }

  const loadBalance = useCallback(async () => {
    if (!selectedSellerId) return;
    setLoading(true);
    try {
      const params = {
        p_seller_id:    selectedSellerId,
        p_admin_id:     profile.id,
        p_date_from:    dateFrom    || null,
        p_date_to:      dateTo      || null,
        p_lottery_id:   lotteryId   || null,
        p_draw_time_id: drawTimeId  || null,
      };
      const [{ data: balData }, { data: detData }, { data: settData }] = await Promise.all([
        db.rpc('get_seller_balance',        params),
        db.rpc('get_seller_balance_detail', params),
        db.rpc('get_settlements_history',   { p_admin_id: profile.id, p_seller_id: selectedSellerId }),
      ]);
      setBalance(balData?.[0] || null);
      setDetail(detData || []);
      setSettlements(settData || []);
    } finally {
      setLoading(false);
    }
  }, [selectedSellerId, dateFrom, dateTo, lotteryId, drawTimeId, profile]);

  async function loadAllSellers() {
    setLoadingAll(true);
    try {
      const { data } = await db.rpc('get_all_sellers_balance', {
        p_admin_id:     profile.id,
        p_date_from:    todayFilter || null,
        p_date_to:      todayFilter || null,
        p_lottery_id:   lotteryId   || null,
        p_draw_time_id: drawTimeId  || null,
      });
      setAllSellers(data || []);
    } finally {
      setLoadingAll(false);
    }
  }

  // ── Settlement ────────────────────────────────────────────
  async function handleSettle() {
    const rawAmount = parseFloat(settleAmount);
    const currentBalance = Number(balance?.balance || 0);
    const maxAmount = Math.abs(currentBalance);

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      setSettleError('Ingresa un monto valido mayor que 0');
      return;
    }
    if (rawAmount > maxAmount) {
      setSettleError(`El monto no puede ser mayor que ${fmt(maxAmount, sym)}`);
      return;
    }

    setSettling(true);
    setSettleError('');
    try {
      const signedAmount = currentBalance < 0 ? -rawAmount : rawAmount;
      const { error } = await db.rpc('create_settlement', {
        p_admin_id:   profile.id,
        p_seller_id:  selectedSellerId,
        p_amount:     signedAmount,
        p_notes:      settleNotes.trim() || null,
      });
      if (error) throw error;
      setShowSettleModal(false);
      setSettleAmount('');
      setSettleNotes('');
      await loadBalance();
    } catch (err) {
      setSettleError(err.message || 'Error al crear el corte');
    } finally {
      setSettling(false);
    }
  }

  // ── Filter bar helpers ────────────────────────────────────
  const hasFilters = dateFrom || dateTo || lotteryId || drawTimeId;
  function clearFilters() {
    setDateFrom(''); setDateTo(''); setLotteryId(''); setDrawTimeId('');
  }

  // ── Helpers ───────────────────────────────────────────────
  function balanceColor(n) {
    const v = Number(n || 0);
    if (v > 0) return 'text-emerald-400';
    if (v < 0) return 'text-rose-400';
    return 'text-slate-400';
  }

  function balanceLabel(n, sym) {
    const v = Number(n || 0);
    if (v > 0) return `${fmt(v, sym)} a cobrar`;
    if (v < 0) return `${fmt(Math.abs(v), sym)} a pagar`;
    return `${fmt(0, sym)} (sin deuda)`;
  }

  const lastSettlement = settlements[0] || null;
  const previousPending = lastSettlement
    ? Number(lastSettlement.balance_at_settlement || 0) - Number(lastSettlement.amount || 0)
    : 0;

  // ── Totals for "Hoy" tab ─────────────────────────────────
  const totals = allSellers.reduce(
    (acc, s) => ({
      sales:   acc.sales   + Number(s.total_sales       || 0),
      comm:    acc.comm    + Number(s.total_commission  || 0),
      admin:   acc.admin   + Number(s.admin_part        || 0),
      prizes:  acc.prizes  + Number(s.total_prizes_paid || 0),
      balance: acc.balance + Number(s.balance           || 0),
    }),
    { sales: 0, comm: 0, admin: 0, prizes: 0, balance: 0 }
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-5 mt-2 pb-10">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-white">Balance</h1>
        <p className="text-xs text-slate-500 mt-0.5">Cuenta corriente vendedor-admin</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/60 rounded-2xl p-1">
        {[
          { key: 'vendedor', label: 'Por Vendedor' },
          { key: 'hoy',      label: 'Resumen del Día' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition ${
              activeTab === tab.key
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: POR VENDEDOR ── */}
      {activeTab === 'vendedor' && (
        <>
          {/* Seller selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Vendedor</label>
            <select
              value={selectedSellerId}
              onChange={e => setSelectedSellerId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Seleccionar vendedor —</option>
              {sellers.map(s => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>

          {/* Filters */}
          {selectedSellerId && (
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap items-center">
                <input
                  type="date" value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="flex-1 min-w-[130px] bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-slate-500 text-xs">—</span>
                <input
                  type="date" value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="flex-1 min-w-[130px] bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <select
                  value={lotteryId}
                  onChange={e => setLotteryId(e.target.value)}
                  className="flex-1 min-w-[130px] bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Todas las loterías</option>
                  {lotteries.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
                </select>
                {drawTimes.length > 0 && (
                  <select
                    value={drawTimeId}
                    onChange={e => setDrawTimeId(e.target.value)}
                    className="flex-1 min-w-[130px] bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Todos los sorteos</option>
                    {drawTimes.map(d => <option key={d.id} value={d.id}>{d.time_label}</option>)}
                  </select>
                )}
                {hasFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl transition whitespace-nowrap"
                  >
                    ✕ Limpiar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Balance content */}
          {loading && (
            <p className="text-center text-slate-500 text-sm py-10">Cargando...</p>
          )}

          {!loading && selectedSellerId && balance && (
            <>
              {/* Period indicator */}
              <p className="text-xs text-slate-500 text-center">
                Período: {fmtDate(balance.period_start)} → {fmtDate(balance.period_end)}
              </p>

              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Total recaudado</p>
                  <p className="text-lg font-bold text-white">{fmt(balance.total_sales, sym)}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Comisión vendedor ({Number(balance.commission_pct || 0).toFixed(1)}%)</p>
                  <p className="text-lg font-bold text-violet-400">{fmt(balance.total_commission, sym)}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Parte del admin</p>
                  <p className="text-lg font-bold text-blue-400">{fmt(balance.admin_part, sym)}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Premios pagados</p>
                  <p className="text-lg font-bold text-amber-400">{fmt(balance.total_prizes_paid, sym)}</p>
                </div>
                {previousPending !== 0 && (
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 col-span-2">
                    <p className="text-xs text-slate-400 mb-1">Saldo pendiente anterior</p>
                    <p className={`text-lg font-bold ${balanceColor(previousPending)}`}>{fmt(previousPending, sym)}</p>
                  </div>
                )}
              </div>

              {/* Balance highlight */}
              <div className={`rounded-2xl p-5 border ${
                Number(balance.balance) >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-rose-500/10 border-rose-500/30'
              }`}>
                <p className="text-xs text-slate-400 mb-1 text-center">Balance actual</p>
                <p className={`text-3xl font-bold text-center ${balanceColor(balance.balance)}`}>
                  {balanceLabel(balance.balance, sym)}
                </p>
                <p className={`text-xs text-center mt-1 ${Number(balance.balance) >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                  {Number(balance.balance) >= 0 ? 'Vendedor debe al admin' : 'Admin debe al vendedor'}
                </p>
              </div>

              {/* Actions row */}
              <div className="flex gap-3">
                <button
                  onClick={loadBalance}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl transition"
                >
                  <IcRefresh /> Actualizar
                </button>
                <button
                  onClick={() => {
                    setSettleAmount(Math.abs(Number(balance?.balance || 0)).toFixed(2));
                    setSettleNotes('');
                    setSettleError('');
                    setShowSettleModal(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 rounded-xl transition"
                >
                  <IcScissors /> Hacer corte
                </button>
              </div>

              {/* Daily breakdown */}
              <div>
                <button
                  onClick={() => setShowDetail(v => !v)}
                  className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm font-semibold text-white hover:border-slate-600 transition"
                >
                  Detalle por día
                  <IcChevron open={showDetail} />
                </button>

                {showDetail && (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-slate-700">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-800 text-slate-400">
                          <th className="px-3 py-2.5 text-left font-semibold">Fecha</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Recaudado</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Comisión</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Admin</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Premios</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Sin movimientos en el período</td>
                          </tr>
                        ) : detail.map((row, i) => (
                          <tr key={i} className={`border-t border-slate-700/50 ${i % 2 === 0 ? 'bg-slate-900/50' : 'bg-slate-800/30'}`}>
                            <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{fmtDate(row.day)}</td>
                            <td className="px-3 py-2.5 text-right text-white">{fmt(row.total_sales, sym)}</td>
                            <td className="px-3 py-2.5 text-right text-violet-400">{fmt(row.total_commission, sym)}</td>
                            <td className="px-3 py-2.5 text-right text-blue-400">{fmt(row.admin_part, sym)}</td>
                            <td className="px-3 py-2.5 text-right text-amber-400">{fmt(row.prizes_paid, sym)}</td>
                            <td className={`px-3 py-2.5 text-right font-semibold ${balanceColor(row.balance_day)}`}>
                              {fmt(row.balance_day, sym)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Settlements history */}
              <div>
                <button
                  onClick={() => setShowHistory(v => !v)}
                  className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm font-semibold text-white hover:border-slate-600 transition"
                >
                  Historial de cortes ({settlements.length})
                  <IcChevron open={showHistory} />
                </button>

                {showHistory && (
                  <div className="mt-2 space-y-2">
                    {settlements.length === 0 ? (
                      <p className="text-center text-slate-500 text-xs py-4">Sin cortes registrados</p>
                    ) : settlements.map(s => (
                      <div key={s.id} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-400">
                              {fmtDate(s.period_start)} → {fmtDate(s.period_end)}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Corte: {new Date(s.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                            {s.notes && <p className="text-xs text-slate-400 mt-1 italic">"{s.notes}"</p>}
                            <div className="flex gap-3 mt-1.5 text-xs text-slate-500">
                              <span>Liquidado: <span className={Number(s.amount || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{fmt(s.amount, sym)}</span></span>
                              <span>Ventas: <span className="text-slate-300">{fmt(s.total_sales, sym)}</span></span>
                              <span>Premios: <span className="text-amber-400">{fmt(s.total_prizes_paid, sym)}</span></span>
                            </div>
                            {Number(s.balance_at_settlement || 0) !== Number(s.amount || 0) && (
                              <p className={`text-xs mt-1 ${balanceColor(Number(s.balance_at_settlement || 0) - Number(s.amount || 0))}`}>
                                Pendiente despues del corte: {fmt(Number(s.balance_at_settlement || 0) - Number(s.amount || 0), sym)}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-slate-500 mb-0.5">Balance</p>
                            <p className={`text-base font-bold ${balanceColor(s.balance_at_settlement)}`}>
                              {fmt(s.balance_at_settlement, sym)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {!loading && !selectedSellerId && (
            <div className="text-center py-16">
              <p className="text-slate-500 text-sm">Selecciona un vendedor para ver su balance</p>
            </div>
          )}
        </>
      )}

      {/* ── TAB: RESUMEN DEL DÍA ── */}
      {activeTab === 'hoy' && (
        <>
          {/* Filters for "Hoy" tab */}
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-slate-400 mb-1">Fecha</label>
                <input
                  type="date" value={todayFilter}
                  onChange={e => setTodayFilter(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-slate-400 mb-1">Lotería</label>
                <select
                  value={lotteryId}
                  onChange={e => setLotteryId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Todas</option>
                  {lotteries.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
                </select>
              </div>
              {drawTimes.length > 0 && (
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs text-slate-400 mb-1">Sorteo</label>
                  <select
                    value={drawTimeId}
                    onChange={e => setDrawTimeId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Todos</option>
                    {drawTimes.map(d => <option key={d.id} value={d.id}>{d.time_label}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={loadAllSellers}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl transition"
              >
                <IcRefresh /> Actualizar
              </button>
            </div>
          </div>

          {/* All sellers table */}
          {loadingAll ? (
            <p className="text-center text-slate-500 text-sm py-10">Cargando...</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800 text-slate-400">
                    <th className="px-3 py-2.5 text-left font-semibold">Vendedor</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Recaudado</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Comisión</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Admin</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Premios</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {allSellers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                        Sin datos para esta fecha
                      </td>
                    </tr>
                  ) : allSellers.map((s, i) => (
                    <tr
                      key={s.seller_id}
                      onClick={() => { setSelectedSellerId(s.seller_id); setActiveTab('vendedor'); }}
                      className={`border-t border-slate-700/50 cursor-pointer hover:bg-slate-700/30 transition ${
                        i % 2 === 0 ? 'bg-slate-900/50' : 'bg-slate-800/30'
                      }`}
                    >
                      <td className="px-3 py-2.5 text-white font-medium">{s.seller_name}</td>
                      <td className="px-3 py-2.5 text-right text-white">{fmt(s.total_sales, sym)}</td>
                      <td className="px-3 py-2.5 text-right text-violet-400">{fmt(s.total_commission, sym)}</td>
                      <td className="px-3 py-2.5 text-right text-blue-400">{fmt(s.admin_part, sym)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-400">{fmt(s.total_prizes_paid, sym)}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${balanceColor(s.balance)}`}>
                        {fmt(s.balance, sym)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {allSellers.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-800 border-t-2 border-slate-600 font-bold">
                      <td className="px-3 py-2.5 text-white text-xs">TOTAL</td>
                      <td className="px-3 py-2.5 text-right text-white text-xs">{fmt(totals.sales, sym)}</td>
                      <td className="px-3 py-2.5 text-right text-violet-400 text-xs">{fmt(totals.comm, sym)}</td>
                      <td className="px-3 py-2.5 text-right text-blue-400 text-xs">{fmt(totals.admin, sym)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-400 text-xs">{fmt(totals.prizes, sym)}</td>
                      <td className={`px-3 py-2.5 text-right text-xs font-bold ${balanceColor(totals.balance)}`}>
                        {fmt(totals.balance, sym)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {allSellers.length > 0 && (
            <p className="text-xs text-slate-500 text-center">
              Clic en un vendedor para ver su balance detallado
            </p>
          )}
        </>
      )}

      {/* ── Settlement Modal ── */}
      {showSettleModal && balance && (
        <div className="fixed inset-0 bg-black/75 flex items-end justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4">
            <h2 className="text-base font-bold text-white">Confirmar corte</h2>

            <div className="bg-slate-900 rounded-xl p-4 space-y-2 text-sm">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Resumen del corte</p>
              <div className="flex justify-between">
                <span className="text-slate-400">Vendedor</span>
                <span className="text-white font-medium">{balance.seller_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Período</span>
                <span className="text-white text-xs">{fmtDate(balance.period_start)} → {fmtDate(balance.period_end)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total recaudado</span>
                <span className="text-white">{fmt(balance.total_sales, sym)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Comisión vendedor</span>
                <span className="text-violet-400">{fmt(balance.total_commission, sym)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Premios pagados</span>
                <span className="text-amber-400">{fmt(balance.total_prizes_paid, sym)}</span>
              </div>
              <div className="border-t border-slate-700 pt-2 flex justify-between">
                <span className="font-semibold text-white">Balance a liquidar</span>
                <span className={`font-bold text-base ${balanceColor(balance.balance)}`}>
                  {fmt(balance.balance, sym)}
                </span>
              </div>
              {previousPending !== 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Pendiente anterior</span>
                  <span className={balanceColor(previousPending)}>{fmt(previousPending, sym)}</span>
                </div>
              )}
              {Number(balance.balance) < 0 && (
                <p className="text-rose-400 text-xs">
                  Balance negativo: el admin paga {fmt(Math.abs(balance.balance), sym)} al vendedor
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                {Number(balance.balance) >= 0 ? 'Monto recibido del vendedor' : 'Monto entregado al vendedor'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settleAmount}
                onChange={e => setSettleAmount(e.target.value)}
                placeholder={String(Math.abs(Number(balance.balance || 0)).toFixed(2))}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-slate-500 mt-1.5">
                Maximo para este corte: {fmt(Math.abs(Number(balance.balance || 0)), sym)}
              </p>
              {settleAmount && Number(settleAmount) > 0 && Number(settleAmount) < Math.abs(Number(balance.balance || 0)) && (
                <p className={`text-xs mt-1 ${balanceColor(Number(balance.balance || 0) - (Number(balance.balance || 0) < 0 ? -Number(settleAmount) : Number(settleAmount)))}`}>
                  Quedara pendiente: {fmt(Number(balance.balance || 0) - (Number(balance.balance || 0) < 0 ? -Number(settleAmount) : Number(settleAmount)), sym)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Nota (opcional)
              </label>
              <input
                type="text"
                value={settleNotes}
                onChange={e => setSettleNotes(e.target.value)}
                placeholder="Ej: Cierre semana 17"
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {settleError && <p className="text-rose-400 text-xs text-center">{settleError}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowSettleModal(false); setSettleAmount(''); }}
                disabled={settling}
                className="flex-1 border border-slate-600 text-slate-300 text-sm py-2.5 rounded-xl hover:bg-slate-700 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSettle}
                disabled={settling}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {settling ? 'Registrando...' : 'Confirmar corte'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
