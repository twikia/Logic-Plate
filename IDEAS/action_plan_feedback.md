# Actionable Implementation Plan: Feedback & Enhancements (Parallel Architecture)

This document outlines the step-by-step actionable plan to address user feedback, updated to ensure **we do not touch any existing database tables or caching flows**. All new features will be built on parallel tables and Edge Functions.

---

## 1. Dynamic Radius & Multi-Resolution H3 Caching (Macro Grids)
**Goal:** Allow users to search massive areas using a distance slider, automatically switching to larger H3 grids to save Google Places API costs, without touching the existing `restaurant_cache`.

*User Comment:* "auto switch when going above 1.4 miles... make one table for res 7 and res 6... if we are over 1.4 miles, aim for 2-4 cells used for that distance max... then we want a distance slider"

**Actionable Steps:**
1. **Distance Slider UI:** Update `app/general-settings.tsx` to replace the discrete radius picker with a continuous distance slider component.
2. **Database Migration:** Create **new tables** `restaurant_cache_res7` and `restaurant_cache_res6` in Supabase. We will not alter the existing `restaurant_cache`.
3. **Macro Edge Function:** Create a **new Edge Function** `fetch-missing-cells-macro` that accepts a resolution parameter (6 or 7). It will query Google Places with a scaled radius and save to the new macro cache tables.
4. **Resolution Routing:** Update `core/h3Utils.ts` and `core/restaurantOrchestrator.ts`:
   - Radius <= 1.4 miles -> Use existing Res 8 logic (touches original cache and edge function).
   - Radius > 1.4 miles -> Calculate whether Res 7 or Res 6 achieves the "2-4 cells max" target, then route the request to the new macro cache tables and new `fetch-missing-cells-macro` function.

---

## 2. Menu Scraping (Top 3 Items) via Gemini
**Goal:** Extract the top 3 signature items from a restaurant's website using Gemini, completely isolated from the existing AI Overviews flow.

*User Comment:* "The idea of scraping a url then feeding to gemini is perfect, just do it in batches like we are currently and then make a whole new edge function and table in supabase so that we don't touch what we currently have, it will be for menu."

**Actionable Steps:**
1. **Database Migration:** Create a **new table** `restaurant_menu_cache` (columns: `place_id`, `top_items` array).
2. **Menu Edge Function:** Create a **new Edge Function** `generate-ai-menus`. It accepts batches of places, checks for a `websiteUri`, uses Gemini to read the site, extracts the top 3 items, and saves them to the new table.
3. **Client Orchestrator:** Create a new `core/menuCache.ts` utility to trigger this batch process independently of the existing AI Overviews.
4. **UI Display:** Show the fetched "Top 3 Items" prominently on the details page.

---

## 3. Image Cropping Fixes & Website Prominence
**Goal:** Ensure logos fit beautifully inside square cards and the website is highly visible.

*User Comment:* "make sure that horizontal image logos are not cutoff by our squares... Lastly, I would like the website to be a more prominent call to action button on the details page."

**Actionable Steps:**
1. **UI Cropping Fix:** In `components/NeonBorderCard.tsx` and `components/CuisineImageStrip.tsx`, update the `<Image>` components to render a blurred `cover` background underneath a crisp `contain` image layer. This preserves horizontal logos perfectly.
2. **Website Prominence:** In `app/(tabs)/(home)/random-result.tsx` (Details Page), move the Website/Menu button out of the secondary info area and make it a massive, primary CTA button at the very top of the page.

---

## 4. Recommendation Tuning & "Lying" Match Scores
**Goal:** Make recommendations feel accurate and provide a clear, confident directive to the user.

**Actionable Steps:**
1. **Audit & Tune Weights:** In `core/recommendationEngine.ts`, significantly increase the multiplier penalties if a restaurant doesn't match the user's hard preferences.
2. **Score Normalization ("Curving"):** Take the raw `finalScore` and normalize it. If the highest scoring restaurant in the radius is a 70/100, curve it so it displays as a `95% Match`.
3. **UI Integration:** Expose this final curved percentage prominently on the Home Spotlight cards and Details page using a bright badge.
