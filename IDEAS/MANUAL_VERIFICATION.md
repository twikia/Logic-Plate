# Platebound: Feature Verification Guide

When the current set of planned features are deployed, please use this checklist to manually verify that the system is working as intended in production.

## 1. Image Scraping & Fallbacks
- [ ] **Action:** Find a local restaurant that has a valid website link but few/no Google photos. Wait for the `fetch-restaurant-photos` Edge Function to complete.
- [ ] **Expected:** The app should display up to 3 photos scraped directly from the restaurant's website (including `<img>` tags, not just `og:image`).
- [ ] **Action:** Find a restaurant with *no* website and *no* Google photos.
- [ ] **Expected:** The Edge Function should fallback to Wikimedia/Unsplash. The Wikimedia image should look like a restaurant or food, NOT a generic city landscape.

## 2. Homepage UI (Images)
- [ ] **Action:** View a restaurant on the Home screen (Spotlight or Random Picker).
- [ ] **Expected:** The hero image section should be noticeably larger. If the restaurant has multiple images (up to 3), you should be able to swipe/scroll horizontally through them.

## 3. Dynamic H3 Macro Grids & Distance Slider
- [ ] **Action:** Open App Settings.
- [ ] **Expected:** The old radius picker buttons are gone, replaced by a smooth slider up to 25 miles.
- [ ] **Action:** Set the slider to 5 miles and trigger a search.
- [ ] **Expected:** The app fetches data via the new macro H3 grid flow (resolution 7/6). The results should cover the broad area without overloading the API (max 2-4 massive cells).
- [ ] **Action (Auto-Fallback):** Move the map to a rural area where a 1-mile search yields zero or very few open places.
- [ ] **Expected:** The app should automatically step up the radius and re-fetch in the background until it finds at least 5 valid, open options to display.

## 4. Menu Extraction (On-Demand)
- [ ] **Action:** Tap into a restaurant's Details page that has a website.
- [ ] **Expected:** A brief loading state occurs as the new `generate-ai-menus` Edge Function reads the website. The "Top 3 Signature Items" should then appear on the screen.
- [ ] **Action:** Go back to Home, then tap into the *same* restaurant again.
- [ ] **Expected:** The Top 3 items load instantly without hitting the Edge Function (verifying `restaurant_menu_cache` by `place_id` is working).

## 5. Details Page Persistence & UI
- [ ] **Action:** On the Details page, collapse the "Health & Macros" accordion section.
- [ ] **Action:** Open a completely different restaurant's Details page.
- [ ] **Expected:** The "Health & Macros" section should start in a *collapsed* state, remembering your preference.
- [ ] **Action:** Review the top of the Details page.
- [ ] **Expected:** 
  1. The "Platebound Match %" badge is prominent at the top.
  2. The Website/Menu CTA is a massive, primary button at the top of the view.
