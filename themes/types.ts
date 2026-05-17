export interface ThemeColors {
  name: string;
  gradient: [string, string, ...string[]];
  cardBackground: string;
  accent: string;
  text: string;
  subtext: string;
  tint: string;
  buttonBackground: string;
  glassBackground: string;
  /** Controls button/chip shape rendering strategy.
   *  'pill' | 'rectangle' → standard borderRadius views.
   *  'trapezoid' | 'hexagon' → absolute-positioned SVG behind content. */
  buttonShape: 'pill' | 'rectangle' | 'trapezoid' | 'hexagon';
  /** Border color for cards and chips */
  cardBorderColor: string;
  /** Shadow color for standard (non-neon) cards */
  cardShadowColor: string;
  /** [from, to] gradient colors for the match-score orb */
  matchOrbColors: [string, string];
  /** Color for the pentagon radar grid rings and axis lines */
  radarGridColor: string;
  /** Color used for the "Top N picks" page title */
  pageTitleColor: string;
  /** When present, the card border renders as an animated rotating neon gradient
   *  using these four color stops: [stop0, stop1, stop2, stop3]. */
  neonColors?: [string, string, string, string];
}
