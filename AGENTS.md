# Platebound - Restaurant Discovery App

## Cursor Cloud specific instructions

### Overview

Platebound is a React Native Expo (SDK 54) mobile app for restaurant discovery. It uses:
- **Frontend**: React Native 0.81 + Expo Router v6 (file-based routing) + TypeScript
- **Backend**: Supabase (hosted cloud) — PostgreSQL, Auth, Edge Functions (Deno)
- **APIs**: Google Places, Gemini AI, Foursquare, Mapillary, Unsplash

### Running the app

- **Dev server (web)**: `npx expo start --web --port 8081`
- The app loads `.env` automatically (contains `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_APP_SECRET`)
- In web mode, the Map tab shows a placeholder ("available on iOS/Android") — this is expected behavior
- Location-dependent features (restaurant search) require browser geolocation permissions; in headless/CI environments these won't have real coordinates

### Linting and type checking

- **Lint**: `npx expo lint` (ESLint via expo config)
- **TypeScript**: `npx tsc --noEmit` — Note: Supabase edge functions under `supabase/functions/` are Deno code and will produce TS errors when checked with the project's Node-based `tsc`. This is expected; only check app-level TS issues.

### Project structure

- `app/` — Expo Router file-based routes (tabs: home, research, tracking, map, social)
- `core/` — Business logic (restaurant orchestrator, Supabase client, caching)
- `components/` — Reusable UI components
- `context/` — React contexts (Auth, Theme)
- `supabase/functions/` — Deno edge functions (deployed to Supabase, not run locally)
- `supabase/migrations/` — SQL schema migrations

### Key caveats

- No test framework is configured (no jest/vitest) — there are no automated tests to run
- The `package-lock.json` lockfile is used → use `npm install` (not yarn/pnpm)
- Node.js 20 LTS is required (Expo SDK 54 compatibility)
- Edge functions are deployed to Supabase's hosted infrastructure; they don't run locally unless you set up Supabase CLI with `supabase functions serve`

### Android builds (local Windows)

This project uses **Expo SDK 54** with `expo-dev-client` installed. Builds are **standalone apps** (not Expo Go). Daily dev can use Expo Go for quick checks, but native features (maps, audio, etc.) are best tested with a development build.

#### Build types

| Goal | Method |
|------|--------|
| Daily dev (web) | `npx expo start --web --port 8081` |
| Daily dev (device) | Development build + `npx expo start --dev-client` |
| Sideload test APK | `eas build --profile preview --platform android` (cloud; outputs APK) |
| **Play Store AAB** | Local Gradle build (see below) or `eas build --profile production --platform android` (cloud) |

- **Expo Go** is a separate sandbox app — production/release builds are **not** Expo Go.
- **`bundleRelease`** produces a **production release AAB**, not an EAS "development" profile build.
- `expo-dev-client` is in dependencies; release builds may still bundle some dev-client libraries. For the leanest store binary, consider removing it from production-only builds later.

#### Version and package name

Set in `app.json`:

- `expo.version` — user-facing version name (e.g. `"2.1"`)
- `expo.android.versionCode` — integer; must increase for every Play Store upload (e.g. `4`)
- `expo.android.package` — application ID (currently `com.twikiastudios.logicplate`)

`eas.json` uses `"appVersionSource": "local"` so EAS reads versions from `app.json`.

After changing version or package, sync native Android:

```bash
npx expo prebuild --platform android --no-install
```

Prebuild may reset `android/app/build.gradle` signing config — re-apply release signing if needed (see Signing below).

#### Windows: do not use `eas build --local` for Android

`eas build --platform android --local` **only works on macOS/Linux**. On Windows it fails with:

```
Unsupported platform, macOS or Linux is required to build apps for Android
```

Use **Gradle `bundleRelease`** locally instead (documented below).

#### Windows: path-length limit (required workaround)

The repo path `C:\Users\fpola\Documents\Code-Local\Platebound-wrkspc2` is too long for the New Architecture native build (CMake/ninja hits the 260-character limit). **Junctions/subst drives do not help** — Windows resolves them to the full path.

**Workaround:** maintain a real copy at **`C:\platebound`** and build from there.

One-time setup (if `C:\platebound` does not exist):

```powershell
robocopy "C:\Users\fpola\Documents\Code-Local\Platebound-wrkspc2" "C:\platebound" /E /XD "android\app\build" "android\app\.cxx" "android\build" "android\.gradle" ".expo" ".git" /NFL /NDL /NJH /NJS
```

