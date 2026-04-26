import { useEffect, useState, useMemo } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';

const fmtAmt = (n, sym = '$') =>
  `${sym}${Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const sel = "w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const inp = "w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500";

const MATCH_LABELS = {
  chance:           '2 últ. (chance)',
  billete_4exactas: '4 cifras exactas',
  pale_1er:         '1er Palé',
  pale_2do:         '2do Palé',
  pale_3er:         '3er Palé',
  nac_3_primeras:   '3 primeras',
  nac_3_ultimas:    '3 últimas',
  nac_2_primeras:   '2 primeras',
  nac_2_ultimas:    '2 últimas',
  nac_1_ultima:     'Última cifra',
};
const PRIZE_LABELS = { '1st': '1er Premio', '2nd': '2do Premio', '3rd': '3er Premio' };

const IcFilter  = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>;
const IcChevron = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
const IcRefresh = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
const IcStar    = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;

function SummaryCard({ label, amount, count, sym, color }) {
  return (
    <div className={`bg-slate-900 border rounded-2xl p-4 ${color}`}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-extrabold text-white">{fmtAmt(amount, sym)}</p>
      {count != null && <p className="text-xs text-slate-500 mt-1">{count} ticket{count !== 1 ? 's' : ''}</p>}
    </div>
  );
}

export default function AdminPremios() {
  const { profile } = useAuth();
  const today = todayStr();

  // Filters
  const [dateFrom, setDateFrom]       = useState(today);
  const [dateTo, setDateTo]           = useState(today);
  const [sellerId, setSellerId]       = useState('');
  const [lotteryId, setLotteryId]     = useState('');
  const [drawTimeId, setDrawTimeId]   = useState('');
  const [status, setStatus]           = useState('');
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Recalculate section
  const [calcLottery, setCalcLottery]   = useState('');
  const [calcDrawTime, setCalcDrawTime] = useState('');
  const [calcDate, setCalcDate]         = useState(today);
  const [calcSectionOpen, setCalcSectionOpen] = useState(false);

  // Data
  const [sellers, setSellers]     = useState([]);
  const [lotteries, setLotteries] = useState([]);
  const [allDts, setAllDts]       = useState([]);
  const [rows, setRows]           = useState([]);
  const [summary, setSummary]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg]         = useState('');
  const [error, setError]           = useState('');

  const sym = profile?.currency_symbol || '$';

  useEffect(() => { if (profile?.id) loadFilters(); }, [profile]);
  useEffect(() => { if (profile?.id) fetchData(); }, [dateFrom, dateTo, sellerId, lotteryId, drawTimeId, status]);

  async function loadFilters() {
    const [{ data: s }, { data: l }, { data: dt }] = await Promise.all([
      db.from('profiles').select('id, full_name').in('role', ['seller','sub_admin']).eq('parent_admin_id', profile.id).order('full_name'),
      db.from('lotteries').select('id, display_name').eq('admin_id', profile.id).order('display_name'),
      db.from('draw_times').select('id, lottery_id, time_label').order('time_value'),
    ]);
    setSellers(s || []);
    setLotteries(l || []);
    setAllDts(dt || []);
  }

  async function fetchData() {
    if (!profile?.id) return;
    setLoading(true);
    setError('');
    try {
      const params = {
        p_admin_id:     profile.id,
        p_date_from:    dateFrom || null,
        p_date_to:      dateTo   || null,
        p_seller_id:    sellerId    || null,
        p_lottery_id:   lotteryId   || null,
        p_draw_time_id: drawTimeId  || null,
        p_status:       status      || null,
      };
      const [{ data: wt, error: e1 }, { data: sm, error: e2 }] = await Promise.all([
        db.rpc('get_winning_tickets', params),
        db.rpc('get_winning_tickets_summary', {
          p_admin_id:     profile.id,
          p_date_from:    dateFrom   || null,
          p_date_to:      dateTo     || null,
          p_seller_id:    sellerId   || null,
          p_lottery_id:   lotteryId  || null,
          p_draw_time_id: drawTimeId || null,
        }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setRows(wt || []);
      setSummary(sm?.[0] || null);
    } catch (e) {
      setError(e.message || 'Error al cargar premios');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!calcLottery || !calcDate) { setGenMsg('Selecciona lotería y fecha.'); return; }
    setGenerating(true);
    setGenMsg('');
    try {
      const { data, error: e } = await db.rpc('generate_winning_tickets', {
        p_admin_id:     profile.id,
        p_lottery_id:   calcLottery,
        p_draw_time_id: calcDrawTime || null,
        p_draw_date:    calcDate,
      });
      if (e) throw e;
      const n = data ?? 0;
      setGenMsg(`✓ ${n} registro${n !== 1 ? 's' : ''} generado${n !== 1 ? 's' : ''}.`);
      fetchData();
    } catch (e) {
      setGenMsg('Error: ' + (e.message || JSON.stringify(e)));
    } finally {
      setGenerating(false);
    }
  }

  const filteredDts    = lotteryId  ? allDts.filter(d => d.lottery_id === lotteryId)  : allDts;
  const calcFilteredDts = calcLottery ? allDts.filter(d => d.lottery_id === calcLottery) : [];

  const activeFilters = [sellerId, lotteryId, drawTimeId, status,
    dateFrom !== today || dateTo !== today ? 1 : null].filter(Boolean).length;

  // Group rows by ticket_id — one card per ticket, multiple winning numbers inside
  const grouped = useMemo(() => {
    const map = {};
    (rows || []).forEach(r => {
      const key = r.ticket_id;
      if (!map[key]) map[key] = { ...r, matches: [] };
      map[key].matches.push({ number: r.number, winning_number: r.winning_number, match_type: r.match_type, prize_position: r.prize_position, multiplier: r.multiplier, prize_amount: r.prize_amount });
    });
    return Object.values(map).map(g => ({
      ...g,
      total_prize: g.matches.reduce((acc, m) => acc + parseFloat(m.prize_amount || 0), 0),
    }));
  }, [rows]);

  return (
    <div className="space-y-5 mt-2 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Premios</h1>
          <p className="text-xs text-slate-500 mt-0.5">Tickets ganadores y estado de pago</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl transition disabled:opacity-50"
        >
          <IcRefresh />
          {loading ? '...' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard label="Total a pagar"   amount={summary.total_prize_amount} count={Number(summary.count_total)}   sym={sym} color="border-slate-700" />
          <SummaryCard label="Total pendiente" amount={summary.total_pending}      count={Number(summary.count_pending)} sym={sym} color="border-amber-500/30" />
          <SummaryCard label="Total pagado"    amount={summary.total_paid}         count={Number(summary.count_paid)}    sym={sym} color="border-emerald-500/30" />
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center">
            <p className="text-2xl font-extrabold text-indigo-400">{Number(summary.count_total)}</p>
            <p className="text-xs text-slate-400 mt-1">Tickets ganadores</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden">
        <button onClick={() => setFiltersOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/20 rounded-lg text-indigo-400"><IcFilter /></div>
            <span className="text-sm font-semibold text-white">Filtros</span>
            {activeFilters > 0 && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-medium">{activeFilters}</span>}
          </div>
          <span className={`text-slate-500 transition-transform duration-200 ${filtersOpen ? 'rotate-90' : ''}`}><IcChevron /></span>
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
            {filteredDts.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Sorteo</label>
                <select value={drawTimeId} onChange={e => setDrawTimeId(e.target.value)} className={sel}>
                  <option value="">Todos los sorteos</option>
                  {filteredDts.map(d => <option key={d.id} value={d.id}>{d.time_label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Estado</label>
              <div className="flex gap-2">
                {[['', 'Todos'], ['pending', 'Pendientes'], ['paid', 'Pagados']].map(([val, lbl]) => (
                  <button key={val} onClick={() => setStatus(val)}
                    className={`flex-1 text-xs py-2 rounded-lg border transition font-medium ${status === val ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:text-slate-300'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            {activeFilters > 0 && (
              <button
                onClick={() => { setSellerId(''); setLotteryId(''); setDrawTimeId(''); setStatus(''); setDateFrom(today); setDateTo(today); }}
                className="w-full text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 py-2 rounded-xl transition"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Winning tickets list */}
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Tickets Ganadores</p>
          <span className="text-xs text-slate-500">{grouped.length} resultado{grouped.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-600 text-3xl mb-2">★</div>
            <p className="text-slate-500 text-sm">No hay tickets ganadores con los filtros seleccionados.</p>
            <p className="text-slate-600 text-xs mt-1">Usa "Recalcular ganadores" para detectar los premios de un sorteo.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {grouped.map(row => {
              const isPaid = row.is_paid;
              return (
                <div key={row.ticket_id} className={`px-4 py-3 ${isPaid ? 'opacity-60' : ''}`}>
                  {/* Ticket header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${isPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        <IcStar />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-base font-bold text-white">{row.ticket_num}</span>
                          <span className="text-xs text-slate-500">{row.matches.length} acierto{row.matches.length !== 1 ? 's' : ''}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{row.lottery_name}{row.draw_time_label ? ` · ${row.draw_time_label}` : ''} · {row.draw_date}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-base font-extrabold ${isPaid ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {fmtAmt(row.total_prize, sym)}
                      </p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {isPaid ? `Pagado${row.paid_at ? ' ' + new Date(row.paid_at).toLocaleDateString('es') : ''}` : 'Pendiente'}
                      </span>
                    </div>
                  </div>

                  {/* Winning numbers breakdown */}
                  <div className="mt-2 ml-9 space-y-1">
                    {row.matches.map((m, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-white">{m.number}</span>
                          <span className="text-xs text-slate-500">→ {m.winning_number}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${m.prize_position === '1st' ? 'bg-indigo-500/30 text-indigo-300' : m.prize_position === '2nd' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-amber-500/30 text-amber-300'}`}>
                            {PRIZE_LABELS[m.prize_position] || m.prize_position}
                          </span>
                          <span className="text-xs text-slate-400">{MATCH_LABELS[m.match_type] || m.match_type}</span>
                          <span className="text-xs text-slate-600">×{m.multiplier}</span>
                        </div>
                        <span className="text-xs font-semibold text-rose-400">{fmtAmt(m.prize_amount, sym)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Meta row */}
                  <div className="mt-2 ml-9 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span>{row.seller_name}</span>
                    {row.customer_name && (
                      <>
                        <span>·</span>
                        <span className="text-indigo-400 font-semibold">{row.customer_name}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>Apostado: {fmtAmt(row.bet_amount, sym)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recalculate section */}
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden">
        <button onClick={() => setCalcSectionOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-violet-500/20 rounded-lg text-violet-400"><IcRefresh /></div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Recalcular ganadores</p>
              <p className="text-[11px] text-slate-500">Detecta o regenera los tickets ganadores de un sorteo específico</p>
            </div>
          </div>
          <span className={`text-slate-500 transition-transform duration-200 ${calcSectionOpen ? 'rotate-90' : ''}`}><IcChevron /></span>
        </button>

        {calcSectionOpen && (
          <div className="px-4 pb-5 space-y-3 border-t border-slate-800 pt-4">
            <p className="text-xs text-slate-500">
              Selecciona un sorteo específico. Los registros no pagados existentes se borran y se regeneran.
              Los ya pagados no se tocan.
            </p>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Lotería</label>
              <select value={calcLottery} onChange={e => { setCalcLottery(e.target.value); setCalcDrawTime(''); }} className={sel}>
                <option value="">Seleccionar lotería...</option>
                {lotteries.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
              </select>
            </div>
            {calcFilteredDts.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Sorteo</label>
                <select value={calcDrawTime} onChange={e => setCalcDrawTime(e.target.value)} className={sel}>
                  <option value="">Sin sorteo específico</option>
                  {calcFilteredDts.map(d => <option key={d.id} value={d.id}>{d.time_label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Fecha del sorteo</label>
              <input type="date" value={calcDate} onChange={e => setCalcDate(e.target.value)} className={inp} />
            </div>

            {genMsg && (
              <p className={`text-sm font-medium ${genMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                {genMsg}
              </p>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating || !calcLottery || !calcDate}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white transition"
            >
              {generating ? 'Generando...' : 'Detectar / Recalcular ganadores'}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
