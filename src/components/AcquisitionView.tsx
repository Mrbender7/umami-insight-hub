import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe2, Megaphone, Smartphone, Filter } from "lucide-react";
import {
  getRange,
  getEventCounts,
  getEventDataValues,
  getSessions,
  type Period,
  type EventDataValue,
} from "@/lib/umami";
import { analyzeAcquisition, analyzeLiteFunnel } from "@/lib/diagnostic";

type Variant = "all" | "lite" | "full";
type Device = "all" | "mobile" | "desktop";

const SOURCE_BUCKETS: { id: string; label: string; match: (v: string) => boolean }[] = [
  { id: "facebook", label: "Facebook", match: (v) => /facebook|fb/i.test(v) },
  { id: "instagram", label: "Instagram", match: (v) => /instagram|ig/i.test(v) },
  { id: "google", label: "Google", match: (v) => /google|gclid|adwords/i.test(v) },
  { id: "tiktok", label: "TikTok", match: (v) => /tiktok/i.test(v) },
  { id: "snapchat", label: "Snapchat", match: (v) => /snap/i.test(v) },
  { id: "linkedin", label: "LinkedIn", match: (v) => /linkedin/i.test(v) },
  { id: "webview", label: "WebView (autre)", match: (v) => /webview/i.test(v) },
  { id: "direct", label: "Direct / inconnu", match: (v) => !v || v === "unknown" || v === "none" },
];

