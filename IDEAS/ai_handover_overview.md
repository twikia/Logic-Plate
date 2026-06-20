# Platebound: Core Features & Architecture Overview
*A handover document for future AI agents working on this project.*

## App Purpose
Platebound (Logic Plate) is a mobile-first restaurant discovery application. Instead of just showing standard lists and ratings, Platebound focuses on **AI-driven recommendations**, **vibe/scenario matching**, and **social group voting** to help users figure out where to eat.

## Technical Stack
- **Frontend:** React Native 0.81, Expo SDK 54, Expo Router (file-based routing), TypeScript.
- **Backend:** Supabase (PostgreSQL for data, Auth for users, Edge Functions via Deno for logic).
- **APIs:** Google Places (foundation data), Gemini (AI analysis/scoring), Foursquare/Mapillary/Unsplash (photo fallbacks).

---

## Core Features & Mechanics

### 1. Geospatial Restaurant Discovery & Caching
- **How it works:** When a user searches, the app divides their radius into H3 hexagonal cells (`core/h3Utils.ts`).
- **Caching (`core/cacheManager.ts`):** It checks a local and database cache (`restaurant_cache` table) for places in those cells.
- **Fetching:** On cache misses, it triggers a Supabase Edge Function (`fetch-missing-cells`) to query Google Places and save the results, drastically reducing API costs by not over-querying the same areas.
- **Orchestration:** Handled by `core/restaurantOrchestrator.ts` which manages the multi-stage loading pipeline (cache -> fetch -> parse -> AI).

### 2. AI Overviews & Scoring (Gemini)
- **How it works:** Once basic place data is retrieved, missing places are sent to a Gemini Edge Function (`generate-ai-overviews`).
- **Data Generated:** Gemini produces subjective scores: speed, healthiness, workout recovery, process level, date-worthiness, noise, and group size sweet spots.
- **Storage:** Results are cached in the `ai_overview_cache` table.
- **UI:** Rendered in the app using Radar charts and score panels (`components/AiOverviewRadar.tsx`).

### 3. Recommendation Engine
- **How it works:** `core/recommendationEngine.ts` ranks the pool of fetched restaurants based on user settings (`core/userSettings.ts`).
- **Factors:** It weighs budget, meal type, group size, and scenario priorities against the AI-generated scores.
- **UX:** These recommendations feed the Home Spotlight (daily picks), Cuisine lists, and the "Random Picker" wheel.

### 4. Social & Group Voting (The "Groups" Tab)
- **How it works:** Users can create "group sessions" to decide where to eat together.
- **Flow:** Lobby -> Collect "vibes" (dietary/mood preferences) -> Vote on a shortlist -> Winner revealed.
- **Companion Web App:** There is a Next.js web app (`/platebound-vote`) that allows non-app users to participate in the voting via a shared link.

### 5. Map Integration
- **How it works:** A native map (`app/(tabs)/map.tsx`) plots the discovered restaurants using custom markers and selection states. It shares the "current selection" state (`core/currentSelection.ts`) with the rest of the app for seamless handoffs.

---

## Directory Blueprint & Navigation

- `/app`: Expo Router screens. Includes `(tabs)` for Home, Map, Groups.
- `/core`: Domain logic (fetching, AI, recommendations, user settings). Keep UI out of here.
- `/components`: Reusable UI elements (cards, loaders, radars).
- `/supabase`: SQL migrations, DB schemas, and Deno Edge Functions.
- `/IDEAS`: Brainstorming, feature outlines, and documentation (like this file).
