import { useState } from 'react';
import CustomKeyboard from '../common/CustomKeyboard';

export default function SeguidillaModal({ onAdd, onClose, checkLimit, calcPrice }) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tiempos, setTiempos] = useState('');
  const [active, setActive] = useState('desde');
  const [keyboardShow, setKeyboardShow] = useState(true);
  const [error, setError] = useState('');

  const fields = { desde, hasta, tiempos };
  const setters = { desde: setDesde, hasta: setHasta, tiempos: setTiempos };
  const maxLengths = { desde: 2, hasta: 2, tiempos: 4 };
  const titles = { desde: 'DESDE (00-99)', hasta: 'HASTA (00-99)', tiempos: 'CANTIDAD DE TIEMPOS' };

  function openField(f) {
    setActive(f);
    setKeyboardShow(true);
  }

  function handleConfirmKey() {
    const order = ['desde', 'hasta', 'tiempos'];
    const idx = order.indexOf(active);
    if (idx < order.length - 1) {
      setActive(order[idx + 1]);
    } else {
      setKeyboardShow(false);
    }
  }

  function handleAdd() {
    setError('');
    const d = parseInt(desde, 10);
    const h = parseInt(hasta, 10);
    const t = parseInt(tiempos, 10);
    if (isNaN(d) || isNaN(h) || isNaN(t)) { setError('Complete todos los campos'); return; }
    if (d < 0 || d > 99 || h < 0 || h > 99) { setError('Números entre 00 y 99'); return; }
    if (d > h) { setError('"Desde" debe ser ≤ "Hasta"'); return; }
    if (t <= 0) { setError('Tiempos debe ser > 0'); return; }

    const added = [], blocked = [];
    for (let i = d; i <= h; i++) {
      const num = i.toString().padStart(2, '0');
      const lc = checkLimit(num, t);
      if (!lc.allowed) { blocked.push(num); continue; }
      const { unitPrice, subtotal } = calcPrice(num, t);
      added.push({ number: num, pieces: t, unitPrice, subtotal });
    }
    if (added.length === 0) { setError('Todos los números bloqueados por límites'); return; }
    onAdd(added, blocked);
  }

  return (
    <>
      {/* Modal backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
          {/* Header */}
          <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-700">Seguidilla</h2>
            <button onClick={onClose} className="text-gray-400 text-3xl font-bold leading-none">×</button>
          </div>

          <div className="p-4 space-y-4">
            {/* Info */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-blue-700 text-sm">
              Agrega un rango de números (00-99) con la misma cantidad de tiempos.
            </div>

            {/* Campos */}
            <div className="grid grid-cols-3 gap-2">
              {['desde', 'hasta', 'tiempos'].map(f => (
                <button
                  key={f}
                  onClick={() => openField(f)}
                  className={`border-2 rounded-xl py-3 text-center transition ${
                    active === f && keyboardShow ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <span className="block text-2xl font-mono font-bold text-gray-900">
                    {fields[f] || '—'}
                  </span>
                  <span className="block text-xs text-gray-500 mt-1 capitalize">{f}</span>
                </button>
              ))}
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            {/* Botones */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onClose}
                className="py-3 border border-gray-300 rounded-xl text-gray-600 text-sm font-semibold uppercase"
              >
                Cancelar
              </button>
              <button
                onClick={handleAdd}
                className="py-3 bg-gradient-to-br from-[#28a745] to-[#20c997] text-white rounded-xl text-sm font-bold uppercase shadow active:opacity-80"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Teclado */}
      <CustomKeyboard
        show={keyboardShow}
        value={fields[active]}
        onChange={v => setters[active](v)}
        onConfirm={handleConfirmKey}
        onClose={() => setKeyboardShow(false)}
        maxLength={maxLengths[active]}
        title={titles[active]}
      />
    </>
  );
}
