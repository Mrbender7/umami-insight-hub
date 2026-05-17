import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ERROR_EVENTS, type EventSeriesPoint, type PageviewSeries, type Period } from "@/lib/umami";
import { useMemo } from "react";

function formatBucket(t: string, period: Period): string {
  const d = new Date(t);
  if (period === "24h" || period === "1h" || period === "6h" || period === "12h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function TrafficChart({
  series,
  period,
  pageviewsTotal,
  pageviewsGoogle,
  pageviewsFacebook,
}: {
  series: EventSeriesPoint[];
  period: Period;
  pageviewsTotal?: PageviewSeries;
  pageviewsGoogle?: PageviewSeries;
  pageviewsFacebook?: PageviewSeries;
}) {
  const data = useMemo(() => {
    const errSet = new Set<string>(ERROR_EVENTS);
    const buckets = new Map<
      string,
      { t: string; trafic: number; erreurs: number; google: number; facebook: number; autres: number }
    >();
    const ensure = (key: string) => {
      let cur = buckets.get(key);
      if (!cur) {
        cur = { t: key, trafic: 0, erreurs: 0, google: 0, facebook: 0, autres: 0 };
        buckets.set(key, cur);
      }
      return cur;
    };
    for (const p of series) {
      const cur = ensure(p.t);
      if (p.x === "ad-landing") cur.trafic += p.y;
      if (errSet.has(p.x)) cur.erreurs += p.y;
    }
    const googleByT = new Map<string, number>();
    (pageviewsGoogle?.pageviews ?? []).forEach((p) => googleByT.set(p.x, (googleByT.get(p.x) ?? 0) + p.y));
    const fbByT = new Map<string, number>();
    (pageviewsFacebook?.pageviews ?? []).forEach((p) => fbByT.set(p.x, (fbByT.get(p.x) ?? 0) + p.y));
    (pageviewsTotal?.pageviews ?? []).forEach((p) => {
      const cur = ensure(p.x);
      cur.google = googleByT.get(p.x) ?? 0;
      cur.facebook = fbByT.get(p.x) ?? 0;
      cur.autres = Math.max(0, p.y - cur.google - cur.facebook);
    });
    // si total absent mais google/fb présents, on les ajoute quand même
    if (!pageviewsTotal) {
      googleByT.forEach((y, t) => { ensure(t).google = y; });
      fbByT.forEach((y, t) => { ensure(t).facebook = y; });
    }
    return Array.from(buckets.values())
      .sort((a, b) => +new Date(a.t) - +new Date(b.t))
      .map((d) => ({ ...d, label: formatBucket(d.t, period) }));
  }, [series, period, pageviewsTotal, pageviewsGoogle, pageviewsFacebook]);

  return (
    <div className="rounded-2xl bg-gradient-card p-5 border-neon shadow-neon">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Trafic, sources & erreurs</h2>
          <p className="text-xs text-muted-foreground">Évolution sur la période</p>
        </div>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradTrafic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.72 0.22 245)" stopOpacity={0.7} />
                <stop offset="100%" stopColor="oklch(0.72 0.22 245)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradErreurs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.65 0.27 305)" stopOpacity={0.7} />
                <stop offset="100%" stopColor="oklch(0.65 0.27 305)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradGoogle" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.75 0.18 145)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="oklch(0.75 0.18 145)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradFacebook" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.62 0.22 265)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="oklch(0.62 0.22 265)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAutres" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.72 0.12 80)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="oklch(0.72 0.12 80)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.3 0.02 270 / 30%)" vertical={false} />
            <XAxis dataKey="label" stroke="oklch(0.68 0.02 270)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="oklch(0.68 0.02 270)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "oklch(0.20 0.018 270)",
                border: "1px solid oklch(0.3 0.02 270 / 60%)",
                borderRadius: 12,
                fontSize: 12,
              }}
              labelStyle={{ color: "oklch(0.97 0.005 270)" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="google" name="Google" stroke="oklch(0.75 0.18 145)" fill="url(#gradGoogle)" strokeWidth={1.8} />
            <Area type="monotone" dataKey="facebook" name="Facebook" stroke="oklch(0.62 0.22 265)" fill="url(#gradFacebook)" strokeWidth={1.8} />
            <Area type="monotone" dataKey="autres" name="Autres sources" stroke="oklch(0.72 0.12 80)" fill="url(#gradAutres)" strokeWidth={1.8} />
            <Area type="monotone" dataKey="trafic" name="Ad landing" stroke="oklch(0.72 0.22 245)" fill="url(#gradTrafic)" strokeWidth={2} />
            <Area type="monotone" dataKey="erreurs" name="Erreurs" stroke="oklch(0.65 0.27 305)" fill="url(#gradErreurs)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
