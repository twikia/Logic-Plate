# Application System Topology (Overview)

Platebound is a restaurant discovery app. The mobile client (`/app`) owns all user-facing UI; server-side work runs in Supabase Edge Functions under `/supabase/functions`. Business logic shared across screens lives in `/core`.

This document is a high-level map for UI/UX design and implementation planning — where screens live, what data they consume, and how backend pieces connect.

---

## 1. Directory Blueprint

| Path | Role |
|------|------|
| `/app` | Expo Router file-based routes — every screen the user sees (tabs, stacks, modals). |
| `/core` | Domain logic: restaurant fetching, caching, recommendation scoring, user settings, Supabase client. Screens call into here; they do not talk to APIs directly. |
| `/components` | Reusable UI: AI overview panels, map markers, loading progress, auth gate, themed primitives. |
| `/context` | React providers — `AuthContext`, `ThemeContext`. |
| `/hooks` | Shared hooks (distance formatting, color scheme, profile icon). |
| `/themes` | Theme tokens and types (Sunset Blush dark, Melon Fresh light, neon variant). |
| `/constants` | Static design constants. |
| `/assets` | Local images (cuisine “feeling” photos, icons). |
| `/supabase/functions` | Deno edge functions deployed to Supabase — Google Places fetch, Gemini AI, photo pipelines, group voting. |
| `/supabase/migrations` | PostgreSQL schema migrations. |
| `/scripts` | Dev/maintenance utilities (project reset, asset fetch). Not user-facing. |
| `/platebound-vote` | Separate Next.js web app for browser-based group quick-vote links (companion to mobile Groups tab). |

There is no `/automation` folder. Background and scheduled work is handled by Supabase Edge Functions and CI (`.github/workflows/supabase-functions-deploy.yml`).

---

## 2. Core Architecture State (App)

| Layer | Technology |
|-------|------------|
| **Frontend / Mobile UI** | React Native 0.81, Expo SDK 54, Expo Router v6 (file-based routing), TypeScript |
| **Web preview** | Expo web (`npx expo start --web`); Map tab uses a placeholder on web — native maps on iOS/Android only |
| **Backend / Data** | Supabase — PostgreSQL, Auth, Row Level Security, Edge Functions (Deno) |
| **Local persistence** | `@react-native-async-storage/async-storage` for location cache, result cache, AI overview cache, user prefs |
| **Geospatial indexing** | H3 hex cells (`h3-js`) — search radius is split into cells for cache lookup and API batching |
| **Third-party APIs** | Google Places (restaurant nodes), Gemini (AI overviews), Foursquare (legacy photo fallback), Mapillary, Unsplash, Open-Meteo (weather context) |

**Entry point:** `expo-router/entry` → `/app/_layout.tsx` wraps the app in auth, theme, and location init, then routes to `(tabs)` or `(auth)`.

---

## 3. Navigation & Screen Map (UX-relevant)

### Bottom tabs (3 tabs today)

Defined in `/app/(tabs)/_layout.tsx`:

| Tab | Route group | Purpose |
|-----|-------------|---------|
| **Groups** (left) | `/app/(tabs)/groups/` | Social — create/join group sessions, collect vibes, vote on restaurants, quick-vote handoff |
| **Home** (center, elevated) | `/app/(tabs)/(home)/` | Primary discovery hub — daily spotlight, cuisine browse, random picker |
| **Map** (right) | `/app/(tabs)/map.tsx` | Native map with restaurant pins and detail sheet (web stub: `map.web.tsx`) |

### Home stack screens (`/app/(tabs)/(home)/`)

| Screen | File | What the user does |
|--------|------|--------------------|
| Spotlight / daily pick | `index.tsx` | Carousel of top nearby picks; AI scores, open-now, distance |
| Pick categories | `pick-categories.tsx` | Choose cuisine categories |
| Cuisine results | `cuisine-results.tsx` | Paginated list filtered by cuisine |
| Random picker | `random.tsx` | Filter/sort pool, spin wheel, scenario presets |
| Random result | `random-result.tsx` | Full detail for the picked restaurant |
| Home settings | `settings.tsx` | Search radius and home-specific prefs |

