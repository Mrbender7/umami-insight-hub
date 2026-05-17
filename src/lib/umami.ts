// Umami Cloud API client
// Requires: VITE_UMAMI_WEBSITE_ID, VITE_UMAMI_API_TOKEN
// Optional: VITE_UMAMI_API_URL (defaults to https://cloud.umami.is/api)

const API_URL = (import.meta.env.VITE_UMAMI_API_URL as string) || "https://api.umami.is/v1";
const WEBSITE_ID =
  (import.meta.env.VITE_UMAMI_WEBSITE_ID as string) || "73a30cfd-4d45-43c2-b296-c4d3a39cd898";
const API_TOKEN_ENV = import.meta.env.VITE_UMAMI_API_TOKEN as string | undefined;
const API_TOKEN = API_TOKEN_ENV ?? "";
const HAS_API_TOKEN = API_TOKEN_ENV !== undefined && API_TOKEN_ENV !== "";
const STATIC_DATA_DEFAULT = import.meta.env.VITE_USE_STATIC_UMAMI_DATA === "true";

// Runtime data-mode flag. Defaults to env var. Can be flipped to "live" at runtime
// via setDataMode("live") (e.g. when the user clicks "Recalculer en direct").
export type DataMode = "static" | "live";
let _dataMode: DataMode = STATIC_DATA_DEFAULT ? "static" : "live";
const _modeListeners = new Set<(m: DataMode) => void>();
let _lastLiveError: string | null = null;
const _liveErrorListeners = new Set<(message: string | null) => void>();

export function getDataMode(): DataMode {
  return _dataMode;
}
export function setDataMode(mode: DataMode): void {
  if (_dataMode === mode) return;
  _dataMode = mode;
  _modeListeners.forEach((fn) => fn(mode));
}
export function subscribeDataMode(fn: (m: DataMode) => void): () => void {
  _modeListeners.add(fn);
  return () => _modeListeners.delete(fn);
}
export function getLastLiveError(): string | null {
  return _lastLiveError;
}
export function subscribeLiveError(fn: (message: string | null) => void): () => void {
  _liveErrorListeners.add(fn);
  return () => _liveErrorListeners.delete(fn);
}
function setLastLiveError(message: string | null): void {
  _lastLiveError = message;
  _liveErrorListeners.forEach((fn) => fn(message));
}
export function isStaticMode(): boolean {
  return _dataMode === "static";
}
export function canUseLiveMode(): boolean {
  return HAS_API_TOKEN;
}
// Proxy CORS optionnel. Par défaut désactivé : les proxys publics ne transmettent
// généralement pas les headers d'auth Umami et créent de très longues attentes.
const CORS_PROXY =
  import.meta.env.VITE_CORS_PROXY !== undefined
    ? (import.meta.env.VITE_CORS_PROXY as string)
    : "";

// On retient si le direct fonctionne pour éviter de retenter à chaque appel.
// null = pas encore testé, true = direct OK, false = il faut passer par le proxy.
let _directWorks: boolean | null = null;

function buildProxiedUrl(targetUrl: string) {
  if (!CORS_PROXY) return targetUrl;
  return `${CORS_PROXY}${encodeURIComponent(targetUrl)}`;
}

function abortMessage(error: unknown): string {
  const err = error as Error;
  return err?.name === "AbortError" ? "délai dépassé" : err?.message || "échec réseau";
}

