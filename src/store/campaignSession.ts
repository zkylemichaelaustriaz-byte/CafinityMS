// One-shot guard for the seasonal ad. The ad shows once per LOGIN session; it is
// re-armed on every sign-in and sign-out so a customer always sees the current
// season's ad after logging in (independent of campaign frequency rules).
let shown = false;

export const campaignSession = {
  shouldShow: () => !shown,
  markShown: () => {
    shown = true;
  },
  reset: () => {
    shown = false;
  },
};
