import Svg, { Ellipse, Path } from "react-native-svg";

interface CoffeeCupProps {
  size?: number;
  onDark?: boolean;
  /** Accent tint for the steam (follows the active seasonal theme). */
  tint?: string;
}

/** Original Cafinity coffee-cup mark (vector, no external assets). */
export function CoffeeCup({ size = 160, onDark = false, tint }: CoffeeCupProps) {
  const cup = onDark ? "#FBF6EF" : "#FFFFFF";
  const coffee = "#6A3E22";
  const steam = tint ?? "#E08A2B";
  const shadow = onDark ? "#000000" : "#4E2D18";

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* steam */}
      <Path
        d="M48 40 C43 33 53 29 48 21 C45 15 51 12 48 7"
        stroke={steam}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.7}
      />
      <Path
        d="M60 40 C55 32 65 28 60 19 C57 13 63 11 60 6"
        stroke={steam}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.55}
      />
      <Path
        d="M72 40 C67 33 77 29 72 21 C69 15 75 12 72 8"
        stroke={steam}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.45}
      />
      {/* saucer shadow */}
      <Ellipse cx={60} cy={104} rx={42} ry={8} fill={shadow} opacity={0.16} />
      {/* cup body */}
      <Path
        d="M30 46 L90 46 L84 92 Q82 100 72 100 L48 100 Q38 100 36 92 Z"
        fill={cup}
      />
      {/* handle */}
      <Path
        d="M90 54 Q108 56 105 72 Q102 86 86 84"
        stroke={cup}
        strokeWidth={8}
        strokeLinecap="round"
        fill="none"
      />
      {/* coffee surface */}
      <Ellipse cx={60} cy={48} rx={29} ry={7} fill={coffee} />
    </Svg>
  );
}
