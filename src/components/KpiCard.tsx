import type { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "blue",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  accent?: "blue" | "violet" | "danger" | "success";
}) {
  const accentClass =
    accent === "danger"
      ? "from-destructive to-[oklch(0.55_0.27_15)]"
      : accent === "success"
        ? "from-[oklch(0.7_0.2_160)] to-[oklch(0.6_0.22_200)]"
        : accent === "violet"
          ? "from-[var(--neon-violet)] to-[var(--neon-blue)]"
          : "from-[var(--neon-blue)] to-[var(--neon-violet)]";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-card p-5 border-neon shadow-neon">
      <div className={`absolute -top-12 -right-12 size-40 rounded-full opacity-20 blur-2xl bg-gradient-to-br ${accentClass}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={`size-10 rounded-xl bg-gradient-to-br ${accentClass} flex items-center justify-center shadow-glow`}>
          <Icon className="size-5 text-primary-foreground" />
        </div>
      </div>
    </div>
  );
}
