import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminSettings() {
  const { profile } = useAuth();
  const [currencies, setCurrencies] = useState([]);
  const [form, setForm] = useState({ currency_code: 'USD', currency_symbol: '$', seller_percentage: '13', admin_code: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await db.from('system_config').select('config_value').eq('config_key', 'available_currencies').single();
      if (data) setCurrencies(data.config_value);
    }
    load();
    if (profile) {
      setForm({
        currency_code: profile.currency_code || 'USD',
        currency_symbol: profile.currency_symbol || '$',
        seller_percentage: String(profile.seller_percentage ?? 13),
        admin_code: profile.admin_code || '',
      });
    }
  }, [profile]);

  function onCurrencyChange(code) {
    const cur = currencies.find(c => c.code === code);
    if (cur) setForm(f => ({ ...f, currency_code: cur.code, currency_symbol: cur.symbol }));
  }

  async function handleSave() {
    setSaving(true);
    await db.from('profiles').update({
      currency_code: form.currency_code,
      currency_symbol: form.currency_symbol,
      seller_percentage: parseFloat(form.seller_percentage),
      admin_code: form.admin_code.trim().toUpperCase() || null,
    }).eq('id', profile.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputCls = "w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition";
  const labelCls = "block text-xs font-medium text-slate-400 mb-1.5";

  return (
    <div className="space-y-5 mt-2">
      <h1 className="text-xl font-bold text-white">Configuración</h1>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-5">
        <div>
          <label className={labelCls}>Moneda de trabajo</label>
          <select value={form.currency_code} onChange={e => onCurrencyChange(e.target.value)} className={inputCls}>
            {currencies.map(c => <option key={c.code} value={c.code} style={{background:'#1e293b'}}>{c.symbol} — {c.name}</option>)}
          </select>
          <p className="text-xs text-slate-500 mt-1.5">Moneda que heredarán tus vendedores y loterías</p>
        </div>

        <div>
          <label className={labelCls}>Código identificador (aparece en tickets de tus vendedores)</label>
          <input
            type="text" maxLength={10}
            placeholder="Ej: ADM01"
            value={form.admin_code}
            onChange={e => setForm(f => ({ ...f, admin_code: e.target.value.toUpperCase() }))}
            className={inputCls}
          />
          <p className="text-xs text-slate-500 mt-1.5">Código corto que identifica tu sistema. Todos tus vendedores lo mostrarán en sus tickets.</p>
        </div>

        <div>
          <label className={labelCls}>% de comisión por defecto para nuevos vendedores</label>
          <input
            type="number" min="0" max="100" step="0.5"
            value={form.seller_percentage}
            onChange={e => setForm(f => ({ ...f, seller_percentage: e.target.value }))}
            className={inputCls}
          />
          <p className="text-xs text-slate-500 mt-1.5">Se usará como valor por defecto al crear un vendedor</p>
        </div>
      </div>

      <button
        onClick={handleSave} disabled={saving}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
      >
        {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}
