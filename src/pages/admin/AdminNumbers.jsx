import { useEffect, useState, useMemo } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';

const fmtAmt = (n, sym = '$') =>
  `${sym}${Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sel = "w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const inp = "w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500";

const IcFilter  = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>;
const IcChevron = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
const IcTrophy  = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>;

function cellColor(pieces, max, w1, w2, w3) {
  if (w1) return 'bg-indigo-500 text-white ring-2 ring-indigo-300';
  if (w2) return 'bg-emerald-500 text-white ring-2 ring-emerald-300';
  if (w3) return 'bg-amber-500 text-white ring-2 ring-amber-300';
  if (pieces === 0) return 'bg-slate-900 text-slate-700';
  const r = pieces / max;
  if (r < 0.15) return 'bg-blue-950 text-blue-400';
  if (r < 0.35) return 'bg-indigo-900 text-indigo-300';
  if (r < 0.6)  return 'bg-indigo-800 text-indigo-200';
  if (r < 0.85) return 'bg-violet-700 text-white';
  return 'bg-violet-500 text-white';
}

function getChanceMultiplier(pos, lottObj, dtObj) {
  const k = pos === 1 ? '1st' : pos === 2 ? '2nd' : '3rd';
  const dtVal = dtObj?.[`custom_prize_${k}_multiplier`];
  if (dtVal != null && dtVal !== '') return parseFloat(dtVal);
  return parseFloat(lottObj?.[`prize_${k}_multiplier`]) || (pos === 1 ? 11 : pos === 2 ? 3 : 2);
}

function getBilleteMultiplier(pos, lottObj) {
  const k = pos === 1 ? '1st' : pos === 2 ? '2nd' : '3rd';
  const defaults = { 1: 2000, 2: 600, 3: 300 };
  const val = parseFloat(lottObj?.[`billete_prize_${k}_multiplier`]);
  return val || defaults[pos];
}

function FinancialCard({ fin }) {
  if (!fin) return null;
  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800">
        <p className="text-sm font-semibold text-white">Resumen financiero</p>
      </div>
      {fin.winners?.length > 0 && (
        <div className="px-4 pt-3 pb-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Premios a pagar</p>
          <div className="space-y-1.5">
            {fin.winners.map((w, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-white">{w.number}</span>
                  <span className="text-xs text-slate-400">{w.prize}</span>
                  <span className="text-xs text-slate-600">×{w.pieces} piezas</span>
                </div>
                <span className="text-sm font-bold text-rose-400">{fmtAmt(w.pago, fin.sym)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {fin.winners?.length === 0 && fin.totalPago !== null && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs text-center text-emerald-400 py-1">Sin ganadores en esta selección</p>
        </div>
      )}
      <div className="px-4 py-3 space-y-2 border-t border-slate-800 mt-1">
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-400">Total recaudado</span>
          <span className="text-sm font-bold text-emerald-400">{fmtAmt(fin.totalCobrado, fin.sym)}</span>
        </div>
        {fin.totalPago !== null && (
          <>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Total a pagar</span>
              <span className="text-sm font-bold text-rose-400">{fmtAmt(fin.totalPago, fin.sym)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              <span className="text-sm font-semibold text-white">Resultado</span>
              <span className={`text-sm font-bold ${fin.resultado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fin.resultado >= 0 ? 'GANANCIA ' : 'PÉRDIDA '}
                {fmtAmt(Math.abs(fin.resultado), fin.sym)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminNumbers() {
  const { profile } = useAuth();
  const _d = new Date();
  const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;

  const [umbral, setUmbral]               = useState('');
  const [date, setDate]                   = useState(today);
  const [sellerId, setSellerId]           = useState('');
  const [lotteryId, setLotteryId]         = useState('');
  const [drawTimeId, setDrawTimeId]       = useState('');
  const [currency, setCurrency]           = useState('');
  const [filtersOpen, setFiltersOpen]     = useState(true);

  const [sellers, setSellers]               = useState([]);
  const [lotteries, setLotteries]           = useState([]);
  const [allDrawTimes, setAllDrawTimes]     = useState([]);
  const [availCurrencies, setAvailCurrencies] = useState([]);

  // Chances (2 cifras)
  const [numberSales, setNumberSales]       = useState({});
  const [totalPieces, setTotalPieces]       = useState(0);
  const [financials, setFinancials]         = useState(null);

  // Billetes (4 cifras)
  const [billeteSales, setBilleteSales]     = useState({});
  const [totalBilletePieces, setTotalBilletePieces] = useState(0);
  const [billeteFinancials, setBilleteFinancials]   = useState(null);

  const [winningNumbers, setWinningNumbers] = useState(null);
  const [loading, setLoading]               = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadFiltersData().then(sellerIds => loadData(sellerIds));
    }
  }, [profile]);

  useEffect(() => {
    if (sellers.length > 0) loadData(sellers.map(s => s.id));
  }, [date, sellerId, lotteryId, drawTimeId, currency]);

  async function loadFiltersData() {
    const [{ data: s }, { data: l }, { data: dt }, { data: mData }] = await Promise.all([
      db.from('profiles').select('*').in('role', ['seller', 'sub_admin']).eq('parent_admin_id', profile.id).order('full_name'),
      db.from('lotteries').select('*').eq('admin_id', profile.id).order('display_name'),
      db.from('draw_times').select('*').order('time_value'),
      db.rpc('get_lottery_billete_multipliers'),
    ]);
    const s2 = s || [];
    const mMap = {};
    (mData || []).forEach(r => { mMap[r.id] = r; });
    const merged = (l || []).map(lot => ({ ...lot, ...mMap[lot.id] }));
    setSellers(s2);
    setLotteries(merged);
    setAllDrawTimes(dt || []);
    const syms = [...new Set(s2.map(x => x.currency_symbol).filter(Boolean))];
    setAvailCurrencies(syms);
    return s2.map(x => x.id);
  }

  async function loadData(sellerIds) {
    if (!profile?.id) { setLoading(false); return; }
    setLoading(true);

    const { data: rawNums, error: rpcError } = await db.rpc('get_numbers_for_admin', {
      p_admin_id: profile.id,
      p_date: date || null,
      p_seller_id: sellerId || null,
      p_lottery_id: lotteryId || null,
      p_draw_time_id: drawTimeId || null,
    });
    if (rpcError) { console.error('get_numbers_for_admin error:', rpcError); alert('Error RPC: ' + JSON.stringify(rpcError)); setLoading(false); return; }

    let allNums = currency
      ? (rawNums || []).filter(n => n.currency_symbol === currency)
      : (rawNums || []);

    // Grid chances 00-99
    const sales = {};
    for (let i = 0; i <= 99; i++) sales[i.toString().padStart(2, '0')] = 0;
    const bSales = {};

    let totalPc = 0, totalBPc = 0;
    allNums.forEach(n => {
      const pieces = parseInt(n.pieces, 10);
      if (n.number?.length === 2) {
        sales[n.number] = (sales[n.number] || 0) + pieces;
        totalPc += pieces;
      } else if (n.number?.length === 4) {
        bSales[n.number] = (bSales[n.number] || 0) + pieces;
        totalBPc += pieces;
      }
    });
    setTotalPieces(totalPc);
    setTotalBilletePieces(totalBPc);
    setNumberSales(sales);
    setBilleteSales(bSales);

    const hasData = allNums.length > 0;

    // Números ganadores
    let wn = null;
    if (lotteryId && date) {
      let wq = db.from('winning_numbers').select('*')
        .eq('lottery_id', lotteryId).eq('draw_date', date);
      if (drawTimeId) wq = wq.eq('draw_time_id', drawTimeId);
      const { data: wd } = await wq.limit(1);
      wn = wd?.[0] || null;
    }
    setWinningNumbers(wn);

    const sym = profile?.currency_symbol || '$';
    const lottObj = lotteryId ? lotteries.find(l => l.id === lotteryId) || null : null;
    const dtObj   = drawTimeId ? allDrawTimes.find(d => d.id === drawTimeId) || null : null;

    // Financiero chances
    let totalCobrado = 0;
    allNums.forEach(n => {
      if (n.number?.length === 2) totalCobrado += parseFloat(n.subtotal || 0);
    });
    if (wn && lotteryId) {
      const m1 = getChanceMultiplier(1, lottObj, dtObj);
      const m2 = getChanceMultiplier(2, lottObj, dtObj);
      const m3 = getChanceMultiplier(3, lottObj, dtObj);
      const c1 = wn.first_prize?.slice(-2);
      const c2 = wn.second_prize?.slice(-2);
      const c3 = wn.third_prize?.slice(-2);
      const winners = [];
      let totalPago = 0;
      allNums.forEach(n => {
        if (n.number?.length !== 2) return;
        let prizeLabel = null, multiplier = 0;
        if (c1 && n.number === c1) { prizeLabel = '1er Premio'; multiplier = m1; }
        else if (c2 && n.number === c2) { prizeLabel = '2do Premio'; multiplier = m2; }
        else if (c3 && n.number === c3) { prizeLabel = '3er Premio'; multiplier = m3; }
        if (prizeLabel) {
          const pago = parseInt(n.pieces, 10) * multiplier;
          totalPago += pago;
          const existing = winners.find(w => w.number === n.number && w.prize === prizeLabel);
          if (existing) { existing.pieces += parseInt(n.pieces, 10); existing.pago += pago; }
          else winners.push({ number: n.number, prize: prizeLabel, pieces: parseInt(n.pieces, 10), pago });
        }
      });
      setFinancials({ totalCobrado, totalPago, resultado: totalCobrado - totalPago, sym, winners });
    } else {
      setFinancials(hasData ? { totalCobrado, totalPago: null, resultado: null, sym, winners: [] } : null);
    }

    // Financiero billetes
    let totalBCobrado = 0;
    allNums.forEach(n => {
      if (n.number?.length === 4) totalBCobrado += parseFloat(n.subtotal || 0);
    });
    if (wn && lotteryId) {
      const bm1 = getBilleteMultiplier(1, lottObj);
      const bm2 = getBilleteMultiplier(2, lottObj);
      const bm3 = getBilleteMultiplier(3, lottObj);
      const wp1 = wn.first_prize  || '';
      const wp2 = wn.second_prize || '';
      const wp3 = wn.third_prize  || '';
      const isBPale = lottObj?.lottery_type === 'pale';
      const bpale1 = isBPale && wp1.length === 2 && wp2.length === 2 ? wp1 + wp2 : null;
      const bpale2 = isBPale && wp1.length === 2 && wp3.length === 2 ? wp1 + wp3 : null;
      const bpale3 = isBPale && wp2.length === 2 && wp3.length === 2 ? wp2 + wp3 : null;
      const winners = [];
      let totalBPago = 0;
      allNums.forEach(n => {
        if (n.number?.length !== 4) return;
        let prizeLabel = null, multiplier = 0;
        if (isBPale) {
          if (bpale1 && n.number === bpale1) { prizeLabel = '1er Palé'; multiplier = bm1; }
          else if (bpale2 && n.number === bpale2) { prizeLabel = '2do Palé'; multiplier = bm2; }
          else if (bpale3 && n.number === bpale3) { prizeLabel = '3er Palé'; multiplier = bm3; }
        } else {
          if (wp1 && n.number === wp1) { prizeLabel = '1er Premio'; multiplier = bm1; }
          else if (wp2 && n.number === wp2) { prizeLabel = '2do Premio'; multiplier = bm2; }
          else if (wp3 && n.number === wp3) { prizeLabel = '3er Premio'; multiplier = bm3; }
        }
        if (prizeLabel) {
          const pago = parseInt(n.pieces, 10) * multiplier;
          totalBPago += pago;
          const existing = winners.find(w => w.number === n.number && w.prize === prizeLabel);
          if (existing) { existing.pieces += parseInt(n.pieces, 10); existing.pago += pago; }
          else winners.push({ number: n.number, prize: prizeLabel, pieces: parseInt(n.pieces, 10), pago });
        }
      });
      setBilleteFinancials({ totalCobrado: totalBCobrado, totalPago: totalBPago, resultado: totalBCobrado - totalBPago, sym, winners });
    } else {
      setBilleteFinancials(Object.keys(bSales).length > 0 ? { totalCobrado: totalBCobrado, totalPago: null, resultado: null, sym, winners: [] } : null);
    }

    setLoading(false);
  }

  function generateExcessCSV(type) {
    const threshold = parseInt(umbral, 10);
    if (isNaN(threshold) || threshold < 0) { alert('Ingresa un umbral válido'); return; }
    const sales = type === 'chances' ? numberSales : billeteSales;
    const rows = Object.entries(sales)
      .filter(([, pieces]) => pieces > threshold)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([number, pieces]) => ({ number, vendido: pieces, umbral: threshold, excedente: pieces - threshold }));

    if (rows.length === 0) { alert('No hay números que superen el umbral ingresado'); return; }

    const label = type === 'chances' ? 'Chances' : 'Billetes';
    const lottery = lotteries.find(l => l.id === lotteryId);
    const drawTime = allDrawTimes.find(d => d.id === drawTimeId);
    let csv = `Reporte Excedente ${label}\n`;
    csv += `Fecha: ${date || 'Todas'}\n`;
    if (lottery) csv += `Lotería: ${lottery.display_name}\n`;
    if (drawTime) csv += `Sorteo: ${drawTime.time_label}\n`;
    csv += `Umbral: ${threshold} piezas\n\n`;
    csv += `Número,Excedente\n`;
    rows.forEach(r => { csv += `${r.number},${r.excedente}\n`; });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `excedente_${label.toLowerCase()}_${date || 'todos'}_umbral${threshold}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredDrawTimes = lotteryId ? allDrawTimes.filter(d => d.lottery_id === lotteryId) : allDrawTimes;
  const maxPieces = useMemo(() => Math.max(...Object.values(numberSales), 1), [numberSales]);
  const topNumbers = useMemo(() =>
    Object.entries(numberSales).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 3),
    [numberSales]);

  const sortedBilletes = useMemo(() =>
    Object.entries(billeteSales).filter(([, p]) => p > 0).sort((a, b) => a[0].localeCompare(b[0])),
    [billeteSales]);
  const topBilletes = useMemo(() =>
    Object.entries(billeteSales).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 3),
    [billeteSales]);
  const maxBilletePieces = useMemo(() => Math.max(...Object.values(billeteSales), 1), [billeteSales]);

  const c1 = winningNumbers?.first_prize?.slice(-2);
  const c2 = winningNumbers?.second_prize?.slice(-2);
  const c3 = winningNumbers?.third_prize?.slice(-2);
  const b1 = winningNumbers?.first_prize  || '';
  const b2 = winningNumbers?.second_prize || '';
  const b3 = winningNumbers?.third_prize  || '';

  // Palé: 4-digit combinations from 2-digit prizes
  const isPale = lotteries.find(l => l.id === lotteryId)?.lottery_type === 'pale';
  const pale1 = isPale && b1.length === 2 && b2.length === 2 ? b1 + b2 : null;
  const pale2 = isPale && b1.length === 2 && b3.length === 2 ? b1 + b3 : null;
  const pale3 = isPale && b2.length === 2 && b3.length === 2 ? b2 + b3 : null;

  const activeFilterCount = [sellerId, lotteryId, drawTimeId, currency, date !== today ? 1 : null].filter(Boolean).length;
  const prizeColors = ['text-indigo-400', 'text-emerald-400', 'text-amber-400'];
  const prizeBg     = ['bg-indigo-500/20 border-indigo-500/40', 'bg-emerald-500/20 border-emerald-500/40', 'bg-amber-500/20 border-amber-500/40'];

  // Totales combinados
  const sym = profile?.currency_symbol || '$';
  const totalCombinado = (financials?.totalCobrado || 0) + (billeteFinancials?.totalCobrado || 0);
  const totalPagoCombinado = (financials?.totalPago ?? null) !== null || (billeteFinancials?.totalPago ?? null) !== null
    ? (financials?.totalPago || 0) + (billeteFinancials?.totalPago || 0)
    : null;
  const resultadoCombinado = totalPagoCombinado !== null ? totalCombinado - totalPagoCombinado : null;
  const showResumenCombinado = financials !== null || billeteFinancials !== null;

  // % vendedor: usa el del vendedor seleccionado, si no el del perfil admin
  const selectedSeller = sellerId ? sellers.find(s => s.id === sellerId) : null;
  const sellerPct  = parseFloat(selectedSeller?.seller_percentage ?? profile?.seller_percentage ?? 13);
  const sellerLabel = selectedSeller ? selectedSeller.full_name : 'Vendedores';
  const sellerAmt  = totalCombinado * (sellerPct / 100);
  const adminAmt   = totalCombinado - sellerAmt;

  return (
    <div className="space-y-5 mt-2 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Números vendidos</h1>
          <p className="text-xs text-slate-500 mt-0.5">Chances y billetes</p>
        </div>
        <div className="flex gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setSellerId(''); setLotteryId(''); setDrawTimeId(''); setCurrency(''); setDate(today); }}
              className="text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl transition"
            >
              Limpiar
            </button>
          )}
          <button
            onClick={() => loadData(sellers.map(s => s.id))}
            disabled={loading}
            className="text-xs text-indigo-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl transition disabled:opacity-50"
          >
            {loading ? '...' : '↺ Actualizar'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden">
        <button onClick={() => setFiltersOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/20 rounded-lg text-indigo-400"><IcFilter /></div>
            <span className="text-sm font-semibold text-white">Filtros</span>
            {activeFilterCount > 0 && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-medium">{activeFilterCount}</span>}
          </div>
          <span className={`text-slate-500 transition-transform duration-200 ${filtersOpen ? 'rotate-90' : ''}`}><IcChevron /></span>
        </button>
        {filtersOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-800">
            <div className="pt-3">
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
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
            {availCurrencies.length > 1 && (
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-2">Moneda</label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setCurrency('')} className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${!currency ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:text-slate-300'}`}>Todas</button>
                  {availCurrencies.map(sym => (
                    <button key={sym} onClick={() => setCurrency(c => c === sym ? '' : sym)} className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${currency === sym ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:text-slate-300'}`}>{sym}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===================== RESUMEN TOTAL COMBINADO ===================== */}
      {!loading && showResumenCombinado && (
        <div className="bg-slate-800 border border-slate-600 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-600">
            <p className="text-sm font-bold text-white">Resumen Total Combinado</p>
            <p className="text-xs text-slate-400 mt-0.5">Chances + Billetes</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">Chances recaudado</span>
              <span className="text-sm font-semibold text-emerald-400">{fmtAmt(financials?.totalCobrado || 0, sym)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300">Billetes recaudado</span>
              <span className="text-sm font-semibold text-emerald-400">{fmtAmt(billeteFinancials?.totalCobrado || 0, sym)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-700">
              <span className="text-sm font-bold text-white">Total recaudado</span>
              <span className="text-base font-bold text-emerald-300">{fmtAmt(totalCombinado, sym)}</span>
            </div>
            {totalPagoCombinado !== null && (
              <>
                <div className="flex justify-between items-center pt-1 border-t border-slate-700">
                  <span className="text-sm text-slate-300">Chances a pagar</span>
                  <span className="text-sm font-semibold text-rose-400">{fmtAmt(financials?.totalPago || 0, sym)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-300">Billetes a pagar</span>
                  <span className="text-sm font-semibold text-rose-400">{fmtAmt(billeteFinancials?.totalPago || 0, sym)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                  <span className="text-sm font-bold text-white">Total a pagar</span>
                  <span className="text-base font-bold text-rose-300">{fmtAmt(totalPagoCombinado, sym)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t-2 border-slate-500">
                  <span className="text-base font-bold text-white">Resultado final</span>
                  <span className={`text-lg font-extrabold ${resultadoCombinado >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {resultadoCombinado >= 0 ? 'GANANCIA ' : 'PÉRDIDA '}
                    {fmtAmt(Math.abs(resultadoCombinado), sym)}
                  </span>
                </div>
              </>
            )}
            {/* % Vendedor / Admin */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-indigo-400">{fmtAmt(sellerAmt, sym)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{sellerLabel}</p>
                <p className="text-xs text-slate-600">{sellerPct.toFixed(1)}%</p>
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-emerald-400">{fmtAmt(adminAmt, sym)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Admin</p>
                <p className="text-xs text-slate-600">{(100 - sellerPct).toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ganadores */}
      {winningNumbers && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-indigo-500/20 rounded-lg text-indigo-400"><IcTrophy /></div>
            <p className="text-sm font-semibold text-white">Números Ganadores</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '1er Premio', chance: c1, full: winningNumbers.first_prize },
              { label: '2do Premio', chance: c2, full: winningNumbers.second_prize },
              { label: '3er Premio', chance: c3, full: winningNumbers.third_prize },
            ].map(({ label, chance, full }, i) => (
              <div key={i} className={`border rounded-xl p-3 text-center ${prizeBg[i]}`}>
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className={`text-2xl font-extrabold ${prizeColors[i]}`}>{chance || '—'}</p>
                {full && <p className="text-xs text-slate-500 mt-0.5">{full}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Excedente CSV */}
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Generar CSV de excedente</p>
        <p className="text-xs text-slate-400">Ingresa el umbral: los números con más piezas vendidas que este valor aparecerán en el CSV con su excedente.</p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-400 block mb-1.5">Umbral (piezas)</label>
            <input
              type="number" min="0" step="1"
              value={umbral}
              onChange={e => setUmbral(e.target.value)}
              placeholder="Ej: 20"
              className={inp}
            />
          </div>
          <button
            onClick={() => generateExcessCSV('chances')}
            disabled={!umbral}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold px-2.5 py-2 rounded-lg transition whitespace-nowrap"
          >
            ↓ Chances
          </button>
          <button
            onClick={() => generateExcessCSV('billetes')}
            disabled={!umbral}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold px-2.5 py-2 rounded-lg transition whitespace-nowrap"
          >
            ↓ Billetes
          </button>
        </div>
      </div>

      {/* ===================== SECCIÓN CHANCES ===================== */}
      <div className="bg-slate-900/50 border border-blue-500/20 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-blue-400 uppercase tracking-wider">Chances</span>
          <span className="text-xs text-slate-500">2 cifras (00–99)</span>
        </div>

        {/* Stats chances */}
        {!loading && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{Object.values(numberSales).filter(p => p > 0).length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Números</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-indigo-400">{totalPieces}</p>
              <p className="text-xs text-slate-500 mt-0.5">Piezas</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-violet-400">{topNumbers[0]?.[0] ?? '—'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Más vendido</p>
            </div>
          </div>
        )}

        {/* Top 3 chances */}
        {!loading && topNumbers.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top más vendidos</p>
            <div className="space-y-2.5">
              {topNumbers.map(([num, pieces], i) => {
                const bars = ['bg-violet-500', 'bg-indigo-500', 'bg-blue-500'];
                return (
                  <div key={num}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 w-4 font-mono">{i + 1}</span>
                        <span className="text-base font-bold text-white font-mono">{num}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-300">{pieces} piezas</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${bars[i]} rounded-full`} style={{ width: `${Math.round((pieces / maxPieces) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Grid 00-99 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cuadrícula 00 – 99</p>
            {winningNumbers && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />1°</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />2°</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />3°</span>
              </div>
            )}
          </div>
          {loading ? (
            <div className="grid grid-cols-5 gap-0.5 rounded-2xl overflow-hidden">
              {Array.from({ length: 100 }).map((_, i) => (
                <div key={i} className="bg-slate-800 animate-pulse h-14 rounded" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-0.5 rounded-2xl overflow-hidden border border-slate-800">
              {Array.from({ length: 100 }).map((_, i) => {
                const num = i.toString().padStart(2, '0');
                const pieces = numberSales[num] || 0;
                const w1 = c1 === num, w2 = c2 === num, w3 = c3 === num;
                return (
                  <div key={num} className={`flex flex-col items-center justify-center py-2.5 px-1 ${cellColor(pieces, maxPieces, w1, w2, w3)}`}>
                    <span className="text-xs font-bold font-mono leading-none">{num}</span>
                    <span className={`text-[11px] leading-none mt-0.5 ${pieces === 0 ? 'opacity-0' : ''}`}>{pieces}</span>
                    {(w1 || w2 || w3) && (
                      <span className="text-[9px] leading-none mt-0.5 font-bold">{w1 ? '1°' : w2 ? '2°' : '3°'}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex items-center gap-1">
            {[['bg-slate-900 border border-slate-800','Sin ventas'],['bg-blue-950',''],['bg-indigo-900',''],['bg-indigo-800',''],['bg-violet-700',''],['bg-violet-500','Máximo']].map(([cls, label], i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-full h-4 rounded ${cls}`} />
                {label && <p className="text-[10px] text-slate-600">{label}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Resumen financiero chances */}
        {!loading && <FinancialCard fin={financials} />}
      </div>

      {/* ===================== SECCIÓN BILLETES ===================== */}
      <div className="bg-slate-900/50 border border-purple-500/20 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-purple-400 uppercase tracking-wider">Billetes</span>
          <span className="text-xs text-slate-500">4 cifras</span>
        </div>

        {/* Stats billetes */}
        {!loading && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{sortedBilletes.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Números</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-indigo-400">{totalBilletePieces}</p>
              <p className="text-xs text-slate-500 mt-0.5">Piezas</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-violet-400">{topBilletes[0]?.[0] ?? '—'}</p>
              <p className="text-xs text-slate-500 mt-0.5">Más vendido</p>
            </div>
          </div>
        )}

        {/* Top 3 billetes */}
        {!loading && topBilletes.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top más vendidos</p>
            <div className="space-y-2.5">
              {topBilletes.map(([num, pieces], i) => {
                const bars = ['bg-violet-500', 'bg-indigo-500', 'bg-blue-500'];
                return (
                  <div key={num}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 w-4 font-mono">{i + 1}</span>
                        <span className="text-base font-bold text-white font-mono">{num}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-300">{pieces} piezas</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${bars[i]} rounded-full`} style={{ width: `${Math.round((pieces / maxBilletePieces) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lista de billetes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Billetes vendidos</p>
            {winningNumbers && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />1°</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />2°</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />3°</span>
              </div>
            )}
          </div>
          {loading ? (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-slate-800 animate-pulse h-12 rounded-xl" />
              ))}
            </div>
          ) : sortedBilletes.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
              <p className="text-slate-500 text-sm">No hay billetes vendidos con los filtros seleccionados</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sortedBilletes.map(([num, pieces]) => {
                const isW1 = isPale ? (pale1 && num === pale1) : (b1 && num === b1);
                const isW2 = isPale ? (pale2 && num === pale2) : (b2 && num === b2);
                const isW3 = isPale ? (pale3 && num === pale3) : (b3 && num === b3);
                const isWinner = isW1 || isW2 || isW3;
                const prizeLabel = isW1 ? (isPale ? '1er Palé' : '1er Premio') : isW2 ? (isPale ? '2do Palé' : '2do Premio') : isW3 ? (isPale ? '3er Palé' : '3er Premio') : null;
                const winBg = isW1 ? 'bg-indigo-500/20 border-indigo-500/50' : isW2 ? 'bg-emerald-500/20 border-emerald-500/50' : isW3 ? 'bg-amber-500/20 border-amber-500/50' : 'bg-slate-900 border-slate-800';
                const numColor = isW1 ? 'text-indigo-300' : isW2 ? 'text-emerald-300' : isW3 ? 'text-amber-300' : 'text-white';
                return (
                  <div key={num} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${winBg}`}>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-lg font-bold ${numColor}`}>{num}</span>
                      {isWinner && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isW1 ? 'bg-indigo-500/30 text-indigo-300' : isW2 ? 'bg-emerald-500/30 text-emerald-300' : 'bg-amber-500/30 text-amber-300'}`}>
                          {prizeLabel}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-slate-300">{pieces} {pieces === 1 ? 'pieza' : 'piezas'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resumen financiero billetes */}
        {!loading && <FinancialCard fin={billeteFinancials} />}
      </div>


    </div>
  );
}
