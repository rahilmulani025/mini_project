import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { startOfMonth, endOfMonth } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { useBudgets, useCategories, useTransactions, type Budget } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/budgets")({
  component: () => (
    <AppShell>
      <BudgetsPage />
    </AppShell>
  ),
});

function BudgetsPage() {
  const { data: budgets = [] } = useBudgets();
  const { data: categories = [] } = useCategories();
  const { data: transactions = [] } = useTransactions();
  const qc = useQueryClient();
  const { user } = useAuth();

  const overall = budgets.find((b) => b.category_id === null);
  const perCat = budgets.filter((b) => b.category_id !== null);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const monthExp = transactions.filter(
    (t) =>
      t.type === "expense" &&
      new Date(t.date) >= monthStart &&
      new Date(t.date) <= monthEnd,
  );
  const totalExp = monthExp.reduce((s, t) => s + t.amount, 0);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    monthExp.forEach((t) => {
      if (t.category_id) m.set(t.category_id, (m.get(t.category_id) || 0) + t.amount);
    });
    return m;
  }, [monthExp]);

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const usedCatIds = new Set(perCat.map((b) => b.category_id));
  const availableCats = expenseCategories.filter((c) => !usedCatIds.has(c.id));

  const upsertOverall = useMutation({
    mutationFn: async (input: { monthly_limit: number; alert_threshold: number }) => {
      if (overall) {
        const { error } = await supabase
          .from("budgets")
          .update(input)
          .eq("id", overall.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("budgets")
          .insert({ ...input, user_id: user!.id, category_id: null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Budget saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBudget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Removed");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
        <p className="text-sm text-muted-foreground">Set monthly limits and stay on track.</p>
      </div>

      <OverallBudgetCard
        budget={overall}
        spent={totalExp}
        onSave={(v) => upsertOverall.mutate(v)}
        saving={upsertOverall.isPending}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Per-category limits</CardTitle>
          <CategoryBudgetDialog availableCats={availableCats} />
        </CardHeader>
        <CardContent>
          {perCat.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No category budgets yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {perCat.map((b) => {
                const c = categories.find((cat) => cat.id === b.category_id);
                const spent = byCat.get(b.category_id!) ?? 0;
                const pct = Math.min(100, (spent / b.monthly_limit) * 100);
                const tone =
                  spent > b.monthly_limit
                    ? "bg-destructive"
                    : pct >= b.alert_threshold
                      ? "bg-warning"
                      : "bg-success";
                return (
                  <li key={b.id} className="rounded-lg border border-border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: c?.color || "#94a3b8" }}
                        />
                        <span className="font-medium">{c?.name || "Unknown"}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteBudget.mutate(b.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mb-1 flex justify-between text-sm text-muted-foreground">
                      <span>
                        {formatMoney(spent)} of {formatMoney(b.monthly_limit)}
                      </span>
                      <span>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OverallBudgetCard({
  budget,
  spent,
  onSave,
  saving,
}: {
  budget: Budget | undefined;
  spent: number;
  onSave: (v: { monthly_limit: number; alert_threshold: number }) => void;
  saving: boolean;
}) {
  const [limit, setLimit] = useState(budget ? String(budget.monthly_limit) : "");
  const [threshold, setThreshold] = useState(budget ? String(budget.alert_threshold) : "80");

  function submit(e: FormEvent) {
    e.preventDefault();
    const lim = Number(limit);
    const th = Number(threshold);
    if (!(lim > 0)) return toast.error("Enter a valid limit");
    if (!(th >= 1 && th <= 100)) return toast.error("Threshold must be 1–100");
    onSave({ monthly_limit: lim, alert_threshold: th });
  }

  const pct = budget ? Math.min(100, (spent / budget.monthly_limit) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Overall monthly budget</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Monthly limit</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Alert at (%)</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={saving}>
              {budget ? "Update" : "Set budget"}
            </Button>
          </div>
        </form>
        {budget && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm text-muted-foreground">
              <span>
                {formatMoney(spent)} of {formatMoney(budget.monthly_limit)}
              </span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={
                  spent > budget.monthly_limit
                    ? "h-full bg-destructive"
                    : pct >= budget.alert_threshold
                      ? "h-full bg-warning"
                      : "h-full bg-success"
                }
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryBudgetDialog({
  availableCats,
}: {
  availableCats: { id: string; name: string }[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [threshold, setThreshold] = useState("80");

  const m = useMutation({
    mutationFn: async () => {
      const lim = Number(limit);
      const th = Number(threshold);
      if (!categoryId) throw new Error("Select a category");
      if (!(lim > 0)) throw new Error("Enter a valid limit");
      const { error } = await supabase.from("budgets").insert({
        user_id: user!.id,
        category_id: categoryId,
        monthly_limit: lim,
        alert_threshold: th,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      toast.success("Category budget added");
      setOpen(false);
      setCategoryId("");
      setLimit("");
      setThreshold("80");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={availableCats.length === 0}>
          <Plus className="mr-2 h-4 w-4" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Category budget</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {availableCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Monthly limit</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Alert at (%)</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
