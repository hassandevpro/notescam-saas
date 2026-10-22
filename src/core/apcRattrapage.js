// CE QUI MANQUE À UNE CLASSE POUR QUE SES MATIÈRES SOIENT SAISISSABLES
//
// ── LE DÉFAUT QUE CE MODULE FERME ───────────────────────────────────────────
//
// Signalement du 2026-10-22 : « les matières créées sont différentes des
// matières disponibles dans la liste déroulante pour ajouter les notes ».
//
// Une matière du référentiel n'est proposée à la saisie que si elle est
// RATTACHÉE au niveau de la classe (`apc_classe_matieres`, par `classe_id`).
// Le rattrapage existant ne savait traiter qu'un seul manque — la matière dont
// le NOM n'existe nulle part — et ignorait l'autre, pourtant le plus fréquent :
// la matière qui existe mais PAS À CE NIVEAU.
//
//   · une matière MAISON naît attachée au SEUL niveau où on l'a créée.
//     « Etude de texte » créée en 3ème reste en `3e` : la cocher en 5ème ne
//     l'attachait pas, et rien ne le disait ;
//   · une matière NATIONALE n'est au catalogue que des niveaux prévus par
//     l'arrêté. Espagnol, Allemand, Arabe et Chinois n'existent qu'en 4e/3e ;
//     PCT et SVTEEHB qu'à partir de la 4e. Une 5ème qui enseigne l'espagnol
//     cochait donc une matière qu'elle ne pouvait pas noter.
//
// MESURÉ EN PRODUCTION le 2026-10-22 : 12 classes, 6 écoles, une quarantaine de
// matières cochées et non saisissables. BRIGHT CONTINENT 5ème en portait 6,
// THE GENIUS 5eme et 6eme une chacune (Chinois).
//
// ── LA RÈGLE, ET CE QU'ELLE INTERDIT ────────────────────────────────────────
//
// Règle donnée par le responsable : « laisse toutes les matières apparaître
// tant qu'elles sont créées et cochées ». D'où deux gestes, et deux seulement :
//
//   CRÉER     le nom ne correspond à AUCUNE matière → c'est une matière maison
//             de plus.
//   RATTACHER la matière existe → on pose son rattachement au niveau. JAMAIS
//             une copie : recréer « Espagnol » à côté de l'Espagnol national
//             fabriquerait le doublon qu'on passe la journée à retirer, et
//             recréer une matière maison détacherait les notes déjà saisies.
//
// Ce module ne fait que DÉCIDER. Il n'écrit rien, ne connaît ni le réseau ni le
// cache : c'est ce qui le rend vérifiable.

import { matiereIdsForSubject } from './apcMatiereMatch.js';

/**
 * @param subjects       lignes `subjects` de LA classe
 * @param matieres       TOUTES les matières du référentiel (tous niveaux)
 * @param classeMatieres rattachements du référentiel [{ classe_id, matiere_id }]
 * @param classeId       niveau du référentiel pour cette classe ('6e'…'3e')
 * @returns { creer: [subject], rattacher: Map(matiereId → nom) }
 */
export function manquesPourClasse({ subjects, matieres, classeMatieres, classeId }) {
  const creer = [];
  const rattacher = new Map();
  const toutes = (matieres || []).filter((m) => m && m.id != null);
  const lignes = (subjects || []).filter((s) => s && s.name);
  if (!classeId || !lignes.length) return { creer, rattacher };

  const rattachees = new Set((classeMatieres || [])
    .filter((r) => r && r.classe_id === classeId)
    .map((r) => r.matiere_id));

  for (const s of lignes) {
    // Les ALIAS font foi, exactement comme à l'affichage : « SVT » désigne
    // SVTEEHB, et ne doit pas donner lieu à une matière maison « SVT ».
    const ids = matiereIdsForSubject(s.name, toutes);
    if (!ids.size) { creer.push(s); continue; }
    for (const id of ids) {
      if (rattachees.has(id)) continue;
      const m = toutes.find((x) => x.id === id);
      // La Map dédoublonne d'office : deux lignes locales qui désignent la même
      // matière officielle ne produisent qu'un seul rattachement.
      if (m) rattacher.set(id, m.nom);
    }
  }
  return { creer, rattacher };
}
