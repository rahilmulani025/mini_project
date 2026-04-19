import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCategories, type Transaction, type TxType } from "@/lib/queries";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const schema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().positive("Amount must be greater than 0"),
  category_id: z.string().uuid("Select a category"),
  date: z.string().min(1, "Date is required"),
  description: z.string().max(200).optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transaction?: Transaction | null;
}

export function TransactionDialog({ open, onOpenChange, transaction }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: categories = [] } = useCategories();

  const [type, setType] = useState<TxType>(transaction?.type ?? "expense");
  const [amount, setAmount] = useState<string>(transaction ? String(transaction.amount) : "");
  const [categoryId, setCategoryId] = useState<string>(transaction?.category_id ?? "");
  const [date, setDate] = useState<string>(transaction?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState<string>(transaction?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset when transaction changes
  const txId = transaction?.id ?? "new";
  const lastTxIdRef = useStateRef(txId);
  if (lastTxIdRef.current !== txId) {
    lastTxIdRef.current = txId;
    setType(transaction?.type ?? "expense");
    setAmount(transaction ? String(transaction.amount) : "");
    setCategoryId(transaction?.category_id ?? "");
    setDate(transaction?.date ?? format(new Date(), "yyyy-MM-dd"));
    setDescription(transaction?.description ?? "");
    setErrors({});
  }

  const filteredCats = categories.filter((c) => c.type === type);

  const mutation = useMutation({
    mutationFn: async (input: z.infer<typeof schema>) => {
      if (transaction) {
        const { error } = await supabase
          .from("transactions")
          .update(input)
          .eq("id", transaction.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").insert({
          ...input,
          user_id: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(transaction ? "Transaction updated" : "Transaction added");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({
      type,
      amount: Number(amount),
      category_id: categoryId,
      date,
      description: description || undefined,
    });
    if (!parsed.success) {
      const f: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (f[i.path[0] as string] = i.message));
      setErrors(f);
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaction" : "Add transaction"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
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
                  "rounded-md py-2 text-sm font-medium transition-colors",
                  type === t
                    ? t === "income"
                      ? "bg-success text-success-foreground"
                      : "bg-destructive text-destructive-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "income" ? "Income" : "Expense"}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {filteredCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category_id && (
              <p className="text-xs text-destructive">{errors.category_id}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              rows={2}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Tiny helper since useRef would also work; this avoids importing it
function useStateRef<T>(initial: T) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [ref] = useState({ current: initial });
  return ref;
}
