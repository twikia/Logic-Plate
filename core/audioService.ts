import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { AppState, type AppStateStatus } from 'react-native';
import { fetchAmbientAudioAssets, fetchAudioCatalogVersion } from './remoteResources';
import {
  getCachedAudioUri,
  prefetchAudioTrack,
  readAudioCatalogCache,
  writeAudioCatalogCache,
} from './resourceCache';
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from './userSettings';
import { musicUiLevelToPlayback } from './musicVolume';

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
const uiSounds: Partial<Record<SoundKey, AudioPlayer>> = {};
let ambientSound: AudioPlayer | null = null;
let ambientPlaylist: PlaylistTrack[] = [];
let ambientIndex = 0;
let initialized = false;

export async function initAudio(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
    sfxVolume = await getSfxVolume();
    musicVolume = await getMusicVolume();
  } catch {
    // still try UI sounds even if audio mode setup fails
  }

  await _preloadUiSounds();
  await _loadRemoteAmbientPlaylist();
  if (__DEV__ && ambientPlaylist.length === 0) {
    console.warn(
      '[audio] No ambient tracks loaded. Upload MP3s to the app-audio bucket and enable rows in app_audio_assets.'
    );
  }
  await _startAmbient();

  AppState.addEventListener('change', _handleAppState);
}

async function _preloadUiSounds(): Promise<void> {
  for (const [key, asset] of Object.entries(uiAssets) as [SoundKey, number][]) {
    try {
      const player = createAudioPlayer(asset);
      player.volume = Math.min(sfxVolume, 0.5);
      uiSounds[key] = player;
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
        if (__DEV__) {
          console.warn(
            '[audio] app_audio_assets returned 0 enabled ambient tracks. ' +
              'Register rows with enabled=true; storage_path is the file path inside the bucket (not the bucket name).'
          );
        }
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
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (__DEV__) console.warn('[audio] Ambient catalog fetch failed:', detail || error);
      if (!tracks?.length) return;
    }

    ambientPlaylist = _shuffle(tracks!);
    ambientIndex = 0;
    void _prefetchUpcomingTracks();
  } catch (error) {
    if (__DEV__) console.warn('[audio] Failed to load ambient catalog:', error);
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

async function _playWhenReady(player: AudioPlayer): Promise<void> {
  if (player.isLoaded) {
    player.play();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscription.remove();
      reject(new Error('audio load timeout'));
    }, 30000);

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (!status.isLoaded) return;
      clearTimeout(timeout);
      subscription.remove();
      player.play();
      resolve();
    });
  });
}

async function _startAmbient(): Promise<void> {
  if (ambientPlaylist.length === 0 || musicVolume === 0) return;
  await _playNextAmbient();
}

let ambientPlaySession = 0;

async function _playNextAmbient(): Promise<void> {
  if (ambientPlaylist.length === 0 || musicVolume === 0) return;
  const mySession = ++ambientPlaySession;
  try {
    if (ambientSound) {
      try {
        ambientSound.remove();
      } catch {}
      ambientSound = null;
    }

    const track = ambientPlaylist[ambientIndex % ambientPlaylist.length]!;
    ambientIndex = (ambientIndex + 1) % ambientPlaylist.length;

    const trackUri = await _resolveTrackUri(track);
    if (mySession !== ambientPlaySession || musicVolume === 0) {
      return;
    }
    if (!trackUri) {
      if (__DEV__) console.warn('[audio] No URI for track:', track.slug, track.storagePath);
      return;
    }

    void _prefetchUpcomingTracks();

    const isRemote = /^https?:\/\//i.test(trackUri);
    const player = createAudioPlayer(
      { uri: trackUri },
      isRemote ? { downloadFirst: true } : undefined
    );
    player.volume = musicUiLevelToPlayback(musicVolume);

    if (mySession !== ambientPlaySession || musicVolume === 0) {
      try {
        player.remove();
      } catch {}
      return;
    }

    ambientSound = player;

    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        if (mySession === ambientPlaySession) {
          void _playNextAmbient();
        }
      }
    });

    await _playWhenReady(player);
  } catch (error) {
    if (__DEV__) console.warn('[audio] Ambient playback failed:', error);
  }
}

async function _handleAppState(state: AppStateStatus): Promise<void> {
  if (!ambientSound) return;
  try {
    if (state === 'active') {
      if (musicVolume > 0) ambientSound.play();
    } else {
      ambientSound.pause();
    }
  } catch {}
}

async function _playUi(key: SoundKey): Promise<void> {
  if (sfxVolume === 0) return;
  const player = uiSounds[key];
  if (!player) return;
  try {
    await player.seekTo(0);
    player.play();
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

  for (const player of Object.values(uiSounds)) {
    try {
      if (player) player.volume = Math.min(level, 0.5);
    } catch {}
  }
}

export async function setMusicVolumeLevel(level: number): Promise<void> {
  musicVolume = level;
  await setMusicVolume(level);

  if (ambientSound) {
    try {
      if (level === 0) {
        ambientSound.pause();
      } else {
        ambientSound.volume = musicUiLevelToPlayback(level);
        if (!ambientSound.playing) {
          ambientSound.play();
        }
      }
    } catch {}
  } else if (level > 0 && ambientPlaylist.length > 0) {
    void _playNextAmbient();
  }
}
