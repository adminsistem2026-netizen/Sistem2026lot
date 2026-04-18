import { useState, useEffect } from 'react';
import { useLotteries, isDrawTimeBlocked, isDrawTimePast } from '../../hooks/useLotteries';
import { useTickets } from '../../hooks/useTickets';
import { useLimits } from '../../hooks/useLimits';
import { calculatePrice } from '../../lib/priceCalculator';
import { isValidLotteryNumber, parseQuickInput } from '../../lib/helpers';
import { usePrinter } from '../../contexts/PrinterContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/common/Toast';
import CustomKeyboard from '../../components/common/CustomKeyboard';
import SeguidillaModal from '../../components/ticket/SeguidillaModal';
import TicketPreview from '../../components/ticket/TicketPreview';

function useDateTime() {
  const [dt, setDt] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setDt(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return dt;
}

export default function SellerDashboard() {
  const { logout } = useAuth();
  const { lotteries, drawTimes, loading } = useLotteries();
  const { createTicket, markAsPaid, cancelTicket, saving } = useTickets();
  const { printTicket } = usePrinter();
  const showToast = useToast();
  const dt = useDateTime();

  const [selectedLotteryId, setSelectedLotteryId] = useState('');
  const [selectedDrawTimeId, setSelectedDrawTimeId] = useState('');
  const { checkLimit, addSold } = useLimits(selectedLotteryId || null, selectedDrawTimeId || null);

  const [numbers, setNumbers] = useState([]);
  const [inputNumber, setInputNumber] = useState('');
  const [inputPieces, setInputPieces] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [quickInput, setQuickInput] = useState('');

  const [keyboardShow, setKeyboardShow] = useState(false);
  const [keyboardField, setKeyboardField] = useState('number');
  const [menuOpen, setMenuOpen] = useState(false);

  const [showSeguidilla, setShowSeguidilla] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lastTicket, setLastTicket] = useState(null);

  // Edit row state
  const [editingIdx, setEditingIdx] = useState(null);
  const [editPieces, setEditPieces] = useState('');

  const selectedLottery = lotteries.find(l => l.id === selectedLotteryId) || null;
  const selectedDrawTime = (drawTimes[selectedLotteryId] || []).find(d => d.id === selectedDrawTimeId) || null;
  const currentDrawTimes = selectedLotteryId ? (drawTimes[selectedLotteryId] || []) : [];
  const visibleDrawTimes = currentDrawTimes.filter(d => !isDrawTimePast(d));

  // Auto-limpiar sorteo seleccionado si ya pasó su hora
  useEffect(() => {
    if (selectedDrawTime && isDrawTimePast(selectedDrawTime)) {
      setSelectedDrawTimeId('');
    }
  }, [dt]);

  const dateStr = dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = dt.toLocaleTimeString('es-ES');

  function openKeyboard(field) {
    setKeyboardField(field);
    setKeyboardShow(true);
    setMenuOpen(false);
    setEditingIdx(null);
  }

  const keyboardValue = keyboardField === 'number' ? inputNumber : inputPieces;
  const keyboardTitle = keyboardField === 'number' ? 'Ingresa el número' : 'Ingresa los tiempos';

  function handleKeyboardChange(v) {
    if (keyboardField === 'number') setInputNumber(v);
    else setInputPieces(v);
  }

  function handleKeyboardConfirm() {
    if (keyboardField === 'number') {
      if (isValidLotteryNumber(inputNumber)) {
        setKeyboardField('pieces');
      }
    } else {
      setKeyboardShow(false);
      addNumberAction();
    }
  }

  function calcPrice(number, pieces) {
    return calculatePrice(selectedLottery, selectedDrawTime, number, pieces);
  }

  function addNumberAction() {
    if (!selectedLottery || !selectedDrawTime) { showToast('Selecciona lotería y sorteo', 'error'); return; }
    if (!isValidLotteryNumber(inputNumber)) { showToast('Número inválido (2 o 4 dígitos)', 'error'); return; }
    const p = parseInt(inputPieces, 10);
    if (!p || p <= 0) { showToast('Tiempos inválidos', 'error'); return; }
    const limitCheck = checkLimit(inputNumber, p);
    if (!limitCheck.allowed) { showToast(limitCheck.msg, 'error'); return; }
    const { unitPrice, subtotal } = calcPrice(inputNumber, p);
    setNumbers(prev => [...prev, { number: inputNumber, pieces: p, unitPrice, subtotal }]);
    setInputNumber('');
    setInputPieces('');
  }

  function removeNumber(idx) {
    setNumbers(prev => prev.filter((_, i) => i !== idx));
  }

  function startEditRow(idx) {
    setEditingIdx(idx);
    setEditPieces(numbers[idx].pieces.toString());
    setKeyboardShow(false);
  }

  function confirmEditRow() {
    const p = parseInt(editPieces, 10);
    if (!p || p <= 0) { showToast('Tiempos inválidos', 'error'); setEditingIdx(null); return; }
    const num = numbers[editingIdx];
    const limitCheck = checkLimit(num.number, p);
    if (!limitCheck.allowed) { showToast(limitCheck.msg, 'error'); setEditingIdx(null); return; }
    const { unitPrice, subtotal } = calcPrice(num.number, p);
    setNumbers(prev => prev.map((n, i) => i === editingIdx ? { ...n, pieces: p, unitPrice, subtotal } : n));
    setEditingIdx(null);
    setEditPieces('');
  }

  function handleQuickAdd() {
    if (!selectedLottery || !selectedDrawTime) { showToast('Selecciona lotería y sorteo', 'error'); return; }
    const parsed = parseQuickInput(quickInput);
    if (parsed.length === 0) { showToast('Formato: "39,9 45,2 ..."', 'error'); return; }
    const added = [], blocked = [];
    for (const { number, pieces } of parsed) {
      const lc = checkLimit(number, pieces);
      if (!lc.allowed) { blocked.push(`${number}: ${lc.msg}`); continue; }
      const { unitPrice, subtotal } = calcPrice(number, pieces);
      added.push({ number, pieces, unitPrice, subtotal });
    }
    if (added.length > 0) setNumbers(prev => [...prev, ...added]);
    if (blocked.length > 0) showToast(`Bloqueados: ${blocked.join(', ')}`, 'warning');
    setQuickInput('');
  }

  function handleSeguidillaAdd(added, blocked) {
    setNumbers(prev => [...prev, ...added]);
    if (blocked.length > 0) showToast(`Bloqueados: ${blocked.join(', ')}`, 'warning');
    setShowSeguidilla(false);
  }

  async function handleGenerate() {
    if (!selectedLottery || !selectedDrawTime) { showToast('Selecciona lotería y sorteo', 'error'); return; }
    if (numbers.length === 0) { showToast('Agrega al menos un número', 'error'); return; }
    const blockStatus = isDrawTimeBlocked(selectedDrawTime);
    if (blockStatus.blocked) { showToast(`Bloqueado: ${blockStatus.reason}`, 'error'); return; }
    try {
      const ticket = await createTicket({ lottery: selectedLottery, drawTime: selectedDrawTime, numbers, customerName });
      numbers.forEach(n => addSold(n.number, n.pieces));
      setLastTicket(ticket);
      setShowPreview(true);
      setNumbers([]);
      setCustomerName('');
      // Keep lottery and draw time selected
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function handleMarkPaid(ticket) {
    try {
      await markAsPaid(ticket.id);
      setLastTicket(prev => ({ ...prev, is_paid: true }));
      showToast('Ticket marcado como cobrado', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function handleCancel(ticket) {
    try {
      await cancelTicket(ticket.id, selectedDrawTime);
      setLastTicket(prev => ({ ...prev, is_cancelled: true }));
      showToast('Ticket anulado', 'warning');
    } catch (e) { showToast(e.message, 'error'); }
  }

  const total = numbers.reduce((s, n) => s + n.subtotal, 0);
  const sym = selectedLottery?.currency_symbol || '$';

  if (loading) return <p className="text-center text-gray-400 py-10">Cargando...</p>;

  return (
    <div className={keyboardShow ? 'pb-52' : ''}>
      {/* Tarjeta principal */}
      <div className="border border-gray-300 rounded-lg p-4 bg-white">

        {/* Fila superior: fecha/hora + hamburguesa */}
        <div className="flex justify-between items-center mb-4 relative">
          <span className="text-base text-gray-700">{dateStr}, {timeStr}</span>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="w-12 h-10 bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] rounded-lg flex flex-col items-center justify-center gap-1.5 shadow"
            >
              <span className="block w-5 h-0.5 bg-white rounded" />
              <span className="block w-5 h-0.5 bg-white rounded" />
              <span className="block w-5 h-0.5 bg-white rounded" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 bg-white border border-gray-200 rounded-xl shadow-xl z-50 min-w-[200px]">
                {[
                  { label: '💰 Ver Ventas', path: '/seller/ventas' },
                  { label: '📊 Tiempos Vendidos', path: '/seller/numeros' },
                  { label: '🏆 Verificar Ganadores', path: '/seller/ganadores' },
                ].map(item => (
                  <a
                    key={item.path}
                    href={item.path}
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-xl border-b border-gray-100"
                  >
                    {item.label}
                  </a>
                ))}
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 rounded-b-xl"
                >
                  🚪 Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Nombre del cliente */}
        <div className="mb-3">
          <input
            type="text"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Nombre del Cliente"
            onFocus={() => setKeyboardShow(false)}
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base bg-white"
          />
        </div>

        {/* Lotería + Sorteo */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select
            value={selectedLotteryId}
            onChange={e => {
              setSelectedLotteryId(e.target.value);
              setSelectedDrawTimeId('');
              setNumbers([]);
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base bg-white"
          >
            <option value="">Elegir loteria</option>
            {lotteries.map(lot => (
              <option key={lot.id} value={lot.id}>{lot.display_name}</option>
            ))}
          </select>

          <select
            value={selectedDrawTimeId}
            onChange={e => {
              const found = visibleDrawTimes.find(d => d.id === e.target.value);
              if (found) {
                const st = isDrawTimeBlocked(found);
                if (st.blocked) { showToast(`Bloqueado: ${st.reason}`, 'error'); return; }
              }
              setSelectedDrawTimeId(e.target.value);
              setNumbers([]);
            }}
            disabled={!selectedLotteryId}
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base bg-white disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="">Hora de sort</option>
            {visibleDrawTimes.map(d => {
              const st = isDrawTimeBlocked(d);
              return (
                <option key={d.id} value={d.id} disabled={st.blocked}>
                  {d.time_label}{st.blocked ? ` (${st.reason})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Número + Tiempos */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input
            type="text"
            value={inputNumber}
            readOnly
            placeholder="NUMERO"
            onClick={() => openKeyboard('number')}
            className={`w-full border-2 rounded-lg px-3 py-3 text-base bg-white cursor-pointer font-bold uppercase placeholder:font-normal placeholder:text-gray-400 ${
              keyboardShow && keyboardField === 'number'
                ? 'border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.25)]'
                : 'border-gray-300'
            }`}
          />
          <input
            type="text"
            value={inputPieces}
            readOnly
            placeholder="TIEMPOS"
            onClick={() => openKeyboard('pieces')}
            className={`w-full border-2 rounded-lg px-3 py-3 text-base bg-white cursor-pointer font-bold uppercase placeholder:font-normal placeholder:text-gray-400 ${
              keyboardShow && keyboardField === 'pieces'
                ? 'border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.25)]'
                : 'border-gray-300'
            }`}
          />
        </div>

        {/* Entrada Rápida */}
        <div className="mb-3">
          <label className="block text-sm font-bold mb-1 text-gray-800">Entrada Rápida:</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={quickInput}
              onChange={e => setQuickInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
              onFocus={() => setKeyboardShow(false)}
              placeholder="Ej: 39,9 o 45,2 o 12,5"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-3 text-base"
            />
            <button
              onClick={handleQuickAdd}
              className="px-4 py-3 bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white rounded-lg font-bold text-sm uppercase tracking-wide shadow active:opacity-80"
            >
              PROCESAR
            </button>
          </div>
        </div>

        {/* Tabla de números */}
        <div className="mb-2 border-t border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-bold text-gray-800 text-sm">NUMERO</th>
                <th className="text-left py-2 font-bold text-gray-800 text-sm">CANT</th>
                <th className="text-left py-2 font-bold text-gray-800 text-sm">SUB TOTAL</th>
                <th className="py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((n, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 font-mono font-bold text-base">{n.number}</td>
                  <td className="py-2 text-gray-700">
                    {editingIdx === i ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={editPieces}
                          onChange={e => setEditPieces(e.target.value)}
                          onFocus={() => setKeyboardShow(false)}
                          className="w-14 border border-blue-400 rounded px-1 py-0.5 text-sm font-bold text-center"
                          autoFocus
                        />
                        <button onClick={confirmEditRow} className="text-green-600 font-bold text-sm px-1">✓</button>
                        <button onClick={() => setEditingIdx(null)} className="text-gray-400 text-sm px-1">✕</button>
                      </div>
                    ) : (
                      n.pieces
                    )}
                  </td>
                  <td className="py-2 font-semibold text-gray-700">{sym}{Number(n.subtotal).toFixed(2)}</td>
                  <td className="py-2">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => startEditRow(i)}
                        className="text-blue-400 font-bold text-base leading-none px-1 active:text-blue-600"
                        title="Editar"
                      >✎</button>
                      <button
                        onClick={() => removeNumber(i)}
                        className="text-red-500 font-bold text-xl leading-none px-1 active:text-red-700"
                      >×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="text-center text-xl font-bold text-gray-900 my-3">
          VALOR DE TICKET: {total.toFixed(2)}{sym}
        </div>

        {/* Generar + Seguidilla */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={saving}
            className="flex-1 py-3 bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white rounded-xl font-bold text-base uppercase tracking-wide shadow-md active:opacity-80 disabled:opacity-50"
          >
            {saving ? 'GENERANDO...' : 'GENERAR TICKET'}
          </button>
          <button
            onClick={() => { setShowSeguidilla(true); setKeyboardShow(false); }}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-xl flex items-center justify-center shadow-md active:opacity-80 flex-none"
          >
            ✏️
          </button>
        </div>

      </div>{/* fin tarjeta */}

      {/* Teclado */}
      <CustomKeyboard
        show={keyboardShow}
        value={keyboardValue}
        onChange={handleKeyboardChange}
        onConfirm={handleKeyboardConfirm}
        onClose={() => setKeyboardShow(false)}
        maxLength={4}
        title={keyboardTitle}
      />

      {/* Modal Seguidilla */}
      {showSeguidilla && selectedLottery && selectedDrawTime && (
        <SeguidillaModal
          onAdd={handleSeguidillaAdd}
          onClose={() => setShowSeguidilla(false)}
          checkLimit={checkLimit}
          calcPrice={(num, pieces) => calcPrice(num, pieces)}
          lottery={selectedLottery}
          drawTime={selectedDrawTime}
        />
      )}

      {/* Preview ticket */}
      {showPreview && lastTicket && (
        <TicketPreview
          ticket={lastTicket}
          onClose={() => setShowPreview(false)}
          onMarkPaid={handleMarkPaid}
          onCancel={handleCancel}
          onPrint={printTicket}
        />
      )}
    </div>
  );
}
