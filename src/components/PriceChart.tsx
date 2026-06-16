"use client";

type Series = { label: string; points: { date: string; value: number }[] };

const COLORS = [
  "#237454",
  "#1d6fb8",
  "#c4763a",
  "#8e44ad",
  "#c0392b",
  "#16a085",
  "#d4ac0d",
  "#2c3e50",
  "#e85d04",
  "#7f8c8d",
];

export default function PriceChart({ series }: { series: Series[] }) {
  const W = 720;
  const H = 320;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 36;

  const allDates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const allValues = series.flatMap((s) => s.points.map((p) => p.value));

  if (allDates.length === 0 || allValues.length === 0) {
    return <div className="empty">No price data yet for this product.</div>;
  }

  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const pad = (maxV - minV) * 0.08 || maxV * 0.08 || 1;
  const lo = Math.max(0, minV - pad);
  const hi = maxV + pad;

  const xFor = (date: string) => {
    if (allDates.length === 1) return padL + (W - padL - padR) / 2;
    const i = allDates.indexOf(date);
    return padL + (i / (allDates.length - 1)) * (W - padL - padR);
  };
  const yFor = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);

  const ticks = 5;
  const gridY = Array.from({ length: ticks }, (_, i) => lo + (i / (ticks - 1)) * (hi - lo));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {/* grid + y labels */}
        {gridY.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#edf0f2" />
              <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#9aa6ae">
                €{v.toFixed(0)}
              </text>
            </g>
          );
        })}
        {/* x labels */}
        {allDates.map((d) => (
          <text key={d} x={xFor(d)} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#9aa6ae">
            {d.slice(5)}
          </text>
        ))}
        {/* series */}
        {series.map((s, si) => {
          const color = COLORS[si % COLORS.length];
          const pts = s.points;
          const path = pts
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.date).toFixed(1)} ${yFor(p.value).toFixed(1)}`)
            .join(" ");
          return (
            <g key={si}>
              {pts.length > 1 ? <path d={path} fill="none" stroke={color} strokeWidth="2" /> : null}
              {pts.map((p, i) => (
                <circle key={i} cx={xFor(p.date)} cy={yFor(p.value)} r="3" fill={color}>
                  <title>
                    {s.label} · {p.date} · €{p.value.toFixed(2)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
        {series.map((s, si) => (
          <span key={si} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#40505b" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: COLORS[si % COLORS.length],
                display: "inline-block",
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
