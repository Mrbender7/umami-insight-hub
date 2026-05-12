import { useMemo } from "react";
import { ERROR_EVENTS, type UmamiEvent } from "@/lib/umami";

interface Row {
  eventName: string;
  urlPath: string;
  detail: string;
  count: number;
}

export function ErrorsTable({ events }: { events: UmamiEvent[] }) {
  const rows = useMemo<Row[]>(() => {
    const errSet = new Set<string>(ERROR_EVENTS);
    const map = new Map<string, Row>();
    for (const e of events) {
      if (!errSet.has(e.eventName)) continue;
      const detail = (e.urlQuery && decodeURIComponent(e.urlQuery)) || "—";
      const key = `${e.eventName}|${e.urlPath}|${detail}`;
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { eventName: e.eventName, urlPath: e.urlPath || "/", detail, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [events]);

  return (
    <div className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60">
        <h2 className="text-sm font-semibold tracking-tight">Diagnostic — Erreurs récentes</h2>
        <p className="text-xs text-muted-foreground">Agrégation par événement, route et détail</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-5 py-3">Événement</th>
              <th className="text-left font-medium px-5 py-3">Route</th>
              <th className="text-left font-medium px-5 py-3">Message / Args</th>
              <th className="text-right font-medium px-5 py-3">Occurrences</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                  Aucune erreur sur la période. 🎉
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/40 hover:bg-accent/20 transition">
                <td className="px-5 py-3">
                  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-gradient-neon-soft ring-1 ring-border">
                    {r.eventName}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{r.urlPath}</td>
                <td className="px-5 py-3 font-mono text-xs text-foreground/80 max-w-md truncate" title={r.detail}>
                  {r.detail}
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
