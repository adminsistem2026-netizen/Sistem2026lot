import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';
import { createAuthUser } from '../../lib/helpers';
import { useAuth } from '../../contexts/AuthContext';

const EMPTY_FORM = {
  full_name: '', email: '', password: '', phone: '', seller_percentage: '',
  // Moneda
  currency_code: '', currency_symbol: '',
  // Precios
  price_override: false,
  price_2_digits: '',
  price_4_digits: '',
  // Límites
  use_global_limits: true,
};

const inputCls = "w-full bg-slate-900 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition";
const labelCls = "block text-xs font-medium text-slate-400 mb-1.5";

function SectionHeader({ title, sub }) {
  return (
    <div className="border-t border-slate-700 pt-4 mt-2">
      <p className="text-sm font-semibold text-white">{title}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label, sub }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div className="relative flex-shrink-0 mt-0.5">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
        <div className="w-9 h-5 rounded-full bg-slate-700 peer-checked:bg-indigo-600 transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition after:peer-checked:translate-x-4"></div>
      </div>
      <div>
        <p className="text-sm text-white">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </label>
  );
}

export default function ManageSellers() {
  const { profile } = useAuth();
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editSeller, setEditSeller] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currencies, setCurrencies] = useState([]);

  async function loadSellers() {
    setLoading(true);
    const { data } = await db.from('profiles').select('*').eq('role', 'seller').eq('parent_admin_id', profile.id).order('created_at', { ascending: false });
    setSellers(data || []);
    setLoading(false);
  }

  async function loadCurrencies() {
    const { data } = await db.from('system_config').select('config_value').eq('config_key', 'available_currencies').single();
    if (data) setCurrencies(data.config_value || []);
  }

  useEffect(() => {
    if (profile?.id) { loadSellers(); loadCurrencies(); }
  }, [profile]);

  function f(key, val) { setForm(prev => ({ ...prev, [key]: val })); }

  function onCurrencyChange(code) {
    const cur = currencies.find(c => c.code === code);
    if (cur) setForm(prev => ({ ...prev, currency_code: cur.code, currency_symbol: cur.symbol }));
  }

  function openCreate() {
    const maxSellers = profile?.max_sellers ?? 5;
    const activeSellers = sellers.filter(s => s.is_active !== false).length;
    if (activeSellers >= maxSellers) {
      alert(`Límite alcanzado: tu plan permite un máximo de ${maxSellers} vendedor${maxSellers === 1 ? '' : 'es'}.`);
      return;
    }
    setEditSeller(null);
    setForm({
      ...EMPTY_FORM,
      seller_percentage: String(profile?.seller_percentage ?? 13),
      currency_code: profile?.currency_code || 'USD',
      currency_symbol: profile?.currency_symbol || '$',
    });
    setError('');
    setShowModal(true);
  }

  function openEdit(seller) {
    setEditSeller(seller);
    setForm({
      full_name: seller.full_name,
      email: seller.email,
      password: '',
      phone: seller.phone || '',
      seller_percentage: String(seller.seller_percentage),
      currency_code: seller.currency_code || profile?.currency_code || 'USD',
      currency_symbol: seller.currency_symbol || profile?.currency_symbol || '$',
      price_override: seller.price_2_digits_override != null,
      price_2_digits: seller.price_2_digits_override != null ? String(seller.price_2_digits_override) : '',
      price_4_digits: seller.price_4_digits_override != null ? String(seller.price_4_digits_override) : '',
      use_global_limits: seller.use_global_limits !== false,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.full_name.trim() || !form.email.trim()) { setError('Nombre y correo son obligatorios'); return; }
    if (!editSeller && !form.password.trim()) { setError('La contraseña es obligatoria al crear un vendedor'); return; }
    if (!editSeller) {
      const maxSellers = profile?.max_sellers ?? 5;
      const activeSellers = sellers.filter(s => s.is_active !== false).length;
      if (activeSellers >= maxSellers) {
        setError(`Límite alcanzado: tu plan permite un máximo de ${maxSellers} vendedor${maxSellers === 1 ? '' : 'es'}.`);
        return;
      }
    }
    const pct = parseFloat(form.seller_percentage);
    if (isNaN(pct) || pct < 0 || pct > 100) { setError('El porcentaje debe ser entre 0 y 100'); return; }
    if (form.price_override) {
      if (!form.price_2_digits || isNaN(parseFloat(form.price_2_digits))) { setError('Precio Chance inválido'); return; }
      if (!form.price_4_digits || isNaN(parseFloat(form.price_4_digits))) { setError('Precio Billete inválido'); return; }
    }

    setSaving(true); setError('');
    try {
      const baseFields = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        seller_percentage: pct,
        currency_code: form.currency_code,
        currency_symbol: form.currency_symbol,
      };

      const extendedFields = {
        price_2_digits_override: form.price_override ? parseFloat(form.price_2_digits) : null,
        price_4_digits_override: form.price_override ? parseFloat(form.price_4_digits) : null,
        use_global_limits: form.use_global_limits,
      };

      if (editSeller) {
        // Save base fields first (always exist)
        const { error: err } = await db.from('profiles').update(baseFields).eq('id', editSeller.id);
        if (err) throw err;
        // Try extended fields — ignore error if columns don't exist yet
        await db.from('profiles').update(extendedFields).eq('id', editSeller.id);
      } else {
        const response = await createAuthUser(form.email.trim(), form.password, form.full_name.trim());
        const { error: profileError } = await db.rpc('setup_new_user', {
          p_user_id:           response.user.id,
          p_role:              'seller',
          p_full_name:         form.full_name.trim(),
          p_phone:             form.phone.trim() || null,
          p_email:             form.email.trim(),
          p_seller_percentage: pct,
          p_parent_admin_id:   profile.id,
          p_currency_code:     form.currency_code,
          p_currency_symbol:   form.currency_symbol,
        });
        if (profileError) throw profileError;
        // Try extended fields — ignore error if columns don't exist yet
        await db.from('profiles').update(extendedFields).eq('id', response.user.id);
      }

      setShowModal(false);
      loadSellers();
    } catch (err) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(seller) {
    await db.from('profiles').update({ is_active: !seller.is_active }).eq('id', seller.id);
    loadSellers();
  }

  const isCustomCurrency = (seller) => seller.currency_code && seller.currency_code !== profile?.currency_code;

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Vendedores</h1>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-xl transition font-medium">
          + Nuevo
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 text-sm py-16">Cargando...</div>
      ) : sellers.length === 0 ? (
        <div className="text-center text-slate-500 text-sm py-16">No hay vendedores creados</div>
      ) : (
        <div className="space-y-2">
          {sellers.map(seller => (
            <div key={seller.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white text-sm">{seller.full_name}</p>
                    {seller.seller_code && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {seller.seller_code}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${seller.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                      {seller.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{seller.email}</p>
                  {seller.phone && <p className="text-xs text-slate-400">{seller.phone}</p>}

                  {/* Config badges */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                      Comisión {seller.seller_percentage}%
                    </span>
                    {isCustomCurrency(seller) && (
                      <span className="text-xs bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full">
                        {seller.currency_symbol} {seller.currency_code}
                      </span>
                    )}
                    {seller.price_2_digits_override != null && (
                      <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
                        Chance {seller.currency_symbol}{seller.price_2_digits_override} · Billete {seller.currency_symbol}{seller.price_4_digits_override}
                      </span>
                    )}
                    {seller.use_global_limits === false && (
                      <span className="text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full">
                        Sin límites
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 shrink-0">
                  <button onClick={() => openEdit(seller)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition">
                    Editar
                  </button>
                  <button onClick={() => toggleActive(seller)} className={`text-xs font-medium transition ${seller.is_active ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}>
                    {seller.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white">
              {editSeller ? 'Editar Vendedor' : 'Nuevo Vendedor'}
            </h2>

            {/* ── Datos básicos ── */}
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nombre completo *</label>
                <input type="text" value={form.full_name} onChange={e => f('full_name', e.target.value)} className={inputCls} placeholder="Nombre del vendedor" />
              </div>

              {!editSeller && (
                <>
                  <div>
                    <label className={labelCls}>Correo electrónico *</label>
                    <input type="email" value={form.email} onChange={e => f('email', e.target.value)} className={inputCls} placeholder="correo@ejemplo.com" />
                  </div>
                  <div>
                    <label className={labelCls}>Contraseña *</label>
                    <input type="password" value={form.password} onChange={e => f('password', e.target.value)} className={inputCls} placeholder="Mínimo 6 caracteres" />
                  </div>
                </>
              )}

              <div>
                <label className={labelCls}>Teléfono</label>
                <input type="tel" value={form.phone} onChange={e => f('phone', e.target.value)} className={inputCls} placeholder="+507 6000-0000" />
              </div>

              <div>
                <label className={labelCls}>% de comisión *</label>
                <input type="number" min="0" max="100" step="0.5" value={form.seller_percentage} onChange={e => f('seller_percentage', e.target.value)} className={inputCls} placeholder="Ej: 13" />
              </div>
            </div>

            {/* ── Moneda ── */}
            <SectionHeader title="Moneda" sub="Moneda que verá y usará este vendedor" />
            <div>
              <label className={labelCls}>Moneda</label>
              <select
                value={form.currency_code}
                onChange={e => onCurrencyChange(e.target.value)}
                className={inputCls}
              >
                <option value={profile?.currency_code || 'USD'} style={{ background: '#0f172a' }}>
                  {profile?.currency_symbol} {profile?.currency_code} — Global (heredar del admin)
                </option>
                {currencies.filter(c => c.code !== profile?.currency_code).map(c => (
                  <option key={c.code} value={c.code} style={{ background: '#0f172a' }}>{c.symbol} — {c.name}</option>
                ))}
              </select>
              {form.currency_code !== profile?.currency_code && (
                <p className="text-xs text-purple-400 mt-1.5">Moneda personalizada: {form.currency_symbol} ({form.currency_code})</p>
              )}
            </div>

            {/* ── Precios ── */}
            <SectionHeader title="Precios de venta" sub="Aplican sobre todas las loterías de este vendedor" />
            <Toggle
              checked={form.price_override}
              onChange={v => f('price_override', v)}
              label="Precios personalizados"
              sub={form.price_override ? 'Usando precios propios de este vendedor' : 'Usando precios definidos en cada lotería'}
            />

            {form.price_override && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className={labelCls}>Chance (2 cifras)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{form.currency_symbol}</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.price_2_digits}
                      onChange={e => f('price_2_digits', e.target.value)}
                      className={inputCls + ' pl-7'}
                      placeholder="0.20"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Billete (4 cifras)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{form.currency_symbol}</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.price_4_digits}
                      onChange={e => f('price_4_digits', e.target.value)}
                      className={inputCls + ' pl-7'}
                      placeholder="1.00"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Límites ── */}
            <SectionHeader title="Límites de venta" sub="Control de cuánto puede vender por número" />
            <Toggle
              checked={form.use_global_limits}
              onChange={v => f('use_global_limits', v)}
              label="Usar límites globales"
              sub={form.use_global_limits
                ? 'Respeta los límites configurados en la sección Límites'
                : 'Este vendedor no tiene límite de venta por número'}
            />
            {!form.use_global_limits && (
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5">
                <p className="text-amber-400 text-xs">⚠️ Sin límites: el vendedor podrá vender cualquier cantidad en cualquier número.</p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
                <p className="text-red-400 text-xs text-center">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm py-2.5 rounded-xl transition">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-2.5 rounded-xl transition disabled:opacity-50">
                {saving ? 'Guardando...' : editSeller ? 'Guardar cambios' : 'Crear vendedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
