## 2026-07-28 Codebase Audit & Refactor

### Security & Bugs Patched
*   **`.gitignore` / `.env`**: Stopped tracking committed `.env` (local file kept) and ignore all `.env*` secrets going forward; added `.env.example` as a safe template. **Rotate `EXPO_PUBLIC_APP_SECRET`, Maps keys, and any other values that were ever committed.**
*   **`scratch/test_api.js`**: Removed tracked script that hard-coded live Supabase publishable key + APP_SECRET.
*   **`supabase/migrations/20260728210000_security_hardening.sql`**: Closed open anon INSERT on `group_sessions`; added trigger so clients can only change `status` (not host/picks/cells); required `voter_response_id` ownership for votes + unique one-vote-per-response; legacy cache / rejected-places / foursquare policy hardening is conditional on table existence (fixes deploy failure when `restaurant_cache_res*` is absent).
*   **`supabase/functions/_shared/websiteScrape.ts`**: Added SSRF guards (`isSafePublicHttpUrl`) blocking non-http(s), credentials-in-URL, localhost, and private/link-local IPs before ping/fetch (including redirect targets).
*   **`supabase/functions/_shared/security.ts`**: Added constant-time `secretsEqual` / `assertAppSecret` / `bearerToken` helpers for edge auth.
*   **`supabase/functions/create-group-session/index.ts`**: Caps `cellIds` length; still accepts client `hostUserId` for easy testing (JWT host-binding deferred until accounts).
*   **`supabase/functions/reconcile-group/index.ts`**: APP_SECRET gate only — no JWT host check for now (`deploy.ps1` uses `--no-verify-jwt`).
*   **Edge functions (`v2-fetch-restaurants`, `v2-generate-ai-overview`, `v2-scrape-websites`, `fetch-restaurant-photos`, `generate-ai-menus`)**: Switched APP_SECRET checks to timing-safe compare.
*   **`core/rejectedPlaces.ts`**: Removed client upsert to `v2_rejected_places` (local AsyncStorage only); prevents anon tombstone poisoning. Edge functions remain the source of shared rejections.
*   **`utils/safeOpenUrl.ts` + call sites**: Website/tel/maps http(s) opens now reject unsafe schemes (`javascript:`, etc.).
*   **`app/(tabs)/groups/lobby.tsx` / `vote.tsx`**: Removed AppState background handlers that expired the whole group session when the host briefly left the app.
*   **`app/(tabs)/groups/vote.tsx` / `platebound-vote/app/vote/[code]/page.tsx`**: Votes now require a real `voter_response_id` (no null ballot stuffing).

### Dead Code Removed
*   **`scratch/test_api.js`**: Secrets-bearing one-off API test script.
*   **`components/hello-wave.tsx`**, **`parallax-scroll-view.tsx`**, **`themed-text.tsx`**, **`themed-view.tsx`**, **`ui/collapsible.tsx`**, **`hooks/use-theme-color.ts`**: Unused Expo template components.
*   **`fix_safe_area.js`**, **`download.js`**: One-off root scripts with no app references.
*   **`core/menuCache.ts`**: Unused client wrapper for legacy `generate-ai-menus`.
*   **`core/images/imageCache.ts` (`clearRemotePhotoCache`)**: Removed dead client API that could never delete rows under service-role-only RLS.

### Architecture & Health Improvements
*   **`supabase/functions/_shared/security.ts`**: Centralized edge secret verification to reduce copy-paste auth drift.
*   **`.env.example`**: Documents required env vars without values for onboarding.
*   **Auth posture (temporary)**: Edge deploy stays `--no-verify-jwt`; group host JWT enforcement deferred until user accounts are productized.

### Follow-up (not fully remediable in-app alone)
*   **`EXPO_PUBLIC_APP_SECRET` remains embedded in the client bundle** — rotate it after this audit, then plan JWT + rate limits as the real authorization layer for costly edges (Gemini/Overture/scrape).
*   Apply migration `20260728210000_security_hardening.sql` to the hosted Supabase project and redeploy updated edge functions.
*   Purge secrets from git history if the repo is or will be public (`git filter-repo` / BFG); ignore alone does not scrub past commits.

---

# Manual Verification Checklist

The agent has completed the requested updates. Since there is no automated testing configured for Platebound, please manually verify the following changes:

## 1. H3 Macro-Grid Expansion (Up to 25 Miles)
- **Settings Screen / Random Picker**: Verify the new `Slider` components function correctly and allow you to set the search radius up to 25 miles smoothly.
- **Auto-Expansion**: Go to the Home Screen and trigger a scenario where there are fewer than 5 valid open options. Ensure that the app automatically expands the search radius without hitting the API redundantly.
- **Edge Functions**: Monitor your Supabase logs for the newly created `fetch-missing-cells-macro` Edge Function. Ensure it is correctly invoked when your search radius exceeds ~1.4 miles.

## 2. Advanced AI Image Scraping
- **Edge Function Update**: Observe the results in the app after triggering `fetch-restaurant-photos`. 
- **Image Priority Logic**: Ensure that the first attempt accurately fetches images from the restaurant's website endpoints. If successful, confirm that you see up to 3 images.
- **Fallback Logic**: If 0 images are found from the website, ensure it falls back to the newly tightened Wikimedia Commons search query (which includes strict restaurant/food keywords).
- **Home Screen UI**: Confirm that the images are now displayed larger on the home page. If there are multiple photos, verify that the image carousel works and lets you swipe through them.

## 3. Gemini AI Menu Scraping
- **Details Page**: Click into a restaurant's Details view from the Home Screen or Random Picker.
- **Collapsible Menu**: Verify the new "Top 3 Items" section. Ensure it defaults to expanded or collapsed according to your preferences (persisted across sessions).
- **Accuracy**: Ensure the AI scraped items make sense for the restaurant.
- **Database Checking**: Verify that `restaurant_menu_cache` in Supabase correctly caches these responses so repeated fetches to the same restaurant aren't consuming additional Gemini API quota.

## 4. UI/UX Polishing
- **Call-to-Action**: On the restaurant Details page, check that the Website CTA is more prominently displayed as requested.
- **Curved Match Scores**: Check if the recommendation "Platebound Score" looks more appealing and "exciting." The previous 60-70 raw scores should now curve visually closer to 85-92.

## 5. Deployment Build Verification
- **Android Prebuild**: Run `npx expo prebuild --platform android` and verify that the custom properties in `android/gradle.properties` (specifically `reactNativeArchitectures=arm64-v8a`) persist without reverting to a huge multi-architecture APK.
