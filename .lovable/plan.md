## Cause racine du symptôme

En production, le dashboard lit un fichier `public/umami-data.json` pré-généré au build (`VITE_USE_STATIC_UMAMI_DATA=true`). Ce fichier ne contient que **4 buckets** : `24h`, `7d`, `30d`, `all`. Les filtres `1h`, `6h`, `12h` retombent tous sur le bucket `24h` (voir `getPeriodFromRange` dans `src/lib/umami.ts`). Conséquence visible : changer le filtre temporel ne change rien aux données affichées dans Diagnostic. Le câblage React est correct — c'est la couche données qui est figée.

## Objectif

Garder les chargements instantanés par défaut (JSON statique = rapide, pas de quota API consommé), mais offrir un bouton **« Recalculer en direct »** qui re-fetch toutes les données depuis l'API Umami pour la période sélectionnée, avec un écran de chargement explicite. S'applique à tous les onglets.

## Approche

Le token `VITE_UMAMI_API_TOKEN` est déjà bundlé côté client au build (cf. `.github/workflows/deploy.yml`). On peut donc taper l'API Umami directement depuis le navigateur sans backend ni proxy.

### 1. Forcer le mode live au niveau de la couche données

`src/lib/umami.ts` expose actuellement `USE_STATIC_DATA` comme une **constante de module**. À transformer en flag dynamique runtime :

- Remplacer la constante par un store léger (objet mutable + listeners, ou un `Atom`-like simple) avec deux modes : `static` (défaut) et `live` (forcé).
- Chaque fonction d'accès (`getEventCounts`, `getEventSeries`, `getRecentEvents`, `getSessions`, `getCountries`, `getEventDataValues`, `getEventDataFields`, `getRealtimeSnapshot`, `getSessionActivity`) lit le flag à l'appel et choisit static vs `umamiFetch`.
- Le fallback dégradé sur `getPeriodFromRange` (1h/6h/12h → 24h) reste utile en mode static, mais devient inutile en live (l'API accepte n'importe quel range).

### 2. Bouton « Recalculer en direct » dans le header

Dans `src/components/Dashboard.tsx`, à côté du `PeriodSelector` (déjà présent dans le header) :

- Bouton avec icône `RefreshCw` : « Recalculer en direct ».
- État local `liveMode: boolean` + `isRefreshing: boolean`.
- Au clic : passe le flag global en `live`, invalide toutes les queries via `queryClient.invalidateQueries()`, attend la fin de toutes les refetch, repasse `isRefreshing` à false.
- Indicateur visuel persistant quand `liveMode=true` (badge « Live » à côté du bouton + couleur d'accent).
- Si l'utilisateur change de période en mode live, refetch automatique (comportement React Query natif puisque les queryKeys incluent `period`).

### 3. Écran de chargement plein écran

Pendant le refresh live :

- Overlay semi-transparent sur le contenu du dashboard (pas un blocage modal — l'utilisateur peut voir ce qui se passe).
- Spinner centré + texte : « Récupération des données Umami en direct… ».
- Sous-texte avec progression : « 4 / 9 requêtes terminées » (compteur basé sur le nombre de queries actives via `useIsFetching` de React Query).
- Sur les onglets Diagnostic et Acquisition (qui font ~15 requêtes event-data en parallèle), ce compteur rassure l'utilisateur sur la fiabilité.

### 4. Indication visuelle de fraîcheur

Petit timestamp sous le bouton : 
- En static : « Données figées au build du {date} » (lue depuis `umami-data.json` → `generatedAt`).
- En live : « Rafraîchi à {heure} » (mis à jour à chaque refresh).

Cela répond directement au besoin de réassurance exprimé.

### 5. Persistance optionnelle

- Le mode live ne persiste **pas** entre rechargements de page (sessionStorage volontairement évité — chaque session repart en static rapide).
- Quand l'utilisateur quitte et revient, on repart sur le statique. Plus prévisible.

## Fichiers touchés

- `src/lib/umami.ts` — flag runtime `dataMode` + getters/setters, branchements dans chaque fonction.
- `src/components/Dashboard.tsx` — bouton, état, overlay de chargement, badge Live, timestamp de fraîcheur.
- `src/components/DiagnosticView.tsx` — petite mention « Source : statique / live » à côté du titre (réutilise le flag).

## Hors périmètre

- Pas de cache localStorage des résultats live (pas demandé, ajoute de la complexité).
- Pas de mode auto-refresh périodique en live.
- Pas de modification du script `generate-umami-data.mjs` ni du workflow GitHub Pages — la génération statique reste telle quelle.
- Pas de proxy backend (le token reste bundlé côté client comme aujourd'hui — même posture de sécurité que l'existant).

## Risques / points d'attention

- **Quota API Umami** : un clic sur le bouton = ~9 requêtes (Realtime), ~10 requêtes (Diagnostic event-data), etc. Acceptable car déclenché manuellement.
- **Token exposé** : déjà le cas aujourd'hui via les autres `umamiFetch` (mode dev/non-static). Pas une régression.
- **Race condition** si l'utilisateur change de période pendant un refresh : React Query gère via les queryKeys, pas de fix spécifique nécessaire.
