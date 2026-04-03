import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';
import { createAuthUser } from '../../lib/helpers';

const EMPTY_FORM = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  expires_at: '',
  max_sellers: 5,
};

export default function ManageAdmins() {
  const [admins, setAdmins] = useState([]);
  const [sellerCounts, setSellerCounts] = useState({}); // { admin_id: count }
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editAdmin, setEditAdmin] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadAdmins() {
    setLoading(true);
    const [{ data: adminsData }, { data: sellersData }] = await Promise.all([
      db.from('profiles').select('*').eq('role', 'admin').order('created_at', { ascending: false }),
      db.from('profiles').select('parent_admin_id').eq('role', 'seller').eq('is_active', true),
    ]);

    setAdmins(adminsData || []);

    // Agrupar conteo de vendedores por admin
    const counts = {};
    (sellersData || []).forEach(s => {
      if (s.parent_admin_id) counts[s.parent_admin_id] = (counts[s.parent_admin_id] || 0) + 1;
    });
    setSellerCounts(counts);
    setLoading(false);
  }

  useEffect(() => { loadAdmins(); }, []);

  function openCreate() {
    setEditAdmin(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  }

  function openEdit(admin) {
    setEditAdmin(admin);
    setForm({
      full_name: admin.full_name || '',
      email: admin.email || '',
      password: '',
      phone: admin.phone || '',
      expires_at: admin.expires_at ? admin.expires_at.split('T')[0] : '',
      max_sellers: admin.max_sellers ?? 5,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Nombre y correo son obligatorios');
      return;
    }
    if (!editAdmin && !form.password.trim()) {
      setError('La contraseña es obligatoria al crear un admin');
      return;
    }
    if (!form.expires_at) {
      setError('La fecha de vencimiento es obligatoria');
      return;
    }
    const maxSellers = parseInt(form.max_sellers, 10);
    if (isNaN(maxSellers) || maxSellers < 1) {
      setError('El límite de vendedores debe ser al menos 1');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const expiresIso = new Date(form.expires_at + 'T23:59:59').toISOString();

      if (editAdmin) {
        // Usa RPC para evitar bug de schema cache de InsForge (max_sellers es columna nueva)
        const { error: updateError } = await db.rpc('update_admin_profile', {
          p_id:          editAdmin.id,
          p_full_name:   form.full_name.trim(),
          p_phone:       form.phone.trim() || null,
          p_expires_at:  expiresIso,
          p_max_sellers: maxSellers,
        });
        if (updateError) throw updateError;
      } else {
        const response = await createAuthUser(form.email.trim(), form.password, form.full_name.trim());

        const { error: profileError } = await db.rpc('setup_new_user', {
          p_user_id:     response.user.id,
          p_role:        'admin',
          p_full_name:   form.full_name.trim(),
          p_phone:       form.phone.trim() || null,
          p_expires_at:  expiresIso,
          p_max_sellers: maxSellers,
          p_email:       form.email.trim(),
        });
        if (profileError) throw profileError;
      }

      setShowModal(false);
      loadAdmins();
    } catch (err) {
      setError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(admin) {
    await db.from('profiles').update({ is_active: !admin.is_active }).eq('id', admin.id);
    loadAdmins();
  }

  function expiryStatus(expires_at) {
    if (!expires_at) return null;
    const now = new Date();
    const exp = new Date(expires_at);
    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0)  return { label: 'Vencido',             color: 'text-red-500 bg-red-50' };
    if (diffDays <= 7) return { label: `Vence en ${diffDays}d`, color: 'text-orange-500 bg-orange-50' };
    return { label: exp.toLocaleDateString('es-ES'), color: 'text-green-600 bg-green-50' };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mt-2">
        <h1 className="text-xl font-bold text-gray-800">Administradores</h1>
        <button
          onClick={openCreate}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition"
        >
          + Nuevo Admin
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 text-sm py-10">Cargando...</p>
      ) : admins.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-10">No hay administradores creados</p>
      ) : (
        <div className="space-y-3">
          {admins.map(admin => {
            const status = expiryStatus(admin.expires_at);
            const usedSellers = sellerCounts[admin.id] || 0;
            const maxSell = admin.max_sellers ?? 5;
            const sellerRatio = usedSellers / maxSell;
            const barColor = sellerRatio >= 1 ? 'bg-red-500' : sellerRatio >= 0.8 ? 'bg-orange-400' : 'bg-green-500';

            return (
              <div key={admin.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-800 text-sm">{admin.full_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${admin.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                        {admin.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      {status && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{admin.email}</p>
                    {admin.phone && <p className="text-xs text-gray-400">{admin.phone}</p>}

                    {/* Vendedores */}
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Vendedores</span>
                        <span className={`text-xs font-semibold ${sellerRatio >= 1 ? 'text-red-500' : 'text-gray-700'}`}>
                          {usedSellers} / {maxSell}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(sellerRatio * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 ml-3 shrink-0 items-end">
                    <button
                      onClick={() => openEdit(admin)}
                      className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleActive(admin)}
                      className={`text-xs font-medium ${admin.is_active ? 'text-red-400 hover:text-red-600' : 'text-green-500 hover:text-green-700'}`}
                    >
                      {admin.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-800">
              {editAdmin ? 'Editar Administrador' : 'Nuevo Administrador'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo *</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Nombre del administrador"
                />
              </div>

              {!editAdmin && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Correo electrónico *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña *</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="+507 6000-0000"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de vencimiento *</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Límite de vendedores *</label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={form.max_sellers}
                  onChange={e => setForm(f => ({ ...f, max_sellers: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="5"
                />
                <p className="text-xs text-gray-400 mt-1">Cantidad máxima de vendedores que puede crear este admin</p>
              </div>
            </div>

            {error && <p className="text-red-500 text-xs text-center">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-gray-900 text-white text-sm py-2.5 rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
              >
                {saving ? 'Guardando...' : editAdmin ? 'Guardar cambios' : 'Crear admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
