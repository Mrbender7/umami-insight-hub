import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Brain,
  ClipboardCopy,
  Check,
  Printer,
  Link2,
  Clock,
  Route as RouteIcon,
  ListOrdered,
} from "lucide-react";
import {
  getEventCounts,
  getEventSeries,
  getRecentEvents,
  getSessions,
  getEventDataValues,
  getRange,
  type Period,
} from "@/lib/umami";
import {
  filterErrorEvents,
  analyzeQueryParams,
  analyzeRoutes,
  analyzeSessions,
  analyzeHourly,
  breakdownErrorCodes,
  generateHypotheses,
  buildAgentPrompt,
  countUniqueErrorSessions,
  analyzeCsrFallback,
  analyzeInAppBrowsers,
  analyzeBounceImpact,
  analyzeSuspenseTiming,
  analyzeHydrationDetails,
  analyzeCsrDuration,
  analyzeWebViews,
  analyzeUrlCleaned,
  analyzePageviewPerf,
  analyzeAcquisition,
  analyzeLiteFunnel,
} from "@/lib/diagnostic";

const PERIOD_LABEL: Record<Period, string> = {
  "1h": "Dernière heure",
  "6h": "6 dernières heures",
  "12h": "12 dernières heures",
  "24h": "Dernières 24 heures",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  "all": "Depuis le début",
};

