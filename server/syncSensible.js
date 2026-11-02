// CE QUI NE S'ÉCRASE PAS TOUT SEUL.
//
// La règle demandée, et la raison. « Pour les données sensibles (paiements,
// reçus, notes validées, périodes verrouillées) : jamais d'écrasement
// silencieux. » Ces deux listes sont cette phrase, rendue exécutable.
//
// Elles vivent dans leur propre fichier, et non dans le moteur de fusion, pour
// une raison pratique : c'est la liste qu'un relecteur de l'école doit pouvoir
// lire et contester sans ouvrir le moteur. Si une colonne manque ici, elle
// s'écrase en silence ; c'est donc le fichier le plus important du lot.
//
// CHAQUE NOM EST VÉRIFIÉ CONTRE `schema.sql` par `_sync_fusion.test.mjs`.
// La première version de ce fichier nommait `amount`, `amount_due`,
// `discount`, `starts_on`, `ends_on` et `promotion_decision` : SIX colonnes
// qui n'existent pas. Une liste de protection qui vise à côté ne protège
// rien — et, comme elle est muette, elle fait croire que c'est fait.

// ── TABLES EN AJOUT SEUL ───────────────────────────────────────────────────
// Une écriture comptable ne se modifie pas. Elle se CONTRE-PASSE : annuler un
// versement crée une seconde ligne de montant négatif qui pointe l'originale
// (cf. `fee_payments.reversal_of` dans schema.sql). La ligne d'origine reste,
// et la somme reste juste.
//
// Conséquence pour la synchronisation : sur ces tables, une ligne distante ne
// peut que REMPLIR un champ encore vide — le cas normal étant le numéro de
// reçu, attribué par le serveur et donc absent de la ligne tant qu'elle n'est
// pas montée. Elle ne peut JAMAIS changer un champ qui porte déjà une valeur.
// Un montant, une date d'encaissement, un nom de caissier qui changeraient
// « parce que la ligne distante est plus récente » feraient un trou dans la
// caisse que personne ne saurait expliquer.
export const TABLES_AJOUT_SEUL = new Set([
  'fee_payments',
  'deleted_fee_payments',
]);

// ── CHAMPS SENSIBLES, TABLE PAR TABLE ──────────────────────────────────────
// Ici, l'écrasement n'est pas interdit : il est interdit de le faire EN
// SILENCE. Quand les deux côtés ont modifié le même champ, on garde le local
// et on inscrit le conflit dans `sync_conflicts`, visible à l'écran. C'est à
// l'école de trancher — pas à l'ordre d'arrivée des paquets réseau.
export const CHAMPS_SENSIBLES = {
  // Une note est le travail d'un élève. Deux enseignants qui saisissent la
  // même case avec deux valeurs différentes, c'est une question à poser, pas
  // un départage à faire.
  grades: new Set(['value']),

  // `is_locked` et `status` commandent la clôture : si le Cloud les rouvre
  // pendant que l'école vient de verrouiller, les bulletins redeviennent
  // modifiables au milieu d'un conseil de classe. Les bornes de saisie
  // décident quelles notes sont encore recevables.
  academic_periods: new Set([
    'is_locked', 'status', 'teaching_start', 'teaching_end', 'entry_deadline',
    'closed_at', 'closed_by',
  ]),

  // Ce que l'élève doit et ce qu'il a versé. Un montant qui change tout seul,
  // c'est une famille à qui on réclame la mauvaise somme. `tranches` et
  // `adjustments` portent l'échéancier et les remises : même exigence.
  student_fees: new Set([
    'frais_annuels', 'frais_payes', 'tranches', 'adjustments', 'payment_mode',
  ]),

  // La caisse déclarée et contrôlée : `counted_cash`, `variance` et la
  // validation sont le résultat d'un comptage physique. Rien de distant ne
  // doit pouvoir les réécrire sans que ça se voie.
  cash_sessions: new Set([
    'opening_float', 'expected_cash', 'counted_cash', 'variance',
    'status', 'validated_at', 'validated_by', 'validated_by_name',
  ]),

  // L'archivage sort l'élève des listes actives : le refaire ou le défaire à
  // distance change la composition des classes et donc les effectifs.
  students: new Set(['archived_at', 'archived_by', 'archive_reason']),
};
