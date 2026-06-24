import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Button } from "@/components/ui/Button";
import { CampaignAd } from "@/components/ui/CampaignAd";
import { Field } from "@/components/ui/Field";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import {
  deleteCampaign,
  getCampaigns,
  upsertCampaign,
  type CampaignInput,
} from "@/lib/api";
import { getCampaignPreview } from "@/lib/campaignPreviewImages";
import { CAMPAIGN_PRESETS, type CampaignPreset } from "@/lib/campaignPresets";
import { humanizeError } from "@/lib/errors";
import { seasonalSwatch } from "@/theme/seasonal";
import { useSeasonalTheme } from "@/store/seasonalTheme";
import type { Campaign, CampaignFrequency } from "@/types/models";

const FREQ: CampaignFrequency[] = ["once", "once_per_day", "always"];
const FREQ_LABEL: Record<CampaignFrequency, string> = {
  once: "Once per user",
  once_per_day: "Once per day",
  always: "Every visit",
};

const BLANK: CampaignInput = {
  title: "",
  subtitle: "",
  badge: "",
  cta_label: "View",
  hero_image_url: "",
  dark_hero_image_url: "",
  priority: 0,
  frequency_rule: "once",
  is_active: true,
  preset_key: null,
};

export default function AdminCampaignsScreen() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CampaignInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const previewKey = useSeasonalTheme((s) => s.previewKey);
  const setThemePreview = useSeasonalTheme((s) => s.setPreview);
  const clearThemePreview = useSeasonalTheme((s) => s.clearPreview);
  const hydrateSeasonal = useSeasonalTheme((s) => s.hydrate);

  function selectPreset(p: CampaignPreset) {
    setEditing((e) =>
      e
        ? {
            ...e,
            preset_key: p.key,
            title: p.title,
            subtitle: p.subtitle,
            badge: p.badge,
            cta_label: p.cta,
          }
        : e,
    );
  }

  const load = useCallback(async () => {
    try {
      setItems(await getCampaigns());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Drop any on-device theme preview when leaving this screen.
      return () => clearThemePreview();
    }, [load, clearThemePreview]),
  );

  function set<K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) {
    setEditing((e) => (e ? { ...e, [key]: value } : e));
  }

  async function save() {
    if (!editing) return;
    if (!editing.preset_key && !editing.title?.trim()) {
      Alert.alert("Pick a style", "Choose a campaign preset (or enter a title) first.");
      return;
    }
    setSaving(true);
    try {
      await upsertCampaign({
        ...editing,
        title: (editing.title || "").trim() || "Cafinity",
        subtitle: editing.subtitle?.trim() || "",
        badge: editing.badge?.trim() || null,
        hero_image_url: editing.hero_image_url?.trim() || null,
        dark_hero_image_url: editing.dark_hero_image_url?.trim() || null,
        cta_label: editing.cta_label?.trim() || "View",
      });
      setEditing(null);
      await load();
      // Activating/deactivating a campaign changes the app-wide palette.
      clearThemePreview();
      await hydrateSeasonal();
    } catch (e) {
      Alert.alert("Campaign could not be saved", humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(c: Campaign) {
    Alert.alert("Delete campaign?", `Remove "${c.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteCampaign(c.id).catch(() => {});
          await load();
        },
      },
    ]);
  }

  // ---- Form ----------------------------------------------------------------
  if (editing) {
    const swatch = seasonalSwatch(editing.preset_key);
    return (
      <Screen edges={["top"]}>
        <Header
          title={editing.id ? "Edit campaign" : "New campaign"}
          onBack={() => {
            clearThemePreview();
            setEditing(null);
          }}
        />
        <ScrollView
          contentContainerClassName="p-5 pb-10"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          {/* Preset picker */}
          <Text className="mb-2 text-sm font-semibold text-textPrimary">Choose a style</Text>
          <View className="mb-4 flex-row flex-wrap gap-2">
            {CAMPAIGN_PRESETS.map((p) => {
              const active = editing.preset_key === p.key;
              const thumb = getCampaignPreview(p.key);
              return (
                <Pressable
                  key={p.key}
                  onPress={() => selectPreset(p)}
                  style={{ width: "48%" }}
                  className={`overflow-hidden rounded-card border ${
                    active ? "border-2 border-brandPrimary" : "border-line bg-surface"
                  }`}
                >
                  <View
                    className="h-20 w-full items-center justify-center overflow-hidden"
                    style={{ backgroundColor: p.bg }}
                  >
                    {thumb ? (
                      <Image source={thumb} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                    ) : (
                      <Text style={{ fontSize: 26 }}>{p.emoji}</Text>
                    )}
                    {active ? (
                      <View className="absolute right-1.5 top-1.5 h-6 w-6 items-center justify-center rounded-full bg-brandPrimary">
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                  <Text className="px-2 py-1.5 text-xs font-bold text-textPrimary" numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Theme palette preview (before activation) */}
          {editing.preset_key ? (
            <View className="mb-4 rounded-card border border-line bg-surface p-4">
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
                Theme palette
              </Text>
              <View className="flex-row items-center justify-between">
                <View className="flex-row">
                  {[swatch.hero, swatch.primary, swatch.accent, swatch.soft].map((c, i) => (
                    <View
                      key={i}
                      className="h-8 w-8 rounded-full border-2 border-surface"
                      style={{ backgroundColor: c, marginLeft: i === 0 ? 0 : -8 }}
                    />
                  ))}
                </View>
                {previewKey === editing.preset_key ? (
                  <Pressable
                    onPress={clearThemePreview}
                    className="rounded-full border border-line px-3 py-1.5"
                  >
                    <Text className="text-xs font-bold text-textPrimary">Stop preview</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => editing.preset_key && setThemePreview(editing.preset_key)}
                    className="rounded-full bg-brandPrimary px-3 py-1.5"
                  >
                    <Text className="text-xs font-bold text-white">Preview on device</Text>
                  </Pressable>
                )}
              </View>
              <Text className="mt-2 text-[11px] text-textMuted">
                Preview applies the palette on this device only. Activating the campaign applies it
                for everyone.
              </Text>
            </View>
          ) : null}

          <Field label="Title" value={editing.title ?? ""} onChangeText={(v) => set("title", v)} placeholder="Matcha Season is here" />
          <Field label="Subtitle" value={editing.subtitle ?? ""} onChangeText={(v) => set("subtitle", v)} placeholder="Limited-time flavors" multiline />
          <Field label="Badge" value={editing.badge ?? ""} onChangeText={(v) => set("badge", v)} placeholder="Seasonal" />
          <Field label="Button label" value={editing.cta_label ?? ""} onChangeText={(v) => set("cta_label", v)} placeholder="Order now" />
          <Field
            label="Priority"
            value={String(editing.priority ?? 0)}
            onChangeText={(v) => set("priority", parseInt(v, 10) || 0)}
            keyboardType="number-pad"
            placeholder="0"
          />

          <Text className="mb-2 text-sm font-semibold text-textPrimary">Frequency</Text>
          <Pressable
            onPress={() => {
              const idx = FREQ.indexOf((editing.frequency_rule as CampaignFrequency) ?? "once");
              set("frequency_rule", FREQ[(idx + 1) % FREQ.length]);
            }}
            className="mb-4 flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3"
          >
            <Text className="text-base text-textPrimary">
              {FREQ_LABEL[(editing.frequency_rule as CampaignFrequency) ?? "once"]}
            </Text>
            <Ionicons name="swap-horizontal" size={18} color={Colors.brand} />
          </Pressable>

          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-textPrimary">Active</Text>
            <Switch
              value={!!editing.is_active}
              onValueChange={(v) => set("is_active", v)}
              trackColor={{ true: Colors.brand }}
            />
          </View>

          {/* Advanced: optional custom image URLs */}
          <Pressable
            onPress={() => setAdvancedOpen((o) => !o)}
            className="mb-2 flex-row items-center justify-between py-2"
          >
            <Text className="text-sm font-semibold text-brandPrimary">Advanced customization</Text>
            <Ionicons name={advancedOpen ? "chevron-up" : "chevron-down"} size={18} color={Colors.brand} />
          </Pressable>
          {advancedOpen ? (
            <>
              <Field label="Hero image URL (light, optional)" value={editing.hero_image_url ?? ""} onChangeText={(v) => set("hero_image_url", v)} placeholder="https://…" autoCapitalize="none" />
              <Field label="Hero image URL (dark, optional)" value={editing.dark_hero_image_url ?? ""} onChangeText={(v) => set("dark_hero_image_url", v)} placeholder="https://…" autoCapitalize="none" />
              <Text className="mb-3 text-[11px] text-textMuted">
                Leave blank to use the preset banner. See docs/SEASONAL-ASSETS.md for sizes.
              </Text>
            </>
          ) : null}

          <View className="mb-2">
            <Button label="Preview" variant="outline" onPress={() => setPreview(true)} />
          </View>
          <Button label="Save campaign" onPress={save} loading={saving} />
          {editing.id ? (
            <View className="mt-2">
              <Button
                label="Delete"
                variant="outline"
                onPress={() => {
                  const c = items.find((x) => x.id === editing.id);
                  if (c) confirmDelete(c);
                }}
              />
            </View>
          ) : null}
        </ScrollView>

        {preview ? (
          <CampaignAd
            campaign={{
              id: editing.id ?? "preview",
              title: editing.title ?? "",
              subtitle: editing.subtitle ?? "",
              product_id: editing.product_id ?? null,
              hero_image_url: editing.hero_image_url || null,
              dark_hero_image_url: editing.dark_hero_image_url || null,
              badge: editing.badge || null,
              cta_label: editing.cta_label ?? "View",
              starts_at: null,
              ends_at: null,
              priority: editing.priority ?? 0,
              frequency_rule: (editing.frequency_rule as CampaignFrequency) ?? "once",
              is_active: !!editing.is_active,
              preset_key: editing.preset_key ?? null,
              created_at: "",
            }}
            onDismiss={() => setPreview(false)}
            onCta={() => setPreview(false)}
          />
        ) : null}
      </Screen>
    );
  }

  // ---- List ----------------------------------------------------------------
  return (
    <Screen edges={["top"]}>
      <Header
        title="Campaigns"
        right={
          <Pressable onPress={() => setEditing({ ...BLANK })} hitSlop={8} accessibilityLabel="New campaign">
            <Ionicons name="add" size={24} color={Colors.brand} />
          </Pressable>
        }
      />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : (
        <ScrollView contentContainerClassName="p-4 gap-2" showsVerticalScrollIndicator={false}>
          {items.length === 0 ? (
            <View className="mt-10 items-center px-8">
              <Ionicons name="megaphone-outline" size={32} color={Colors.textMuted} />
              <Text className="mt-2 text-center text-sm text-textSecondary">
                No campaigns yet. Tap + to create one.
              </Text>
            </View>
          ) : (
            items.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setEditing({ ...c })}
                className="flex-row items-center rounded-card border border-line bg-surface p-4"
              >
                <View className="flex-1 pr-2">
                  <Text className="text-base font-bold text-textPrimary" numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text className="text-xs text-textMuted">
                    {FREQ_LABEL[c.frequency_rule]} · priority {c.priority}
                  </Text>
                </View>
                <View
                  className={`rounded-full px-2.5 py-1 ${c.is_active ? "bg-green-100" : "bg-stone-200"}`}
                >
                  <Text
                    className={`text-xs font-semibold ${c.is_active ? "text-green-700" : "text-stone-600"}`}
                  >
                    {c.is_active ? "Active" : "Off"}
                  </Text>
                </View>
                <View className="ml-2">
                  <Ionicons name="chevron-forward" size={18} color="#C9A47C" />
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