export function DiagnosticView({ period }: { period: Period }) {
  const range = useMemo(() => getRange(period), [period]);
  const [copied, setCopied] = useState(false);

  const counts = useQuery({
    queryKey: ["umami-counts", period],
    queryFn: () => getEventCounts(range),
  });
  const events = useQuery({
    queryKey: ["umami-events", period],
    queryFn: () => getRecentEvents(range),
  });
  const series = useQuery({
    queryKey: ["umami-series", period],
    queryFn: () => getEventSeries(range),
  });
  const sessionsQ = useQuery({
    queryKey: ["umami-sessions", period],
    queryFn: () => getSessions(range),
  });

  // Event-data des 5 nouveaux events instrumentés (chargés en parallèle, vide en mode statique si non générés).
  const useEvd = (eventName: string, fieldName: string) =>
    useQuery({
      queryKey: ["umami-evd", period, eventName, fieldName],
      queryFn: () => getEventDataValues(range, eventName, fieldName),
    });
  const hmComponent = useEvd("hydration-mismatch-detail", "component");
  const hmStack = useEvd("hydration-mismatch-detail", "componentStack");
  const hmDigest = useEvd("hydration-mismatch-detail", "digest");
  const hmMessage = useEvd("hydration-mismatch-detail", "message");
  const csrMs = useEvd("csr-fallback-duration", "ms");
  const wvApp = useEvd("webview-detected", "app");
  const urlRemoved = useEvd("url-cleaned", "removed");
  const ttfb = useEvd("pageview-perf", "ttfb");
  const fcp = useEvd("pageview-perf", "fcp");
  const adVariant = useEvd("ad-landing", "variant");
  const adSource = useEvd("ad-landing", "source");
  const adMedium = useEvd("ad-landing", "medium");
  const adCampaign = useEvd("ad-landing", "campaign");
  const adFbclid = useEvd("ad-landing", "hasFbclid");
  const adReferrer = useEvd("ad-landing", "referrer");
  const adWebview = useEvd("ad-landing", "webview");
  const adApp = useEvd("ad-landing", "app");
  const adPath = useEvd("ad-landing", "path");

  const data = useMemo(() => {
    const allEvents = events.data?.data ?? [];
    const allSessions = sessionsQ.data?.data ?? [];
    const errorEvents = filterErrorEvents(allEvents);
    const queryParams = analyzeQueryParams(errorEvents);
    const routes = analyzeRoutes(errorEvents);
    const sessions = analyzeSessions(errorEvents);
    const hourly = analyzeHourly(errorEvents);
    const errorBreakdown = breakdownErrorCodes(counts.data ?? []);
    const totalErrors = errorBreakdown.reduce((acc, e) => acc + e.count, 0);
    const adLanding = (counts.data ?? [])
      .filter((c) => c.x === "ad-landing")
      .reduce((acc, c) => acc + c.y, 0);
    const uniqueErrorSessions = countUniqueErrorSessions(errorEvents);
    const hydrationTotal = errorBreakdown
      .filter((e) => e.eventName.startsWith("hydration-error"))
      .reduce((acc, e) => acc + e.count, 0);
    const csrFallback = analyzeCsrFallback(allEvents, hydrationTotal);
    const inAppBrowsers = analyzeInAppBrowsers(allEvents, allSessions);
    const bounceImpact = analyzeBounceImpact(allEvents, allSessions);
    const suspenseTiming = analyzeSuspenseTiming(allEvents);
    const hydrationDetails = analyzeHydrationDetails(
      hmComponent.data ?? [],
      hmStack.data ?? [],
      hmDigest.data ?? [],
      hmMessage.data ?? [],
    );
    const csrDuration = analyzeCsrDuration(csrMs.data ?? []);
    const webViews = analyzeWebViews(wvApp.data ?? []);
    const urlCleaned = analyzeUrlCleaned(urlRemoved.data ?? []);
    const pageviewPerf = analyzePageviewPerf(ttfb.data ?? [], fcp.data ?? []);
    const acquisition = analyzeAcquisition({
      variant: adVariant.data ?? [],
      source: adSource.data ?? [],
      medium: adMedium.data ?? [],
      campaign: adCampaign.data ?? [],
      hasFbclid: adFbclid.data ?? [],
      referrer: adReferrer.data ?? [],
      webview: adWebview.data ?? [],
      app: adApp.data ?? [],
      path: adPath.data ?? [],
      totalAdLanding: adLanding,
    });
    const liteFunnel = analyzeLiteFunnel(counts.data ?? []);
    const hypotheses = generateHypotheses({
      queryParams,
      routes,
      hourly,
      sessions,
      totalErrors,
      totalAdLanding: adLanding,
      uniqueErrorSessions,
      errorBreakdown,
    });
    return {
      errorEvents,
      queryParams,
      routes,
      sessions,
      hourly,
      errorBreakdown,
      totalErrors,
      adLanding,
      hypotheses,
      csrFallback,
      inAppBrowsers,
      bounceImpact,
      suspenseTiming,
      hydrationDetails,
      csrDuration,
      webViews,
      urlCleaned,
      pageviewPerf,
      acquisition,
      liteFunnel,
    };
  }, [
    events.data,
    counts.data,
    sessionsQ.data,
    hmComponent.data,
    hmStack.data,
    hmDigest.data,
    hmMessage.data,
    csrMs.data,
    wvApp.data,
    urlRemoved.data,
    ttfb.data,
    fcp.data,
    adVariant.data,
    adSource.data,
    adMedium.data,
    adCampaign.data,
    adFbclid.data,
    adReferrer.data,
    adWebview.data,
    adApp.data,
    adPath.data,
  ]);

  const agentPrompt = useMemo(
    () =>
      buildAgentPrompt({
        hypotheses: data.hypotheses,
        errorBreakdown: data.errorBreakdown,
        topRoutes: data.routes,
        topQueryParams: data.queryParams,
        csrFallback: data.csrFallback,
        inAppBrowsers: data.inAppBrowsers,
        bounceImpact: data.bounceImpact,
        suspenseTiming: data.suspenseTiming,
        hydrationDetails: data.hydrationDetails,
        csrDuration: data.csrDuration,
        webViews: data.webViews,
        urlCleaned: data.urlCleaned,
        pageviewPerf: data.pageviewPerf,
        acquisition: data.acquisition,
        liteFunnel: data.liteFunnel,
        period: PERIOD_LABEL[period],
        generatedAt: new Date().toISOString(),
      }),
    [data, period],
  );

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const isLoading = counts.isLoading || events.isLoading || series.isLoading || sessionsQ.isLoading;
  const peakHour = data.hourly.reduce(
    (m, b) => (b.total > m.total ? b : m),
    data.hourly[0] ?? { hour: 0, total: 0, byType: {} },
  );

  if (isLoading) {
    return (
      <div className="text-center py-20 text-muted-foreground text-sm">
        Analyse en cours…
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header / actions */}
      <section className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Brain className="size-5 text-primary" />
            Diagnostic des erreurs — {PERIOD_LABEL[period]}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Analyse croisée des événements Umami pour identifier les causes racines.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyPrompt}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-neon px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition"
          >
            {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
            {copied ? "Copié !" : "Copier prompt agent IA"}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs font-medium ring-1 ring-border hover:bg-accent transition"
          >
            <Printer className="size-3.5" />
            Imprimer / PDF
          </button>
        </div>
      </section>

      {/* Print header */}
      <section className="hidden print:block">
        <h1 className="text-2xl font-bold">Rapport de diagnostic — radiosphere.be</h1>
        <p className="text-sm text-muted-foreground">
          Période : {PERIOD_LABEL[period]} · Généré le{" "}
          {new Date().toLocaleString("fr-BE")}
        </p>
      </section>

      {/* Synthèse */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          icon={AlertTriangle}
          label="Erreurs totales"
          value={data.totalErrors.toLocaleString()}
          accent="danger"
        />
        <SummaryCard
          icon={RouteIcon}
          label="Routes touchées"
          value={data.routes.length.toString()}
          hint={data.routes[0]?.path ? `Top: ${data.routes[0].path}` : "—"}
          accent="violet"
        />
        <SummaryCard
          icon={Clock}
          label="Pic horaire"
          value={`${peakHour.hour}h`}
          hint={`${peakHour.total} erreurs`}
          accent="blue"
        />
      </section>

      {/* Hypothèses */}
      <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60">
          <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <ListOrdered className="size-4" />
            Hypothèses prioritaires
          </h3>
          <p className="text-xs text-muted-foreground">
            Classées par confiance, basées sur les corrélations détectées
          </p>
        </div>
        <div className="divide-y divide-border/40">
          {data.hypotheses.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucune hypothèse générée — données insuffisantes ou pas d'erreur détectée.
            </div>
          )}
          {data.hypotheses.map((h) => (
            <article key={h.rank} className="p-5 space-y-3 print:break-inside-avoid">
              <div className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center size-7 rounded-full bg-gradient-neon text-primary-foreground text-xs font-bold shrink-0">
                  {h.rank}
                </span>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold">{h.title}</h4>
                  <span
                    className={
                      "inline-block mt-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 " +
                      (h.confidence === "high"
                        ? "bg-destructive/20 text-destructive ring-destructive/40"
                        : h.confidence === "medium"
                          ? "bg-warning/20 text-warning ring-warning/40"
                          : "bg-muted text-muted-foreground ring-border")
                    }
                  >
                    Confiance : {h.confidence}
                  </span>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 pl-10">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Preuves</p>
                  <ul className="space-y-1 text-xs">
                    {h.evidence.map((e, i) => (
                      <li key={i} className="text-foreground/80">
                        • {e}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Pistes de correction
                  </p>
                  <ul className="space-y-1 text-xs">
                    {h.fixSuggestions.map((s, i) => (
                      <li key={i} className="text-foreground/80">
                        → {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Breakdown par code */}
      <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
        <div className="px-5 py-4 border-b border-border/60">
          <h3 className="text-sm font-semibold tracking-tight">
            Décodage des erreurs React
          </h3>
          <p className="text-xs text-muted-foreground">
            Signification + checklist de fix pour chaque type
          </p>
        </div>
        <div className="divide-y divide-border/40">
          {data.errorBreakdown.map((e) => (
            <article key={e.eventName} className="p-5 space-y-2 print:break-inside-avoid">
              <div className="flex items-center justify-between gap-3">
                <code className="text-sm font-mono font-semibold text-primary">
                  {e.eventName}
                </code>
                <span className="text-sm tabular-nums font-bold">{e.count}</span>
              </div>
              <p className="text-xs text-foreground/80 italic">{e.meaning}</p>
              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Causes typiques
                  </p>
                  <ul className="space-y-0.5 text-xs">
                    {e.commonCauses.map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Checklist de fix
                  </p>
                  <ul className="space-y-0.5 text-xs">
                    {e.fixChecklist.map((c, i) => (
                      <li key={i}>✓ {c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CSR Fallback impact */}
      {data.csrFallback.total > 0 && (
        <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-4 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              Impact UX — CSR fallback déclenché
            </h3>
            <p className="text-xs text-muted-foreground">
              React a abandonné l'hydratation et re-rendu côté client (flash visible). Indicateur d'impact, pas de cause.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/40">
            <CsrStat label="Fallbacks" value={data.csrFallback.total.toLocaleString()} />
            <CsrStat label="Sessions touchées" value={data.csrFallback.uniqueSessions.toLocaleString()} />
            <CsrStat
              label="Ratio / hydration"
              value={`${data.csrFallback.ratioToHydration}%`}
              hint={data.csrFallback.ratioToHydration > 50 ? "majorité des mismatchs" : "récupération React fréquente"}
            />
            <CsrStat
              label="Taux récupération"
              value={`${data.csrFallback.recoveryRate}%`}
              hint={data.csrFallback.recoveryRate < 50 ? "⚠ users bouncent" : "users résilients"}
              danger={data.csrFallback.recoveryRate < 50}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-px bg-border/40">
            <div className="bg-card/20 p-5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Top routes affectées
              </p>
              {data.csrFallback.topRoutes.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.csrFallback.topRoutes.slice(0, 6).map((r) => (
                    <li key={r.path} className="flex justify-between gap-3">
                      <code className="font-mono text-foreground/80 truncate">{r.path}</code>
                      <span className="tabular-nums font-semibold">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-card/20 p-5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Query params corrélés
              </p>
              {data.csrFallback.queryParamCorrelation.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.csrFallback.queryParamCorrelation.slice(0, 6).map((p) => (
                    <li key={p.param} className="flex justify-between gap-3">
                      <code className="font-mono text-foreground/80">{p.param}</code>
                      <span className="tabular-nums font-semibold">{p.pctOfFallbacks}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Hydration mismatch detail (React 19 onRecoverableError) */}
      {data.hydrationDetails.totalEvents > 0 && (
        <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-4 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <Brain className="size-4 text-primary" />
              Composants fautifs (hydration-mismatch-detail)
            </h3>
            <p className="text-xs text-muted-foreground">
              {data.hydrationDetails.totalEvents} détails capturés via React 19{" "}
              <code>onRecoverableError</code> — smoking gun direct.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-px bg-border/40">
            <div className="bg-card/20 p-5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Top composants
              </p>
              {data.hydrationDetails.topComponents.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {data.hydrationDetails.topComponents.slice(0, 6).map((c, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <code className="font-mono text-foreground/80 truncate" title={c.value}>
                        {c.value.length > 60 ? c.value.slice(0, 60) + "…" : c.value}
                      </code>
                      <span className="tabular-nums font-semibold shrink-0">
                        {c.count} <span className="text-muted-foreground">({c.pct}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-card/20 p-5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Digests / messages
              </p>
              {data.hydrationDetails.topDigests.length > 0 && (
                <ul className="space-y-1 text-xs mb-2">
                  {data.hydrationDetails.topDigests.slice(0, 4).map((d, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <code className="font-mono text-foreground/70">{d.value}</code>
                      <span className="tabular-nums">{d.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              {data.hydrationDetails.topMessages.slice(0, 3).map((m, i) => (
                <p key={i} className="text-[11px] text-muted-foreground italic">
                  ({m.count}×) {m.value.length > 100 ? m.value.slice(0, 100) + "…" : m.value}
                </p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CSR fallback duration */}
      {data.csrDuration.count > 0 && (
        <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-4 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <Clock className="size-4" />
              Durée du flash CSR fallback (mesure réelle)
            </h3>
            <p className="text-xs text-muted-foreground">
              Temps que voit l'utilisateur entre l'échec d'hydratation et le re-render complet.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border/40">
            <CsrStat label="Échantillons" value={data.csrDuration.count.toLocaleString()} />
            <CsrStat
              label="Médiane"
              value={`${data.csrDuration.medianMs}ms`}
              danger={data.csrDuration.medianMs > 1500}
              hint={
                data.csrDuration.medianMs > 1500
                  ? "🚨 bounce probable"
                  : data.csrDuration.medianMs > 500
                    ? "⚠ flash perçu"
                    : "imperceptible"
              }
            />
            <CsrStat label="p95" value={`${data.csrDuration.p95Ms}ms`} />
            <CsrStat label="> 500ms" value={data.csrDuration.over500ms.toLocaleString()} />
            <CsrStat
              label="> 1500ms"
              value={data.csrDuration.over1500ms.toLocaleString()}
              danger={data.csrDuration.over1500ms > 0}
            />
          </div>
        </section>
      )}

      {/* WebView detection */}
      {data.webViews.total > 0 && (
        <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-4 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight">
              WebView in-app détectés (côté client)
            </h3>
            <p className="text-xs text-muted-foreground">
              {data.webViews.total} détections via parsing UA — plus fiable que le champ{" "}
              <code>browser</code> Umami.
            </p>
          </div>
          <div className="p-5">
            <ul className="space-y-1.5 text-xs">
              {data.webViews.byApp.map((a) => (
                <li key={a.app} className="flex items-center gap-3">
                  <span className="font-medium w-32 truncate">{a.app}</span>
                  <div className="flex-1 h-2 rounded-full bg-card/40 overflow-hidden">
                    <div className="h-full bg-gradient-neon" style={{ width: `${a.pct}%` }} />
                  </div>
                  <span className="tabular-nums font-semibold w-20 text-right">
                    {a.count} <span className="text-muted-foreground">({a.pct}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* URL cleaned */}
      {data.urlCleaned.total > 0 && (
        <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-4 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <Check className="size-4 text-primary" />
              URLs nettoyées côté client (suivi du fix)
            </h3>
            <p className="text-xs text-muted-foreground">
              {data.urlCleaned.total} nettoyages via <code>history.replaceState</code>.
            </p>
          </div>
          <div className="p-5">
            <ul className="space-y-1 text-xs">
              {data.urlCleaned.topRemoved.map((r) => (
                <li key={r.param} className="flex justify-between gap-3">
                  <code className="font-mono text-foreground/80">{r.param}</code>
                  <span className="tabular-nums font-semibold">
                    {r.count} <span className="text-muted-foreground">({r.pct}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Pageview perf */}
      {(data.pageviewPerf.ttfbCount > 0 || data.pageviewPerf.fcpCount > 0) && (
        <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-4 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight">Core Web Vitals (TTFB / FCP)</h3>
            <p className="text-xs text-muted-foreground">
              Mesuré côté client via <code>PerformanceObserver</code>.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-3">Métrique</th>
                <th className="text-right font-medium px-5 py-3">Échantillons</th>
                <th className="text-right font-medium px-5 py-3">Médiane</th>
                <th className="text-right font-medium px-5 py-3">p95</th>
                <th className="text-left font-medium px-5 py-3">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {data.pageviewPerf.ttfbCount > 0 && (
                <tr className="border-t border-border/40">
                  <td className="px-5 py-2.5 font-mono text-xs">TTFB</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {data.pageviewPerf.ttfbCount}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold">
                    {data.pageviewPerf.ttfbMedianMs}ms
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {data.pageviewPerf.ttfbP95Ms}ms
                  </td>
                  <td className="px-5 py-2.5 text-xs">
                    {data.pageviewPerf.ttfbMedianMs < 800
                      ? "🟢 bon"
                      : data.pageviewPerf.ttfbMedianMs < 1800
                        ? "🟡 à améliorer"
                        : "🔴 mauvais"}
                  </td>
                </tr>
              )}
              {data.pageviewPerf.fcpCount > 0 && (
                <tr className="border-t border-border/40">
                  <td className="px-5 py-2.5 font-mono text-xs">FCP</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {data.pageviewPerf.fcpCount}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold">
                    {data.pageviewPerf.fcpMedianMs}ms
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {data.pageviewPerf.fcpP95Ms}ms
                  </td>
                  <td className="px-5 py-2.5 text-xs">
                    {data.pageviewPerf.fcpMedianMs < 1800
                      ? "🟢 bon"
                      : data.pageviewPerf.fcpMedianMs < 3000
                        ? "🟡 à améliorer"
                        : "🔴 mauvais"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* Environnements (in-app browsers) */}
      {data.inAppBrowsers.totalSessionsWith418Fbclid > 0 && (
        <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-4 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight">
              Environnements — sessions avec #418 + fbclid
            </h3>
            <p className="text-xs text-muted-foreground">
              {data.inAppBrowsers.totalSessionsWith418Fbclid} sessions concernées ·{" "}
              <span className={data.inAppBrowsers.inAppShare > 50 ? "text-destructive font-semibold" : "text-warning"}>
                {data.inAppBrowsers.inAppShare}% navigateur in-app social
              </span>
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-px bg-border/40">
            <RankList title="Navigateurs" items={data.inAppBrowsers.topBrowsers} />
            <RankList title="OS" items={data.inAppBrowsers.topOs} />
            <RankList title="Devices" items={data.inAppBrowsers.topDevices} />
          </div>
        </section>
      )}

      {/* Bounce impact */}
      {(data.bounceImpact.cleanSessions > 0 || data.bounceImpact.cascadeSessions > 0) && (
        <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-4 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight">
              Impact comportemental — bounce stratifié
            </h3>
            <p className="text-xs text-muted-foreground">
              Sessions saines vs cascade d'erreurs (≥3) vs non-récupérées après fallback CSR
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-3">Cohorte</th>
                <th className="text-right font-medium px-5 py-3">Sessions</th>
                <th className="text-right font-medium px-5 py-3">Bounce</th>
                <th className="text-right font-medium px-5 py-3">Durée méd.</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border/40">
                <td className="px-5 py-2.5 text-xs">Sans erreur</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{data.bounceImpact.cleanSessions}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{data.bounceImpact.cleanBounceRate}%</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{data.bounceImpact.cleanMedianDuration}s</td>
              </tr>
              <tr className="border-t border-border/40">
                <td className="px-5 py-2.5 text-xs">Cascade ≥3 erreurs</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{data.bounceImpact.cascadeSessions}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  <span
                    className={
                      data.bounceImpact.cascadeBounceRate > data.bounceImpact.cleanBounceRate + 10
                        ? "text-destructive font-semibold"
                        : ""
                    }
                  >
                    {data.bounceImpact.cascadeBounceRate}%
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">{data.bounceImpact.cascadeMedianDuration}s</td>
              </tr>
              <tr className="border-t border-border/40">
                <td className="px-5 py-2.5 text-xs">Non-récupérées (post-fallback)</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{data.bounceImpact.nonRecoveredAfterFallback}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">—</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{data.bounceImpact.nonRecoveredMedianDuration}s</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Suspense timing */}
      {data.suspenseTiming.some((s) => s.total > 0) && (
        <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-4 border-b border-border/60">
            <h3 className="text-sm font-semibold tracking-tight">
              Chronologie Suspense (#421 / #423)
            </h3>
            <p className="text-xs text-muted-foreground">
              Délai entre arrivée et erreur — &lt;500ms = rendu initial · ≥500ms = clic précoce
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-3">Code</th>
                <th className="text-right font-medium px-5 py-3">Total</th>
                <th className="text-right font-medium px-5 py-3">Immédiat</th>
                <th className="text-right font-medium px-5 py-3">Tardif</th>
                <th className="text-right font-medium px-5 py-3">Médiane</th>
              </tr>
            </thead>
            <tbody>
              {data.suspenseTiming
                .filter((s) => s.total > 0)
                .map((s) => (
                  <tr key={s.eventName} className="border-t border-border/40">
                    <td className="px-5 py-2.5 font-mono text-xs">{s.eventName}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{s.total}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {s.immediateCount} ({s.immediatePct}%)
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{s.delayedCount}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{s.medianDelayMs}ms</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Query params */}
      <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
        <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
          <Link2 className="size-4" />
          <h3 className="text-sm font-semibold tracking-tight">
            Query params dans les URLs en erreur
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-5 py-3">Param</th>
              <th className="text-right font-medium px-5 py-3">% erreurs</th>
              <th className="text-right font-medium px-5 py-3">Occurrences</th>
              <th className="text-right font-medium px-5 py-3">Valeurs uniques</th>
              <th className="text-left font-medium px-5 py-3">Exemples</th>
            </tr>
          </thead>
          <tbody>
            {data.queryParams.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  Aucun query param détecté dans les URLs en erreur.
                </td>
              </tr>
            )}
            {data.queryParams.slice(0, 15).map((p) => (
              <tr key={p.param} className="border-t border-border/40">
                <td className="px-5 py-2.5 font-mono text-xs font-semibold">{p.param}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  <span
                    className={
                      "px-2 py-0.5 rounded text-xs font-semibold " +
                      (p.percentOfErrors >= 80
                        ? "bg-destructive/20 text-destructive"
                        : p.percentOfErrors >= 50
                          ? "bg-warning/20 text-warning"
                          : "bg-muted text-muted-foreground")
                    }
                  >
                    {p.percentOfErrors}%
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">{p.occurrences}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{p.uniqueValues}</td>
                <td className="px-5 py-2.5 font-mono text-[10px] text-muted-foreground truncate max-w-xs">
                  {p.exampleValues.map((v) => v.slice(0, 30)).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Routes */}
      <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
        <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
          <RouteIcon className="size-4" />
          <h3 className="text-sm font-semibold tracking-tight">Top routes en erreur</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-5 py-3">Route</th>
              <th className="text-right font-medium px-5 py-3">Erreurs</th>
              <th className="text-left font-medium px-5 py-3">Types détectés</th>
            </tr>
          </thead>
          <tbody>
            {data.routes.slice(0, 15).map((r) => (
              <tr key={r.path} className="border-t border-border/40">
                <td className="px-5 py-2.5 font-mono text-xs">{r.path}</td>
                <td className="px-5 py-2.5 text-right tabular-nums font-semibold">
                  {r.errorCount}
                </td>
                <td className="px-5 py-2.5 text-xs text-muted-foreground">
                  {Object.entries(r.errorTypes)
                    .map(([k, v]) => `${k} (${v})`)
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Heatmap horaire */}
      <section className="rounded-2xl bg-gradient-card border-neon shadow-neon p-5 print:break-inside-avoid">
        <h3 className="text-sm font-semibold tracking-tight mb-3 flex items-center gap-2">
          <Clock className="size-4" />
          Distribution horaire des erreurs
        </h3>
        <div className="grid grid-cols-12 sm:grid-cols-24 gap-1">
          {data.hourly.map((b) => {
            const max = Math.max(...data.hourly.map((x) => x.total), 1);
            const intensity = b.total / max;
            return (
              <div key={b.hour} className="flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${Math.max(8, intensity * 60)}px`,
                    background: `color-mix(in oklab, var(--neon-violet) ${Math.round(20 + intensity * 80)}%, transparent)`,
                  }}
                  title={`${b.hour}h : ${b.total} erreurs`}
                />
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  {b.hour}
                </span>
                <span className="text-[9px] tabular-nums font-semibold">{b.total}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sessions cassées */}
      <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:break-inside-avoid">
        <div className="px-5 py-4 border-b border-border/60">
          <h3 className="text-sm font-semibold tracking-tight">
            Sessions qui crashent en boucle
          </h3>
          <p className="text-xs text-muted-foreground">
            Top {data.sessions.length} sessions avec le plus d'erreurs
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-5 py-3">Session</th>
              <th className="text-right font-medium px-5 py-3">Erreurs</th>
              <th className="text-left font-medium px-5 py-3">Routes</th>
              <th className="text-left font-medium px-5 py-3">Types</th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                  Aucune session récurrente.
                </td>
              </tr>
            )}
            {data.sessions.map((s) => (
              <tr key={s.sessionId} className="border-t border-border/40">
                <td className="px-5 py-2.5 font-mono text-[10px] text-muted-foreground">
                  {s.sessionId.slice(0, 12)}…
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums font-semibold">
                  {s.errorCount}
                </td>
                <td className="px-5 py-2.5 text-xs">{s.routes.join(", ")}</td>
                <td className="px-5 py-2.5 text-xs text-muted-foreground">
                  {s.errorTypes.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Prompt brut pour agent IA */}
      <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden print:hidden">
        <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <Brain className="size-4 text-primary" />
              Prompt prêt à coller dans l'agent IA
            </h3>
            <p className="text-xs text-muted-foreground">
              Markdown complet du rapport — colle-le dans le chat de Radio Sphere
            </p>
          </div>
          <button
            onClick={copyPrompt}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-neon px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition"
          >
            {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
            {copied ? "Copié !" : "Copier"}
          </button>
        </div>
        <pre className="px-5 py-4 text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-96 whitespace-pre-wrap">
          {agentPrompt}
        </pre>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  accent: "danger" | "violet" | "blue";
}) {
  const accentClass =
    accent === "danger"
      ? "bg-destructive/15 text-destructive ring-destructive/40"
      : accent === "violet"
        ? "bg-accent/30 text-foreground ring-accent"
        : "bg-primary/15 text-primary ring-primary/40";
  return (
    <div className="rounded-2xl bg-gradient-card border-neon shadow-neon p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <div
          className={`size-9 rounded-xl flex items-center justify-center ring-1 ${accentClass}`}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight mt-2 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function CsrStat({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="bg-card/20 p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          "text-2xl font-bold tracking-tight mt-1 tabular-nums " +
          (danger ? "text-destructive" : "text-foreground")
        }
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function RankList({
  title,
  items,
}: {
  title: string;
  items: { name: string; count: number; pct: number }[];
}) {
  return (
    <div className="bg-card/20 p-5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.slice(0, 6).map((it) => (
            <li key={it.name} className="flex justify-between gap-3">
              <span className="text-foreground/80 truncate">{it.name}</span>
              <span className="tabular-nums font-semibold">
                {it.count} <span className="text-muted-foreground">({it.pct}%)</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
