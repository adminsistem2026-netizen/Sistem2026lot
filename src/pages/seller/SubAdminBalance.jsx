import { useEffect, useState, useCallback } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';
import { getPostSettlementCardSummary } from '../../lib/balanceCardSummary';

const fmt = (n, sym = '$') =>
  `${sym}${Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

const IcChevron = ({ open }) => (
  <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const IcTrash = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

function balanceColor(n) {
  const v = Number(n || 0);
  if (v > 0) return 'text-emerald-600';
  if (v < 0) return 'text-rose-500';
  return 'text-gray-400';
}

export default function SubAdminBalance() {
  const { profile } = useAuth();
  const sym = profile?.currency_symbol || '$';

  const [sellers, setSellers] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lotteryId, setLotteryId] = useState('');
  const [drawTimeId, setDrawTimeId] = useState('');
  const [lotteries, setLotteries] = useState([]);
  const [drawTimes, setDrawTimes] = useState([]);

  const [balance, setBalance] = useState(null);
  const [detail, setDetail] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(true);
  const [showHistory, setShowHistory] = useState(true);

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!profile?.id) return;
    loadSellers();
    loadLotteries();
  }, [profile]);

  useEffect(() => {
    if (lotteryId) loadDrawTimes(lotteryId);
    else {
      setDrawTimes([]);
      setDrawTimeId('');
    }
  }, [lotteryId]);

  useEffect(() => {
    if (selectedSellerId) loadBalance();
  }, [selectedSellerId, dateFrom, dateTo, lotteryId, drawTimeId]);

  async function loadSellers() {
    const { data } = await db
      .from('profiles')
      .select('id, full_name, seller_percentage')
      .eq('sub_admin_id', profile.id)
      .eq('role', 'seller')
      .eq('is_active', true)
      .order('full_name');
    setSellers(data || []);
  }

  async function loadLotteries() {
    const { data } = await db
      .from('lotteries')
      .select('id, display_name')
      .eq('admin_id', profile.parent_admin_id)
      .eq('is_active', true)
      .order('display_name');
    setLotteries(data || []);
  }

  async function loadDrawTimes(lotId) {
    const { data } = await db
      .from('draw_times')
      .select('id, time_label')
      .eq('lottery_id', lotId)
      .eq('is_active', true)
      .order('time_label');
    setDrawTimes(data || []);
  }

  const loadBalance = useCallback(async () => {
    if (!profile?.id || !selectedSellerId) return;
    setLoading(true);
    try {
      const params = {
        p_sub_admin_id: profile.id,
        p_seller_id: selectedSellerId,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_lottery_id: lotteryId || null,
        p_draw_time_id: drawTimeId || null,
      };

      const [{ data: balData }, { data: detData }, { data: histData }] = await Promise.all([
        db.rpc('get_seller_balance_for_subadmin', params),
        db.rpc('get_seller_balance_detail_for_subadmin', params),
        db.rpc('get_settlements_history_for_subadmin', params),
      ]);

      setBalance(balData?.[0] || null);
      setDetail(detData || []);
      setSettlements(histData || []);
    } finally {
      setLoading(false);
    }
  }, [profile, selectedSellerId, dateFrom, dateTo, lotteryId, drawTimeId]);

  async function handleSettle() {
    const rawAmount = parseFloat(settleAmount);
    const currentBalance = Number(balance?.balance || 0);
    const maxAmount = parseFloat(Math.abs(currentBalance).toFixed(2));

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      setSettleError('Ingresa un monto valido mayor que 0');
      return;
    }
    if (rawAmount > maxAmount) {
      setSettleError(`El monto no puede ser mayor que ${fmt(maxAmount, sym)}`);
      return;
    }

    setSettling(true);
    setSettleError('');
    try {
      const signedAmount = currentBalance < 0 ? -rawAmount : rawAmount;
      const { error } = await db.rpc('create_settlement_by_subadmin', {
        p_sub_admin_id: profile.id,
        p_seller_id: selectedSellerId,
        p_amount: signedAmount,
        p_notes: settleNotes.trim() || null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_lottery_id: lotteryId || null,
        p_draw_time_id: drawTimeId || null,
      });
      if (error) throw error;
      setShowSettleModal(false);
      setSettleAmount('');
      setSettleNotes('');
      await loadBalance();
    } catch (err) {
      setSettleError(err.message || 'Error al crear el corte');
    } finally {
      setSettling(false);
    }
  }

  async function handleDeleteSettlement() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const { error } = await db.rpc('delete_settlement_by_subadmin', {
        p_settlement_id: confirmDeleteId,
        p_sub_admin_id: profile.id,
      });
      if (error) throw error;
      setConfirmDeleteId(null);
      await loadBalance();
    } catch (err) {
      setDeleteError(err.message || 'Error al eliminar el corte');
    } finally {
      setDeleting(false);
    }
  }

  const selectedSeller = sellers.find((s) => s.id === selectedSellerId);
  const cardSummary = getPostSettlementCardSummary(balance, detail, settlements);
  const settlementsTotal = settlements.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const hasFilters = dateFrom || dateTo || lotteryId || drawTimeId;

  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setLotteryId('');
    setDrawTimeId('');
  }

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Balance de mis vendedores</h1>
        <p className="text-xs text-gray-500 mt-0.5">Cuenta corriente sub-admin a vendedor</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Vendedor</label>
        <select
          value={selectedSellerId}
          onChange={(e) => setSelectedSellerId(e.target.value)}
          className="w-full bg-white border border-gray-200 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          <option value="">Selecciona un vendedor</option>
          {sellers.map((seller) => (
            <option key={seller.id} value={seller.id}>
              {seller.full_name}
            </option>
          ))}
        </select>
      </div>

      {selectedSellerId && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 bg-white border border-gray-200 text-gray-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <span className="text-gray-400 text-xs self-center">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 bg-white border border-gray-200 text-gray-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={lotteryId}
              onChange={(e) => setLotteryId(e.target.value)}
              className="flex-1 min-w-[130px] bg-white border border-gray-200 text-gray-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="">Todas las loterias</option>
              {lotteries.map((lottery) => (
                <option key={lottery.id} value={lottery.id}>
                  {lottery.display_name}
                </option>
              ))}
            </select>
            {drawTimes.length > 0 && (
              <select
                value={drawTimeId}
                onChange={(e) => setDrawTimeId(e.target.value)}
                className="flex-1 min-w-[130px] bg-white border border-gray-200 text-gray-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="">Todos los sorteos</option>
                {drawTimes.map((drawTime) => (
                  <option key={drawTime.id} value={drawTime.id}>
                    {drawTime.time_label}
                  </option>
                ))}
              </select>
            )}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-3 py-2 rounded-xl transition whitespace-nowrap"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && selectedSellerId && balance && (
        <>
          <p className="text-xs text-gray-400 text-center">
            Periodo: {fmtDate(cardSummary.periodStart || balance.period_start)} {'->'} {fmtDate(cardSummary.periodEnd || balance.period_end)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Total recaudado</p>
              <p className="text-base font-bold text-gray-900">{fmt(cardSummary.totalSales, sym)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Comision ({Number(balance.commission_pct || 0).toFixed(1)}%)</p>
              <p className="text-base font-bold text-violet-600">{fmt(cardSummary.totalCommission, sym)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Premios generados</p>
              <p className="text-base font-bold text-amber-600">{fmt(cardSummary.totalPrizes, sym)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Neto del periodo</p>
              <p className={`text-base font-bold ${balanceColor(cardSummary.netPeriod)}`}>{fmt(cardSummary.netPeriod, sym)}</p>
            </div>
            {settlementsTotal !== 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm col-span-2">
                <p className="text-xs text-gray-500 mb-1">Cortes registrados</p>
                <p className={`text-base font-bold ${balanceColor(settlementsTotal)}`}>{fmt(settlementsTotal, sym)}</p>
              </div>
            )}
          </div>

          <div className={`rounded-2xl p-5 border ${
            Number(balance.balance) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
          }`}>
            <p className="text-xs text-gray-500 mb-1 text-center">Balance actual</p>
            <p className={`text-3xl font-bold text-center ${balanceColor(balance.balance)}`}>
              {fmt(Math.abs(Number(balance.balance || 0)), sym)}
            </p>
            <p className={`text-xs text-center mt-1 ${Number(balance.balance) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {Number(balance.balance) > 0
                ? 'El vendedor te debe'
                : Number(balance.balance) < 0
                  ? 'Le debes al vendedor'
                  : 'Sin deuda pendiente'}
            </p>
          </div>

          <button
            onClick={() => setShowSettleModal(true)}
            disabled={Number(balance.balance || 0) === 0}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-3 rounded-xl transition disabled:opacity-50"
          >
            Registrar corte
          </button>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowDetail((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition"
            >
              Desglose por dia
              <IcChevron open={showDetail} />
            </button>
            {showDetail && (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="px-3 py-2.5 text-left font-semibold">Fecha</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Ventas</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Comision</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Premios</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-gray-400">Sin movimientos en el periodo</td>
                      </tr>
                    ) : detail.map((row, i) => (
                      <tr key={i} className={`border-t border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{fmtDate(row.day)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-900">{fmt(row.total_sales, sym)}</td>
                        <td className="px-3 py-2.5 text-right text-violet-600">{fmt(row.total_commission, sym)}</td>
                        <td className="px-3 py-2.5 text-right text-amber-600">{fmt(row.prizes_paid, sym)}</td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${balanceColor(row.balance_day)}`}>{fmt(row.balance_day, sym)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition"
            >
              Historial de cortes ({settlements.length})
              <IcChevron open={showHistory} />
            </button>
            {showHistory && (
              <div className="border-t border-gray-100">
                {settlements.length === 0 ? (
                  <p className="text-center text-gray-400 text-xs py-6">Sin cortes registrados</p>
                ) : settlements.map((settlement) => (
                  <div key={settlement.id} className="px-4 py-3 border-b border-gray-100 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500">
                          {fmtDate(settlement.period_start)} {'->'} {fmtDate(settlement.period_end)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Registrado: {new Date(settlement.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        {settlement.notes && (
                          <p className="text-xs text-gray-500 mt-1 italic">"{settlement.notes}"</p>
                        )}
                        <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
                          <span>Liquidado: <span className={Number(settlement.amount || 0) >= 0 ? 'text-emerald-600 font-medium' : 'text-rose-500 font-medium'}>{fmt(settlement.amount, sym)}</span></span>
                          <span>Ventas: <span className="text-gray-700">{fmt(settlement.total_sales, sym)}</span></span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-gray-400 mb-0.5">Balance</p>
                          <p className={`text-sm font-bold ${balanceColor(settlement.balance_at_settlement)}`}>{fmt(settlement.balance_at_settlement, sym)}</p>
                        </div>
                        <button
                          onClick={() => {
                            setDeleteError('');
                            setConfirmDeleteId(settlement.id);
                          }}
                          className="text-gray-400 hover:text-rose-500 transition p-1 rounded-lg hover:bg-rose-50"
                          title="Eliminar corte"
                        >
                          <IcTrash />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !selectedSellerId && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">Selecciona un vendedor para ver su balance</p>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h2 className="text-base font-bold text-gray-900">Eliminar corte</h2>
            <p className="text-sm text-gray-600">Esta accion no se puede deshacer. El balance se recalculara sin este corte.</p>
            {deleteError && <p className="text-rose-500 text-xs text-center">{deleteError}</p>}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  setConfirmDeleteId(null);
                  setDeleteError('');
                }}
                disabled={deleting}
                className="flex-1 border border-gray-300 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteSettlement}
                disabled={deleting}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettleModal && balance && (
        <div className="fixed inset-0 bg-black/75 flex items-end justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-5 space-y-4">
            <h2 className="text-base font-bold text-gray-900">Confirmar corte</h2>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Vendedor</span>
                <span className="text-gray-900 font-medium">{selectedSeller?.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Periodo</span>
                <span className="text-gray-900 text-xs">{fmtDate(balance.period_start)} {'->'} {fmtDate(balance.period_end)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Balance a liquidar</span>
                <span className={`font-bold ${balanceColor(balance.balance)}`}>{fmt(balance.balance, sym)}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {Number(balance.balance) >= 0 ? 'Monto recibido del vendedor' : 'Monto entregado al vendedor'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                placeholder={String(Math.abs(Number(balance.balance || 0)).toFixed(2))}
                className="w-full bg-white border border-gray-300 text-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Nota (opcional)</label>
              <input
                type="text"
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
                placeholder="Ej: Cierre semanal"
                className="w-full bg-white border border-gray-300 text-gray-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            {settleError && <p className="text-rose-500 text-xs text-center">{settleError}</p>}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  setShowSettleModal(false);
                  setSettleAmount('');
                  setSettleNotes('');
                }}
                disabled={settling}
                className="flex-1 border border-gray-300 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSettle}
                disabled={settling}
                className="flex-1 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {settling ? 'Registrando...' : 'Confirmar corte'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
