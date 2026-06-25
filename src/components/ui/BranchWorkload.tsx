import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Colors } from "@/constants/theme";
import { getBranchWorkload, type BranchWorkload as Workload } from "@/lib/api";

const LEVEL = {
  quiet: { label: "Quiet", color: Colors.success },
  moderate: { label: "Moderate", color: Colors.warning },
  busy: { label: "Busy", color: Colors.danger },
} as const;

/**
 * Compact live busyness pill for a branch: a colored dot + level, with an
 * optional current wait estimate. Renders nothing until data loads or if the
 * branch_workload RPC isn't available yet (graceful — never blocks the UI).
 */
export function BranchWorkload({
  branchId,
  showWait = true,
}: {
  branchId: string;
  showWait?: boolean;
}) {
  const [wl, setWl] = useState<Workload | null>(null);

  useEffect(() => {
    let alive = true;
    setWl(null);
    getBranchWorkload(branchId)
      .then((w) => {
        if (alive) setWl(w);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [branchId]);

  if (!wl) return null;
  const meta = LEVEL[wl.level];
  const wait =
    showWait && wl.etaEnabled && wl.waitMin != null
      ? ` · ~${wl.waitMin}${wl.waitMax && wl.waitMax !== wl.waitMin ? `–${wl.waitMax}` : ""} min`
      : "";

  return (
    <View
      className="flex-row items-center gap-1.5"
      accessibilityLabel={`${meta.label}${wait ? `, ${wait.replace(" · ", "")}` : ""}`}
    >
      <View style={{ backgroundColor: meta.color }} className="h-2 w-2 rounded-full" />
      <Text className="text-xs font-medium text-textSecondary">
        {meta.label}
        {wait}
      </Text>
    </View>
  );
}
