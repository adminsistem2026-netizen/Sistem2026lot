import { useState, useEffect, useCallback } from 'react';
import { createContext, useContext } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const colors = {
    success: 'bg-gradient-to-r from-green-500 to-emerald-500 border-l-4 border-white',
    error:   'bg-gradient-to-r from-red-500 to-rose-500 border-l-4 border-white',
    warning: 'bg-gradient-to-r from-yellow-400 to-orange-400 border-l-4 border-white text-gray-900',
    info:    'bg-gradient-to-r from-blue-500 to-cyan-500 border-l-4 border-white',
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {/* Toast container — top right */}
      <div className="fixed top-5 right-4 z-[99999] flex flex-col gap-2 max-w-[320px] w-[90vw]">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`${colors[t.type] || colors.info} text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-start gap-2 animate-slide-in`}
          >
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="opacity-70 hover:opacity-100 text-lg leading-none flex-none"
            >×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
