# Platebound - Restaurant Discovery App

## Cursor Cloud specific instructions

### Overview

Platebound is a React Native Expo (SDK 54) mobile app for restaurant discovery. It uses:
- **Frontend**: React Native 0.81 + Expo Router v6 (file-based routing) + TypeScript
- **Backend**: Supabase (hosted cloud) — PostgreSQL, Auth, Edge Functions (Deno)
- **APIs**: Google Places, Gemini AI, Foursquare, Mapillary, Unsplash

### Running the app

- **Dev server (web)**: `npx expo start --web --port 8081`
- The app loads `.env` automatically (contains `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_APP_SECRET`)
- In web mode, the Map tab shows a placeholder ("available on iOS/Android") — this is expected behavior
- Location-dependent features (restaurant search) require browser geolocation permissions; in headless/CI environments these won't have real coordinates

### Linting and type checking

- **Lint**: `npx expo lint` (ESLint via expo config)
- **TypeScript**: `npx tsc --noEmit` — Note: Supabase edge functions under `supabase/functions/` are Deno code and will produce TS errors when checked with the project's Node-based `tsc`. This is expected; only check app-level TS issues.

### Project structure

- `app/` — Expo Router file-based routes (tabs: home, research, tracking, map, social)
- `core/` — Business logic (restaurant orchestrator, Supabase client, caching)
- `components/` — Reusable UI components
- `context/` — React contexts (Auth, Theme)
- `supabase/functions/` — Deno edge functions (deployed to Supabase, not run locally)
- `supabase/migrations/` — SQL schema migrations

### Key caveats

- No test framework is configured (no jest/vitest) — there are no automated tests to run
- The `package-lock.json` lockfile is used → use `npm install` (not yarn/pnpm)
- Node.js 20 LTS is required (Expo SDK 54 compatibility)
- Edge functions are deployed to Supabase's hosted infrastructure; they don't run locally unless you set up Supabase CLI with `supabase functions serve`
