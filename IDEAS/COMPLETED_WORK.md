# Completed Work

A readable record of shipped features, UX changes, and infrastructure work across Platebound. Items are grouped by area and ordered roughly by user journey.

---

## Table of Contents

1. [Next Up](#next-up)
2. [Home Screen](#home-screen)
3. [Onboarding & Preferences](#onboarding--preferences)
4. [Filters & Categories](#filters--categories)
5. [Recommendation Engine & Context](#recommendation-engine--context)
6. [Themes & Auth](#themes--auth)
7. [Map](#map)
8. [Social & Quick Vote](#social--quick-vote)
9. [Detail Page](#detail-page)
10. [Web Vote Companion](#web-vote-companion)
11. [AI & Scoring](#ai--scoring)
12. [Performance & Caching](#performance--caching)
13. [Changelog Verified](#changelog-verified)
14. [Still Open](#still-open)

---

## Next Up

Work remaining after this batch:

- Intro sliders
- How to display info in cards
- Top card categories and filters

---

## Home Screen

### Card layout & readability

- Homepage card text is more readable
- Scores color-coded per score (red = bad, orange = neutral, green = good) — each score judged independently, not relative to others
- Pentagon diagram is bigger and moved down slightly
- Pentagon has gradient fill
- Pentagon chart shows exact scores: health, taste, value for money, date worthiness, and speed
- Pentagon chart labels sit below the chart, not on the chart
- Pentagon right-edge values fixed so info is correct
- "Match categories" label added above the bars
- Match signal bars made smaller horizontally; pentagon stacked to the left of bars on the same line
- Homescreen pentagon on same line as match bars; bars smaller so pentagon gets more space
- Bigger pentagon; match engine text removed; diagram uses as much space as possible
- Removed AI overview and taste profile from homepage card
- Bottom card text reads only "Tap for more details"
- Price range (money) shown on homepage cards
- Ratings shown on cards alongside Platebound scores (purple)

### Card image & interaction

- Card image pinned — does not move with content; equal distance from left and top of neon border
- Removed chevron from home screen cards entirely
- Removed "Open in local maps" button from homepage cards
- Entire card is tappable (replaces separate details button); subtle press-state cue for clickability
- Swipe-down gesture dismisses card; swipe-down animation when X is clicked
- Removed swipe-down check for dismiss (reserved for refresh)
- Title text wraps sooner so it does not sit behind the X button
- Removed image from main card; centered card is bigger with stats/charts for AI overview and metrics
- Reasons for choosing the card made smaller

### Top picks carousel

- Only open restaurants shown on main cards
- Only 4 restaurants shown and ranked on homepage (with full pool available via refresh)
- Top 10 picks gallery: phone-like carousel with little icons below; swipe or tap to move; no reroll except when preferences change; forward/back through picks
- Selected card scaled up; nearby cards partially scaled
- Bottom preview cards are question marks, much smaller horizontally, more vertical, minimal gap — ~⅔ total width for all 10
- Scale middle card much more compared to neighbors
- Remove top picks text at top left; top-right reject X on card removes from top 10 (can eliminate down to 1, not 0)
- Clicking X removes restaurants without backfill — list collapses 10 → 9 → 8 … minimum 1
- Removed top 3 match cards with emojis below reviews
- Removed bar with lunch / solo / price etc. above main card
- Removed bottom 10 icons; cut homepage info for a friendlier UX
- Home screen not scrollable when there is no content to scroll to
- Card size reduced so homepage scrolling is not required
- Refresh 10 restaurants and top-10 calculation by dragging from top on home screen
- Small refresh icon left of bottom card icons refreshes all 10 back to main page
- Removed X dismiss; swipe down to dismiss card; tooltip updated below card

### Navigation & state

- Back button greyed out during intro survey unless there is a previous page and user is not on first page
- Back / pick-again from details (opened from home) preserves home scroll position — does not reset to first element
- Filters reset on back button or double-tap home tab; state persists when switching bottom tabs
- Top-right icon moved down slightly; home content shifted down a bit more

### Footer & tabs

- Footer cutout removed — plain bottom bar with circle in middle
- Bottom bar split: Friends (left) and Map (right) flanking home
- Footer cutoff height fixed — no extra scrolling
- Social icon in footer uses leftmost icon; old social icon replaced; removed dead leftmost button

### Cuisine bar

- Replaced cuisine screen with top button bar that jumps to filtered results
- Slow auto-scroll on cuisine bar; wraps both directions
- Auto-scroll continues after user touches and scrolls the select bar
- Auto-scroll glitches fixed — no auto-scroll while user holds/clicks top bar; click animation does not block scroll

### Misc home fixes

- Smaller H3 cells, less max distance — adaptive / population-aware cells
- Display only open places on main cards
- Random top text failure addressed
- Entry screen showing twice fixed

---

## Onboarding & Preferences

- First-opening survey timing fixed for very first app open
- Removed last intro page that chose distance
- Ranking cuisines allows removing top rank — none is a valid state
- Removed my-preferences fields outside top 3 categories
- Show-only-open default set to true in settings once toggle removed
- Algorithm updated: top 3 categories only; removed repeat windows, min rating, group size, etc.; weather and time still applied behind the scenes
- Time zones converted correctly; AM/PM parsed correctly for open/closed on map and homepage cards
- First survey screen no longer shown on every startup
- Unit select on first start (metric)
- Login page says "Continue as guest"
- Login as guest below other login options
- Clear cache forces clear preferences and resets to select-preferences first screen

---

## Filters & Categories

- Open Now, vibe, price, and rating filters labeled; rearranged for clarity and less vertical space
- Removed "Open Now" and "Vibe" text labels — checkboxes are sufficient
- Three columns: Open Now + Vibe stacked vertically | Price vertical | Min rating vertical
- Bottom two filters changed to sliders with exact value shown; sliders hidden when none selected
- "On" label above open filter changed to "Open Now"
- Minimum AI text changed to "Extra score cutoffs"
- Regular filters auto-close on outside click; distance filter stays open (small)
- Rating-based match score at top plus filter
- Two score filter for AI filter tab
- Many more scores available to sort/cutoff: taste, value for money, speed, workout recovery, munchy, protein, calories, date worthiness, solo diner friendly, energy sustain
- Show overall score; removed open score on filter screen; show health score, rating, price, distance
- Filter cards clickable (not long-press); small checkmark box selects
- Two checkboxes (Open + Vibe) on same line
- Filters panel has X button to close
- Price range shows actual prices, not just dollar signs
- Cafe, drinks, and non-food filters added
- Health screen sort by custom health preferences

---

## Recommendation Engine & Context

- Time of day — device clock (7am breakfast, 12pm lunch, 6pm dinner, 10pm late night) filters and reranks automatically
- Day of week — weekend vs weekday behavior (e.g. Friday/Saturday night, weekend brunch)
- Location — H3 cell and nearby context
- Profile preferences — cuisine, budget, dietary from onboarding (top 3 categories)
- Weather — Open-Meteo; rainy → comfort food; hot → lighter options
- Faster GPS acquisition (less accuracy acceptable)
- Load and cache on open: GPS, default 4km distance; re-query only if user requests extra; refresh uses database without edge function
- AI calls cached, non-blocking — blank while loading
- Parallel AI calls (batch 5) to reduce latency
- Loading bar reflects status correctly (not stuck at 97% "Finalizing")
- Calories treated specially in recommendations: lower score favors fewer calories, higher favors more; 3 is neutral
- Overall score from AI scores aggregated
- Speed score swapped to correct category; scored 0–5 based on how fast food arrives; categories clarified for AI and users

---

## Themes & Auth

- White cartoon theme built with Sonnet; modular structure
- Themes remade completely
- Auto login as guest; login page only when user chooses — not on every open
- Modular back button component shared across pages (small chevron top-left)

---

## Map

### Drawer & detail sheet

- "Open in Maps" pinned bottom-right of drawer; smaller; label "Maps"; blue button with black text
- Image at top left next to name (moved from middle)
- Address below phone number card; tap copies to clipboard
- AI scores color-coded: red bad, green good, orange neutral
- Selected score shown (color-coded) when a non-overall metric is selected
- Map card scrolls fully when not fully expanded

### Pins & icons

- Restaurant-type icons (beer garden → beer mug, bar → cocktail, etc.) — many distinct icons
- Icons bob slightly; selected pin changes icon; closed places greyed out (not hidden)
- Icons slightly faded when closed
- Fixed icon clipping at bottom and right
- Fixed map numbers above icons causing bottom cutoff
- Cool custom restaurant icons instead of plain circles
- Icons drawing then failing — fixed
- Black logos visibility in images addressed

### Distance & data

- 3km option added; auto-set to 3km on every app open (resets even if user picked farther before)
- 16km removed from map distance picker
- Changing distance updates pins — show/hide based on radius
- Color scale red → green based on min/max of currently viewable restaurants (always one pure red and one pure green in range)
- Scores displayed with smaller icons to avoid clipping; scores styled nicer
- Colors ranked correctly per score (best green, worst red) — not randomized
- Dessert screen missing places — fixed
- Change icon no longer saves (intentional or fixed per spec)

### Map UX

- Circle around dot follows zoom correctly (not wrong position)
- Sortable indicators on map (e.g. healthiness red → green)
- Closed places greyed on map rather than removed

---

## Social & Quick Vote

### Session lifecycle

- Back button removed once voting starts (host)
- Tapping social tab while in session ends session and goes home; switching tabs and returning preserves session
- Sessions end when host stops — back, close app, or timeout invalidates session in Supabase
- Ended sessions notify web voters; invalid codes show session-ended screen
- Join after host closed session blocked — no preference/vote screen
- End voting once everyone votes
- Owner can vote in sessions

### Host UI

- Session Start button: rounded borders, colored border like "Answer for myself"
- Start button top-right, pinned; "2 votes needed to start" next to response count — no scroll to see
- Back button matches details page (light grey circle) — modular component
- Back becomes End after first vote cast; before first vote = normal back; after vote finishes = back to voting home
- Removed End text button top-right (back handles it)
- Top-left back goes all the way to social main page

### Quick vote flow

- "Everyone votes together" → "Pass the phone and vote" → simplified to "Pass the phone and vote" (no "in order")
- Quick vote first screen: voter count picker before start
- First screen: confirm button (not timeout); reroll below button; big reroll only on first restaurant display page
- Shows restaurants first, then vote screen
- Pass-to-next screen: no restaurant display or name — "Vote casted!"; chosen restaurant shown; 4 second display, skippable on click; longer delay before next voter
- All voting pages show health, rating, AI overview
- Distance and cost on quick vote cards and first confirm/random page
- Images shown on quick vote pages (were defaulting)
- Vote buttons square, same size, much bigger (nearly card height); "Vote" text inside square
- Whole card expands/collapses AI overview; small square vote box on right
- Removed "Vote for this" button
- AI overview expandable, not always visible
- Dietary needs: removed name field; skip/next as bottom-right overlay button
- Join at top, then Create session for QR; removed gen code; "Create session"; header "Vote together!"
- Removed pass-the-phone line; quick vote at bottom; "QR code" → "Generate QR code"
- Center content vertically on quick vote start screen
- Reduced friction to start; end button for voting
- After vote ends, back goes to home vote screen not prior voting step

### QR & web

- QR code website load failures addressed
- Supabase function setup documented for voting errors

---

## Detail Page

- Detail page layout cleaned up
- Removed top vibe score podium section
- Swipe-down hint and "tap for more details" on one line; copy shortened
- Send to local maps replaced with details entry point; tap-card / details button retained for navigation
- Overall score from aggregated AI scores
- Number of ratings displayed
- Absolute macros from database
- Calories score reflects actual calorie level
- Pros and cons split onto own line with color emphasis

---

## Web Vote Companion

- Small layout fixes for web voting: vote box matches host (voting text, size)
- Health score above AI overview on web to match host app
- AI overview cutoff on web fixed
- Places data shared through Supabase on session start — AI overview and health score on non-host clients
- Session ended / invalid session screens on web app

---

## AI & Scoring

- Model switched to Gemini 3.1 Flash Lite
- AI breakdown schema: summary, speed 0–5, health 0–10, workout recovery, processed, calorie, protein, carb, date worthiness, noise, group size, absolute macros, audience fit
- Database for AI analysis
- Pros and cons split from AI overview on own line; words colored
- Calories score on details page conveys calorie amount
- Number of ratings on details page
- Macros restored on details page (absolute macros from DB)
- Switch Places API back to Pro (from Enterprise); AI input updated accordingly
- Batch Gemini API into 10 restaurants at a time
- System instruction cache in edge functions
- Irrelevant fields removed from AI instructions; forced JSON response
- Bad images mitigated — show one image; generic fallback with footnote considered (TripAdvisor, OSM, Unsplash explored)

---

## Performance & Caching

- Loading bar logic extracted to own file; referenced from cuisine screen and elsewhere
- Loading bar on health screen; smooth progress on random selection (not instant jump after GPS)
- Caching issue with images — clear-all-cache support
- Fetch missing cells 401 traced to env (not app bug)
- Home screen loads on bad WiFi when cache warm (map worked; home fixed)
- Refresh uses database, not edge function
- VirtualizedList slow update in cuisine expansion — renderItem performance improved
- Hard-coded location / location manager for dev

---

## Changelog Verified

- Weather used in recommendation pipeline
- Open hours compared to current local time (not Google "currently open" flag alone)
- Still showing open on random pick when closed — fixed with hours comparison
- Quick vote "no nearby" when ~100 nearby — fixed
- Guest sign-in broken — fixed
- Supabase errors in voting — setup steps documented
- Places data missing AI fields for clients — fixed
- Web voting box and layout parity with host
- First survey not on every startup
- Calories recommendation direction (low vs high) correct

---

## Still Open

Tracked elsewhere — not part of completed work above.

### IDEAS (future)

- Fix GPS lock when user taps during acquisition
- Fetch missing cells 401 — confirm env-only (not app bug)
- Single recommendation with few free rerolls; category filter chips above list
- Base feeling on food groups (munchies, late night, hungover) not just cuisine
- Contextual shift by time of day and feeling
- Cuisine selection: scrollable premium images (Unsplash, 4 photos per cuisine)
- Cuisine ranking: top 5 not just top 1; bars, cafe, bakery
- AI scores: hungover recovery, munchy, variety, macro-friendly, solo diner, energy sustain, work friendly
- Make AI cheaper and faster

### BUGFIXES (pending)

- Pentagon inside other layout elements
- Big chains (McDonald's) fallback image / Supabase / Wikimedia
- Refactor photos — no API key client-side; Yelp Fusion or Foursquare
- Open check still wrong in edge cases
- Back button black screen
- Extremely slow loading sometimes
- Social screen wrong background
- Expand details on most cards
- Supabase setup gaps
- Send to maps app polish

### LATER

- Loading screen with tooltips and hexagons ("indexing nearby restaurants")
- Secure Google API key in Supabase only

---

*Last updated: June 2025*
