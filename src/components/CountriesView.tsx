import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { getCountries, getSessions, getRange, type Period } from "@/lib/umami";

// Codes ISO → noms français (top pays attendus)
const COUNTRY_NAMES: Record<string, string> = {
  BE: "Belgique", FR: "France", LU: "Luxembourg", CH: "Suisse", CA: "Canada",
  US: "États-Unis", GB: "Royaume-Uni", DE: "Allemagne", NL: "Pays-Bas",
  IT: "Italie", ES: "Espagne", PT: "Portugal", MA: "Maroc", DZ: "Algérie",
  TN: "Tunisie", SN: "Sénégal", CI: "Côte d'Ivoire", CD: "RD Congo",
};

function Flag({ code }: { code: string }) {
  if (!code || code.length !== 2 || code === "??") {
    return <span className="inline-block w-6 h-4 rounded-sm bg-muted ring-1 ring-border" />;
  }
  return (
    <img
      src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/48x36/${code.toLowerCase()}.png 2x`}
      width={24}
      height={18}
      alt={code}
      loading="lazy"
      className="inline-block rounded-sm ring-1 ring-border/60 shadow-sm"
    />
  );
}

function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function CountriesView({ period }: { period: Period }) {
  const range = useMemo(() => getRange(period), [period]);

  const countriesQ = useQuery({
    queryKey: ["umami-countries", period],
    queryFn: () => getCountries(range),
  });
  const sessionsQ = useQuery({
    queryKey: ["umami-sessions", period],
    queryFn: () => getSessions(range),
  });

  const rows = useMemo(() => {
    const sessions = sessionsQ.data?.data ?? [];
    // Agrégation par pays depuis les sessions (donne le temps moyen)
    const map = new Map<
      string,
      { code: string; visits: number; views: number; totaltime: number; sessions: number }
    >();
    for (const s of sessions) {
      const code = s.country || "??";
      const cur = map.get(code) ?? { code, visits: 0, views: 0, totaltime: 0, sessions: 0 };
      cur.visits += s.visits ?? 0;
      cur.views += s.views ?? 0;
      cur.totaltime += s.totaltime ?? 0;
      cur.sessions += 1;
      map.set(code, cur);
    }
    // Compléter avec les pays du metrics endpoint si pas dans sessions
    for (const c of countriesQ.data ?? []) {
      if (!map.has(c.x)) {
        map.set(c.x, { code: c.x, visits: c.y, views: 0, totaltime: 0, sessions: 0 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.visits - a.visits);
  }, [countriesQ.data, sessionsQ.data]);

  const totalVisits = rows.reduce((acc, r) => acc + r.visits, 0);
  const isLoading = countriesQ.isLoading || sessionsQ.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe2 className="size-5 text-primary" />
        <h2 className="text-lg font-semibold tracking-tight">Pays — visites & engagement</h2>
      </div>

      <CountriesBarChart rows={rows.slice(0, 10)} period={period} />

      <div className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-3">Pays</th>
                <th className="text-right font-medium px-5 py-3">Visites</th>
                <th className="text-right font-medium px-5 py-3">% du total</th>
                <th className="text-right font-medium px-5 py-3">Sessions</th>
                <th className="text-right font-medium px-5 py-3">Pages vues</th>
                <th className="text-right font-medium px-5 py-3">Temps moyen / session</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    Chargement…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    Aucune donnée pays sur la période.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const pct = totalVisits > 0 ? (r.visits / totalVisits) * 100 : 0;
                const avg = r.sessions > 0 ? r.totaltime / r.sessions : 0;
                return (
                  <tr key={r.code} className="border-t border-border/40 hover:bg-accent/20 transition">
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <Flag code={r.code} />
                        <span className="font-medium">{COUNTRY_NAMES[r.code] ?? r.code}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{r.code}</span>
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold">
                      {r.visits.toLocaleString()}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                      {pct.toFixed(1)}%
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.sessions}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.views || "—"}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{fmtDuration(avg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Les temps moyens sont calculés depuis les sessions individuelles d'Umami. Les pays sans
        session récente n'ont pas de durée.
      </p>
    </div>
  );
}
