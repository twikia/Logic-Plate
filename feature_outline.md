# App Feature Boilerplate & Planning Outline

## 1. App Core Features & Brainstorming
*Use the space below each feature to brainstorm exactly how it works, looks, and feels.*

### 🍽️ Food & Restaurant Discovery
- **Cuisine Selection & Nearby**
  - *Brainstorm:* 
- **Compare Foods/Restaurants**
  - *Brainstorm:* 
- **Interactive Menus (Expand when browsing)**
  - *Brainstorm:* 
- **Favorite Places**
  - *Brainstorm:* 
- **Map View (Google Maps)**
  - *Brainstorm:* 

### 🤖 AI Integration (Gemini)
- **AI Suggestions / Compare / Overview of Restaurants**
  - Auto analyze/follow up questions to a restaurant that you can add or search for

### 👥 Social & Group Dynamics
- **Friend Groups & Friends Vote**
  - *Brainstorm:* 
- **Competitions / Leaderboards**
  - *Brainstorm:* 

### 🍏 Health & Finance Tracking
- **Healthiness & Macros (Macro Tracking)**
  - *Brainstorm:* 
- **Spending Tracker**
  - *Brainstorm:* 
- **Goal Tracking (Health & Finance)**
  - *Brainstorm:* 

### 📱 General App Experience
- **Ease of Use (UX Focus)**
  - *Brainstorm:* 
- **Very Minimalistic Homescreen**
  - *Brainstorm:* 

---

## 2. UI/UX, Theming, & Navigation Structure

### Design System
- **Themes:**
  - *Primary Theme:* Dark Mode focus with warm, vibrant gradients ("Sunset Blush"). Applied to Home, Research, and Map.
  - *Secondary Theme:* Light Mode focus with pastel gradients ("Melon Fresh"). Applied to Social and Tracking.
  - *Color Palette (Sunset Blush):*
    - **Background:** Deep Plum/Magenta fading to a warm Peach/Sunset Orange.
    - **Surface / Card Background:** Dark, muted brownish-grey.
    - **Accent / Primary Color:** Bright Coral / Salmon Orange.
    - **Text Colors:** Pure White for headings, light muted grey/pink for secondary.
  - *Color Palette (Melon Fresh):*
    - **Background:** Soft pastel Melon/Peach to Mint Green gradient.
    - **Surface / Card Background:** Very light Cream/Off-White (`#FDF8F5`).
    - **Accent / Primary Color:** Soft Melon Orange (`#FF9F80`).
    - **Accent 2 / Secondary Color:** Soft Mint Green (`#C1E1C1`).
    - **Text Colors:** Dark Forest Green (`#2B422A`) for headings, muted grey/brown (`#8E837D`) for secondary.
- **Typography & Font Styles:**
  - *Headings:* Clean, modern sans-serif (e.g., Inter, SF Pro, or Roboto) in medium to bold weights. High legibility.
  - *Body Text:* Same modern sans-serif, lighter weight, colored in secondary text color for data (like calories/macros).
- **Button Styles:**
  - *General:* Heavily rounded corners (squircle or pill shape), flat design (no heavy drop shadows, relying on color contrast).
  - *Primary Buttons (Call to Action / Thumbs Up):* Solid Bright Coral/Orange background with a dark icon/text.
  - *Secondary Buttons (Thumbs Down / Inactive):* Solid Dark Muted Brown background with a lighter coral/pink icon/text.
  - *Indicators:* Rounded progress bars with dark track backgrounds and bright coral fill.

### Navigation Structure
- **Auth Flow:** Login, Register, Google Sign-in.
- **Main App Flow (5-Tab Bottom Menu):**
  - *Tab 1 (Far Left):* **Research** (Directly get AI advice through prompts)
  - *Tab 2 (Left):* **Tracking** (Health/Macros and Finance/Spending logs)
  - *Tab 3 (Center - Elevated/Larger):* **HOME** (The minimalistic hub)
  - *Tab 4 (Right):* **Map View** (Find restaurants directly on the map)
  - *Tab 5 (Far Right):* **Social** (Friend Groups, Voting, Leaderboards)
