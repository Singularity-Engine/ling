/**
 * Single source of truth for all affinity-level visual properties.
 *
 * Components should import from here instead of defining their own
 * color maps. This ensures visual consistency across:
 *   - AffinityBadge / AffinityBar (UI elements)
 *   - BackgroundReactor (ambient tints)
 *   - ThoughtHalo (particle effects)
 *   - InfoCrystal (tool result cards)
 */

// ── Per-level UI color (used in Badge, Bar, Crystal borders, text) ──
export interface AffinityLevelStyle {
  /** Primary display color — text labels, progress bars, borders */
  color: string;
  /** Heart fill color (Badge only, may differ at low levels) */
  heartColor: string;
  /** Heartbeat speed (Badge animation) */
  beatSpeed: string;
  /** Emoji icon (Bar) */
  icon: string;
  /** i18n key */
  i18nKey: string;
}

export const AFFINITY_LEVELS: Record<string, AffinityLevelStyle> = {
  hatred:      { color: "#f87171", heartColor: "#4a1515", beatSpeed: "3s",   icon: "💔", i18nKey: "affinity.hatred" },
  hostile:     { color: "#f97316", heartColor: "#6b3a1a", beatSpeed: "2.5s", icon: "❄️", i18nKey: "affinity.hostile" },
  indifferent: { color: "#a3a3a3", heartColor: "#525252", beatSpeed: "2.2s", icon: "😐", i18nKey: "affinity.indifferent" },
  neutral:     { color: "#60a5fa", heartColor: "#60a5fa", beatSpeed: "2s",   icon: "💙", i18nKey: "affinity.neutral" },
  friendly:    { color: "#a78bfa", heartColor: "#a78bfa", beatSpeed: "1.6s", icon: "💜", i18nKey: "affinity.friendly" },
  close:       { color: "#c084fc", heartColor: "#c084fc", beatSpeed: "1.2s", icon: "💗", i18nKey: "affinity.close" },
  devoted:     { color: "#f472b6", heartColor: "#f472b6", beatSpeed: "0.8s", icon: "💕", i18nKey: "affinity.devoted" },
};

// ── Ambient tint (BackgroundReactor) ──
// These are intentionally deeper/more saturated than UI colors
// because they're used as full-screen radial gradient tints.
export interface AffinityAmbientTint {
  color: string;
  idleOpacity: number;
  activeBoost: number;
  breatheSpeed: number;
  breatheAmplitude: number;
  gradientSpread: string;
}

export const AFFINITY_AMBIENT_TINTS: Record<string, AffinityAmbientTint> = {
  hatred:      { color: "#dc2626", idleOpacity: 0.18, activeBoost: 0.75, breatheSpeed: 3,   breatheAmplitude: 2.2, gradientSpread: "55% 50%" },
  hostile:     { color: "#ea580c", idleOpacity: 0.12, activeBoost: 0.85, breatheSpeed: 4,   breatheAmplitude: 1.8, gradientSpread: "60% 55%" },
  indifferent: { color: "#78716c", idleOpacity: 0.03, activeBoost: 1.0,  breatheSpeed: 8,   breatheAmplitude: 1.2, gradientSpread: "65% 55%" },
  neutral:     { color: "#818cf8", idleOpacity: 0.06, activeBoost: 1.0,  breatheSpeed: 6,   breatheAmplitude: 1.4, gradientSpread: "70% 60%" },
  friendly:    { color: "#a78bfa", idleOpacity: 0.12, activeBoost: 1.08, breatheSpeed: 5,   breatheAmplitude: 1.6, gradientSpread: "75% 65%" },
  close:       { color: "#d946ef", idleOpacity: 0.18, activeBoost: 1.15, breatheSpeed: 4.5, breatheAmplitude: 1.9, gradientSpread: "80% 70%" },
  devoted:     { color: "#fb7185", idleOpacity: 0.24, activeBoost: 1.22, breatheSpeed: 4,   breatheAmplitude: 2.0, gradientSpread: "85% 75%" },
};

// ── Halo colors (ThoughtHalo) ──
// Used for AI-thinking particle ring. Intentionally lighter/softer
// than ambient tints, matching the ethereal particle aesthetic.
export const AFFINITY_HALO_COLORS: Record<string, string> = {
  hatred:      "#dc2626",
  hostile:     "#ea580c",
  indifferent: "#78716c",
  neutral:     "#c4b5fd",
  friendly:    "#a78bfa",
  close:       "#d946ef",
  devoted:     "#fb7185",
};

// ── Crystal glow (InfoCrystal) ──
// RGB channels derived from the UI `color` for use in CSS custom
// properties (box-shadow needs separate R, G, B channels).
export interface AffinityCrystalTheme {
  glow: string;            // "R, G, B" string
  borderAlpha: number;
  breatheIntensity: number;
  scale: number;
  floatRange: number;
  shimmer: boolean;
  bgAlpha: number;
  blur: number;
}

export const AFFINITY_CRYSTAL_THEMES: Record<string, AffinityCrystalTheme> = {
  hatred:      { glow: "248, 113, 113", borderAlpha: 0.25, breatheIntensity: 0.6, scale: 0.92, floatRange: 1,  shimmer: false, bgAlpha: 0.75, blur: 12 },
  hostile:     { glow: "249, 115, 22",  borderAlpha: 0.3,  breatheIntensity: 0.7, scale: 0.95, floatRange: 2,  shimmer: false, bgAlpha: 0.70, blur: 14 },
  indifferent: { glow: "163, 163, 163", borderAlpha: 0.35, breatheIntensity: 0.8, scale: 0.97, floatRange: 4,  shimmer: false, bgAlpha: 0.65, blur: 16 },
  neutral:     { glow: "96, 165, 250",  borderAlpha: 0.4,  breatheIntensity: 1.0, scale: 1.0,  floatRange: 5,  shimmer: false, bgAlpha: 0.60, blur: 16 },
  friendly:    { glow: "167, 139, 250", borderAlpha: 0.5,  breatheIntensity: 1.2, scale: 1.02, floatRange: 6,  shimmer: true,  bgAlpha: 0.55, blur: 18 },
  close:       { glow: "192, 132, 252", borderAlpha: 0.6,  breatheIntensity: 1.4, scale: 1.04, floatRange: 7,  shimmer: true,  bgAlpha: 0.50, blur: 20 },
  devoted:     { glow: "244, 114, 182", borderAlpha: 0.75, breatheIntensity: 1.7, scale: 1.06, floatRange: 8,  shimmer: true,  bgAlpha: 0.45, blur: 24 },
};

// ── Defaults ──
export const DEFAULT_LEVEL = "neutral";
