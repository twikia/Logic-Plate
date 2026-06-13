# Platebound UI Page Inventory

Complete text inventory of every app screen: what is shown, what can be filtered or configured, and every interactive control with its location. Layout files and pure redirects are noted briefly. Shared chrome used on multiple screens is listed first.

**Search radius presets (used across several screens):** 0.4 mi, 0.8 mi (default), 1.0 mi, 1.2 mi, 1.5 mi — displayed in km or miles per General Settings.

---

## Global chrome

### `app/(tabs)/_layout.tsx` — Bottom tab bar

**Information displayed**
- No labels on tabs (icons only).
- Active tab is highlighted (neon ring on Groups/Map when neon theme; elevated home button on Home).

**Buttons (bottom bar, left → center → right)**
| Location | Control | Action |
|----------|---------|--------|
| Left | People icon | Opens **Groups** tab (`/groups`) |
| Center (raised) | Home icon | Opens **Home** tab; double-tap within 300ms also navigates to home root |
| Right | Map icon | Opens **Map** tab (`/map`) |

---

### `components/ui/TopProfileButton.tsx` — Profile avatar (overlay)

**Where it appears:** Top-right on Home (`index.tsx`), Map (`map.tsx`), Groups index (`groups/index.tsx`), Quick Vote setup (`groups/quick/index.tsx`).

**Information displayed**
- User’s selected profile emoji avatar.

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-right | Avatar button | Opens **Profile** drawer (`/profile`) |

---

### `components/ScenarioQuickBar.tsx` — Scenario chips (Home only)

**Information displayed**
- Horizontally scrolling chips: emoji + scenario label (auto-scrolls; pauses on touch).
- Scenarios: Quick & Close, Wallet Wins, Eat Clean, Light & Coffee, Work Mode, Date Night, Squad Nearby, Munchie Mode, Recover & Fuel.

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Chip row | Each scenario chip | Opens **Select** screen (`/random`) with that scenario pre-applied |

---

### `components/auth/AuthGate.tsx`

No visible UI. Redirects users to pick-username, welcome-onboarding, tabs, or login based on auth/onboarding state.

---

## Tab: Home (`app/(tabs)/(home)/`)

### `index.tsx` — Home / Top picks

**Information displayed**
- Page title: `Top N picks` (N = visible count, max 10) or loading/error variants.
- **Spotlight card** (one per carousel page, up to 10 ranked restaurants):
  - Restaurant name
  - Distance, Google rating (if any), review count
  - Platebound **match** score (0–100) in circular gauge or gradient orb
  - Pentagon radar: Health (/10), Taste (/5), Value (/5), Date (/5), Speed (/5)
  - **Value match** bars: Distance, Health, Price, Rated, Novelty (0–100)
- Loading: progress bar with stage text (GPS, cache, fetch, rank, AI overviews).
- Error: message text.
- Empty: “No restaurants matched your filters nearby.”
- Hint below card (if >1 pick): “Swipe ↓ to skip”
- **Filmstrip** below carousel: icon thumbnails for each visible pick (scaled by selection).

**Implicit filters (not user-editable on this screen)**
- Recommendation engine prefs + session (meal type, group size, budget, radius, mood).
- Only top 10 scored; rejected picks hidden for session.
- Open-now and prefs from recommendation settings apply to scoring.

**Buttons & gestures**
| Location | Control | Action |
|----------|---------|--------|
| Top-right | Profile avatar | Profile drawer |
| Scenario bar | Scenario chips | `/random` with scenario |
| Card body | Tap | Restaurant detail (`/random-result`) |
| Card body | Swipe down (if >1 pick) | Skip / reject this pick |
| Card bottom-left | Apple Maps / Google Maps | Open native maps |
| Card bottom-right | Details | Restaurant detail |
| Carousel | Horizontal swipe | Change active pick |
| Filmstrip left | Refresh icon | Reload nearby restaurants |
| Filmstrip | Thumbnail tap | Jump to that pick |
| Error/empty | Try again / Refresh | Reload data |