- **Top Header (Global across all tabs):**
  - *Profile / Settings:* Login/Signup prompt for guests, Profile Icon, and expandable Hamburger Menu for settings.
- **Stack Navigation (Pop-ups / Detailed Views):** Restaurant Details, Expanded Menus, AI Comparison Screens.

---

## 3. Supabase Implementation & Logic
*Features that require Supabase functionality.*

- [ ] **Authentication (Google, Credentials, & Guest Accounts):**
  - *Logic:* Set up Google OAuth and standard email/password. Also enable **Anonymous Sign-in** in Supabase so users can use the app immediately without logging in. They get a real (but silent) database UUID to track their usage limits.
- [ ] **Secure Store for Credentials (Edge Functions):**
  - *Logic:* To protect the Gemini API key, we will write a Supabase Edge Function. React Native sends the prompt to Supabase, Supabase attaches the secret key and asks Gemini, then sends the answer back to the app.
- [ ] **Storage Buckets:**
  - *Logic:* Store user profile pictures and custom group icons.

---

## 4. Supabase Schema: What to Build & How
*The exact database structure we need to create.*

### Tables Needed:
1. **`users`**
   - *Columns:* `id` (auth), `name`, `email`, `avatar_url`, `macro_goals`, `spending_goals`.
2. **`friend_groups`**
   - *Columns:* `id`, `group_name`, `created_by` (user_id).
3. **`group_members`**
   - *Columns:* `group_id`, `user_id`.
4. **`restaurant_favorites`**
   - *Columns:* `user_id`, `place_id` (Google Maps ID).
5. **`group_votes`**
   - *Columns:* `group_id`, `place_id`, `user_id`, `vote_type` (up/down/veto).
6. **`tracking_logs`**
   - *Columns:* `user_id`, `date`, `calories`, `protein`, `carbs`, `fats`, `money_spent`.
7. **`api_usage_logs`** (For tracking Guest/Free account limits)
   - *Columns:* `user_id` (Anonymous UUID), `request_count`, `last_reset_date`.

### Row Level Security (RLS) Policies:
*Security rules so users can't hack the database and see other people's info.*
- **Users:** Can only read/update their own profile data.
- **Groups:** Can only see groups (and votes) if they exist in `group_members` for that group.
- **Tracking:** Can only view and insert their own daily logs.

### How We Do It:
1. Open the Supabase Dashboard online.
2. Go to the **Table Editor** and manually create the tables above, or run a generated SQL script.
3. Turn on **Row Level Security (RLS)** for every table using the UI.
4. Set up the Google OAuth provider in the **Authentication** settings.
5. Back in React Native, we will use the `supabase.from('table_name').select()` and `.insert()` functions to interact with this data!

## favorites table: 

Supabase table name – we’ll create user_places. If you prefer a different name, let us know.
Column types – the plan uses place_id (text), favorited (boolean), visits (int), note (text).
3 Maximum recents – we’ll limit the recent list to the 10 most recent entries (by last_visited).

## Google restaurant returns:
id

types (Array of Strings)

nationalPhoneNumber

formattedAddress

location

latitude

longitude

rating

websiteUri

regularOpeningHours

openNow (Boolean)

periods (Array of Objects)

open

day

hour

minute

close

day

hour

minute

weekdayDescriptions (Array of Strings)

nextCloseTime (Or nextOpenTime)

businessStatus

priceLevel

userRatingCount

displayName

text

languageCode

currentOpeningHours

openNow (Boolean)

periods (Array of Objects)

open

day

hour

minute

date

year

month

day

close

day

hour

minute

date

year

month

day

weekdayDescriptions (Array of Strings)

nextCloseTime (Or nextOpenTime)

primaryType

photos (Array of Objects)

name

widthPx

heightPx

authorAttributions (Array of Objects)

displayName

uri

photoUri

flagContentUri

googleMapsUri

distanceMeters