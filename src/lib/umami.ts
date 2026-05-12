// Umami Cloud API v2 client (browser-side)
// Requires: VITE_UMAMI_WEBSITE_ID, VITE_UMAMI_API_TOKEN
// Optional: VITE_UMAMI_API_URL (defaults to https://api.umami.is/v1)

const API_URL = (import.meta.env.VITE_UMAMI_API_URL as string) || "https://api.umami.is/v1";
const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID as string;
const API_TOKEN = import.meta.env.VITE_UMAMI_API_TOKEN as string;
// CORS proxy for static hosting (GitHub Pages). Override with VITE_CORS_PROXY="" to disable.
const CORS_PROXY =
  import.meta.env.VITE_CORS_PROXY !== undefined
    ? (import.meta.env.VITE_CORS_PROXY as string)
    : "https://corsproxy.io/";

function buildProxiedUrl(targetUrl: string) {
  if (!CORS_PROXY) return targetUrl;

  const proxyUrl = new URL(CORS_PROXY);
  proxyUrl.searchParams.set("url", targetUrl);
  proxyUrl.searchParams.append("reqHeaders", `x-umami-api-key:${API_TOKEN}`);
  proxyUrl.searchParams.append("reqHeaders", "accept:application/json");
  return proxyUrl.toString();
}

export function getEnvStatus() {
  return {
    websiteId: !!WEBSITE_ID,
    apiToken: !!API_TOKEN,
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

export type Period = "24h" | "7d" | "30d";

export interface Range {
  startAt: number;
  endAt: number;
  unit: "hour" | "day";
}

export function getRange(period: Period): Range {
  const endAt = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (period === "24h") return { startAt: endAt - day, endAt, unit: "hour" };
  if (period === "7d") return { startAt: endAt - 7 * day, endAt, unit: "day" };
  return { startAt: endAt - 30 * day, endAt, unit: "day" };
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
      headers: CORS_PROXY
        ? undefined
        : {
            "x-umami-api-key": API_TOKEN,
            Accept: "application/json",
          },
    });
  } catch (error) {
    throw new Error(
      `Impossible de joindre l'API Umami via ${CORS_PROXY || "l'URL directe"}. ` +
        `Le proxy CORS peut être indisponible ou bloquer les headers. Détail : ${(error as Error).message}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Umami ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface EventCount {
  x: string; // event name
  y: number; // count
}

export async function getEventCounts(range: Range): Promise<EventCount[]> {
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
  return umamiFetch<EventDataField[]>(`/websites/${WEBSITE_ID}/event-data/fields`, {
    startAt: range.startAt,
    endAt: range.endAt,
  });
}
