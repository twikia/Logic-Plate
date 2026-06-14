import { Audio } from 'expo-av';
import { AppState, type AppStateStatus } from 'react-native';
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from './userSettings';

type SoundKey = 'tap' | 'select' | 'success' | 'error';

// ─── Asset registry ───────────────────────────────────────────────────────────
// To add UI sounds, uncomment the relevant require below and place the
// corresponding file inside assets/audio/ui/.
//
// To add ambient music, call registerAmbientTrack() with each require below
// and place MP3 files in assets/audio/ambient/.
//
// Example (in app/_layout.tsx):
//   import { registerAmbientTrack, registerUiSound } from '@/core/audioService';
//   registerUiSound('tap',     require('@/assets/audio/ui/tap.mp3'));
//   registerUiSound('select',  require('@/assets/audio/ui/select.mp3'));
//   registerUiSound('success', require('@/assets/audio/ui/success.mp3'));
//   registerUiSound('error',   require('@/assets/audio/ui/error.mp3'));
//   registerAmbientTrack(require('@/assets/audio/ambient/track_01.mp3'));
//   registerAmbientTrack(require('@/assets/audio/ambient/track_02.mp3'));

const uiAssets: Partial<Record<SoundKey, number>> = {};
const ambientAssets: number[] = [];

export function registerUiSound(key: SoundKey, asset: number): void {
  uiAssets[key] = asset;
}

export function registerAmbientTrack(asset: number): void {
  ambientAssets.push(asset);
}

// ─── Internal state ──────────────────────────────────────────────────────────

let sfxVolume = 0.5;
let musicVolume = 0.5;
const uiSounds: Partial<Record<SoundKey, Audio.Sound>> = {};
let ambientSound: Audio.Sound | null = null;
let ambientPlaylist: number[] = [];
let ambientIndex = 0;
let initialized = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initAudio(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
    });
    sfxVolume = await getSfxVolume();
    musicVolume = await getMusicVolume();
  } catch {
    return;
  }

  await _preloadUiSounds();
  _buildShuffledPlaylist();
  _startAmbient();

  AppState.addEventListener('change', _handleAppState);
}

async function _preloadUiSounds(): Promise<void> {
  for (const [key, asset] of Object.entries(uiAssets) as [SoundKey, number][]) {
    try {
      const { sound } = await Audio.Sound.createAsync(asset, {
        volume: Math.min(sfxVolume, 0.5),
        shouldPlay: false,
      });
      uiSounds[key] = sound;
    } catch {
      // file not yet provided; skip silently
    }
  }
}

// ─── Ambient playback ─────────────────────────────────────────────────────────

function _buildShuffledPlaylist(): void {
  if (ambientAssets.length === 0) return;
  const arr = [...ambientAssets];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  // Ensure first track this session differs from last of previous session
  ambientPlaylist = arr;
  ambientIndex = 0;
}

async function _startAmbient(): Promise<void> {
  if (ambientPlaylist.length === 0 || musicVolume === 0) return;
  await _playNextAmbient();
}

async function _playNextAmbient(): Promise<void> {
  if (ambientPlaylist.length === 0 || musicVolume === 0) return;
  try {
    if (ambientSound) {
      await ambientSound.unloadAsync();
      ambientSound = null;
    }
    const asset = ambientPlaylist[ambientIndex % ambientPlaylist.length]!;
    ambientIndex = (ambientIndex + 1) % ambientPlaylist.length;

    const { sound } = await Audio.Sound.createAsync(asset, {
      volume: musicVolume,
      shouldPlay: true,
    });
    ambientSound = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        void _playNextAmbient();
      }
    });
  } catch {
    // file not yet provided; skip silently
  }
}

// ─── AppState handler ─────────────────────────────────────────────────────────

async function _handleAppState(state: AppStateStatus): Promise<void> {
  if (!ambientSound) return;
  try {
    if (state === 'active') {
      if (musicVolume > 0) await ambientSound.playAsync();
    } else {
      await ambientSound.pauseAsync();
    }
  } catch {}
}

// ─── UI sounds ───────────────────────────────────────────────────────────────

async function _playUi(key: SoundKey): Promise<void> {
  if (sfxVolume === 0) return;
  const sound = uiSounds[key];
  if (!sound) return;
  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {}
}

export function playTap(): void {
  void _playUi('tap');
}

export function playSelect(): void {
  void _playUi('select');
}

export function playSuccess(): void {
  void _playUi('success');
}

export function playError(): void {
  void _playUi('error');
}

// ─── Volume control ──────────────────────────────────────────────────────────

export async function setSfxVolumeLevel(level: number): Promise<void> {
  sfxVolume = level;
  await setSfxVolume(level);

  for (const sound of Object.values(uiSounds)) {
    try {
      await sound?.setVolumeAsync(Math.min(level, 0.5));
    } catch {}
  }
}

export async function setMusicVolumeLevel(level: number): Promise<void> {
  musicVolume = level;
  await setMusicVolume(level);

  if (ambientSound) {
    try {
      if (level === 0) {
        await ambientSound.pauseAsync();
      } else {
        await ambientSound.setVolumeAsync(level);
        const status = await ambientSound.getStatusAsync();
        if (status.isLoaded && !status.isPlaying) {
          await ambientSound.playAsync();
        }
      }
    } catch {}
  } else if (level > 0 && ambientPlaylist.length > 0) {
    void _playNextAmbient();
  }
}