function markLiveFailure(message: string): never {
  setLastLiveError(message);
  if (STATIC_DATA_DEFAULT) setDataMode("static");
  throw new Error(message);
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function getEnvStatus() {
  return {
    websiteId: !!WEBSITE_ID,
    apiToken: isStaticMode() || HAS_API_TOKEN,
    apiTokenEmpty: !isStaticMode() && !HAS_API_TOKEN,
    apiUrl: API_URL,
    corsProxy: CORS_PROXY,
  };
}

export const TRAFFIC_EVENTS = [
  "ad-landing",
  "early-bounce",
  "pwa-install-available",
  "stream-play",
  "play-store-click",
  "url-cleaned",
  "webview-detected",
  "pageview-perf",
  "lite-view",
  "lite-cta-full",
  "lite-cta-android",
] as const;

export const ERROR_EVENTS = [
  "hydration-error",
  "hydration-error-418",
  "hydration-error-421",
  "hydration-error-423",
  "error-boundary",
  "js-error",
  "asset-load-error",
  "route-error-open-external",
  "route-error-copy-link",
  "csr-fallback-triggered",
  "hydration-mismatch-detail",
  "csr-fallback-duration",
] as const;

// Events dont on veut récupérer les event-data (propriétés custom) pour analyse fine.
export const EVENT_DATA_TARGETS: { eventName: string; fields: string[] }[] = [
  { eventName: "hydration-mismatch-detail", fields: ["component", "componentStack", "digest", "message"] },
  { eventName: "csr-fallback-duration", fields: ["ms"] },
  { eventName: "webview-detected", fields: ["app"] },
  { eventName: "url-cleaned", fields: ["removed"] },
  { eventName: "pageview-perf", fields: ["ttfb", "fcp"] },
  {
    eventName: "ad-landing",
    fields: ["variant", "source", "medium", "campaign", "hasFbclid", "referrer", "webview", "app", "path"],
  },
];

export const ALL_EVENTS = [...TRAFFIC_EVENTS, ...ERROR_EVENTS] as const;
export type EventName = (typeof ALL_EVENTS)[number];

export type Period = "1h" | "6h" | "12h" | "24h" | "7d" | "30d" | "all";

export interface Range {
  startAt: number;
  endAt: number;
  unit: "hour" | "day" | "month";
}

interface StaticPeriodData {
  range: Range;
  counts: EventCount[];
  series: EventSeriesPoint[];
  events: PagedEvents;
  countries?: CountryStat[];
  sessions?: PagedSessions;
  eventDataValues?: Record<string, Record<string, EventDataValue[]>>;
  eventDataFields?: EventDataField[];
  stats?: WebsiteStats;
  referrers?: ReferrerStat[];
  pageviewsSeries?: {
    total?: PageviewSeries;
    google?: PageviewSeries;
    facebook?: PageviewSeries;
  };
}

interface StaticUmamiData {
  generatedAt: string;
  websiteId: string;
  periods: Record<Period, StaticPeriodData>;
}

let staticDataPromise: Promise<StaticUmamiData> | null = null;

function getPeriodFromRange(range: Range): Period {
  const duration = range.endAt - range.startAt;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (range.unit === "month") return "all";
  if (range.unit === "hour") {
    if (duration <= 1.5 * hour) return "1h";
    if (duration <= 8 * hour) return "6h";
    if (duration <= 18 * hour) return "12h";
    return "24h";
  }
  return duration <= 8 * day ? "7d" : "30d";
}

async function loadStaticData(): Promise<StaticUmamiData> {
  staticDataPromise ??= fetch("./umami-data.json", {
    headers: { Accept: "application/json" },
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} en lisant umami-data.json. ${text}`);
    }
    return res.json() as Promise<StaticUmamiData>;
  });
  return staticDataPromise;
}

export async function getStaticGeneratedAt(): Promise<string | null> {
  try {
    const data = await loadStaticData();
    return data.generatedAt ?? null;
  } catch {
    return null;
  }
}

export function getRange(period: Period): Range {
  const endAt = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (period === "1h") return { startAt: endAt - hour, endAt, unit: "hour" };
  if (period === "6h") return { startAt: endAt - 6 * hour, endAt, unit: "hour" };
  if (period === "12h") return { startAt: endAt - 12 * hour, endAt, unit: "hour" };
  if (period === "24h") return { startAt: endAt - day, endAt, unit: "hour" };
  if (period === "7d") return { startAt: endAt - 7 * day, endAt, unit: "day" };
  if (period === "30d") return { startAt: endAt - 30 * day, endAt, unit: "day" };
  // "all" — Umami garde l'historique complet ; on prend 2 ans en arrière par sécurité
  return { startAt: endAt - 730 * day, endAt, unit: "month" };
}

async function umamiFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  if (!WEBSITE_ID || !API_TOKEN) {
    throw new Error(
      `Variables d'environnement manquantes : ${!WEBSITE_ID ? "VITE_UMAMI_WEBSITE_ID " : ""}${!API_TOKEN ? "VITE_UMAMI_API_TOKEN" : ""}`.trim(),
    );
  }
  const url = new URL(`${API_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  const directUrl = url.toString();
  const headers = {
    "x-umami-api-key": API_TOKEN,
    Authorization: `Bearer ${API_TOKEN}`,
    Accept: "application/json",
  };
  const fail = (detail: string): never =>
    markLiveFailure(`Mode live indisponible : ${detail}. Retour aux données statiques.`);

  // 1) Tentative directe (rapide). Si on sait déjà que ça échoue, on saute.
  if (_directWorks !== false) {
    try {
      const res = await fetchWithTimeout(directUrl, { headers }, 8000);
      if (res.ok) {
        _directWorks = true;
        setLastLiveError(null);
        return (await res.json()) as T;
      }
      // 4xx/5xx authentique de l'API : on remonte l'erreur sans tenter le proxy.
      if (_directWorks === true || (res.status >= 400 && res.status < 600 && res.status !== 0)) {
        const text = await res.text().catch(() => "");
        fail(`API Umami HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
      }
    } catch (err) {
      // Erreur réseau / CORS / timeout → on bascule sur le proxy.
      if (_directWorks === true || !CORS_PROXY) fail(`appel direct échoué (${abortMessage(err)})`);
      _directWorks = false;
    }
  }

  // 2) Fallback proxy CORS.
  const proxiedUrl = buildProxiedUrl(directUrl);
  let res: Response | null = null;
  try {
    res = await fetchWithTimeout(proxiedUrl, { headers }, 12000);
  } catch (error) {
    fail(`direct + proxy ont échoué (${abortMessage(error)})`);
  }
  const response = res ?? fail("aucune réponse du proxy");
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    fail(`proxy HTTP ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`);
  }
  setLastLiveError(null);
  return response.json() as Promise<T>;
}

