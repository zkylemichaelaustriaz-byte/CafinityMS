import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Header } from "@/components/ui/Header";
import { ProductImage } from "@/components/ui/ProductImage";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import {
  createProductFull,
  createVariant,
  deleteProductMedia,
  deleteVariant,
  getAdminProducts,
  getCategories,
  getCustomizationGroups,
  getProductGroupIds,
  getProductMedia,
  setProductGroups,
  setProductMedia,
  softDeleteProduct,
  updateProduct,
  updateVariant,
  type PresentationKey,
  type SimpleGroup,
} from "@/lib/api";
import { uploadProductImage } from "@/lib/productImageUpload";
import { CAMPAIGN_PRESETS } from "@/lib/campaignPresets";
import { humanizeError } from "@/lib/errors";
import { peso } from "@/lib/format";
import { uuidv4 } from "@/lib/id";
import type { Category } from "@/types/models";

type LocalVariant = { key: string; id?: string; name: string; price: string; isDefault: boolean };

const SEASONAL_PRESETS = CAMPAIGN_PRESETS.filter((p) => p.key !== "default");

function newVariant(name = "", price = "", isDefault = false): LocalVariant {
  return { key: uuidv4(), name, price, isDefault };
}

export default function AdminProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<SimpleGroup[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [featured, setFeatured] = useState(false);
  const [available, setAvailable] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [isSeasonal, setIsSeasonal] = useState(false);
  const [collectionKey, setCollectionKey] = useState<string | null>(null);
  const [variants, setVariants] = useState<LocalVariant[]>([newVariant("Regular", "", true)]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [media, setMedia] = useState<Partial<Record<PresentationKey, string>>>({});
  const [mediaBusy, setMediaBusy] = useState<PresentationKey | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "";
  const isPastry = categoryName === "Pastries";
  const tempGroupId = groups.find((g) => g.name === "Temperature")?.id;
  const tempAttached = !!tempGroupId && groupIds.includes(tempGroupId);

  const load = useCallback(async () => {
    try {
      const [cats, allGroups] = await Promise.all([getCategories(), getCustomizationGroups()]);
      setCategories(cats);
      setGroups(allGroups);
      if (!isNew && id) {
        const [all, linkedIds, mediaMap] = await Promise.all([
          getAdminProducts(),
          getProductGroupIds(id),
          getProductMedia(id),
        ]);
        setMedia(mediaMap);
        const p = all.find((x) => x.id === id);
        if (p) {
          setName(p.name);
          setDescription(p.description);
          setCategoryId(p.category_id);
          setFeatured(p.is_featured);
          setAvailable(p.is_available);
          setImageUrl(p.image_url);
          setIsSeasonal(p.is_seasonal);
          setCollectionKey(p.collection_key);
          setVariants(
            p.variants.map((v) => ({
              key: v.id,
              id: v.id,
              name: v.name,
              price: String(v.price),
              isDefault: v.is_default,
            })),
          );
          setOriginalIds(p.variants.map((v) => v.id));
          setGroupIds(linkedIds);
        }
      } else if (cats.length) {
        setCategoryId(cats[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- Image -----------------------------------------------------------------
  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to choose a product image.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setImageBusy(true);
    try {
      setImageUrl(await uploadProductImage(res.assets[0].uri));
    } catch (e) {
      Alert.alert("Upload failed", humanizeError(e, "Could not upload the image. Try again."));
    } finally {
      setImageBusy(false);
    }
  }

  // ---- Hot / Iced presentation media (edit mode only) ------------------------
  async function pickMedia(key: PresentationKey) {
    if (isNew || !id) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to choose an image.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setMediaBusy(key);
    try {
      const url = await uploadProductImage(res.assets[0].uri);
      await setProductMedia(id, key, url);
      setMedia((m) => ({ ...m, [key]: url }));
    } catch (e) {
      Alert.alert("Upload failed", humanizeError(e, "Could not upload the image. Try again."));
    } finally {
      setMediaBusy(null);
    }
  }

  async function removeMedia(key: PresentationKey) {
    if (isNew || !id) return;
    setMediaBusy(key);
    try {
      await deleteProductMedia(id, key);
      setMedia((m) => {
        const next = { ...m };
        delete next[key];
        return next;
      });
    } catch (e) {
      Alert.alert("Couldn't remove", humanizeError(e));
    } finally {
      setMediaBusy(null);
    }
  }

  // ---- Variants --------------------------------------------------------------
  function setVariant(key: string, patch: Partial<LocalVariant>) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }
  function addVariantRow() {
    setVariants((prev) => [...prev, newVariant("", "", prev.length === 0)]);
  }
  function removeVariantRow(key: string) {
    setVariants((prev) => {
      const next = prev.filter((v) => v.key !== key);
      if (next.length && !next.some((v) => v.isDefault)) next[0].isDefault = true;
      return next;
    });
  }
  function makeDefault(key: string) {
    setVariants((prev) => prev.map((v) => ({ ...v, isDefault: v.key === key })));
  }

  function toggleGroup(gid: string) {
    setGroupIds((prev) => (prev.includes(gid) ? prev.filter((g) => g !== gid) : [...prev, gid]));
  }

  // ---- Validation + save -----------------------------------------------------
  function validate(): string | null {
    if (!name.trim()) return "Enter a product name.";
    if (!categoryId) return "Choose a category.";
    const parsed = variants.map((v) => ({ name: v.name.trim(), price: parseFloat(v.price) }));
    if (parsed.length === 0) return "Add at least one size.";
    if (parsed.some((v) => !v.name)) return "Every size needs a name.";
    if (parsed.some((v) => isNaN(v.price) || v.price <= 0)) return "Every size needs a price above 0.";
    const names = parsed.map((v) => v.name.toLowerCase());
    if (new Set(names).size !== names.length) return "Size names must be unique.";
    if (isSeasonal && !collectionKey) return "Pick a campaign collection for this seasonal product.";
    return null;
  }

  async function save() {
    const err = validate();
    if (err) {
      Alert.alert("Check the form", err);
      return;
    }
    // Normalize: ensure exactly one default.
    const normalized = variants.map((v) => ({ ...v, name: v.name.trim() }));
    if (!normalized.some((v) => v.isDefault)) normalized[0].isDefault = true;
    const defName = normalized.find((v) => v.isDefault)!.name;
    const coll = isSeasonal ? collectionKey : null;

    setSaving(true);
    try {
      if (isNew) {
        await createProductFull({
          name: name.trim(),
          description: description.trim(),
          category_id: categoryId,
          is_featured: featured,
          is_available: available,
          image_url: imageUrl,
          is_seasonal: isSeasonal,
          collection_key: coll,
          variants: normalized.map((v) => ({
            name: v.name,
            price: parseFloat(v.price) || 0,
            is_default: v.isDefault,
          })),
          groupIds: isPastry ? [] : groupIds,
        });
      } else if (id) {
        await updateProduct(id, {
          name: name.trim(),
          description: description.trim(),
          category_id: categoryId,
          is_featured: featured,
          is_available: available,
          image_url: imageUrl,
          is_seasonal: isSeasonal,
          collection_key: coll,
        });
        // Variant diff.
        const keptIds = normalized.filter((v) => v.id).map((v) => v.id as string);
        for (const oid of originalIds) {
          if (!keptIds.includes(oid)) await deleteVariant(oid);
        }
        for (const v of normalized) {
          const price = parseFloat(v.price) || 0;
          if (v.id) await updateVariant(v.id, { name: v.name, price });
          else await createVariant(id, v.name, price);
        }
        // Re-resolve default by name (covers newly created rows).
        const fresh = (await getAdminProducts()).find((p) => p.id === id)?.variants ?? [];
        for (const fv of fresh) {
          await updateVariant(fv.id, { is_default: fv.name === defName });
        }
        await setProductGroups(id, isPastry ? [] : groupIds);
      }
      router.back();
    } catch (e) {
      Alert.alert("Could not save", humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteProduct() {
    Alert.alert("Delete product?", "It will be hidden from the menu.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!id) return;
          await softDeleteProduct(id);
          router.back();
        },
      },
    ]);
  }

  const startingPrice = variants
    .map((v) => parseFloat(v.price))
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b)[0];

  if (loading) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Header title={isNew ? "New product" : "Edit product"} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]}>
      <Header title={isNew ? "New product" : "Edit product"} />
      <ScrollView
        contentContainerClassName="p-5 pb-12"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        {/* Image */}
        <Text className="mb-2 text-sm font-semibold text-textPrimary">Product image</Text>
        <View className="mb-4 flex-row items-center gap-4">
          <ProductImage
            source={undefined}
            uri={imageUrl}
            emoji="☕"
            emojiSize={34}
            className="h-24 w-24 rounded-2xl"
            accessibilityLabel="Product image preview"
          />
          <View className="flex-1 gap-2">
            <Button
              label={imageBusy ? "Uploading…" : imageUrl ? "Replace image" : "Pick image"}
              variant="outline"
              onPress={pickImage}
              loading={imageBusy}
            />
            {imageUrl ? (
              <Pressable onPress={() => setImageUrl(null)} className="items-center py-1">
                <Text className="text-xs font-semibold text-danger">Remove image</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Caramel Macchiato" />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Short description"
          multiline
        />

        {/* Category */}
        <Text className="mb-2 text-sm font-semibold text-textPrimary">Category</Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {categories.map((c) => {
            const active = categoryId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                className={`rounded-full px-4 py-2 ${active ? "bg-brandPrimary" : "border border-line bg-surface"}`}
              >
                <Text className={`text-sm font-semibold ${active ? "text-white" : "text-textSecondary"}`}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Toggles */}
        <View className="mb-4 flex-row gap-3">
          <Toggle label="Available" value={available} onToggle={() => setAvailable((v) => !v)} icon="eye" />
          <Toggle label="Featured" value={featured} onToggle={() => setFeatured((v) => !v)} icon="star" />
        </View>

        {/* Seasonal */}
        <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-semibold text-textPrimary">Seasonal product</Text>
            <Text className="text-xs text-textMuted">
              Only shown to customers while its campaign is active.
            </Text>
          </View>
          <Switch
            value={isSeasonal}
            onValueChange={(v) => {
              setIsSeasonal(v);
              if (!v) setCollectionKey(null);
            }}
            trackColor={{ true: Colors.brand }}
          />
        </View>
        {isSeasonal ? (
          <View className="mb-4">
            <Text className="mb-2 text-xs font-semibold text-textSecondary">Campaign collection</Text>
            <View className="flex-row flex-wrap gap-2">
              {SEASONAL_PRESETS.map((p) => {
                const active = collectionKey === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setCollectionKey(p.key)}
                    className={`rounded-full px-3 py-2 ${active ? "bg-brandPrimary" : "border border-line bg-surface"}`}
                  >
                    <Text className={`text-xs font-semibold ${active ? "text-white" : "text-textSecondary"}`}>
                      {p.emoji} {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Variants */}
        <View className="mb-1 mt-2 flex-row items-center justify-between">
          <Text className="text-base font-bold text-textPrimary">Sizes & prices</Text>
          <Pressable onPress={addVariantRow} hitSlop={8} className="flex-row items-center gap-1">
            <Ionicons name="add-circle" size={18} color={Colors.brand} />
            <Text className="text-sm font-semibold text-brandPrimary">Add size</Text>
          </Pressable>
        </View>
        <View className="gap-2">
          {variants.map((v) => (
            <View
              key={v.key}
              className="flex-row items-center gap-2 rounded-2xl border border-line bg-surface p-2"
            >
              <Pressable onPress={() => makeDefault(v.key)} hitSlop={6} accessibilityLabel="Set as default size">
                <Ionicons
                  name={v.isDefault ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={v.isDefault ? Colors.brand : "#C9A47C"}
                />
              </Pressable>
              <Field
                value={v.name}
                onChangeText={(t) => setVariant(v.key, { name: t })}
                placeholder="Size (e.g. Medium)"
                containerClassName="flex-1"
              />
              <Field
                value={v.price}
                onChangeText={(t) => setVariant(v.key, { price: t })}
                placeholder="₱"
                keyboardType="decimal-pad"
                containerClassName="w-20"
              />
              <Pressable onPress={() => removeVariantRow(v.key)} hitSlop={6} disabled={variants.length <= 1}>
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={variants.length <= 1 ? "#D6C9BA" : Colors.danger}
                />
              </Pressable>
            </View>
          ))}
        </View>
        <Text className="mb-4 mt-1 text-[11px] text-textMuted">
          The filled circle marks the default size shown first.
        </Text>

        {/* Customization groups (not for pastries) */}
        {!isPastry ? (
          <View className="mb-4">
            <Text className="mb-2 text-base font-bold text-textPrimary">Customizations</Text>
            <View className="flex-row flex-wrap gap-2">
              {groups.map((g) => {
                const active = groupIds.includes(g.id);
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => toggleGroup(g.id)}
                    className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${
                      active ? "bg-accent-100 border border-brandPrimary" : "border border-line bg-surface"
                    }`}
                  >
                    <Ionicons
                      name={active ? "checkmark-circle" : "ellipse-outline"}
                      size={15}
                      color={active ? Colors.brand : "#C9A47C"}
                    />
                    <Text className="text-xs font-semibold text-textSecondary">{g.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Hot / Iced presentation images (only when Temperature is attached) */}
        {tempAttached ? (
          isNew ? (
            <View className="mb-4 rounded-card border border-line bg-surfaceMuted p-3">
              <Text className="text-xs text-textMuted">
                Save the product first, then reopen it to add Hot and Iced images.
              </Text>
            </View>
          ) : (
            <View className="mb-4">
              <Text className="mb-1 text-base font-bold text-textPrimary">Hot / Iced images</Text>
              <Text className="mb-2 text-xs text-textMuted">
                Shown when the customer picks that temperature. Falls back to the main image.
              </Text>
              <View className="flex-row gap-3">
                {(["hot", "iced"] as PresentationKey[]).map((key) => (
                  <View
                    key={key}
                    className="flex-1 items-center rounded-card border border-line bg-surface p-3"
                  >
                    <ProductImage
                      source={undefined}
                      uri={media[key]}
                      emoji={key === "iced" ? "🧊" : "☕"}
                      emojiSize={26}
                      className="h-20 w-20 rounded-xl"
                      accessibilityLabel={`${key} image`}
                    />
                    <Text className="mt-1 text-xs font-semibold capitalize text-textSecondary">
                      {key}
                    </Text>
                    <Pressable
                      onPress={() => pickMedia(key)}
                      disabled={mediaBusy === key}
                      className="mt-2 flex-row items-center gap-1"
                    >
                      {mediaBusy === key ? (
                        <ActivityIndicator size="small" color={Colors.brand} />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={14} color={Colors.brand} />
                      )}
                      <Text className="text-xs font-semibold text-brandPrimary">
                        {media[key] ? "Replace" : "Upload"}
                      </Text>
                    </Pressable>
                    {media[key] ? (
                      <Pressable onPress={() => removeMedia(key)} className="mt-0.5">
                        <Text className="text-[11px] text-danger">Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          )
        ) : null}

        {/* Preview */}
        <Text className="mb-2 mt-2 text-base font-bold text-textPrimary">Preview</Text>
        <View className="mb-6 flex-row overflow-hidden rounded-card border border-line bg-surface">
          <ProductImage
            source={undefined}
            uri={imageUrl}
            emoji="☕"
            emojiSize={30}
            className="h-24 w-24"
            accessibilityLabel="Preview image"
          />
          <View className="flex-1 p-3">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 font-display text-base text-textPrimary" numberOfLines={1}>
                {name || "Product name"}
              </Text>
              {isSeasonal ? (
                <View className="rounded-full bg-accent-100 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-brandPrimary">Seasonal</Text>
                </View>
              ) : featured ? (
                <View className="rounded-full bg-accent-100 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-brandPrimary">Featured</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-xs text-textMuted">{categoryName || "Category"}</Text>
            <Text className="mt-0.5 text-xs text-textSecondary" numberOfLines={2}>
              {description || "Short description"}
            </Text>
            <Text className="mt-1 font-display text-sm text-brandPrimary">
              {startingPrice ? `from ${peso(startingPrice)}` : "—"}
            </Text>
          </View>
        </View>

        <Button label={isNew ? "Create product" : "Save changes"} onPress={save} loading={saving} />

        {!isNew ? (
          <Pressable onPress={confirmDeleteProduct} className="mt-3 items-center py-3">
            <Text className="text-sm font-semibold text-danger">Delete product</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Toggle({
  label,
  value,
  onToggle,
  icon,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onToggle}
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${
        value ? "border-brandPrimary bg-accent-100" : "border-line bg-surface"
      }`}
    >
      <Ionicons name={icon} size={18} color={value ? Colors.brand : "#a8a29e"} />
      <Text className={`text-sm font-semibold ${value ? "text-brandPrimary" : "text-textMuted"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
