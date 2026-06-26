import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Header } from "@/components/ui/Header";
import { PriceText } from "@/components/ui/PriceText";
import { ProductImage } from "@/components/ui/ProductImage";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Screen } from "@/components/ui/Screen";
import { StickyActionBar } from "@/components/ui/StickyActionBar";
import { Colors } from "@/constants/theme";
import { getMenu } from "@/lib/api";
import { getEmptyStateImage } from "@/lib/emptyStateImages";
import { lineTotal } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { MAX_ITEM_QUANTITY } from "@/lib/limits";
import { resolveProductImage } from "@/lib/productMedia";
import { useBranch } from "@/store/branch";
import { cartSubtotal, useCart } from "@/store/cart";
import { useSeasonalTheme } from "@/store/seasonalTheme";
import type { CartLine } from "@/types/models";

/** A seasonal line is locked when its collection isn't the active campaign. */
function isLineLocked(line: CartLine, activeKey: string | null): boolean {
  return !!line.isSeasonal && line.collectionKey !== activeKey;
}

export default function CartScreen() {
  const router = useRouter();
  const branch = useBranch((s) => s.branch);
  const lines = useCart((s) => s.lines);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeLine = useCart((s) => s.removeLine);
  const duplicateLine = useCart((s) => s.duplicateLine);
  const insertLineAt = useCart((s) => s.insertLineAt);
  const activeKey = useSeasonalTheme((s) => s.activeKey);

  // Branch availability: product → orderable + the set of available variant ids
  // at the SELECTED branch, used to flag cart items not available there.
  const [availMap, setAvailMap] = useState<Map<
    string,
    { orderable: boolean; variants: Set<string> }
  > | null>(null);

  useEffect(() => {
    if (!branch) return;
    let alive = true;
    setAvailMap(null);
    getMenu(branch.id)
      .then((menu) => {
        if (!alive) return;
        const map = new Map<string, { orderable: boolean; variants: Set<string> }>();
        for (const p of menu) {
          map.set(p.id, {
            orderable: p.orderable,
            variants: new Set(p.variants.filter((v) => v.is_available).map((v) => v.id)),
          });
        }
        setAvailMap(map);
      })
      .catch(() => setAvailMap(null));
    return () => {
      alive = false;
    };
  }, [branch]);

  // Classify a non-seasonal line's availability at the selected branch so we can
  // show the exact reason (seasonal locking is handled separately). "product" =
  // the product itself isn't orderable here; "variant" = that size/variant isn't.
  // Quantity-vs-stock + concurrency is enforced atomically server-side by
  // place_order, which rejects with an item-specific error at checkout.
  function conflictReason(line: CartLine): "product" | "variant" | null {
    if (!availMap || isLineLocked(line, activeKey)) return null;
    const entry = availMap.get(line.productId);
    if (!entry || !entry.orderable) return "product";
    if (!entry.variants.has(line.variantId)) return "variant";
    return null;
  }
  const unavailableAtBranch = (line: CartLine): boolean => conflictReason(line) !== null;

  // Undo affordance for removals: keep the removed line + its position briefly.
  const [undo, setUndo] = useState<{ line: CartLine; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  function handleRemove(line: CartLine) {
    const index = lines.findIndex((l) => l.lineId === line.lineId);
    removeLine(line.lineId);
    haptics.light();
    setUndo({ line, index });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 4500);
  }

  function handleUndo() {
    if (!undo) return;
    insertLineAt(undo.line, undo.index);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  function handleDuplicate(line: CartLine) {
    duplicateLine(line.lineId);
    haptics.light();
  }

  const subtotal = cartSubtotal(lines);
  const hasLocked = lines.some((l) => isLineLocked(l, activeKey));
  const hasUnavailable = lines.some((l) => unavailableAtBranch(l));
  const hasBlocked = hasLocked || hasUnavailable;

  if (lines.length === 0) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title="Your cart" />
        <EmptyState
          image={getEmptyStateImage("cart")}
          emoji="🛒"
          title="Your cart is empty"
          subtitle="Add a drink from the menu to get started."
        >
          <Button label="Browse menu" onPress={() => router.replace("/menu")} />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]}>
      <Header title="Your cart" />

      <ScrollView
        contentContainerClassName="p-4"
        style={{ marginBottom: 150 }}
        showsVerticalScrollIndicator={false}
      >
        {branch ? (
          <View className="mb-3 flex-row items-center gap-1.5">
            <Ionicons name="location" size={14} color={Colors.brand} />
            <Text className="text-sm font-medium text-textSecondary">
              Pickup at {branch.name}
            </Text>
          </View>
        ) : null}

        {hasUnavailable ? (
          <View className="mb-3 flex-row items-start gap-2 rounded-2xl border border-danger bg-dangerSoft px-3 py-2.5">
            <Ionicons name="alert-circle" size={16} color={Colors.danger} />
            <Text className="flex-1 text-xs font-medium text-danger">
              Some items aren&apos;t available at {branch?.name ?? "this branch"}. Edit or remove the
              highlighted items to continue.
            </Text>
          </View>
        ) : null}

        {lines.map((line) => {
          const locked = isLineLocked(line, activeKey);
          const reason = conflictReason(line);
          const unavailable = reason !== null;
          const blocked = locked || unavailable;
          return (
          <View
            key={line.lineId}
            className={`mb-3 flex-row rounded-card border bg-surface p-3 ${
              blocked ? "border-danger" : "border-line"
            }`}
          >
            <ProductImage
              {...resolveProductImage(
                { name: line.productName, image_url: line.imageUrl },
                line.presentationKey,
              )}
              emoji="☕"
              className={`h-20 w-20 rounded-xl ${blocked ? "opacity-50" : ""}`}
              emojiSize={30}
              accessibilityLabel={line.productName}
            />
            <View className="ml-3 flex-1">
              <View className="flex-row items-start justify-between">
                <Text className="flex-1 pr-2 text-base font-bold text-textPrimary">
                  {line.productName}
                </Text>
                <View className="flex-row items-center gap-3.5">
                  {!locked ? (
                    <>
                      <Pressable
                        onPress={() =>
                          router.push(`/product/${line.productId}?edit=${line.lineId}`)
                        }
                        hitSlop={8}
                        accessibilityLabel={`Edit ${line.productName}`}
                      >
                        <Ionicons name="create-outline" size={18} color={Colors.brand} />
                      </Pressable>
                      {!unavailable ? (
                        <Pressable
                          onPress={() => handleDuplicate(line)}
                          hitSlop={8}
                          accessibilityLabel={`Duplicate ${line.productName}`}
                        >
                          <Ionicons name="copy-outline" size={17} color={Colors.brand} />
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                  <Pressable
                    onPress={() => handleRemove(line)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${line.productName}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                  </Pressable>
                </View>
              </View>
              {locked ? (
                <Text className="mt-0.5 text-xs font-medium text-danger">
                  This seasonal item is no longer available under the current campaign. Remove it to
                  continue.
                </Text>
              ) : reason === "variant" ? (
                <Text className="mt-0.5 text-xs font-medium text-danger">
                  {line.variantName} isn&apos;t available at {branch?.name ?? "this branch"}. Edit to
                  choose another size, or remove it.
                </Text>
              ) : reason === "product" ? (
                <Text className="mt-0.5 text-xs font-medium text-danger">
                  This item isn&apos;t available at {branch?.name ?? "this branch"} right now. Remove
                  it to continue.
                </Text>
              ) : null}
              <Text className="text-xs text-textSecondary">{line.variantName}</Text>
              {line.selectedOptions.length > 0 ? (
                <Text className="mt-0.5 text-xs text-textMuted" numberOfLines={2}>
                  {line.selectedOptions.map((o) => o.optionName).join(" · ")}
                </Text>
              ) : null}
              {line.notes ? (
                <Text className="mt-0.5 text-xs italic text-textMuted">“{line.notes}”</Text>
              ) : null}

              <View className="mt-2 flex-row items-center justify-between">
                <QuantityStepper
                  value={line.quantity}
                  onChange={(q) => updateQuantity(line.lineId, q)}
                  max={MAX_ITEM_QUANTITY}
                  size="sm"
                />
                <PriceText amount={lineTotal(line)} size="md" />
              </View>
            </View>
          </View>
          );
        })}

        <Pressable
          onPress={() => router.replace("/menu")}
          className="mt-1 flex-row items-center justify-center gap-1.5 py-2"
        >
          <Ionicons name="add" size={18} color={Colors.brand} />
          <Text className="text-sm font-semibold text-brandPrimary">Add more items</Text>
        </Pressable>
      </ScrollView>

      {undo ? (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0"
          style={{ bottom: 168 }}
        >
          <View className="mx-4 flex-row items-center justify-between rounded-2xl bg-textPrimary px-4 py-3">
            <Text className="flex-1 pr-3 text-sm font-medium text-background" numberOfLines={1}>
              Removed {undo.line.productName}
            </Text>
            <Pressable onPress={handleUndo} hitSlop={8} accessibilityLabel="Undo remove">
              <Text className="text-sm font-bold text-brandPrimary">Undo</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <StickyActionBar>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm text-textSecondary">Subtotal</Text>
          <PriceText amount={subtotal} size="lg" />
        </View>
        {hasBlocked ? (
          <Text className="mb-2 text-center text-xs font-medium text-danger">
            {hasLocked && hasUnavailable
              ? "Remove the unavailable items to continue."
              : hasLocked
                ? "Remove the unavailable seasonal item to continue."
                : `Some items aren't available at ${branch?.name ?? "this branch"}. Remove them to continue.`}
          </Text>
        ) : null}
        <Button
          label="Proceed to checkout"
          onPress={() => router.push("/checkout")}
          haptic="light"
          disabled={hasBlocked}
        />
      </StickyActionBar>
    </Screen>
  );
}
