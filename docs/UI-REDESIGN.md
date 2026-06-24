# Cafinity — UI/UX Redesign Report

A staged visual redesign of the existing app. **No functional, security, routing, or data
logic was changed** — only the presentation layer. All data remains live from Supabase.

---

## 1. Design concept & visual direction

**"Roasted warmth at morning light."** Deep roasted-coffee browns grounded on warm cream, with
a **caramel-amber** accent for energy. Editorial spacing, real beverage imagery, an editorial
serif for display type, restrained motion, and original SVG coffee graphics — no competitor
assets. Operational (staff/admin) screens share the identity but use a denser, calmer layout.

## 2. Color & typography system

**Semantic tokens** (`src/constants/theme.ts` + `tailwind.config.js`) — light theme active,
full **provisional dark palette** defined (not toggled this phase):

- `background #FAF5EC`, `surface #FFF`, `surfaceMuted #F3EADE`
- `textPrimary #241710`, `textSecondary #6F5D50`, `textMuted #9A8A7B`
- `brandPrimary #6A3E22` (CTAs), `brandSecondary #A86B43`, **`accent #E08A2B`** (energy)
- `success #2F855A`, `warning #D97E27`, `danger #C0392B`, `info #2B6CB0`, `line #ECE0D0`,
  `skeleton`, `overlay`
- Existing `brand-*`/`cream`/`espresso` classes were **retuned and kept as aliases** so screens
  migrated stage-by-stage without breakage.

**Typography:** **Fraunces** (display serif, weights 400/600/700/900) for the wordmark,
headings, prices and dashboard numbers; **System** for body. `font-display / font-heading /
font-black` classes. Strong numeric hierarchy via the `PriceText` component.

**Shape:** tiered radii (`sm` chips/inputs, `card` 16, `panel` 26, full for avatars/pills).
**Elevation:** selective (`shadow.card`, `shadow.floating`) — not on every row.

## 3. Motion principles

- Reanimated (already installed): opacity / translate / **scale** / spring only.
- `useReducedMotion()` hook disables ambient loops and the press-scale when the OS setting is on.
- `AnimatedPressable` gives a subtle, reduced-motion-aware press scale to cards/buttons.
- Meaningful moments only: order-success check (spring-in), active-order **pulse ring**, skeleton
  shimmer, reward progress bar, button press. No constant ambient distraction.
- **Haptics** (`expo-haptics`, via `lib/haptics`) on add-to-cart, checkout, redeem, feedback —
  never on scroll/navigation.

## 4. Reusable components created / refined

`CoffeeCup` (SVG), `Wordmark`, `ProductImage` (expo-image: blurhash→shimmer→fade, cache,
fallback, a11y), `ProductCard`, `ProductGridCard`, `PriceText`, `SectionHeader`, `Skeleton`,
`AnimatedPressable`, `QuantityStepper`, `StickyActionBar`, refined `Button`/`Field`/`Header`/
`EmptyState`/`ErrorState`, `useReducedMotion`, `lib/haptics`.

## 5. Screen-by-screen summary

- **Auth (login/register):** espresso hero + CoffeeCup + Fraunces wordmark; cream form sheet;
  password show/hide; button haptics.
- **Home:** greeting, points pill, branch selector, layered espresso hero with amber CTA, live
  active-order banner, image-rich featured rail (skeletons), category chips, rewards card.
- **Menu:** 2-column image grid, sticky search, scrollable category chips, sold-out state,
  skeleton grid, floating cart bar.
- **Branch select:** location-status band, nearest/open/hours/distance, cart-switch guard.
- **Product detail:** hero image, size + customization with selected-state contrast, notes,
  sticky stepper + live total + add (haptic).
- **Cart:** thumbnails, customization + item-notes summary, steppers, sticky subtotal/checkout.
- **Checkout:** pickup, summary, promo, payment cards, simulated-GCash card, price breakdown,
  states.
