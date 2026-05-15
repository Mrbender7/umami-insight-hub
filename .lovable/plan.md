## Objectif
Étendre la page d'analyse Radiosphere pour exploiter les nouveaux events Umami (`ad-landing` enrichi, `lite-view`, `lite-cta-full`, `lite-cta-android`) en plus des 5 déjà branchés, avec filtres globaux et nouvel onglet d'acquisition.

## 1. Couche données (`src/lib/umami.ts` + `scripts/generate-umami-data.mjs`)

Ajouter aux events trackés :
- `ad-landing` (déjà présent dans TRAFFIC_EVENTS) — récupérer les event-data : `variant`, `source`, `medium`, `campaign`, `hasFbclid`, `referrer`, `webview`, `app`, `path`
- `lite-view`, `lite-cta-full`, `lite-cta-android` → ajouter à `TRAFFIC_EVENTS`

Étendre `EVENT_DATA_TARGETS` avec les nouveaux champs `ad-landing`. Le script `generate-umami-data.mjs` itère déjà sur cette liste — un seul ajout suffit.

## 2. Analyses (`src/lib/diagnostic.ts`)

Nouvelles fonctions pures :
- `analyzeAcquisition(adLandingEvents, eventDataValues)` → totaux, split lite/full, top campagnes, top sources, top apps, taux WebView, % avec `fbclid`
- `analyzeLiteFunnel(counts)` → `liteViews`, `ctaFull`, `ctaAndroid`, taux conversion
- Étendre `buildAgentPrompt` avec sections "Acquisition" et "Funnel Lite"

## 3. UI (`src/components/DiagnosticView.tsx`)

Réorganiser en sections nommées (titres explicites pour repérage mobile) :
1. **Acquisition** — ad-landing split lite/full + WebView + top campagnes/sources
2. **Page Lite** — vues, CTA, taux conversion
3. **Santé technique** — hydration-mismatch-detail (déjà là) + csr-fallback-duration (déjà là)
4. **Performance** — pageview-perf (déjà là)
5. **Hygiène URL** — url-cleaned (déjà là)

Tout rester dans le composant `DiagnosticView` existant pour ne pas casser le routing.

## 4. Nouvel onglet "Acquisition" (`src/components/Dashboard.tsx`)

Ajouter un onglet dédié `acquisition` entre "Temps réel" et "Diagnostic", qui rend un nouveau composant `AcquisitionView`. Ce composant affiche en grand :
- Bar chart : arrivées par source (facebook, google, instagram, direct, organic, lite)
- Doughnut : répartition lite/full
- Table : top campagnes
- Table : top apps WebView
- Filtres : période (hérite du selector global) + variant (lite/full/tous) + device

## 5. Filtres globaux

Ajouter un état `variant` (`lite` | `full` | `all`) et `device` (`mobile` | `desktop` | `all`) dans `Dashboard.tsx`, propagés aux vues via props. Filtre appliqué côté client sur les `ad-landing` (via event-data `variant` + sessions `device`).

## Périmètre exclu (à confirmer si besoin)
- Pas de modification côté Radiosphere (events déjà émis)
- Pas de nouveau backend / cloud
- Filtre device limité à ce qu'expose Umami sessions (pas de UA parsing maison)

## Fichiers touchés
- `src/lib/umami.ts` (events + targets)
- `scripts/generate-umami-data.mjs` (rien si EVENT_DATA_TARGETS importé, sinon mirror)
- `src/lib/diagnostic.ts` (2 fonctions + prompt)
- `src/components/DiagnosticView.tsx` (sections renommées + nouvelles)
- `src/components/Dashboard.tsx` (onglet + filtres)
- `src/components/AcquisitionView.tsx` (nouveau)

OK pour partir là-dessus ?