// Validation d'intégrité d'un modèle académique (qualité #11).
// Vérifie : structure minimale, absence de doublons de matières par classe,
// coefficients valides, composantes bien formées. Pur, sans effet de bord.

export function validateTemplate(t) {
  const errors = [];
  if (!t || typeof t !== 'object') return { ok: false, errors: ['Modèle manquant'] };
  if (!t.id)            errors.push('id manquant');
  if (!t.country)       errors.push('country manquant');
  if (!Array.isArray(t.classes) || t.classes.length === 0) errors.push('aucune classe');

  const classNames = new Set();
  for (const c of t.classes || []) {
    if (!c?.name) { errors.push('classe sans nom'); continue; }
    if (classNames.has(c.name)) errors.push(`classe en double : ${c.name}`);
    classNames.add(c.name);

    const subNames = new Set();
    for (const s of c.subjects || []) {
      if (!s?.name) { errors.push(`matière sans nom (${c.name})`); continue; }
      const key = s.name.toLowerCase();
      if (subNames.has(key)) errors.push(`matière en double "${s.name}" dans ${c.name}`);
      subNames.add(key);
      if (!(Number(s.coef) > 0)) errors.push(`coefficient invalide "${s.name}" dans ${c.name}`);
      if (s.components) {
        const compNames = new Set();
        for (const comp of s.components) {
          if (!comp?.name) { errors.push(`composante sans nom (${c.name} / ${s.name})`); continue; }
          const ck = comp.name.toLowerCase();
          if (compNames.has(ck)) errors.push(`composante en double "${comp.name}" (${c.name}/${s.name})`);
          compNames.add(ck);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
