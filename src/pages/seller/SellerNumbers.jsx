import { useState } from 'react';
import { useLotteries } from '../../hooks/useLotteries';
import { useLimits } from '../../hooks/useLimits';
import { useAuth } from '../../contexts/AuthContext';

export default function SellerNumbers() {
  const { profile } = useAuth();
  const { lotteries, drawTimes } = useLotteries();
  const [tab, setTab] = useState('chances'); // 'chances' | 'billetes'
  const [filterLotteryId, setFilterLotteryId] = useState('');
  const [filterDrawTimeId, setFilterDrawTimeId] = useState('');
  const [prize1, setPrize1] = useState('');
  const [prize2, setPrize2] = useState('');
  const [prize3, setPrize3] = useState('');
  const [winners, setWinners] = useState(null);

  const { soldPieces } = useLimits(filterLotteryId || null, filterDrawTimeId || null);

  const currentDrawTimes = filterLotteryId ? (drawTimes[filterLotteryId] || []) : [];
  const selectedLottery = lotteries.find(l => l.id === filterLotteryId) || null;
  const sym = selectedLottery?.currency_symbol || '$';
  const percentage = profile?.seller_percentage || 0;

  // Numbers grid 00-99
  const numbers2d = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));

  // Summary stats
  const totalQty = Object.values(soldPieces).reduce((s, v) => s + v, 0);
  const pricePerPiece = selectedLottery?.price_2_digits || 0;
  const totalValue = totalQty * pricePerPiece;
  const sellerValue = totalValue * (percentage / 100);
  const adminValue = totalValue * ((100 - percentage) / 100);

  // Only sold 4-digit numbers for "billetes" tab
  const soldBilletes = Object.entries(soldPieces)
    .filter(([num, qty]) => num.length === 4 && qty > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  function verifyWinners() {
    if (!prize1 && !prize2 && !prize3) return;
    setWinners(true);
  }

  function clearWinners() {
    setPrize1(''); setPrize2(''); setPrize3(''); setWinners(null);
  }

  function pad(v) { return (v || '').replace(/\D/g, '').slice(0, 2).padStart(2, '0'); }

  function shareWhatsapp() {
    const lines = [
      `TIEMPOS VENDIDOS — ${selectedLottery?.display_name || 'Todas'}`,
      `---`,
      ...numbers2d.filter(n => (soldPieces[n] || 0) > 0).map(n => `${n}: ${soldPieces[n]}T`),
      `---`,
      `TOTAL: ${totalQty}T = ${sym}${totalValue.toFixed(2)}`,
    ];
    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  function shareCSV() {
    const rows = ['Numero,Tiempos,Subtotal'];
    numbers2d.forEach(n => {
      const qty = soldPieces[n] || 0;
      if (qty > 0) rows.push(`${n},${qty},${(qty * pricePerPiece).toFixed(2)}`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tiempos-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold text-gray-900">TIEMPOS Y BILLETES VENDIDOS</h2>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
        {['chances', 'billetes'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-md text-sm font-bold uppercase transition ${
              tab === t ? 'bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white shadow' : 'text-gray-500'
            }`}
          >
            {t === 'chances' ? 'CHANCES' : 'BILLETES'}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-2 gap-2">
        <select
          value={filterLotteryId}
          onChange={e => { setFilterLotteryId(e.target.value); setFilterDrawTimeId(''); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Todas las Lot</option>
          {lotteries.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
        </select>
        <select
          value={filterDrawTimeId}
          onChange={e => setFilterDrawTimeId(e.target.value)}
          disabled={!filterLotteryId}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100"
        >
          <option value="">Todas las Ho</option>
          {currentDrawTimes.map(dt => <option key={dt.id} value={dt.id}>{dt.time_label}</option>)}
        </select>
      </div>

      {/* Resumen */}
      <div className="border-2 border-blue-400 rounded-lg p-3">
        <h3 className="text-center font-bold text-blue-600 mb-2">
          Resumen de {tab === 'chances' ? 'Chances' : 'Billetes'}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalQty}</p>
            <p className="text-xs text-gray-500 mt-1">Cantidad</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
            <p className="text-2xl font-bold text-green-600">{sym}{totalValue.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">Valor</p>
          </div>
          <div className="bg-white border border-green-300 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-green-600">{sym}{sellerValue.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">Vendedor ({percentage}%)</p>
          </div>
          <div className="bg-white border border-blue-300 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-blue-600">{sym}{adminValue.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">Admin ({100 - percentage}%)</p>
          </div>
        </div>
      </div>

      {/* Números Ganadores */}
      <div className="border border-gray-200 rounded-lg p-3">
        <h3 className="font-bold text-gray-700 mb-2 text-sm">Números Ganadores</h3>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[
            { label: '1er Premio', val: prize1, set: setPrize1 },
            { label: '2do Premio', val: prize2, set: setPrize2 },
            { label: '3er Premio', val: prize3, set: setPrize3 },
          ].map(({ label, val, set }) => (
            <div key={label} className="text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <input
                type="text"
                inputMode="numeric"
                value={val}
                onChange={e => { set(e.target.value.replace(/\D/g, '').slice(0, 2)); setWinners(null); }}
                maxLength={2}
                placeholder="00"
                className="w-full border-2 border-gray-200 rounded-lg py-2 text-center text-lg font-mono font-bold focus:border-blue-400 focus:outline-none"
              />
              {winners && (
                <p className="text-xs mt-1 font-bold text-red-600">
                  {soldPieces[pad(val)] || 0}T
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={clearWinners}
            className="py-2 bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white rounded-lg text-sm font-bold uppercase shadow active:opacity-80"
          >
            BORRAR CF
          </button>
          <button
            onClick={verifyWinners}
            className="py-2 bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white rounded-lg text-sm font-bold uppercase shadow active:opacity-80"
          >
            VERIFICAR
          </button>
        </div>
      </div>

      {/* Compartir WhatsApp */}
      <button
        onClick={shareWhatsapp}
        className="w-full py-3 bg-gradient-to-br from-[#25D366] to-[#128C7E] text-white rounded-xl font-bold uppercase tracking-wide shadow active:opacity-80"
      >
        COMPARTIR POR WHATSAPP
      </button>

      {/* Grid 00-99 (CHANCES) */}
      {tab === 'chances' && (
        <div className="border border-gray-300 bg-gray-300 grid grid-cols-5 gap-px">
          {numbers2d.map(num => {
            const sold = soldPieces[num] || 0;
            const isWinner = winners && [prize1, prize2, prize3].map(p => pad(p)).includes(num);
            return (
              <div
                key={num}
                className={`flex justify-between items-center px-2 py-2 text-sm ${
                  isWinner ? 'bg-blue-200' : sold > 0 ? 'bg-red-50' : 'bg-white'
                }`}
              >
                <span className={`font-bold ${sold > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{num}</span>
                <span className={`font-bold text-sm ${sold > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                  {sold > 0 ? sold : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* BILLETES tab — solo muestra números de 4 dígitos vendidos */}
      {tab === 'billetes' && (
        soldBilletes.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm border border-gray-200 rounded-lg">
            No hay billetes vendidos
          </div>
        ) : (
          <div className="border border-gray-300 bg-gray-300 grid grid-cols-2 gap-px">
            {soldBilletes.map(([num, qty]) => {
              const isWinner = winners && [prize1, prize2, prize3].map(p => pad(p)).includes(num.slice(-2));
              return (
                <div
                  key={num}
                  className={`flex justify-between items-center px-3 py-2 text-sm ${
                    isWinner ? 'bg-blue-200' : 'bg-white'
                  }`}
                >
                  <span className="font-mono font-bold text-gray-900">{num}</span>
                  <span className="font-bold text-red-600">{qty}T</span>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* CSV + Volver */}
      <button
        onClick={shareCSV}
        className="w-full py-3 bg-gradient-to-br from-[#8e9eab] to-[#6c7b7f] text-white rounded-xl font-bold uppercase tracking-wide shadow active:opacity-80"
      >
        COMPARTIR CSV
      </button>
      <a
        href="/seller"
        className="block w-full py-3 bg-gradient-to-br from-[#6c757d] to-[#495057] text-white rounded-xl font-bold uppercase tracking-wide shadow text-center active:opacity-80"
      >
        VOLVER
      </a>
    </div>
  );
}
