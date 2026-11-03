// Synthèse du budget annuel pour l'écran Budgets — fonctions PURES.
//
// L'écran affichait « Disponible = enveloppe − engagé » : 116 M annoncés alors
// qu'aucune ligne n'était active et qu'aucune dépense n'était possible. Ici on
// sépare ce qui est RÉPARTI (lignes saisies), ACTIVÉ (lignes engageables) et
// DÉPENSABLE (ce qui reste sur les lignes actives).
//
// Ce module ne recalcule aucune règle budgétaire : il additionne les chiffres
// que `computeBudget` (budgetLinesEngine) a déjà produits. Le serveur reste
// l'autorité (budgetGuard).

// Aplatit l'arbre rubriques → lignes de `computeBudget(...).tree`.
export function flattenLines(tree = [], parentLabel = null, parentId = null) {
  const out = [];
  for (const node of tree) {
    if (node.isLine) out.push({ ...node, parentLabel, parentId });
    if (node.children?.length) {
      out.push(...(node.isLine ? flattenLines(node.children, parentLabel, parentId) : flattenLines(node.children, node.label, node.id)));
    }
  }
  return out;
}

const num = (v) => Number(v) || 0;

export function summarizeBudget({ envelope = 0, tree = [] } = {}) {
  const lines = flattenLines(tree);
  const reparti = lines.reduce((s, l) => s + num(l.consumption?.ceiling), 0);
  const actives = lines.filter((l) => l.status === 'active');
  const activeAmount = actives.reduce((s, l) => s + num(l.consumption?.ceiling), 0);
  // Une ligne en dépassement ne « rend » pas de disponible négatif aux autres.
  const spendable = actives.reduce((s, l) => s + Math.max(0, num(l.consumption?.available)), 0);
  const env = num(envelope);
  const overBy = Math.max(0, reparti - env);
  return {
    envelope: env,
    reparti,
    overBy,
    activeAmount,
    spendable,
    lineCount: lines.length,
    activeCount: actives.length,
    // Les plus grosses lignes, pour trouver ce qui fait déborder (voir topLines).
    lines,
  };
}

// Les `n` plus grosses lignes par montant annuel (ordre décroissant, stable).
export function topLines(summary, n = 3) {
  return [...(summary?.lines || [])]
    .map((l, i) => ({ id: l.id, label: l.label, parentLabel: l.parentLabel, amount: num(l.consumption?.ceiling), status: l.status, i }))
    .sort((a, b) => b.amount - a.amount || a.i - b.i)
    .slice(0, n);
}

// Géométrie d'une barre « valeur / enveloppe » — pure, pour que le repère à 100 %
// et la part en dépassement se dessinent à l'échelle. Si la valeur dépasse
// l'enveloppe, l'échelle s'étire jusqu'à la valeur : le repère de l'enveloppe recule
// et la part en trop est dessinée à part (hachurée, avec un libellé à l'écran).
export function barGeometry(value, envelope) {
  const v = Math.max(0, num(value));
  const e = Math.max(0, num(envelope));
  const max = Math.max(v, e);
  if (max <= 0) return { fillPct: 0, overPct: 0, markerPct: 100, rate: 0, over: 0 };
  return {
    fillPct: (Math.min(v, e) / max) * 100,
    overPct: (Math.max(0, v - e) / max) * 100,
    markerPct: (e / max) * 100,
    rate: e > 0 ? Math.round((v / e) * 100) : 0,
    over: Math.max(0, v - e),
  };
}
