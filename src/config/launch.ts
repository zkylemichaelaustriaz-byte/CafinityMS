// Central launch / theme-transition tuning. Keep all timing + feature flags here
// so nothing is scattered across the root layout and theme code.

/** Minimum time the branded launch screen stays up on a fresh process.
 *  Kept short so startup feels snappy — the screen still waits for critical
 *  init (theme/session/fonts) on top of this floor. */
export const APP_LAUNCH_MINIMUM_DURATION_MS = 900;

/** Hard cap before the launch screen offers a Retry (critical init stalled). */
export const APP_LAUNCH_TIMEOUT_MS = 12000;

/** How long the light/dark transition overlay stays up while the theme applies. */
export const THEME_TRANSITION_MINIMUM_DURATION_MS = 750;

/** Restrained seasonal accent tint on the launch + transition screens. Off by
 *  default (the launch already adopts the active campaign accent). */
export const ENABLE_SEASONAL_LAUNCH_THEME = false;
