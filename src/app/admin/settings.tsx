import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { BranchPickerSheet, BranchSelectorField } from "@/components/ui/BranchSelector";
import { Field } from "@/components/ui/Field";
import { Header } from "@/components/ui/Header";
import { Screen } from "@/components/ui/Screen";
import { Colors } from "@/constants/theme";
import {
  getAdminSettings,
  getBranchesAdmin,
  getSettingsAudit,
  updateAppSettings,
  updateBranchEta,
} from "@/lib/api";
import { humanizeError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import type { AdminSettings, Branch, SettingsAuditRow } from "@/types/models";

const CANCEL_POLICIES: AdminSettings["cancellation_policy"][] = [
  "until_preparing",
  "within_n_minutes",
  "disabled",
];
const CANCEL_LABEL: Record<AdminSettings["cancellation_policy"], string> = {
  until_preparing: "Until preparing starts",
  within_n_minutes: "Within N minutes",
  disabled: "Disabled",
};

export default function AdminSettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [original, setOriginal] = useState<AdminSettings | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchSheet, setBranchSheet] = useState(false);
  const [audit, setAudit] = useState<SettingsAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEta, setSavingEta] = useState(false);

  const reloadAudit = useCallback(() => {
    getSettingsAudit().then(setAudit).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([getAdminSettings(), getBranchesAdmin()])
      .then(([s, b]) => {
        setSettings(s);
        setOriginal(s);
        setBranches(b);
        if (b.length) setBranchId(b[0].id);
      })
      .catch((e) => Alert.alert("Could not load settings", humanizeError(e)))
      .finally(() => setLoading(false));
    reloadAudit();
  }, [reloadAudit]);

  function set<K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await updateAppSettings(settings);
      setOriginal(settings); // changes committed → no longer dirty
      haptics.success();
      reloadAudit();
      Alert.alert("Saved", "Settings updated.");
    } catch (e) {
      Alert.alert("Could not save", humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  // Dirty = app_settings edited since load/save (branch ETA has its own save).
  const dirty =
    !!settings && !!original && JSON.stringify(settings) !== JSON.stringify(original);

  // Warn before leaving with unsaved app-settings changes.
  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e: any) => {
      if (!dirty) return;
      e.preventDefault();
      Alert.alert("Discard changes?", "You have unsaved settings changes.", [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });
    return unsub;
  }, [navigation, dirty]);

  const branch = branches.find((b) => b.id === branchId) ?? null;
  function setBranchField(patch: Partial<Branch>) {
    setBranches((prev) => prev.map((b) => (b.id === branchId ? { ...b, ...patch } : b)));
  }

  async function saveEta() {
    if (!branch) return;
    setSavingEta(true);
    try {
      await updateBranchEta(branch.id, {
        eta_enabled: branch.eta_enabled,
        base_prep_minutes: branch.base_prep_minutes,
        avg_minutes_per_item: branch.avg_minutes_per_item,
        active_staff_capacity: branch.active_staff_capacity,
        max_eta_minutes: branch.max_eta_minutes,
      });
      haptics.success();
      reloadAudit();
      Alert.alert("Saved", `ETA settings updated for ${branch.name}.`);
    } catch (e) {
      Alert.alert("Could not save", humanizeError(e));
    } finally {
      setSavingEta(false);
    }
  }

  if (loading || !settings) {
    return (
      <Screen edges={["top"]}>
        <Header title="Settings" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top"]}>
      <Header title="Settings" />
      <ScrollView
        contentContainerClassName="p-5 pb-28"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Group
          icon="pricetags-outline"
          title="Pricing & Taxes"
          defaultOpen
          summary={`${settings.business_is_vat_registered ? "VAT registered" : "Not VAT-registered"} · ${Math.round(settings.vat_rate * 1000) / 10}% VAT`}
        >
        <SwitchRow
          label="VAT-registered business"
          value={settings.business_is_vat_registered}
          onChange={(v) => set("business_is_vat_registered", v)}
        />
        <NumberRow
          label="VAT rate (%)"
          value={Math.round(settings.vat_rate * 1000) / 10}
          onChange={(n) => set("vat_rate", n / 100)}
        />
        <SwitchRow
          label="Menu prices include VAT"
          value={settings.prices_are_vat_inclusive}
          onChange={(v) => set("prices_are_vat_inclusive", v)}
        />
        <SwitchRow
          label="Show VAT in breakdown"
          value={settings.show_vat_breakdown}
          onChange={(v) => set("show_vat_breakdown", v)}
        />

        </Group>

        <Group
          icon="cash-outline"
          title="Fees & Tipping"
          summary={`Service fee ${settings.service_fee_enabled ? "on" : "off"} · Tipping ${settings.tipping_enabled ? "on" : "off"}`}
        >
        <SwitchRow
          label="Enable service fee"
          value={settings.service_fee_enabled}
          onChange={(v) => set("service_fee_enabled", v)}
        />
        {settings.service_fee_enabled ? (
          <>
            <CycleRow
              label="Fee type"
              value={settings.service_fee_type === "fixed" ? "Fixed ₱" : "Percentage %"}
              onPress={() =>
                set("service_fee_type", settings.service_fee_type === "fixed" ? "percentage" : "fixed")
              }
            />
            <NumberRow
              label={settings.service_fee_type === "fixed" ? "Amount (₱)" : "Percent (%)"}
              value={settings.service_fee_value}
              onChange={(n) => set("service_fee_value", n)}
            />
            <NumberRow
              label="Minimum order (₱)"
              value={settings.service_fee_min_order}
              onChange={(n) => set("service_fee_min_order", n)}
            />
            <SwitchRow
              label="Applies to pickup"
              value={settings.service_fee_applies_pickup}
              onChange={(v) => set("service_fee_applies_pickup", v)}
            />
            <SwitchRow
              label="Service fee is taxable"
              value={settings.service_fee_taxable}
              onChange={(v) => set("service_fee_taxable", v)}
            />
          </>
        ) : null}

        <SwitchRow
          label="Allow tipping"
          value={settings.tipping_enabled}
          onChange={(v) => set("tipping_enabled", v)}
        />
        </Group>

        <Group
          icon="gift-outline"
          title="Loyalty & Rewards"
          summary={`${settings.loyalty_points_awarded} pt${settings.loyalty_points_awarded === 1 ? "" : "s"} / ₱${settings.loyalty_spend_unit.toFixed(2)}`}
        >
        <NumberRow
          label="Points awarded"
          value={settings.loyalty_points_awarded}
          onChange={(n) => set("loyalty_points_awarded", Math.max(1, Math.floor(n || 1)))}
        />
        <NumberRow
          label="For every ₱ spent"
          value={settings.loyalty_spend_unit}
          onChange={(n) => set("loyalty_spend_unit", n > 0 ? n : 1)}
        />
        <View className="mt-1 rounded-xl bg-accent-100 px-3 py-2">
          <Text className="text-xs font-medium text-textPrimary">
            Customers earn {settings.loyalty_points_awarded} point
            {settings.loyalty_points_awarded === 1 ? "" : "s"} for every ₱
            {settings.loyalty_spend_unit.toFixed(2)} of eligible spending.
          </Text>
          <Text className="mt-0.5 text-[11px] text-textMuted">
            Tips and refunds are excluded. Points are calculated on the server when an order completes.
          </Text>
        </View>

        </Group>

        <Group
          icon="ban-outline"
          title="Discounts & Cancellations"
          summary={CANCEL_LABEL[settings.cancellation_policy]}
        >
        <View className="mb-3 rounded-xl bg-surfaceMuted px-3 py-2">
          <Text className="text-xs text-textSecondary">
            Discount stacking: one benefit per order (a promo, a voucher, or a statutory discount —
            never combined). This rule is fixed.
          </Text>
        </View>
        <CycleRow
          label="Customer cancellation"
          value={CANCEL_LABEL[settings.cancellation_policy]}
          onPress={() => {
            const i = CANCEL_POLICIES.indexOf(settings.cancellation_policy);
            set("cancellation_policy", CANCEL_POLICIES[(i + 1) % CANCEL_POLICIES.length]);
          }}
        />
        {settings.cancellation_policy === "within_n_minutes" ? (
          <NumberRow
            label="Window (minutes)"
            value={settings.cancellation_window_minutes}
            onChange={(n) => set("cancellation_window_minutes", n)}
          />
        ) : null}
        <SwitchRow
          label="Require a cancellation reason"
          value={settings.cancellation_reason_required}
          onChange={(v) => set("cancellation_reason_required", v)}
        />

        </Group>

        <Group
          icon="time-outline"
          title="Branch & Preparation Time"
          summary={branch ? `${branch.name} · base ${branch.base_prep_minutes ?? 5} min` : "Per-branch ETA"}
        >
        <View className="mb-3">
          <BranchSelectorField
            branch={branches.find((b) => b.id === branchId) ?? null}
            label="Editing branch"
            onPress={() => setBranchSheet(true)}
          />
        </View>
        <BranchPickerSheet
          visible={branchSheet}
          branches={branches}
          selectedId={branchId}
          onSelect={(id) => id && setBranchId(id)}
          onClose={() => setBranchSheet(false)}
        />
        {branch ? (
          <>
            <SwitchRow
              label="Show ETA to customers"
              value={branch.eta_enabled ?? true}
              onChange={(v) => setBranchField({ eta_enabled: v })}
            />
            <NumberRow
              label="Base prep minutes"
              value={branch.base_prep_minutes ?? 5}
              onChange={(n) => setBranchField({ base_prep_minutes: n })}
            />
            <NumberRow
              label="Minutes per item"
              value={branch.avg_minutes_per_item ?? 2}
              onChange={(n) => setBranchField({ avg_minutes_per_item: n })}
            />
            <NumberRow
              label="Active staff capacity"
              value={branch.active_staff_capacity ?? 1}
              onChange={(n) => setBranchField({ active_staff_capacity: Math.max(1, Math.round(n)) })}
            />
            <NumberRow
              label="Max ETA minutes"
              value={branch.max_eta_minutes ?? 45}
              onChange={(n) => setBranchField({ max_eta_minutes: n })}
            />
            <View className="mt-2">
              <SaveButton label={`Save ETA for ${branch.name}`} onPress={saveEta} loading={savingEta} />
            </View>
          </>
        ) : null}

        </Group>

        <Group icon="construct-outline" title="Advanced" summary="Developer tools & change history">
          <Pressable
            onPress={() => router.push("/admin/preview-loading")}
            className="mb-2 flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3"
          >
            <Text className="text-sm text-textPrimary">Preview loading screen</Text>
            <Ionicons name="play-circle-outline" size={20} color={Colors.brand} />
          </Pressable>

          {audit.length > 0 ? (
            <>
              <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-textMuted">
                Recent changes
              </Text>
              <View className="rounded-card border border-line bg-surface">
                {audit.map((a, i) => (
                  <View key={a.id} className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                    <Text className="text-sm font-medium text-textPrimary">{a.setting}</Text>
                    <Text className="text-xs text-textMuted">
                      {a.old_value ?? "—"} → {a.new_value ?? "—"} · {formatDateTime(a.changed_at)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </Group>
      </ScrollView>

      {/* Sticky save — only when there are unsaved app-settings changes */}
      {dirty ? (
        <View
          style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
          className="flex-row gap-3 border-t border-line bg-surface px-5 pb-6 pt-3"
        >
          <Pressable
            onPress={() => setSettings(original)}
            accessibilityRole="button"
            className="flex-1 items-center justify-center rounded-2xl border border-line bg-surface py-4"
          >
            <Text className="text-sm font-bold text-textSecondary">Discard</Text>
          </Pressable>
          <View className="flex-[2]">
            <SaveButton label="Save changes" onPress={save} loading={saving} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function Group({
  icon,
  title,
  summary,
  defaultOpen,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <View className="mb-3 overflow-hidden rounded-card border border-line bg-surface">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${summary ? `, ${summary}` : ""}`}
        className="flex-row items-center gap-3 px-4 py-3.5"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-100">
          <Ionicons name={icon} size={18} color={Colors.brand} />
        </View>
        <View className="flex-1">
          <Text className="font-heading text-sm text-textPrimary">{title}</Text>
          {summary ? (
            <Text className="text-xs text-textMuted" numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
      </Pressable>
      {open ? <View className="border-t border-line px-4 pb-3 pt-3">{children}</View> : null}
    </View>
  );
}

function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="mb-2 flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
      <Text className="flex-1 pr-3 text-sm text-textPrimary">{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.brand }} />
    </View>
  );
}

function CycleRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3"
    >
      <Text className="text-sm text-textPrimary">{label}</Text>
      <Text className="text-sm font-semibold text-brandPrimary">{value} ⇄</Text>
    </Pressable>
  );
}

function NumberRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field
      label={label}
      value={String(value)}
      onChangeText={(t) => onChange(parseFloat(t.replace(/[^0-9.]/g, "")) || 0)}
      keyboardType="decimal-pad"
      containerClassName="mb-2"
    />
  );
}

function SaveButton({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className={`items-center rounded-2xl bg-brandPrimary py-4 ${loading ? "opacity-60" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className="text-base font-bold text-white">{label}</Text>
      )}
    </Pressable>
  );
}
