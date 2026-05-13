import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio, Users, Eye, MousePointerClick, Globe2, Link2 } from "lucide-react";
import { getRealtime, type RealtimeData } from "@/lib/umami";

const COUNTRY_NAMES: Record<string, string> = {
  BE: "Belgique", FR: "France", LU: "Luxembourg", CH: "Suisse", CA: "Canada",
  US: "États-Unis", GB: "Royaume-Uni", DE: "Allemagne", NL: "Pays-Bas",
  IT: "Italie", ES: "Espagne", PT: "Portugal", MA: "Maroc", DZ: "Algérie",
  TN: "Tunisie", SN: "Sénégal", CI: "Côte d'Ivoire", CD: "RD Congo",
};

function Flag({ code }: { code?: string }) {
  if (!code || code.length !== 2) {
    return <span className="inline-block w-5 h-3.5 rounded-sm bg-muted ring-1 ring-border" />;
  }
  return (
    <img
      src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`}
      width={20}
      height={14}
      alt={code}
      loading="lazy"
      className="inline-block rounded-sm ring-1 ring-border/60"
    />
  );
}

function timeAgo(iso?: string | number): string {
  if (!iso) return "—";
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m}m`;
  const h = Math.floor(m / 60);
  return `il y a ${h}h`;
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-gradient-card border-neon shadow-neon p-5 flex items-center gap-4">
      <div className="size-11 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="size-5 text-primary" />
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function RealtimeView() {
  const [, force] = useState(0);
  const q = useQuery({
    queryKey: ["umami-realtime"],
    queryFn: () => getRealtime(),
    refetchInterval: 5000,
  });

  // Re-render every second so "il y a Xs" stays fresh between fetches
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const data: RealtimeData = q.data ?? { visitors: [] };
  const visitorsCount = useMemo(
    () => (Array.isArray(data.visitors) ? data.visitors.length : data.visitors ?? 0),
    [data.visitors],
  );
  const pageviews = data.pageviews ?? [];
  const events = data.events ?? [];
  const countries = data.countries ?? [];
  const urls = data.urls ?? [];
  const referrers = data.referrers ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Radio className="size-5 text-primary animate-pulse" />
        <h2 className="text-lg font-semibold tracking-tight">Temps réel — 30 dernières minutes</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          Rafraîchi automatiquement toutes les 5 secondes
        </span>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Users} label="Visiteurs actifs" value={visitorsCount} />
        <Stat icon={Eye} label="Pages vues" value={pageviews.length} />
        <Stat icon={MousePointerClick} label="Events" value={events.length} />
        <Stat icon={Globe2} label="Pays distincts" value={countries.length} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Pages vues récentes" icon={Eye}>
          {pageviews.length === 0 ? (
            <Empty />
          ) : (
            <ul className="divide-y divide-border/40">
              {pageviews.slice(0, 30).map((p, i) => (
                <li key={p.id ?? i} className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-accent/20">
                  <Flag code={p.country} />
                  <span className="font-mono text-xs truncate flex-1">
                    {p.urlPath}
                    {p.urlQuery ? <span className="text-muted-foreground">?{p.urlQuery}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo(p.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Events récents" icon={MousePointerClick}>
          {events.length === 0 ? (
            <Empty />
          ) : (
            <ul className="divide-y divide-border/40">
              {events.slice(0, 30).map((e, i) => (
                <li key={e.id ?? i} className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-accent/20">
                  <span className="inline-flex items-center rounded-md bg-primary/10 text-primary text-[10px] font-mono px-2 py-0.5">
                    {e.eventName ?? "event"}
                  </span>
                  <span className="font-mono text-xs truncate flex-1 text-muted-foreground">
                    {e.urlPath}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Pays actifs" icon={Globe2}>
          {countries.length === 0 ? (
            <Empty />
          ) : (
            <ul className="divide-y divide-border/40">
              {countries.slice(0, 20).map((c) => (
                <li key={c.x} className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-accent/20">
                  <Flag code={c.x} />
                  <span className="flex-1">{COUNTRY_NAMES[c.x] ?? c.x}</span>
                  <span className="tabular-nums font-semibold">{c.y}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top URLs & referrers" icon={Link2}>
          <div className="grid grid-cols-1 gap-3 p-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                URLs
              </div>
              {urls.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1">
                  {urls.slice(0, 8).map((u) => (
                    <li key={u.x} className="flex items-center gap-2 text-xs">
                      <span className="font-mono truncate flex-1">{u.x}</span>
                      <span className="tabular-nums font-semibold">{u.y}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Referrers
              </div>
              {referrers.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1">
                  {referrers.slice(0, 8).map((r) => (
                    <li key={r.x} className="flex items-center gap-2 text-xs">
                      <span className="font-mono truncate flex-1">{r.x || "(direct)"}</span>
                      <span className="tabular-nums font-semibold">{r.y}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {q.error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {(q.error as Error).message}
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-card/40">
        <Icon className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="px-4 py-10 text-center text-xs text-muted-foreground">Aucune activité.</p>;
}
