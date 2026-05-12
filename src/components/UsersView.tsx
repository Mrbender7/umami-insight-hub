import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Monitor, Smartphone, Tablet, ChevronDown, ChevronRight } from "lucide-react";
import {
  getSessions, getSessionActivity, getRange, type Period, type UmamiSession,
} from "@/lib/umami";

const COUNTRY_NAMES: Record<string, string> = {
  BE: "Belgique", FR: "France", LU: "Luxembourg", CH: "Suisse", CA: "Canada",
  US: "États-Unis", GB: "Royaume-Uni", DE: "Allemagne", NL: "Pays-Bas",
};

function Flag({ code }: { code?: string }) {
  if (!code || code.length !== 2) {
    return <span className="inline-block w-5 h-3.5 rounded-sm bg-muted ring-1 ring-border" />;
  }
  return (
    <img
      src={`https://flagcdn.com/20x15/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/40x30/${code.toLowerCase()}.png 2x`}
      width={20}
      height={15}
      alt={code}
      loading="lazy"
      className="inline-block rounded-sm ring-1 ring-border/60"
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

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `il y a ${days}j`;
  return d.toLocaleDateString("fr-BE");
}

function DeviceIcon({ device }: { device?: string }) {
  const cls = "size-3.5 text-muted-foreground";
  if (device === "mobile") return <Smartphone className={cls} />;
  if (device === "tablet") return <Tablet className={cls} />;
  return <Monitor className={cls} />;
}

function SessionRow({ session, range }: { session: UmamiSession; range: ReturnType<typeof getRange> }) {
  const [open, setOpen] = useState(false);
  const activityQ = useQuery({
    queryKey: ["umami-activity", session.id, range.startAt, range.endAt],
    queryFn: () => getSessionActivity(range, session.id),
    enabled: open,
  });

  const avg = session.visits > 0 ? (session.totaltime ?? 0) / session.visits : 0;

  return (
    <>
      <tr
        className="border-t border-border/40 hover:bg-accent/20 transition cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs">
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            <code className="font-mono text-[10px] text-muted-foreground">
              {session.id.slice(0, 12)}…
            </code>
          </span>
        </td>
        <td className="px-5 py-2.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-base">{flag(session.country)}</span>
            <span className="text-xs">{COUNTRY_NAMES[session.country ?? ""] ?? session.country ?? "—"}</span>
            {session.city && <span className="text-[10px] text-muted-foreground">{session.city}</span>}
          </span>
        </td>
        <td className="px-5 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <DeviceIcon device={session.device} />
            <span>{session.browser ?? "—"}</span>
            <span className="text-muted-foreground">/ {session.os ?? "?"}</span>
          </span>
        </td>
        <td className="px-5 py-2.5 text-right tabular-nums text-xs">{session.visits}</td>
        <td className="px-5 py-2.5 text-right tabular-nums text-xs">{session.views}</td>
        <td className="px-5 py-2.5 text-right tabular-nums text-xs">{fmtDuration(avg)}</td>
        <td className="px-5 py-2.5 text-right text-xs text-muted-foreground">
          {fmtRelative(session.lastAt)}
        </td>
      </tr>
      {open && (
        <tr className="bg-card/30 border-t border-border/40">
          <td colSpan={7} className="px-5 py-3">
            {activityQ.isLoading && (
              <p className="text-xs text-muted-foreground">Chargement de l'activité…</p>
            )}
            {activityQ.error && (
              <p className="text-xs text-destructive">
                Erreur : {(activityQ.error as Error).message}
              </p>
            )}
            {activityQ.data && activityQ.data.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucune activité enregistrée.</p>
            )}
            {activityQ.data && activityQ.data.length > 0 && (
              <ol className="space-y-1 text-xs">
                {activityQ.data.slice(0, 50).map((a, i) => (
                  <li key={i} className="flex items-center gap-2 font-mono">
                    <span className="text-muted-foreground tabular-nums">
                      {new Date(a.createdAt).toLocaleTimeString("fr-BE", {
                        hour: "2-digit", minute: "2-digit", second: "2-digit",
                      })}
                    </span>
                    {a.eventName ? (
                      <span className="px-1.5 py-0.5 rounded bg-gradient-neon-soft ring-1 ring-border text-[10px]">
                        ⚡ {a.eventName}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-muted ring-1 ring-border text-[10px]">
                        📄 page
                      </span>
                    )}
                    <span className="text-foreground/80">{a.urlPath}</span>
                    {a.urlQuery && (
                      <span className="text-muted-foreground truncate max-w-md">
                        ?{decodeURIComponent(a.urlQuery)}
                      </span>
                    )}
                  </li>
                ))}
                {activityQ.data.length > 50 && (
                  <li className="text-muted-foreground italic">
                    … et {activityQ.data.length - 50} actions de plus
                  </li>
                )}
              </ol>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function UsersView({ period }: { period: Period }) {
  const range = useMemo(() => getRange(period), [period]);
  const sessionsQ = useQuery({
    queryKey: ["umami-sessions", period],
    queryFn: () => getSessions(range),
  });

  const sessions = sessionsQ.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Utilisateurs anonymes</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {sessions.length} session{sessions.length > 1 ? "s" : ""} affichée{sessions.length > 1 ? "s" : ""}
          {sessionsQ.data && sessionsQ.data.count > sessions.length && ` / ${sessionsQ.data.count} total`}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Identifiants anonymes générés par Umami (hash IP + user-agent, aucune donnée personnelle).
        Cliquez une ligne pour voir les actions de la session.
      </p>

      <div className="rounded-2xl bg-gradient-card border-neon shadow-neon overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-3">ID anonyme</th>
                <th className="text-left font-medium px-5 py-3">Pays</th>
                <th className="text-left font-medium px-5 py-3">Device / Browser</th>
                <th className="text-right font-medium px-5 py-3">Visites</th>
                <th className="text-right font-medium px-5 py-3">Pages vues</th>
                <th className="text-right font-medium px-5 py-3">Temps moyen</th>
                <th className="text-right font-medium px-5 py-3">Dernière activité</th>
              </tr>
            </thead>
            <tbody>
              {sessionsQ.isLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    Chargement…
                  </td>
                </tr>
              )}
              {!sessionsQ.isLoading && sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    Aucune session sur la période.
                  </td>
                </tr>
              )}
              {sessions.map((s) => (
                <SessionRow key={s.id} session={s} range={range} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
