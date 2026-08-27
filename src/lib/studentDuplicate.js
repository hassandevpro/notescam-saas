// ════════════════════════════════════════════════════════════════════════════
// DOUBLONS D'ÉLÈVES — détection à la SAISIE
// ════════════════════════════════════════════════════════════════════════════
// Moteur PUR (aucun store, aucun réseau). Testé isolément : _studentDuplicate.test.mjs
//
// Pourquoi : rien n'empêchait de ré-inscrire deux fois le même enfant. Constaté à
// THE GENIUS le 26/08/2026 — « EWODO AYISSI JUAN PAOLO » et « EWODO AYISSI JUAN
// PAOLO JUNIOR », même classe, même date de naissance, même numéro de téléphone.
// Deux fiches pour un élève, c'est deux dossiers de pension, deux bulletins et un
// effectif faux.
//
// DEUX NIVEAUX, et c'est délibéré :
//
//   BLOCK — la même personne, sans discussion possible : nom identique ET même
//           date de naissance (ou même matricule). On refuse l'enregistrement.
//
//   WARN  — très probablement la même personne, mais pas certain : même date de
//           naissance et même téléphone, ou un nom qui n'est qu'une variante de
//           l'autre. On demande confirmation, sans refuser.
//
// Pourquoi ne PAS bloquer le second cas : deux jumeaux inscrits le même jour
// partagent la date de naissance ET le téléphone du parent. Les refuser rendrait
// leur inscription impossible, et une règle qu'on ne peut pas contourner
// légitimement finit contournée illégitimement — par un faux nom ou une fausse
// date, qui coûte plus cher que le doublon qu'on voulait éviter.

export const DUP = Object.freeze({
  NONE:  'none',
  WARN:  'warn',
  BLOCK: 'block',
});

// Majuscules, sans accents, sans ponctuation, espaces réduits. « Crèche-A » et
// « CRECHE A » doivent se rapprocher ; « MBALLA  Jean » et « Mballa Jean » aussi.
export function normName(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

// Chiffres seuls : « 674 75 36 54 » et « 674753654 » sont le même numéro, et
// c'est exactement sous ces deux formes qu'était saisi le doublon constaté.
export function normPhone(v) {
  const d = String(v ?? '').replace(/\D+/g, '');
  return d.length >= 8 ? d.slice(-9) : '';   // 9 derniers chiffres : ignore l'indicatif
}

// Date de naissance comparable : on ne garde que la partie date d'un ISO.
export function normBirth(v) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 10) : '';
}

const tokens = (n) => normName(n).split(' ').filter(Boolean);

// Un nom est-il une VARIANTE de l'autre ? (« X JUNIOR » face à « X », ordre des
// prénoms inversé, un prénom en plus.) Vrai si l'un contient tous les mots de
// l'autre — c'est ce qui rapproche les deux fiches EWODO.
export function isNameVariant(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [court, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (court.length < 2) return false;          // un seul mot commun ne prouve rien
  const reste = [...long];
  for (const mot of court) {
    const i = reste.indexOf(mot);
    if (i === -1) return false;
    reste.splice(i, 1);
  }
  return true;
}

/**
 * Confronte un élève en cours de saisie au registre existant.
 * @param {object} candidat  { id?, name, birth_date?, matricule?, phone?, parent_phone? }
 * @param {Array}  registre  élèves déjà enregistrés (actifs ET archivés)
 * @returns {{ level: string, matches: Array, reason: string|null }}
 */
export function checkDuplicate(candidat, registre = []) {
  const nom    = normName(candidat?.name);
  const naiss  = normBirth(candidat?.birth_date);
  const mat    = normName(candidat?.matricule);
  const tel    = normPhone(candidat?.phone ?? candidat?.parent_phone);
  if (!nom && !mat) return { level: DUP.NONE, matches: [], reason: null };

  const bloquants = [], suspects = [];
  for (const s of registre || []) {
    if (!s || (candidat?.id && s.id === candidat.id)) continue;   // une fiche ne se compare pas à elle-même
    const sNom   = normName(s.name);
    const sNaiss = normBirth(s.birth_date);
    const sMat   = normName(s.matricule);
    const sTel   = normPhone(s.phone ?? s.parent_phone);

    if (mat && sMat && mat === sMat) { bloquants.push({ student: s, on: 'matricule' }); continue; }
    if (nom && sNom && nom === sNom && naiss && sNaiss && naiss === sNaiss) {
      bloquants.push({ student: s, on: 'nom+naissance' }); continue;
    }
    if (nom && sNom && nom === sNom && !naiss && !sNaiss) {
      bloquants.push({ student: s, on: 'nom' }); continue;
    }
    if (naiss && sNaiss && naiss === sNaiss && tel && sTel && tel === sTel) {
      suspects.push({ student: s, on: 'naissance+telephone' }); continue;
    }
    if (naiss && sNaiss && naiss === sNaiss && isNameVariant(nom, sNom)) {
      suspects.push({ student: s, on: 'nom voisin+naissance' });
    }
  }

  if (bloquants.length) {
    return {
      level: DUP.BLOCK,
      matches: bloquants,
      reason: bloquants[0].on === 'matricule'
        ? 'Ce matricule est déjà attribué à un autre élève.'
        : 'Cet élève est déjà inscrit (même nom et même date de naissance).',
    };
  }
  if (suspects.length) {
    return {
      level: DUP.WARN,
      matches: suspects,
      reason: 'Un élève très proche est déjà inscrit — même date de naissance et même contact. Vérifiez qu’il ne s’agit pas du même enfant.',
    };
  }
  return { level: DUP.NONE, matches: [], reason: null };
}
