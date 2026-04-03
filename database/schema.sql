-- ============================================================
-- SISTEMA DE LOTERÍA MULTI-USUARIO
-- Ejecutar en InsForge SQL Editor
-- Orden: tablas → índices → RLS → seeds
-- ============================================================


-- ============================================================
-- TABLAS
-- ============================================================

-- profiles (debe crearse antes que las demás por las FK)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'seller')),
  parent_admin_id UUID REFERENCES public.profiles(id),
  seller_percentage DECIMAL(5,2) DEFAULT 13.00,
  is_active BOOLEAN DEFAULT true,
  phone TEXT,
  currency_code TEXT DEFAULT 'USD',
  currency_symbol TEXT DEFAULT '$',
  printer_name TEXT,
  printer_id TEXT,
  printer_paper_width INTEGER DEFAULT 58,
  auto_print_on_sale BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- system_config
CREATE TABLE public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- lotteries
CREATE TABLE public.lotteries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  lottery_type TEXT NOT NULL CHECK (lottery_type IN ('regular', 'reventado')),
  base_lottery_id UUID REFERENCES public.lotteries(id),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  admin_id UUID REFERENCES public.profiles(id),
  currency_code TEXT DEFAULT 'USD',
  currency_symbol TEXT DEFAULT '$',
  price_2_digits DECIMAL(10,2) DEFAULT 0.20,
  price_4_digits DECIMAL(10,2) DEFAULT 1.00,
  prize_1st_multiplier DECIMAL(10,2) DEFAULT 11.00,
  prize_2nd_multiplier DECIMAL(10,2) DEFAULT 3.00,
  prize_3rd_multiplier DECIMAL(10,2) DEFAULT 2.00,
  reventado_price_2_digits DECIMAL(10,2) DEFAULT 0.20,
  reventado_price_4_digits DECIMAL(10,2) DEFAULT 1.00,
  reventado_payout_per_block DECIMAL(10,2) DEFAULT 90.00,
  reventado_block_size INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- draw_times
CREATE TABLE public.draw_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lottery_id UUID NOT NULL REFERENCES public.lotteries(id) ON DELETE CASCADE,
  time_label TEXT NOT NULL,
  time_value TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  cutoff_minutes_before INTEGER DEFAULT 1,
  block_minutes_after INTEGER DEFAULT 20,
  custom_price_2_digits DECIMAL(10,2),
  custom_price_4_digits DECIMAL(10,2),
  custom_prize_1st_multiplier DECIMAL(10,2),
  custom_prize_2nd_multiplier DECIMAL(10,2),
  custom_prize_3rd_multiplier DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id),
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  lottery_id UUID NOT NULL REFERENCES public.lotteries(id),
  draw_time_id UUID NOT NULL REFERENCES public.draw_times(id),
  customer_name TEXT,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  is_paid BOOLEAN DEFAULT false,
  is_cancelled BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id),
  was_printed BOOLEAN DEFAULT false,
  print_count INTEGER DEFAULT 0,
  last_printed_at TIMESTAMPTZ,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ticket_numbers
CREATE TABLE public.ticket_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  digit_count INTEGER NOT NULL CHECK (digit_count IN (2, 4)),
  pieces INTEGER NOT NULL CHECK (pieces > 0),
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- sales_limits
CREATE TABLE public.sales_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id),
  lottery_id UUID NOT NULL REFERENCES public.lotteries(id),
  draw_time_id UUID REFERENCES public.draw_times(id),
  seller_id UUID REFERENCES public.profiles(id),
  number TEXT,
  digit_type INTEGER CHECK (digit_type IN (2, 4)),
  max_pieces INTEGER NOT NULL CHECK (max_pieces >= 0),
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id, lottery_id, draw_time_id, seller_id, number, digit_type, is_global)
);

-- winning_numbers
CREATE TABLE public.winning_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lottery_id UUID NOT NULL REFERENCES public.lotteries(id),
  draw_time_id UUID NOT NULL REFERENCES public.draw_times(id),
  draw_date DATE NOT NULL,
  first_prize TEXT,
  second_prize TEXT,
  third_prize TEXT,
  registered_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lottery_id, draw_time_id, draw_date)
);


-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_parent_admin ON public.profiles(parent_admin_id);
CREATE INDEX idx_profiles_active ON public.profiles(is_active);

