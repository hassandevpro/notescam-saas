// COPIER LES MATIÈRES D'UNE CLASSE VERS UNE AUTRE (CM1 A → CM1 B, CM1 → CM2).
//
// Règle pure : elle dit QUOI créer, jamais elle n'écrit. Ce qui est copié : nom, coefficient, barème, mode
// de calcul et formule. Ce qui ne l'est JAMAIS : les notes, l'enseignant affecté (c'est un choix propre à
// chaque classe), l'identifiant. Une matière qui existe déjà dans la cible (même nom, sans tenir compte de la
// casse ni des accents) est SAUTÉE : copier deux fois ne crée aucun doublon, et une matière déjà réglée dans
// la cible n'est jamais écrasée.
//
// MATIÈRES COMPOSITES. Une matière « parente » dont la note se calcule à partir de ses sous-composantes
// (`parent_id`) est copiée avec ses enfants, liés à la COPIE du parent — jamais à la matière de la classe
// source. Si le parent existe déjà dans la cible, les enfants manquants s'y rattachent.

export const cleNom = (s) => String(s || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * @param source  matières de la classe source, DANS L'ORDRE d'affichage
 * @param cible   matières déjà présentes dans la classe cible
 * @returns {{ aCreer: Array, sautees: string[] }}
 *   aCreer : [{ cle, name, coef, max, calc_method, formula, position, parentCle|null, parentIdCible|null }]
 *            parents AVANT enfants. `parentCle` = cle d'un élément de aCreer ; `parentIdCible` = id d'un
 *            parent déjà présent dans la cible.
 */
export function planCopie(source, cible) {
  const dejaLa = new Map((cible || []).map((s) => [cleNom(s.name), s]));
  const parNom = new Map((source || []).map((s) => [s.id, s]));
  const derniere = Math.max(-1, ...(cible || []).map((s) => (Number.isFinite(s.position) ? s.position : -1)));
  const sautees = [];
  const aCreer = [];
  const cleDe = new Map();              // id source → clé créée
  let pos = derniere + 1;

  const parentsDabord = [...(source || [])].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
  for (const s of parentsDabord) {
    const k = cleNom(s.name);
    if (!k) continue;
    if (dejaLa.has(k)) { sautees.push(s.name); continue; }
    if (aCreer.some((x) => x.cle === k)) { sautees.push(s.name); continue; }   // doublon dans la source
    const parent = s.parent_id ? parNom.get(s.parent_id) : null;
    const pk = parent ? cleNom(parent.name) : null;
    aCreer.push({
      cle: k, name: s.name, coef: s.coef ?? 1, max: s.max, calc_method: s.calc_method ?? null, formula: s.formula ?? null,
      position: pos++,
      parentCle: pk && aCreer.some((x) => x.cle === pk) ? pk : null,
      parentIdCible: pk && dejaLa.has(pk) ? dejaLa.get(pk).id : null,
    });
    cleDe.set(s.id, k);
  }
  return { aCreer, sautees };
}