export interface EventCount {
  x: string; // event name
  y: number; // count
}

export async function getEventCounts(range: Range): Promise<EventCount[]> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    return data.periods[getPeriodFromRange(range)].counts;
  }
  return umamiFetch<EventCount[]>(`/websites/${WEBSITE_ID}/metrics`, {
    startAt: range.startAt,
    endAt: range.endAt,
    type: "event",
    limit: 200,
  });
}

export interface EventSeriesPoint {
  x: string; // event name
  t: string; // timestamp bucket
  y: number;
}

export async function getEventSeries(range: Range): Promise<EventSeriesPoint[]> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    return data.periods[getPeriodFromRange(range)].series;
  }
  return umamiFetch<EventSeriesPoint[]>(`/websites/${WEBSITE_ID}/events/series`, {
    startAt: range.startAt,
    endAt: range.endAt,
    unit: range.unit,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

export interface UmamiEvent {
  id: string;
  websiteId: string;
  sessionId: string;
  createdAt: string;
  urlPath: string;
  urlQuery?: string;
  referrerPath?: string;
  eventType: number;
  eventName: string;
}

export interface PagedEvents {
  data: UmamiEvent[];
  count: number;
  pageSize: number;
  page: number;
}

export async function getRecentEvents(range: Range, query?: string): Promise<PagedEvents> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    return data.periods[getPeriodFromRange(range)].events;
  }
  return umamiFetch<PagedEvents>(`/websites/${WEBSITE_ID}/events`, {
    startAt: range.startAt,
    endAt: range.endAt,
    query,
    pageSize: 200,
    orderBy: "createdAt",
  });
}

export interface EventDataValue {
  eventName: string;
  fieldName: string;
  dataType: number;
  fieldValue: string;
  total: number;
}

