import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { format, addDays, addMonths, addYears } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import {
  useRecurring,
  useCategories,
  type RecurringRule,
  type TxType,
} from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Trash2, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/recurring")({
  component: () => (
    <AppShell>
      <RecurringPage />
    </AppShell>
  ),
});

function nextDate(current: Date, freq: "weekly" | "monthly" | "yearly"): Date {
  if (freq === "weekly") return addDays(current, 7);
  if (freq === "monthly") return addMonths(current, 1);
  return addYears(current, 1);
}

function RecurringPage() {
  const { user } = useAuth();
  const { data: rules = [] } = useRecurring();
  const { data: categories = [] } = useCategories();
  const qc = useQueryClient();

  const catMap = new Map(categories.map((c) => [c.id, c]));

  const toggle = useMutation({
    mutationFn: async (rule: RecurringRule) => {
      const { error } = await supabase
        .from("recurring_rules")
        .update({ active: !rule.active })
        .eq("id", rule.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recurring_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Removed");
    },
  });

  const runDue = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const due = rules.filter(
        (r) => r.active && r.next_run_date <= today && (!r.end_date || r.end_date >= today),
      );
      let count = 0;
      for (const r of due) {
        let nrd = new Date(r.next_run_date);
        const todayDate = new Date(today);
        // Materialize all overdue occurrences up to today
        while (nrd <= todayDate && (!r.end_date || nrd <= new Date(r.end_date))) {
          const { error } = await supabase.from("transactions").insert({
            user_id: user!.id,
            type: r.type,
            amount: r.amount,
            category_id: r.category_id,
            date: format(nrd, "yyyy-MM-dd"),
            description: r.description,
          });
          if (error) throw error;
          count++;
          nrd = nextDate(nrd, r.frequency);
        }
        const { error } = await supabase
          .from("recurring_rules")
          .update({ next_run_date: format(nrd, "yyyy-MM-dd") })
          .eq("id", r.id);
        if (error) throw error;
      }
      return count;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(count === 0 ? "Nothing due" : `${count} transaction${count > 1 ? "s" : ""} created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recurring</h1>
          <p className="text-sm text-muted-foreground">
            Auto-create transactions on a schedule.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => runDue.mutate()} disabled={runDue.isPending}>
            Run due now
          </Button>
          <RecurringDialog />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No recurring rules yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {rules.map((r) => {
                const c = r.category_id ? catMap.get(r.category_id) : null;
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border border-border p-4",
                      !r.active && "opacity-60",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: c?.color || "#94a3b8" }}
                        />
                        <span className="font-medium">{r.description || c?.name || "Rule"}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.frequency} · next {format(new Date(r.next_run_date), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          r.type === "income"
                            ? "text-sm font-semibold text-success"
                            : "text-sm font-semibold text-destructive"
                        }
                      >
                        {r.type === "income" ? "+" : "-"}
                        {formatMoney(r.amount)}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => toggle.mutate(r)}>
                        {r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

function RecurringDialog() {
  const { user } = useAuth();
  const { data: categories = [] } = useCategories();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [nextRun, setNextRun] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("Enter a valid amount");
      if (!categoryId) throw new Error("Select a category");
      const { error } = await supabase.from("recurring_rules").insert({
        user_id: user!.id,
        type,
        amount: amt,
        category_id: categoryId,
        frequency,
        next_run_date: nextRun,
        end_date: endDate || null,
        description: description || null,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      toast.success("Recurring rule added");
      setOpen(false);
      setAmount("");
      setCategoryId("");
      setDescription("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    m.mutate();
  }

  const filtered = categories.filter((c) => c.type === type);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New recurring rule</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            {(["expense", "income"] as TxType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t);
                  setCategoryId("");
                }}
                className={cn(
                  "rounded-md py-2 text-sm font-medium",
                  type === t
                    ? t === "income"
                      ? "bg-success text-success-foreground"
                      : "bg-destructive text-destructive-foreground"
                    : "text-muted-foreground",
                )}
              >
                {t === "income" ? "Income" : "Expense"}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {filtered.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Next run</Label>
              <Input type="date" value={nextRun} onChange={(e) => setNextRun(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>End date (optional)</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={m.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
