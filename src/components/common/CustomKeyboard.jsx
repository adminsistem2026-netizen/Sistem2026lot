/**
 * Teclado numérico que desliza desde abajo.
 * Props: show, value, onChange, onConfirm, onClose, maxLength, title
 */
export default function CustomKeyboard({ show, value, onChange, onConfirm, onClose, maxLength = 4, title = '' }) {
  function press(digit) {
    if (value.length < maxLength) onChange(value + digit);
  }
  function del() { onChange(value.slice(0, -1)); }

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-2xl z-[10000] transition-transform duration-300 select-none ${
        show ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-gray-600 text-sm">{title}</span>
        <button
          onPointerDown={e => { e.preventDefault(); onClose(); }}
          className="bg-gray-700 text-white text-xs font-bold px-4 py-1.5 rounded"
        >
          OCULTAR
        </button>
      </div>

      {/* Keys */}
      <div className="grid grid-cols-3 gap-px bg-gray-200">
        {['1','2','3','4','5','6','7','8','9'].map(k => (
          <button
            key={k}
            onPointerDown={e => { e.preventDefault(); press(k); }}
            className="bg-white py-4 text-2xl font-semibold text-gray-800 active:bg-gray-100 min-h-[54px]"
          >
            {k}
          </button>
        ))}
        {/* Bottom row: delete | 0 | ENTER */}
        <button
          onPointerDown={e => { e.preventDefault(); del(); }}
          className="bg-gray-600 py-4 text-xl font-bold text-white active:bg-gray-500 min-h-[54px] flex items-center justify-center"
        >
          ⌫
        </button>
        <button
          onPointerDown={e => { e.preventDefault(); press('0'); }}
          className="bg-white py-4 text-2xl font-semibold text-gray-800 active:bg-gray-100 min-h-[54px]"
        >
          0
        </button>
        <button
          onPointerDown={e => { e.preventDefault(); onConfirm(); }}
          className="bg-[#02235a] py-4 text-base font-bold text-white active:bg-[#011541] min-h-[54px]"
        >
          ENTER
        </button>
      </div>
    </div>
  );
}
