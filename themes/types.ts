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
  /** When true (default), neon card borders rotate. When false, a fixed diagonal cyan→magenta border is used. */
  neonBorderSpin?: boolean;

  // ── Swappable element variants ──────────────────────────────────────────
  /** How the match-score orb is rendered.
   *  'segmented' → score-responsive arc gauge (default for all themes).
   *  'gradient'  → solid filled gradient circle (e.g. sketch/paper theme). */
  matchOrbVariant?: 'segmented' | 'gradient';
  /** Text color on the match orb. Defaults to '#FFFFFF'. */
  matchOrbTextColor?: string;
  /** How the radar pentagon is rendered.
   *  'solid'    → flat tinted fill (default).
   *  'gradient' → multi-stop SVG gradient fill.
   *  'sketch'   → lighter fill, thin rings, dark labels (paper/hand-drawn look). */
  radarVariant?: 'solid' | 'gradient' | 'sketch';
  /** How the value-match stat indicators are rendered.
   *  'bars' → gradient progress bar with track background (default).
   *  'dots' → solid-colour spark bar with no track, cleaner for light themes. */
  statBarVariant?: 'bars' | 'dots';
  /** How the two action buttons on the spotlight card are rendered.
   *  'primary-ghost'     → first button accent-filled, second ghost (default).
   *  'outline-outline'   → both buttons outlined, no fill. */
  buttonVariant?: 'primary-ghost' | 'outline-outline';
}
