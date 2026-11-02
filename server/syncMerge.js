// FUSION PAR CHAMP — pourquoi ce module existe.
//
// LE DÉFAUT. Jusqu'ici, le départage d'un conflit se faisait à la LIGNE
// ENTIÈRE : `remoteWins()` comparait deux horodatages et, selon le gagnant,
// soit écrasait TOUTE la ligne locale par la distante, soit ignorait TOUTE la
// ligne distante. Les deux branches perdent des données :
//
//   La secrétaire corrige le TÉLÉPHONE d'un élève à l'école, à 9 h.
//   Le censeur corrige le NOM du même élève en ligne, à 10 h.
//   → la ligne distante est « plus récente », elle écrase tout :
//     le téléphone corrigé à 9 h est perdu, sans un mot.
//
//   Inversez les heures, et c'est le nom corrigé en ligne qui disparaît.
//
// Deux personnes qui ne se gênent pas — elles ont touché des champs
// DIFFÉRENTS — et pourtant l'une des deux corrections est jetée. C'est la
// dernière grosse cause de perte silencieuse du moteur.
//
// CE QU'IL FAUT POUR FAIRE MIEUX, ET POURQUOI ÇA N'ÉTAIT PAS POSSIBLE AVANT.
// Comparer deux versions ne suffit pas : avec `local.phone = '677…'` et
// `distant.phone = '699…'`, on ne peut pas savoir QUI a changé quoi. Il faut
// un TROISIÈME terme : l'état sur lequel les deux côtés étaient d'accord la
// dernière fois. C'est `sync_shadow`. Avec lui, chaque champ se lit sans
// ambiguïté :
//
//   base = valeur accordée  ·  local ≠ base → l'école a touché ce champ
//                              distant ≠ base → le Cloud a touché ce champ
//
//     ni l'un ni l'autre → inchangé, on garde
//     l'école seule      → ON GARDE LE LOCAL  ← c'est ici que la perte cesse
//     le Cloud seul      → on prend le distant
//     LES DEUX           → vrai conflit de champ : là seulement on départage
//
// Le départage à la ligne entière devient donc l'exception (deux personnes sur
// le MÊME champ) au lieu de la règle.
//
// PAS D'OMBRE, PAS DE FUSION. Pour une ligne jamais encore échangée, il n'y a
// pas de base : on retombe sur l'ancien comportement, à la ligne. C'est
// volontaire — inventer une base ferait des dégâts pires que ceux qu'on
// corrige — et c'est transitoire : l'ombre se pose au premier échange.
import { CHAMPS_SENSIBLES, TABLES_AJOUT_SEUL } from './syncSensible.js';

// Un champ vaut ce qu'il vaut, mais NULL n'est pas la chaîne vide : à l'école,
// un téléphone jamais saisi et un téléphone effacé ne disent pas la même
// chose, et les confondre ferait passer un effacement pour « inchangé ».
const NUL = '\u0000nul';
export const canon = (v) => (v === null || v === undefined ? NUL : String(v));

// LE DÉPARTAGE D'UN VRAI CONFLIT DE CHAMP, ET L'HORLOGE.
//
// On NE compare PAS d'abord les horloges des deux PC. Celle d'un poste d'école
// peut avoir des mois d'écart — une pile de carte mère vide suffit, et c'est
// arrivé. Un poste réglé en 2019 gagnerait, ou perdrait, TOUS les départages.
//
// On prend donc `version` : un compteur monotone incrémenté à chaque écriture.
// C'est une horloge LOGIQUE, insensible à l'heure système. Les horodatages ne
// servent qu'en second recours, quand les deux versions sont égales, et le
// `device_id` tranche en tout dernier — pour que le résultat soit le MÊME sur
// les deux nœuds. Un départage non déterministe ferait diverger les deux
// bases, ce qui est pire qu'un mauvais choix.
export function distantGagneChamp(local, distant) {
  const lv = Number(local?.version) || 0, dv = Number(distant?.version) || 0;
  if (dv !== lv) return dv > lv;
  const lt = Date.parse(local?.updated_at || 0) || 0;
  const dt = Date.parse(distant?.updated_at || 0) || 0;
  if (dt !== lt) return dt > lt;
  return String(distant?.device_id || '') > String(local?.device_id || '');
}

// Colonnes de métadonnées : elles décrivent la ligne, elles ne SONT pas la
// donnée de l'école. Les fusionner champ par champ n'a pas de sens — un
// `updated_at` « fusionné » ne correspondrait à aucune écriture réelle.
const META = new Set(['id', 'updated_at', 'version', 'device_id', 'created_at']);

/**
 * Fusionne une ligne distante dans une ligne locale, champ par champ.
 *
 * @returns {{rec, origine, conflits, garde, resteALocal}}
 *   rec         — la ligne à écrire en base
 *   origine     — par colonne : 'local' | 'distant' | 'inchange' | 'conflit'
 *   conflits    — conflits de champ départagés automatiquement (journalisés)
 *   garde       — champs sensibles NON écrasés, qui demandent un arbitrage
 *   resteALocal — vrai si `rec` contient au moins un champ que le Cloud n'a
 *                 pas : il faudra REPOUSSER la ligne, sinon la correction de
 *                 l'école resterait locale.
 */
