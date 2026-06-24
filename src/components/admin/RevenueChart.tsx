import { Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { Colors } from "@/constants/theme";

export interface ChartBucket {
  /** Axis label under the bar, e.g. "Mo". */
  label: string;
  /** Revenue value for the bucket. */
  value: number;
  /** Emphasised bar (e.g. today). */
  highlight?: boolean;
}

/**
 * Lightweight SVG bar chart (react-native-svg). Stretches to fill its parent
 * width via a non-uniform viewBox; no measuring needed. Bars are normalised to
 * the largest bucket so an empty period still renders a flat baseline.
 */
export function RevenueChart({ data, height = 120 }: { data: ChartBucket[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const VBW = 100;
  const VBH = 56;
  const gap = 2.4;
  const n = Math.max(1, data.length);
  const bw = (VBW - gap * (n - 1)) / n;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const h = Math.max(1.5, (d.value / max) * VBH);
          const x = i * (bw + gap);
          return (
            <Rect
              key={i}
              x={x}
              y={VBH - h}
              width={bw}
              height={h}
              rx={1}
              fill={d.highlight ? Colors.caramel : Colors.brandLight}
            />
          );
        })}
      </Svg>
      <View className="mt-1.5 flex-row">
        {data.map((d, i) => (
          <Text
            key={i}
            className={`flex-1 text-center text-[10px] ${
              d.highlight ? "font-bold text-brandPrimary" : "text-textMuted"
            }`}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
