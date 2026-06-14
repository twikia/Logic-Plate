import * as Haptics from 'expo-haptics';
import { playError, playSelect, playSuccess, playTap } from './audioService';
import { getHapticsEnabled } from './userSettings';

let _enabled: boolean = true;

getHapticsEnabled().then((v) => {
  _enabled = v;
});

export function refreshHapticsCache(): void {
  getHapticsEnabled().then((v) => {
    _enabled = v;
  });
}

export function hapticLight(): void {
  playTap();
  if (!_enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticMedium(): void {
  if (!_enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function hapticSuccess(): void {
  playSuccess();
  if (!_enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticError(): void {
  playError();
  if (!_enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

export function hapticSelection(): void {
  playSelect();
  if (!_enabled) return;
  Haptics.selectionAsync().catch(() => {});
}
