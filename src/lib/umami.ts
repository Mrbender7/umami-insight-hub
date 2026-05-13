// Umami Cloud API client
// Requires: VITE_UMAMI_WEBSITE_ID, VITE_UMAMI_API_TOKEN
// Optional: VITE_UMAMI_API_URL (defaults to https://cloud.umami.is/api)

const API_URL = (import.meta.env.VITE_UMAMI_API_URL as string) || "https://api.umami.is/v1";
const WEBSITE_ID =
  (import.meta.env.VITE_UMAMI_WEBSITE_ID as string) || "73a30cfd-4d45-43c2-b296-c4d3a39cd898";
const API_TOKEN_ENV = import.meta.env.VITE_UMAMI_API_TOKEN as string | undefined;
const API_TOKEN = API_TOKEN_ENV ?? "";
const HAS_API_TOKEN = API_TOKEN_ENV !== undefined && API_TOKEN_ENV !== "";
const USE_STATIC_DATA = import.meta.env.VITE_USE_STATIC_UMAMI_DATA === "true";
// CORS proxy for static hosting (GitHub Pages). Override with VITE_CORS_PROXY="" to disable.
const CORS_PROXY =
  import.meta.env.VITE_CORS_PROXY !== undefined
    ? (import.meta.env.VITE_CORS_PROXY as string)
    : "https://api.allorigins.win/raw?url=";

function buildProxiedUrl(targetUrl: string) {
  if (!CORS_PROXY) return targetUrl;
  return `${CORS_PROXY}${encodeURIComponent(targetUrl)}`;
}

export function getEnvStatus() {
  return {
    websiteId: !!WEBSITE_ID,
    apiToken: USE_STATIC_DATA || HAS_API_TOKEN,
    apiTokenEmpty: !USE_STATIC_DATA && !HAS_API_TOKEN,
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
] as const;

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
    // Static data only stocke "24h" pour les périodes courtes ; on retombe dessus.
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
  const finalUrl = buildProxiedUrl(url.toString());
  let res: Response;
  try {
    res = await fetch(finalUrl, {
      headers: {
        "x-umami-api-key": API_TOKEN,
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new Error(
      `Fetch error: ${(error as Error).message}. URL appelée : ${finalUrl}. URL Umami cible : ${url.toString()}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText}. Détail : ${text || "réponse vide"}. URL appelée : ${finalUrl}. URL Umami cible : ${url.toString()}`,
    );
  }
  return res.json() as Promise<T>;
}

export interface EventCount {
  x: string; // event name
  y: number; // count
}

export async function getEventCounts(range: Range): Promise<EventCount[]> {
  if (USE_STATIC_DATA) {
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
  if (USE_STATIC_DATA) {
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
  if (USE_STATIC_DATA) {
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

export async function getEventDataValues(
  range: Range,
  eventName: string,
  fieldName: string,
): Promise<EventDataValue[]> {
  if (USE_STATIC_DATA) return [];
  return umamiFetch<EventDataValue[]>(`/websites/${WEBSITE_ID}/event-data/values`, {
    startAt: range.startAt,
    endAt: range.endAt,
    eventName,
    propertyName: fieldName,
  });
}

export interface EventDataField {
  eventName: string;
  fieldName: string;
  dataType: number;
  total: number;
}

export async function getEventDataFields(range: Range): Promise<EventDataField[]> {
  if (USE_STATIC_DATA) return [];
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
  if (USE_STATIC_DATA) {
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
  if (USE_STATIC_DATA) {
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
  if (USE_STATIC_DATA) {
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

export async function getSessionActivity(
  range: Range,
  sessionId: string,
): Promise<SessionActivity[]> {
  if (USE_STATIC_DATA) return [];
  return umamiFetch<SessionActivity[]>(
    `/websites/${WEBSITE_ID}/sessions/${sessionId}/activity`,
    { startAt: range.startAt, endAt: range.endAt },
  );
}
