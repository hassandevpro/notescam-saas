// Géométrie SVG PURE pour les graphiques maison (donut, jauge). Aucune dépendance.
// Angles en degrés, 0° = haut (12h), sens horaire.

export function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Arc simple (ligne) entre deux angles sur un cercle de rayon r.
export function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = polar(cx, cy, r, endDeg);
  const e = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? '0' : '1';
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

// Segment ANNULAIRE (donut) : couronne entre rInner et rOuter.
export function donutSegment(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const so = polar(cx, cy, rOuter, endDeg);
  const eo = polar(cx, cy, rOuter, startDeg);
  const si = polar(cx, cy, rInner, startDeg);
  const ei = polar(cx, cy, rInner, endDeg);
  const large = endDeg - startDeg <= 180 ? '0' : '1';
  return [
    `M ${so.x} ${so.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${eo.x} ${eo.y}`,
    `L ${si.x} ${si.y}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${ei.x} ${ei.y}`,
    'Z',
  ].join(' ');
}

// Répartit des valeurs en segments angulaires cumulés sur `sweep` degrés (360 = cercle).
export function segments(values = [], sweep = 360, startAt = 0) {
  const total = values.reduce((s, v) => s + (Number(v) || 0), 0);
  let cur = startAt;
  return values.map((v) => {
    const frac = total > 0 ? (Number(v) || 0) / total : 0;
    const start = cur;
    const end = cur + frac * sweep;
    cur = end;
    return { start, end, frac };
  });
}
