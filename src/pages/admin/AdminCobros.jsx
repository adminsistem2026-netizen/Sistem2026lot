import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';

const fmt = (n, sym = '$') => `${sym}${Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const IcBack   = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
const IcPlus   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const IcEdit   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
const IcTrash  = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

export default function AdminCobros() {
  const { profile } = useAuth();
  const sym = profile?.currency_symbol || '$';

  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // vendedor seleccionado

  // Detalle
  const [payments, setPayments] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Modal pago
  const [showModal, setShowModal] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState('');

  // Confirmar eliminar
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profile?.id) loadBalances();
  }, [profile]);

  async function loadBalances(currentSellerId = null) {
    setLoading(true);
    const { data } = await db.rpc('get_seller_balances', { p_admin_id: profile.id });
    const list = data || [];
    setSellers(list);
    // Si hay un vendedor seleccionado, actualizar sus datos también
    if (currentSellerId) {
      const updated = list.find(s => s.seller_id === currentSellerId);
      if (updated) setSelected(updated);
    }
    setLoading(false);
  }

  async function loadDetail(seller) {
    setSelected(seller);
    setLoadingDetail(true);
    const { data } = await db.rpc('get_seller_payments', { p_seller_id: seller.seller_id });
    setPayments(data || []);
    setLoadingDetail(false);
  }

  function openCreate() {
    setEditPayment(null);
    setPayForm({ amount: '', notes: '' });
    setPayError('');
    setShowModal(true);
  }

  function openEdit(payment) {
    setEditPayment(payment);
    setPayForm({ amount: String(payment.amount), notes: payment.notes || '' });
    setPayError('');
    setShowModal(true);
  }

  async function handleSave() {
    const amount = parseFloat(payForm.amount);
    if (!payForm.amount || isNaN(amount) || amount <= 0) {
      setPayError('El monto debe ser mayor a 0');
      return;
    }
    setSaving(true);
    setPayError('');
    try {
      if (editPayment) {
        const { error } = await db.from('payments')
          .update({ amount, notes: payForm.notes.trim() || null })
          .eq('id', editPayment.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('payments').insert({
          seller_id: selected.seller_id,
          admin_id: profile.id,
          amount,
          notes: payForm.notes.trim() || null,
          registered_by: profile.id,
        });
        if (error) throw error;
      }
      setShowModal(false);
      await loadDetail(selected);
      await loadBalances(selected.seller_id);
    } catch (err) {
      setPayError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await db.from('payments').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      setDeleteTarget(null);
      await loadDetail(selected);
      await loadBalances(selected.seller_id);
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }

  // Cálculos de deuda para un vendedor
  function calcDebt(seller) {
    const totalSales = parseFloat(seller.total_sales || 0);
    const pct = parseFloat(seller.seller_percentage || 0);
    const commission = totalSales * (pct / 100);
    const owes = totalSales - commission; // lo que debe al admin
    const paid = parseFloat(seller.total_paid || 0);
    const balance = owes - paid; // saldo pendiente
    return { totalSales, commission, owes, paid, balance };
  }

  // ── VISTA DETALLE ──
  if (selected) {
    const { totalSales, commission, owes, paid, balance } = calcDebt(selected);
    const totalPayments = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);

    return (
      <div className="space-y-5 mt-2 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white transition p-1">
            <IcBack />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">{selected.seller_name}</h1>
            <p className="text-xs text-slate-500">Cobros y abonos</p>
          </div>
        </div>

        {/* Resumen financiero */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resumen</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total vendido</span>
              <span className="text-white font-medium">{fmt(totalSales, sym)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Comisión vendedor ({selected.seller_percentage}%)</span>
              <span className="text-violet-400 font-medium">− {fmt(commission, sym)}</span>
            </div>
            <div className="border-t border-slate-700 pt-2 flex justify-between text-sm">
              <span className="text-slate-300 font-medium">Le debes cobrar</span>
              <span className="text-white font-bold">{fmt(owes, sym)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total abonado</span>
              <span className="text-emerald-400 font-medium">− {fmt(paid, sym)}</span>
            </div>
            <div className={`border-t border-slate-700 pt-2 flex justify-between`}>
              <span className="text-sm font-bold text-white">Saldo pendiente</span>
              <span className={`text-lg font-bold ${balance <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {balance <= 0 ? `✓ Al día` : fmt(balance, sym)}
              </span>
            </div>
          </div>
        </div>

        {/* Historial de pagos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">Historial de cobros</p>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition"
            >
              <IcPlus /> Registrar cobro
            </button>
          </div>

          {loadingDetail ? (
            <p className="text-center text-slate-500 text-sm py-10">Cargando...</p>
          ) : payments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 text-sm">Sin abonos registrados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map(p => (
                <div key={p.id} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-emerald-400 font-bold text-base">{fmt(p.amount, sym)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(p.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}
                      {new Date(p.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {p.notes && <p className="text-xs text-slate-400 mt-1 truncate">{p.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-indigo-400 transition p-1"><IcEdit /></button>
                    <button onClick={() => setDeleteTarget(p)} className="text-slate-400 hover:text-red-400 transition p-1"><IcTrash /></button>
                  </div>
                </div>
              ))}
              <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-slate-400">Total abonado</span>
                <span className="text-emerald-400 font-bold">{fmt(totalPayments, sym)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal registrar/editar abono */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4">
              <h2 className="text-base font-bold text-white">{editPayment ? 'Editar abono' : 'Registrar abono'}</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Monto *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{sym}</span>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={payForm.amount}
                      onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-600 text-white rounded-xl px-3 py-2.5 pl-7 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="0.00"
                    />
                  </div>
                  {balance > 0 && !editPayment && (
                    <button
                      onClick={() => setPayForm(f => ({ ...f, amount: String(balance.toFixed(2)) }))}
                      className="text-xs text-indigo-400 hover:text-indigo-300 mt-1.5"
                    >
                      Usar saldo pendiente ({fmt(balance, sym)})
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Nota (opcional)</label>
                  <input
                    type="text"
                    value={payForm.notes}
                    onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-600 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ej: Pago sorteo 3PM del lunes"
                  />
                </div>
              </div>
              {payError && <p className="text-red-400 text-xs text-center">{payError}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowModal(false)} disabled={saving} className="flex-1 border border-slate-600 text-slate-300 text-sm py-2.5 rounded-xl hover:bg-slate-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50">
                  {saving ? 'Guardando...' : editPayment ? 'Guardar cambios' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal confirmar eliminación */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4">
              <h2 className="text-base font-bold text-white">¿Eliminar abono?</h2>
              <p className="text-sm text-slate-400">Se eliminará el abono de <span className="text-white font-semibold">{fmt(deleteTarget.amount, sym)}</span>. Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 border border-slate-600 text-slate-300 text-sm py-2.5 rounded-xl hover:bg-slate-700 transition disabled:opacity-50">Cancelar</button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50">
                  {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── VISTA LISTA ──
  return (
    <div className="space-y-4 mt-2 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Cobros</h1>
          <p className="text-xs text-slate-500 mt-0.5">Deudas y abonos por vendedor</p>
        </div>
        <button onClick={loadBalances} className="text-xs text-indigo-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl transition">
          ↺ Actualizar
        </button>
      </div>

      {loading ? (
        <p className="text-center text-slate-500 text-sm py-16">Cargando...</p>
      ) : sellers.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-16">No hay vendedores</p>
      ) : (
        <div className="space-y-2">
          {sellers.map(seller => {
            const { totalSales, owes, paid, balance } = calcDebt(seller);
            const isOk = balance <= 0;
            return (
              <button
                key={seller.seller_id}
                onClick={() => loadDetail(seller)}
                className="w-full text-left bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-2xl px-4 py-4 transition active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white text-sm">{seller.seller_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        {isOk ? 'Al día' : 'Con deuda'}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-slate-400">
                      <span>Ventas: <span className="text-white">{fmt(totalSales, sym)}</span></span>
                      <span>Pagado: <span className="text-emerald-400">{fmt(paid, sym)}</span></span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-500 mb-0.5">Saldo</p>
                    <p className={`text-lg font-bold ${isOk ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isOk ? fmt(0, sym) : fmt(balance, sym)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