- **Order tracking / ticket:** animated success, restyled timeline with active-step pulse,
  contextual stage message, ready treatment, items (+notes), totals, feedback.
- **Rewards:** points hero, **progress to next reward**, reward/locked states, voucher
  used/active states, points activity.
- **Order history & profile:** Fraunces order cards; espresso identity card, stats, menu rows.
- **Staff:** restyled queue (urgency, unpaid-cash flag, realtime), order detail (confirm-cash,
  advance, cancel), account.
- **Admin:** dashboard with revenue hero + metric cards + top sellers + period-aware ratings;
  account; consistent titles across inventory/menu/users.

## 6. New dependencies & install commands

```bash
npx expo install expo-image expo-haptics react-native-svg @expo-google-fonts/fraunces
```
All Expo Go-compatible (SDK 54). No development-build-only native modules added.

## 7. Image assets

Products are 100% data-driven from `products.image_url` (themed placeholders now, DB-swappable).
Decorations are original in-app SVG. Folders + inventory in [`docs/ASSETS.md`](ASSETS.md).
**Remaining temporary assets:** the seed `placehold.co` product URLs (replace with owned
photography by updating the column — no code change).

## 8. Accessibility

Reduced-motion support; accessibility labels on images, icon buttons, stepper, star rating,
payment options; `accessibilityRole`/`State` on Button; non-color status cues (icons + text +
badges, not color alone); password toggle labels; keyboard-aware auth/forms; AA-minded contrast
on the cream/espresso palette.

## 9. Performance

`expo-image` disk+memory cache and blurhash (no layout jump); `FlatList` for all long lists with
stable keys; transform/opacity-only animations; ambient loops paused via reduced-motion and
`cancelAnimation` on unmount; limited simultaneous animations; skeletons instead of blocking
spinners on first load.

## 10. Validation (this environment)

- **TypeScript:** `npx tsc --noEmit` → **0 errors**.
- **ESLint:** `npx eslint .` → **0 errors, 0 warnings** (also aligned `eslint-config-expo` to
  the SDK-54 version `~10.0.0`, which resolved earlier React-Compiler rule noise).
- **Bundle:** `npx expo export -p ios` → builds successfully after every stage.
- **Expo Doctor:** **18/18 checks passed**.

## 11. Testing status (honest)

- **Not performed by me:** on-device/Expo Go visual + interaction testing and before/after
  screenshots — this environment has no device/simulator. These must be done by the team.
- **Routes to verify on device:** auth, home, branches, menu, product, cart, checkout, order
  tracking, rewards, orders, profile, staff queue/detail/account, admin dashboard/inventory/
  menu/users/product/account.

## 12. Known limitations / remaining polish

- **Admin inventory / menu-list / product-edit internals** were given the new tokens via shared
  components + titles, but their dense form internals are lighter-touch (functional, on-palette)
  and could use a deeper visual pass.
- **Tab bar** uses the new tints but no custom animated indicator yet.
- **Dark mode** not shipped (palette + token architecture are ready; see §13).
- Cup-fill loyalty metaphor and promo-carousel were scoped out in favor of the pulse timeline +
  single hero.
- Reward voucher application at checkout still uses the promotions preview path (functional
  follow-up from the hardening phase, unrelated to visuals).

## 13. Dark-mode preparation

Screens use **semantic tokens** rather than raw hexes for new surfaces; a complete `darkTheme`
exists in `constants/theme.ts`. Remaining to enable later: drive `tailwind.config` colors from
CSS variables with a `dark:` variant, add a theme provider + toggle, and verify the espresso
hero panels + SVG on dark backgrounds.

## 14. Functionality intact

Customer ordering, staff queue/status RPCs, admin reports/inventory/menu/roles, RLS hardening,
idempotent checkout, inventory rules, rewards, and realtime tracking are **unchanged** — only
their presentation was updated.
