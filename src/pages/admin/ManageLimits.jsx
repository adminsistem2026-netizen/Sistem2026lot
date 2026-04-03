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

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: lots }, { data: limits }] = await Promise.all([
        db.from('lotteries').select('id, display_name').eq('admin_id', profile.id).order('display_name'),
        db.from('sales_limits').select('*').eq('admin_id', profile.id).is('number', null),
      ]);

      setLotteries(lots || []);

      // Global limits (lottery_id IS NULL)
      const globals = (limits || []).filter(r => !r.lottery_id);
      const chanceRow = globals.find(r => r.digit_type === 2);
      const billeteRow = globals.find(r => r.digit_type === 4);
      setGlobalChance(chanceRow ? String(chanceRow.max_pieces) : '');
      setGlobalBillete(billeteRow ? String(billeteRow.max_pieces) : '');

      // Per-lottery limits summary
      const perLottery = (lots || []).map(lot => {
        const lotRows = (limits || []).filter(r => r.lottery_id === lot.id && !r.draw_time_id);
        const chance = lotRows.find(r => r.digit_type === 2);
        const billete = lotRows.find(r => r.digit_type === 4);
        return {
          id: lot.id,
          name: lot.display_name,
          chance: chance ? chance.max_pieces : null,
          billete: billete ? billete.max_pieces : null,
        };
      });
      setLotteryLimits(perLottery);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveGlobalLimits() {
    setSaving(true); setError(''); setSaved(false);
    try {
      // Delete existing global limits (lottery_id IS NULL)
      await db.from('sales_limits')
        .delete()
        .eq('admin_id', profile.id)
        .is('lottery_id', null)
        .is('number', null);

      const toInsert = [];
      if (globalChance.trim() !== '') {
        toInsert.push({ admin_id: profile.id, lottery_id: null, draw_time_id: null, number: null, digit_type: 2, max_pieces: parseInt(globalChance), is_global: true });
      }
      if (globalBillete.trim() !== '') {
        toInsert.push({ admin_id: profile.id, lottery_id: null, draw_time_id: null, number: null, digit_type: 4, max_pieces: parseInt(globalBillete), is_global: true });
      }
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

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto pb-24">

      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-white">Límites Globales</h1>
        <p className="text-slate-400 text-xs mt-0.5">Aplican a todas las loterías que no tengan límite propio configurado.</p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5"><p className="text-red-400 text-sm">{error}</p></div>}

      {/* Global limits card */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🌐</span>
          <h2 className="text-white font-semibold text-sm">Límite global por número</h2>
        </div>
        <p className="text-slate-400 text-xs -mt-2">Máximo de tiempos que se puede vender de cualquier número en cualquier lotería.</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Chance <span className="text-slate-500">(2 cifras)</span>
            </label>
            <input
              type="number"
              min="0"
              value={globalChance}
              onChange={e => setGlobalChance(e.target.value)}
              placeholder="Sin límite"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Billete <span className="text-slate-500">(4 cifras)</span>
            </label>
            <input
              type="number"
              min="0"
              value={globalBillete}
              onChange={e => setGlobalBillete(e.target.value)}
              placeholder="Sin límite"
              className={inputCls}
            />
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

      {/* Hierarchy info */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
        <p className="text-xs font-semibold text-slate-400 mb-2">Jerarquía de límites</p>
        <div className="space-y-1.5 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">1</span>
            <span>Límite por <span className="text-white">sorteo específico</span> (más prioritario)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">2</span>
            <span>Límite por <span className="text-white">lotería</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">3</span>
            <span>Límite <span className="text-white">global</span> (esta página)</span>
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
