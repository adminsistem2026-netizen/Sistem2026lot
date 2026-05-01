import { useState, useCallback } from 'react';
import { db } from '../lib/insforge';
import { useAuth } from '../contexts/AuthContext';
import { generateTicketNumber, today } from '../lib/helpers';
import { isDrawTimeBlocked } from './useLotteries';

export function useTickets() {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function createTicket({ lottery, drawTime, numbers, customerName }) {
    setError('');

    // Validar horario
    const blockStatus = isDrawTimeBlocked(drawTime);
    if (blockStatus.blocked) {
      throw new Error(`Ventas bloqueadas: ${blockStatus.reason}`);
    }

    const total = numbers.reduce((s, n) => s + n.subtotal, 0);
    const adminId = profile.parent_admin_id || profile.id;

    setSaving(true);
    try {
      const ticketNumber = generateTicketNumber();

      const { data: ticket, error: ticketError } = await db
        .from('tickets')
        .insert({
          ticket_number: ticketNumber,
          seller_id: profile.id,
          admin_id: adminId,
          lottery_id: lottery.id,
          draw_time_id: drawTime.id,
          customer_name: customerName || null,
          total_amount: total,
          currency_code: lottery.currency_code,
          currency_symbol: lottery.currency_symbol,
          sale_date: today(),
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      const { error: numsError } = await db
        .from('ticket_numbers')
        .insert(numbers.map(n => ({
          ticket_id: ticket.id,
          number: n.number,
          digit_count: n.number.length,
          pieces: n.pieces,
          unit_price: n.unitPrice,
          subtotal: n.subtotal,
        })));

      if (numsError) throw numsError;

      return {
        ...ticket,
        lottery_display_name: lottery.display_name,
        draw_time_label: drawTime.time_label,
        currency_symbol: lottery.currency_symbol,
        numbers: JSON.parse(JSON.stringify(numbers)),
      };
    } finally {
      setSaving(false);
    }
  }

  const loadTodayTickets = useCallback(async (filters = {}) => {
    let query = db
      .from('tickets')
      .select('*, ticket_numbers(number, pieces, subtotal)')
      .eq('seller_id', profile.id)
      .eq('sale_date', filters.date || today())
      .eq('is_cancelled', false)
      .order('created_at', { ascending: false });

    if (filters.lottery_id) query = query.eq('lottery_id', filters.lottery_id);
    if (filters.draw_time_id) query = query.eq('draw_time_id', filters.draw_time_id);

    const { data: tickets } = await query;
    if (!tickets || tickets.length === 0) return [];

    return tickets.map(t => ({
      ...t,
      ticket_numbers: (t.ticket_numbers || []).map(n => {
        const pieces = Number(n.pieces) || 1;
        const subtotal = parseFloat(n.subtotal || 0);
        return { ...n, ticket_id: t.id, unit_price: subtotal / pieces };
      }),
    }));
  }, [profile]);

  async function markAsPaid(ticketId) {
    const { error } = await db
      .from('tickets')
      .update({ is_paid: true })
      .eq('id', ticketId);
    if (error) throw error;
  }

  async function cancelTicket(ticketId, drawTime) {
    const blockStatus = isDrawTimeBlocked(drawTime);
    if (blockStatus.blocked) {
      throw new Error(`No se puede anular: ${blockStatus.reason}`);
    }
    const { error } = await db
      .from('tickets')
      .update({ is_cancelled: true, cancelled_at: new Date().toISOString(), cancelled_by: profile.id })
      .eq('id', ticketId);
    if (error) throw error;
  }

  return { createTicket, loadTodayTickets, markAsPaid, cancelTicket, saving, error };
}
