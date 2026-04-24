import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';

const inputCls = "w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2.5 text-center text-lg font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500";
const selectCls = "w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function ManageResults() {
  const { profile } = useAuth();
  const [lotteries, setLotteries] = useState([]);
  const [drawTimes, setDrawTimes] = useState([]);
  const [selectedLottery, setSelectedLottery] = useState('');
  const [selectedDrawTime, setSelectedDrawTime] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [form, setForm] = useState({ first: '', second: '', third: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadLotteries(); }, []);

  useEffect(() => {
    if (selectedLottery) {
      const lot = lotteries.find(l => l.id === selectedLottery);
      setDrawTimes(lot?.draw_times || []);
      setSelectedDrawTime('');
    }
  }, [selectedLottery]);

  useEffect(() => {
    if (selectedLottery && selectedDate) loadExisting();
  }, [selectedLottery, selectedDrawTime, selectedDate]);

  async function loadLotteries() {
    const { data: lots } = await db.from('lotteries').select('id, display_name, lottery_type, prize_1st_multiplier, prize_2nd_multiplier, prize_3rd_multiplier, billete_prize_1st_multiplier, billete_prize_2nd_multiplier, billete_prize_3rd_multiplier').eq('admin_id', profile.id).order('display_name');
    const { data: dts } = await db.from('draw_times').select('id, lottery_id, time_label, custom_prize_1st_multiplier, custom_prize_2nd_multiplier, custom_prize_3rd_multiplier').order('time_value');
    const withDt = (lots || []).map(l => ({ ...l, draw_times: (dts || []).filter(d => d.lottery_id === l.id) }));
    setLotteries(withDt);
  }

  async function loadExisting() {
    setLoading(true);
    setForm({ first: '', second: '', third: '' });
    try {
      let q = db.from('winning_numbers').select('*')
        .eq('lottery_id', selectedLottery)
        .eq('draw_date', selectedDate);
      if (selectedDrawTime) q = q.eq('draw_time_id', selectedDrawTime);
      else q = q.is('draw_time_id', null);
      const { data } = await q.limit(1);
      if (data && data.length > 0) {
        setForm({ first: data[0].first_prize || '', second: data[0].second_prize || '', third: data[0].third_prize || '' });
      }
    } finally { setLoading(false); }
  }

  async function save() {
    if (!selectedLottery || !selectedDate) { setError('Selecciona lotería y fecha'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      // Delete existing
      let delQ = db.from('winning_numbers').delete()
        .eq('lottery_id', selectedLottery)
        .eq('draw_date', selectedDate)
        .eq('registered_by', profile.id);
      if (selectedDrawTime) delQ = delQ.eq('draw_time_id', selectedDrawTime);
      else delQ = delQ.is('draw_time_id', null);
      await delQ;

      // Insert new
      const row = {
        lottery_id: selectedLottery,
        draw_time_id: selectedDrawTime || null,
        draw_date: selectedDate,
        first_prize: form.first.trim() || null,
        second_prize: form.second.trim() || null,
        third_prize: form.third.trim() || null,
        registered_by: profile.id,
      };
      const { error: err } = await db.from('winning_numbers').insert(row);
      if (err) throw err;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally { setSaving(false); }
  }

  const lot = lotteries.find(l => l.id === selectedLottery);
  const dt = drawTimes.find(d => d.id === selectedDrawTime);
  const isPale = lot?.lottery_type === 'pale';
  const isDominical = lot?.lottery_type === 'dominical';
  const mult1 = dt?.custom_prize_1st_multiplier ?? lot?.prize_1st_multiplier ?? 11;
  const mult2 = dt?.custom_prize_2nd_multiplier ?? lot?.prize_2nd_multiplier ?? 3;
  const mult3 = dt?.custom_prize_3rd_multiplier ?? lot?.prize_3rd_multiplier ?? 2;
  const bmult1 = lot?.billete_prize_1st_multiplier ?? 2000;
  const bmult2 = lot?.billete_prize_2nd_multiplier ?? 600;
  const bmult3 = lot?.billete_prize_3rd_multiplier ?? 300;
  // Combinaciones palé: 1er=P1+P2, 2do=P1+P3, 3er=P2+P3
  const paleCombo1 = isPale && form.first.length === 2 && form.second.length === 2 ? form.first + form.second : null;
  const paleCombo2 = isPale && form.first.length === 2 && form.third.length === 2  ? form.first + form.third  : null;
  const paleCombo3 = isPale && form.second.length === 2 && form.third.length === 2 ? form.second + form.third : null;

  return (
    <div className="p-4 space-y-5 max-w-lg mx-auto pb-24">
      <div>
        <h1 className="text-lg font-bold text-white">Resultados del Día</h1>
        <p className="text-slate-400 text-xs mt-0.5">Ingresa los números ganadores por lotería y sorteo.</p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5"><p className="text-red-400 text-sm">{error}</p></div>}

      {/* Filters */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Lotería</label>
          <select value={selectedLottery} onChange={e => setSelectedLottery(e.target.value)} className={selectCls}>
            <option value="">Seleccionar lotería...</option>
            {lotteries.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
          </select>
        </div>
        {drawTimes.length > 0 && (
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Sorteo</label>
            <select value={selectedDrawTime} onChange={e => setSelectedDrawTime(e.target.value)} className={selectCls}>
              <option value="">Sin sorteo específico</option>
              {drawTimes.map(d => <option key={d.id} value={d.id}>{d.time_label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Fecha</label>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      {/* Winner numbers */}
      {selectedLottery && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm">
              Números Ganadores{' '}
              <span className="text-slate-500 font-normal">
                {isPale ? 'Palé — 2 cifras por premio' : isDominical ? '1er: 4 cifras · 2do/3er: 2 cifras' : '4 cifras'}
              </span>
            </h2>
            {loading && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[['1er Premio', 'first', '#6366f1'], ['2do Premio', 'second', '#22c55e'], ['3er Premio', 'third', '#f59e0b']].map(([label, key, color]) => {
              const maxLen = isPale ? 2 : isDominical ? (key === 'first' ? 4 : 2) : 4;
              return (
              <div key={key} className="text-center">
                <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
                <input
                  type="text" inputMode="numeric" maxLength={maxLen}
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value.replace(/\D/g,'').slice(0, maxLen) }))}
                  placeholder={'0'.repeat(maxLen)}
                  className={inputCls}
                  style={{ borderColor: form[key].length === maxLen ? color : undefined }}
                />
                {!isPale && !isDominical && form[key].length >= 2 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Chance: <span className="text-white font-bold">{form[key].slice(-2)}</span>
                  </p>
                )}
                {isDominical && key === 'first' && form[key].length >= 2 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Últ. 2: <span className="text-cyan-400 font-bold">{form[key].slice(-2)}</span>
                  </p>
                )}
              </div>
            );})}

          </div>

          {/* Combinaciones palé */}
          {isPale && (
            <div className="bg-slate-900/60 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide">Combinaciones Palé (4 cifras ganadoras)</p>
              {[['1er', paleCombo1, '#6366f1'], ['2do', paleCombo2, '#22c55e'], ['3er', paleCombo3, '#f59e0b']].map(([lbl, combo, color]) => (
                <div key={lbl} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{lbl} premio:</span>
                  <span className="font-bold tracking-widest" style={{ color: combo ? color : '#475569' }}>
                    {combo ?? '——'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Multipliers info */}
          <div className="space-y-2">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Chance (×precio)</p>
            <div className="flex gap-3 bg-slate-900/50 rounded-xl p-3">
              {[[mult1,'1er','text-indigo-400'],[mult2,'2do','text-emerald-400'],[mult3,'3er','text-amber-400']].map(([v,l,c]) => (
                <div key={l} className="flex-1 text-center">
                  <p className="text-[10px] text-slate-500">{l} ×</p>
                  <p className={`${c} font-bold text-sm`}>{v}</p>
                </div>
              ))}
            </div>
            {!isPale && (
              <>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Billete (×precio)</p>
                <div className="flex gap-3 bg-slate-900/50 rounded-xl p-3">
                  {[[bmult1,'1er','text-indigo-400'],[bmult2,'2do','text-emerald-400'],[bmult3,'3er','text-amber-400']].map(([v,l,c]) => (
                    <div key={l} className="flex-1 text-center">
                      <p className="text-[10px] text-slate-500">{l} ×</p>
                      <p className={`${c} font-bold text-sm`}>{v}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {isPale && (
              <>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Palé (×precio)</p>
                <div className="flex gap-3 bg-slate-900/50 rounded-xl p-3">
                  {[[bmult1,'1er','text-indigo-400'],[bmult2,'2do','text-emerald-400'],[bmult3,'3er','text-amber-400']].map(([v,l,c]) => (
                    <div key={l} className="flex-1 text-center">
                      <p className="text-[10px] text-slate-500">{l} ×</p>
                      <p className={`${c} font-bold text-sm`}>{v}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={save} disabled={saving}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
          >
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar resultados'}
          </button>
        </div>
      )}
    </div>
  );
}
