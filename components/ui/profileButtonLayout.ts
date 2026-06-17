export const PROFILE_BUTTON_RIGHT = 20;
export const PROFILE_BUTTON_TOP_EXTRA = 4;

export function profileButtonTop(insetTop: number): number {
  return Math.max(insetTop, 20) + PROFILE_BUTTON_TOP_EXTRA;
}
