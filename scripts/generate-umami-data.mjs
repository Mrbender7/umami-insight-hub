import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_URL = process.env.VITE_UMAMI_API_URL || "https://api.umami.is/v1";
const WEBSITE_ID = process.env.VITE_UMAMI_WEBSITE_ID || "73a30cfd-4d45-43c2-b296-c4d3a39cd898";
const API_TOKEN = process.env.VITE_UMAMI_API_TOKEN;
const OUTPUT_PATH = resolve("public/umami-data.json");

if (!API_TOKEN) {
  console.error("VITE_UMAMI_API_TOKEN est manquant ou vide dans les secrets GitHub.");
  process.exit(1);
}

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const endAt = Date.now();
const periods = {
  "1h": { startAt: endAt - hour, endAt, unit: "hour" },
  "6h": { startAt: endAt - 6 * hour, endAt, unit: "hour" },
  "12h": { startAt: endAt - 12 * hour, endAt, unit: "hour" },
  "24h": { startAt: endAt - day, endAt, unit: "hour" },
  "7d": { startAt: endAt - 7 * day, endAt, unit: "day" },
  "30d": { startAt: endAt - 30 * day, endAt, unit: "day" },
  "all": { startAt: endAt - 730 * day, endAt, unit: "month" },
};

const EVENT_DATA_TARGETS = [
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

async function umamiFetch(path, params = {}) {
  const url = new URL(`${API_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: {
      "x-umami-api-key": API_TOKEN,
      Accept: "application/json",
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} sur ${url}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

console.log(`Génération Umami via ${API_URL} pour le site ${WEBSITE_ID}`);

const data = {
  generatedAt: new Date(endAt).toISOString(),
  websiteId: WEBSITE_ID,
  periods: {},
};

for (const [period, range] of Object.entries(periods)) {
  data.periods[period] = {
    range,
    counts: await umamiFetch(`/websites/${WEBSITE_ID}/metrics`, {
      startAt: range.startAt,
      endAt: range.endAt,
      type: "event",
      limit: 200,
    }),
    series: await umamiFetch(`/websites/${WEBSITE_ID}/events/series`, {
      startAt: range.startAt,
      endAt: range.endAt,
      unit: range.unit,
      timezone: "Europe/Brussels",
    }),
    events: await umamiFetch(`/websites/${WEBSITE_ID}/events`, {
      startAt: range.startAt,
      endAt: range.endAt,
      pageSize: 1000,
      orderBy: "createdAt",
    }),
    countries: await umamiFetch(`/websites/${WEBSITE_ID}/metrics`, {
      startAt: range.startAt,
      endAt: range.endAt,
      type: "country",
      limit: 100,
    }),
    sessions: await umamiFetch(`/websites/${WEBSITE_ID}/sessions`, {
      startAt: range.startAt,
      endAt: range.endAt,
      pageSize: 200,
      orderBy: "lastAt",
    }),
  };

  // Stats globales + référents + séries pageviews par source
  try {
    data.periods[period].stats = await umamiFetch(`/websites/${WEBSITE_ID}/stats`, {
      startAt: range.startAt,
      endAt: range.endAt,
    });
  } catch (err) {
    console.warn(`stats KO pour ${period}:`, err.message);
    data.periods[period].stats = null;
  }
  try {
    data.periods[period].referrers = await umamiFetch(`/websites/${WEBSITE_ID}/metrics`, {
      startAt: range.startAt,
      endAt: range.endAt,
      type: "referrer",
      limit: 200,
    });
  } catch (err) {
    console.warn(`referrers KO pour ${period}:`, err.message);
    data.periods[period].referrers = [];
  }
  const pageviewsSeries = {};
  for (const [key, referrer] of [["total", undefined], ["google", "google.com"], ["facebook", "facebook.com"]]) {
    try {
      pageviewsSeries[key] = await umamiFetch(`/websites/${WEBSITE_ID}/pageviews`, {
        startAt: range.startAt,
        endAt: range.endAt,
        unit: range.unit,
        timezone: "Europe/Brussels",
        referrer,
      });
    } catch (err) {
      console.warn(`pageviews(${key}) KO pour ${period}:`, err.message);
      pageviewsSeries[key] = { pageviews: [], sessions: [] };
    }
  }
  data.periods[period].pageviewsSeries = pageviewsSeries;

  // Event-data : champs disponibles + valeurs pour les events ciblés.
  try {
    data.periods[period].eventDataFields = await umamiFetch(
      `/websites/${WEBSITE_ID}/event-data/fields`,
      { startAt: range.startAt, endAt: range.endAt },
    );
  } catch (err) {
    console.warn(`event-data/fields KO pour ${period}:`, err.message);
    data.periods[period].eventDataFields = [];
  }

  const valuesByEvent = {};
  for (const target of EVENT_DATA_TARGETS) {
    valuesByEvent[target.eventName] = {};
    for (const fieldName of target.fields) {
      try {
        valuesByEvent[target.eventName][fieldName] = await umamiFetch(
          `/websites/${WEBSITE_ID}/event-data/values`,
          {
            startAt: range.startAt,
            endAt: range.endAt,
            eventName: target.eventName,
            propertyName: fieldName,
          },
        );
      } catch (err) {
        console.warn(
          `event-data/values KO pour ${period} ${target.eventName}.${fieldName}:`,
          err.message,
        );
        valuesByEvent[target.eventName][fieldName] = [];
      }
    }
  }
  data.periods[period].eventDataValues = valuesByEvent;
}

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Données Umami générées dans ${OUTPUT_PATH}`);
