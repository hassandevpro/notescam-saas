// Moteur PUR d'historisation des transferts d'élèves (testable en Node, aucune I/O).
//
// Principe (brief Partie 1) : un élève ne change jamais directement de classe.
// Un transfert = FERMER l'affectation en cours (date_fin + motif_cloture) et en
// OUVRIR une nouvelle (date_debut, date_fin=null). Aucune suppression.
//
// Ce module ne fait QUE construire les lignes ; la persistance (IDB + cloud +
// file offline) et le recalcul des frais sont assurés par le store / les étapes
// suivantes.

export const TRANSFER_TYPES = {
  INITIAL: 'initial',                        // 1re affectation (migration / inscription)
  ADMIN:   'changement_administratif',       // même établissement + même niveau (6e A → 6e B)
  NIVEAU:  'changement_niveau',              // même établissement, niveau différent (redoublement/promotion)
  ETAB:    'changement_etablissement',       // établissement (unité) différent
};

export const CLOTURE_MOTIFS = {
  administratif:            'administratif',
  niveau:                   'niveau',
  etablissement:            'etablissement',
  redoublement:             'redoublement',
  promotion_exceptionnelle: 'promotion_exceptionnelle',
  autre:                    'autre',
};

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

// Détermine le type d'un transfert en comparant l'ancienne et la nouvelle classe.
//   unit_id = établissement (unité pédagogique du complexe) ; level = niveau.
// Priorité : établissement > niveau > administratif.
export function resolveTransferType(oldClass, newClass) {
  if (!oldClass || !newClass) return TRANSFER_TYPES.ADMIN;
  const oldUnit = oldClass.unit_id ?? null;
  const newUnit = newClass.unit_id ?? null;
  if ((oldUnit || newUnit) && oldUnit !== newUnit) return TRANSFER_TYPES.ETAB;
  if (norm(oldClass.level) !== norm(newClass.level)) return TRANSFER_TYPES.NIVEAU;
  return TRANSFER_TYPES.ADMIN;
}

// Motif de clôture par défaut déduit du type (surchargé par l'utilisateur).
export function defaultMotif(type) {
  switch (type) {
    case TRANSFER_TYPES.NIVEAU: return CLOTURE_MOTIFS.niveau;
    case TRANSFER_TYPES.ETAB:   return CLOTURE_MOTIFS.etablissement;
    default:                    return CLOTURE_MOTIFS.administratif;
  }
}

// Construit les lignes d'un transfert : { closedRow, newRow, type, noop }.
//   - `current`  : l'affectation EN COURS (date_fin null) ou null si aucune.
//   - `newClass` : la classe cible { id, name, section, unit_id, level, school_id }.
//   - `type`     : type de transfert (sinon déduit grossièrement — le store fournit
//                  le type résolu à partir des deux objets classe).
// Retourne { noop:true } si la cible = la classe déjà en cours (rien à faire).
export function buildTransfer({
  current = null, newClass, student = null, schoolId = null,
  type = null, motif = null, commentaire = null,
  userId = null, userName = null, at = null, newId,
} = {}) {
  if (!newClass || !newClass.id) throw new Error('buildTransfer: newClass.id requis');
  if (!newId) throw new Error('buildTransfer: newId requis');

  const when = at || new Date().toISOString();
  const isInitial = !current;
  const resolvedType = isInitial
    ? TRANSFER_TYPES.INITIAL
    : (type || resolveTransferType(
        { unit_id: current.school_unit_id, level: null, section: current.section },
        newClass,
      ));

  // Cible identique à l'affectation déjà en cours → non-op.
  if (current && current.class_id === newClass.id && !current.date_fin) {
    return { noop: true, type: resolvedType, closedRow: null, newRow: null };
  }

  const closedRow = current
    ? { ...current, date_fin: when, motif_cloture: motif || defaultMotif(resolvedType) }
    : null;

  const newRow = {
    id:               newId,
    school_id:        schoolId ?? newClass.school_id ?? student?.school_id ?? current?.school_id ?? null,
    student_id:       student?.id ?? current?.student_id ?? null,
    class_id:         newClass.id,
    class_name:       newClass.name ?? null,
    section:          newClass.section ?? null,
    school_unit_id:   newClass.unit_id ?? null,
    date_debut:       when,
    date_fin:         null,
    type_transfert:   resolvedType,
    motif_cloture:    null,
    commentaire:      commentaire ?? null,
    assigned_by:      userId ?? null,
    assigned_by_name: userName ?? null,
    reason:           commentaire ?? null,
    assigned_at:      when,
    created_at:       when,
  };

  return { closedRow, newRow, type: resolvedType, noop: false };
}
