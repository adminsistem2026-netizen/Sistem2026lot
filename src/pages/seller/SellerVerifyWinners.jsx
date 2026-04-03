import { useState } from 'react';
import { useLotteries } from '../../hooks/useLotteries';
import { useLimits } from '../../hooks/useLimits';
import { useAuth } from '../../contexts/AuthContext';

export default function SellerVerifyWinners() {
  const { profile } = useAuth();
  const { lotteries, drawTimes } = useLotteries();
  const [filterLotteryId, setFilterLotteryId] = useState('');
  const [filterDrawTimeId, setFilterDrawTimeId] = useState('');
  const [prize1, setPrize1] = useState('');
  const [prize2, setPrize2] = useState('');
  const [prize3, setPrize3] = useState('');
  const [verified, setVerified] = useState(false);

  const { soldPieces } = useLimits(filterLotteryId || null, filterDrawTimeId || null);
  const currentDrawTimes = filterLotteryId ? (drawTimes[filterLotteryId] || []) : [];
  const selectedLottery = lotteries.find(l => l.id === filterLotteryId) || null;
  const sym = selectedLottery?.currency_symbol || '$';
  const pricePerPiece = selectedLottery?.price_2_digits || 0;
  const percentage = profile?.seller_percentage || 0;

  function pad(v) { return (v || '').replace(/\D/g, '').slice(0, 2).padStart(2, '0'); }

  const prizes = [
    { label: '1er Premio', val: prize1, set: setPrize1 },
    { label: '2do Premio', val: prize2, set: setPrize2 },
    { label: '3er Premio', val: prize3, set: setPrize3 },
  ];

  function handleVerify() {
    if (!prize1 && !prize2 && !prize3) return;
    setVerified(true);
  }

  function handleClear() {
    setPrize1(''); setPrize2(''); setPrize3('');
    setVerified(false);
  }

  // Calculate totals for winners
  const winnerData = prizes.map(p => {
    const num = pad(p.val);
    const qty = soldPieces[num] || 0;
    const value = qty * pricePerPiece;
    const sellerPays = value * (percentage / 100);
    return { label: p.label, num, qty, value, sellerPays };
  });

  const totalQty = winnerData.reduce((s, w) => s + w.qty, 0);
  const totalValue = winnerData.reduce((s, w) => s + w.value, 0);
  const totalSellerPays = winnerData.reduce((s, w) => s + w.sellerPays, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">VERIFICAR GANADORES</h2>

      {/* Filtros */}
      <div className="grid grid-cols-2 gap-2">
        <select
          value={filterLotteryId}
          onChange={e => { setFilterLotteryId(e.target.value); setFilterDrawTimeId(''); setVerified(false); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Todas las Loterías</option>
          {lotteries.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
        </select>
        <select
          value={filterDrawTimeId}
          onChange={e => { setFilterDrawTimeId(e.target.value); setVerified(false); }}
          disabled={!filterLotteryId}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100"
        >
          <option value="">Todas las Horas</option>
          {currentDrawTimes.map(dt => <option key={dt.id} value={dt.id}>{dt.time_label}</option>)}
        </select>
      </div>

      {/* Inputs de premios */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="font-bold text-gray-700 text-sm">Ingresa los Números Ganadores</h3>
        <div className="grid grid-cols-3 gap-3">
          {prizes.map(({ label, val, set }) => (
            <div key={label} className="text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <input
                type="text"
                inputMode="numeric"
                value={val}
                onChange={e => { set(e.target.value.replace(/\D/g, '').slice(0, 2)); setVerified(false); }}
                maxLength={2}
                placeholder="00"
                className="w-full border-2 border-gray-200 rounded-lg py-3 text-center text-xl font-mono font-bold focus:border-blue-400 focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleClear}
            className="py-3 bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white rounded-lg text-sm font-bold uppercase shadow active:opacity-80"
          >
            BORRAR
          </button>
          <button
            onClick={handleVerify}
            className="py-3 bg-gradient-to-br from-[#28a745] to-[#20c997] text-white rounded-lg text-sm font-bold uppercase shadow active:opacity-80"
          >
            VERIFICAR
          </button>
        </div>
      </div>

      {/* Resultados */}
      {verified && (
        <>
          <div className="space-y-2">
            {winnerData.map((w, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 border-2 ${w.qty > 0 ? 'bg-red-50 border-red-300' : 'bg-white border-gray-200'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-500">{w.label}</span>
                    <p className="text-2xl font-mono font-bold text-gray-900">{w.num}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${w.qty > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {w.qty}T
                    </p>
                    {w.qty > 0 && (
                      <p className="text-sm font-semibold text-red-500">{sym}{w.value.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Resumen total */}
          {totalQty > 0 && (
            <div className="border-2 border-red-400 rounded-lg p-4 bg-red-50">
              <h3 className="text-center font-bold text-red-700 mb-3">RESUMEN DE PAGOS</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total tiempos ganadores:</span>
                  <span className="font-bold text-gray-900">{totalQty}T</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Monto total a pagar:</span>
                  <span className="font-bold text-red-700 text-lg">{sym}{totalValue.toFixed(2)}</span>
                </div>
                {percentage > 0 && (
                  <div className="flex justify-between text-sm border-t border-red-200 pt-2">
                    <span className="text-gray-600">Tu parte ({percentage}%):</span>
                    <span className="font-bold text-red-600">{sym}{totalSellerPays.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {totalQty === 0 && (
            <div className="text-center py-6 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 font-bold text-lg">¡Sin ganadores!</p>
              <p className="text-green-600 text-sm mt-1">No hay tiempos vendidos para estos números.</p>
            </div>
          )}
        </>
      )}

      {/* Volver */}
      <a
        href="/seller"
        className="block w-full py-3 bg-gradient-to-br from-[#6c757d] to-[#495057] text-white rounded-xl font-bold uppercase tracking-wide shadow text-center active:opacity-80"
      >
        VOLVER
      </a>
    </div>
  );
}
