# Audio Assets

## UI Sounds (`ui/`)

Place short MP3 sound effects here. Expected filenames:

| File | When it plays |
|------|---------------|
| `tap.mp3` | Light button / card press |
| `select.mp3` | Toggle on / option selected |
| `success.mp3` | Positive completion (winner, join success, pick confirmed) |
| `error.mp3` | Failure state (join error, load error) |

**Recommended source:** [Mixkit](https://mixkit.co/free-sound-effects/app/) — free, no attribution required.

## Ambient Music (`ambient/`)

Place longer MP3 tracks here. Name them `track_01.mp3`, `track_02.mp3`, etc. (any name works as long as you register them in `_layout.tsx`).

Tracks are shuffled randomly on each session start. The playlist loops automatically.

**Recommended source:** [Pixabay Music](https://pixabay.com/music/) — 100% royalty-free, no attribution required.

## Activating Audio

Once you have your files, open `app/_layout.tsx` and uncomment the registration lines at the top of `RootLayout`. Example:

```ts
import { registerAmbientTrack, registerUiSound } from '@/core/audioService';

// Inside the useEffect in RootLayout:
registerUiSound('tap',     require('@/assets/audio/ui/tap.mp3'));
registerUiSound('select',  require('@/assets/audio/ui/select.mp3'));
registerUiSound('success', require('@/assets/audio/ui/success.mp3'));
registerUiSound('error',   require('@/assets/audio/ui/error.mp3'));
registerAmbientTrack(require('@/assets/audio/ambient/track_01.mp3'));
registerAmbientTrack(require('@/assets/audio/ambient/track_02.mp3'));
registerAmbientTrack(require('@/assets/audio/ambient/track_03.mp3'));
```
