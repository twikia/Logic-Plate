import { Audio } from 'expo-av';
import { AppState, type AppStateStatus } from 'react-native';
import { fetchAmbientAudioAssets, fetchAudioCatalogVersion } from './remoteResources';
import {
  getCachedAudioUri,
  prefetchAudioTrack,
  readAudioCatalogCache,
  writeAudioCatalogCache,
} from './resourceCache';
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from './userSettings';

type SoundKey = 'tap' | 'select' | 'success' | 'error';

type PlaylistTrack = {
  slug: string;
  storagePath: string;
  contentVersion: number;
};

// UI sounds are bundled via registerUiSound() in app/_layout.tsx.
// Ambient music files live in Supabase Storage; downloaded once to device cache.

const uiAssets: Partial<Record<SoundKey, number>> = {};

export function registerUiSound(key: SoundKey, asset: number): void {
  uiAssets[key] = asset;
}

let sfxVolume = 0.5;
let musicVolume = 0.5;
const uiSounds: Partial<Record<SoundKey, Audio.Sound>> = {};
let ambientSound: Audio.Sound | null = null;
let ambientPlaylist: PlaylistTrack[] = [];
let ambientIndex = 0;
let initialized = false;

export async function initAudio(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    sfxVolume = await getSfxVolume();
    musicVolume = await getMusicVolume();
  } catch {
    // still try UI sounds even if audio mode setup fails
  }

  await _preloadUiSounds();
  await _loadRemoteAmbientPlaylist();
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

async function _loadRemoteAmbientPlaylist(): Promise<void> {
  try {
    const cached = await readAudioCatalogCache();
    let tracks: PlaylistTrack[] | null = null;

    if (cached?.rows.length) {
      tracks = cached.rows.map((row) => ({
        slug: row.slug,
        storagePath: row.storage_path,
        contentVersion: row.content_version,
      }));
    }

    try {
      const remoteVersion = await fetchAudioCatalogVersion();
      if (cached && cached.version === remoteVersion && cached.rows.length > 0) {
        ambientPlaylist = _shuffle(tracks!);
        ambientIndex = 0;
        void _prefetchUpcomingTracks();
        return;
      }

      const assets = await fetchAmbientAudioAssets();
      if (assets.length === 0) {
        if (tracks?.length) {
          ambientPlaylist = _shuffle(tracks);
          ambientIndex = 0;
        }
        return;
      }

      await writeAudioCatalogCache(
        remoteVersion,
        assets.map((asset) => ({
          slug: asset.slug,
          title: asset.title,
          storage_path: asset.storage_path,
          sort_order: asset.sort_order,
          content_version: asset.content_version,
        }))
      );

      tracks = assets.map((asset) => ({
        slug: asset.slug,
        storagePath: asset.storage_path,
        contentVersion: asset.content_version,
      }));
    } catch {
      if (!tracks?.length) return;
    }

    ambientPlaylist = _shuffle(tracks!);
    ambientIndex = 0;
    void _prefetchUpcomingTracks();
  } catch {
    // remote catalog unavailable
  }
}

function _shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

async function _prefetchUpcomingTracks(): Promise<void> {
  if (ambientPlaylist.length === 0) return;
  const ahead = Math.min(2, ambientPlaylist.length);
  for (let i = 0; i < ahead; i++) {
    const track = ambientPlaylist[(ambientIndex + i) % ambientPlaylist.length]!;
    void prefetchAudioTrack(track.slug, track.storagePath, track.contentVersion);
  }
}

async function _resolveTrackUri(track: PlaylistTrack): Promise<string | null> {
  return getCachedAudioUri(track.slug, track.storagePath, track.contentVersion);
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

    const track = ambientPlaylist[ambientIndex % ambientPlaylist.length]!;
    ambientIndex = (ambientIndex + 1) % ambientPlaylist.length;

    const trackUri = await _resolveTrackUri(track);
    if (!trackUri) return;

    void _prefetchUpcomingTracks();

    const { sound } = await Audio.Sound.createAsync(
      { uri: trackUri },
      {
        volume: musicVolume,
        shouldPlay: true,
      }
    );
    ambientSound = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        void _playNextAmbient();
      }
    });
  } catch {
    // track unavailable
  }
}

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
