import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type TxType = "income" | "expense";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: TxType;
  icon: string;
  color: string;
  is_preset: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  category_id: string | null;
  type: TxType;
  amount: number;
  date: string;
  description: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  monthly_limit: number;
  alert_threshold: number;
}

export interface RecurringRule {
  id: string;
  user_id: string;
  category_id: string | null;
  type: TxType;
  amount: number;
  description: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  next_run_date: string;
  end_date: string | null;
  active: boolean;
}

export function useCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("type")
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useTransactions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["transactions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Transaction[]).map((t) => ({ ...t, amount: Number(t.amount) }));
    },
  });
}

export function useBudgets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["budgets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*");
      if (error) throw error;
      return (data as Budget[]).map((b) => ({
        ...b,
        monthly_limit: Number(b.monthly_limit),
      }));
    },
  });
}

export function useRecurring() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["recurring", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_rules")
        .select("*")
        .order("next_run_date");
      if (error) throw error;
      return (data as RecurringRule[]).map((r) => ({ ...r, amount: Number(r.amount) }));
    },
  });
}
