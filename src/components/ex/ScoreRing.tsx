import { motion } from "framer-motion";

export function ScoreRing({
  score,
  size = 140,
  max = 100,
  color = "var(--accent)",
  trackColor = "rgba(247,245,240,0.12)",
  label,
}: {
  score: number;
  size?: number;
  max?: number;
  color?: string;
  trackColor?: string;
  label?: string;
}) {
  const stroke = size > 120 ? 8 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(score / max, 1));

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display" style={{ color, fontSize: size * 0.36, lineHeight: 1, fontWeight: 500 }}>
          {score}
        </div>
        {label && <div className="label-caps-dark mt-1" style={{ fontSize: 10 }}>{label}</div>}
      </div>
    </div>
  );
}
