import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import {
  createProduct,
  createVariant,
  deleteVariant,
  getAdminProducts,
  getCategories,
  softDeleteProduct,
  updateProduct,
  updateVariant,
} from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import type { Category, Variant } from "@/types/models";

export default function AdminProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [featured, setFeatured] = useState(false);
  const [available, setAvailable] = useState(true);
  const [variants, setVariants] = useState<Variant[]>([]);

  const [newVarName, setNewVarName] = useState("");
  const [newVarPrice, setNewVarPrice] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const cats = await getCategories();
      setCategories(cats);
      if (!isNew && id) {
        const all = await getAdminProducts();
        const p = all.find((x) => x.id === id);
        if (p) {
          setName(p.name);
          setDescription(p.description);
          setCategoryId(p.category_id);
          setFeatured(p.is_featured);
          setAvailable(p.is_available);
          setVariants(p.variants);
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

  async function reloadVariants() {
    if (isNew || !id) return;
    const all = await getAdminProducts();
    const p = all.find((x) => x.id === id);
    if (p) setVariants(p.variants);
  }

  async function saveCore() {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a product name.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const price = parseFloat(newVarPrice) || 0;
        await createProduct({
          name: name.trim(),
          description: description.trim(),
          category_id: categoryId,
          is_featured: featured,
          is_available: available,
          variant_name: newVarName.trim() || "Regular",
          variant_price: price,
        });
      } else if (id) {
        await updateProduct(id, {
          name: name.trim(),
          description: description.trim(),
          category_id: categoryId,
          is_featured: featured,
          is_available: available,
        });
      }
      router.back();
    } catch (e) {
      Alert.alert("Could not save", humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  async function commitVarPrice(v: Variant, text: string) {
    const price = parseFloat(text);
    if (isNaN(price) || price === v.price) return;
    setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, price } : x)));
    try {
      await updateVariant(v.id, { price });
    } catch {
      void reloadVariants();
    }
  }

  async function toggleVarAvail(v: Variant) {
    const value = !v.is_available;
    setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, is_available: value } : x)));
    try {
      await updateVariant(v.id, { is_available: value });
    } catch {
      void reloadVariants();
    }
  }

  function confirmRemoveVar(v: Variant) {
    if (variants.length <= 1) {
      Alert.alert("Cannot remove", "A product needs at least one size.");
      return;
    }
    Alert.alert("Remove size?", `Remove "${v.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await deleteVariant(v.id);
          await reloadVariants();
        },
      },
    ]);
  }

  async function addVariant() {
    const price = parseFloat(newVarPrice) || 0;
    if (!newVarName.trim()) {
      Alert.alert("Name required", "Enter a size name (e.g. Large).");
      return;
    }
    if (!id) return;
    try {
      await createVariant(id, newVarName.trim(), price);
      setNewVarName("");
      setNewVarPrice("");
      await reloadVariants();
    } catch (e) {
      Alert.alert("Could not add", humanizeError(e));
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
        contentContainerClassName="p-5 pb-10"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Caramel Macchiato" />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Short description"
          multiline
        />

        {/* Category */}
        <Text className="mb-2 text-sm font-semibold text-espresso">Category</Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {categories.map((c) => {
            const active = categoryId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                className={`rounded-full px-4 py-2 ${
                  active ? "bg-brand-500" : "bg-white border border-brand-100"
                }`}
              >
                <Text className={`text-sm font-semibold ${active ? "text-white" : "text-brand-700"}`}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Toggles */}
        <View className="mb-2 flex-row gap-3">
          <Toggle label="Available" value={available} onToggle={() => setAvailable((v) => !v)} icon="eye" />
          <Toggle label="Featured" value={featured} onToggle={() => setFeatured((v) => !v)} icon="star" />
        </View>

        {isNew ? (
          <View className="mt-4">
            <Text className="mb-2 text-base font-bold text-espresso">First size</Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Size name" value={newVarName} onChangeText={setNewVarName} placeholder="Regular" />
              </View>
              <View className="flex-1">
                <Field
                  label="Price (₱)"
                  value={newVarPrice}
                  onChangeText={setNewVarPrice}
                  placeholder="120"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>
        ) : (
          <View className="mt-4">
            <Text className="mb-2 text-base font-bold text-espresso">Sizes & prices</Text>
            <View className="rounded-2xl border border-brand-100 bg-white">
              {variants.map((v, i) => (
                <View
                  key={v.id}
                  className={`flex-row items-center px-3 py-2.5 ${
                    i > 0 ? "border-t border-brand-50" : ""
                  }`}
                >
                  <Text className="flex-1 text-sm font-medium text-espresso">{v.name}</Text>
                  <View className="flex-row items-center">
                    <Text className="text-sm text-stone-400">₱</Text>
                    <TextInput
                      defaultValue={String(v.price)}
                      keyboardType="decimal-pad"
                      onEndEditing={(e) => commitVarPrice(v, e.nativeEvent.text)}
                      className="w-16 rounded-lg border border-brand-200 bg-cream py-1 text-center text-sm font-bold text-espresso"
                    />
                  </View>
                  <Pressable onPress={() => toggleVarAvail(v)} hitSlop={6} className="ml-2 p-1">
                    <Ionicons
                      name={v.is_available ? "eye" : "eye-off"}
                      size={18}
                      color={v.is_available ? Colors.brand : "#a8a29e"}
                    />
                  </Pressable>
                  <Pressable onPress={() => confirmRemoveVar(v)} hitSlop={6} className="ml-1 p-1">
                    <Ionicons name="trash-outline" size={17} color="#c0392b" />
                  </Pressable>
                </View>
              ))}
            </View>

            {/* Add variant */}
            <View className="mt-2 flex-row items-end gap-2">
              <View className="flex-1">
                <TextInput
                  value={newVarName}
                  onChangeText={setNewVarName}
                  placeholder="New size"
                  placeholderTextColor="#b8a99c"
                  className="rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm text-espresso"
                />
              </View>
              <View className="w-24">
                <TextInput
                  value={newVarPrice}
                  onChangeText={setNewVarPrice}
                  placeholder="₱ price"
                  placeholderTextColor="#b8a99c"
                  keyboardType="decimal-pad"
                  className="rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-sm text-espresso"
                />
              </View>
              <Pressable
                onPress={addVariant}
                className="h-11 w-11 items-center justify-center rounded-xl bg-brand-500"
              >
                <Ionicons name="add" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}

        <View className="mt-8">
          <Button label={isNew ? "Create product" : "Save changes"} onPress={saveCore} loading={saving} />
        </View>

        {!isNew ? (
          <Pressable onPress={confirmDeleteProduct} className="mt-3 items-center py-3">
            <Text className="text-sm font-semibold text-red-500">Delete product</Text>
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
        value ? "border-brand-500 bg-brand-50" : "border-brand-100 bg-white"
      }`}
    >
      <Ionicons name={icon} size={18} color={value ? Colors.brand : "#a8a29e"} />
      <Text className={`text-sm font-semibold ${value ? "text-brand-700" : "text-stone-500"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
