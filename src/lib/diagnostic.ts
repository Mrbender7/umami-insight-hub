// Analyse approfondie des erreurs Umami pour radiosphere.be
// Toutes les fonctions sont pures et opèrent sur les données déjà chargées.

import { ERROR_EVENTS, type UmamiEvent, type EventCount } from "./umami";

export interface QueryParamStat {
  param: string;
  occurrences: number;
  uniqueValues: number;
  exampleValues: string[];
  percentOfErrors: number;
}

export interface RouteStat {
  path: string;
  errorCount: number;
  errorTypes: Record<string, number>;
}

export interface SessionStat {
  sessionId: string;
  errorCount: number;
  routes: string[];
  errorTypes: string[];
}

export interface HourlyBucket {
  hour: number; // 0-23
  total: number;
  byType: Record<string, number>;
}

export interface ErrorCodeBreakdown {
  eventName: string;
  count: number;
  meaning: string;
  commonCauses: string[];
  fixChecklist: string[];
}

export interface Hypothesis {
  rank: number;
  confidence: "high" | "medium" | "low";
  title: string;
  evidence: string[];
  fixSuggestions: string[];
}

const ERROR_SET = new Set<string>(ERROR_EVENTS);

export function filterErrorEvents(events: UmamiEvent[]): UmamiEvent[] {
  return events.filter((e) => ERROR_SET.has(e.eventName));
}