---

### `pick-categories.tsx`

Redirect only → sends user to Home (`/(tabs)/(home)/`). No UI.

---

### `cuisine-results.tsx` — Cuisine search results

**Route params:** `cuisine` (display title), `cuisineKey` (filter key).

**Note:** Not linked from current in-app navigation; reachable via deep link / manual route.

**Information displayed**
- Header title: cuisine name from param.
- Radius bar: “Within {radius}”
- List subtitle: “{count} open spots within {radius}”
- Per **restaurant card**:
  - Photo strip (1 image or placeholder)
  - Name, price pill ($–$$$$)
  - Rating, distance, Open/Closed
  - Health bar + score (/10 or placeholder)
- Loading: progress bar + 3 skeleton cards.
- Error: location message + icon.
- Empty: “No open {cuisine} restaurants found within {radius}.”

**Filters**
| Control | Options | Effect |
|---------|---------|--------|
| Radius bar (top) | 0.4–1.5 mi presets | Refetch + filter distance |
| Implicit | `cuisineKey` | Open-only + cuisine type mapping (italian, mexican, asian, american, indian, mediterranean, cafe, bars, smoothies, vegan, pizza, dessert, other) |
| Pull-to-refresh | — | Force refetch |

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Header left | Back chevron | `router.back()` |
| Radius bar | Tap | Toggle radius picker dropdown |
| Radius picker | Preset pills | Change radius |
| Card | Tap anywhere on card | Detail (`/random-result`) |
| Card | Open in Maps | Native maps |
| Error | Try Again | Refetch |
| Empty | Expand Search Radius | Open radius picker |
| List footer | Load More | Show +10 results (pagination) |

---

### `random.tsx` — Select (random picker)

**Route params (optional):** `scenario` — enables vibe filter + preferred sort.

**Information displayed**
- Title: “Select”
- Search field placeholder: “Filter restaurants…”
- Count: “{n} restaurants matching filters”
- Per **row**: thumbnail, name, rating, Platebound score, health, price, distance
- Loading: progress + 5 skeleton rows.
- Error / empty states with icons and messages.
- Floating button when selection non-empty: “Pick One ({count})”

**Filters**
| Control | Location | Options | Effect |
|---------|----------|---------|--------|
| Text search | Top search box | Free text | Name substring filter |
| Clear search | Inside search (when text) | × | Clear filter |
| Radius chip | Top right of tool row | 0.4–1.5 mi | Refetch at radius |
| Filters chip | Top right | Panel | See below |
| **Filters panel** | Expandable | | |
| On | Toggle | Open / Any hours | `openOnly` |
| Vibe | Toggle (if scenario) | Scenario label on/off | Scenario restaurant match |
| Price | Pills | Any, $, $$, $$$, $$$$ | Price level |
| Min Rating | Pills | Any, 3.0+, 3.5+, 4.0+, 4.5+ | Google rating floor |
| Cuisines | Horizontal pills | italian, mexican, japanese, chinese, american, indian, thai, mediterranean, cafe, bars, smoothies, seafood, steakhouse, vegan, pizza, dessert | Cuisine type |
| Sort By | Horizontal pills | Distance, Price, Rating, Overall, Health, Taste, Value, Speed, Recovery, Munchy, Protein, Calories, Date, Solo diner, Energy | List order |
| Minimum AI (×2) | Metric dropdown + score pills | Taste, Value, Speed, Workout recovery, Munchy, Protein, Calorie fit, Date worthy, Solo diner, Energy sustain — min 0–5 or 0–10 | AI cutoff filters |
| Select All row | Below filters | Checkbox + label | Select/deselect all visible |
| Per-row checkbox | Right of row | — | Include/exclude from random pool |
| Pull-to-refresh | List | — | Refetch |

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Header left | Back | `router.back()` |
| Row main area | Tap | Detail (`/random-result`) |
| Row checkbox | Tap | Toggle selection |
| Bottom floating | Pick One | Random choice from selected → detail |
| Error | Try Again | Refetch |
| Empty | Expand Radius | Open radius picker |
| Filter panel | Close (×) | Close panel |
| AI metric modal | None / each metric | Pick AI filter slot |

