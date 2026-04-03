import { useEffect, useState } from 'react';
import { db } from '../lib/insforge';
import { useAuth } from '../contexts/AuthContext';

export function useLotteries() {
  const { profile } = useAuth();
  const [lotteries, setLotteries] = useState([]);
  const [drawTimes, setDrawTimes] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    async function load() {
      const adminId = profile.parent_admin_id || profile.id;

      const { data } = await db
        .from('lotteries')
        .select(`*, draw_times(*)`)
        .or(`admin_id.eq.${adminId},admin_id.is.null`)
        .eq('is_active', true)
        .order('display_name');

      if (data) {
        setLotteries(data);
        const dtMap = {};
        data.forEach(lot => {
          dtMap[lot.id] = (lot.draw_times || [])
            .filter(dt => dt.is_active)
            .sort((a, b) => a.time_value.localeCompare(b.time_value));
        });
        setDrawTimes(dtMap);
      }
      setLoading(false);
    }
    load();
  }, [profile]);

  return { lotteries, drawTimes, loading };
}

/**
 * Verifica si un horario está bloqueado para ventas.
 * Bloquea: cutoff_minutes_before antes del sorteo y block_minutes_after después.
 */
export function isDrawTimeBlocked(drawTime) {
  if (!drawTime?.time_value) return { blocked: false };

  const now = new Date();
  const [h, m] = drawTime.time_value.split(':').map(Number);
  const drawMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const diff = drawMinutes - nowMinutes; // positivo = faltan X min, negativo = pasó hace X min

  const cutoff = drawTime.cutoff_minutes_before ?? 1;
  const blockAfter = drawTime.block_minutes_after ?? 20;

  if (diff >= 0 && diff <= cutoff) {
    return { blocked: true, reason: `Cierra en ${diff} min` };
  }
  if (diff < 0 && Math.abs(diff) <= blockAfter) {
    const remaining = blockAfter - Math.abs(diff);
    return { blocked: true, reason: `Bloqueado ${remaining} min más` };
  }
  return { blocked: false };
}
