
-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
CREATE TYPE public.recurrence_freq AS ENUM ('weekly', 'monthly', 'yearly');

-- =========================================================================
-- TIMESTAMP TRIGGER FUNCTION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =========================================================================
-- PROFILES
-- =========================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- CATEGORIES
-- =========================================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.transaction_type NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Tag',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_preset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name, type)
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_categories_user ON public.categories(user_id);

CREATE POLICY "Users view own categories" ON public.categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own categories" ON public.categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own categories" ON public.categories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own non-preset categories" ON public.categories
  FOR DELETE USING (auth.uid() = user_id AND is_preset = false);

CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- TRANSACTIONS
-- =========================================================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  type public.transaction_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tx_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX idx_tx_user_category ON public.transactions(user_id, category_id);

CREATE POLICY "Users view own tx" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tx" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tx" ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own tx" ON public.transactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER tx_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- BUDGETS (overall + per-category)
-- =========================================================================
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  monthly_limit NUMERIC(14,2) NOT NULL CHECK (monthly_limit > 0),
  alert_threshold INT NOT NULL DEFAULT 80 CHECK (alert_threshold BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Only one overall budget (category_id NULL) per user
CREATE UNIQUE INDEX budgets_one_overall ON public.budgets(user_id) WHERE category_id IS NULL;
CREATE UNIQUE INDEX budgets_one_per_category ON public.budgets(user_id, category_id) WHERE category_id IS NOT NULL;

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own budgets" ON public.budgets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own budgets" ON public.budgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own budgets" ON public.budgets
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own budgets" ON public.budgets
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER budgets_updated_at BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- RECURRING RULES
-- =========================================================================
CREATE TABLE public.recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  type public.transaction_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  frequency public.recurrence_freq NOT NULL,
  next_run_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_recurring_user ON public.recurring_rules(user_id, next_run_date);

CREATE POLICY "Users view own recurring" ON public.recurring_rules
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own recurring" ON public.recurring_rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own recurring" ON public.recurring_rules
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own recurring" ON public.recurring_rules
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER recurring_updated_at BEFORE UPDATE ON public.recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- HANDLE NEW USER: profile + preset categories
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);

  -- Expense presets
  INSERT INTO public.categories (user_id, name, type, icon, color, is_preset) VALUES
    (NEW.id, 'Food',          'expense', 'UtensilsCrossed', '#ef4444', true),
    (NEW.id, 'Travel',        'expense', 'Plane',           '#f59e0b', true),
    (NEW.id, 'Bills',         'expense', 'Receipt',         '#8b5cf6', true),
    (NEW.id, 'Shopping',      'expense', 'ShoppingBag',     '#ec4899', true),
    (NEW.id, 'Entertainment', 'expense', 'Film',            '#06b6d4', true),
    (NEW.id, 'Health',        'expense', 'HeartPulse',      '#10b981', true),
    (NEW.id, 'Other',         'expense', 'Tag',             '#6b7280', true);

  -- Income presets
  INSERT INTO public.categories (user_id, name, type, icon, color, is_preset) VALUES
    (NEW.id, 'Salary',        'income',  'Wallet',          '#22c55e', true),
    (NEW.id, 'Other',         'income',  'PiggyBank',       '#0ea5e9', true);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