function bucketize(values: EventDataValue[]) {
  const buckets = new Map<string, number>();
  let other = 0;
  for (const v of values) {
    const matched = SOURCE_BUCKETS.find((b) => b.match(v.fieldValue));
    if (matched) buckets.set(matched.id, (buckets.get(matched.id) ?? 0) + v.total);
    else other += v.total;
  }
  return SOURCE_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: buckets.get(b.id) ?? 0 }))
    .concat([{ id: "other", label: "Autre", count: other }])
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function AcquisitionView({ period }: { period: Period }) {
  const range = useMemo(() => getRange(period), [period]);
  const [variant, setVariant] = useState<Variant>("all");
  const [device, setDevice] = useState<Device>("all");

  const counts = useQuery({
    queryKey: ["umami-counts", period],
    queryFn: () => getEventCounts(range),
  });
  const sessionsQ = useQuery({
    queryKey: ["umami-sessions", period],
    queryFn: () => getSessions(range),
  });
  const useEvd = (eventName: string, fieldName: string) =>
    useQuery({
      queryKey: ["umami-evd", period, eventName, fieldName],
      queryFn: () => getEventDataValues(range, eventName, fieldName),
    });
  const adVariant = useEvd("ad-landing", "variant");
  const adSource = useEvd("ad-landing", "source");
  const adMedium = useEvd("ad-landing", "medium");
  const adCampaign = useEvd("ad-landing", "campaign");
  const adFbclid = useEvd("ad-landing", "hasFbclid");
  const adReferrer = useEvd("ad-landing", "referrer");
  const adWebview = useEvd("ad-landing", "webview");
  const adApp = useEvd("ad-landing", "app");
  const adPath = useEvd("ad-landing", "path");

  // Filtre variant : on scale les valeurs en proportion lite/full du total. Approximation grossière
  // mais nécessaire car Umami event-data ne croise pas plusieurs propriétés.
  const adLandingTotal = (counts.data ?? [])
    .filter((c) => c.x === "ad-landing")
    .reduce((acc, c) => acc + c.y, 0);

  const acquisition = useMemo(
    () =>
      analyzeAcquisition({
        variant: adVariant.data ?? [],
        source: adSource.data ?? [],
        medium: adMedium.data ?? [],
        campaign: adCampaign.data ?? [],
        hasFbclid: adFbclid.data ?? [],
        referrer: adReferrer.data ?? [],
        webview: adWebview.data ?? [],
        app: adApp.data ?? [],
        path: adPath.data ?? [],
        totalAdLanding: adLandingTotal,
      }),
    [
      adVariant.data,
      adSource.data,
      adMedium.data,
      adCampaign.data,
      adFbclid.data,
      adReferrer.data,
      adWebview.data,
      adApp.data,
      adPath.data,
      adLandingTotal,
    ],
  );

  const liteFunnel = useMemo(() => analyzeLiteFunnel(counts.data ?? []), [counts.data]);

  // Bar par source bucketée (Facebook / Google / Instagram / etc.)
  const sourceBuckets = useMemo(() => bucketize(adSource.data ?? []), [adSource.data]);
  const maxBucket = Math.max(1, ...sourceBuckets.map((b) => b.count));

  // Filtre device (informatif) — calculé sur les sessions
  const deviceStats = useMemo(() => {
    const all = sessionsQ.data?.data ?? [];
    const map = new Map<string, number>();
    for (const s of all) map.set(s.device || "inconnu", (map.get(s.device || "inconnu") ?? 0) + 1);
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessionsQ.data]);

  const filteredVariantTotal =
    variant === "lite" ? acquisition.liteCount : variant === "full" ? acquisition.fullCount : acquisition.total;

  if (counts.isLoading || adSource.isLoading) {
    return <div className="text-center py-20 text-muted-foreground text-sm">Chargement…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header + filtres */}
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Megaphone className="size-5 text-primary" />
            Acquisition — d'où viennent les visiteurs ?
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Arrivées via Facebook, Google, Instagram, page Lite et WebView in-app.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Filter className="size-3.5 text-muted-foreground" />
          <select
            value={variant}
            onChange={(e) => setVariant(e.target.value as Variant)}
            className="rounded-lg bg-card px-2 py-1.5 ring-1 ring-border text-xs"
          >
            <option value="all">Tous variants</option>
            <option value="lite">Lite uniquement</option>
            <option value="full">Full uniquement</option>
          </select>
          <select
            value={device}
            onChange={(e) => setDevice(e.target.value as Device)}
            className="rounded-lg bg-card px-2 py-1.5 ring-1 ring-border text-xs"
          >
            <option value="all">Tous devices</option>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
          </select>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Arrivées" value={filteredVariantTotal.toLocaleString()} />
        <Kpi
          label="Variant Lite"
          value={`${acquisition.liteCount.toLocaleString()}`}
          hint={`${acquisition.total > 0 ? Math.round((acquisition.liteCount / acquisition.total) * 100) : 0}% du total`}
        />
        <Kpi
          label="WebView in-app"
          value={`${acquisition.webviewPct}%`}
          hint={`${acquisition.webviewCount} arrivées`}
        />
        <Kpi
          label="Avec fbclid"
          value={`${acquisition.hasFbclidPct}%`}
          hint={`${acquisition.hasFbclidCount} arrivées`}
        />
      </section>

      {/* Bar chart sources */}
      <section className="rounded-2xl bg-gradient-card border-neon shadow-neon p-5">
        <h3 className="text-sm font-semibold tracking-tight mb-4 flex items-center gap-2">
          <Globe2 className="size-4" />
          Arrivées par canal
        </h3>
        {sourceBuckets.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune source détectée sur cette période.</p>
        ) : (
          <ul className="space-y-2.5">
            {sourceBuckets.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                <span className="text-xs font-medium w-32 truncate">{b.label}</span>
                <div className="flex-1 h-3 rounded-full bg-card/40 overflow-hidden">
                  <div
                    className="h-full bg-gradient-neon transition-all"
                    style={{ width: `${(b.count / maxBucket) * 100}%` }}
                  />
                </div>
                <span className="tabular-nums text-xs font-semibold w-16 text-right">
                  {b.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Funnel Lite */}
      <section className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60">
          <h3 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <Smartphone className="size-4" />
            Page Lite — entrée → conversion
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border/40">
          <Stat label="Vues Lite" value={liteFunnel.views.toLocaleString()} />
          <Stat label="CTA Full" value={liteFunnel.ctaFull.toLocaleString()} />
          <Stat label="CTA Android" value={liteFunnel.ctaAndroid.toLocaleString()} />
          <Stat label="Conv. Full" value={`${liteFunnel.fullConversionRate}%`} />
          <Stat label="Conv. Android" value={`${liteFunnel.androidConversionRate}%`} />
        </div>
      </section>

      {/* Tables side-by-side */}
      <section className="grid sm:grid-cols-2 gap-4">
        <Table title="Top campagnes" items={acquisition.topCampaigns} />
        <Table title="Top apps WebView" items={acquisition.topApps} />
      </section>

      <section className="grid sm:grid-cols-2 gap-4">
        <Table title="Top mediums" items={acquisition.topMediums} />
        <Table title="Top referrers" items={acquisition.topReferrers} />
      </section>

      <section className="grid sm:grid-cols-2 gap-4">
        <Table title="Pages d'arrivée" items={acquisition.topPaths} />
        <Table
          title={`Devices (sessions ${period})`}
          items={deviceStats.map((d) => ({ value: d.name, count: d.count, pct: 0 }))}
        />
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-gradient-card border-neon shadow-neon p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tracking-tight mt-2 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card/20 p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tracking-tight mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function Table({
  title,
  items,
}: {
  title: string;
  items: { value: string; count: number; pct: number }[];
}) {
  return (
    <div className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden">
      <div className="px-5 py-3 border-b border-border/60">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-xs text-muted-foreground">Aucune donnée.</p>
      ) : (
        <ul className="divide-y divide-border/30">
          {items.slice(0, 10).map((it, i) => (
            <li key={i} className="px-5 py-2 flex justify-between items-center gap-3 text-xs">
              <span className="truncate font-mono text-foreground/80" title={it.value}>
                {it.value || "—"}
              </span>
              <span className="tabular-nums font-semibold shrink-0">
                {it.count.toLocaleString()}
                {it.pct > 0 && <span className="text-muted-foreground ml-1">({it.pct}%)</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
