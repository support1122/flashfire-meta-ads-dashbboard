"use client";

export function SparklineBar({ data }: { data: number[] }) {
  if (!data || data.length === 0) {
    return <div className="w-20 h-8 flex items-center justify-center text-[10px] text-[var(--text-muted)]">—</div>;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;

  const width = 80;
  const height = 28;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const areaD = `M ${pad},${height - pad} L ${points.join(" L ")} L ${width - pad},${height - pad} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={areaD} fill="var(--accent)" fillOpacity={0.12} />
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* last point dot */}
      {points.length > 0 && (() => {
        const last = points[points.length - 1].split(",");
        return <circle cx={last[0]} cy={last[1]} r={2} fill="var(--accent)" />;
      })()}
    </svg>
  );
}