CREATE INDEX idx_draw_times_lottery ON public.draw_times(lottery_id);

CREATE INDEX idx_tickets_seller ON public.tickets(seller_id);
CREATE INDEX idx_tickets_admin ON public.tickets(admin_id);
CREATE INDEX idx_tickets_date ON public.tickets(sale_date);
CREATE INDEX idx_tickets_lottery ON public.tickets(lottery_id);
CREATE INDEX idx_tickets_draw_time ON public.tickets(draw_time_id);

CREATE INDEX idx_ticket_numbers_ticket ON public.ticket_numbers(ticket_id);
CREATE INDEX idx_ticket_numbers_number ON public.ticket_numbers(number);

CREATE INDEX idx_sales_limits_admin ON public.sales_limits(admin_id);
CREATE INDEX idx_sales_limits_lottery ON public.sales_limits(lottery_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotteries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winning_numbers ENABLE ROW LEVEL SECURITY;

-- system_config: todos leen, solo super_admin edita
CREATE POLICY "system_config_select" ON public.system_config
  FOR SELECT USING (true);

CREATE POLICY "system_config_update" ON public.system_config
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- profiles
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR
    parent_admin_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid() OR
    parent_admin_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- lotteries
CREATE POLICY "lotteries_select" ON public.lotteries
  FOR SELECT USING (
    admin_id IS NULL OR
    admin_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin') OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND parent_admin_id = lotteries.admin_id)
  );

CREATE POLICY "lotteries_insert" ON public.lotteries
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "lotteries_update" ON public.lotteries
  FOR UPDATE USING (
    admin_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- draw_times
CREATE POLICY "draw_times_select" ON public.draw_times
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.lotteries l WHERE l.id = lottery_id AND (
        l.admin_id IS NULL OR
        l.admin_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin') OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND parent_admin_id = l.admin_id)
      )
    )
  );

CREATE POLICY "draw_times_insert" ON public.draw_times
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "draw_times_update" ON public.draw_times
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

-- tickets
CREATE POLICY "tickets_select" ON public.tickets
  FOR SELECT USING (
    seller_id = auth.uid() OR
    admin_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "tickets_insert" ON public.tickets
  FOR INSERT WITH CHECK (
    seller_id = auth.uid()
  );

CREATE POLICY "tickets_update" ON public.tickets
  FOR UPDATE USING (
    seller_id = auth.uid() OR
    admin_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ticket_numbers
CREATE POLICY "ticket_numbers_select" ON public.ticket_numbers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id AND (
        t.seller_id = auth.uid() OR
        t.admin_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
      )
    )
  );

CREATE POLICY "ticket_numbers_insert" ON public.ticket_numbers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id AND t.seller_id = auth.uid()
    )
  );

-- sales_limits
CREATE POLICY "sales_limits_all" ON public.sales_limits
  FOR ALL USING (
    admin_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- winning_numbers
CREATE POLICY "winning_numbers_select" ON public.winning_numbers
  FOR SELECT USING (true);

CREATE POLICY "winning_numbers_insert" ON public.winning_numbers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
  );


-- ============================================================
-- TRIGGER: actualizar updated_at en profiles
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================================
-- TRIGGER: crear perfil automáticamente al registrar usuario
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'seller')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SEEDS: configuración del sistema
-- ============================================================

INSERT INTO public.system_config (config_key, config_value) VALUES
  ('default_currency', '{"code": "USD", "symbol": "$", "name": "Dólar Americano", "decimal_places": 2}'),
  ('available_currencies', '[
    {"code": "USD", "symbol": "$", "name": "Dólar Americano", "decimal_places": 2},
    {"code": "PAB", "symbol": "B/.", "name": "Balboa Panameño", "decimal_places": 2},
    {"code": "NIO", "symbol": "C$", "name": "Córdoba Nicaragüense", "decimal_places": 2},
    {"code": "CRC", "symbol": "₡", "name": "Colón Costarricense", "decimal_places": 0},
    {"code": "HNL", "symbol": "L", "name": "Lempira Hondureño", "decimal_places": 2}
  ]');


-- ============================================================
-- SEEDS: loterías regulares (globales, admin_id = NULL)
-- ============================================================

