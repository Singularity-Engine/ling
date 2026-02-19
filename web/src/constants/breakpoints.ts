/** Responsive breakpoints (px) shared across the app. */
export const MOBILE_BREAKPOINT = 768;

/** Helper: returns true when the viewport is narrower than the mobile breakpoint. */
export const isMobileViewport = () =>
  typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
