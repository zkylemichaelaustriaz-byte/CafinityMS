import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { ProductImage } from "@/components/ui/ProductImage";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import {
  KeyboardAwareScrollView,
  useKeyboardAwareScroll,
} from "@/components/ui/KeyboardAwareScrollView";
import { Colors } from "@/constants/theme";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { getProduct } from "@/lib/api";
import { categoryEmoji, peso } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { localProductImage } from "@/lib/productImages";
import { useBranch } from "@/store/branch";
import { useCart } from "@/store/cart";
import type {
  CartSelectedOption,
  CustomizationGroup,
  MenuProduct,
  Variant,
} from "@/types/models";

export default function ProductScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const branch = useBranch((s) => s.branch);
  const addLine = useCart((s) => s.addLine);
  const replaceLine = useCart((s) => s.replaceLine);
  const editLine = useCart((s) => s.lines.find((l) => l.lineId === edit));
  const keyboardVisible = useKeyboardVisible();
  const { scrollRef, handleFocus } = useKeyboardAwareScroll();

  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void (async () => {
      if (!branch || !id) return;
      setLoading(true);
      try {
        const p = await getProduct(id, branch.id);
        setProduct(p);
        const editing = edit ? useCart.getState().lines.find((l) => l.lineId === edit) : undefined;
        if (p && editing) {
          // Editing an existing cart line: restore its exact configuration.
          setVariantId(editing.variantId);
          const restored: Record<string, string[]> = {};
          for (const o of editing.selectedOptions) {
            restored[o.groupId] = [...(restored[o.groupId] ?? []), o.optionId];
          }
          setSelections(restored);
          setQuantity(editing.quantity);
          setNotes(editing.notes);
        } else if (p) {
          const def =
            p.variants.find((v) => v.is_default && v.is_available) ??
            p.variants.find((v) => v.is_available) ??
            p.variants[0];
          setVariantId(def?.id ?? null);
          const init: Record<string, string[]> = {};
          for (const g of p.groups) {
            init[g.id] = g.options.filter((o) => o.is_default).map((o) => o.id);
          }
          setSelections(init);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, branch, edit]);

  const variant: Variant | undefined = useMemo(
    () => product?.variants.find((v) => v.id === variantId),
    [product, variantId],
  );

  const selectedOptions: CartSelectedOption[] = useMemo(() => {
    if (!product) return [];
    const out: CartSelectedOption[] = [];
    for (const g of product.groups) {
      for (const optId of selections[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) {
          out.push({
            optionId: opt.id,
            groupId: g.id,
            groupName: g.name,
            optionName: opt.name,
            additionalPrice: opt.additional_price,
            quantity: 1,
          });
        }
      }
    }
    return out;
  }, [product, selections]);

  const unitPrice =
    (variant?.price ?? 0) + selectedOptions.reduce((s, o) => s + o.additionalPrice, 0);
  const total = unitPrice * quantity;

  function toggle(group: CustomizationGroup, optionId: string) {
    setSelections((prev) => {
      const cur = prev[group.id] ?? [];
      if (group.selection_type === "single") {
        return { ...prev, [group.id]: [optionId] };
      }
      const next = cur.includes(optionId)
        ? cur.filter((x) => x !== optionId)
        : [...cur, optionId];
      return { ...prev, [group.id]: next };
    });
  }

  function addToCart() {
    if (!product || !variant || !branch) return;
    if (editLine) {
      // Edit-in-place: keep the same lineId/position in the cart.
      replaceLine(editLine.lineId, {
        ...editLine,
        productId: product.id,
        productName: product.name,
        imageUrl: product.image_url,
        variantId: variant.id,
        variantName: variant.name,
        basePrice: variant.price,
        quantity,
        selectedOptions,
        notes: notes.trim(),
      });
    } else {
      addLine(
        {
          lineId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          productId: product.id,
          productName: product.name,
          imageUrl: product.image_url,
          variantId: variant.id,
          variantName: variant.name,
          basePrice: variant.price,
          quantity,
          selectedOptions,
          notes: notes.trim(),
        },
        branch.id,
      );
    }
    haptics.success();
    router.back();
  }

  if (!branch) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center text-textSecondary">Please select a branch first.</Text>
      </View>
    );
  }
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={Colors.brand} />
      </View>
    );
  }
  if (!product) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center text-textSecondary">Product not found.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView ref={scrollRef} contentContainerClassName="pb-40">
        {/* Hero */}
        <View>
          <ProductImage
            source={localProductImage(product.name)}
            uri={product.image_url}
            emoji={categoryEmoji(product.category_name)}
            emojiSize={76}
            className="h-72 w-full"
            accessibilityLabel={product.name}
          />
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            style={{ top: insets.top + 8 }}
            className="absolute left-4 h-10 w-10 items-center justify-center rounded-full bg-white/90"
          >
            <Ionicons name="chevron-back" size={24} color={Colors.espresso} />
          </Pressable>
        </View>

        <View className="px-5 pt-5">
          <Text className="font-display text-2xl text-textPrimary">{product.name}</Text>
          <Text className="mt-1.5 text-sm leading-5 text-textSecondary">
            {product.description}
          </Text>

          {/* Sizes */}
          {product.variants.length > 0 ? (
            <View className="mt-6">
              <Text className="mb-2 font-heading text-base text-textPrimary">Size</Text>
              <View className="gap-2">
                {product.variants.map((v) => {
                  const active = v.id === variantId;
                  return (
                    <Pressable
                      key={v.id}
                      disabled={!v.is_available}
                      onPress={() => setVariantId(v.id)}
                      className={`flex-row items-center justify-between rounded-2xl border px-4 py-3.5 ${
                        active ? "border-brandPrimary bg-accent-100" : "border-line bg-surface"
                      } ${v.is_available ? "" : "opacity-40"}`}
                    >
                      <Text className="text-base font-semibold text-textPrimary">
                        {v.name}
                        {v.is_available ? "" : "  (sold out)"}
                      </Text>
                      <View className="flex-row items-center gap-3">
                        <Text className="font-display text-base text-brandPrimary">
                          {peso(v.price)}
                        </Text>
                        <Ionicons
                          name={active ? "radio-button-on" : "radio-button-off"}
                          size={20}
                          color={active ? Colors.brand : "#C9A47C"}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Customization */}
          {product.groups.map((g) => (
            <View key={g.id} className="mt-6">
              <View className="mb-2 flex-row items-center gap-2">
                <Text className="font-heading text-base text-textPrimary">{g.name}</Text>
                <Text className="text-xs text-textMuted">
                  {g.selection_type === "single" ? "Choose 1" : "Choose any"}
                </Text>
              </View>
              <View className="overflow-hidden rounded-2xl border border-line bg-surface">
                {g.options.map((o, idx) => {
                  const sel = (selections[g.id] ?? []).includes(o.id);
                  const single = g.selection_type === "single";
                  const icon = single
                    ? sel
                      ? "radio-button-on"
                      : "radio-button-off"
                    : sel
                      ? "checkbox"
                      : "square-outline";
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => toggle(g, o.id)}
                      className={`flex-row items-center justify-between px-4 py-3.5 ${
                        idx > 0 ? "border-t border-line" : ""
                      } ${sel ? "bg-accent-100" : ""}`}
                    >
                      <Text className="text-base text-textPrimary">{o.name}</Text>
                      <View className="flex-row items-center gap-3">
                        {o.additional_price > 0 ? (
                          <Text className="text-sm font-medium text-textSecondary">
                            +{peso(o.additional_price)}
                          </Text>
                        ) : null}
                        <Ionicons name={icon} size={20} color={sel ? Colors.brand : "#C9A47C"} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          {/* Notes */}
          <View className="mt-6">
            <Text className="mb-2 font-heading text-base text-textPrimary">
              Special instructions
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              onFocus={handleFocus}
              placeholder="e.g. extra hot, no straw"
              placeholderTextColor="#B8A99C"
              multiline
              maxLength={200}
              textAlignVertical="top"
              className="min-h-[64px] rounded-2xl border border-line bg-surface px-4 py-3 text-base text-textPrimary"
            />
            <Text className="mt-1 self-end text-[11px] text-textMuted">{notes.length}/200</Text>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* Sticky add-to-cart */}
      <View
        style={{ paddingBottom: insets.bottom + 12 }}
        className={`absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-5 pt-3 ${
          keyboardVisible ? "hidden" : ""
        }`}
      >
        <View className="flex-row items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <AnimatedPressable
            onPress={addToCart}
            disabled={!variant?.is_available}
            className={`h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-brandPrimary ${
              !variant?.is_available ? "opacity-50" : ""
            }`}
          >
            <Text className="text-base font-bold text-white">
              {editLine ? "Update cart" : "Add to cart"}
            </Text>
            <Text className="font-display text-base text-white">· {peso(total)}</Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}