Filter state persists locally between visits.

---

### `random-result.tsx` — Restaurant detail

**Information displayed**
- **Hero card:** primary type badge, price, Open now/Closed, name, rating + review count, distance
- **Platebound** arc gauge (/10) + word (Excellent/Great/Good/Fair)
- **Health** score (/10) + bar + word (Nutritious/Moderate/Indulgent)
- **AI Overview** summary text
- **Performance:** radar chart + 12 metric chips (Taste, Value, Speed, Workout, Munchy, Calories, Protein, Date, Solo, Energy, Work, Variety) each with value/max and mini bar
- **Who it's for** text (if present)
- **Typical macros** text (if present)
- **Contact & location:** address (copy hint), phone, website
- **Opening hours:** weekday lines (today highlighted green)
- Maps FAB: “Open in {Apple|Google} Maps” + “Directions”

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-left | Back | `router.back()` |
| Top-right | Share | System share sheet |
| Scroll | Pull-to-refresh | Refresh open-status epoch |
| Address row | Tap | Copy address |
| Phone row | Tap | `tel:` dial |
| Website row | Tap | Open URL |
| Bottom primary | Find on Local Map | Map tab + focus restaurant |
| Bottom ghost | Pick Again | `goBack()` |
| Bottom-right FAB | Open in Maps | Native maps |

---

### `settings.tsx` — Search radius settings

**Note:** Standalone screen; not linked from Profile (General Settings is used instead). May be legacy or deep-link only.

**Information displayed**
- Title: “Settings”
- Section: “Search Radius” + subtitle
- Selected radius pills + “Currently searching within {radius}”

**Filters**
| Control | Options | Effect |
|---------|---------|--------|
| Radius step buttons | 0.4–1.5 mi | Updates displayed selection (resets to default on focus) |

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Header left | Back | `router.back()` |

---

## Tab: Map

### `map.tsx` — Explore (native iOS/Android)

**Information displayed**
- Page title: “Explore”
- Google Map: user location dot, search-radius circle, color-coded restaurant markers (score label on marker reflects current sort)
- GPS loading overlay: “Acquiring GPS Lock”, subtitle, progress bar
- **Bottom sheet** (when marker selected):
  - Name, primary type
  - Pills: overall score, rating, distance, price, Open/Closed
  - AI overview summary
  - “Who is it for?”
  - Restaurant photo
  - Address, phone, hours
  - Horizontal AI scores strip (many metrics) + macros if available

**Filters**
| Control | Location | Options | Effect |
|---------|----------|---------|--------|
| Radius | Top-left chip | 0.4–1.5 mi | Filter markers; may refetch if expanded |
| Sort | Below radius | Distance, Price, Rating, Overall, Health, Taste, Value, Speed, Recovery, Munchy, Protein, Calories, Date, Solo diner, Energy | Marker color + label + z-order |

**Buttons & gestures**
| Location | Control | Action |
|----------|---------|--------|
| Top-right | Profile | Profile drawer |
| Map marker | Tap | Open bottom sheet + pan map |
| Bottom-left | Home icon | Center map on user |
| Bottom sheet handle | Tap / drag | Close or expand/collapse sheet |
| Sheet close (×) | Header | Close sheet |
| Sheet | Open in Apple/Google Maps | Native maps |
| Phone section | Tap | Dial |
| Sheet | Swipe up/down | Peek vs full height |

---

### `map.web.tsx` — Map placeholder (web)

**Information displayed**
- Emoji 🗺️, title “Map View”, subtitle that map is iOS/Android only.

**Buttons:** None.

---

## Tab: Groups (`app/(tabs)/groups/`)

### `index.tsx` — Vote together

