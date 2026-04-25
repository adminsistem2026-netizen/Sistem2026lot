-- Fix: agregar política RLS de UPDATE para vendedores en winning_tickets
-- Ejecutar en InsForge SQL Editor

DROP POLICY IF EXISTS winning_tickets_seller_update ON public.winning_tickets;
CREATE POLICY winning_tickets_seller_update ON public.winning_tickets
  FOR UPDATE
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());