### Groups stack (`/app/(tabs)/groups/`)

Lobby, waiting, vibe collection, vote, winner — plus `/quick/` sub-flow for shareable quick-vote sessions.

### Global stack screens (outside tabs)

| Screen | File | Notes |
|--------|------|-------|
| Login | `/app/(auth)/login.tsx` | OAuth / email auth |
| Pick username | `/app/(auth)/pick-username.tsx` | Post-signup username |
| Profile | `/app/profile.tsx` | Modal presentation |
| General settings | `/app/general-settings.tsx` | App-wide prefs |
| Recommendation settings | `/app/recommendation-settings.tsx` | Weight sliders for AI scoring |
| Welcome onboarding | `/app/welcome-onboarding.tsx` | First-run flow |

### Key shared UI components (implementation hooks for design)

| Component | Location | Driven by |
|-----------|----------|-----------|
| `AiOverviewRadar` / `AiOverviewScoresPanel` / `AiOverviewSummaryBody` | `/components/` | `ai_overview_cache` fields merged onto place objects |
| `RestaurantLoadingProgress` | `/components/` | Orchestrator progress stages (GPS → cache → fetch → AI) |
| `NeonBorderCard`, `CuisineImageStrip` | `/components/` | Theme tokens + cuisine keys |
| `RestaurantMapMarker` | `/components/map/` | Place lat/lng + selection state |
| `AuthGate` | `/components/auth/` | Supabase session — gates authenticated routes |

---

## 4. High-Level Data Flow (Restaurant Discovery)

```
User opens a discovery screen (Home, Map, Cuisine, Random)
        │
        ▼
getLocation()  —  expo-location + cached coords  (/core/locationCache.ts)
        │
        ▼
getNearbyRestaurants(lat, lng, radius)  (/core/restaurantOrchestrator.ts)
        │
        ├─► H3 cells in radius  (/core/h3Utils.ts)
        │
        ├─► readCacheBulk(cellIds)  — AsyncStorage + Supabase restaurant_cache  (/core/cacheManager.ts)
        │       │
        │       └─► cache miss → supabase.functions.invoke('fetch-missing-cells')
        │                              └─► Google Places API → writeCache per cell
        │
        ├─► Dedupe by place ID, compute distanceMeters, filter/sort by radius
        │
        ├─► getCachedAiOverviewsForPlaces()  — local + Supabase ai_overview_cache
        │       │
        │       └─► missing IDs → invoke('generate-ai-overviews')  — Gemini enrichment
        │
        └─► onAiReady(enrichedPlaces)  — UI updates progressively before full await completes
                │
                ▼
        Screen renders cards / carousel / map pins / filters
                │
                └─► Optional: resultCache (AsyncStorage) for instant re-open per cuisine/radius key
```

**UX implication:** Lists and carousels can show basic place data first; AI scores and summaries appear in a second pass via `onAiReady`. Loading UI should reflect stages: `reading-cache` → `fetching-restaurants` → `parsing-restaurants` → `loading-overviews` → `done`.

**Recommendation layer:** `/core/recommendationEngine.ts` and `/core/recommendationTypes.ts` score the pool using user weights from `/core/userSettings.ts` (meal type, budget, group size, priority metrics). Home spotlight and random filters consume these scores.

**Cross-screen selection:** `/core/currentSelection.ts` holds the “current restaurant” and map-focus handoff so picking on Random/Home can jump the Map tab to the same place.

---

## 5. Database & Supabase Integrations

PostgreSQL tables (see `/supabase/migrations/` and `/supabase_schema.sql`):