**Information displayed**
- Title: “Vote together!”
- “Have a code?” label + code input
- Divider: “or start one”
- Create session / Quick Vote buttons with emojis

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-right | Profile | Profile drawer |
| Join row | Join | Validate 6-char code → vibe flow or alert |
| Center | Create session 📷 | Lobby (`/groups/lobby?mode=qr`) |
| Center | Quick Vote ⚡ | Quick vote setup (`/groups/quick`) |

**Input**
- Session code: up to 8 chars typed, normalized to 6 alphanumeric.

---

### `lobby.tsx` — Share with your group

**Route params:** `mode` = `qr` | `passphone` | `code`

**Information displayed**
- Title: “Share with your group”
- QR code (mode=qr) linking to `vote.platebound.app`
- Session code (spaced XXX XXX), “Tap to copy”
- “Waiting for responses” + voter names with checkmarks
- Response count + progress bar
- Loading spinner / error message

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-left | Back | `router.back()` |
| passphone mode | Add someone here | Vibe questionnaire (passphone flow) |
| Code block | Tap | Copy code |
| Share Code | Button | System share |
| Bottom | Everyone's in → | Reconcile group → vote screen (needs ≥2 responses; host action) |

---

### `vibe.tsx` — Group vibe questionnaire (multi-step)

**Route params:** `sessionId`, `flow` (`join` | `passphone`), optional `voterName`

**Information displayed — Step 0**
- “Any hard dietary needs?” + “(tap all that apply)”
- Name field: “Your name (optional)”
- Options: None, Vegetarian, Vegan, Halal, Kosher, Gluten-free, Dairy-free, Nut allergy

**Step 1 — Energy**
- “How are you feeling tonight?”
- Low key 😴, Pretty good 😊, Let's go 🔥

**Step 2 — Food mood**
- “What sounds good?”
- Warm & filling, Fresh & light, Comfort food, Bold flavors (2×2 grid)
- Surprise me 🤷

**Step 3 — Priority**
- “Tonight I care most about:”
- Keeping it affordable, Something close by, Somewhere really good, Trying something new
- “Submitting…” while saving

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-left | Back | `router.back()` |
| Step 0 | Next → | Step 1 |
| Each step | Option cards | Advance / submit |
| Step 3 | Priority card | Submit → waiting (join) or back (passphone) |

---

### `waiting.tsx` — Waiting for host

**Information displayed**
- “✓ Vote in!”
- “Waiting for everyone…”
- “{n} responded” + progress bar
- Note: host will start vote when ready
- Spinner

**Buttons:** None (auto-navigates when session status → `voting`).

---

### `vote.tsx` — Group vote

**Information displayed**
- “Pick your favorite”
- Cards per restaurant pick (via `QuickVoteRestaurantCard`): name, health, rating, distance, AI overview, optional group match score, vote bar, vote count

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Each card | Vote for this | Cast one vote (once per user) |
| Bottom (host only) | End voting | Complete session → winner |

---

### `winner.tsx` — Group winner

**Information displayed**
- “You're going here 🎉”
- Winner photo, name, one-line vibe, distance/address, price
- Buttons: Open in Maps, Share result, Done

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Open in Maps | | Google Maps URL |
| Share result | | Share message |
| Done | | Groups index |

---

## Quick Vote (`app/(tabs)/groups/quick/`)

### `index.tsx` — Quick Vote setup

**Information displayed**
- Title “Quick Vote”, subtitle “Everyone votes together”
- Number of voters (2–12, default 3) with − / + and hint
- Or warning if &lt;5 cached restaurants

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-left | Back | Groups index |
| Top-right | Profile | Profile drawer |
| − / + | Voter count | Adjust 2–12 |
| Start voting | | Preview screen with 5 picks |

---

### `preview.tsx` — Tonight's picks

**Information displayed**
- “Tonight's picks”, “{voters} voters · review the list…”
- List of 5 `QuickVoteRestaurantCard` (read-only, no vote button)

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-left | Back | Groups index |
| Footer | Confirm & begin voting | Vote screen voter 1 |
| Footer | Reroll all 5 | New random 5 (needs ≥10 cached) |

---

