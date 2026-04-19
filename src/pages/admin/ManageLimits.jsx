import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';

const inputCls = "w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function ManageLimits() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [globalChance, setGlobalChance] = useState('');
  const [globalBillete, setGlobalBillete] = useState('');

  const [lotteryLimits, setLotteryLimits] = useState([]);
  const [lotteries, setLotteries] = useState([]);
  const [drawTimesMap, setDrawTimesMap] = useState({});

  // Límites por número
  const [numberLimits, setNumberLimits] = useState([]);
  const [numLottery, setNumLottery] = useState('');
  const [numDrawTime, setNumDrawTime] = useState('');
  const [numNumber, setNumNumber] = useState('');
  const [numMax, setNumMax] = useState('');
  const [savingNum, setSavingNum] = useState(false);
  const [numError, setNumError] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: lots }, { data: dts }, { data: limits }] = await Promise.all([
        db.from('lotteries').select('id, display_name').eq('admin_id', profile.id).order('display_name'),
        db.from('draw_times').select('id, time_label, lottery_id').eq('admin_id', profile.id),
        db.from('sales_limits').select('*, draw_times(time_label)').eq('admin_id', profile.id),
      ]);

      const lotList = lots || [];
      const dtList = dts || [];
      const limitList = limits || [];

      setLotteries(lotList);

      // Map draw times by lottery
      const dtMap = {};
      dtList.forEach(dt => {
        if (!dtMap[dt.lottery_id]) dtMap[dt.lottery_id] = [];
        dtMap[dt.lottery_id].push(dt);
      });
      setDrawTimesMap(dtMap);

      // Global limits (lottery_id IS NULL, number IS NULL)
      const globals = limitList.filter(r => !r.lottery_id && r.number === null);
      setGlobalChance(globals.find(r => r.digit_type === 2)?.max_pieces?.toString() ?? '');
      setGlobalBillete(globals.find(r => r.digit_type === 4)?.max_pieces?.toString() ?? '');

      // Per-lottery limits summary (number IS NULL)
      const perLottery = lotList.map(lot => {
        const lotRows = limitList.filter(r => r.lottery_id === lot.id && !r.draw_time_id && r.number === null);
        return {
          id: lot.id,
          name: lot.display_name,
          chance: lotRows.find(r => r.digit_type === 2)?.max_pieces ?? null,
          billete: lotRows.find(r => r.digit_type === 4)?.max_pieces ?? null,
        };
      });
      setLotteryLimits(perLottery);

      // Per-number limits (number IS NOT NULL)
      const perNumber = limitList
        .filter(r => r.number !== null)
        .map(r => ({
          id: r.id,
          lottery_id: r.lottery_id,
          draw_time_id: r.draw_time_id,
          number: r.number,
          digit_type: r.digit_type,
          max_pieces: r.max_pieces,
          lotteryName: lotList.find(l => l.id === r.lottery_id)?.display_name ?? '—',
          drawTimeLabel: r.draw_times?.time_label ?? 'Todos los sorteos',
        }));
      setNumberLimits(perNumber);

    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveGlobalLimits() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await db.from('sales_limits')
        .delete()
        .eq('admin_id', profile.id)
        .is('lottery_id', null)
        .is('number', null);

      const toInsert = [];
      if (globalChance.trim() !== '')
        toInsert.push({ admin_id: profile.id, lottery_id: null, draw_time_id: null, number: null, digit_type: 2, max_pieces: parseInt(globalChance), is_global: true });
      if (globalBillete.trim() !== '')
        toInsert.push({ admin_id: profile.id, lottery_id: null, draw_time_id: null, number: null, digit_type: 4, max_pieces: parseInt(globalBillete), is_global: true });
      if (toInsert.length > 0) {
        const { error: err } = await db.from('sales_limits').insert(toInsert);
        if (err) throw err;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveNumberLimit() {
    setNumError('');
    if (!numLottery) { setNumError('Selecciona una lotería'); return; }
    if (!numNumber.trim()) { setNumError('Ingresa el número'); return; }
    if (numNumber.length !== 2 && numNumber.length !== 4) { setNumError('El número debe tener 2 o 4 cifras'); return; }
    const max = parseInt(numMax);
    if (isNaN(max) || max < 1) { setNumError('Ingresa un límite válido (mínimo 1)'); return; }

    const digitType = numNumber.length === 2 ? 2 : 4;
    const numPadded = numNumber.padStart(digitType === 2 ? 2 : 4, '0');

    // Verificar si ya existe ese número para esa lotería/sorteo
    const exists = numberLimits.find(l =>
      l.lottery_id === numLottery &&
      (l.draw_time_id ?? null) === (numDrawTime || null) &&
      l.number === numPadded
    );
    if (exists) { setNumError(`Ya existe un límite para el número ${numPadded} en ese sorteo. Elimínalo primero.`); return; }

    setSavingNum(true);
    try {
      const row = {
        admin_id: profile.id,
        lottery_id: numLottery,
        draw_time_id: numDrawTime || null,
        number: numPadded,
        digit_type: digitType,
        max_pieces: max,
        is_global: false,
      };
      const { error: err } = await db.from('sales_limits').insert([row]);
      if (err) throw err;
      setNumNumber('');
      setNumMax('');
      await loadData();
    } catch (e) {
      setNumError(e.message);
    } finally {
      setSavingNum(false);
    }
  }

  async function deleteNumberLimit(id) {
    if (!confirm('¿Eliminar este límite por número?')) return;
    try {
      await db.from('sales_limits').delete().eq('id', id);
      await loadData();
    } catch (e) {
      setNumError(e.message);
    }
  }

  const numDrawTimes = numLottery ? (drawTimesMap[numLottery] || []) : [];

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto pb-24">

      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-white">Límites de Venta</h1>
        <p className="text-slate-400 text-xs mt-0.5">Configura cuántos tiempos se pueden vender por número, entre todos los vendedores.</p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5"><p className="text-red-400 text-sm">{error}</p></div>}

      {/* Global limits */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🌐</span>
          <h2 className="text-white font-semibold text-sm">Límite global por número</h2>
        </div>
        <p className="text-slate-400 text-xs -mt-2">Máximo de tiempos que se puede vender de cualquier número en cualquier lotería.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Chance <span className="text-slate-500">(2 cifras)</span></label>
            <input type="number" min="0" value={globalChance} onChange={e => setGlobalChance(e.target.value)} placeholder="Sin límite" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Billete <span className="text-slate-500">(4 cifras)</span></label>
            <input type="number" min="0" value={globalBillete} onChange={e => setGlobalBillete(e.target.value)} placeholder="Sin límite" className={inputCls} />
          </div>
        </div>
        <button
          onClick={saveGlobalLimits}
          disabled={saving}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
        >
          {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar límites globales'}
        </button>
      </div>

      {/* Límites por número */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔢</span>
          <h2 className="text-white font-semibold text-sm">Límite por número específico</h2>
        </div>
        <p className="text-slate-400 text-xs -mt-2">
          El número indicado tendrá su propio límite. Los demás siguen el límite global.
          El cupo es compartido entre <strong className="text-white">todos los vendedores</strong>.
        </p>

        {numError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2"><p className="text-red-400 text-xs">{numError}</p></div>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Lotería</label>
            <select
              value={numLottery}
              onChange={e => { setNumLottery(e.target.value); setNumDrawTime(''); }}
              className={inputCls}
            >
              <option value="">Seleccionar lotería</option>
              {lotteries.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
            </select>
          </div>

          {numDrawTimes.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Hora de sorteo <span className="text-slate-500">(opcional)</span></label>
              <select value={numDrawTime} onChange={e => setNumDrawTime(e.target.value)} className={inputCls}>
                <option value="">Todos los sorteos</option>
                {numDrawTimes.map(dt => <option key={dt.id} value={dt.id}>{dt.time_label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Número (2 o 4 cifras)</label>
              <input
                type="text"
                maxLength={4}
                value={numNumber}
                onChange={e => setNumNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="ej: 08 o 0876"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Máx. tiempos</label>
              <input
                type="number"
                min="1"
                value={numMax}
                onChange={e => setNumMax(e.target.value)}
                placeholder="ej: 10"
                className={inputCls}
              />
            </div>
          </div>

          <button
            onClick={saveNumberLimit}
            disabled={savingNum}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
          >
            {savingNum ? 'Guardando...' : 'Agregar límite por número'}
          </button>
        </div>

        {/* Lista de límites por número */}
        {numberLimits.length > 0 ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs font-semibold text-slate-400">Límites configurados</p>
            {numberLimits.map(nl => (
              <div key={nl.id} className="flex items-center justify-between bg-slate-900 rounded-xl px-3 py-2.5 border border-slate-700">
                <div>
                  <span className="text-white font-bold text-sm">{nl.number}</span>
                  <span className="text-slate-400 text-xs ml-2">≤ {nl.max_pieces} tiempos</span>
                  <p className="text-slate-500 text-xs mt-0.5">{nl.lotteryName} · {nl.drawTimeLabel}</p>
                </div>
                <button
                  onClick={() => deleteNumberLimit(nl.id)}
                  className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded-lg hover:bg-red-500/10 transition"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-xs text-center py-2">No hay límites por número configurados.</p>
        )}
      </div>

      {/* Hierarchy info */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
        <p className="text-xs font-semibold text-slate-400 mb-2">Jerarquía de límites</p>
        <div className="space-y-1.5 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">1</span>
            <span>Límite por <span className="text-white">número específico</span> (máxima prioridad)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">2</span>
            <span>Límite por <span className="text-white">sorteo específico</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">3</span>
            <span>Límite por <span className="text-white">lotería</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">4</span>
            <span>Límite <span className="text-white">global</span> (aplica al resto)</span>
          </div>
        </div>
      </div>

      {/* Per-lottery limits summary */}
      {lotteryLimits.length > 0 && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
          <h2 className="text-white font-semibold text-sm mb-3">Límites por lotería</h2>
          <div className="space-y-2">
            {lotteryLimits.map(lot => (
              <div key={lot.id} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                <span className="text-sm text-white">{lot.name}</span>
                <div className="flex gap-2">
                  {lot.chance != null
                    ? <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded-full">C ≤{lot.chance}</span>
                    : <span className="text-slate-500 text-xs">C: global</span>}
                  {lot.billete != null
                    ? <span className="bg-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded-full">B ≤{lot.billete}</span>
                    : <span className="text-slate-500 text-xs">B: global</span>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">Para editar los límites por lotería ve a la página <span className="text-slate-400">Loterías</span>.</p>
        </div>
      )}
    </div>
  );
}
