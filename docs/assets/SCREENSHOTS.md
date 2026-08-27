# README screenshots

Add phone-sized captures here so the top of [README.md](../../README.md) can show the real UI.

## Suggested files

| File | Screen | How to capture |
|------|--------|----------------|
| `home.png` | Home tab — scenario filters, spotlight carousel, AI overview cards | Run the app, allow location, wait for nearby restaurants to load |
| `map.png` | Map tab — markers, radius slider, restaurant sheet | Open Map tab on a device or simulator with Google Maps configured |
| `groups.png` | Groups tab — create/join session, lobby, or voting | Start a group session (pass-the-phone or QR) |
| `random.png` | Random picker result (optional) | Home → random restaurant flow |
| `profile.png` | Profile / settings (optional) | Tap profile from any tab |

## Capture options

**iOS Simulator / Android Emulator**

1. `npx expo start --dev-client` (or Expo Go for quick UI checks).
2. Navigate to each screen.
3. Save screenshots as the filenames above.

**Physical device**

- iOS: Side button + volume up.
- Android: Power + volume down.

**Web (limited)**

- `npx expo start --web --port 8081` works for layout checks, but the Map tab shows a placeholder on web. Prefer native captures for map and groups.

## GIFs (optional)

Short screen recordings (5–10 s) work well for carousel swipe, map pan, or group voting:

- `home-carousel.gif`
- `group-vote.gif`

Export at ~720px width to keep the repo lean.
