// LE RÉFÉRENTIEL D'UNE ÉCOLE — couche commune aux trois moteurs officiels.
//
// Maternelle (domaines), premier cycle APC (compétences) et primaire MINEDUB
// (compétences) posent exactement le même problème : leurs tables sont
// NATIONALES, partagées par toutes les écoles de la plateforme, et les tables de
// notes portent une clé étrangère vers elles. Aucune école ne peut donc les
// éditer sans toucher les autres, ni ranger les siennes ailleurs.
//
// Les trois migrations `supabase_*_par_ecole.sql` leur donnent la même forme :
//   • colonne `school_id` : NULL = national, renseigné = propre à l'école ;
//   • table `<x>_masques` : ce que l'école cache CHEZ ELLE sans rien supprimer.
//
// Ce module porte la logique commune pour que les trois écrans se comportent
// pareil — et pour qu'une correction serve aux trois. Les différences de forme
// (une compétence APC vit dans (classe, trimestre, matière), un domaine
// maternelle est plat) restent dans les appelants : seul le MÉCANISME est ici.

import { supabase } from './supabase';

// Les trois référentiels ouverts, et leur table de masques.
export const REF_ECOLE = {
  mat:  { table: 'mat_domaines',     masques: 'mat_domaines_masques',     fk: 'domaine_id'    },
  apc:  { table: 'apc_competences',  masques: 'apc_competences_masques',  fk: 'competence_id' },
  prim: { table: 'prim_competences', masques: 'prim_competences_masques', fk: 'competence_id' },
};

// Une ligne appartient-elle à CETTE école ? Seules celles-là sont modifiables :
// `school_id` nul = nationale, et la RLS refusera toute écriture dessus.
export const estAMoi = (row, schoolId) => !!schoolId && row?.school_id === schoolId;
export const estNational = (row) => !row?.school_id;

