import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';
import { createAuthUser } from '../../lib/helpers';
import { useAuth } from '../../contexts/AuthContext';

const EMPTY_OP = { full_name: '', email: '', password: '' };

export default function AdminSettings() {
  const { profile } = useAuth();
  const [currencies, setCurrencies] = useState([]);
  const [form, setForm] = useState({ currency_code: 'USD', currency_symbol: '$', seller_percentage: '13', admin_code: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Operadores
  const [operators, setOperators] = useState([]);
  const [showOpModal, setShowOpModal] = useState(false);
  const [opForm, setOpForm] = useState(EMPTY_OP);
  const [opSaving, setOpSaving] = useState(false);
  const [opError, setOpError] = useState('');
  const [deleteOp, setDeleteOp] = useState(null);
  const [deleting, setDeleting] = useState(false);

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
      loadOperators();
    }
  }, [profile]);

  async function loadOperators() {
    const { data } = await db.from('profiles').select('id, full_name, email, is_active, created_at')
      .eq('parent_admin_id', profile.id)
      .eq('role', 'operator')
      .order('created_at', { ascending: false });
    setOperators(data || []);
  }

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

  async function handleCreateOperator() {
    if (!opForm.full_name.trim() || !opForm.email.trim() || !opForm.password.trim()) {
      setOpError('Completa todos los campos');
      return;
    }
    setOpSaving(true);
    setOpError('');
    try {
      const response = await createAuthUser(opForm.email.trim(), opForm.password, opForm.full_name.trim());
      const { error: profileError } = await db.rpc('setup_new_user', {
        p_user_id:           response.user.id,
        p_role:              'operator',
        p_full_name:         opForm.full_name.trim(),
        p_phone:             null,
        p_email:             opForm.email.trim(),
        p_seller_percentage: 0,
        p_parent_admin_id:   profile.id,
        p_currency_code:     profile.currency_code || 'USD',
        p_currency_symbol:   profile.currency_symbol || '$',
      });
      if (profileError) throw profileError;
      setShowOpModal(false);
      setOpForm(EMPTY_OP);
      loadOperators();
    } catch (e) {
      setOpError(e.message || JSON.stringify(e));
    } finally {
      setOpSaving(false);
    }
  }

  async function handleDeleteOperator() {
    if (!deleteOp) return;
    setDeleting(true);
    try {
      const { error } = await db.rpc('delete_seller', { p_seller_id: deleteOp.id });
      if (error) throw error;
      setDeleteOp(null);
      loadOperators();
    } catch (e) {
      alert(e.message || 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  }

  async function toggleOpActive(op) {
    await db.from('profiles').update({ is_active: !op.is_active }).eq('id', op.id);
    loadOperators();
  }

  const inputCls = "w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition";
  const labelCls = "block text-xs font-medium text-slate-400 mb-1.5";

  return (
    <div className="space-y-5 mt-2">
      <h1 className="text-xl font-bold text-white">Configuración</h1>

      {/* Ajustes generales */}
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

      {/* ── Operadores ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Operadores</h2>
            <p className="text-xs text-slate-400 mt-0.5">Pueden gestionar Loterías y Resultados</p>
          </div>
          <button
            onClick={() => { setOpForm(EMPTY_OP); setOpError(''); setShowOpModal(true); }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition"
          >
            + Crear operador
          </button>
        </div>

        {operators.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 text-center text-slate-500 text-sm">
            No tienes operadores aún
          </div>
        ) : (
          <div className="space-y-2">
            {operators.map(op => (
              <div key={op.id} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{op.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{op.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleOpActive(op)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${op.is_active ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                  >
                    {op.is_active ? 'Activo' : 'Inactivo'}
                  </button>
                  <button
                    onClick={() => setDeleteOp(op)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition font-medium"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear operador */}
      {showOpModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-white">Nuevo operador</h3>

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nombre completo</label>
                <input
                  type="text"
                  placeholder="Ej: Juan Pérez"
                  value={opForm.full_name}
                  onChange={e => setOpForm(f => ({ ...f, full_name: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Correo electrónico</label>
                <input
                  type="email"
                  placeholder="operador@ejemplo.com"
                  value={opForm.email}
                  onChange={e => setOpForm(f => ({ ...f, email: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Contraseña</label>
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={opForm.password}
                  onChange={e => setOpForm(f => ({ ...f, password: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>

            {opError && <p className="text-xs text-red-400">{opError}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowOpModal(false)}
                disabled={opSaving}
                className="flex-1 border border-slate-600 text-slate-300 text-sm py-2.5 rounded-xl hover:bg-slate-700 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateOperator}
                disabled={opSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {opSaving ? 'Creando...' : 'Crear operador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {deleteOp && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-white">¿Eliminar operador?</h3>
            <p className="text-sm text-slate-300">
              Se eliminará permanentemente la cuenta de <span className="font-semibold text-white">{deleteOp.full_name}</span>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteOp(null)}
                disabled={deleting}
                className="flex-1 border border-slate-600 text-slate-300 text-sm py-2.5 rounded-xl hover:bg-slate-700 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteOperator}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
