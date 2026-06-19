# Home Screen Recommendation Scoring

How Platebound ranks restaurants on the home carousel. Implementation lives in `core/recommendationEngine.ts`; user defaults in `core/recommendationTypes.ts`.

---

## The big picture

Every open restaurant within your search radius gets a **Platebound Score** from 0 to 100. Higher scores appear first. The carousel shows the top five.

```
Platebound Score = weighted preferences
                 + synergy bonus (multi-fit picks)
                 + context modifiers (meal time, group, mood, weather)
                 (clamped to 0–100)
```

Before scoring, hard filters remove closed places, non-operational listings, and anything outside your radius.

---

## Your priority sliders

Each metric uses levels **1–5**:

| Level | Meaning | Effect |
|-------|---------|--------|
| 1 | Default | Almost no pull on ranking |
| 2 | A little | Light influence |
| 3 | Moderate | Noticeable influence |
| 4 | Nice to have | Matters when the restaurant fits |
| 5 | Top priority | Strong influence |

**Defaults:** every slider starts at **1** except **Calories**, which starts at **3** (neutral).

If you leave everything at default, the engine uses a built-in neutral mix (distance and star rating weighted a bit more) so recommendations feel similar to before preferences existed.

**Calories is special:** level 3 adds nothing to the score. Levels 1–2 gently favor lighter options; levels 4–5 gently favor denser options. Level 5 is much stronger than level 4.

When you raise one slider to 5, that dimension takes a large share of your preference budget. When several sliders are at 4–5, restaurants that score well on **multiple** of those dimensions get an extra **synergy bonus** (up to +16 points).

---

## Raw scores (before your weights)

Each restaurant is measured on several 0–100 scales:

### Distance
100 at your location, 0 at the edge of the search radius. Linear falloff.

### Speed
Uses AI `speedScore` when available. Otherwise heuristics: fast food scores high, fine dining low, +12 for takeout.

### Cost
Based on how expensive the place is (Google price level), **not** a user budget.

1. **Cheapness** — inexpensive ≈ 93, moderate ≈ 58, expensive ≈ 26, very expensive ≈ 7.
2. **Rating gate** — the more expensive a place is, the more its **star rating** must carry it. Cheap spots can rank well with average ratings; expensive spots need strong ratings to stay competitive. This gate always applies.
3. **Cost preference** — if your Cost slider is above default (1), the score shifts toward pure cheapness. At level 5 you mostly see cheaper restaurants; at level 1 you only get the rating gate with no extra cheap bias.

There is no “favor expensive” option — only neutral or favor cheap.

### Health
Type-based baseline (salad shops high, fast food lower), plus bonuses for vegetarian options and light cuisines.

### Protein
AI `proteinScore` when available; otherwise heuristics by cuisine (steak/seafood high, fast food lower).

### Calories
AI `calorieScore` when available; otherwise light cuisines score lower, heavy cuisines higher. Mid (50) is neutral density.

### Taste
AI `tasteScore` when available; otherwise neutral 50.

### Star rating
Google rating ÷ 5 × 100.

### Cuisine fit
Matches your ranked favorite cuisines. No match ≈ 35. First favorite ≈ 95, second ≈ 89, then −6 per rank.

---

## How preferences combine

Your slider levels map to internal **strength** values (1 → 0, 5 → 1.0), normalized across metrics. Those weights multiply the raw scores:

- **Distance bucket** — distance + speed
- **Health bucket** — health + protein + calorie adjustment
- **Price bucket** — cost score (cheapness + rating gate + your cost preference)
- **Rating bucket** — taste + star rating
- **Cuisine bucket** — cuisine fit

The five buckets sum to the **base score**.

### Synergy bonus

If you marked **two or more** metrics at level 4 or 5, and a restaurant scores ≥ 62 on those metrics, it earns a bonus that grows with how many align and how far above the threshold they score. This rewards places that fit several of your top priorities at once.

---

## Context modifiers (not from sliders)

These react to the current session and environment:

### Meal time
Inferred from the clock (breakfast, lunch, snack, dinner, late night). Breakfast spots boost at breakfast; bars boost at night; fine dining boosts at dinner, etc.

### Group size
Small/big groups favor `goodForGroups` and sharing cuisines. Solo favors cafés, ramen, sushi.

### Session mood (optional chip)
Comfort, light, adventurous, quick, or special — each nudges types up or down (e.g. comfort → burgers/pizza +20; adventurous → non-favorites +20).

### Time / freshness
Recently opened (+5 within two hours). Weekend dinner + live music (+10).

### Weather (automatic)
If Open-Meteo reports rain at your location and the place offers dine-in, comfort cuisines (burgers, pizza, BBQ, Italian, etc.) get **+8**. There is no weather slider — this is automatic.

---

## Match pills

The “why this fits” chips on each card (Close by, Healthy pick, Great value, etc.) come from whichever weighted buckets and modifiers scored highest for that restaurant.

---

## Practical guide

| You want… | Do this |
|-----------|---------|
| Recommendations close to today’s behavior | Leave all sliders at 1; calories at 3 |
| Cheaper options | Raise **Cost** to 4–5 |
| Expensive places only when they’re worth it | Already built in via the rating gate; raise **Top rating** to sort among survivors |
| Strong pull on one thing | Set that slider to 5 |
| Smart multi-fit picks | Set several sliders to 4–5; synergy rewards overlap |

---

## Key files

| File | Role |
|------|------|
| `core/recommendationEngine.ts` | Scoring, modifiers, synergy |
| `core/recommendationTypes.ts` | Defaults and types |
| `core/recommendationPrefs.ts` | Persisted user preferences |
| `core/recommendationCuisines.ts` | Favorite cuisine matching |
| `core/openMeteoWeather.ts` | Rain detection for weather nudge |
| `app/(tabs)/(home)/index.tsx` | Home carousel loads pool and calls scorer |
