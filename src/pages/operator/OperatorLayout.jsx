import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const IcDice   = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" strokeWidth={2} stroke="currentColor" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>;
const IcTrophy = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>;
const IcLogout = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;

const NAV = [
  { to: '/operator/loterias',   label: 'Loterías',   icon: <IcDice /> },
  { to: '/operator/resultados', label: 'Resultados', icon: <IcTrophy /> },
];

export default function OperatorLayout() {
  const { profile, logout } = useAuth();
  const initials = profile?.full_name
    ?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'OP';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">

      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800/60 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-violet-500/20 flex-shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest leading-none">Operador</p>
            <p className="text-sm font-semibold text-white leading-tight mt-0.5">{profile?.full_name}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-400 transition-colors bg-slate-800 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 px-3 py-2 rounded-xl"
        >
          <IcLogout />
          Salir
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 pt-5 max-w-2xl mx-auto w-full pb-28">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="bg-slate-900/95 backdrop-blur-md border-t border-slate-800/60 sticky bottom-0 z-20">
        <div className="flex">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 flex-1 transition-colors relative ${
                  isActive ? 'text-violet-400' : 'text-slate-500 hover:text-slate-300'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-violet-500 rounded-full" />
                  )}
                  <span className={`transition-transform ${isActive ? 'scale-110' : ''}`}>{item.icon}</span>
                  <span className="text-[10px] font-medium leading-none">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
