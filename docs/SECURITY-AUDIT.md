# Security audit — public repo readiness

Audit date: August 2026. Re-run `git log --all -- .env` and `git ls-remote origin` (confirm no `refs/pull/*`) before treating the public history as clean.

## Summary

| Item | Status |
|------|--------|
| `.env` in working tree | Not tracked (gitignored) |
| `.env` on public `main` | Not present |
| `.env` in old GitHub PR refs | **Removed from the public repo** (29 Aug 2026 — new `twikia/Logic-Plate` with `main` only) |
| Hardcoded secrets in current code | None found |
| Service role keys in client | None (edge functions + local scripts only) |
| `.gitignore` for env files | OK |

A branch-only `git filter-repo` + force-push does **not** clear GitGuardian. GitHub keeps `refs/pull/*/head` forever, and those refs still had `.env` in 73 pull requests after the first rewrite. The public repository was replaced with a new repo that has only `main` (no pull-request objects).

The previous repository (with the leaked PR history) is the private `twikia/Logic-Plate-archived`. Delete it in GitHub settings when you can (`delete_repo` permission). Re-point GitGuardian at `https://github.com/twikia/Logic-Plate`.

## What was exposed in git history

`.env` was committed from at least `9fc1411` through `b826394` and deleted in `1630e24` (Security and codebase overhaul/audit). The same values also appeared in `scratch/test_api.js`, `platebound-2.1-v4.apks`, and `tools/platebound-2.1-v4.zip`.

Those files contained:

- Supabase project URL and publishable/anon key
- `EXPO_PUBLIC_APP_SECRET` (shared secret for edge function auth)
- Google Maps API keys (Android + generic)

**Current public tree and `main` history:** no `.env` file; current key values do not appear in reachable commits.

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

### 2. If `.env` appears again in git

Rewriting local branches is not enough if GitHub still has pull requests from the leaked era.

1. Fetch PR heads: `git fetch origin "+refs/pull/*/head:refs/remotes/origin/pr/*"`
2. Confirm with `git log --all -- .env`
3. `git filter-repo` cannot update `refs/pull/*` (GitHub rejects those pushes)
4. Replace the GitHub repository: push clean `main` to a new repo, then delete or archive the old one

The helper script is `.\scripts\purge-secrets-from-history.ps1`. It now fetches PR refs before scanning.

### 3. Verify the public repo

```powershell
git log --all -- .env
git ls-remote origin
# should list only refs/heads/main (no refs/pull/*)
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