| Table | Purpose | UI-facing fields |
|-------|---------|------------------|
| `restaurant_cache` | H3 cell ID → JSONB array of Google Places payloads | Name, location, price level, hours, types — everything in list/card UI |
| `ai_overview_cache` | Per `place_id` Gemini-generated overview | Summary text, radar scores (taste, health, value, solo diner, work-friendly, etc.) |
| `restaurant_photo_cache` | Tiered photo URLs per place | OG site images, Mapillary, Unsplash fallbacks |
| `profiles` | User username linked to `auth.users` | Profile header, group host identity |
| `group_sessions` | Vote session metadata (code, status, picks) | Groups lobby, share codes |
| `group_responses` | Per-voter vibe/dietary input | Vibe collection screens |
| `group_votes` | Place ID votes per session | Vote tallies, winner screen |

**Auth:** Supabase Auth with OAuth; `/core/supabaseClient.ts` creates the client; `/context/AuthContext.tsx` exposes session state.

**Edge functions** (`/supabase/functions/`):

| Function | Triggered by | External APIs |
|----------|--------------|---------------|
| `fetch-missing-cells` | App orchestrator on cache miss | Google Places |
| `generate-ai-overviews` | App when AI cache miss | Gemini |
| `fetch-restaurant-photos` | Photo load paths | OG scrape, Mapillary, Unsplash |
| `fetch-foursquare-photos` | Legacy photo fallback | Foursquare |
| `create-group-session` | Groups tab | — |
| `reconcile-group` | Group vote reconciliation | — |
| `set-username` | Username pick screen | — |

App invokes functions via `supabase.functions.invoke()` with `x-app-secret` header (`EXPO_PUBLIC_APP_SECRET`).

---

## 6. Theming & Design System (for UX work)

- **Theme provider:** `/context/ThemeContext.tsx` + definitions in `/themes/`
- **Planned palettes** (see `/feature_outline.md`): **Sunset Blush** (dark, coral accent) for Home/Map; **Melon Fresh** (light pastel) for Social/Tracking — neon gradient variant exists for Home/Map tab bar
- **Patterns:** Heavily rounded buttons, gradient backgrounds, haptic tab bar, elevated center Home tab, modal profile
- **Distance display:** `/hooks/useDistanceFormatter.ts` respects user unit prefs from `/core/userSettings.ts`
- **Open-now badges:** `/core/isOpenNow.ts` evaluates place hours client-side

When designing new screens, prefer existing themed components (`themed-text`, `themed-view`, `AnimatedPressable`, `NeonBorderCard`) and read theme tokens rather than hard-coding colors.

---

## 7. Companion Web App

`/platebound-vote` — Next.js app for participants who open a shared vote link in a browser (no install). It reads/writes the same `group_sessions` / `group_votes` tables. Mobile Groups tab creates sessions; web handles anonymous voter entry.

---

## 8. Environment & Runtime Notes

- Env vars in `.env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_APP_SECRET`
- Location permission required for all discovery flows
- No automated test suite; manual device/web testing
- Edge functions are Deno — not type-checked by the app’s `tsc`

---

## 9. Quick Reference: “Where would I implement X?”

| UX feature idea | Start here |
|-----------------|------------|
| New tab or screen | `/app/` — add route file; register in nearest `_layout.tsx` |
| New filter or sort on lists | Screen state + `/core/restaurantSort.ts`, `/core/scenarioFilters.ts` |
| Change how restaurants are fetched | `/core/restaurantOrchestrator.ts`, `/core/searchConfig.ts` |
| New AI score on cards | `/supabase/functions/generate-ai-overviews/`, migration on `ai_overview_cache`, then `/components/AiOverview*.tsx` |
| User preference toggle | `/core/userSettings.ts` + settings screen in `/app/` |
| New group voting step | `/app/(tabs)/groups/` + relevant edge function |
| Shared card/list item | `/components/` — extract from existing screen patterns in `index.tsx`, `cuisine-results.tsx`, `random-result.tsx` |
