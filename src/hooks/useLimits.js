import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/insforge';
import { useAuth } from '../contexts/AuthContext';

export function useLimits(lotteryId, drawTimeId) {
  const { profile } = useAuth();
  const [limits, setLimits] = useState([]);
  const [soldPieces, setSoldPieces] = useState({});

  useEffect(() => {
    if (!lotteryId || !profile?.id) return;
    const adminId = profile.parent_admin_id || profile.id;

    async function load() {
      // Cargar límites configurados
      const { data: limitsData } = await db
        .from('sales_limits')
        .select('*')
        .eq('admin_id', adminId)
        .eq('lottery_id', lotteryId)
        .or(`seller_id.eq.${profile.id},seller_id.is.null`)
        .or(`draw_time_id.eq.${drawTimeId || '00000000-0000-0000-0000-000000000000'},draw_time_id.is.null`);

      setLimits(limitsData || []);

      // Cargar tiempos ya vendidos hoy para esta lotería/sorteo
      const { data: tickets } = await db
        .from('tickets')
        .select('ticket_numbers(number, pieces, digit_count)')
        .eq('seller_id', profile.id)
        .eq('lottery_id', lotteryId)
        .eq('draw_time_id', drawTimeId)
        .eq('is_cancelled', false)
        .eq('sale_date', new Date().toISOString().split('T')[0]);

      const pieces = {};
      (tickets || []).forEach(t => {
        (t.ticket_numbers || []).forEach(n => {
          pieces[n.number] = (pieces[n.number] || 0) + n.pieces;
        });
      });
      setSoldPieces(pieces);
    }

    load();
  }, [lotteryId, drawTimeId, profile]);

  const checkLimit = useCallback((number, pieces) => {
    const alreadySold = soldPieces[number] || 0;

    // Límite específico por número
    const specific = limits.find(l => l.number === number && l.digit_type === number.length);
    if (specific) {
      if (alreadySold + pieces > specific.max_pieces) {
        return {
          allowed: false,
          msg: `Límite: ${number} solo permite ${specific.max_pieces}T (vendidos: ${alreadySold})`,
        };
      }
    }

    // Límite global
    const global = limits.find(l => l.is_global && l.digit_type === number.length);
    if (global) {
      if (alreadySold + pieces > global.max_pieces) {
        return {
          allowed: false,
          msg: `Límite global: máx ${global.max_pieces}T por número (vendidos: ${alreadySold})`,
        };
      }
    }

    return { allowed: true };
  }, [limits, soldPieces]);

  function addSold(number, pieces) {
    setSoldPieces(prev => ({ ...prev, [number]: (prev[number] || 0) + pieces }));
  }

  return { checkLimit, addSold, soldPieces };
}
