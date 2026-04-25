import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const NAV = [
  { to: '/seller', label: 'Vender', end: true },
  { to: '/seller/ventas', label: 'Mis Ventas' },
  { to: '/seller/numeros', label: 'Números' },
  { to: '/seller/premios', label: 'Premios' },
];

export default function SellerLayout() {
  const { profile, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">Vendedor</p>
          <p className="text-sm font-semibold">{profile?.full_name}</p>
        </div>
        <button onClick={logout} className="text-xs text-gray-400 active:text-red-400 transition">
          Salir
        </button>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full pb-20">
        <Outlet />
      </main>

      <nav className="bg-white border-t border-gray-200 flex sticky bottom-0 z-40">
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-xs font-medium transition ${isActive ? 'text-gray-900 border-t-2 border-gray-900' : 'text-gray-400'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