// L'API Umami /event-data/values renvoie `{ value, total }` (pas `fieldValue`).
// On normalise pour que les consumers puissent lire `fieldValue` de façon fiable.
function normalizeEventDataValues(
  raw: unknown,
  eventName: string,
  fieldName: string,
): EventDataValue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const obj = (r ?? {}) as Record<string, unknown>;
      const rawValue = obj.fieldValue ?? obj.value ?? obj.propertyValue ?? "";
      const total = Number(obj.total ?? 0);
      return {
        eventName: String(obj.eventName ?? eventName),
        fieldName: String(obj.fieldName ?? obj.propertyName ?? fieldName),
        dataType: Number(obj.dataType ?? 0),
        fieldValue: rawValue == null ? "" : String(rawValue),
        total: Number.isFinite(total) ? total : 0,
      } as EventDataValue;
    })
    .filter((v) => v.fieldValue.length > 0);
}

export async function getEventDataValues(
  range: Range,
  eventName: string,
  fieldName: string,
): Promise<EventDataValue[]> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    const periodKey = getPeriodFromRange(range);
    const raw = data.periods[periodKey].eventDataValues?.[eventName]?.[fieldName] ?? [];
    return normalizeEventDataValues(raw, eventName, fieldName);
  }
  const raw = await umamiFetch<unknown>(`/websites/${WEBSITE_ID}/event-data/values`, {
    startAt: range.startAt,
    endAt: range.endAt,
    eventName,
    propertyName: fieldName,
  });
  return normalizeEventDataValues(raw, eventName, fieldName);
}

export interface EventDataField {
  eventName: string;
  fieldName: string;
  dataType: number;
  total: number;
}

export async function getEventDataFields(range: Range): Promise<EventDataField[]> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    return data.periods[getPeriodFromRange(range)].eventDataFields ?? [];
  }
  return umamiFetch<EventDataField[]>(`/websites/${WEBSITE_ID}/event-data/fields`, {
    startAt: range.startAt,
    endAt: range.endAt,
  });
}

// ===== Pays / Géographie =====
export interface CountryStat {
  x: string; // code ISO
  y: number; // visites
}

export async function getCountries(range: Range): Promise<CountryStat[]> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    return data.periods[getPeriodFromRange(range)].countries ?? [];
  }
  return umamiFetch<CountryStat[]>(`/websites/${WEBSITE_ID}/metrics`, {
    startAt: range.startAt,
    endAt: range.endAt,
    type: "country",
    limit: 100,
  });
}

// ===== Sessions / Utilisateurs anonymes =====
export interface UmamiSession {
  id: string;
  websiteId: string;
  hostname?: string;
  browser?: string;
  os?: string;
  device?: string;
  screen?: string;
  language?: string;
  country?: string;
  region?: string;
  city?: string;
  firstAt: string;
  lastAt: string;
  visits: number;
  views: number;
  events?: number;
  totaltime?: number;
  createdAt: string;
}

export interface PagedSessions {
  data: UmamiSession[];
  count: number;
  pageSize: number;
  page: number;
}

export async function getSessions(range: Range, query?: string): Promise<PagedSessions> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    return data.periods[getPeriodFromRange(range)].sessions ?? { data: [], count: 0, pageSize: 0, page: 1 };
  }
  return umamiFetch<PagedSessions>(`/websites/${WEBSITE_ID}/sessions`, {
    startAt: range.startAt,
    endAt: range.endAt,
    query,
    pageSize: 200,
    orderBy: "lastAt",
  });
}

export interface SessionActivity {
  createdAt: string;
  urlPath: string;
  urlQuery?: string;
  referrerDomain?: string;
  eventId?: string;
  eventType: number;
  eventName?: string;
  visitId: string;
}

// ===== Realtime =====
export interface RealtimeVisitor {
  id?: string;
  sessionId?: string;
  country?: string;
  city?: string;
  browser?: string;
  os?: string;
  device?: string;
  views?: number;
  createdAt?: string;
  lastAt?: string;
}

export interface RealtimePageview {
  id?: string;
  sessionId?: string;
  urlPath?: string;
  urlQuery?: string;
  referrerDomain?: string;
  country?: string;
  createdAt: string;
}

export interface RealtimeEventItem {
  id?: string;
  sessionId?: string;
  urlPath?: string;
  eventName?: string;
  createdAt: string;
}

export interface RealtimeCountryItem {
  x: string;
  y: number;
}

