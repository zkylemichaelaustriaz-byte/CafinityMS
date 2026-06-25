import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { Colors } from "@/constants/theme";

export interface ChartPoint {
  /** X-axis label, e.g. "Mo" or "9a". */
  label: string;
  /** Numeric value driving the bar/line height. */
  value: number;
  /** Full readout shown when the point is selected, e.g. "₱1,850 · 8 orders". */
  readout: string;
  /** Emphasised point (e.g. current bucket). */
  highlight?: boolean;
}

const VBW = 100;
const VBH = 56;

/**
 * Phone-sized analytics chart (react-native-svg, no chart dependency).
 * - kind="area": smooth-ish revenue trend with a soft gradient fill + dots.
 * - kind="bars": rounded order-volume bars; selected bar accented, others muted.
 * Horizontal grid lines, a currency/value readout on tap (defaults to the
 * highlighted point), campaign-accent series, and a zero-data state.
 */
export function AnalyticsChart({
  data,
  kind,
  height = 132,
  accessibilityLabel,
}: {
  data: ChartPoint[];
  kind: "area" | "bars";
  height?: number;
  accessibilityLabel?: string;
}) {
  const n = Math.max(1, data.length);
  const highlightedIdx = Math.max(0, data.findIndex((d) => d.highlight));
  const [selected, setSelected] = useState(highlightedIdx);
  useEffect(() => setSelected(highlightedIdx), [highlightedIdx]);

  const max = Math.max(1, ...data.map((d) => d.value));
  const sel = data[Math.min(selected, n - 1)];
  const scaleY = (v: number) => VBH - (v / max) * VBH * 0.88; // 12% headroom

  // Area geometry
  const xAt = (i: number) => (n === 1 ? VBW / 2 : (i / (n - 1)) * VBW);
  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${scaleY(d.value)}`).join(" ");
  const areaPath = `${linePath} L ${xAt(n - 1)} ${VBH} L ${xAt(0)} ${VBH} Z`;

  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      {/* Readout */}
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text className="text-sm font-bold text-textPrimary">{sel?.label}</Text>
        <Text className="text-xs font-semibold text-brandPrimary">{sel?.readout}</Text>
      </View>

      <Svg width="100%" height={height} viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Colors.accent} stopOpacity={0.32} />
            <Stop offset="1" stopColor={Colors.accent} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <Line key={f} x1={0} y1={VBH * f} x2={VBW} y2={VBH * f} stroke={Colors.border} strokeWidth={0.4} />
        ))}

        {kind === "area" ? (
          <>
            <Path d={areaPath} fill="url(#areaFill)" />
            <Path d={linePath} stroke={Colors.accent} strokeWidth={1.4} fill="none" />
            {data.map((d, i) => (
              <Circle
                key={i}
                cx={xAt(i)}
                cy={scaleY(d.value)}
                r={i === selected ? 2.1 : 1.1}
                fill={i === selected ? Colors.brand : Colors.accent}
              />
            ))}
          </>
        ) : (
          data.map((d, i) => {
            const gap = 2.4;
            const bw = (VBW - gap * (n - 1)) / n;
            const h = Math.max(1.5, (d.value / max) * VBH * 0.88);
            const x = i * (bw + gap);
            return (
              <Rect
                key={i}
                x={x}
                y={VBH - h}
                width={bw}
                height={h}
                rx={1.6}
                fill={i === selected ? Colors.accent : Colors.brandLight}
              />
            );
          })
        )}
      </Svg>

      {/* Tappable X-axis labels */}
      <View className="mt-1.5 flex-row">
        {data.map((d, i) => (
          <Pressable
            key={i}
            onPress={() => setSelected(i)}
            accessibilityRole="button"
            accessibilityLabel={`${d.label}, ${d.readout}`}
            className="flex-1 items-center"
          >
            <Text
              className={`text-[10px] ${i === selected ? "font-bold text-brandPrimary" : "text-textMuted"}`}
            >
              {d.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
