import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';
import { createAuthUser } from '../../lib/helpers';
import { useAuth } from '../../contexts/AuthContext';

const EMPTY_FORM = {
  full_name: '', email: '', password: '', phone: '', seller_percentage: '',
  currency_code: '', currency_symbol: '',
  price_override: false,
  price_2_digits: '',
  price_4_digits: '',
  use_global_limits: true,
  is_sub_admin: false,
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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedSubAdmin, setExpandedSubAdmin] = useState(null);

  async function loadSellers() {
    setLoading(true);
    const { data } = await db.from('profiles').select('*')
      .eq('parent_admin_id', profile.id)
      .order('created_at', { ascending: false });
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
      is_sub_admin: seller.role === 'sub_admin',
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.full_name.trim() || !form.email.trim()) { setError('Nombre y correo son obligatorios'); return; }
    if (!editSeller && !form.password.trim()) { setError('La contraseña es obligatoria al crear'); return; }
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
    const role = form.is_sub_admin ? 'sub_admin' : 'seller';
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
        const { error: err } = await db.from('profiles').update({ ...baseFields, role }).eq('id', editSeller.id);
        if (err) throw err;
        await db.from('profiles').update(extendedFields).eq('id', editSeller.id);
        if (form.password.trim()) {
          const { error: pwError } = await db.rpc('change_user_password', {
            p_user_id: editSeller.id,
            p_new_password: form.password.trim(),
          });
          if (pwError) throw pwError;
        }
      } else {
        const response = await createAuthUser(form.email.trim(), form.password, form.full_name.trim());
        const { error: profileError } = await db.rpc('setup_new_user', {
          p_user_id:           response.user.id,
          p_role:              role,
          p_full_name:         form.full_name.trim(),
          p_phone:             form.phone.trim() || null,
          p_email:             form.email.trim(),
          p_seller_percentage: pct,
          p_parent_admin_id:   profile.id,
          p_currency_code:     form.currency_code,
          p_currency_symbol:   form.currency_symbol,
        });
        if (profileError) throw profileError;
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

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const rpc = deleteTarget.role === 'sub_admin' ? 'delete_seller' : 'delete_seller';
      const { error } = await db.rpc(rpc, { p_seller_id: deleteTarget.id });
      if (error) throw error;
      setDeleteTarget(null);
      loadSellers();
    } catch (err) {
      alert('Error al eliminar: ' + (err.message || JSON.stringify(err)));
    } finally {
      setDeleting(false);
    }
  }

  const isCustomCurrency = (seller) => seller.currency_code && seller.currency_code !== profile?.currency_code;

  // Separate sub_admins and direct sellers (exclude sellers owned by a sub_admin)
  const subAdmins = sellers.filter(s => s.role === 'sub_admin');
  const regularSellers = sellers.filter(s => s.role === 'seller' && !s.sub_admin_id);

  function renderSellerCard(seller) {
    const isSubAdmin = seller.role === 'sub_admin';
    const ownedSellers = isSubAdmin ? sellers.filter(s => s.sub_admin_id === seller.id) : [];
    return (
      <div key={seller.id} className={`bg-slate-800 border rounded-xl p-4 ${isSubAdmin ? 'border-violet-500/40' : 'border-slate-700'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-white text-sm">{seller.full_name}</p>
              {isSubAdmin && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  Sub-Admin
                </span>
              )}
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
                <span className="text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full">Sin límites</span>
              )}
              {isSubAdmin && (
                <button
                  onClick={() => setExpandedSubAdmin(expandedSubAdmin === seller.id ? null : seller.id)}
                  className="text-xs bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/30 hover:bg-violet-500/25 transition"
                >
                  {ownedSellers.length} vendedor{ownedSellers.length !== 1 ? 'es' : ''} {expandedSubAdmin === seller.id ? '▲' : '▼'}
                </button>
              )}
            </div>
            {/* Vendedores del sub_admin expandidos */}
            {isSubAdmin && expandedSubAdmin === seller.id && (
              <div className="mt-3 pl-3 border-l-2 border-violet-500/30 space-y-1.5">
                {ownedSellers.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin vendedores asignados aún</p>
                ) : ownedSellers.map(sv => (
                  <div key={sv.id} className="bg-slate-900/40 rounded-lg px-2.5 py-2 space-y-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-xs flex-shrink-0 ${sv.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>●</span>
                      <span className="text-xs text-slate-200 font-medium truncate">{sv.full_name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pl-3.5">
                      <span className="text-xs text-slate-500 truncate min-w-0">{sv.email}</span>
                      <div className="flex gap-2.5 flex-shrink-0">
                        <button onClick={() => toggleActive(sv)} className={`text-xs font-medium transition ${sv.is_active ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}>
                          {sv.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button onClick={() => setDeleteTarget(sv)} className="text-xs text-red-400 hover:text-red-300 font-medium transition">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 shrink-0">
            <button onClick={() => openEdit(seller)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition">Editar</button>
            <button onClick={() => toggleActive(seller)} className={`text-xs font-medium transition ${seller.is_active ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}>
              {seller.is_active ? 'Desactivar' : 'Activar'}
            </button>
            <button onClick={() => setDeleteTarget(seller)} className="text-xs text-red-400 hover:text-red-300 font-medium transition">Eliminar</button>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="space-y-4">
          {/* Sub-admins */}
          {subAdmins.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider px-1">Sub-Admins ({subAdmins.length})</p>
              {subAdmins.map(renderSellerCard)}
            </div>
          )}
          {/* Vendedores regulares */}
          {regularSellers.length > 0 && (
            <div className="space-y-2">
              {subAdmins.length > 0 && (
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Vendedores ({regularSellers.length})</p>
              )}
              {regularSellers.map(renderSellerCard)}
            </div>
          )}
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-white">¿Eliminar {deleteTarget.role === 'sub_admin' ? 'sub-admin' : 'vendedor'}?</h2>
            <p className="text-sm text-slate-400">
              Esta acción eliminará permanentemente a <span className="text-white font-semibold">{deleteTarget.full_name}</span> y todos sus registros.
            </p>
            {deleteTarget.role === 'sub_admin' && sellers.filter(s => s.sub_admin_id === deleteTarget.id).length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                <p className="text-xs text-amber-400">⚠️ Este sub-admin tiene {sellers.filter(s => s.sub_admin_id === deleteTarget.id).length} vendedor(es) asignados. Elimina primero sus vendedores.</p>
              </div>
            )}
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs text-red-400">Se eliminará permanentemente:</p>
              <p className="text-xs text-red-300">• Perfil y acceso</p>
              <p className="text-xs text-red-300">• Todos sus tickets y números vendidos</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm py-2.5 rounded-xl transition disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting || (deleteTarget.role === 'sub_admin' && sellers.filter(s => s.sub_admin_id === deleteTarget.id).length > 0)} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50">
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white">
              {editSeller ? 'Editar' : 'Nuevo'} {form.is_sub_admin ? 'Sub-Admin' : 'Vendedor'}
            </h2>

            {/* Tipo de cuenta — solo al crear */}
            {!editSeller && (
              <>
                <SectionHeader title="Tipo de cuenta" />
                <Toggle
                  checked={form.is_sub_admin}
                  onChange={v => f('is_sub_admin', v)}
                  label="Es Sub-Admin"
                  sub={form.is_sub_admin ? 'Podrá crear y gestionar sus propios vendedores desde la app móvil' : 'Vendedor normal, solo puede vender tickets'}
                />
                {form.is_sub_admin && (
                  <div className="bg-violet-500/10 border border-violet-500/25 rounded-xl px-4 py-2.5">
                    <p className="text-violet-300 text-xs">El sub-admin accede desde la app móvil con funciones extra de gestión.</p>
                  </div>
                )}
              </>
            )}

            {/* Datos básicos */}
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nombre completo *</label>
                <input type="text" value={form.full_name} onChange={e => f('full_name', e.target.value)} className={inputCls} placeholder="Nombre" />
              </div>
              {!editSeller && (
                <div>
                  <label className={labelCls}>Correo electrónico *</label>
                  <input type="email" value={form.email} onChange={e => f('email', e.target.value)} className={inputCls} placeholder="correo@ejemplo.com" />
                </div>
              )}
              <div>
                <label className={labelCls}>{editSeller ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña *'}</label>
                <input type="password" value={form.password} onChange={e => f('password', e.target.value)} className={inputCls} placeholder={editSeller ? 'Nueva contraseña...' : 'Mínimo 6 caracteres'} />
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input type="tel" value={form.phone} onChange={e => f('phone', e.target.value)} className={inputCls} placeholder="+507 6000-0000" />
              </div>
              <div>
                <label className={labelCls}>% de comisión *</label>
                <input type="number" min="0" max="100" step="0.5" value={form.seller_percentage} onChange={e => f('seller_percentage', e.target.value)} className={inputCls} placeholder="Ej: 13" />
              </div>
            </div>

            {/* Moneda */}
            <SectionHeader title="Moneda" sub="Moneda que verá y usará" />
            <div>
              <label className={labelCls}>Moneda</label>
              <select value={form.currency_code} onChange={e => onCurrencyChange(e.target.value)} className={inputCls}>
                <option value={profile?.currency_code || 'USD'} style={{ background: '#0f172a' }}>
                  {profile?.currency_symbol} {profile?.currency_code} — Global
                </option>
                {currencies.filter(c => c.code !== profile?.currency_code).map(c => (
                  <option key={c.code} value={c.code} style={{ background: '#0f172a' }}>{c.symbol} — {c.name}</option>
                ))}
              </select>
            </div>

            {/* Precios y Límites — solo para vendedores regulares */}
            {!form.is_sub_admin && (
              <>
                <SectionHeader title="Precios de venta" sub="Aplican sobre todas las loterías" />
                <Toggle
                  checked={form.price_override}
                  onChange={v => f('price_override', v)}
                  label="Precios personalizados"
                  sub={form.price_override ? 'Usando precios propios' : 'Usando precios de cada lotería'}
                />
                {form.price_override && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className={labelCls}>Chance (2 cifras)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{form.currency_symbol}</span>
                        <input type="number" min="0" step="0.01" value={form.price_2_digits} onChange={e => f('price_2_digits', e.target.value)} className={inputCls + ' pl-7'} placeholder="0.20" />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Billete (4 cifras)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{form.currency_symbol}</span>
                        <input type="number" min="0" step="0.01" value={form.price_4_digits} onChange={e => f('price_4_digits', e.target.value)} className={inputCls + ' pl-7'} placeholder="1.00" />
                      </div>
                    </div>
                  </div>
                )}
                <SectionHeader title="Límites de venta" />
                <Toggle
                  checked={form.use_global_limits}
                  onChange={v => f('use_global_limits', v)}
                  label="Usar límites globales"
                  sub={form.use_global_limits ? 'Respeta los límites configurados' : 'Sin límite de venta por número'}
                />
                {!form.use_global_limits && (
                  <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5">
                    <p className="text-amber-400 text-xs">⚠️ Sin límites: podrá vender cualquier cantidad.</p>
                  </div>
                )}
              </>
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
                {saving ? 'Guardando...' : editSeller ? 'Guardar cambios' : `Crear ${form.is_sub_admin ? 'Sub-Admin' : 'Vendedor'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
