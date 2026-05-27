import { useEffect, useState, useCallback } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';
import SubAdminBalance from './SubAdminBalance';

const fmt = (n, sym = '$') =>
  `${sym}${Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

const IcRefresh = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const IcChevron = ({ open }) => (
  <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

function balanceColor(n) {
  const v = Number(n || 0);
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-rose-400';
  return 'text-slate-400';
}

function SellerSelfBalance() {
  const { profile } = useAuth();
  const sym = profile?.currency_symbol || '$';

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
  const [showDetail, setShowDetail] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    loadLotteries();
    loadBalance();
  }, [profile]);

  useEffect(() => {
    if (lotteryId) loadDrawTimes(lotteryId);
    else {
      setDrawTimes([]);
      setDrawTimeId('');
    }
  }, [lotteryId]);

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
    if (!profile?.id) return;
    setLoading(true);
    try {
      const params = {
        p_seller_id: profile.id,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_lottery_id: lotteryId || null,
        p_draw_time_id: drawTimeId || null,
      };
      const [{ data: balData }, { data: detData }, { data: settData }] = await Promise.all([
        db.rpc('get_seller_balance_for_seller', params),
        db.rpc('get_seller_balance_detail_for_seller', params),
        db.rpc('get_settlements_history', {
          p_admin_id: profile.parent_admin_id,
          p_seller_id: profile.id,
          p_date_from: dateFrom || null,
          p_date_to: dateTo || null,
          p_lottery_id: lotteryId || null,
          p_draw_time_id: drawTimeId || null,
        }),
      ]);
      setBalance(balData?.[0] || null);
      setDetail(detData || []);
      setSettlements(settData || []);
    } finally {
      setLoading(false);
    }
  }, [profile, dateFrom, dateTo, lotteryId, drawTimeId]);

  useEffect(() => {
    if (profile?.id) loadBalance();
  }, [dateFrom, dateTo, lotteryId, drawTimeId]);

  const hasFilters = dateFrom || dateTo || lotteryId || drawTimeId;
  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setLotteryId('');
    setDrawTimeId('');
  }

  const detailTotalSales = Number(balance?.total_sales || 0);
  const detailTotalPrizes = Number(balance?.total_prizes_paid || 0);
  const detailTotalCommission = Number(balance?.total_commission || 0);
  const netPeriod = Number(balance?.admin_part || 0) - Number(balance?.total_prizes_paid || 0);
  const settlementsTotal = settlements.reduce((sum, s) => sum + Number(s.amount || 0), 0);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Mi Balance</h1>
          <p className="text-xs text-gray-500 mt-0.5">Cuenta corriente con el administrador</p>
        </div>
        <button
          onClick={loadBalance}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 bg-white border border-gray-200 px-3 py-2 rounded-xl transition disabled:opacity-40"
        >
          <IcRefresh /> Actualizar
        </button>
      </div>

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

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && balance && (
        <>
          <p className="text-xs text-gray-400 text-center">
            Periodo: {fmtDate(balance.period_start)} {'->'} {fmtDate(balance.period_end)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Total recaudado</p>
              <p className="text-base font-bold text-gray-900">{fmt(detailTotalSales, sym)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Mi comision ({Number(balance.commission_pct || 0).toFixed(1)}%)</p>
              <p className="text-base font-bold text-violet-600">{fmt(detailTotalCommission, sym)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Premios generados</p>
              <p className="text-base font-bold text-amber-600">{fmt(detailTotalPrizes, sym)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Neto del periodo</p>
              <p className={`text-base font-bold ${balanceColor(netPeriod)}`}>{fmt(netPeriod, sym)}</p>
            </div>
            {settlementsTotal !== 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm col-span-2">
                <p className="text-xs text-gray-500 mb-1">Cortes registrados en este alcance</p>
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
                ? 'Debes entregar al administrador'
                : Number(balance.balance) < 0
                  ? 'El administrador te debe'
                  : 'Sin deuda pendiente'}
            </p>
          </div>

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
                        {settlement.notes && <p className="text-xs text-gray-500 mt-1 italic">"{settlement.notes}"</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400 mb-0.5">Balance</p>
                        <p className={`text-sm font-bold ${balanceColor(settlement.balance_at_settlement)}`}>{fmt(settlement.balance_at_settlement, sym)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !balance && (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">No hay datos de balance disponibles</p>
        </div>
      )}
    </div>
  );
}

export default function SellerBalance() {
  const { profile } = useAuth();

  if (profile?.role === 'sub_admin') {
    return <SubAdminBalance />;
  }

  return <SellerSelfBalance />;
}
