import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../lib/insforge';
import { useAuth } from '../../contexts/AuthContext';
import { today } from '../../lib/helpers';

const IcUsers   = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const IcDice    = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" strokeWidth={2} stroke="currentColor" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>;
const IcSales   = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IcHash    = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>;
const IcShield  = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
const IcChevron = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
const IcTicket  = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>;
const IcTrash   = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const fmt = (n, sym = '$') =>
  `${sym}${Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const QUICK = [
  { to: '/admin/vendedores', icon: <IcUsers />,  label: 'Vendedores',      desc: 'Crear y gestionar vendedores',          from: 'from-blue-600',   to2: 'to-blue-800'   },
  { to: '/admin/loterias',   icon: <IcDice />,   label: 'Loterías',        desc: 'Horarios, precios y multiplicadores',   from: 'from-violet-600', to2: 'to-violet-800' },
  { to: '/admin/ventas',     icon: <IcSales />,  label: 'Ventas',          desc: 'Consultar ventas con filtros',          from: 'from-emerald-600',to2: 'to-emerald-800'},
  { to: '/admin/numeros',    icon: <IcHash />,   label: 'Números vendidos',desc: 'Cuadrícula de números por sorteo',      from: 'from-amber-600',  to2: 'to-amber-800'  },
  { to: '/admin/limites',    icon: <IcShield />, label: 'Límites',         desc: 'Configurar topes de venta por número',  from: 'from-rose-600',   to2: 'to-rose-800'   },
];

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    async function load() {
      const [{ data: tickets }, { data: sellers }] = await Promise.all([
        db.from('tickets')
          .select('total_amount, is_cancelled')
          .eq('admin_id', profile.id)
          .eq('sale_date', today()),
        db.from('profiles')
          .select('id')
          .in('role', ['seller', 'sub_admin'])
          .eq('parent_admin_id', profile.id)
          .eq('is_active', true),
      ]);
      const active  = (tickets || []).filter(t => !t.is_cancelled);
      const revenue = active.reduce((s, t) => s + parseFloat(t.total_amount || 0), 0);
      setStats({
        count:     active.length,
        cancelled: (tickets || []).length - active.length,
        revenue,
        symbol:    profile.currency_symbol || '$',
        sellers:   sellers?.length || 0,
      });
      setLoading(false);
    }
    load();
  }, [profile]);

  const dateLabel = new Date().toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="space-y-6">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-6 shadow-2xl shadow-indigo-900/40">
        {/* decorative circles */}
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-12 -left-6 w-52 h-52 rounded-full bg-white/5" />

        <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1 relative">Resumen del día</p>
        <p className="text-white/60 text-sm capitalize mb-5 relative">{dateLabel}</p>

        {loading ? (
          <div className="h-10 w-40 bg-white/10 rounded-xl animate-pulse" />
        ) : (
          <p className="text-4xl font-extrabold text-white tracking-tight relative">
            {fmt(stats?.revenue, stats?.symbol)}
          </p>
        )}
        <p className="text-indigo-200 text-sm mt-1 relative">Total recaudado hoy</p>

        <div className="flex gap-4 mt-5 relative overflow-x-auto" style={{scrollbarWidth:'none', msOverflowStyle:'none'}}>
          <div className="bg-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-2.5 shrink-0">
            <IcTicket />
            <div>
              <p className="text-xl font-bold text-white leading-none">{loading ? '—' : stats?.count ?? 0}</p>
              <p className="text-xs text-indigo-200 mt-0.5">Activos</p>
            </div>
          </div>
          <div className="bg-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-2.5 shrink-0">
            <IcUsers />
            <div>
              <p className="text-xl font-bold text-white leading-none">{loading ? '—' : stats?.sellers ?? 0}</p>
              <p className="text-xs text-indigo-200 mt-0.5">Vendedores</p>
            </div>
          </div>
          {stats?.cancelled > 0 && (
            <div className="bg-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-2.5 shrink-0">
              <IcTrash />
              <div>
                <p className="text-xl font-bold text-white leading-none">{stats.cancelled}</p>
                <p className="text-xs text-indigo-200 mt-0.5">Cancelados</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plan info */}
      {profile && (() => {
        const maxSellers = profile.max_sellers ?? 5;
        const usedSellers = stats?.sellers ?? 0;
        const pct = Math.min((usedSellers / maxSellers) * 100, 100);
        const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500';

        const exp = profile.expires_at ? new Date(profile.expires_at) : null;
        const diffDays = exp ? Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)) : null;
        const expLabel = !exp ? null : diffDays < 0 ? 'Vencido' : diffDays === 0 ? 'Vence hoy' : `Vence en ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
        const expColor = !exp ? '' : diffDays < 0 ? 'text-red-400' : diffDays <= 7 ? 'text-amber-400' : 'text-emerald-400';

        return (
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mi plan</p>

            {/* Vendedores */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm text-slate-300">Vendedores usados</span>
                <span className={`text-sm font-bold ${pct >= 100 ? 'text-red-400' : 'text-white'}`}>{usedSellers} / {maxSellers}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              {pct >= 100 && <p className="text-xs text-red-400 mt-1">Límite alcanzado — no puedes crear más vendedores</p>}
            </div>

            {/* Vencimiento */}
            {expLabel && (
              <div className="flex justify-between items-center border-t border-slate-800 pt-3">
                <span className="text-sm text-slate-300">Vencimiento</span>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${expColor}`}>{expLabel}</p>
                  <p className="text-xs text-slate-500">{exp.toLocaleDateString('es-ES')}</p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Quick actions */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Acciones rápidas</p>
        <div className="space-y-2">
          {QUICK.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl px-4 py-3.5 transition-all hover:bg-slate-800/60 group"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.from} ${item.to2} flex items-center justify-center text-white shadow-lg flex-shrink-0`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm">{item.label}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{item.desc}</p>
              </div>
              <span className="text-slate-700 group-hover:text-slate-400 transition-colors">
                <IcChevron />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