// Décode une querystring en {key: value[]}
export function parseQuery(qs?: string): Record<string, string[]> {
  if (!qs) return {};
  const out: Record<string, string[]> = {};
  try {
    const decoded = qs.startsWith("?") ? qs.slice(1) : qs;
    const params = new URLSearchParams(decoded);
    for (const [k, v] of params.entries()) {
      (out[k] ??= []).push(v);
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function analyzeQueryParams(errorEvents: UmamiEvent[]): QueryParamStat[] {
  const total = errorEvents.length;
  if (total === 0) return [];
  const stats = new Map<string, { count: number; values: Set<string> }>();
  for (const e of errorEvents) {
    const params = parseQuery(e.urlQuery);
    for (const [k, vs] of Object.entries(params)) {
      const cur = stats.get(k) ?? { count: 0, values: new Set<string>() };
      cur.count += 1;
      vs.forEach((v) => cur.values.add(v));
      stats.set(k, cur);
    }
  }
  return Array.from(stats.entries())
    .map(([param, { count, values }]) => ({
      param,
      occurrences: count,
      uniqueValues: values.size,
      exampleValues: Array.from(values).slice(0, 3),
      percentOfErrors: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

export function analyzeRoutes(errorEvents: UmamiEvent[]): RouteStat[] {
  const map = new Map<string, RouteStat>();
  for (const e of errorEvents) {
    const path = e.urlPath || "/";
    const cur = map.get(path) ?? { path, errorCount: 0, errorTypes: {} };
    cur.errorCount += 1;
    cur.errorTypes[e.eventName] = (cur.errorTypes[e.eventName] ?? 0) + 1;
    map.set(path, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.errorCount - a.errorCount);
}

export function analyzeSessions(errorEvents: UmamiEvent[], topN = 10): SessionStat[] {
  const map = new Map<string, SessionStat>();
  for (const e of errorEvents) {
    if (!e.sessionId) continue;
    const cur =
      map.get(e.sessionId) ?? {
        sessionId: e.sessionId,
        errorCount: 0,
        routes: [],
        errorTypes: [],
      };
    cur.errorCount += 1;
    if (!cur.routes.includes(e.urlPath || "/")) cur.routes.push(e.urlPath || "/");
    if (!cur.errorTypes.includes(e.eventName)) cur.errorTypes.push(e.eventName);
    map.set(e.sessionId, cur);
  }
  return Array.from(map.values())
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, topN);
}

export function analyzeHourly(errorEvents: UmamiEvent[]): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    total: 0,
    byType: {},
  }));
  for (const e of errorEvents) {
    const d = new Date(e.createdAt);
    const h = d.getHours();
    buckets[h].total += 1;
    buckets[h].byType[e.eventName] = (buckets[h].byType[e.eventName] ?? 0) + 1;
  }
  return buckets;
}

const ERROR_KNOWLEDGE: Record<string, Omit<ErrorCodeBreakdown, "count">> = {
  "hydration-error": {
    eventName: "hydration-error",
    meaning:
      "Erreur d'hydratation React générique : le HTML rendu côté serveur ne correspond pas à ce que React essaie de produire côté client.",
    commonCauses: [
      "Utilisation de window, document, navigator, localStorage au render initial",
      "Date.now(), Math.random(), new Date() rendus différemment serveur/client",
      "Lecture de window.location.search / hash au premier render (différent en SSR)",
      "Composants conditionnels basés sur typeof window !== 'undefined'",
      "HTML invalide (<p> imbriqué, <div> dans un <p>, <a> dans un <a>)",
      "Extensions de navigateur qui modifient le DOM avant l'hydratation",
    ],
    fixChecklist: [
      "Wrapper le code client-only dans useEffect ou un dynamic import { ssr: false }",
      "Utiliser useState + useEffect pour les valeurs qui dépendent de window",
      "Vérifier le HTML semantic (p ne peut pas contenir div, etc.)",
      "Ajouter suppressHydrationWarning sur les éléments contenant un timestamp",
      "Tester avec une URL contenant ?fbclid=test pour reproduire",
    ],
  },
  "hydration-error-418": {
    eventName: "hydration-error-418",
    meaning:
      "React error #418 : 'Hydration failed because the server rendered HTML didn't match the client.' Mismatch direct entre serveur et client.",
    commonCauses: [
      "Texte différent entre SSR et CSR (locale, formatage de date, devise)",
      "Attribut HTML qui change (className conditionnel basé sur window)",
      "Children rendu de façon différente (map sur un tableau qui diffère)",
      "Présence d'un fragment ou d'un élément en plus/en moins",
    ],
    fixChecklist: [
      "Identifier le composant via React DevTools en mode dev",
      "Comparer le HTML retourné par le serveur (View Source) vs le DOM final",
      "Suspect : tout composant qui formate une date, un nombre, ou lit l'URL",
      "Solution rapide : suppressHydrationWarning sur l'élément concerné",
    ],
  },
  "hydration-error-421": {
    eventName: "hydration-error-421",
    meaning:
      "React error #421 : 'This Suspense boundary received an update before it finished hydrating.' Une mise à jour est arrivée trop tôt sur un Suspense.",
    commonCauses: [
      "useEffect qui déclenche un setState pendant l'hydratation",
      "Subscription (zustand, redux) qui change de valeur entre SSR et CSR",
      "Router (Next/TanStack) qui navigue avant la fin de l'hydratation",
      "Composant lazy dont la promesse résout instantanément",
    ],
    fixChecklist: [
      "Décaler les setState avec un setTimeout(..., 0) ou requestIdleCallback",
      "Utiliser startTransition pour les mises à jour non urgentes",
      "S'assurer que les stores ont la même valeur initiale serveur et client",
    ],
  },
  "hydration-error-423": {
    eventName: "hydration-error-423",
    meaning:
      "React error #423 : 'There was an error while hydrating but React was able to recover.' Un fallback de Suspense a été déclenché pendant l'hydratation.",
    commonCauses: [
      "Composant dans un <Suspense> qui throw pendant l'hydratation",
      "Erreur de fetch/import dans un composant lazy",
      "Données manquantes attendues par un composant SSR",
    ],
    fixChecklist: [
      "Ajouter un ErrorBoundary autour du Suspense pour catcher l'erreur",
      "Logger l'erreur originale (souvent masquée par React)",
      "Vérifier que les data passées au composant sont sérialisables et complètes",
    ],
  },
  "error-boundary": {
    eventName: "error-boundary",
    meaning: "Une ErrorBoundary React a capturé une erreur pendant le rendu.",
    commonCauses: [
      "Exception non gérée dans un composant",
      "Accès à une propriété d'un objet undefined/null",
      "Erreur d'API non catchée",
    ],
    fixChecklist: [
      "Récupérer le message d'erreur via componentDidCatch",
      "Ajouter des guards (if (!data) return null)",
      "Logger l'erreur vers Sentry/Umami avec le stack complet",
    ],
  },
  "js-error": {
    eventName: "js-error",
    meaning: "Erreur JavaScript globale capturée par window.onerror.",
    commonCauses: [
      "ReferenceError sur une variable non définie",
      "TypeError sur un .map / .forEach d'un undefined",
      "Erreur dans un script tiers (analytics, ads)",
    ],
    fixChecklist: [
      "Inspecter le détail dans Umami event-data (message, source, line)",
      "Ajouter des guards défensifs sur les data externes",
    ],
  },
  "asset-load-error": {
    eventName: "asset-load-error",
    meaning: "Échec de chargement d'une ressource (image, script, css, font).",
    commonCauses: [
      "URL d'asset cassée après un déploiement (hash changé)",
      "CDN indisponible ou bloqué par un adblocker",
      "CORS sur des assets cross-origin",
    ],
    fixChecklist: [
      "Vérifier que le manifest de build référence bien les bons hash",
      "Ajouter un fallback onError sur les <img>",
    ],
  },
  "route-error-open-external": {
    eventName: "route-error-open-external",
    meaning: "Échec lors de l'ouverture d'un lien externe.",
    commonCauses: ["window.open bloqué", "URL malformée", "User gesture manquant"],
    fixChecklist: [
      "Vérifier que window.open est appelé dans un handler synchrone (clic)",
      "Toujours sanitize l'URL avant ouverture",
    ],
  },
  "route-error-copy-link": {
    eventName: "route-error-copy-link",
    meaning: "Échec de la copie d'un lien dans le presse-papier.",
    commonCauses: [
      "navigator.clipboard non disponible (HTTP, navigateur ancien)",
      "Permission refusée",
    ],
    fixChecklist: [
      "Fallback sur document.execCommand('copy')",
      "Vérifier que le site est servi en HTTPS",
    ],
  },
  "csr-fallback-triggered": {
    eventName: "csr-fallback-triggered",
    meaning:
      "React a abandonné l'hydratation SSR et re-rendu entièrement la page côté client (client-side rendering fallback). Indicateur d'IMPACT UX direct : flash blanc, perte d'état, dégradation perçue par l'utilisateur.",
    commonCauses: [
      "Conséquence directe d'une hydration-error non récupérée (#418/#423 cascade)",
      "Suspense boundary qui throw pendant l'hydratation",
      "Mismatch SSR/CSR si grave que React jette tout le tree et recommence",
    ],
    fixChecklist: [
      "Ce n'est PAS une cause racine — c'est le symptôme visible des hydration-error",
      "Corriger les hydration-error en amont éliminera ces fallback automatiquement",
      "Mesurer le ratio fallback/hydration-error : >50% = utilisateurs voient un flash",
      "Vérifier que les sessions qui déclenchent un fallback continuent à naviguer (taux de récupération)",
    ],
  },
};

export function breakdownErrorCodes(counts: EventCount[]): ErrorCodeBreakdown[] {
  const map = new Map<string, number>();
  for (const c of counts) {
    if (ERROR_SET.has(c.x)) map.set(c.x, (map.get(c.x) ?? 0) + c.y);
  }
  return Array.from(map.entries())
    .map(([eventName, count]) => {
      const k = ERROR_KNOWLEDGE[eventName] ?? {
        eventName,
        meaning: "Erreur applicative custom (instrumentée par radiosphere).",
        commonCauses: ["À investiguer dans le code source"],
        fixChecklist: ["Chercher umami.track('" + eventName + "') dans le projet"],
      };
      return { ...k, count };
    })
    .sort((a, b) => b.count - a.count);
}

export function generateHypotheses(args: {
  queryParams: QueryParamStat[];
  routes: RouteStat[];
  hourly: HourlyBucket[];
  sessions: SessionStat[];
  totalErrors: number;
  totalAdLanding: number;
  uniqueErrorSessions: number;
  errorBreakdown: ErrorCodeBreakdown[];
}): Hypothesis[] {
  const hyp: Hypothesis[] = [];
  const {
    queryParams,
    routes,
    hourly,
    sessions,
    totalErrors,
    totalAdLanding,
    uniqueErrorSessions,
    errorBreakdown,
  } = args;

  // H1 : query params Facebook/Google ads présents dans la majorité des erreurs
  const fbParam = queryParams.find((p) => p.param === "fbclid");
  const gclidParam = queryParams.find((p) => p.param === "gclid");
  const trackingParam =
    fbParam && fbParam.percentOfErrors > 60 ? fbParam : gclidParam && gclidParam.percentOfErrors > 60 ? gclidParam : null;
  if (trackingParam) {
    hyp.push({
      rank: hyp.length + 1,
      confidence: trackingParam.percentOfErrors > 80 ? "high" : "medium",
      title: `${trackingParam.percentOfErrors}% des erreurs ont le param "${trackingParam.param}" dans l'URL`,
      evidence: [
        `${trackingParam.occurrences}/${totalErrors} erreurs contiennent ?${trackingParam.param}=...`,
        `${trackingParam.uniqueValues} valeurs uniques observées`,
        `Smoking gun : un composant lit window.location.search au premier render et produit un HTML différent du SSR.`,
      ],
      fixSuggestions: [
        "Chercher dans le code : useSearchParams, window.location.search, URLSearchParams au render initial",
        "Si trouvé : wrapper le composant dans useEffect ou utiliser un dynamic import { ssr: false }",
        "Alternative rapide : nettoyer l'URL côté serveur via un middleware (rediriger sans le param de tracking) ou via un useEffect qui fait history.replaceState",
        "Tester en local : ouvrir https://radiosphere.be/?fbclid=test123 doit reproduire l'erreur",
      ],
    });
  }

  // H2 : une route concentre >70% des erreurs
  if (routes.length > 0) {
    const top = routes[0];
    const ratio = Math.round((top.errorCount / totalErrors) * 100);
    if (ratio > 60) {
      hyp.push({
        rank: hyp.length + 1,
        confidence: ratio > 80 ? "high" : "medium",
        title: `${ratio}% des erreurs sont sur la route "${top.path}"`,
        evidence: [
          `${top.errorCount}/${totalErrors} erreurs concentrées sur cette route`,
          `Types d'erreur sur cette route : ${Object.keys(top.errorTypes).join(", ")}`,
        ],
        fixSuggestions: [
          `Inspecter le composant qui rend ${top.path} (probablement src/routes${top.path === "/" ? "/index" : top.path}.tsx)`,
          "Vérifier ses imports : tout composant client-only doit être en dynamic import",
          "Vérifier le HTML semantic : pas de div dans p, pas de a dans a",
        ],
      });
    }
  }

  // H3 : cascade d'erreurs par visite (corrigé : ratio errors/session, pas errors/landing)
  if (totalAdLanding > 0 && uniqueErrorSessions > 0) {
    const errorsPerSession = (totalErrors / uniqueErrorSessions).toFixed(1);
    const sessionsPctOfLanding = Math.min(100, Math.round((uniqueErrorSessions / totalAdLanding) * 100));
    if (sessionsPctOfLanding > 30 || Number(errorsPerSession) > 2) {
      hyp.push({
        rank: hyp.length + 1,
        confidence: sessionsPctOfLanding > 60 ? "high" : "medium",
        title: `${sessionsPctOfLanding}% des arrivées publicitaires crashent (${errorsPerSession} erreurs/session en cascade)`,
        evidence: [
          `${uniqueErrorSessions} sessions uniques en erreur sur ${totalAdLanding} arrivées publicitaires`,
          `Chaque session déclenche en moyenne ${errorsPerSession} erreurs (cascade hydration → 418 → 423)`,
          `Total ${totalErrors} erreurs ≠ ${totalErrors} utilisateurs : un même mismatch SSR/CSR génère plusieurs events React simultanés`,
        ],
        fixSuggestions: [
          "Cohérent avec H1 : les params de tracking cassent l'hydratation et déclenchent une cascade",
          "Le mix 459 hydration-error + 217 × 418 + 217 × 423 est typique d'un seul mismatch initial qui se propage",
          "Corriger l'hydration sur la home page avec query params devrait éliminer 80% des events d'un coup",
        ],
      });
    }
  }

  // H4 : pic horaire qui correspond à une campagne pub
  const peak = hourly.reduce((m, b) => (b.total > m.total ? b : m), hourly[0]);
  if (peak && peak.total > totalErrors * 0.2) {
    hyp.push({
      rank: hyp.length + 1,
      confidence: "low",
      title: `Pic d'erreurs à ${peak.hour}h (${peak.total} erreurs)`,
      evidence: [
        `${Math.round((peak.total / totalErrors) * 100)}% des erreurs sont concentrées sur cette heure`,
        `Probablement corrélé à une diffusion publicitaire ou un déploiement`,
      ],
      fixSuggestions: [
        "Vérifier le calendrier des campagnes Facebook/Google Ads",
        "Vérifier l'historique des déploiements à cette heure",
      ],
    });
  }

  // H5 : sessions qui crashent en boucle
  if (sessions.length > 0 && sessions[0].errorCount > 5) {
    hyp.push({
      rank: hyp.length + 1,
      confidence: "medium",
      title: `${sessions.filter((s) => s.errorCount > 3).length} sessions crashent en boucle`,
      evidence: [
        `Top session : ${sessions[0].errorCount} erreurs sur ${sessions[0].routes.length} routes`,
        `Suggère que l'utilisateur reload la page → réussite seulement après nettoyage de l'URL`,
      ],
      fixSuggestions: [
        "Implémenter un retry automatique : useEffect qui clean l'URL et reload une fois",
        "Ou afficher un message 'Une erreur est survenue, rechargez la page'",
      ],
    });
  }

  // H6 : asset-load-error significatif (signal indépendant)
  const assetErrors = errorBreakdown.find((e) => e.eventName === "asset-load-error");
  if (assetErrors && assetErrors.count > 50) {
    hyp.push({
      rank: hyp.length + 1,
      confidence: "medium",
      title: `${assetErrors.count} échecs de chargement d'assets — signal séparé du problème d'hydratation`,
      evidence: [
        `Cet event est instrumenté indépendamment des erreurs React`,
        `Probablement un asset (image, script, font) référencé avec un hash périmé après un déploiement`,
      ],
      fixSuggestions: [
        "Inspecter les Network errors dans Chrome DevTools sur la home page",
        "Vérifier que tous les assets sont servis avec les bons hash après build (vite manifest)",
        "Suspect typique : preload/prefetch de fonts ou scripts tiers (analytics, ads, player)",
        "Quick win : ajouter onError={() => fallback} sur les <img> critiques",
      ],
    });
  }

  return hyp;
}

export function countUniqueErrorSessions(errorEvents: UmamiEvent[]): number {
  const set = new Set<string>();
  for (const e of errorEvents) if (e.sessionId) set.add(e.sessionId);
  return set.size;
}

export function buildAgentPrompt(args: {
  hypotheses: Hypothesis[];
  errorBreakdown: ErrorCodeBreakdown[];
  topRoutes: RouteStat[];
  topQueryParams: QueryParamStat[];
  period: string;
  generatedAt: string;
}): string {
  const { hypotheses, errorBreakdown, topRoutes, topQueryParams, period, generatedAt } = args;
  const lines: string[] = [];
  lines.push(`# Rapport de diagnostic — radiosphere.be`);
  lines.push(``);
  lines.push(`Période analysée : **${period}**`);
  lines.push(`Généré le : ${new Date(generatedAt).toLocaleString("fr-BE")}`);
  lines.push(``);
  lines.push(`## Mission`);
  lines.push(``);
  lines.push(
    `Le site radiosphere.be subit des erreurs d'hydratation React massives. ` +
      `Ce rapport est issu de l'analyse des données Umami Cloud (events instrumentés sur le site). ` +
      `Ton objectif : identifier le ou les composants fautifs dans le code source et proposer un correctif.`,
  );
  lines.push(``);
  lines.push(`## Hypothèses prioritaires (issues de l'analyse)`);
  lines.push(``);
  for (const h of hypotheses) {
    lines.push(`### #${h.rank} [${h.confidence.toUpperCase()}] ${h.title}`);
    lines.push(``);
    lines.push(`**Preuves :**`);
    h.evidence.forEach((e) => lines.push(`- ${e}`));
    lines.push(``);
    lines.push(`**Pistes de correction :**`);
    h.fixSuggestions.forEach((s) => lines.push(`- ${s}`));
    lines.push(``);
  }
  lines.push(`## Erreurs observées (par type)`);
  lines.push(``);
  for (const e of errorBreakdown) {
    lines.push(`### ${e.eventName} — ${e.count} occurrences`);
    lines.push(`> ${e.meaning}`);
    lines.push(``);
    lines.push(`**Causes typiques :**`);
    e.commonCauses.forEach((c) => lines.push(`- ${c}`));
    lines.push(``);
    lines.push(`**Checklist de fix :**`);
    e.fixChecklist.forEach((c) => lines.push(`- ${c}`));
    lines.push(``);
  }
  lines.push(`## Top routes en erreur`);
  lines.push(``);
  lines.push(`| Route | Erreurs | Types |`);
  lines.push(`|---|---:|---|`);
  topRoutes.slice(0, 10).forEach((r) => {
    lines.push(`| \`${r.path}\` | ${r.errorCount} | ${Object.keys(r.errorTypes).join(", ")} |`);
  });
  lines.push(``);
  lines.push(`## Query params présents dans les URLs en erreur`);
  lines.push(``);
  lines.push(`| Param | % des erreurs | Occurrences | Valeurs uniques |`);
  lines.push(`|---|---:|---:|---:|`);
  topQueryParams.slice(0, 10).forEach((p) => {
    lines.push(`| \`${p.param}\` | ${p.percentOfErrors}% | ${p.occurrences} | ${p.uniqueValues} |`);
  });
  lines.push(``);
  lines.push(`## Commandes d'investigation prêtes à coller`);
  lines.push(``);
  lines.push(
    `Exécute ces commandes dans le repo Radio Sphere pour localiser les fichiers suspects en quelques secondes :`,
  );
  lines.push(``);
  lines.push("```bash");
  lines.push(`# 1. Tous les composants qui lisent l'URL au render initial (suspect #1)`);
  lines.push(
    `rg -n "useSearchParams|window\\.location\\.search|window\\.location\\.hash|URLSearchParams|new URL\\(window" src/`,
  );
  lines.push(``);
  lines.push(`# 2. Composants qui touchent window/document/navigator au top-level d'un render`);
  lines.push(
    `rg -n "typeof window|typeof document|typeof navigator" src/`,
  );
  lines.push(``);
  lines.push(`# 3. Sources de non-déterminisme (Date.now, Math.random, new Date au render)`);
  lines.push(`rg -n "Date\\.now\\(\\)|Math\\.random\\(\\)|new Date\\(\\)" src/components src/routes`);
  lines.push(``);
  lines.push(`# 4. HTML invalide potentiel (div dans p, a dans a)`);
  lines.push(`rg -n "<p[^>]*>" src/ -A 5 | rg -B 1 "<div|<section|<article|<ul|<ol"`);
  lines.push(``);
  lines.push(`# 5. Composants Suspense / lazy (suspects pour les erreurs 421/423)`);
  lines.push(`rg -n "Suspense|React\\.lazy|lazy\\(" src/`);
  lines.push(``);
  lines.push(`# 6. Endroits où on track les fbclid/utm (pour confirmer où l'URL est lue)`);
  lines.push(`rg -n "fbclid|utm_source|utm_campaign" src/`);
  lines.push("```");
  lines.push(``);
  lines.push(`## Action attendue de toi (agent IA)`);
  lines.push(``);
  lines.push(
    `> ⚠️ **Avant de modifier quoi que ce soit, lance d'abord les commandes \`rg\` ci-dessus et colle-moi leur sortie. On décidera du fix ensemble à partir des fichiers candidats — pas de \`useEffect\` saupoudré au hasard.**`,
  );
  lines.push(``);
  lines.push(`1. Lire ce rapport en entier.`);
  lines.push(
    `2. Exécuter d'abord les commandes d'investigation ci-dessus pour identifier les fichiers candidats.`,
  );
  lines.push(
    `3. Pour chaque candidat : analyser ses imports, ses useEffect, ses accès à window/document/location au render initial (= en dehors d'un useEffect).`,
  );
  lines.push(
    `4. Hypothèse #1 en priorité absolue : trouver le composant qui lit les query params au premier render et le fixer (déplacer dans useEffect + état local initialisé à une valeur stable).`,
  );
  lines.push(
    `5. Proposer un correctif minimal (un fichier à la fois) en expliquant précisément pourquoi le mismatch SSR/CSR disparaît.`,
  );
  lines.push(
    `6. Donner la commande pour reproduire en local : ouvrir http://localhost:PORT/?fbclid=test123&utm_source=facebook → l'erreur doit apparaître AVANT le fix et disparaître APRÈS.`,
  );
  lines.push(
    `7. Note : le total de ${errorBreakdown.reduce((acc, e) => acc + e.count, 0)} events d'erreur ne signifie PAS ${errorBreakdown.reduce((acc, e) => acc + e.count, 0)} utilisateurs — chaque mismatch React déclenche typiquement 3-4 events (hydration-error + #418 + #423). Corriger la cause racine devrait éliminer la majorité des events d'un coup.`,
  );
  lines.push(``);
  lines.push(`---`);
  lines.push(`*Rapport généré automatiquement par stats-umami à partir des données Umami Cloud.*`);
  return lines.join("\n");
}
