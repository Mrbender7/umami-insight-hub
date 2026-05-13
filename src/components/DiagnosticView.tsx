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

  const data = useMemo(() => {
    const allEvents = events.data?.data ?? [];
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
    };
  }, [events.data, counts.data]);

  const agentPrompt = useMemo(
    () =>
      buildAgentPrompt({
        hypotheses: data.hypotheses,
        errorBreakdown: data.errorBreakdown,
        topRoutes: data.routes,
        topQueryParams: data.queryParams,
        csrFallback: data.csrFallback,
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

  const isLoading = counts.isLoading || events.isLoading || series.isLoading;
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
