import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { MenuProduct, Variant } from "@/types/models";

/** A labelled chip used for ingredients, allergens, and dietary tags. */
function Chip({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: "neutral" | "warn" | "good";
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const cls =
    tone === "warn"
      ? "border-warning bg-warningSoft"
      : tone === "good"
        ? "border-success bg-successSoft"
        : "border-line bg-surfaceMuted";
  const color = tone === "warn" ? Colors.warning : tone === "good" ? Colors.success : Colors.textMuted;
  const text =
    tone === "warn" ? "text-warning" : tone === "good" ? "text-success" : "text-textSecondary";
  return (
    <View className={`flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${cls}`}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text className={`text-xs font-medium ${text}`}>{label}</Text>
    </View>
  );
}

function NutritionRow({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View className={`flex-row items-center justify-between py-2 ${first ? "" : "border-t border-line"}`}>
      <Text className="text-sm text-textSecondary">{label}</Text>
      <Text className="text-sm font-semibold text-textPrimary">{value}</Text>
    </View>
  );
}

/**
 * In-page Product Information — progressive disclosure (collapsed by default) so
 * the ordering flow stays reachable. Renders only the subsections that actually
 * have data, and ties nutrition to the currently selected variant/serving.
 */
export function ProductInfoSection({
  product,
  variant,
}: {
  product: MenuProduct;
  variant?: Variant;
}) {
  const [open, setOpen] = useState(false);

  if (!product.info_visible) return null;

  const hasAbout = !!(product.long_description?.trim() || product.fun_fact?.trim());
  const hasIngredients = product.ingredients.length > 0;
  const nutrition = variant?.nutrition;
  const hasNutrition =
    !!nutrition &&
    (nutrition.calories != null ||
      nutrition.carbs_g != null ||
      nutrition.sugar_g != null ||
      nutrition.protein_g != null ||
      nutrition.fat_g != null ||
      nutrition.sodium_mg != null);
  const hasDietary =
    product.allergens.length > 0 || product.dietary_tags.length > 0 || product.caffeine_mg != null;

  if (!hasAbout && !hasIngredients && !hasNutrition && !hasDietary) return null;

  const nRows: { label: string; value: string }[] = [];
  if (nutrition) {
    if (nutrition.calories != null) nRows.push({ label: "Calories", value: `${nutrition.calories} kcal` });
    if (nutrition.carbs_g != null) nRows.push({ label: "Total carbohydrates", value: `${nutrition.carbs_g} g` });
    if (nutrition.sugar_g != null) nRows.push({ label: "Sugar", value: `${nutrition.sugar_g} g` });
    if (nutrition.protein_g != null) nRows.push({ label: "Protein", value: `${nutrition.protein_g} g` });
    if (nutrition.fat_g != null) nRows.push({ label: "Fat", value: `${nutrition.fat_g} g` });
    if (nutrition.sodium_mg != null) nRows.push({ label: "Sodium", value: `${nutrition.sodium_mg} mg` });
  }

  return (
    <View className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-2 px-4 py-3"
      >
        <Ionicons name="information-circle-outline" size={18} color={Colors.brand} />
        <Text className="flex-1 font-heading text-base text-textPrimary">Product information</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
      </Pressable>

      {open ? (
        <View className="gap-4 border-t border-line px-4 pb-4 pt-3">
          {/* About this item */}
          {hasAbout ? (
            <View>
              <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-textMuted">
                About this item
              </Text>
              {product.long_description?.trim() ? (
                <Text className="text-sm leading-5 text-textSecondary">{product.long_description}</Text>
              ) : null}
              {product.fun_fact?.trim() ? (
                <View className="mt-2 flex-row gap-2 rounded-xl bg-accent-100 px-3 py-2">
                  <Ionicons name="sparkles-outline" size={14} color={Colors.brand} />
                  <Text className="flex-1 text-xs italic text-textSecondary">
                    Did you know? {product.fun_fact}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Ingredients */}
          {hasIngredients ? (
            <View>
              <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-textMuted">
                Ingredients
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {product.ingredients.map((ing, i) => (
                  <Chip key={`${ing.name}-${i}`} label={ing.note ? `${ing.name} · ${ing.note}` : ing.name} />
                ))}
              </View>
            </View>
          ) : null}

          {/* Nutrition (per selected size) */}
          {hasNutrition ? (
            <View>
              <View className="mb-1.5 flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase tracking-wide text-textMuted">
                  Nutrition{variant ? ` · ${variant.name}` : ""}
                </Text>
                {nutrition?.estimated ? (
                  <Text className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-semibold text-textMuted">
                    Estimated
                  </Text>
                ) : null}
              </View>
              {nutrition?.serving_size ? (
                <Text className="mb-1 text-xs text-textMuted">Serving size: {nutrition.serving_size}</Text>
              ) : null}
              <View className="rounded-xl border border-line bg-surfaceMuted px-3">
                {nRows.map((r, i) => (
                  <NutritionRow key={r.label} label={r.label} value={r.value} first={i === 0} />
                ))}
              </View>
              <Text className="mt-1.5 text-[11px] leading-4 text-textMuted">
                Nutrition values are based on the standard recipe and may change with customizations.
              </Text>
            </View>
          ) : null}

          {/* Allergens & dietary notes */}
          {hasDietary ? (
            <View>
              <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-textMuted">
                Allergens &amp; dietary notes
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {product.allergens.map((a) => (
                  <Chip key={`al-${a}`} label={a} tone="warn" icon="alert-circle-outline" />
                ))}
                {product.dietary_tags.map((d) => (
                  <Chip key={`dt-${d}`} label={d} tone="good" icon="leaf-outline" />
                ))}
                {product.caffeine_mg != null ? (
                  <Chip label={`Caffeine ${product.caffeine_mg} mg`} icon="flash-outline" />
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
