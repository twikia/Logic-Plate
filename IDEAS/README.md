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
