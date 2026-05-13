import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, MousePointerClick, PlayCircle, RefreshCw, LogOut, Sparkles,
  BarChart3, Brain, Globe2, Users, Radio,
} from "lucide-react";
import { DiagnosticView } from "./DiagnosticView";
import { CountriesView } from "./CountriesView";
import { UsersView } from "./UsersView";
import { RealtimeView } from "./RealtimeView";
import {
  getEventCounts, getEventSeries, getRecentEvents, getRange,
  ERROR_EVENTS, type Period,
} from "@/lib/umami";
import { logout } from "@/lib/auth";
import { KpiCard } from "./KpiCard";
import { PeriodSelector } from "./PeriodSelector";
import { TrafficChart } from "./TrafficChart";
import { ErrorsTable } from "./ErrorsTable";

type View = "dashboard" | "realtime" | "diagnostic" | "countries" | "users";

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [period, setPeriod] = useState<Period>("24h");
  const [view, setView] = useState<View>("dashboard");
  const range = useMemo(() => getRange(period), [period]);

  const counts = useQuery({
    queryKey: ["umami-counts", period],
    queryFn: () => getEventCounts(range),
  });
  const series = useQuery({
    queryKey: ["umami-series", period],
    queryFn: () => getEventSeries(range),
  });
  const events = useQuery({
    queryKey: ["umami-events", period],
    queryFn: () => getRecentEvents(range),
  });

  const countMap = useMemo(() => {
    const m = new Map<string, number>();
    (counts.data ?? []).forEach((c) => m.set(c.x, (m.get(c.x) ?? 0) + c.y));
    return m;
  }, [counts.data]);

  const adLanding = countMap.get("ad-landing") ?? 0;
  const earlyBounce = countMap.get("early-bounce") ?? 0;
  const streamPlay = countMap.get("stream-play") ?? 0;
  const totalErrors = ERROR_EVENTS.reduce((acc, name) => acc + (countMap.get(name) ?? 0), 0);
  const bounceRate = adLanding > 0 ? Math.round((earlyBounce / adLanding) * 100) : 0;

  function refresh() {
    counts.refetch();
    series.refetch();
    events.refetch();
  }

  const isLoading = counts.isLoading || series.isLoading || events.isLoading;
  const error = counts.error || series.error || events.error;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-neon flex items-center justify-center shadow-glow">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                <span className="text-gradient-neon">Stats</span> Umami
              </h1>
              <p className="text-xs text-muted-foreground">Tableau de bord analytique</p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <div className="inline-flex rounded-lg bg-card p-1 ring-1 ring-border">
              {([
                { id: "dashboard", label: "Vue d'ensemble", icon: BarChart3 },
                { id: "realtime", label: "Temps réel", icon: Radio },
                { id: "diagnostic", label: "Diagnostic", icon: Brain },
                { id: "countries", label: "Pays", icon: Globe2 },
                { id: "users", label: "Utilisateurs", icon: Users },
              ] as const).map((tab) => {
                const Icon = tab.icon;
                const active = view === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setView(tab.id)}
                    className={
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition " +
                      (active
                        ? "bg-gradient-neon text-primary-foreground shadow-glow"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    <Icon className="size-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <PeriodSelector value={period} onChange={setPeriod} />
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-border hover:bg-accent transition"
              disabled={isLoading}
            >
              <RefreshCw className={"size-3.5 " + (isLoading ? "animate-spin" : "")} />
              Rafraîchir
            </button>
            <button
              onClick={() => { logout(); onLogout(); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-border hover:bg-accent transition"
              title="Se déconnecter"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {view === "realtime" && <RealtimeView />}
        {view === "diagnostic" && <DiagnosticView period={period} />}
        {view === "countries" && <CountriesView period={period} />}
        {view === "users" && <UsersView period={period} />}
        {view === "dashboard" && (
          <>
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Ad landing" value={adLanding.toLocaleString()} icon={MousePointerClick} accent="blue" hint="Visiteurs depuis les pubs" />
          <KpiCard label="Taux de rebond" value={`${bounceRate}%`} icon={Activity} accent="violet" hint={`${earlyBounce} bounces / ${adLanding} arrivées`} />
          <KpiCard label="Stream play" value={streamPlay.toLocaleString()} icon={PlayCircle} accent="success" hint="Lectures déclenchées" />
          <KpiCard label="Crashs (total)" value={totalErrors.toLocaleString()} icon={AlertTriangle} accent="danger" hint="Toutes erreurs confondues" />
        </section>

        <section>
          <TrafficChart series={series.data ?? []} period={period} />
        </section>

        <section>
          <ErrorsTable events={events.data?.data ?? []} />
        </section>
          </>
        )}

        <footer className="pt-4 pb-8 text-center text-xs text-muted-foreground">
          Données Umami Cloud · Période : {period}
        </footer>
      </main>
    </div>
  );
}