### `vote.tsx` — Pass-the-phone voting

**Information displayed**
- “Voter {current} of {total}”
- 5 cards with **Vote for this** on each

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-left | Back | Groups index |
| Top-right | End | Winner screen (early end) |
| Card | Vote for this | Handoff screen |

---

### `handoff.tsx` — Vote casted / pass phone

**Information displayed**
- “Vote casted!”
- “Pass to Voter {n}” or “Tallying results…”
- “Tap anywhere to continue”
- Countdown progress bar (8s)

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Full screen | Tap | Next voter or winner |

---

### `winner.tsx` — Quick Vote winner

**Information displayed**
- Celebration, photo, name, expanded card
- “Vote breakdown” with medals, bars, vote counts
- Or “Voting ended” / no votes message

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-left | Back | Groups index |
| Open in Maps | | Google Maps |
| Start Over | | Quick vote setup |

---

## Auth (`app/(auth)/`)

### `login.tsx` — Sign in / Sign up

**Information displayed**
- Brand “Platebound”
- Headline: Welcome back / Save this profile / Create an account
- Sign in | Sign up toggle
- Fields: username (signup), email, password
- Error message line
- “or” divider
- OAuth icon grid
- Guest CTA when logged out; “Back to app” when guest

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Toggle | Sign in / Sign up | Switch mode |
| Primary | Sign in / Sign up | Email auth |
| Social | Google, Apple, GitHub, Discord, Facebook, Twitter, Microsoft | OAuth |
| Bottom | Continue as guest | Anonymous sign-in → tabs |
| Guest | Back to app | Tabs |

---

### `pick-username.tsx` — Choose username

Uses `SetUsernameForm`:
- Title, subtitle, username input, hint (2–30 chars), error, **Save**

---

## Root stack modals (`app/`)

### `profile.tsx` — Profile drawer (right slide-over)

**Information displayed**
- **Account:** guest vs signed-in copy, email, user ID, username under avatar
- **Subscription mini-card:** “Free Tier”, “Standard features”
- **Settings** links
- **Theme Preferences:** horizontal theme swatches (Neon Dark, Soft Paper, Sunset Blush, Melon Fresh, Zest Appeal, Cosmic Dust)
- **Developer** tools (if visible)

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Backdrop | Tap | Close drawer |
| Guest | Save or link account | Login |
| Guest | Username (optional) | Edit username modal |
| Signed-in | Edit username | Edit username modal |
| Signed-in | Sign out | Sign out |
| Avatar | Change | Avatar picker modal |
| Upgrade | | Subscription screen |
| Recommendations | | Recommendation settings |
| General Settings | | General settings |
| Subscription | | Subscription screen |
| Theme swatch | Tap | Apply theme |
| Run All Tests | | Cache tests |
| Clear All Caches | | Wipe caches → welcome onboarding |
| Test AI Edge Call | | Dev AI function test |
| Avatar modal | Emoji grid | Select avatar |
| Avatar modal backdrop | Tap | Close modal |

---

### `edit-username.tsx` — Edit username modal

`SetUsernameForm`: title, subtitle, input, **Save**; backdrop tap closes.

---

### `subscription.tsx` — Subscription plans

**Information displayed**
- Hero: “Level Up Your Experience”
- Billing toggle: Monthly / Yearly (−20% badge)
- Tier cards: **Free** ($0), **Minimal** ($4.99), **Pro** ($9.99, most popular), **Ultimate** ($19.99) with feature bullets
- Footer: App Store payment note

**Filters**
| Control | Options | Effect |
|---------|---------|--------|
| Billing cycle | Monthly, Yearly | Displayed price (yearly −20%) |

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Header back | | `router.back()` |
| Each tier | Current Plan / Select Plan | Haptic only (no real purchase wired) |

---

### `general-settings.tsx` — General settings

**Information displayed**
- **Search preferences:** Distance unit (KM / Miles)
- **Audio & feedback:** App volume (5 steps), Haptic feedback toggle
- **Notifications:** Push notifications toggle (UI only; not persisted in code read)
- **About:** Version 1.0.4 (Phase 2), credits line