// Id d'une ligne maison dans une table dont la clé primaire est un slug TEXTE
// (mat_domaines, prim_competences) : préfixé par l'école, donc jamais en
// collision avec un slug national ni avec celui d'un autre établissement.
export function idMaison(schoolId, libelle) {
  const ecole = String(schoolId || '').replace(/-/g, '').slice(0, 12);
  const slug = String(libelle || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return `ec_${ecole}_${slug || 'item'}`;
}

// ── UN UUID STABLE, DÉRIVÉ DE CE QU'IL DÉSIGNE ──────────────────────────────
//
// `apc_competences.id` est de type `uuid` : on ne peut pas y mettre le slug de
// `idMaison`. Mais un `uuid()` tiré au hasard rend la création NON idempotente,
// et c'est ce qui a fabriqué jusqu'à neuf copies d'une même compétence maison
// chez BRIGHT CONTINENT (cf. addMatiereMaisonApc).
//
// On dérive donc l'identifiant de ses composantes : (école, matière, classe,
// trimestre) donne TOUJOURS le même uuid, sur n'importe quel poste, en ligne ou
// hors ligne. Rejouer la création devient une mise à jour.
//
// Hachage non cryptographique volontairement (FNV-1a, quatre passes de graines
// différentes) : aucune dépendance, synchrone, et le besoin n'est pas la
// résistance à l'attaque mais la STABILITÉ. Le domaine est minuscule — les
// quelques matières d'une école — donc une collision est hors de portée
// pratique, et la forme respecte la grammaire d'un uuid (version 5, variante
// RFC 4122) pour que Postgres l'accepte.
export function uuidMaison(...parts) {
  const s = parts.map((p) => String(p ?? '')).join('|');
  const bloc = (graine) => {
    let h = graine >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  const a = bloc(0x811c9dc5), b = bloc(0x7f4a7c15), c = bloc(0x165667b1), d = bloc(0x27d4eb2f);
  // Version 5 et variante « 10xx » posées en dur, aux emplacements que la
  // RFC leur réserve : le reste vient du hachage.
  const v = `5${b.slice(1, 4)}`;
  const n = `${((parseInt(c[0], 16) & 0x3) | 0x8).toString(16)}${c.slice(1, 4)}`;
  return `${a}-${b.slice(4, 8)}-${v}-${n}-${c.slice(4, 8)}${d}`;
}

// ── LE CODE AFFICHÉ D'UNE LIGNE MAISON ──────────────────────────────────────
// `prim_competences.code` est NOT NULL — en LAN comme au Cloud (vérifié sur les
// deux schémas). Or « Ajouter une compétence » envoyait `code: null` : l'ajout
// échouait donc TOUJOURS dans le primaire, avec « NOT NULL constraint failed »
// en LAN et une violation 23502 au Cloud. L'écran, lui, ne disait qu'« ajout
// refusé ». C'est ce code-ci qui manquait, pas une permission.
//
// Le code n'est QU'UN LIBELLÉ court : la pastille de l'éditeur et le
// « <code> — <intitulé> » du bulletin (primEngine). Rien ne le lit ni ne le
// décode, et aucune contrainte d'unicité ne pèse dessus. On le dérive donc des
// initiales du libellé. Les codes du ministère commencent tous par un chiffre
// (1A…6B) : une initiale alphabétique ne peut pas se faire passer pour l'un
// d'eux. `pris` évite deux pastilles identiques dans la même liste.
export function codeMaison(libelle, pris = []) {
  const mots = String(libelle || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .split(/\s+/).filter(Boolean);
  let base = mots.map((m) => m[0]).join('').toUpperCase().slice(0, 3);
  if (!base) base = 'EC';
  if (base.length === 1) base += (mots[0]?.[1] || '').toUpperCase();
  // « 1re approche du calcul » donnerait « 1AD » : un code qui COMMENCE par un
  // chiffre se lit comme un code du ministère. On le marque d'un E (école).
  if (/^[0-9]/.test(base)) base = `E${base}`.slice(0, 4);
  const dejaPris = new Set((Array.isArray(pris) ? pris : []).filter(Boolean).map((c) => String(c).toUpperCase()));
  if (!dejaPris.has(base)) return base;
  for (let n = 2; n <= 99; n += 1) if (!dejaPris.has(`${base}${n}`)) return `${base}${n}`;
  return `${base}${Date.now() % 1000}`;
}

// Les ids masqués par l'école. null = la lecture a échoué (on ne masque alors
// RIEN : mieux vaut afficher un référentiel complet qu'en cacher par accident).
export async function fetchMasques(kind, schoolId) {
  const cfg = REF_ECOLE[kind];
  if (!cfg || !schoolId) return [];
  const { data, error } = await supabase
    .from(cfg.masques).select(cfg.fk).eq('school_id', schoolId);
  if (error) { console.error('fetchMasques', kind, error); return null; }
  return (data || []).map((r) => r[cfg.fk]);
}

export async function setMasque(kind, schoolId, id, masque) {
  const cfg = REF_ECOLE[kind];
  if (!cfg || !schoolId || !id) return false;
  const q = masque
    // `onConflict` EXPLICITE : une table de masques n'a pas de colonne `id`, sa
    // clé est (school_id, item). Sans ce paramètre, l'édition LAN générait
    // « ON CONFLICT(id) » — donc une erreur SQLite, donc un masquage refusé sans
    // raison visible. Au Cloud, c'est la clé primaire que PostgREST déduisait
    // déjà : le comportement en ligne est inchangé.
    ? supabase.from(cfg.masques).upsert(
      { school_id: schoolId, [cfg.fk]: id },
      { onConflict: `school_id,${cfg.fk}` },
    )
    : supabase.from(cfg.masques).delete().eq('school_id', schoolId).eq(cfg.fk, id);
  const { error } = await q;
  if (error) { console.error('setMasque', kind, error); return false; }
  return true;
}

// Crée ou modifie une ligne MAISON. `record.school_id` doit être posé : sans lui
// la RLS refuse (c'est elle qui empêche de s'approprier une ligne nationale).
export async function upsertLigne(kind, record) {
  const cfg = REF_ECOLE[kind];
  if (!cfg) return false;
  if (!record?.school_id) { console.error('upsertLigne', kind, 'school_id absent'); return false; }
  const { error } = await supabase.from(cfg.table).upsert(record, { onConflict: 'id' });
  if (error) { console.error('upsertLigne', kind, error); return false; }
  return true;
}

// ── UNE MATIÈRE MAISON EN PREMIER CYCLE APC ────────────────────────────────
//
// Le premier cycle était le seul cycle où une école ne pouvait RIEN ajouter de
// son cru. `prim_competences` et `mat_domaines` portent un `school_id` depuis
// longtemps : on y ajoute une compétence ou un domaine, et il se saisit et
// s'imprime comme les nationaux. En APC, `apc_competences` en porte un aussi —
// mais son `matiere_id` est une clé étrangère vers `apc_matieres`, qui n'en
// avait pas. Une école pouvait donc ajouter une compétence DANS une matière
// nationale, jamais une MATIÈRE. « Langue Turc », « Étude de texte » ou
// « Informatique Pratique » n'avaient aucun endroit où exister.
//
// `supabase_apc_matieres_maison.sql` a ouvert la colonne. Cette fonction pose
// les TROIS lignes qu'il faut pour qu'une matière existe vraiment :
//
//   1. la MATIÈRE elle-même (`apc_matieres`, school_id renseigné) ;
//   2. son RATTACHEMENT à la classe (`apc_classe_matieres`), sans quoi elle
//      n'apparaît dans aucune classe ;
//   3. une COMPÉTENCE par trimestre (`apc_competences`) — c'est le point qu'on
//      oublie : l'écran de saisie ne propose que les matières ayant au moins une
//      compétence pour le trimestre affiché (`nbComp > 0`). Sans elles, la
//      matière serait créée et resterait invisible, ce qui est exactement le
//      défaut qu'on répare.
//
// Tout est posé avec le `school_id` de l'école : la RLS (`WITH CHECK school_id
// IS NOT NULL`) interdit de fabriquer une ligne nationale, donc le référentiel
// des autres établissements est hors d'atteinte.

/**
 * Crée une matière propre à l'école, rattachée à une classe du référentiel.
 *
 * @param schoolId   école propriétaire
 * @param nom        libellé de la matière, tel que l'école l'a saisi
 * @param classeId   slug de classe du référentiel APC (`6e`, `5e`…)
 * @param trimestres ids de trimestres à couvrir (`['t1','t2','t3']`)
 * @param versionId  version active du référentiel, pour que la compétence soit
 *                   chargée par `fetchReferentiel` (qui filtre dessus)
 * @param makeId     générateur d'uuid
 * @param coef       coefficient de la matière dans cette classe
 * @returns { matiere, classeMatiere, competences } ou { error }
 */
export async function addMatiereMaisonApc({
  schoolId, nom, classeId, trimestres = [], versionId = null, coef = 1, ordre = 90,
  // `makeId` n'est plus utilisé : il reste accepté pour ne pas casser un appelant
  // qui le passerait encore. Voir ci-dessous POURQUOI il a disparu.
  makeId = null,   // eslint-disable-line no-unused-vars
}) {
  const libelle = String(nom || '').trim();
  if (!schoolId || !libelle || !classeId) return { error: 'parametres' };
  if (!trimestres.length) return { error: 'trimestres' };

  // ── POURQUOI CETTE FONCTION NE TIRE PLUS D'IDENTIFIANT AU HASARD ─────────
  //
  // RELEVÉ EN PRODUCTION le 2026-10-21, BRIGHT CONTINENT :
  //     apc_matieres maison .... 19 lignes pour 10 noms
  //     « Langue Turc » ........ 3 fois        « Etude de texte » ... 3 fois
  //     « Expression Orale » ... 3 fois        « Expresion ecrite » . 3 fois
  //     apc_competences maison . jusqu'à 9 copies par nom (3 matières × 3 trim.)
  //
  // L'appelant passait `makeId: uuid` — un identifiant NEUF à chaque appel. Le
  // garde-fou contre le doublon était ailleurs : une comparaison de noms contre
  // le référentiel EN CACHE (IndexedDB, propre à chaque navigateur). Tout poste
  // dont le cache ignorait la ligne maison la recréait donc, avec un nouvel
  // identifiant, et la base l'acceptait : rien ne s'y opposait. Trois postes,
  // trois copies — et c'est exactement ce qu'on compte.
  //
  // Deux changements, et le doublon devient IMPOSSIBLE sans dépendre d'aucun
  // cache :
  //   1. on cherche la matière PAR SON NOM sur le serveur, pas dans le cache.
  //      Trouvée, on la RÉUTILISE — donc les notes déjà saisies dessus restent
  //      attachées, et le poste en retard se raccroche au lieu de doubler ;
  //   2. sinon on la crée avec un identifiant DÉTERMINISTE, dérivé de (école,
  //      nom), exactement comme le primaire et la maternelle le font déjà
  //      (`idMaison`). Deux postes qui créent le même nom écrivent la même
  //      ligne : l'upsert la met à jour, il n'en ajoute pas une seconde.
  //
  // Le dernier rempart reste la base : un index UNIQUE sur (school_id, nom
  // normalisé) refuse le doublon même si un client fautif passait outre. Voir
  // supabase_apc_matieres_unicite.sql.
  const normNom = (x) => String(x || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  const dejaLa = await supabase.from('apc_matieres')
    .select('id, nom').eq('school_id', schoolId);
  if (dejaLa.error) { console.error('addMatiereMaisonApc lecture', dejaLa.error); return { error: 'lecture' }; }
  const trouvee = (dejaLa.data || []).find((m) => normNom(m.nom) === normNom(libelle));

  const matiere = trouvee
    ? { ...trouvee, nom: trouvee.nom }
    : { id: idMaison(schoolId, libelle), nom: libelle, coefficient: coef, optionnelle: false, ordre, school_id: schoolId };
  if (!trouvee) {
    const m = await supabase.from('apc_matieres').upsert(matiere, { onConflict: 'id' });
    if (m.error) { console.error('addMatiereMaisonApc matiere', m.error); return { error: 'matiere' }; }
  }

  const classeMatiere = { classe_id: classeId, matiere_id: matiere.id, coefficient: coef, ordre, optionnelle: false, school_id: schoolId };
  const cm = await supabase.from('apc_classe_matieres').upsert(classeMatiere);
  if (cm.error) { console.error('addMatiereMaisonApc rattachement', cm.error); return { error: 'rattachement' }; }

  // Une compétence par trimestre : sans elle la matière ne s'afficherait pas.
  // Identifiant déterministe lui aussi, sur (école, matière, classe, trimestre) :
  // rejouer ce geste met à jour les trois mêmes lignes au lieu d'en créer neuf.
  const competences = trimestres.map((tid, i) => ({
    id: uuidMaison(schoolId, matiere.id, classeId, tid),
    school_id: schoolId, matiere_id: matiere.id, classe_id: classeId,
    trimestre_id: tid, cycle_id: 'premier_cycle', intitule: libelle,
    coefficient: 1, actif: true, ordre: 1 + i, referentiel_version_id: versionId,
  }));
  const c = await supabase.from('apc_competences').upsert(competences, { onConflict: 'id' });
  if (c.error) { console.error('addMatiereMaisonApc competences', c.error); return { error: 'competences' }; }

  return { matiere, classeMatiere, competences, reutilisee: !!trouvee };
}

// Supprime une ligne maison. Échoue si des notes y sont rattachées — la clé
// étrangère protège le travail déjà saisi, et c'est voulu : on masque alors.
export async function deleteLigne(kind, id) {
  const cfg = REF_ECOLE[kind];
  if (!cfg || !id) return { ok: false };
  const { error } = await supabase.from(cfg.table).delete().eq('id', id);
  if (error) {
    const liee = /foreign key|violates/i.test(error.message || '');
    console.error('deleteLigne', kind, error);
    return { ok: false, liee };
  }
  return { ok: true };
}

// ── SURCHARGE DE LIBELLÉ d'une ligne NATIONALE ───────────────────────────────
// Renommer la ligne elle-même est exclu : elle appartient aux 44 écoles. Copier
// la ligne en version maison puis masquer l'originale casserait les notes déjà
// saisies (la copie a un nouvel id, `*_notes.competence_id` pointe vers l'ancien).
// On surcharge donc le seul AFFICHAGE, en gardant l'identité officielle intacte —
// même principe que la maternelle, généralisé aux trois référentiels.
// Voir supabase_referentiel_libelles.sql.

export async function fetchLibelles(kind, schoolId) {
  if (!schoolId) return {};
  const { data, error } = await supabase
    .from('referentiel_libelles').select('item_id, intitule')
    .eq('school_id', schoolId).eq('kind', kind);
  if (error) { console.error('fetchLibelles', kind, error); return null; }
  return Object.fromEntries((data || []).map((r) => [r.item_id, r.intitule]));
}

// `intitule` vide ⇒ on RETIRE la surcharge : la ligne reprend son libellé officiel.
export async function setLibelle(kind, schoolId, itemId, intitule) {
  if (!schoolId || !itemId) return false;
  const nom = String(intitule ?? '').trim();
  const q = nom
    ? supabase.from('referentiel_libelles')
        .upsert({ school_id: schoolId, kind, item_id: String(itemId), intitule: nom, maj_le: new Date().toISOString() },
                { onConflict: 'school_id,kind,item_id' })
    : supabase.from('referentiel_libelles').delete()
        .eq('school_id', schoolId).eq('kind', kind).eq('item_id', String(itemId));
  const { error } = await q;
  if (error) { console.error('setLibelle', kind, error); return false; }
  return true;
}

// Applique les surcharges à une liste déjà localisée. `_override` empêche une
// relocalisation en aval d'écraser le mot de l'école (cf. matDomaineMatch).
export function withLibelles(lignes, libelles) {
  if (!libelles || !Object.keys(libelles).length) return lignes || [];
  return (lignes || []).map((l) => (libelles[l.id] != null
    ? { ...l, intitule: libelles[l.id], _override: true }
    : l));
}
