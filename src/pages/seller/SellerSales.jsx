import { useState, useEffect, useCallback } from 'react';
import { useTickets } from '../../hooks/useTickets';
import { useLotteries } from '../../hooks/useLotteries';
import TicketPreview from '../../components/ticket/TicketPreview';
import QRScannerModal from '../../components/common/QRScannerModal';
import { usePrinter } from '../../contexts/PrinterContext';
import { useToast } from '../../components/common/Toast';
import { today } from '../../lib/helpers';
import { db } from '../../lib/insforge';

export default function SellerSales() {
  const { loadTodayTickets, markAsPaid, cancelTicket } = useTickets();
  const { lotteries, drawTimes } = useLotteries();
  const { printTicket } = usePrinter();
  const showToast = useToast();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  // Filters
  const [filterDate, setFilterDate] = useState(today());
  const [filterLottery, setFilterLottery] = useState('');
  const [filterDrawTime, setFilterDrawTime] = useState('');
  const [searchId, setSearchId] = useState('');

  const currentDrawTimes = filterLottery ? (drawTimes[filterLottery] || []) : [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketData, { data: winningData }] = await Promise.all([
        loadTodayTickets({ date: filterDate }),
        db.from('winning_numbers')
          .select('lottery_id, draw_time_id, first_prize, second_prize, third_prize')
          .eq('draw_date', filterDate),
      ]);

      // Build map: "lottery_id|draw_time_id" -> Set of winning numbers
      const winMap = {};
      for (const w of (winningData || [])) {
        const key = `${w.lottery_id}|${w.draw_time_id}`;
        winMap[key] = new Set([w.first_prize, w.second_prize, w.third_prize].filter(Boolean));
      }

      const enriched = ticketData.map(t => {
        const key = `${t.lottery_id}|${t.draw_time_id}`;
        const prizes = winMap[key];
        const is_winner = prizes
          ? (t.ticket_numbers || []).some(n => n.digit_count === 2 && prizes.has(n.number))
          : false;
        return {
          ...t,
          lottery_display_name: lotteries.find(l => l.id === t.lottery_id)?.display_name || '—',
          draw_time_label: Object.values(drawTimes).flat().find(dt => dt.id === t.draw_time_id)?.time_label || '—',
          numbers: t.ticket_numbers || [],
          is_winner,
        };
      });
      setTickets(enriched);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [loadTodayTickets, filterDate, lotteries, drawTimes]);

  useEffect(() => { load(); }, [load]);

  // Client-side filtering
  const displayed = tickets
    .filter(t => !filterLottery || t.lottery_id === filterLottery)
    .filter(t => !filterDrawTime || t.draw_time_id === filterDrawTime)
    .filter(t => !searchId || t.ticket_number.toLowerCase().includes(searchId.toLowerCase()));

  function handleQRResult(value) {
    setShowScanner(false);
    setSearchId(value);
  }

  async function handleMarkPaid(ticket) {
    try {
      await markAsPaid(ticket.id);
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, is_paid: true } : t));
      setSelectedTicket(prev => prev?.id === ticket.id ? { ...prev, is_paid: true } : prev);
      showToast('Ticket marcado como cobrado', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function handleCancel(ticket) {
    const drawTime = Object.values(drawTimes).flat().find(dt => dt.id === ticket.draw_time_id);
    try {
      await cancelTicket(ticket.id, drawTime);
      setTickets(prev => prev.filter(t => t.id !== ticket.id));
      setSelectedTicket(null);
      showToast('Ticket anulado', 'warning');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  const total = displayed.reduce((s, t) => s + Number(t.total_amount), 0);
  const sym = tickets[0]?.currency_symbol || '$';
  const isToday = filterDate === today();

  return (
    <div className="space-y-3">

      {/* Título + Actualizar */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-800">MIS VENTAS</h2>
        <button
          onClick={load}
          className="text-xs text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg active:bg-gray-50 font-semibold"
        >
          ↺ Actualizar
        </button>
      </div>

      {/* Filtro de fecha */}
      <div className="flex gap-2 items-center">
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        />
        {!isToday && (
          <button
            onClick={() => setFilterDate(today())}
            className="text-xs px-3 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg font-semibold whitespace-nowrap"
          >
            Hoy
          </button>
        )}
      </div>

      {/* Filtro lotería */}
      <select
        value={filterLottery}
        onChange={e => { setFilterLottery(e.target.value); setFilterDrawTime(''); }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
      >
        <option value="">Todas las loterías</option>
        {lotteries.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
      </select>

      {/* Filtro hora de sorteo */}
      <select
        value={filterDrawTime}
        onChange={e => setFilterDrawTime(e.target.value)}
        disabled={!filterLottery}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
      >
        <option value="">Todas las horas</option>
        {currentDrawTimes.map(dt => (
          <option key={dt.id} value={dt.id}>{dt.time_label}</option>
        ))}
      </select>

      {/* Búsqueda por ID + escáner */}
      <div className="flex gap-2">
        <input
          type="text"
          value={searchId}
          onChange={e => setSearchId(e.target.value)}
          placeholder="Buscar por ID de ticket..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        />
        <button
          onClick={() => setShowScanner(true)}
          className="px-3 py-2 bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white rounded-lg text-xl leading-none shadow active:opacity-80"
          title="Escanear QR"
        >
          📷
        </button>
        {searchId && (
          <button
            onClick={() => setSearchId('')}
            className="px-3 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm font-bold active:bg-gray-200"
          >✕</button>
        )}
      </div>

      {/* Resumen */}
      {displayed.length > 0 && (
        <div className="border-2 border-blue-400 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-600">
              {displayed.length} ticket{displayed.length !== 1 ? 's' : ''}
              {!isToday && <span className="text-blue-500"> · {filterDate}</span>}
            </p>
            <p className="text-xs text-gray-400">
              {displayed.filter(t => t.is_paid).length} cobrados
            </p>
          </div>
          <span className="text-xl font-bold text-gray-900">{sym}{total.toFixed(2)}</span>
        </div>
      )}

      {/* Lista de tickets */}
      {loading ? (
        <p className="text-center text-gray-400 py-10">Cargando...</p>
      ) : displayed.length === 0 ? (
        <p className="text-center text-gray-400 py-10">
          {searchId ? 'No se encontró ese ticket' : 'No hay ventas para esta fecha'}
        </p>
      ) : (
        <div className="space-y-2">
          {displayed.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTicket(t)}
              className={`w-full rounded-xl border px-4 py-3 text-left shadow-sm ${
                t.is_winner
                  ? 'bg-green-50 border-green-300 active:bg-green-100'
                  : t.is_paid
                  ? 'bg-orange-50 border-orange-200 active:bg-orange-100'
                  : 'bg-white border-gray-200 active:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Lotería + hora */}
                  <p className="text-sm font-bold text-gray-900 truncate">{t.lottery_display_name}</p>
                  <p className="text-xs text-gray-500">{t.draw_time_label}</p>
                  {/* Números */}
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {(t.ticket_numbers || []).map(n => `*${n.number}* ${n.pieces}T`).join('  ')}
                  </p>
                  {/* Cliente */}
                  {t.customer_name && (
                    <p className="text-xs text-blue-400 mt-0.5">{t.customer_name}</p>
                  )}
                  {/* ID */}
                  <p className="text-[10px] text-gray-300 mt-1 font-mono">{t.ticket_number}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-none">
                  <span className="text-base font-bold text-gray-900">
                    {t.currency_symbol || '$'}{Number(t.total_amount).toFixed(2)}
                  </span>
                  {t.is_winner && (
                    <span className="text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-bold">
                      GANADOR
                    </span>
                  )}
                  {t.is_paid && !t.is_winner && (
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">
                      COBRADO
                    </span>
                  )}
                  {t.is_cancelled && (
                    <span className="text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-bold">
                      ANULADO
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Volver */}
      <a
        href="/seller"
        className="block w-full py-3 bg-gradient-to-br from-[#6c757d] to-[#495057] text-white rounded-xl font-bold uppercase tracking-wide shadow text-center active:opacity-80"
      >
        VOLVER
      </a>

      {/* Modales */}
      {showScanner && (
        <QRScannerModal
          onResult={handleQRResult}
          onClose={() => setShowScanner(false)}
        />
      )}

      {selectedTicket && (
        <TicketPreview
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onMarkPaid={handleMarkPaid}
          onCancel={handleCancel}
          onPrint={printTicket}
        />
      )}
    </div>
  );
}
