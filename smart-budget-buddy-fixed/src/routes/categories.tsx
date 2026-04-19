import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { useCategories, type Category, type TxType } from "@/lib/queries";
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
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/categories")({
  component: () => (
    <AppShell>
      <CategoriesPage />
    </AppShell>
  ),
});

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#22c55e",
  "#0ea5e9",
  "#6b7280",
];

function CategoriesPage() {
  const { data: categories = [] } = useCategories();
  const expense = categories.filter((c) => c.type === "expense");
  const income = categories.filter((c) => c.type === "income");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Organize your transactions. Presets can't be deleted.
          </p>
        </div>
        <CategoryDialog />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CategoryList title="Expense" items={expense} />
        <CategoryList title="Income" items={income} />
      </div>
    </div>
  );
}

function CategoryList({ title, items }: { title: string; items: Category[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No categories.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("categories").delete().eq("id", category.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
        <span className="text-sm font-medium">{category.name}</span>
        {category.is_preset && (
          <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> preset
          </span>
        )}
      </div>
      <div className="flex">
        <CategoryDialog editing={category} />
        {!category.is_preset && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (confirm(`Delete "${category.name}"?`)) del.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

function CategoryDialog({ editing }: { editing?: Category }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<TxType>(editing?.type ?? "expense");
  const [color, setColor] = useState(editing?.color ?? COLORS[0]);

  const m = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      if (trimmed.length > 40) throw new Error("Name too long");
      if (editing) {
        const { error } = await supabase
          .from("categories")
          .update({ name: trimmed, color })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert({
          user_id: user!.id,
          name: trimmed,
          type,
          color,
          icon: "Tag",
          is_preset: false,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success(editing ? "Updated" : "Added");
      setOpen(false);
      if (!editing) {
        setName("");
        setColor(COLORS[0]);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    m.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </div>
          {!editing && (
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as TxType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={
                    color === c
                      ? "h-8 w-8 rounded-full ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      : "h-8 w-8 rounded-full"
                  }
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
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