**Buttons / controls**
| Location | Control | Action |
|----------|---------|--------|
| Header back | | Back |
| KM / Miles | | Save distance unit |
| Volume dots | 0–100% steps | Save volume |
| Haptics switch | | Save haptics pref |
| Notifications switch | | Local state only |

---

### `recommendation-settings.tsx` — Recommendations

**Information displayed**
- Intro: importance levels 1–5 (emoji: Barely → Essential) for each metric
- **Three sections** (same as onboarding):
  - Practical: Speed, Cost, Distance
  - Health & nutrition: Health, Workout recovery, Protein, Calories
  - Taste & cuisine: Cuisine fit, Cuisine variety, Favorite cuisine adherence, Taste
- **Favorite cuisines** grid (19 tiles: Italian, Japanese, Mexican, …)
- Note: “Open now is always on…”

**Filters / configuration**
| Control | Effect |
|---------|--------|
| Per-metric emoji level 1–5 | Updates recommendation weights |
| Cuisine tile tap | Toggle favorite cuisine |
| Reset priorities | Restore default weights |

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Header back | | Back |

---

### `welcome-onboarding.tsx` — First-run onboarding

**Information displayed**
- Paged flow (same 3 metric screens + cuisine page as recommendation settings)
- Progress dots
- Cuisine page: “Pick at least one” grid

**Buttons**
| Location | Control | Action |
|----------|---------|--------|
| Top-left back | | Previous page or back |
| Footer | Continue / Start exploring | Next page or finish → tabs |
| Swipe | Horizontal | Change page |

---

## Shared component reference

### `QuickVoteRestaurantCard`

When `onVote` provided, shows per card:
- Thumbnail, name, health bar + /10, rating · distance, “AI overview” text, optional vibe fallback, **Vote for this**.

Used on: group vote, quick vote preview/vote/winner.

---

## Layout-only files (no screen UI)

| File | Role |
|------|------|
| `app/_layout.tsx` | Root stack: tabs, auth, profile modal, edit-username modal |
| `app/(auth)/_layout.tsx` | Auth stack |
| `app/(tabs)/(home)/_layout.tsx` | Home stack |
| `app/(tabs)/groups/_layout.tsx` | Groups stack |
| `app/(tabs)/groups/quick/_layout.tsx` | Quick vote stack |

---

## Route summary

| Path | Screen file |
|------|-------------|
| `/(tabs)/(home)/` | `index.tsx` |
| `/pick-categories` | redirect → home |
| `/cuisine-results` | `cuisine-results.tsx` |
| `/random` | `random.tsx` |
| `/random-result` | `random-result.tsx` |
| `/settings` | `settings.tsx` |
| `/map` | `map.tsx` / `map.web.tsx` |
| `/groups` | `groups/index.tsx` |
| `/groups/lobby` | `lobby.tsx` |
| `/groups/vibe` | `vibe.tsx` |
| `/groups/waiting` | `waiting.tsx` |
| `/groups/vote` | `vote.tsx` |
| `/groups/winner` | `winner.tsx` |
| `/groups/quick` | `quick/index.tsx` |
| `/groups/quick/preview` | `quick/preview.tsx` |
| `/groups/quick/vote` | `quick/vote.tsx` |
| `/groups/quick/handoff` | `quick/handoff.tsx` |
| `/groups/quick/winner` | `quick/winner.tsx` |
| `/(auth)/login` | `login.tsx` |
| `/(auth)/pick-username` | `pick-username.tsx` |
| `/profile` | `profile.tsx` |
| `/edit-username` | `edit-username.tsx` |
| `/subscription` | `subscription.tsx` |
| `/general-settings` | `general-settings.tsx` |
| `/recommendation-settings` | `recommendation-settings.tsx` |
| `/welcome-onboarding` | `welcome-onboarding.tsx` |

---

*Generated from source audit of `app/` routes and shared UI components.*
