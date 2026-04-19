import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Wallet, PieChart, TrendingUp, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Pennywise</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <span className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                Smart personal finance
              </span>
              <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
                Take control of every <span className="text-primary">penny</span>.
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">
                Track income and expenses, set monthly budgets, and visualize spending — all in one
                clean, friendly dashboard.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/auth/signup">Create free account</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/auth/login">I already have an account</Link>
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <Feature icon={<TrendingUp className="h-5 w-5" />} title="Income & expense tracking" />
                <Feature icon={<PieChart className="h-5 w-5" />} title="Category insights" />
                <Feature icon={<Wallet className="h-5 w-5" />} title="Monthly budgets" />
                <Feature icon={<ShieldCheck className="h-5 w-5" />} title="Private & secure" />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Feature({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
    </div>
  );
}
