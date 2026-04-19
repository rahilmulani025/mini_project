import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { useTransactions, useCategories, useBudgets } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatMoney } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, Target, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});

function Dashboard() {
  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: budgets = [] } = useBudgets();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const monthTx = transactions.filter((t) => {
    const d = new Date(t.date);
    return d >= monthStart && d <= monthEnd;
  });
  const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const net = income - expenses;

  const overallBudget = budgets.find((b) => b.category_id === null);
  const remaining = overallBudget ? overallBudget.monthly_limit - expenses : 0;
  const usedPct = overallBudget ? Math.min(100, (expenses / overallBudget.monthly_limit) * 100) : 0;
  const overThreshold = overallBudget && usedPct >= overallBudget.alert_threshold;
  const overBudget = overallBudget && expenses > overallBudget.monthly_limit;

  // Category spend (expense) for donut
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    monthTx
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const key = t.category_id || "uncategorized";
        map.set(key, (map.get(key) || 0) + t.amount);
      });
    return Array.from(map.entries()).map(([id, value]) => {
      const c = catMap.get(id);
      return {
        name: c?.name || "Uncategorized",
        value,
        color: c?.color || "#94a3b8",
      };
    });
  }, [monthTx, catMap]);

  // 6-month income vs expenses
  const monthlyData = useMemo(() => {
    const months: { month: string; income: number; expenses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const s = startOfMonth(d);
      const e = endOfMonth(d);
      const tx = transactions.filter((t) => {
        const td = new Date(t.date);
        return td >= s && td <= e;
      });
      months.push({
        month: format(d, "MMM"),
        income: tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
        expenses: tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      });
    }
    return months;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

  const recent = transactions.slice(0, 5);

  const progressColor = overBudget
    ? "bg-destructive"
    : overThreshold
      ? "bg-warning"
      : "bg-success";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview for {format(now, "MMMM yyyy")}
        </p>
      </div>

      {overBudget && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Over budget</AlertTitle>
          <AlertDescription>
            You've exceeded your monthly budget by {formatMoney(expenses - (overallBudget?.monthly_limit ?? 0))}.
          </AlertDescription>
        </Alert>
      )}
      {!overBudget && overThreshold && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Approaching budget limit</AlertTitle>
          <AlertDescription>
            You've used {usedPct.toFixed(0)}% of your monthly budget.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          title="Income"
          value={formatMoney(income)}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
        />
        <Kpi
          title="Expenses"
          value={formatMoney(expenses)}
          icon={<TrendingDown className="h-4 w-4" />}
          tone="destructive"
        />
        <Kpi
          title="Net balance"
          value={formatMoney(net)}
          icon={<Wallet className="h-4 w-4" />}
          tone={net >= 0 ? "success" : "destructive"}
        />
        <Kpi
          title="Budget remaining"
          value={overallBudget ? formatMoney(remaining) : "—"}
          icon={<Target className="h-4 w-4" />}
          tone={remaining >= 0 ? "primary" : "destructive"}
        />
      </div>

      {overallBudget && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Monthly budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {formatMoney(expenses)} of {formatMoney(overallBudget.monthly_limit)}
              </span>
              <span className="font-medium">{usedPct.toFixed(0)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${progressColor} transition-all`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            {byCat.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No expenses this month yet.
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCat}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {byCat.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="currentColor" fontSize={12} />
                  <YAxis stroke="currentColor" fontSize={12} />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Legend />
                  <Bar dataKey="income" fill="oklch(0.65 0.16 152)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="oklch(0.6 0.22 27)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent transactions</CardTitle>
          <Link to="/transactions" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((t) => {
                const c = t.category_id ? catMap.get(t.category_id) : null;
                return (
                  <li key={t.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {t.description || c?.name || "Transaction"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c?.name || "Uncategorized"} · {format(new Date(t.date), "MMM d")}
                      </p>
                    </div>
                    <span
                      className={
                        t.type === "income"
                          ? "text-sm font-semibold text-success"
                          : "text-sm font-semibold text-destructive"
                      }
                    >
                      {t.type === "income" ? "+" : "-"}
                      {formatMoney(t.amount)}
                    </span>
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

function Kpi({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: "primary" | "success" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "destructive"
        ? "bg-destructive/10 text-destructive"
        : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
