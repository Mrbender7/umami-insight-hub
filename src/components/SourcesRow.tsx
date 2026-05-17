import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Search, Facebook, Globe2, Smartphone, Monitor, HelpCircle } from "lucide-react";
import {
  getRange, getStats, getReferrers, aggregateReferrers,
  type Period,
} from "@/lib/umami";

export function SourcesRow({ period }: { period: Period }) {
  const range = useMemo(() => getRange(period), [period]);

  const statsQ = useQuery({
    queryKey: ["umami-stats", period],
    queryFn: () => getStats(range),
  });
  const refsQ = useQuery({
    queryKey: ["umami-referrers", period],
    queryFn: () => getReferrers(range),
  });

  const breakdown = useMemo(() => aggregateReferrers(refsQ.data ?? []), [refsQ.data]);
  const totalVisits = statsQ.data?.visits.value ?? 0;
  const knownReferrers = breakdown.total;
  // « Autres sources » = visites attribuées à un référent non-Google/Facebook,
  // augmentées du trafic « direct » (visites sans référent = total stats - total référents).
  const direct = Math.max(0, totalVisits - knownReferrers);
  const otherTotal = breakdown.other + direct;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <SourceCard
        label="Visites totales"
        icon={Eye}
        accent="from-[var(--neon-blue)] to-[var(--neon-violet)]"
        value={totalVisits.toLocaleString()}
        hint={statsQ.data ? `${statsQ.data.visitors.value.toLocaleString()} visiteurs uniques` : "—"}
      />
      <SourceCard
        label="Via Google"
        icon={Search}
        accent="from-[oklch(0.7_0.2_160)] to-[oklch(0.6_0.22_200)]"
        value={breakdown.google.toLocaleString()}
        hint="Search, Mokka, Ads…"
      />
      <FacebookCard
        mobile={breakdown.facebookMobile}
        desktop={breakdown.facebookDesktop}
        unknown={breakdown.facebookUnknown}
      />
      <SourceCard
        label="Autres sources"
        icon={Globe2}
        accent="from-[var(--neon-violet)] to-[var(--neon-blue)]"
        value={otherTotal.toLocaleString()}
        hint={direct > 0 ? `dont ${direct.toLocaleString()} en direct/inconnu` : "Hors Google / Facebook"}
      />
    </section>
  );
}

function SourceCard({
  label, value, hint, icon: Icon, accent,
}: {
  label: string; value: string; hint?: string;
  icon: typeof Eye; accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-card p-5 border-neon shadow-neon">
      <div className={`absolute -top-12 -right-12 size-40 rounded-full opacity-20 blur-2xl bg-gradient-to-br ${accent}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={`size-10 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center shadow-glow`}>
          <Icon className="size-5 text-primary-foreground" />
        </div>
      </div>
    </div>
  );
}

function FacebookCard({
  mobile, desktop, unknown,
}: { mobile: number; desktop: number; unknown: number }) {
  const total = mobile + desktop + unknown;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-card p-5 border-neon shadow-neon">
      <div className="absolute -top-12 -right-12 size-40 rounded-full opacity-20 blur-2xl bg-gradient-to-br from-[oklch(0.55_0.25_260)] to-[oklch(0.65_0.27_305)]" />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Via Facebook</p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{total.toLocaleString()}</p>
        </div>
        <div className="size-10 rounded-xl bg-gradient-to-br from-[oklch(0.55_0.25_260)] to-[oklch(0.65_0.27_305)] flex items-center justify-center shadow-glow shrink-0">
          <Facebook className="size-5 text-primary-foreground" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-card/40 p-2">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Smartphone className="size-3" />
            <span>Mobile</span>
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums">{mobile.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-card/40 p-2">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Monitor className="size-3" />
            <span>Desktop</span>
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums">{desktop.toLocaleString()}</p>
        </div>
      </div>
      {unknown > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
          <HelpCircle className="size-3" />
          {unknown.toLocaleString()} indéterminé{unknown > 1 ? "s" : ""} (l.facebook.com…)
        </p>
      )}
    </div>
  );
}
