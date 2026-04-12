import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';

const EMPTY_LOTTERY = {
  display_name: '', lottery_type: 'regular', currency_code: 'USD', currency_symbol: '$',
  price_2_digits: '0.20', price_4_digits: '1.00',
  prize_1st_multiplier: '11', prize_2nd_multiplier: '3', prize_3rd_multiplier: '2',
  billete_prize_1st_multiplier: '2000', billete_prize_2nd_multiplier: '600', billete_prize_3rd_multiplier: '300',
  reventado_price_2_digits: '0.20', reventado_price_4_digits: '1.00',
  reventado_payout_per_block: '90', reventado_block_size: '5',
};

const EMPTY_DRAW_TIME = {
  time_label: '', time_value: '', cutoff_minutes_before: '1', block_minutes_after: '20',
  custom_price_2_digits: '', custom_price_4_digits: '',
  custom_prize_1st_multiplier: '', custom_prize_2nd_multiplier: '', custom_prize_3rd_multiplier: '',
};

const inputCls = "w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function ManageLotteries() {
  const { profile } = useAuth();
  const [lotteries, setLotteries] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [drawTimes, setDrawTimes] = useState({});

  const [showLotteryModal, setShowLotteryModal] = useState(false);
  const [editLottery, setEditLottery] = useState(null);
  const [lotteryForm, setLotteryForm] = useState(EMPTY_LOTTERY);

  const [showDrawModal, setShowDrawModal] = useState(false);
  const [drawLotteryId, setDrawLotteryId] = useState(null);
  const [editDraw, setEditDraw] = useState(null);
  const [drawForm, setDrawForm] = useState(EMPTY_DRAW_TIME);

  // Limits
  const [limits, setLimits] = useState({});         // keyed by "lot_{id}" or "dt_{id}"
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [limitsTarget, setLimitsTarget] = useState(null); // { type, lottery_id, lottery_name, draw_time_id?, label }
  const [limitsForm, setLimitsForm] = useState({ limit_2: '', limit_4: '' });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadLotteries() {
    setLoading(true);
    const { data } = await db.from('lotteries').select('*')
      .eq('admin_id', profile.id).order('display_name');
    // Cargar columnas de billetes via RPC (InsForge no las incluye en select *)
    const { data: bData } = await db.rpc('get_lottery_billete_multipliers');
    const bMap = {};
    (bData || []).forEach(r => { bMap[r.id] = r; });
    const all = (data || []).map(l => ({ ...l, ...bMap[l.id] }));
    setLotteries(all);
    setLoading(false);
  }

  async function loadCurrencies() {
    const { data } = await db.from('system_config').select('config_value').eq('config_key', 'available_currencies').single();
    if (data) setCurrencies(data.config_value);
  }

  async function loadDrawTimes(lotteryId) {
    const { data } = await db.from('draw_times').select('*').eq('lottery_id', lotteryId).order('time_value');
    setDrawTimes(prev => ({ ...prev, [lotteryId]: data || [] }));
  }

  async function loadLimitsForLottery(lotteryId) {
    const { data } = await db.from('sales_limits').select('*')
      .eq('lottery_id', lotteryId).eq('admin_id', profile.id).is('number', null);
    if (!data) return;
    const newLimits = {};
    data.forEach(row => {
      const key = row.draw_time_id ? `dt_${row.draw_time_id}` : `lot_${lotteryId}`;
      if (!newLimits[key]) newLimits[key] = {};
      if (row.digit_type === 2) newLimits[key].limit_2 = String(row.max_pieces);
      if (row.digit_type === 4) newLimits[key].limit_4 = String(row.max_pieces);
    });
    setLimits(prev => ({ ...prev, ...newLimits }));
  }

  useEffect(() => {
    if (profile?.id) { loadLotteries(); loadCurrencies(); }
  }, [profile]);

  function toggleExpand(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!drawTimes[id]) loadDrawTimes(id);
    loadLimitsForLottery(id);
  }

  // ── Lotería modal ──
  function openCreateLottery() {
    setEditLottery(null);
    setLotteryForm({ ...EMPTY_LOTTERY, currency_code: profile?.currency_code || 'USD', currency_symbol: profile?.currency_symbol || '$' });
    setError(''); setShowLotteryModal(true);
  }

  function openEditLottery(lot) {
    setEditLottery(lot);
    setLotteryForm({
      display_name: lot.display_name, lottery_type: lot.lottery_type,
      currency_code: lot.currency_code, currency_symbol: lot.currency_symbol,
      price_2_digits: String(lot.price_2_digits), price_4_digits: String(lot.price_4_digits),
      prize_1st_multiplier: String(lot.prize_1st_multiplier), prize_2nd_multiplier: String(lot.prize_2nd_multiplier), prize_3rd_multiplier: String(lot.prize_3rd_multiplier),
      billete_prize_1st_multiplier: String(lot.billete_prize_1st_multiplier ?? '2000'), billete_prize_2nd_multiplier: String(lot.billete_prize_2nd_multiplier ?? '600'), billete_prize_3rd_multiplier: String(lot.billete_prize_3rd_multiplier ?? '300'),
      reventado_price_2_digits: String(lot.reventado_price_2_digits || '0.20'),
      reventado_price_4_digits: String(lot.reventado_price_4_digits || '1.00'),
      reventado_payout_per_block: String(lot.reventado_payout_per_block || '90'),
      reventado_block_size: String(lot.reventado_block_size || '5'),
    });
    setError(''); setShowLotteryModal(true);
  }

  function onCurrencyChange(code) {
    const cur = currencies.find(c => c.code === code);
    if (cur) setLotteryForm(f => ({ ...f, currency_code: cur.code, currency_symbol: cur.symbol }));
  }

  async function saveLottery() {
    if (!lotteryForm.display_name.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        display_name: lotteryForm.display_name.trim(),
        name: lotteryForm.display_name.trim().toUpperCase().replace(/\s+/g, '_'),
        lottery_type: lotteryForm.lottery_type, currency_code: lotteryForm.currency_code, currency_symbol: lotteryForm.currency_symbol,
        price_2_digits: parseFloat(lotteryForm.price_2_digits), price_4_digits: parseFloat(lotteryForm.price_4_digits),
        prize_1st_multiplier: parseFloat(lotteryForm.prize_1st_multiplier), prize_2nd_multiplier: parseFloat(lotteryForm.prize_2nd_multiplier), prize_3rd_multiplier: parseFloat(lotteryForm.prize_3rd_multiplier),
        billete_prize_1st_multiplier: parseFloat(lotteryForm.billete_prize_1st_multiplier), billete_prize_2nd_multiplier: parseFloat(lotteryForm.billete_prize_2nd_multiplier), billete_prize_3rd_multiplier: parseFloat(lotteryForm.billete_prize_3rd_multiplier),
        ...(lotteryForm.lottery_type === 'reventado' && {
          reventado_price_2_digits: parseFloat(lotteryForm.reventado_price_2_digits),
          reventado_price_4_digits: parseFloat(lotteryForm.reventado_price_4_digits),
          reventado_payout_per_block: parseFloat(lotteryForm.reventado_payout_per_block),
          reventado_block_size: parseInt(lotteryForm.reventado_block_size),
        }),
      };
      if (editLottery) {
        const { error: err } = await db.from('lotteries').update(payload).eq('id', editLottery.id);
        if (err) throw err;
        // RPC para multiplicadores (InsForge no los incluye en su schema cache)
        const { error: mErr } = await db.rpc('update_lottery_multipliers', {
          p_lottery_id: editLottery.id,
          p_m1: parseFloat(lotteryForm.prize_1st_multiplier),
          p_m2: parseFloat(lotteryForm.prize_2nd_multiplier),
          p_m3: parseFloat(lotteryForm.prize_3rd_multiplier),
          p_bm1: parseFloat(lotteryForm.billete_prize_1st_multiplier),
          p_bm2: parseFloat(lotteryForm.billete_prize_2nd_multiplier),
          p_bm3: parseFloat(lotteryForm.billete_prize_3rd_multiplier),
        });
        if (mErr) throw new Error('Error al actualizar multiplicadores: ' + mErr.message);
        // RPC para precios (InsForge no los incluye en su schema cache)
        const { error: pErr } = await db.rpc('update_lottery_prices', {
          p_lottery_id: editLottery.id,
          p_price_2: parseFloat(lotteryForm.price_2_digits),
          p_price_4: parseFloat(lotteryForm.price_4_digits),
        });
        if (pErr) throw new Error('Error al actualizar precios: ' + pErr.message);
      } else {
        const { error: err } = await db.from('lotteries').insert({ ...payload, admin_id: profile.id, created_by: profile.id });
        if (err) throw err;
      }
      setShowLotteryModal(false); loadLotteries();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function deactivateLottery(lot) {
    const { error: err } = await db.rpc('deactivate_lottery', { p_id: lot.id });
    if (err) { setError('Error al desactivar: ' + err.message); return; }
    loadLotteries();
  }

  async function reactivateLottery(lot) {
    const { error: err } = await db.rpc('reactivate_lottery', { p_id: lot.id });
    if (err) { setError('Error al reactivar: ' + err.message); return; }
    loadLotteries();
  }

  async function deleteLottery(lot) {
    if (!window.confirm(`¿Eliminar "${lot.display_name}" permanentemente? Esta acción no se puede deshacer.`)) return;
    const { error: err } = await db.rpc('delete_lottery', { p_id: lot.id });
    if (err) { setError('Error al eliminar: ' + err.message); return; }
    loadLotteries();
  }

  // ── Draw time modal ──
  function openCreateDraw(lotteryId) {
    setDrawLotteryId(lotteryId); setEditDraw(null); setDrawForm(EMPTY_DRAW_TIME); setError(''); setShowDrawModal(true);
  }

  function openEditDraw(dt, lotteryId) {
    setDrawLotteryId(lotteryId); setEditDraw(dt);
    setDrawForm({
      time_label: dt.time_label, time_value: dt.time_value,
      cutoff_minutes_before: String(dt.cutoff_minutes_before), block_minutes_after: String(dt.block_minutes_after),
      custom_price_2_digits: dt.custom_price_2_digits != null ? String(dt.custom_price_2_digits) : '',
      custom_price_4_digits: dt.custom_price_4_digits != null ? String(dt.custom_price_4_digits) : '',
      custom_prize_1st_multiplier: dt.custom_prize_1st_multiplier != null ? String(dt.custom_prize_1st_multiplier) : '',
      custom_prize_2nd_multiplier: dt.custom_prize_2nd_multiplier != null ? String(dt.custom_prize_2nd_multiplier) : '',
      custom_prize_3rd_multiplier: dt.custom_prize_3rd_multiplier != null ? String(dt.custom_prize_3rd_multiplier) : '',
    });
    setError(''); setShowDrawModal(true);
  }

  async function saveDraw() {
    if (!drawForm.time_label.trim() || !drawForm.time_value) { setError('Etiqueta y hora son obligatorias'); return; }
    setSaving(true); setError('');
    try {
      const nf = v => v.trim() === '' ? null : parseFloat(v);
      const payload = {
        lottery_id: drawLotteryId, time_label: drawForm.time_label.trim(), time_value: drawForm.time_value,
        cutoff_minutes_before: parseInt(drawForm.cutoff_minutes_before) || 1,
        block_minutes_after: parseInt(drawForm.block_minutes_after) || 20,
        custom_price_2_digits: nf(drawForm.custom_price_2_digits), custom_price_4_digits: nf(drawForm.custom_price_4_digits),
        custom_prize_1st_multiplier: nf(drawForm.custom_prize_1st_multiplier), custom_prize_2nd_multiplier: nf(drawForm.custom_prize_2nd_multiplier), custom_prize_3rd_multiplier: nf(drawForm.custom_prize_3rd_multiplier),
      };
      if (editDraw) {
        const { error: err } = await db.from('draw_times').update(payload).eq('id', editDraw.id);
        if (err) throw err;
      } else {
        const { error: err } = await db.from('draw_times').insert(payload);
        if (err) throw err;
      }
      setShowDrawModal(false); loadDrawTimes(drawLotteryId);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function toggleDrawActive(dt) {
    await db.from('draw_times').update({ is_active: !dt.is_active }).eq('id', dt.id);
    loadDrawTimes(dt.lottery_id);
  }

  // ── Limits modal ──
  function openLimitsModal(target) {
    const key = target.draw_time_id ? `dt_${target.draw_time_id}` : `lot_${target.lottery_id}`;
    const current = limits[key] || {};
    setLimitsTarget(target);
    setLimitsForm({ limit_2: current.limit_2 || '', limit_4: current.limit_4 || '' });
    setError(''); setShowLimitsModal(true);
  }

  async function saveLimits() {
    setSaving(true); setError('');
    try {
      // Delete existing global limits for this scope
      let delQuery = db.from('sales_limits').delete()
        .eq('lottery_id', limitsTarget.lottery_id)
        .eq('admin_id', profile.id)
        .is('number', null);
      if (limitsTarget.draw_time_id) delQuery = delQuery.eq('draw_time_id', limitsTarget.draw_time_id);
      else delQuery = delQuery.is('draw_time_id', null);
      await delQuery;

      // Insert new limits (only if non-empty)
      const toInsert = [];
      if (limitsForm.limit_2.trim() !== '') {
        toInsert.push({
          lottery_id: limitsTarget.lottery_id, draw_time_id: limitsTarget.draw_time_id || null,
          number: null, digit_type: 2,
          max_pieces: parseInt(limitsForm.limit_2), admin_id: profile.id,
          is_global: !limitsTarget.draw_time_id,
        });
      }
      if (limitsForm.limit_4.trim() !== '') {
        toInsert.push({
          lottery_id: limitsTarget.lottery_id, draw_time_id: limitsTarget.draw_time_id || null,
          number: null, digit_type: 4,
          max_pieces: parseInt(limitsForm.limit_4), admin_id: profile.id,
          is_global: !limitsTarget.draw_time_id,
        });
      }
      if (toInsert.length > 0) {
        const { error: err } = await db.from('sales_limits').insert(toInsert);
        if (err) throw err;
      }

      // Update local state
      const key = limitsTarget.draw_time_id ? `dt_${limitsTarget.draw_time_id}` : `lot_${limitsTarget.lottery_id}`;
      setLimits(prev => ({ ...prev, [key]: { limit_2: limitsForm.limit_2, limit_4: limitsForm.limit_4 } }));
      setShowLimitsModal(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function getLimitBadge(key, sym) {
    const l = limits[key];
    if (!l?.limit_2 && !l?.limit_4) return null;
    const parts = [];
    if (l.limit_2) parts.push(`Chance ≤${l.limit_2}`);
    if (l.limit_4) parts.push(`Billete ≤${l.limit_4}`);
    return parts.join(' · ');
  }

  const f = lotteryForm;
  const isRev = f.lottery_type === 'reventado';

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Loterías</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInactive(v => !v)} className={`text-xs px-3 py-1.5 rounded-lg border transition ${showInactive ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10' : 'border-slate-600 text-slate-400 hover:text-slate-300'}`}>
            {showInactive ? 'Ver activas' : 'Ver inactivas'}
          </button>
          <button onClick={openCreateLottery} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-xl transition font-medium">
            + Nueva
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-slate-500 text-sm py-10">Cargando...</p>
      ) : (
        <div className="space-y-2">
          {showInactive && lotteries.filter(l => l.is_active === false).length === 0 && (
            <p className="text-center text-slate-500 text-sm py-4">No hay loterías inactivas</p>
          )}
          {!showInactive && lotteries.filter(l => l.is_active !== false).length === 0 && (
            <p className="text-center text-slate-500 text-sm py-4">No hay loterías</p>
          )}
          {lotteries.filter(l => showInactive ? l.is_active === false : l.is_active !== false).map(lot => {
            const lotLimitBadge = getLimitBadge(`lot_${lot.id}`, lot.currency_symbol);
            return (
              <div key={lot.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => toggleExpand(lot.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white text-sm">{lot.display_name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">{lot.lottery_type}</span>
                    <span className="text-xs text-slate-500">{lot.currency_symbol}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {lot.is_active === false ? (
                      <button onClick={e => { e.stopPropagation(); reactivateLottery(lot); }} className="text-xs text-green-500 hover:text-green-400 font-medium">Reactivar</button>
                    ) : (
                      <>
                        <button onClick={e => { e.stopPropagation(); openEditLottery(lot); }} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Editar</button>
                        <button onClick={e => { e.stopPropagation(); deactivateLottery(lot); }} className="text-xs text-yellow-500 hover:text-yellow-400 font-medium">Desactivar</button>
                      </>
                    )}
                    <button onClick={e => { e.stopPropagation(); deleteLottery(lot); }} className="text-xs text-red-500 hover:text-red-400 font-medium">Eliminar</button>
                    <span className="text-slate-500 text-sm">{expanded === lot.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Precios rápidos */}
                <div className="px-4 pb-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>Chance: {lot.currency_symbol}{lot.price_2_digits}</span>
                  <span>Billete: {lot.currency_symbol}{lot.price_4_digits}</span>
                  <span>Premio 1°: ×{lot.prize_1st_multiplier}</span>
                  {lotLimitBadge && (
                    <span className="text-amber-400">🚦 {lotLimitBadge}</span>
                  )}
                </div>

                {/* Expanded */}
                {expanded === lot.id && (
                  <div className="border-t border-slate-700 px-4 py-3 space-y-4">

                    {/* Límites de lotería */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-400">Límites de esta lotería</p>
                        {lotLimitBadge
                          ? <p className="text-xs text-amber-400 mt-0.5">{lotLimitBadge}</p>
                          : <p className="text-xs text-slate-600 mt-0.5">Sin límite — usa los globales</p>
                        }
                      </div>
                      <button
                        onClick={() => openLimitsModal({ lottery_id: lot.id, lottery_name: lot.display_name, draw_time_id: null })}
                        className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 px-2.5 py-1 rounded-lg transition"
                      >
                        🚦 Límites
                      </button>
                    </div>

                    {/* Horarios */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-400">Horarios de sorteo</p>
                        <button onClick={() => openCreateDraw(lot.id)} className="text-xs text-slate-300 font-medium border border-slate-600 hover:bg-slate-700 px-2 py-1 rounded-lg transition">
                          + Horario
                        </button>
                      </div>

                      {!drawTimes[lot.id] ? (
                        <p className="text-xs text-slate-500">Cargando...</p>
                      ) : drawTimes[lot.id].length === 0 ? (
                        <p className="text-xs text-slate-500">Sin horarios</p>
                      ) : (
                        <div className="space-y-1.5">
                          {drawTimes[lot.id].map(dt => {
                            const dtLimitBadge = getLimitBadge(`dt_${dt.id}`, lot.currency_symbol);
                            return (
                              <div key={dt.id} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white">{dt.time_label}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      Cierre: {dt.cutoff_minutes_before}min antes · Bloqueo: {dt.block_minutes_after}min después
                                      {dt.custom_price_2_digits != null && ` · Chance: ${lot.currency_symbol}${dt.custom_price_2_digits}`}
                                      {dt.custom_price_4_digits != null && ` · Billete: ${lot.currency_symbol}${dt.custom_price_4_digits}`}
                                    </p>
                                    {dtLimitBadge && (
                                      <p className="text-xs text-amber-400 mt-0.5">🚦 {dtLimitBadge}</p>
                                    )}
                                    {!dtLimitBadge && lotLimitBadge && (
                                      <p className="text-xs text-slate-600 mt-0.5">Hereda límites de la lotería</p>
                                    )}
                                  </div>
                                  <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                                    <button onClick={() => openLimitsModal({ lottery_id: lot.id, draw_time_id: dt.id, draw_time_label: dt.time_label, lottery_name: lot.display_name })}
                                      className="text-xs text-amber-400 hover:text-amber-300 font-medium">🚦</button>
                                    <button onClick={() => openEditDraw(dt, lot.id)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">Editar</button>
                                    <button onClick={() => toggleDrawActive(dt)} className={`text-xs font-medium ${dt.is_active ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}>
                                      {dt.is_active ? 'Desact.' : 'Activ.'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Lotería */}
      {showLotteryModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white">{editLottery ? 'Editar Lotería' : 'Nueva Lotería'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Nombre *</label>
                <input type="text" value={f.display_name} onChange={e => setLotteryForm(p => ({ ...p, display_name: e.target.value }))} className={inputCls} placeholder="Ej: LOTERIA PANAMA" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Tipo</label>
                <select value={f.lottery_type} onChange={e => setLotteryForm(p => ({ ...p, lottery_type: e.target.value }))} className={inputCls} style={{background:'#0f172a'}}>
                  <option value="regular">Regular</option>
                  <option value="reventado">Reventado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Moneda</label>
                <select value={f.currency_code} onChange={e => onCurrencyChange(e.target.value)} className={inputCls} style={{background:'#0f172a'}}>
                  {currencies.map(c => <option key={c.code} value={c.code}>{c.symbol} — {c.name}</option>)}
                </select>
              </div>
              <p className="text-xs font-semibold text-slate-400 pt-1">Precios</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Chance (2 cifras)</label>
                  <input type="number" step="0.01" value={isRev ? f.reventado_price_2_digits : f.price_2_digits}
                    onChange={e => setLotteryForm(p => isRev ? ({ ...p, reventado_price_2_digits: e.target.value }) : ({ ...p, price_2_digits: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Billete (4 cifras)</label>
                  <input type="number" step="0.01" value={isRev ? f.reventado_price_4_digits : f.price_4_digits}
                    onChange={e => setLotteryForm(p => isRev ? ({ ...p, reventado_price_4_digits: e.target.value }) : ({ ...p, price_4_digits: e.target.value }))} className={inputCls} />
                </div>
              </div>
              {isRev ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Pago por bloque</label>
                    <input type="number" step="0.01" value={f.reventado_payout_per_block} onChange={e => setLotteryForm(p => ({ ...p, reventado_payout_per_block: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tamaño bloque</label>
                    <input type="number" value={f.reventado_block_size} onChange={e => setLotteryForm(p => ({ ...p, reventado_block_size: e.target.value }))} className={inputCls} />
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-400 pt-1">Multiplicadores — Chance (2 cifras)</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[['1er', 'prize_1st_multiplier'], ['2do', 'prize_2nd_multiplier'], ['3er', 'prize_3rd_multiplier']].map(([label, key]) => (
                      <div key={key}>
                        <label className="block text-xs text-slate-500 mb-1">{label} premio</label>
                        <input type="number" step="0.1" value={f[key]} onChange={e => setLotteryForm(p => ({ ...p, [key]: e.target.value }))} className={inputCls} />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-slate-400 pt-1">Multiplicadores — Billete (4 cifras)</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[['1er', 'billete_prize_1st_multiplier'], ['2do', 'billete_prize_2nd_multiplier'], ['3er', 'billete_prize_3rd_multiplier']].map(([label, key]) => (
                      <div key={key}>
                        <label className="block text-xs text-slate-500 mb-1">{label} premio</label>
                        <input type="number" step="1" value={f[key]} onChange={e => setLotteryForm(p => ({ ...p, [key]: e.target.value }))} className={inputCls} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowLotteryModal(false)} className="flex-1 border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm py-2.5 rounded-xl transition">Cancelar</button>
              <button onClick={saveLottery} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-2.5 rounded-xl transition disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Horario */}
      {showDrawModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white">{editDraw ? 'Editar Horario' : 'Nuevo Horario'}</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Etiqueta *</label>
                  <input type="text" value={drawForm.time_label} onChange={e => setDrawForm(p => ({ ...p, time_label: e.target.value }))} className={inputCls} placeholder="3:00 PM" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Hora *</label>
                  <input type="time" value={drawForm.time_value} onChange={e => setDrawForm(p => ({ ...p, time_value: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Cierre (min antes)</label>
                  <input type="number" value={drawForm.cutoff_minutes_before} onChange={e => setDrawForm(p => ({ ...p, cutoff_minutes_before: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Bloqueo (min después)</label>
                  <input type="number" value={drawForm.block_minutes_after} onChange={e => setDrawForm(p => ({ ...p, block_minutes_after: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-500 pt-1">Override de precios (vacío = heredar de la lotería)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Precio chance</label>
                  <input type="number" step="0.01" value={drawForm.custom_price_2_digits} onChange={e => setDrawForm(p => ({ ...p, custom_price_2_digits: e.target.value }))} className={inputCls} placeholder="Heredar" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Precio billete</label>
                  <input type="number" step="0.01" value={drawForm.custom_price_4_digits} onChange={e => setDrawForm(p => ({ ...p, custom_price_4_digits: e.target.value }))} className={inputCls} placeholder="Heredar" />
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-500">Override multiplicadores (vacío = heredar)</p>
              <div className="grid grid-cols-3 gap-2">
                {[['1er', 'custom_prize_1st_multiplier'], ['2do', 'custom_prize_2nd_multiplier'], ['3er', 'custom_prize_3rd_multiplier']].map(([label, key]) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-500 mb-1">{label}</label>
                    <input type="number" step="0.1" value={drawForm[key]} onChange={e => setDrawForm(p => ({ ...p, [key]: e.target.value }))} className={inputCls} placeholder="—" />
                  </div>
                ))}
              </div>
            </div>
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowDrawModal(false)} className="flex-1 border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm py-2.5 rounded-xl transition">Cancelar</button>
              <button onClick={saveDraw} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-2.5 rounded-xl transition disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Límites */}
      {showLimitsModal && limitsTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">🚦 Límites de venta</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {limitsTarget.draw_time_id
                  ? `${limitsTarget.lottery_name} — ${limitsTarget.draw_time_label}`
                  : `${limitsTarget.lottery_name} (todos los horarios)`}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-400 mb-3">Máximo de tiempos por número. Vacío = sin límite / usar globales.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Chance (2 cifras)</label>
                  <input
                    type="number" min="0" step="1"
                    value={limitsForm.limit_2}
                    onChange={e => setLimitsForm(f => ({ ...f, limit_2: e.target.value }))}
                    className={inputCls}
                    placeholder="Sin límite"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Billete (4 cifras)</label>
                  <input
                    type="number" min="0" step="1"
                    value={limitsForm.limit_4}
                    onChange={e => setLimitsForm(f => ({ ...f, limit_4: e.target.value }))}
                    className={inputCls}
                    placeholder="Sin límite"
                  />
                </div>
              </div>
            </div>

            {limitsTarget.draw_time_id && (
              <p className="text-xs text-slate-500">
                Si no configuras aquí, hereda los límites de la lotería. Si la lotería tampoco tiene, usa los límites globales.
              </p>
            )}

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setShowLimitsModal(false)} className="flex-1 border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm py-2.5 rounded-xl transition">Cancelar</button>
              <button onClick={saveLimits} disabled={saving} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-sm py-2.5 rounded-xl transition disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar límites'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