export interface RealtimeData {
  visitors: RealtimeVisitor[] | number;
  pageviews?: RealtimePageview[];
  events?: RealtimeEventItem[];
  countries?: RealtimeCountryItem[];
  referrers?: { x: string; y: number }[];
  urls?: { x: string; y: number }[];
  timestamp?: number;
}

// L'API publique Umami n'expose PAS /realtime (uniquement utilisé par le dashboard interne).
// On compose donc l'équivalent à partir des endpoints réels :
//   - /active                       → nombre de visiteurs actifs (5 dernières minutes)
//   - /events?startAt&endAt         → pages vues (eventType=1) + events (eventType=2)
//   - /metrics?type=country|url|referrer
export async function getRealtime(startAt?: number): Promise<RealtimeData> {
  if (isStaticMode()) {
    return { visitors: [], pageviews: [], events: [], countries: [], referrers: [], urls: [] };
  }
  const endAt = Date.now();
  const start = startAt ?? endAt - 30 * 60 * 1000;
  const range = { startAt: start, endAt };

  const [activeRes, eventsRes, countries, urls, referrers] = await Promise.allSettled([
    umamiFetch<{ visitors: number }>(`/websites/${WEBSITE_ID}/active`),
    umamiFetch<PagedEvents>(`/websites/${WEBSITE_ID}/events`, {
      ...range,
      pageSize: 200,
      orderBy: "createdAt",
    }),
    umamiFetch<RealtimeCountryItem[]>(`/websites/${WEBSITE_ID}/metrics`, {
      ...range,
      type: "country",
      limit: 50,
    }),
    umamiFetch<{ x: string; y: number }[]>(`/websites/${WEBSITE_ID}/metrics`, {
      ...range,
      type: "url",
      limit: 20,
    }),
    umamiFetch<{ x: string; y: number }[]>(`/websites/${WEBSITE_ID}/metrics`, {
      ...range,
      type: "referrer",
      limit: 20,
    }),
  ]);

  const visitors =
    activeRes.status === "fulfilled" ? activeRes.value?.visitors ?? 0 : 0;
  const allEvents =
    eventsRes.status === "fulfilled" ? eventsRes.value?.data ?? [] : [];

  // eventType: 1 = pageview, 2 = custom event (convention Umami)
  const pageviews: RealtimePageview[] = allEvents
    .filter((e) => e.eventType === 1)
    .map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      urlPath: e.urlPath,
      urlQuery: e.urlQuery,
      referrerDomain: e.referrerPath,
      createdAt: e.createdAt,
    }));
  const events: RealtimeEventItem[] = allEvents
    .filter((e) => e.eventType === 2)
    .map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      urlPath: e.urlPath,
      eventName: e.eventName,
      createdAt: e.createdAt,
    }));

  return {
    visitors,
    pageviews,
    events,
    countries: countries.status === "fulfilled" ? countries.value ?? [] : [],
    urls: urls.status === "fulfilled" ? urls.value ?? [] : [],
    referrers: referrers.status === "fulfilled" ? referrers.value ?? [] : [],
    timestamp: endAt,
  };
}

// ===== Stats globales (visits, pageviews, etc.) =====
export interface StatValue {
  value: number;
  prev?: number;
}
export interface WebsiteStats {
  pageviews: StatValue;
  visitors: StatValue;
  visits: StatValue;
  bounces: StatValue;
  totaltime: StatValue;
}

function normalizeStat(raw: unknown): StatValue {
  if (typeof raw === "number") return { value: raw };
  const o = (raw ?? {}) as Record<string, unknown>;
  return { value: Number(o.value ?? 0), prev: o.prev != null ? Number(o.prev) : undefined };
}

function normalizeStats(raw: unknown): WebsiteStats {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    pageviews: normalizeStat(o.pageviews),
    visitors: normalizeStat(o.visitors),
    visits: normalizeStat(o.visits),
    bounces: normalizeStat(o.bounces),
    totaltime: normalizeStat(o.totaltime),
  };
}

export async function getStats(range: Range): Promise<WebsiteStats> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    return (
      data.periods[getPeriodFromRange(range)].stats ?? {
        pageviews: { value: 0 },
        visitors: { value: 0 },
        visits: { value: 0 },
        bounces: { value: 0 },
        totaltime: { value: 0 },
      }
    );
  }
  const raw = await umamiFetch<unknown>(`/websites/${WEBSITE_ID}/stats`, {
    startAt: range.startAt,
    endAt: range.endAt,
  });
  return normalizeStats(raw);
}