export function fusionner({ table, local, distant, ombre, colonnes }) {
  // SANS BASE, PAS DE FUSION — ET ON LE DIT. Rendre `null` plutôt que fusionner
  // au hasard : sans ombre, tout champ qui diffère paraît « touché des deux
  // côtés », et la fonction produirait un départage de ligne entière déguisé
  // en fusion par champ. Le test l'a montré sur une ombre vide. L'appelant
  // doit alors retomber explicitement sur `remoteWins()`.
  if (!ombre || typeof ombre !== 'object' || Object.keys(ombre).length === 0) return null;

  const rec = { ...distant };
  const origine = {};
  const conflits = [];
  const garde = [];
  let resteALocal = false;

  const sensibles = CHAMPS_SENSIBLES[table] || null;
  const ajoutSeul = TABLES_AJOUT_SEUL.has(table);

  for (const col of colonnes) {
    if (META.has(col)) continue;
    if (!(col in distant) && !(col in local)) continue;
    const vl = canon(local[col]), vd = canon(distant[col]), vb = canon(ombre[col]);
    const toucheLocal = vl !== vb;
    const toucheDistant = vd !== vb;

    if (!toucheLocal && !toucheDistant) { origine[col] = 'inchange'; continue; }

    // ── AJOUT SEUL : D'ABORD, ET SANS CONDITION DE CONFLIT ────────────────
    // Ce bloc était plus bas, dans le traitement des conflits à deux côtés —
    // et c'était FAUX. Un montant modifié au Cloud SEUL ne passait par aucun
    // conflit : il tombait dans « le Cloud seul a touché ce champ » et
    // écrasait l'encaissement. Le test l'a montré : 50 000 devenait 90 000.
    //
    // La règle n'est pas « on départage les disputes », c'est « une écriture
    // comptable ne change pas ». Le Cloud peut seulement REMPLIR un champ
    // encore vide — le numéro de reçu attribué par le serveur en est le cas
    // normal. Il ne peut jamais en changer un qui porte déjà une valeur,
    // quelle que soit sa version et que l'école y ait touché ou non.
    if (ajoutSeul && vl !== NUL && vd !== vl) {
      rec[col] = local[col];
      origine[col] = 'conflit';
      garde.push({ col, local: local[col], distant: distant[col], base: ombre[col],
        motif: 'table en ajout seul : une écriture comptable ne s’écrase pas' });
      resteALocal = true;
      continue;
    }

    // L'école seule a touché ce champ. C'EST LE CŒUR DU CORRECTIF : avant, ce
    // champ était écrasé par la valeur distante (qui est encore la base) dès
    // que la ligne distante gagnait au départage global.
    if (toucheLocal && !toucheDistant) {
      rec[col] = local[col];
      origine[col] = 'local';
      resteALocal = true;
      continue;
    }

    if (!toucheLocal && toucheDistant) { origine[col] = 'distant'; continue; }

    // ── Les deux côtés ont touché le MÊME champ ────────────────────────────
    // S'ils ont écrit la MÊME valeur, il n'y a pas de conflit.
    if (vl === vd) { origine[col] = 'inchange'; continue; }

    // (L'ajout seul est traité plus haut : il ne dépend pas d'un conflit.)

    // CHAMP SENSIBLE (une note, une période verrouillée, une caisse comptée) :
    // jamais d'écrasement SILENCIEUX. On garde le local et on laisse une trace
    // visible — l'arbitrage appartient à l'école, pas à l'ordre d'arrivée des
    // paquets réseau.
    if (sensibles && sensibles.has(col)) {
      rec[col] = local[col];
      origine[col] = 'conflit';
      garde.push({ col, local: local[col], distant: distant[col], base: ombre[col],
        motif: 'champ sensible : les deux côtés l’ont modifié, arbitrage requis' });
      resteALocal = true;
      continue;
    }

    // Champ ordinaire disputé : départage déterministe, ET journalisé — la
    // valeur écartée reste lisible, ce qui n'était pas le cas avant.
    const prendDistant = distantGagneChamp(local, distant);
    if (!prendDistant) { rec[col] = local[col]; resteALocal = true; }
    origine[col] = 'conflit';
    conflits.push({ col, local: local[col], distant: distant[col], base: ombre[col],
      retenu: prendDistant ? 'distant' : 'local' });
  }

  rec.id = local.id ?? distant.id;
  if (resteALocal) {
    // La ligne écrite n'est NI la locale NI la distante : c'est une version
    // neuve. Elle doit porter un `version` supérieur aux deux, sinon le Cloud
    // la reverrait comme périmée et nous la réécraserait au cycle suivant —
    // la fusion serait défaite à chaque tour.
    rec.version = Math.max(Number(local.version) || 0, Number(distant.version) || 0) + 1;
    rec.updated_at = new Date().toISOString();
  }

  return { rec, origine, conflits, garde, resteALocal };
}
