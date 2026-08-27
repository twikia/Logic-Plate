# Security audit — public repo readiness

Audit date: August 2026. Re-run `git log --all -- .env` and secret greps before making the repository public.

## Summary

| Item | Status |
|------|--------|
| `.env` in working tree | Not tracked (gitignored) |
| `.env` in git history | **Purged** (Aug 2026 — `git filter-repo` + force-push all branches) |
| Hardcoded secrets in current code | None found |
| Service role keys in client | None (edge functions + local scripts only) |
| `.gitignore` for env files | OK |

## What was exposed in git history

`.env` was committed from at least `9fc1411` through `b826394` and deleted in `1630e24` (Security and codebase overhaul/audit). The same values also appeared in `scratch/test_api.js` (removed in `1630e24`).

Historical commits contain:

- Supabase project URL and publishable/anon key
- `EXPO_PUBLIC_APP_SECRET` (shared secret for edge function auth)
- Google Maps API keys (Android + generic)

**Current tree:** no matches for those values (`grep` clean). History rewrite also removed `scratch/test_api.js`, `tools/platebound-2.1-v4.zip`, and `platebound-2.1-v4.apks`.

## Automated scans (Aug 2026)

| Tool | Result |
|------|--------|
| **TruffleHog** v3.97.1 (`trufflehog git file://.`) | 0 verified, 0 unverified secrets |
| **Gitleaks** v8.30.1 (`gitleaks detect -v`) | Clean (1 false positive on AsyncStorage key name — allowlisted in `.gitleaks.toml`) |

Re-run locally:

```powershell
gitleaks detect -v --config .gitleaks.toml
trufflehog git file://.
```

## Required actions before going public

### 1. Rotate all exposed credentials (still recommended)

Even after history rewrite, assume these were compromised:

1. **Supabase** — Dashboard → Project Settings → API: rotate anon/publishable key if exposed; rotate `APP_SECRET` edge secret to match a new `EXPO_PUBLIC_APP_SECRET` in EAS/local `.env`.
2. **Google Cloud** — APIs & Services → Credentials: rotate Maps keys; restrict by Android package (`com.twikiastudios.logicplate`), iOS bundle ID, and HTTP referrers as appropriate.
3. **EAS / Vercel** — Update production environment variables after rotation.

### 2. Purge `.env` and scratch secrets from git history

Use the repo script (creates a mirror backup, rewrites history, restores `origin`):

```powershell
cd C:\Users\fpola\Documents\Code-Local\Platebound

# Preview — shows commits that touched .env
.\scripts\purge-secrets-from-history.ps1

# After rotating keys and backing up — destructive rewrite
.\scripts\purge-secrets-from-history.ps1 -Force

# Force-push all branches you need public (coordinate with collaborators first)
git push origin --force --all
git push origin --force --tags
```

Requires `pip install git-filter-repo` (or `python -m git_filter_repo`). Run `git log --all -- .env` after rewrite — should be empty.

**Alternative (BFG):** [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) — `bfg --delete-files .env` then `git reflog expire` / `git gc`.

**Risk:** Every collaborator must re-clone or reset. Open PR branches on GitHub will need rebasing onto the rewritten history.

### 3. Verify after rewrite

```powershell
git log --all -- .env          # should be empty
git log -p --all -S "EXPO_PUBLIC_APP_SECRET="  # spot-check
```

## Current codebase practices (good)

- Client reads Supabase URL/key and app secret from `process.env` only (`core/supabaseClient.ts`, orchestrators).
- Edge functions use `Deno.env.get()` for all third-party keys — **no hardcoded maps or AI keys in deployed function source** (verified Aug 2026):
  - `GEMINI_API_KEY` — `v2-generate-ai-overview`, `generate-ai-menus`
  - `OVERTURE_MAPS_KEY` — `v2-fetch-restaurants`
  - `UNSPLASH_ACCESS_KEY` — `fetch-restaurant-photos`
  - `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET` — shared security helpers
- `assertAppSecret` / RLS policies gate sensitive edge endpoints.
- `.gitignore` blocks `.env`, `.env.*`, keystores, and build artifacts.

## `.env.example` contract

Copy to `.env` locally; never commit `.env`. Server-only keys (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, …) belong in Supabase Edge Function secrets or your shell env for maintenance scripts — not in the mobile app bundle.
