import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

export default function CleanupData() {
  const _d = new Date();
  const currentMonth = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}`;

  const [admins, setAdmins]             = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [months, setMonths]             = useState([]); // [{ ym, ticketCount }]
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [loadingMonths, setLoadingMonths] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [result, setResult]             = useState(null); // { deleted, error }

  useEffect(() => {
    async function load() {
      const { data } = await db.from('profiles').select('id, full_name, email')
        .eq('role', 'admin').order('full_name');
      setAdmins(data || []);
      setLoadingAdmins(false);
    }
    load();
  }, []);

  async function selectAdmin(admin) {
    setSelectedAdmin(admin);
    setSelectedMonths([]);
    setResult(null);
    setMonths([]);
    if (!admin) return;
    setLoadingMonths(true);

    // Obtener IDs de vendedores del admin
    const { data: sellers } = await db.from('profiles')
      .select('id').eq('parent_admin_id', admin.id).eq('role', 'seller');
    const sellerIds = (sellers || []).map(s => s.id);

    if (!sellerIds.length) { setLoadingMonths(false); return; }

    // Obtener tickets agrupados por mes (sale_date YYYY-MM-DD → extraer YYYY-MM)
    const { data: tickets } = await db.from('tickets')
      .select('sale_date').in('seller_id', sellerIds);

    const countByMonth = {};
    (tickets || []).forEach(t => {
      const ym = t.sale_date?.slice(0, 7);
      if (ym && ym !== currentMonth) countByMonth[ym] = (countByMonth[ym] || 0) + 1;
    });

    const sorted = Object.entries(countByMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, ticketCount]) => ({ ym, ticketCount }));

    setMonths(sorted);
    setLoadingMonths(false);
  }

  function toggleMonth(ym) {
    setSelectedMonths(prev =>
      prev.includes(ym) ? prev.filter(m => m !== ym) : [...prev, ym]
    );
  }

  function toggleAll() {
    if (selectedMonths.length === months.length) setSelectedMonths([]);
    else setSelectedMonths(months.map(m => m.ym));
  }

  const totalToDelete = months
    .filter(m => selectedMonths.includes(m.ym))
    .reduce((sum, m) => sum + m.ticketCount, 0);

  async function handleDelete() {
    if (!selectedAdmin || !selectedMonths.length) return;
    setDeleting(true);
    setResult(null);

    try {
      // 1. Obtener seller IDs del admin
      const { data: sellers } = await db.from('profiles')
        .select('id').eq('parent_admin_id', selectedAdmin.id).eq('role', 'seller');
      const sellerIds = (sellers || []).map(s => s.id);
      if (!sellerIds.length) { setResult({ deleted: 0 }); setDeleting(false); return; }

      // 2. Obtener IDs de lotteries del admin (para winning_numbers)
      const { data: lotteries } = await db.from('lotteries')
        .select('id').eq('admin_id', selectedAdmin.id);
      const lotteryIds = (lotteries || []).map(l => l.id);

      let totalDeleted = 0;

      for (const ym of selectedMonths) {
        const dateFrom = `${ym}-01`;
        const [y, m] = ym.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        const dateTo = `${ym}-${String(lastDay).padStart(2, '0')}`;

        // 3. Obtener ticket IDs del mes
        const { data: ticketRows } = await db.from('tickets')
          .select('id').in('seller_id', sellerIds)
          .gte('sale_date', dateFrom).lte('sale_date', dateTo);
        const ticketIds = (ticketRows || []).map(t => t.id);

        // 4. Borrar ticket_numbers en chunks
        const CHUNK = 100;
        for (let i = 0; i < ticketIds.length; i += CHUNK) {
          await db.from('ticket_numbers').delete()
            .in('ticket_id', ticketIds.slice(i, i + CHUNK));
        }

        // 5. Borrar tickets en chunks
        for (let i = 0; i < ticketIds.length; i += CHUNK) {
          await db.from('tickets').delete()
            .in('id', ticketIds.slice(i, i + CHUNK));
        }
        totalDeleted += ticketIds.length;

        // 6. Borrar winning_numbers del mes para las lotteries del admin
        if (lotteryIds.length) {
          await db.from('winning_numbers').delete()
            .in('lottery_id', lotteryIds)
            .gte('draw_date', dateFrom).lte('draw_date', dateTo);
        }
      }

      setResult({ deleted: totalDeleted });
      // Recargar meses
      await selectAdmin(selectedAdmin);
      setSelectedMonths([]);
    } catch (err) {
      setResult({ error: err.message || 'Error al eliminar' });
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Limpieza de datos</h1>
        <p className="text-xs text-gray-500 mt-0.5">Elimina tickets, números y resultados de meses anteriores por administrador</p>
      </div>

      {/* Selección de admin */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Seleccionar administrador</p>
        {loadingAdmins ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : (
          <div className="space-y-2">
            {admins.map(admin => (
              <button
                key={admin.id}
                onClick={() => selectAdmin(selectedAdmin?.id === admin.id ? null : admin)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition ${
                  selectedAdmin?.id === admin.id
                    ? 'bg-gray-900 border-gray-900 text-white'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-400'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold">{admin.full_name}</p>
                  <p className={`text-xs ${selectedAdmin?.id === admin.id ? 'text-gray-400' : 'text-gray-400'}`}>{admin.email}</p>
                </div>
                {selectedAdmin?.id === admin.id && (
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Seleccionado</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Meses disponibles */}
      {selectedAdmin && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Meses a eliminar</p>
            {months.length > 0 && (
              <button onClick={toggleAll} className="text-xs text-indigo-600 font-medium">
                {selectedMonths.length === months.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            )}
          </div>

          {loadingMonths ? (
            <p className="text-sm text-gray-400">Cargando meses...</p>
          ) : months.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400">No hay datos de meses anteriores para este administrador</p>
              <p className="text-xs text-gray-300 mt-1">El mes actual nunca se puede eliminar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {months.map(({ ym, ticketCount }) => (
                <button
                  key={ym}
                  onClick={() => toggleMonth(ym)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition ${
                    selectedMonths.includes(ym)
                      ? 'bg-red-50 border-red-300'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedMonths.includes(ym) ? 'bg-red-500 border-red-500' : 'border-gray-300'
                    }`}>
                      {selectedMonths.includes(ym) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm font-medium ${selectedMonths.includes(ym) ? 'text-red-700' : 'text-gray-700'}`}>
                      {monthLabel(ym)}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold ${selectedMonths.includes(ym) ? 'text-red-500' : 'text-gray-400'}`}>
                    {ticketCount} tickets
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedMonths.length > 0 && (
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-3 rounded-xl transition mt-2"
            >
              Eliminar {selectedMonths.length} {selectedMonths.length === 1 ? 'mes' : 'meses'} · {totalToDelete} tickets
            </button>
          )}
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className={`rounded-2xl border p-4 ${result.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          {result.error
            ? <p className="text-sm text-red-700 font-medium">Error: {result.error}</p>
            : <p className="text-sm text-green-700 font-medium">✓ Se eliminaron {result.deleted} tickets correctamente</p>
          }
        </div>
      )}

      {/* Modal confirmación */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">¿Confirmar eliminación?</h2>
              <p className="text-sm text-gray-500 mt-1">Esta acción no se puede deshacer.</p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-red-700">Se eliminará permanentemente:</p>
              <p className="text-xs text-red-600">• {totalToDelete} tickets y sus números</p>
              <p className="text-xs text-red-600">• Números ganadores de {selectedMonths.length} {selectedMonths.length === 1 ? 'mes' : 'meses'}</p>
              <p className="text-xs text-red-600">• Admin: <span className="font-semibold">{selectedAdmin?.full_name}</span></p>
              <p className="text-xs text-red-600">• Meses: {selectedMonths.map(monthLabel).join(', ')}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
