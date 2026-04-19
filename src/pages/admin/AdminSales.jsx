import { useEffect, useState, useMemo } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';

const fmt = (n, sym = '$') => `${sym}${Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sel = "w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent";
const inp = "w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent";

const IconTrending = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);
const IconTicket = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
  </svg>
);
const IconX = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IconUser = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);
const IconFilter = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
  </svg>
);
const IconChevron = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

function StatCard({ label, value, icon, gradient, sub }) {
  return (
    <div className={`rounded-2xl p-4 ${gradient} relative overflow-hidden`}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-white/10 rounded-xl">{icon}</div>
      </div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-xs text-white/70 mt-0.5 font-medium">{label}</p>
      {sub && <p className="text-xs text-white/50 mt-0.5">{sub}</p>}
    </div>
  );
}

function TicketModal({ ticket, sellerName, lotteryName, drawTimeName, sym, onClose }) {
  const [lines, setLines] = useState(null);

  useEffect(() => {
    if (!ticket) return;
    db.from('ticket_numbers').select('number, pieces, subtotal').eq('ticket_id', ticket.id)
      .then(({ data }) => setLines(data || []));
  }, [ticket]);

  if (!ticket) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-t-2xl w-full max-w-lg p-5 pb-8 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono font-bold text-white text-base">#{ticket.ticket_number || ticket.id.slice(0,8)}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {ticket.sale_date}
              {ticket.created_at && (
                <span className="ml-2">
                  {new Date(ticket.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
            <p className="text-xs text-slate-600 mt-0.5 font-mono break-all">{ticket.id}</p>
          </div>
          <div className="flex items-center gap-2">
            {ticket.is_cancelled && <span className="text-xs px-2 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20 font-medium">Cancelado</span>}
            {ticket.is_winner && !ticket.is_cancelled && <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 font-bold">GANADOR</span>}
            {ticket.is_paid && !ticket.is_cancelled && !ticket.is_winner && <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">Pagado</span>}
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><IconX /></button>
          </div>
        </div>

        {/* Info */}
        <div className="bg-slate-800 rounded-xl p-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Vendedor</span><span className="text-white font-medium">{sellerName}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Lotería</span><span className="text-white">{lotteryName}</span></div>
          {drawTimeName && <div className="flex justify-between"><span className="text-slate-400">Sorteo</span><span className="text-white">{drawTimeName}</span></div>}
          {ticket.customer_name && <div className="flex justify-between"><span className="text-slate-400">Cliente</span><span className="text-white">{ticket.customer_name}</span></div>}
        </div>

        {/* Números */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Números</p>
          {lines === null ? (
            <p className="text-slate-500 text-sm">Cargando...</p>
          ) : lines.length === 0 ? (
            <p className="text-slate-500 text-sm">Sin números registrados</p>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500 px-1 mb-1">
                <span>Cifra</span><span>Cant.</span><span>Subtotal</span>
              </div>
              {lines.map((n, i) => (
                <div key={i} className="flex justify-between bg-slate-800 rounded-lg px-3 py-2 text-sm">
                  <span className="font-mono font-bold text-white">{n.number}</span>
                  <span className="text-slate-300">{n.pieces}</span>
                  <span className="text-emerald-400 font-medium">{sym}{Number(n.subtotal || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center border-t border-slate-700 pt-3">
          <span className="text-sm font-semibold text-slate-300">Total</span>
          <span className={`text-xl font-bold ${ticket.is_cancelled ? 'text-slate-500 line-through' : 'text-emerald-400'}`}>
            {fmt(ticket.total_amount, sym)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AdminSales() {
  const { profile } = useAuth();
  const _d = new Date();
  const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [sellerId, setSellerId] = useState('');
  const [lotteryId, setLotteryId] = useState('');
  const [drawTimeId, setDrawTimeId] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const [tickets, setTickets] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [lotteries, setLotteries] = useState([]);
  const [allDrawTimes, setAllDrawTimes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(200);
  const [hasMore, setHasMore] = useState(false);

  // Cargar filtros primero, luego tickets con los seller IDs obtenidos
  useEffect(() => {
    if (profile?.id) {
      loadFiltersData().then(sellerIds => {
        setPageSize(200);
        loadTickets(200, sellerIds);
      });
    }
  }, [profile]);

  useEffect(() => {
    if (sellers.length > 0) {
      const ids = sellers.map(s => s.id);
      setPageSize(200);
      loadTickets(200, ids);
    }
  }, [dateFrom, dateTo, sellerId, lotteryId, drawTimeId]);

  async function loadFiltersData() {
    const [{ data: s }, { data: l }, { data: dt }] = await Promise.all([
      db.rpc('get_admin_sellers', { p_admin_id: profile.id }),
      db.from('lotteries').select('id, display_name').eq('admin_id', profile.id).order('display_name'),
      db.from('draw_times').select('id, time_label, lottery_id').order('time_value'),
    ]);
    const s2 = s || [];
    setSellers(s2);
    setLotteries(l || []);
    setAllDrawTimes(dt || []);
    return s2.map(x => x.id);
  }

  async function loadTickets(lim = pageSize, sellerIds) {
    if (!profile?.id) { setTickets([]); setLoading(false); return; }
    setLoading(true);

    let q = db.from('tickets').select('*').eq('admin_id', profile.id);
    if (dateFrom)    q = q.gte('sale_date', dateFrom);
    if (dateTo)      q = q.lte('sale_date', dateTo);
    if (sellerId)    q = q.eq('seller_id', sellerId);
    if (lotteryId)   q = q.eq('lottery_id', lotteryId);
    if (drawTimeId)  q = q.eq('draw_time_id', drawTimeId);
    const { data } = await q.order('sale_date', { ascending: false }).limit(lim + 1);
    const rows = data || [];
    setHasMore(rows.length > lim);
    const pageRows = rows.slice(0, lim);

    // Fetch winning numbers and detect winners without using .in() (InsForge bug)
    let wq = db.from('winning_numbers')
      .select('lottery_id, draw_time_id, draw_date, first_prize, second_prize, third_prize');
    if (dateFrom) wq = wq.gte('draw_date', dateFrom);
    if (dateTo)   wq = wq.lte('draw_date', dateTo);
    const { data: winningData } = await wq;
    const wins = winningData || [];

    // For each unique 2-digit prize, query ticket_numbers by eq (avoids .in() bug)
    const pageTicketIds = new Set(pageRows.map(t => t.id));
    const winnerIds = new Set();

    if (wins.length > 0) {
      const prizes2d = new Set();
      wins.forEach(w => {
        [w.first_prize, w.second_prize, w.third_prize].filter(Boolean)
          .forEach(p => prizes2d.add(p.slice(-2)));
      });

      for (const prize of prizes2d) {
        const { data: tnData } = await db
          .from('ticket_numbers')
          .select('ticket_id, number')
          .eq('number', prize)
          .eq('digit_count', 2);

        for (const tn of (tnData || [])) {
          if (!pageTicketIds.has(tn.ticket_id)) continue;
          const ticket = pageRows.find(t => t.id === tn.ticket_id);
          if (!ticket) continue;
          const win = wins.find(w =>
            w.lottery_id === ticket.lottery_id &&
            w.draw_date === ticket.sale_date &&
            (w.draw_time_id === null || w.draw_time_id === ticket.draw_time_id) &&
            [w.first_prize, w.second_prize, w.third_prize].filter(Boolean).some(p => p.slice(-2) === prize)
          );
          if (win) winnerIds.add(tn.ticket_id);
        }
      }
    }

    setTickets(pageRows.map(t => ({ ...t, is_winner: winnerIds.has(t.id) })));
    setLoading(false);
  }

  const filteredDrawTimes = lotteryId ? allDrawTimes.filter(dt => dt.lottery_id === lotteryId) : allDrawTimes;
  const sym = profile?.currency_symbol || '$';
  const active = tickets.filter(t => !t.is_cancelled);
  const cancelled = tickets.filter(t => t.is_cancelled);
  const totalRevenue = active.reduce((s, t) => s + (t.total_amount || 0), 0);
  const avg = active.length ? totalRevenue / active.length : 0;

  const sellerMap = useMemo(() => Object.fromEntries(sellers.map(s => [s.id, s.full_name])), [sellers]);
  const lotteryMap = useMemo(() => Object.fromEntries(lotteries.map(l => [l.id, l.display_name])), [lotteries]);
  const drawTimeMap = useMemo(() => Object.fromEntries(allDrawTimes.map(dt => [dt.id, dt.time_label])), [allDrawTimes]);

  const bySeller = useMemo(() => {
    const map = {};
    active.forEach(t => {
      const name = sellerMap[t.seller_id] || 'Sin asignar';
      if (!map[name]) map[name] = { count: 0, total: 0 };
      map[name].count++;
      map[name].total += t.total_amount || 0;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [active, sellerMap]);

  const displayed = showCancelled ? tickets : active;
  const isFiltered = sellerId || lotteryId || drawTimeId || dateFrom !== today || dateTo !== today;

  function clearFilters() {
    setSellerId(''); setLotteryId(''); setDrawTimeId('');
    setDateFrom(today); setDateTo(today);
  }

  const activeFilterCount = [sellerId, lotteryId, drawTimeId, dateFrom !== today ? 1 : null, dateTo !== today ? 1 : null].filter(Boolean).length;

  return (
    <div className="space-y-5 mt-2 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Ventas</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          {isFiltered && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl transition">
              <IconX /> Limpiar
            </button>
          )}
          <button
            onClick={() => loadTickets(pageSize, sellers.map(s => s.id))}
            disabled={loading}
            className="text-xs text-indigo-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl transition disabled:opacity-50"
          >
            {loading ? '...' : '↺ Actualizar'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total recaudado" value={fmt(totalRevenue, sym)} icon={<IconTrending />} gradient="bg-gradient-to-br from-emerald-600 to-emerald-800" />
        <StatCard label="Tickets activos" value={active.length} icon={<IconTicket />} gradient="bg-gradient-to-br from-indigo-600 to-indigo-800" sub={avg > 0 ? `Prom. ${fmt(avg, sym)}` : null} />
        <StatCard label="Cancelados" value={cancelled.length} icon={<IconX />} gradient="bg-gradient-to-br from-slate-700 to-slate-800" />
        <StatCard label="Vendedores" value={bySeller.length} icon={<IconUser />} gradient="bg-gradient-to-br from-violet-600 to-violet-800" />
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden">
        <button
          onClick={() => setFiltersOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/20 rounded-lg text-indigo-400"><IconFilter /></div>
            <span className="text-sm font-semibold text-white">Filtros</span>
            {activeFilterCount > 0 && (
              <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-medium">{activeFilterCount}</span>
            )}
          </div>
          <span className={`text-slate-500 transition-transform duration-200 ${filtersOpen ? 'rotate-90' : ''}`}><IconChevron /></span>
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-800">
            <div className="grid grid-cols-2 gap-3 pt-3">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Desde</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Hasta</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inp} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Vendedor</label>
              <select value={sellerId} onChange={e => setSellerId(e.target.value)} className={sel}>
                <option value="">Todos los vendedores</option>
                {sellers.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Lotería</label>
              <select value={lotteryId} onChange={e => { setLotteryId(e.target.value); setDrawTimeId(''); }} className={sel}>
                <option value="">Todas las loterías</option>
                {lotteries.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
              </select>
            </div>
            {filteredDrawTimes.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Sorteo</label>
                <select value={drawTimeId} onChange={e => setDrawTimeId(e.target.value)} className={sel}>
                  <option value="">Todos los sorteos</option>
                  {filteredDrawTimes.map(dt => <option key={dt.id} value={dt.id}>{dt.time_label}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resumen por vendedor */}
      {bySeller.length > 1 && (
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Desglose por vendedor</p>
          <div className="space-y-3">
            {bySeller.map(([name, d], i) => {
              const pct = totalRevenue > 0 ? (d.total / totalRevenue) * 100 : 0;
              const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-pink-500'];
              const color = colors[i % colors.length];
              return (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white font-medium">{name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{d.count} tickets</span>
                      <span className="text-sm font-bold text-emerald-400">{fmt(d.total, sym)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista tickets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-white">
            {displayed.length} ticket{displayed.length !== 1 ? 's' : ''}
            {loading && <span className="text-slate-500 font-normal text-xs ml-2">actualizando...</span>}
          </p>
          {cancelled.length > 0 && (
            <button
              onClick={() => setShowCancelled(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-xl border transition font-medium ${
                showCancelled
                  ? 'border-rose-500/50 text-rose-400 bg-rose-500/10'
                  : 'border-slate-700 text-slate-400 hover:text-slate-300'
              }`}
            >
              {showCancelled ? `Ocultar cancelados (${cancelled.length})` : `Ver cancelados (${cancelled.length})`}
            </button>
          )}
        </div>

        {loading && tickets.length === 0 ? (
          <div className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-4 animate-pulse">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="h-3 w-20 bg-slate-700 rounded" />
                    <div className="h-2 w-36 bg-slate-800 rounded" />
                  </div>
                  <div className="h-4 w-16 bg-slate-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-3">
              <IconTicket />
            </div>
            <p className="text-white font-semibold text-sm">Sin ventas</p>
            <p className="text-slate-500 text-xs mt-1">No hay tickets para este período</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTicket(t)}
                className={`w-full text-left border rounded-2xl px-4 py-3.5 transition cursor-pointer ${
                  t.is_cancelled
                    ? 'bg-slate-900/50 border-slate-800 opacity-50'
                    : t.is_winner
                    ? 'bg-green-950/40 border-green-700/50 hover:border-green-600/60 active:scale-[0.99]'
                    : 'bg-slate-900 border-slate-700/60 hover:border-slate-600 active:scale-[0.99]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-white">#{t.ticket_number}</span>
                      {t.is_cancelled && (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 font-medium border border-rose-500/20">
                          Cancelado
                        </span>
                      )}
                      {t.is_winner && !t.is_cancelled && (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold border border-green-500/30">
                          GANADOR
                        </span>
                      )}
                      {t.is_paid && !t.is_cancelled && !t.is_winner && (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/20">
                          Pagado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      <span className="text-slate-300 font-medium">{sellerMap[t.seller_id] || '—'}</span>
                      <span className="text-slate-600 mx-1">·</span>
                      <span>{lotteryMap[t.lottery_id] || '—'}</span>
                      {t.draw_time_id && (
                        <>
                          <span className="text-slate-600 mx-1">·</span>
                          <span>{drawTimeMap[t.draw_time_id]}</span>
                        </>
                      )}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      {t.customer_name && (
                        <p className="text-xs text-slate-600">Cliente: <span className="text-slate-500">{t.customer_name}</span></p>
                      )}
                      <p className="text-xs text-slate-500">
                        {t.sale_date}
                        {t.created_at && (
                          <span className="ml-1">{new Date(t.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5 break-all">{t.id}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-base font-bold ${t.is_cancelled ? 'text-slate-600 line-through' : 'text-emerald-400'}`}>
                      {fmt(t.total_amount, sym)}
                    </p>
                  </div>
                </div>
              </button>
            ))}

            {hasMore && (
              <button
                onClick={() => { const next = pageSize + 200; setPageSize(next); loadTickets(next); }}
                className="w-full py-3.5 text-sm font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-2xl transition"
              >
                Ver más tickets
              </button>
            )}
          </div>
        )}
      </div>

      <TicketModal
        ticket={selectedTicket}
        sellerName={selectedTicket ? (sellerMap[selectedTicket.seller_id] || '—') : ''}
        lotteryName={selectedTicket ? (lotteryMap[selectedTicket.lottery_id] || '—') : ''}
        drawTimeName={selectedTicket ? (drawTimeMap[selectedTicket.draw_time_id] || '') : ''}
        sym={sym}
        onClose={() => setSelectedTicket(null)}
      />
    </div>
  );
}
