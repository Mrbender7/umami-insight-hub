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

const day = 24 * 60 * 60 * 1000;
const endAt = Date.now();
const periods = {
  "24h": { startAt: endAt - day, endAt, unit: "hour" },
  "7d": { startAt: endAt - 7 * day, endAt, unit: "day" },
  "30d": { startAt: endAt - 30 * day, endAt, unit: "day" },
  "all": { startAt: endAt - 730 * day, endAt, unit: "month" },
};

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
}

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Données Umami générées dans ${OUTPUT_PATH}`);
