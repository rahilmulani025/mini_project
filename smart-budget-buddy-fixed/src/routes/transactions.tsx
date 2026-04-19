import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useTransactions, useCategories, type Transaction } from "@/lib/queries";
import { TransactionDialog } from "@/components/transaction-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatMoney, downloadCsv } from "@/lib/format";
import { Plus, Pencil, Trash2, Download, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/transactions")({
  component: () => (
    <AppShell>
      <TransactionsPage />
    </AppShell>
  ),
});

function TransactionsPage() {
  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (catFilter !== "all" && t.category_id !== catFilter) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (search) {
        const q = search.toLowerCase();
        const cat = t.category_id ? catMap.get(t.category_id)?.name ?? "" : "";
        if (
          !(t.description ?? "").toLowerCase().includes(q) &&
          !cat.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [transactions, typeFilter, catFilter, from, to, search, catMap]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction deleted");
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    if (filtered.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `transactions-${format(new Date(), "yyyy-MM-dd")}.csv`,
      filtered.map((t) => ({
        date: t.date,
        type: t.type,
        category: t.category_id ? (catMap.get(t.category_id)?.name ?? "") : "",
        amount: t.amount,
        description: t.description ?? "",
      })),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">All your income and expenses.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" onClick={() => setOpenNew(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No transactions match.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const c = t.category_id ? catMap.get(t.category_id) : null;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(t.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: c?.color || "#94a3b8" }}
                          />
                          {c?.name || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {t.description || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell
                        className={
                          t.type === "income"
                            ? "text-right font-semibold text-success"
                            : "text-right font-semibold text-destructive"
                        }
                      >
                        {t.type === "income" ? "+" : "-"}
                        {formatMoney(t.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setConfirmDelete(t)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TransactionDialog open={openNew} onOpenChange={setOpenNew} />
      <TransactionDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        transaction={editing}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
