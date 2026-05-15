import { useEffect, useMemo, useState } from "react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, MousePointerClick, PlayCircle, RefreshCw, LogOut, Sparkles,
  BarChart3, Brain, Globe2, Users, Radio, Megaphone, Zap, Loader2,
} from "lucide-react";
import { DiagnosticView } from "./DiagnosticView";
import { CountriesView } from "./CountriesView";
import { UsersView } from "./UsersView";
import { RealtimeView } from "./RealtimeView";
import { AcquisitionView } from "./AcquisitionView";
import { ViewErrorBoundary } from "./ViewErrorBoundary";
import {
  getEventCounts, getEventSeries, getRecentEvents, getRange,
  ERROR_EVENTS, type Period,
  getDataMode, setDataMode, subscribeDataMode, canUseLiveMode, getStaticGeneratedAt,
} from "@/lib/umami";
import { logout } from "@/lib/auth";
import { KpiCard } from "./KpiCard";
import { PeriodSelector } from "./PeriodSelector";
import { TrafficChart } from "./TrafficChart";
import { ErrorsTable } from "./ErrorsTable";

type View = "dashboard" | "realtime" | "acquisition" | "diagnostic" | "countries" | "users";

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

  // Mode données : statique (JSON pré-build) vs live (API Umami à la demande).
  const [dataMode, setDataModeState] = useState(getDataMode());
  const [staticGeneratedAt, setStaticGeneratedAt] = useState<string | null>(null);
  const [lastLiveRefreshAt, setLastLiveRefreshAt] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const fetchingCount = useIsFetching();
  const liveAvailable = canUseLiveMode();

  useEffect(() => subscribeDataMode(setDataModeState), []);
  useEffect(() => {
    if (dataMode === "static") getStaticGeneratedAt().then(setStaticGeneratedAt);
  }, [dataMode]);

  function refresh() {
    counts.refetch();
    series.refetch();
    events.refetch();
  }

  async function recalcLive() {
    if (!liveAvailable) return;
    setDataMode("live");
    // Vide les caches static pour forcer le re-fetch sur tous les onglets
    await queryClient.invalidateQueries();
    setLastLiveRefreshAt(new Date().toISOString());
  }

  function backToStatic() {
    setDataMode("static");
    queryClient.invalidateQueries();
    setLastLiveRefreshAt(null);
  }

  const isLoading = counts.isLoading || series.isLoading || events.isLoading;
  const error = counts.error || series.error || events.error;
  const isLiveRefreshing = dataMode === "live" && fetchingCount > 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 rounded-xl bg-gradient-neon flex items-center justify-center shadow-glow shrink-0">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold tracking-tight truncate">
                  <span className="text-gradient-neon">Stats</span> Umami
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Tableau de bord analytique</p>
              </div>
            </div>
            {/* Mobile-only actions on the right of the title row */}
            <div className="flex items-center gap-2 lg:hidden print:hidden">
              <PeriodSelector value={period} onChange={setPeriod} />
              <button
                onClick={dataMode === "live" ? recalcLive : recalcLive}
                disabled={!liveAvailable || isLiveRefreshing}
                className={
                  "inline-flex items-center justify-center rounded-lg p-2 text-xs font-medium ring-1 transition " +
                  (dataMode === "live"
                    ? "bg-gradient-neon text-primary-foreground ring-transparent shadow-glow"
                    : "bg-card ring-border hover:bg-accent")
                }
                title="Recalculer en direct (API Umami)"
                aria-label="Recalculer en direct"
              >
                <Zap className={"size-3.5 " + (isLiveRefreshing ? "animate-pulse" : "")} />
              </button>
              <button
                onClick={() => { logout(); onLogout(); }}
                className="inline-flex items-center justify-center rounded-lg bg-card p-2 text-xs font-medium ring-1 ring-border hover:bg-accent transition"
                title="Se déconnecter"
                aria-label="Se déconnecter"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 overflow-x-auto lg:overflow-visible">
            <div className="inline-flex rounded-lg bg-card p-1 ring-1 ring-border shrink-0">
              {([
                { id: "dashboard", label: "Vue d'ensemble", icon: BarChart3 },
                { id: "realtime", label: "Temps réel", icon: Radio },
                { id: "acquisition", label: "Acquisition", icon: Megaphone },
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
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap " +
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
            {/* Desktop-only actions next to tabs */}
            <div className="hidden lg:flex items-center gap-2">
              <PeriodSelector value={period} onChange={setPeriod} />
              {dataMode === "live" ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-neon px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-glow">
                    <span className="size-1.5 rounded-full bg-current animate-pulse" />
                    Live
                  </span>
                  <button
                    onClick={recalcLive}
                    disabled={isLiveRefreshing}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-primary/40 hover:bg-accent transition"
                    title="Re-fetcher la période courante"
                  >
                    <RefreshCw className={"size-3.5 " + (isLiveRefreshing ? "animate-spin" : "")} />
                    Refresh
                  </button>
                  <button
                    onClick={backToStatic}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-border hover:bg-accent transition"
                    title="Revenir aux données figées"
                  >
                    Statique
                  </button>
                </>
              ) : (
                <button
                  onClick={recalcLive}
                  disabled={!liveAvailable || isLiveRefreshing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-neon px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition disabled:opacity-50"
                  title={liveAvailable ? "Re-fetch toutes les données depuis l'API Umami" : "Token API Umami absent au build"}
                >
                  <Zap className="size-3.5" />
                  Recalculer en direct
                </button>
              )}
              <button
                onClick={() => { logout(); onLogout(); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-border hover:bg-accent transition"
                title="Se déconnecter"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6 relative">
        {/* Bandeau de fraîcheur */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {dataMode === "live" ? (
              <>
                <Zap className="size-3.5 text-primary" />
                <span>
                  <span className="text-foreground font-medium">Mode live</span> · données API Umami à la demande
                  {lastLiveRefreshAt && (
                    <> · rafraîchi à {new Date(lastLiveRefreshAt).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                <span>
                  Mode statique ·{" "}
                  {staticGeneratedAt
                    ? <>données figées au build du {new Date(staticGeneratedAt).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" })}</>
                    : <>données pré-générées</>}
                </span>
              </>
            )}
          </div>
          {!liveAvailable && dataMode !== "live" && (
            <span className="text-amber-600 dark:text-amber-400">Mode live indisponible (token API absent du build)</span>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {isLiveRefreshing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="rounded-2xl bg-gradient-card p-8 border-neon shadow-neon flex flex-col items-center gap-4 max-w-sm mx-4">
              <Loader2 className="size-10 text-primary animate-spin" />
              <div className="text-center">
                <p className="font-semibold tracking-tight">Récupération en direct…</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Interrogation de l'API Umami pour la période sélectionnée.
                </p>
                <p className="mt-3 text-xs tabular-nums text-primary">
                  {fetchingCount} requête{fetchingCount > 1 ? "s" : ""} en cours
                </p>
              </div>
            </div>
          </div>
        )}

        <ViewErrorBoundary>
          {view === "realtime" && <RealtimeView />}
          {view === "acquisition" && <AcquisitionView period={period} />}
          {view === "diagnostic" && <DiagnosticView period={period} />}
          {view === "countries" && <CountriesView period={period} />}
          {view === "users" && <UsersView period={period} />}
        </ViewErrorBoundary>
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