// ===== Référents =====
export interface ReferrerStat {
  x: string; // hostname
  y: number;
}

export async function getReferrers(range: Range): Promise<ReferrerStat[]> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    return data.periods[getPeriodFromRange(range)].referrers ?? [];
  }
  return umamiFetch<ReferrerStat[]>(`/websites/${WEBSITE_ID}/metrics`, {
    startAt: range.startAt,
    endAt: range.endAt,
    type: "referrer",
    limit: 200,
  });
}

// ===== Séries pageviews (avec filtre referrer optionnel) =====
export interface PageviewSeriesPoint {
  x: string; // timestamp bucket
  y: number;
}
export interface PageviewSeries {
  pageviews: PageviewSeriesPoint[];
  sessions: PageviewSeriesPoint[];
}

export async function getPageviewsSeries(
  range: Range,
  opts: { referrer?: string } = {},
): Promise<PageviewSeries> {
  if (isStaticMode()) {
    const data = await loadStaticData();
    const ps = data.periods[getPeriodFromRange(range)].pageviewsSeries;
    if (!opts.referrer) return ps?.total ?? { pageviews: [], sessions: [] };
    if (/google/i.test(opts.referrer)) return ps?.google ?? { pageviews: [], sessions: [] };
    if (/facebook/i.test(opts.referrer)) return ps?.facebook ?? { pageviews: [], sessions: [] };
    return { pageviews: [], sessions: [] };
  }
  return umamiFetch<PageviewSeries>(`/websites/${WEBSITE_ID}/pageviews`, {
    startAt: range.startAt,
    endAt: range.endAt,
    unit: range.unit,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    referrer: opts.referrer,
  });
}

// ===== Bucketisation des sources =====
export type SourceCategory = "google" | "facebook" | "other";

export function categorizeReferrer(host: string): SourceCategory {
  const h = (host || "").toLowerCase();
  if (!h) return "other";
  if (/google|mokka|gstatic|googleadservices|doubleclick/.test(h)) return "google";
  if (/facebook|fb\.me|fbcdn|fbsbx|messenger/.test(h)) return "facebook";
  return "other";
}

export type FacebookDevice = "mobile" | "desktop" | "unknown";

export function classifyFacebookDevice(host: string): FacebookDevice {
  const h = (host || "").toLowerCase();
  if (/^m\.facebook\.com|fb\.me|mbasic\.facebook|messenger/.test(h)) return "mobile";
  if (/^www\.facebook\.com|business\.facebook|web\.facebook/.test(h)) return "desktop";
  return "unknown";
}

export interface ReferrerBreakdown {
  total: number;
  google: number;
  facebook: number;
  facebookMobile: number;
  facebookDesktop: number;
  facebookUnknown: number;
  other: number;
}

export function aggregateReferrers(refs: ReferrerStat[]): ReferrerBreakdown {
  const b: ReferrerBreakdown = {
    total: 0, google: 0, facebook: 0,
    facebookMobile: 0, facebookDesktop: 0, facebookUnknown: 0, other: 0,
  };
  for (const r of refs) {
    b.total += r.y;
    const cat = categorizeReferrer(r.x);
    if (cat === "google") b.google += r.y;
    else if (cat === "facebook") {
      b.facebook += r.y;
      const dev = classifyFacebookDevice(r.x);
      if (dev === "mobile") b.facebookMobile += r.y;
      else if (dev === "desktop") b.facebookDesktop += r.y;
      else b.facebookUnknown += r.y;
    } else b.other += r.y;
  }
  return b;
}

export async function getSessionActivity(
  range: Range,
  sessionId: string,
): Promise<SessionActivity[]> {
  if (isStaticMode()) return [];
  return umamiFetch<SessionActivity[]>(
    `/websites/${WEBSITE_ID}/sessions/${sessionId}/activity`,
    { startAt: range.startAt, endAt: range.endAt },
  );
}