INSERT INTO public.lotteries (name, display_name, lottery_type, currency_code, currency_symbol, price_2_digits, price_4_digits, prize_1st_multiplier, prize_2nd_multiplier, prize_3rd_multiplier) VALUES
  ('PANAMA',    'LOTERIA PANAMA', 'regular', 'USD', '$', 0.20, 1.00, 11.00, 3.00, 2.00),
  ('NICA',      'NICA',           'regular', 'USD', '$', 0.20, 1.00, 11.00, 3.00, 2.00),
  ('MONAZO',    'MONAZO',         'regular', 'USD', '$', 0.20, 1.00, 11.00, 3.00, 2.00),
  ('LAPRIMERA', 'LA PRIMERA',     'regular', 'USD', '$', 0.20, 1.00, 11.00, 3.00, 2.00),
  ('TICA',      'TICA',           'regular', 'USD', '$', 0.20, 1.00, 11.00, 3.00, 2.00),
  ('NEWYORK',   'NEW YORK',       'regular', 'USD', '$', 0.20, 1.00, 11.00, 3.00, 2.00),
  ('HONDURAS',  'HONDURAS',       'regular', 'USD', '$', 0.20, 1.00, 11.00, 3.00, 2.00);


-- ============================================================
-- SEEDS: horarios de sorteo
-- ============================================================

-- PANAMA
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '3:00 PM', '15:00:00' FROM public.lotteries WHERE name = 'PANAMA';

-- NICA
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '1:00 PM',  '13:00:00' FROM public.lotteries WHERE name = 'NICA';
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '4:00 PM',  '16:00:00' FROM public.lotteries WHERE name = 'NICA';
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '7:00 PM',  '19:00:00' FROM public.lotteries WHERE name = 'NICA';
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '10:00 PM', '22:00:00' FROM public.lotteries WHERE name = 'NICA';

-- MONAZO
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '1:55 PM', '13:55:00' FROM public.lotteries WHERE name = 'MONAZO';
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '5:30 PM', '17:30:00' FROM public.lotteries WHERE name = 'MONAZO';
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '8:30 PM', '20:30:00' FROM public.lotteries WHERE name = 'MONAZO';

-- LA PRIMERA
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '11:00 AM', '11:00:00' FROM public.lotteries WHERE name = 'LAPRIMERA';
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '6:00 PM',  '18:00:00' FROM public.lotteries WHERE name = 'LAPRIMERA';

-- TICA
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '8:30 PM', '20:30:00' FROM public.lotteries WHERE name = 'TICA';

-- NEW YORK
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '2:25 PM',  '14:25:00' FROM public.lotteries WHERE name = 'NEWYORK';
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '10:25 PM', '22:25:00' FROM public.lotteries WHERE name = 'NEWYORK';

-- HONDURAS
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '11:58 AM', '11:58:00' FROM public.lotteries WHERE name = 'HONDURAS';
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '3:58 PM',  '15:58:00' FROM public.lotteries WHERE name = 'HONDURAS';
INSERT INTO public.draw_times (lottery_id, time_label, time_value)
SELECT id, '9:58 PM',  '21:58:00' FROM public.lotteries WHERE name = 'HONDURAS';


-- ============================================================
-- SEEDS: loterías REVENTADO (referencia la lotería regular)
-- ============================================================

INSERT INTO public.lotteries (name, display_name, lottery_type, base_lottery_id, currency_code, currency_symbol, reventado_price_2_digits, reventado_price_4_digits, reventado_payout_per_block, reventado_block_size)
SELECT
  'REVENTADO_' || l.name,
  l.display_name || ' REVENTADO',
  'reventado',
  l.id,
  l.currency_code,
  l.currency_symbol,
  0.20,
  1.00,
  90.00,
  5
FROM public.lotteries l
WHERE l.lottery_type = 'regular';

-- Copiar los mismos horarios a las loterías REVENTADO
INSERT INTO public.draw_times (lottery_id, time_label, time_value, cutoff_minutes_before, block_minutes_after)
SELECT
  r.id,
  dt.time_label,
  dt.time_value,
  dt.cutoff_minutes_before,
  dt.block_minutes_after
FROM public.lotteries r
JOIN public.lotteries base ON r.base_lottery_id = base.id
JOIN public.draw_times dt ON dt.lottery_id = base.id
WHERE r.lottery_type = 'reventado';
