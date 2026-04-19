import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { useTransactions, useCategories } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, downloadCsv } from "@/lib/format";
import { Download } from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: () => (
    <AppShell>
      <ReportsPage />
    </AppShell>
  ),
});

type Preset = "thisMonth" | "lastMonth" | "custom";

function ReportsPage() {
  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useCategories();

  const [preset, setPreset] = useState<Preset>("thisMonth");
  const now = new Date();
  const defaults = useMemo(() => {
    if (preset === "thisMonth") {
      return {
        from: format(startOfMonth(now), "yyyy-MM-dd"),
        to: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    }
    const last = subMonths(now, 1);
    return {
      from: format(startOfMonth(last), "yyyy-MM-dd"),
      to: format(endOfMonth(last), "yyyy-MM-dd"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  // sync preset -> dates
  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") {
      const start = p === "thisMonth" ? startOfMonth(now) : startOfMonth(subMonths(now, 1));
      const end = p === "thisMonth" ? endOfMonth(now) : endOfMonth(subMonths(now, 1));
      setFrom(format(start, "yyyy-MM-dd"));
      setTo(format(end, "yyyy-MM-dd"));
    }
  }

  const filtered = transactions.filter((t) => t.date >= from && t.date <= to);
  const expenses = filtered.filter((t) => t.type === "expense");
  const totalExp = expenses.reduce((s, t) => s + t.amount, 0);
  const totalInc = filtered
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const breakdown = useMemo(() => {
    const m = new Map<string, number>();
    expenses.forEach((t) => {
      const k = t.category_id || "uncategorized";
      m.set(k, (m.get(k) || 0) + t.amount);
    });
    return Array.from(m.entries())
      .map(([id, amount]) => {
        const c = catMap.get(id);
        return {
          id,
          name: c?.name || "Uncategorized",
          color: c?.color || "#94a3b8",
          amount,
          pct: totalExp > 0 ? (amount / totalExp) * 100 : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, catMap, totalExp]);

  // 12-month trend
  const trend = useMemo(() => {
    const months: { month: string; income: number; expenses: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(now, i);
      const s = startOfMonth(d);
      const e = endOfMonth(d);
      const sStr = format(s, "yyyy-MM-dd");
      const eStr = format(e, "yyyy-MM-dd");
      const tx = transactions.filter((t) => t.date >= sStr && t.date <= eStr);
      months.push({
        month: format(d, "MMM"),
        income: tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
        expenses: tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      });
    }
    return months;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

  function exportCsv() {
    if (breakdown.length === 0) return;
    downloadCsv(
      `report-${from}-to-${to}.csv`,
      breakdown.map((b) => ({
        category: b.name,
        amount: b.amount,
        percent: b.pct.toFixed(2),
      })),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Analyze spending across any period.</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid items-end gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Range</Label>
              <div className="flex flex-wrap gap-1">
                {(["thisMonth", "lastMonth", "custom"] as Preset[]).map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={preset === p ? "default" : "outline"}
                    onClick={() => applyPreset(p)}
                  >
                    {p === "thisMonth" ? "This month" : p === "lastMonth" ? "Last month" : "Custom"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>From</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPreset("custom");
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPreset("custom");
                }}
              />
            </div>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Income" value={formatMoney(totalInc)} tone="success" />
        <Stat label="Expenses" value={formatMoney(totalExp)} tone="destructive" />
        <Stat label="Net" value={formatMoney(totalInc - totalExp)} tone={totalInc - totalExp >= 0 ? "success" : "destructive"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Monthly trend (12 months)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="oklch(0.65 0.16 152)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="oklch(0.6 0.22 27)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Category breakdown</CardTitle></CardHeader>
        <CardContent className="p-0">
          {breakdown.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No expenses in this range.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">% of spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(b.amount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {b.pct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "destructive" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={
            tone === "success"
              ? "mt-1 text-xl font-bold text-success"
              : "mt-1 text-xl font-bold text-destructive"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
