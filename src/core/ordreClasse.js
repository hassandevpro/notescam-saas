// ORDRE DES ÉLÈVES D'UNE CLASSE, ET LEUR NUMÉRO — logique pure (ni React, ni
// store, ni réseau), source UNIQUE pour toutes les surfaces.
//
// ── POURQUOI UN MODULE, ET PAS UN `.sort()` DE PLUS ──────────────────────────
// Le numéro d'ordre n'a de valeur que s'il désigne le MÊME élève partout : sur
// la liste de classe imprimée, sur le bulletin, et sur l'écran où l'enseignant
// saisit ses notes. Il est appelé à l'oral (« le numéro 12 »), reporté à la main
// d'un document sur l'autre, et c'est précisément là qu'un écart se paie.
//
// Or les surfaces ne triaient PAS pareil :
//
//   • `lib/studentListDoc.js` (liste imprimée)  → localeCompare(…, { sensitivity: 'base' })
//   • les trois postes de saisie (prim/mat/APC) → localeCompare(…) tout court
//   • `pages/Grades.jsx` (saisie classique)     → localeCompare(…) tout court
//
// `sensitivity: 'base'` ignore accents ET casse ; sans l'option, l'ordre par
// défaut de la locale les prend en compte. Deux élèves « ÉTOUNDI » et
// « ETOUNDI » — la même famille, saisie deux fois par deux secrétaires — ne
// tombent donc pas au même rang selon la surface. Ajouter une colonne « N° »
// à la saisie sans unifier le tri aurait donc produit un numéro FAUX : visible,
// affirmatif, et différent de celui de la liste de classe.
//
// ── LE TRI, ET SES DÉPARTAGES ────────────────────────────────────────────────
// 1. le NOM, accents et casse ignorés (`sensitivity: 'base'`), chiffres lus
//    comme des nombres (`numeric: true` — « ELEVE 2 » avant « ELEVE 10 ») ;
// 2. à nom identique, le MATRICULE : deux homonymes réels existent dans toutes
//    les écoles, et leur ordre ne doit pas dépendre de l'ordre d'arrivée des
//    lignes (une synchro les renvoie dans un ordre quelconque) ;
// 3. à matricule identique ou absent, l'IDENTIFIANT : jamais beau, toujours
//    stable. C'est ce dernier cran qui garantit qu'un même numéro désigne le
//    même enfant d'un appareil à l'autre et d'une impression à la suivante.
//
// Sans le cran 3, le numéro « clignotait » : deux fiches sans matricule au même
// nom s'échangeaient leur rang au gré des rechargements.

// Comparateur de référence. `undefined` comme locale : celle de l'environnement,
// comme le faisait déjà la liste imprimée — on ne change pas l'ordre existant,
// on le rend unique.
export function comparerEleves(a, b) {
  const nom = String(a?.name ?? '').localeCompare(
    String(b?.name ?? ''), undefined, { sensitivity: 'base', numeric: true },
  );
  if (nom !== 0) return nom;
  const mat = String(a?.matricule ?? '').localeCompare(
    String(b?.matricule ?? ''), undefined, { sensitivity: 'base', numeric: true },
  );
  if (mat !== 0) return mat;
  return String(a?.id ?? '') < String(b?.id ?? '') ? -1 : String(a?.id ?? '') > String(b?.id ?? '') ? 1 : 0;
}

// Copie ordonnée — jamais un tri en place : les listes viennent du store, et
// trier l'original ferait muter l'état partagé sous les autres écrans.
export const ordonnerEleves = (eleves) => (eleves || []).filter(Boolean).slice().sort(comparerEleves);

// Les élèves d'UNE classe, ordonnés. Le filtre vit ici pour que personne ne
// numérote par mégarde une liste déjà réduite (recherche, pagination) : un
// numéro calculé sur une liste filtrée ne serait plus celui de la classe.
export const elevesDeClasse = (eleves, classId) =>
  ordonnerEleves((eleves || []).filter((s) => s && s.class_id === classId));

// Numéro d'ordre par identifiant : Map<eleveId, numéro commençant à 1>.
// À construire sur la liste COMPLÈTE de la classe, puis à consulter pour chaque
// ligne affichée — y compris quand l'affichage, lui, est filtré.
export function numerosDeClasse(eleves) {
  const m = new Map();
  ordonnerEleves(eleves).forEach((s, i) => { m.set(s.id, i + 1); });
  return m;
}

// Les mêmes élèves, ordonnés, chacun porteur de son `numero`. Pratique pour les
// documents (listes, bulletins) qui itèrent une seule fois.
export const elevesNumerotes = (eleves) =>
  ordonnerEleves(eleves).map((s, i) => ({ ...s, numero: i + 1 }));
