export interface ThemeColors {
  name: string;
  gradient: [string, string, ...string[]];
  cardBackground: string;
  accent: string;
  /** Text/icon color on solid accent-filled buttons and chips. Defaults to '#FFFFFF'. */
  accentOnColor?: string;
  text: string;
  subtext: string;
  tint: string;
  buttonBackground: string;
  glassBackground: string;
  /** Muted backdrop for transparent restaurant logos/images */
  imageBackdrop: string;
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
   *  'solid'      → flat tinted fill (default).
   *  'gradient'   → multi-stop SVG gradient fill.
   *  'sketch'     → lighter fill, thin rings, dark labels (paper/hand-drawn look).
   *  'watercolor' → five-section multi-color watercolor bleed (sketch paper theme). */
  radarVariant?: 'solid' | 'gradient' | 'sketch' | 'watercolor';
  /** When true, renders hand-drawn food illustrations in the screen background. */
  paperIllustrations?: boolean;
  /** Full-screen background for tab screens (home, groups, map). Defaults to black for neon themes. */
  screenBackground?: string;
  /** Override background color for the home tab circular button. Defaults to accent. */
  tabHomeBackground?: string;
  /** Override background color for the tab bar. Defaults to cardBackground. */
  tabBarBackground?: string;
  /** How the value-match stat indicators are rendered.
   *  'bars' → gradient progress bar with track background (default).
   *  'dots' → solid-colour spark bar with no track, cleaner for light themes. */
  statBarVariant?: 'bars' | 'dots';
  /** How the two action buttons on the spotlight card are rendered.
   *  'primary-ghost'     → first button accent-filled, second ghost (default).
   *  'outline-outline'   → both buttons outlined, no fill. */
  buttonVariant?: 'primary-ghost' | 'outline-outline';
  /** Optional font family override for titles and key text elements. */
  fontFamily?: string;

  // ── 3D Depth / Lighting tokens ───────────────────────────────────────────
  /**
   * Optional depth token set. When present, enables full 3D surface rendering:
   * convex/concave gradients, 1px edge highlights, and layered drop shadows.
   * Assumes a consistent top-left light source across the entire app.
   */
  depth?: {
    /**
     * LinearGradient stops for a convex (elevated) surface.
     * Top-left corner appears lighter (near light source), bottom-right darker.
     * [highlight, mid, shadow] — 3 stops mapped to start:{x:0,y:0} → end:{x:1,y:1}
     */
    convexGradient: [string, string, string];
    /**
     * LinearGradient stops for a concave (pressed-in) surface.
     * Inverted — top-left darker, bottom-right lighter.
     */
    concaveGradient: [string, string, string];
    /**
     * 1px top + left border color: slightly lighter than the surface
     * (simulates light catching the upper-left edge).
     */
    edgeHighlight: string;
    /**
     * 1px bottom + right border color: darker than the surface
     * (simulates shadow on the lower-right edge).
     */
    edgeShadow: string;
    /** Drop shadow color for elevated surfaces (iOS shadow + Android elevation). */
    shadowColor: string;
    /**
     * Two-stop gradient painted as a visible "pool shadow" strip beneath elevated
     * cards. Works on both dark and light backgrounds.
     * [accentTintedEdge, transparent] — e.g. ['rgba(0,255,255,0.22)', 'transparent']
     */
    shadowGradient: [string, string];
    /** Two-stop gradient for the tab bar background [top, bottom]. */
    tabBarGradient: [string, string];
  };
}