Long-term, moving the repo to a short path (e.g. `C:\platebound`) avoids the copy step.

#### Local production AAB build (Windows)

**Prerequisites:** Android SDK (`%LOCALAPPDATA%\Android\Sdk`), JDK 17, Git on PATH (`C:\Program Files\Git\cmd`), `.env` in project root.

```powershell
# 1. Environment
$env:PATH = "C:\Program Files\Git\cmd;" + $env:PATH
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"

# 2. If app.json changed (version, package, plugins): prebuild in the repo
cd C:\Users\fpola\Documents\Code-Local\Platebound-wrkspc2
npx expo prebuild --platform android --no-install

# 3. Sync repo → short-path copy (exclude build caches)
robocopy "C:\Users\fpola\Documents\Code-Local\Platebound-wrkspc2" "C:\platebound" /E /XD "android\app\build" "android\app\.cxx" "android\build" "android\.gradle" ".expo" ".git" /NFL /NDL /NJH /NJS

# 4. After package-name change: ensure Kotlin sources match (mirror android/app/src)
robocopy "C:\Users\fpola\Documents\Code-Local\Platebound-wrkspc2\android\app\src" "C:\platebound\android\app\src" /MIR /NFL /NDL /NJH /NJS

# 5. Build signed release AAB
cd C:\platebound\android
.\gradlew.bat bundleRelease --no-daemon
```

**Output:** `C:\platebound\android\app\build\outputs\bundle\release\app-release.aab`

Copy/rename for convenience, e.g. `platebound-2.1-v4.aab` in the repo root.

#### If the build fails

| Error | Fix |
|-------|-----|
| `spawn git ENOENT` (EAS credentials) | Add `C:\Program Files\Git\cmd` to PATH; restart terminal |
| `Filename longer than 260 characters` | Build from `C:\platebound`, not the long repo path; clear `android/app/.cxx` |
| `Unresolved reference 'BuildConfig'` / wrong package | Run `/MIR` robocopy on `android/app/src`; remove stale `com/twikiasorganization/...` dirs |
| `libworklets.so` duplicate | Already fixed: `android.packagingOptions.pickFirsts=**/libworklets.so` in `gradle.properties` |
| `OutOfMemoryError: Metaspace` | `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m` in `android/gradle.properties` |
| `Reanimated requires new architecture` | Keep `newArchEnabled=true` in `gradle.properties` (do not disable) |

Before a clean rebuild from `C:\platebound`, clear native caches if paths or package changed:

```powershell
Remove-Item -Recurse -Force C:\platebound\android\app\.cxx, C:\platebound\android\app\build -ErrorAction SilentlyContinue
Get-ChildItem C:\platebound\node_modules -Directory | ForEach-Object {
  foreach ($sub in @("build", ".cxx")) {
    $p = Join-Path $_.FullName "android\$sub"
    if (Test-Path $p) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }
  }
}
```

#### Signing (Play Store upload key)

Release builds use a local upload keystore (not committed; `android/` is gitignored):

- **File:** `android/app/platebound-upload.jks`
- **Alias:** `platebound`
- **Configured in:** `android/app/build.gradle` → `signingConfigs.release`

Back up the `.jks` file and passwords — the same upload key is required for all future Play Store updates.

For cloud EAS builds instead: `eas credentials --platform android` (requires Git on PATH).

#### Environment variables for release builds

Local Gradle builds load `.env` from the project root during Metro bundling. Required vars include:

- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_APP_SECRET`
- `EXPO_PUBLIC_VOTE_BASE_URL` (optional; has a default)
- `GOOGLE_MAPS_API_KEY_ANDROID` (via `app.config.js` for native maps)

For **EAS cloud** production builds, set the same variables in the Expo dashboard under **Environment variables → production** (`.env` is not uploaded automatically).

#### EAS cloud builds (optional)

If building on Expo servers (uses credits; slower queue but no Windows path issues):

```bash
eas build --platform android --profile production
```

- `production` profile outputs an **AAB** by default.
- `preview` profile outputs an **APK** for sideloading.
- `development` profile + `expo-dev-client` → dev APK for `npx expo start --dev-client`.

Install EAS CLI: `npm install -g eas-cli` then `eas login`.

#### Play Store checklist

1. Bump `expo.android.versionCode` (required) and `expo.version` (optional) in `app.json`
2. Run prebuild + local AAB build (or EAS production build)
3. Upload `.aab` to Google Play Console
4. Package name in Play Console must match `expo.android.package`
5. Enroll in **Play App Signing**; keep the upload keystore backed up
