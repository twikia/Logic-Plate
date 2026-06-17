export const MUSIC_VOLUME_UI_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

const MUSIC_PLAYBACK_BY_UI: Record<number, number> = {
  0: 0,
  0.25: 0.075,
  0.5: 0.3,
  0.75: 0.375,
  1: 0.45,
};

export function musicUiLevelToPlayback(uiLevel: number): number {
  return MUSIC_PLAYBACK_BY_UI[uiLevel] ?? 0;
}
