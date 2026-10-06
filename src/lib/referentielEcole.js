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
    ? supabase.from(cfg.masques).upsert({ school_id: schoolId, [cfg.fk]: id })
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
