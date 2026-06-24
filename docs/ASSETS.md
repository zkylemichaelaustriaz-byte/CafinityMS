# Cafinity — Image & Asset Inventory

This documents the imagery strategy for the redesign. **No competitor logos, screenshots, or
copyrighted café assets are used.** Cafinity's visuals are its own.

## Strategy

| Type | Source | How it's used |
| --- | --- | --- |
| **Product images** | `products.image_url` (Supabase data) | All customer/admin product cards via the `ProductImage` component (expo-image: blurhash placeholder → fade-in, disk cache, emoji fallback). **Never hardcoded.** |
| **Brand decorations** | Original SVG (react-native-svg), drawn in-app | Steam, coffee beans, cup silhouettes, soft atmospheric shapes behind heroes/empty states. Brand-colored, code-generated — no external files. |
| **Wordmark** | Typography (`Fraunces` display) + amber accent dot | `components/brand/Wordmark.tsx` |
| **Fallback tile** | Brand-colored emoji tile | Shown when a product image URL is missing/fails |

## Local asset folders (for any future raster assets)

```
assets/images/branding/      # logo / wordmark raster exports (if needed)
assets/images/promos/        # promotional banner photography (replaceable)
assets/images/decorations/   # exported decorative art (SVG preferred, in-code)
```

These are currently **empty** because decorations are drawn as in-app SVG and product/promo
imagery comes from the database. Folders exist so designers can drop final art in later.

## Current product image data

The seed (`supabase/seed.sql`) uses **themed `placehold.co` placeholders** (brand-colored, with
the drink name). They are intentional, on-brand placeholders — **not** broken gray boxes — and
are trivially replaceable by updating `products.image_url` with real photography. To swap in
real photos later, just update the column; no app code changes are required.

## Inventory

| Asset | Screen | Source / ownership | Recommended size | Status |
| --- | --- | --- | --- | --- |
| Product photos | Menu, home, product detail, cart, admin | `products.image_url` (placeholders now) | 600×400+ | Temporary placeholders (DB-swappable) |
| Steam / bean / cup SVG | Home hero, empty states, splash | Original in-app SVG | vector | To be added (Stage 2+) |
| Wordmark | Splash, auth, headers | Fraunces type + accent dot | — | Final (typographic) |
| Emoji fallback tile | Anywhere an image fails | System emoji + brand tint | — | Final |

## Local product photos (preferred path)

Drop files into `assets/images/products/` (see that folder's README for exact filenames),
then uncomment the matching line in `src/lib/productImages.ts`. The app prefers a local photo,
then `products.image_url`, then a branded fallback — no per-screen code changes needed.

### License log (fill in as photos are added)

| Product | File | Source | License | Attribution needed? |
| --- | --- | --- | --- | --- |
| Caramel Macchiato | caramel-macchiato.jpg | | | |
| Spanish Latte | spanish-latte.jpg | | | |
| Brown Sugar Latte | brown-sugar-latte.jpg | | | |
| Americano | americano.jpg | | | |
| Cappuccino | cappuccino.jpg | | | |
| Flat White | flat-white.jpg | | | |
| Matcha Latte | matcha-latte.jpg | | | |
| Strawberry Milk | strawberry-milk.jpg | | | |
| Hot Chocolate | hot-chocolate.jpg | | | |
| Butter Croissant | butter-croissant.jpg | | | |
| Chocolate Muffin | chocolate-muffin.jpg | | | |
| Cheesecake Slice | cheesecake-slice.jpg | | | |

## To do (designer hand-off)
- Add the product photos above (royalty-free / owned only).
- Optional: provide a final raster logo for the app icon / splash image.
