import { useEffect, useMemo, useRef, useState } from "react";
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
import { getMenu, getProduct } from "@/lib/api";
import { categoryEmoji, peso } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { MAX_ITEM_QUANTITY } from "@/lib/limits";
import { pairingFor } from "@/lib/productPairings";
import {
  presentationFromOptionNames,
  resolveProductImage,
  type Presentation,
} from "@/lib/productMedia";
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
  const [paired, setPaired] = useState<MenuProduct | null>(null);
  const [pairedAdded, setPairedAdded] = useState(false);
  // Validation: highlight + scroll to a required single-choice group left empty.
  const [invalidGroupId, setInvalidGroupId] = useState<string | null>(null);
  const sectionY = useRef(0);
  const groupY = useRef<Record<string, number>>({});

  function scrollToGroup(groupId: string) {
    const y = Math.max(0, sectionY.current + (groupY.current[groupId] ?? 0) - 16);
    scrollRef.current?.scrollTo({ y, animated: true });
  }

  useEffect(() => {
    void (async () => {
      if (!branch || !id) return;
      setLoading(true);
      setPaired(null);
      setPairedAdded(false);
      try {
        const p = await getProduct(id, branch.id);
        setProduct(p);
        // Resolve a "pairs well with" suggestion from the live menu (price/image/id).
        const pairName = pairingFor(p?.name);
        if (p && pairName) {
          void getMenu(branch.id)
            .then((menu) => {
              const match = menu.find(
                (m) => m.name.trim().toLowerCase() === pairName && m.id !== p.id && m.orderable,
              );
              setPaired(match ?? null);
            })
            .catch(() => setPaired(null));
        }
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

  // Presentation (default/hot/iced) follows the selected Temperature option.
  const presentation: Presentation = useMemo(() => {
    const temp = product?.groups.find((g) => g.name === "Temperature");
    if (!temp) return "default";
    return presentationFromOptionNames(
      (selections[temp.id] ?? []).map((oid) => temp.options.find((o) => o.id === oid)?.name),
    );
  }, [product, selections]);

  const unitPrice =
    (variant?.price ?? 0) + selectedOptions.reduce((s, o) => s + o.additionalPrice, 0);
  const total = unitPrice * quantity;

  function toggle(group: CustomizationGroup, optionId: string) {
    haptics.selection();
    if (invalidGroupId === group.id) setInvalidGroupId(null);
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
    if (!product.orderable) return;
    // Single-choice groups are required: block + focus the first empty one.
    const missing = product.groups.find(
      (g) => g.selection_type === "single" && (selections[g.id]?.length ?? 0) === 0,
    );
    if (missing) {
      setInvalidGroupId(missing.id);
      haptics.warning();
      scrollToGroup(missing.id);
      return;
    }
    setInvalidGroupId(null);
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
        collectionKey: product.collection_key ?? null,
        isSeasonal: product.is_seasonal,
        presentationKey: presentation,
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
          collectionKey: product.collection_key ?? null,
          isSeasonal: product.is_seasonal,
          presentationKey: presentation,
        },
        branch.id,
      );
    }
    haptics.success();
    router.back();
  }

  function addPaired() {
    if (!paired || !branch) return;
    const v =
      paired.variants.find((x) => x.is_default && x.is_available) ??
      paired.variants.find((x) => x.is_available) ??
      paired.variants[0];
    if (!v) return;
    addLine(
      {
        lineId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: paired.id,
        productName: paired.name,
        imageUrl: paired.image_url,
        variantId: v.id,
        variantName: v.name,
        basePrice: v.price,
        quantity: 1,
        selectedOptions: [],
        notes: "",
        collectionKey: paired.collection_key ?? null,
        isSeasonal: paired.is_seasonal,
        presentationKey: "default",
      },
      branch.id,
    );
    haptics.success();
    setPairedAdded(true);
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
        {/* Hero — switches with Hot/Iced (expo-image crossfade, stable aspect) */}
        <View>
          <ProductImage
            {...resolveProductImage(
              { name: product.name, image_url: product.image_url, media: product.media },
              presentation,
            )}
            emoji={categoryEmoji(product.category_name)}
            emojiSize={76}
            className="h-72 w-full"
            accessibilityLabel={`${product.name}${presentation !== "default" ? `, ${presentation}` : ""}`}
          />
          {/* Bottom scrim separates the hero from the title below */}
          <View pointerEvents="none" className="absolute bottom-0 left-0 right-0 h-16 bg-black/15" />
          {/* Hot/Iced label once the customer selects a temperature */}
          {presentation !== "default" ? (
            <View className="absolute bottom-3 left-4 flex-row items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5">
              <Ionicons
                name={presentation === "iced" ? "snow-outline" : "flame-outline"}
                size={13}
                color="#fff"
              />
              <Text className="text-xs font-bold uppercase text-white">{presentation}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            style={{ top: insets.top + 8 }}
            className="absolute left-4 h-10 w-10 items-center justify-center rounded-full bg-white/90"
          >
            {/* Fixed dark arrow — the circle is always white, even in dark mode */}
            <Ionicons name="chevron-back" size={24} color="#231711" />
          </Pressable>
        </View>

        <View
          className="px-5 pt-5"
          onLayout={(e) => {
            sectionY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text className="font-display text-2xl text-textPrimary">{product.name}</Text>
          <Text className="mt-1.5 text-sm leading-5 text-textSecondary">
            {product.description}
          </Text>

          {!product.orderable ? (
            <View className="mt-4 flex-row items-center gap-2 rounded-2xl border border-warning bg-warningSoft px-4 py-3">
              <Ionicons name="snow-outline" size={18} color={Colors.warning} />
              <Text className="flex-1 text-xs text-warning">
                This is a seasonal item and isn’t available under the current campaign.
              </Text>
            </View>
          ) : null}

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
                      className={`flex-row items-center justify-between rounded-2xl border px-4 py-3 ${
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
          {product.groups.map((g) => {
            const invalid = invalidGroupId === g.id;
            return (
            <View
              key={g.id}
              className="mt-6"
              onLayout={(e) => {
                groupY.current[g.id] = e.nativeEvent.layout.y;
              }}
            >
              <View className="mb-2 flex-row items-center gap-2">
                <Text className="font-heading text-base text-textPrimary">{g.name}</Text>
                <Text className={`text-xs ${invalid ? "font-semibold text-danger" : "text-textMuted"}`}>
                  {g.selection_type === "single"
                    ? invalid
                      ? "Please choose one"
                      : "Choose 1"
                    : "Choose any"}
                </Text>
                {(selections[g.id]?.length ?? 0) > 0 ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={Colors.brand}
                    style={{ marginLeft: "auto" }}
                  />
                ) : null}
              </View>
              <View
                className={`overflow-hidden rounded-2xl border bg-surface ${invalid ? "border-danger" : "border-line"}`}
              >
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
                      className={`flex-row items-center justify-between px-4 py-3 ${
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
            );
          })}

          {/* Pairs well with */}
          {paired ? (
            <View className="mt-6">
              <Text className="mb-2 font-heading text-base text-textPrimary">Pairs well with</Text>
              <View className="flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <Pressable
                  onPress={() => router.push(`/product/${paired.id}`)}
                  className="flex-1 flex-row items-center gap-3"
                  accessibilityLabel={`View ${paired.name}`}
                >
                  <ProductImage
                    {...resolveProductImage({
                      name: paired.name,
                      image_url: paired.image_url,
                      media: paired.media,
                    })}
                    emoji={categoryEmoji(paired.category_name)}
                    emojiSize={28}
                    className="h-14 w-14 rounded-xl"
                  />
                  <View className="flex-1">
                    <Text className="font-heading text-sm text-textPrimary" numberOfLines={1}>
                      {paired.name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-textSecondary">
                      from {peso(Math.min(...paired.variants.map((v) => v.price)))}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={addPaired}
                  disabled={pairedAdded}
                  accessibilityLabel={`Add ${paired.name} to cart`}
                  className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${
                    pairedAdded ? "bg-successSoft" : "bg-accent-100"
                  }`}
                >
                  <Ionicons
                    name={pairedAdded ? "checkmark" : "add"}
                    size={16}
                    color={pairedAdded ? Colors.success : Colors.brand}
                  />
                  <Text
                    className={`text-xs font-bold ${pairedAdded ? "text-success" : "text-brandPrimary"}`}
                  >
                    {pairedAdded ? "Added" : "Add"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

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
              placeholderTextColor={Colors.textMuted}
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
        {/* Live summary of the current selection */}
        {product.orderable && variant ? (
          <Text className="mb-2 text-xs text-textMuted" numberOfLines={1}>
            {[variant.name, ...selectedOptions.map((o) => o.optionName)]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
        ) : null}
        {quantity >= MAX_ITEM_QUANTITY ? (
          <Text className="mb-1.5 text-[11px] font-medium text-warning">
            Maximum of {MAX_ITEM_QUANTITY} per item.
          </Text>
        ) : null}
        <View className="flex-row items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} max={MAX_ITEM_QUANTITY} />
          <AnimatedPressable
            onPress={addToCart}
            disabled={!variant?.is_available || !product.orderable}
            className={`h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-brandPrimary ${
              !variant?.is_available || !product.orderable ? "opacity-50" : ""
            }`}
          >
            <Text className="text-base font-bold text-white">
              {!product.orderable
                ? "Unavailable"
                : editLine
                  ? "Update cart"
                  : "Add to cart"}
            </Text>
            {product.orderable ? (
              <Text className="font-display text-base text-white">· {peso(total)}</Text>
            ) : null}
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}
