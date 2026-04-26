import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';
import { today } from '../../lib/helpers';

const MATCH_LABELS = {
  chance:           '2 últ. (chance)',
  billete_4exactas: '4 cifras exactas',
  pale_1er:         '1er Palé',
  pale_2do:         '2do Palé',
  pale_3er:         '3er Palé',
  nac_3_primeras:   '3 primeras',
  nac_3_ultimas:    '3 últimas',
  nac_2_primeras:   '2 primeras',
  nac_2_ultimas:    '2 últimas',
  nac_1_ultima:     'Última cifra',
};

const PRIZE_LABELS = { '1st': '1er Premio', '2nd': '2do Premio', '3rd': '3er Premio' };

function fmtAmt(n, sym = '$') {
  return `${sym}${Number(n || 0).toLocaleString('es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function SellerPremios() {
  const { profile } = useAuth();

  const [dateFrom, setDateFrom]   = useState(today());
  const [dateTo, setDateTo]       = useState(today());
  const [lotteryId, setLotteryId] = useState('');
  const [status, setStatus]       = useState('');

  const [lotteries, setLotteries] = useState([]);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const sym = profile?.currency_symbol || '$';

  useEffect(() => {
    if (!profile?.id) return;
    const adminId = profile.parent_admin_id || profile.id;
    db.from('lotteries')
      .select('id, display_name')
      .eq('admin_id', adminId)
      .eq('is_active', true)
      .order('display_name')
      .then(({ data }) => setLotteries(data || []));
  }, [profile]);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await db.rpc('get_seller_winning_tickets', {
        p_seller_id:    profile.id,
        p_date_from:    dateFrom   || null,
        p_date_to:      dateTo     || null,
        p_lottery_id:   lotteryId  || null,
        p_draw_time_id: null,
        p_status:       status     || null,
      });
      if (e) throw e;
      setRows(data || []);
    } catch (e) {
      setError(e.message || 'Error al cargar premios');
    } finally {
      setLoading(false);
    }
  }, [profile, dateFrom, dateTo, lotteryId, status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const grouped = useMemo(() => {
    const map = {};
    (rows || []).forEach(r => {
      const key = r.ticket_id;
      if (!map[key]) map[key] = { ...r, matches: [] };
      map[key].matches.push({
        number:         r.number,
        winning_number: r.winning_number,
        match_type:     r.match_type,
        prize_position: r.prize_position,
        multiplier:     r.multiplier,
        prize_amount:   r.prize_amount,
      });
    });
    return Object.values(map).map(g => ({
      ...g,
      total_prize: g.matches.reduce((acc, m) => acc + parseFloat(m.prize_amount || 0), 0),
    }));
  }, [rows]);

  const summary = useMemo(() => {
    const pending = grouped.filter(g => !g.is_paid);
    const paid    = grouped.filter(g => g.is_paid);
    return {
      totalAmt:     grouped.reduce((s, g) => s + g.total_prize, 0),
      pendingAmt:   pending.reduce((s, g) => s + g.total_prize, 0),
      paidAmt:      paid.reduce((s, g) => s + g.total_prize, 0),
      countPending: pending.length,
      countPaid:    paid.length,
    };
  }, [grouped]);

  return (
    <div className="space-y-3">

      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-800">MIS PREMIOS</h2>
        <button
          onClick={fetchData}
          disabled={loading}
          className="text-xs text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg active:bg-gray-50 font-semibold disabled:opacity-50"
        >
          ↺ Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>

      <select
        value={lotteryId}
        onChange={e => setLotteryId(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
      >
        <option value="">Todas las loterías</option>
        {lotteries.map(l => (
          <option key={l.id} value={l.id}>{l.display_name}</option>
        ))}
      </select>

      <div className="flex gap-2">
        {[['', 'Todos'], ['pending', 'Pendientes'], ['paid', 'Cobrados']].map(([val, lbl]) => (
          <button
            key={val}
            onClick={() => setStatus(val)}
            className={`flex-1 text-xs py-2 rounded-lg border transition font-medium ${
              status === val
                ? 'bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white border-transparent'
                : 'border-gray-300 text-gray-500 bg-white active:bg-gray-50'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {grouped.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center">
            <p className="text-sm font-bold text-gray-900">{fmtAmt(summary.totalAmt, sym)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Total</p>
          </div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 shadow-sm p-3 text-center">
            <p className="text-sm font-bold text-yellow-700">{summary.countPending}</p>
            <p className="text-[10px] text-yellow-600 mt-0.5">Pendientes</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-3 text-center">
            <p className="text-sm font-bold text-green-700">{summary.countPaid}</p>
            <p className="text-[10px] text-green-600 mt-0.5">Cobrados</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-400 py-10">Cargando...</p>
      ) : grouped.length === 0 ? (
        <p className="text-center text-gray-400 py-10">
          No hay tickets ganadores para este período
        </p>
      ) : (
        <div className="space-y-2">
          {grouped.map(row => {
            const isPaid = row.is_paid;
            return (
              <div
                key={row.ticket_id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-bold text-gray-900 truncate">
                        {row.ticket_number}
                      </p>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {row.matches.length} acierto{row.matches.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {row.lottery_name}
                      {row.draw_time_label ? ` · ${row.draw_time_label}` : ''}
                      {' · '}{row.draw_date}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-none">
                    <span className="text-lg font-bold text-gray-900">
                      {fmtAmt(row.total_prize, sym)}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isPaid
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {isPaid ? 'COBRADO' : 'PENDIENTE'}
                    </span>
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  {row.matches.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-gray-800">{m.number}</span>
                        <span className="text-xs text-gray-400">→ {m.winning_number}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          m.prize_position === '1st'
                            ? 'bg-blue-100 text-blue-700'
                            : m.prize_position === '2nd'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {PRIZE_LABELS[m.prize_position] || m.prize_position}
                        </span>
                        <span className="text-xs text-gray-500">
                          {MATCH_LABELS[m.match_type] || m.match_type}
                        </span>
                        <span className="text-xs text-gray-300">×{m.multiplier}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-800">
                        {fmtAmt(m.prize_amount, sym)}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-gray-400 mt-2">
                  Apostado: {fmtAmt(row.bet_amount, sym)}
                  {isPaid && row.paid_at && (
                    <span className="ml-2">
                      · Cobrado {new Date(row.paid_at).toLocaleDateString('es')}
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
