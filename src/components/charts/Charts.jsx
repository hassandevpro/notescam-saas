// Graphiques SVG maison (aucune dépendance). Géométrie : lib/charts/svgArc.
import { segments, donutSegment, polar } from '../../lib/charts/svgArc';

// Donut à segments. data = [{ label, value, color }].
export function Donut({ data = [], size = 140, thickness = 22, center, sub }) {
  const cx = size / 2, cy = size / 2, rOuter = size / 2 - 2, rInner = rOuter - thickness;
  const vals = data.map((d) => d.value);
  const segs = segments(vals, 359.999);
  const total = vals.reduce((s, v) => s + (Number(v) || 0), 0);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {total === 0 && <circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />}
        {segs.map((s, i) => s.frac > 0 && (
          <path key={i} d={donutSegment(cx, cy, rOuter, rInner, s.start, s.end)} fill={data[i].color} className="transition-all" />
        ))}
      </svg>
      {(center || sub) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
          {center && <div className="text-lg font-bold text-gray-900">{center}</div>}
          {sub && <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{sub}</div>}
        </div>
      )}
    </div>
  );
}

// Jauge radiale (anneau de progression) pour un pourcentage.
export function RadialGauge({ value = 0, size = 140, thickness = 12, color = '#6366f1', track = '#eef2ff', label }) {
  const r = size / 2 - thickness;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const danger = value > 100;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={danger ? '#f43f5e' : color} strokeWidth={thickness}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-2xl font-bold ${danger ? 'text-rose-600' : 'text-gray-900'}`}>{Math.round(value)}%</div>
        {label && <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</div>}
      </div>
    </div>
  );
}

// Légende compacte pour un donut.
export function Legend({ data = [], format = (v) => v }) {
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
          <span className="text-gray-600 flex-1">{d.label}</span>
          <span className="font-semibold text-gray-800 tabular-nums">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Barre de progression fine avec repère (double : réalisé vs référence).
export function ProgressBar({ value = 0, marker, color = 'bg-indigo-500', danger }) {
  return (
    <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${danger ? 'bg-rose-500' : color}`} style={{ width: `${Math.min(100, value)}%` }} />
      {marker != null && <div className="absolute inset-y-0 w-0.5 bg-gray-800/70" style={{ left: `${Math.min(100, marker)}%` }} />}
    </div>
  );
}
