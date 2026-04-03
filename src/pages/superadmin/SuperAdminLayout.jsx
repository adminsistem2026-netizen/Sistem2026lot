import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function SuperAdminLayout() {
  const { profile, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">Super Admin</p>
          <p className="text-sm font-semibold">{profile?.full_name}</p>
        </div>
        <button onClick={logout} className="text-xs text-gray-400 hover:text-red-400 transition">
          Salir
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="bg-white border-t border-gray-200 flex sticky bottom-0">
        <NavLink
          to="/superadmin"
          end
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-xs font-medium transition ${isActive ? 'text-gray-900 border-t-2 border-gray-900' : 'text-gray-400'}`
          }
        >
          Inicio
        </NavLink>
        <NavLink
          to="/superadmin/admins"
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-xs font-medium transition ${isActive ? 'text-gray-900 border-t-2 border-gray-900' : 'text-gray-400'}`
          }
        >
          Administradores
        </NavLink>
        <NavLink
          to="/superadmin/config"
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-xs font-medium transition ${isActive ? 'text-gray-900 border-t-2 border-gray-900' : 'text-gray-400'}`
          }
        >
          Configuración
        </NavLink>
      </nav>
    </div>
  );
}
