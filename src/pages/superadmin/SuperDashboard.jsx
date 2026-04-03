import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../lib/insforge';

export default function SuperDashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, expired: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await db
        .from('profiles')
        .select('is_active, expires_at')
        .eq('role', 'admin');

      if (data) {
        const now = new Date();
        const total = data.length;
        const expired = data.filter(a => a.expires_at && new Date(a.expires_at) < now).length;
        const active = data.filter(a => a.is_active && (!a.expires_at || new Date(a.expires_at) >= now)).length;
        setStats({ total, active, expired });
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800 mt-2">Panel Principal</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-800">{loading ? '—' : stats.total}</p>
          <p className="text-xs text-gray-400 mt-1">Total Admins</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{loading ? '—' : stats.active}</p>
          <p className="text-xs text-gray-400 mt-1">Activos</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-500">{loading ? '—' : stats.expired}</p>
          <p className="text-xs text-gray-400 mt-1">Vencidos</p>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="space-y-2">
        <Link
          to="/superadmin/admins"
          className="flex items-center justify-between bg-white rounded-xl px-4 py-4 shadow-sm hover:bg-gray-50 transition"
        >
          <div>
            <p className="font-semibold text-gray-800 text-sm">Administradores</p>
            <p className="text-xs text-gray-400">Crear, editar y gestionar admins</p>
          </div>
          <span className="text-gray-300 text-lg">›</span>
        </Link>

        <Link
          to="/superadmin/config"
          className="flex items-center justify-between bg-white rounded-xl px-4 py-4 shadow-sm hover:bg-gray-50 transition"
        >
          <div>
            <p className="font-semibold text-gray-800 text-sm">Configuración Global</p>
            <p className="text-xs text-gray-400">Monedas disponibles en el sistema</p>
          </div>
          <span className="text-gray-300 text-lg">›</span>
        </Link>
      </div>
    </div>
  );
}
