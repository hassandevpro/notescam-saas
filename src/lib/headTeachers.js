// LES ENSEIGNANTS PRINCIPAUX D'UNE CLASSE
//
// Une classe peut en porter DEUX (demande de THE GENIUS, 23/09/2026) :
// `classes.teacher_id` et `classes.teacher2_id`.
//
// LE SECOND EST UNE MENTION, PAS UN DROIT. Décision explicite de
// l'établissement : il s'imprime sur les documents, mais n'ouvre aucun accès.
// Le périmètre d'un enseignant reste dérivé du SEUL `teacher_id`
// (`teacherSectors`, server/scopeGuard.js) et les notifications de classe
// continuent de viser le premier (`notificationProducers.js`,
// `birthdayNotifications.js`). C'est ce qui rend ce chantier sans effet sur le
// cloisonnement strict, actif chez cette école et nulle part ailleurs.
//
// PUR : ni base, ni store, ni React.

// Noms des enseignants principaux, dans l'ordre, sans trou ni doublon.
// `teachers` : la liste de l'école ; un id qui n'y figure pas (enseignant
// supprimé) est simplement ignoré — un bulletin ne doit pas afficher un vide
// au milieu d'une énumération.
export function headTeacherNames(cls, teachers = []) {
  const parId = new Map((teachers || []).filter((t) => t?.id).map((t) => [t.id, t]));
  const vus = new Set();
  const noms = [];
  for (const id of [cls?.teacher_id, cls?.teacher2_id]) {
    if (!id || vus.has(id)) continue;      // même enseignant choisi deux fois
    vus.add(id);
    const nom = parId.get(id)?.name;
    if (nom) noms.push(nom);
  }
  return noms;
}

// Séparateur « · » plutôt qu'une virgule : un nom composé en contient souvent
// une (« NGONO ép. MBALLA, Marie »), et la liste deviendrait illisible.
export const SEPARATEUR = ' · ';

// Ce que les documents impriment. Chaîne vide si la classe n'a pas de titulaire,
// exactement comme avant — les gabarits masquent alors la ligne.
export function headTeacherText(cls, teachers = []) {
  return headTeacherNames(cls, teachers).join(SEPARATEUR);
}

// Combien de noms porte une chaîne déjà construite ? Les gabarits du
// fondamental (BulletinMatOfficial, BulletinPrimAnnualUA) ne reçoivent que
// `profPrincipal` en texte : leur faire descendre une prop de plus à travers
// tous les appels coûterait plus cher que de relire le séparateur.
export function headTeacherCount(text) {
  const s = String(text ?? '').trim();
  return s ? s.split(SEPARATEUR).filter((x) => x.trim()).length : 0;
}

// Libellé accordé au NOMBRE. Sans cela, un bulletin annoncerait « P. principal :
// MBARGA Paul · NGONO Marie » — une faute d'accord sur un document officiel.
// `basic` : au fondamental l'usage est « Enseignant(e) », pas « P. principal ».
export function headTeacherLabel(count, sys = 'FR', { basic = false } = {}) {
  const pluriel = count > 1;
  if (sys === 'EN') {
    if (basic) return pluriel ? 'Class teachers' : 'Class teacher';
    return pluriel ? 'Form masters' : 'Form master';
  }
  if (sys === 'ES') return pluriel ? 'Titulares' : 'Titular';
  if (basic) return pluriel ? 'Enseignant(e)s' : 'Enseignant(e)';
  return pluriel ? 'P. principaux' : 'P. principal';
}
