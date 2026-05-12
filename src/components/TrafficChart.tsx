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
import { ERROR_EVENTS, type EventSeriesPoint, type Period } from "@/lib/umami";
import { useMemo } from "react";

function formatBucket(t: string, period: Period): string {
  const d = new Date(t);
  if (period === "24h") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function TrafficChart({
  series,
  period,
}: {
  series: EventSeriesPoint[];
  period: Period;
}) {
  const data = useMemo(() => {
    const errSet = new Set<string>(ERROR_EVENTS);
    const buckets = new Map<string, { t: string; trafic: number; erreurs: number }>();
    for (const p of series) {
      const key = p.t;
      const cur = buckets.get(key) ?? { t: key, trafic: 0, erreurs: 0 };
      if (p.x === "ad-landing") cur.trafic += p.y;
      if (errSet.has(p.x)) cur.erreurs += p.y;
      buckets.set(key, cur);
    }
    return Array.from(buckets.values())
      .sort((a, b) => +new Date(a.t) - +new Date(b.t))
      .map((d) => ({ ...d, label: formatBucket(d.t, period) }));
  }, [series, period]);

  return (
    <div className="rounded-2xl bg-gradient-card p-5 border-neon shadow-neon">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Trafic vs Erreurs</h2>
          <p className="text-xs text-muted-foreground">Évolution sur la période</p>
        </div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradTrafic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.72 0.22 245)" stopOpacity={0.85} />
                <stop offset="100%" stopColor="oklch(0.72 0.22 245)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradErreurs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.65 0.27 305)" stopOpacity={0.85} />
                <stop offset="100%" stopColor="oklch(0.65 0.27 305)" stopOpacity={0} />
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
            <Area type="monotone" dataKey="trafic" name="Ad landing" stroke="oklch(0.72 0.22 245)" fill="url(#gradTrafic)" strokeWidth={2} />
            <Area type="monotone" dataKey="erreurs" name="Erreurs" stroke="oklch(0.65 0.27 305)" fill="url(#gradErreurs)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
