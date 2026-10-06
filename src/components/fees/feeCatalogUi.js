// Libellés i18n du catalogue de frais.
export const FEE_CATEGORY_LABELS = {
  inscription: ['Inscription', 'Registration', 'Matrícula'],
  scolarite: ['Scolarité', 'Tuition', 'Escolaridad'],
  apee: ['APEE', 'PTA', 'APEE'],
  tenue: ['Tenue scolaire', 'Uniform', 'Uniforme'],
  cantine: ['Cantine', 'Canteen', 'Comedor'],
  transport: ['Transport scolaire', 'Transport', 'Transporte'],
  internat: ['Internat', 'Boarding', 'Internado'],
  soutien: ['Cours de soutien', 'Tutoring', 'Refuerzo'],
  activites: ['Activités extrascolaires', 'Extracurricular', 'Extraescolares'],
  bibliotheque: ['Bibliothèque', 'Library', 'Biblioteca'],
  assurance: ['Assurance', 'Insurance', 'Seguro'],
  sortie: ['Sortie pédagogique', 'Field trip', 'Excursión'],
  autre: ['Autre', 'Other', 'Otro'],
};

export const PAYMENT_TYPE_LABELS = {
  unique: ['Paiement unique', 'One-off', 'Pago único'],
  echelonne: ['Échelonné', 'Instalments', 'A plazos'],
};

// ── Statuts d'une ÉCHÉANCE (une période d'un frais périodique) ───────────────
// `due`, `partial` et `paid` se DÉDUISENT des versements ; les trois derniers
// sont des décisions que l'école pose elle-même.
export const SCHEDULE_STATUS_LABELS = {
  due:            ['À payer', 'Due', 'A pagar'],
  partial:        ['Partiellement payé', 'Partly paid', 'Pago parcial'],
  paid:           ['Payé', 'Paid', 'Pagado'],
  exempted:       ['Exempté', 'Exempted', 'Exento'],
  abandoned:      ['Abandonné', 'Dropped', 'Abandonado'],
  not_applicable: ['Non applicable', 'Not applicable', 'No aplicable'],
};

// Ce qu'une décision veut dire pour la famille — affiché sous chaque choix, parce
// qu'« exempté » et « non applicable » produisent le même solde et se confondent
// vite au guichet, alors qu'ils ne racontent pas la même chose.
export const SCHEDULE_STATUS_HINTS = {
  due:            ['Suivi automatique : le solde se déduit des versements.',
                   'Automatic: the balance follows the payments.',
                   'Automático: el saldo sigue a los pagos.'],
  exempted:       ['L’école dispense cette famille de cette période.',
                   'The school waives this period for this family.',
                   'La escuela exime a esta familia de este periodo.'],
  abandoned:      ['La famille a quitté le service à partir de cette période.',
                   'The family left the service from this period on.',
                   'La familia dejó el servicio a partir de este periodo.'],
  not_applicable: ['Cette période n’est facturée à personne (mois non servi…).',
                   'This period is billed to nobody (month not served…).',
                   'Este periodo no se factura a nadie.'],
};

// Pourquoi une décision est refusée. `periode_payee` est la seule qui demande une
// action : contre-passer le versement d'abord.
export const SCHEDULE_REFUS_LABELS = {
  periode_payee: ['Cette période a déjà reçu un versement. Annulez-le d’abord (contre-passation) : de l’argent encaissé ne peut pas sortir du dû par un simple changement d’étiquette.',
                  'This period already received a payment. Reverse it first: money taken in cannot leave the amount owed through a relabelling.',
                  'Este periodo ya recibió un pago. Anúlelo primero: el dinero cobrado no puede salir de lo debido con una simple reetiquetación.'],
  exemption_interdite: ['Ce frais n’autorise pas les exemptions (réglage du catalogue).',
                        'This fee does not allow exemptions (catalog setting).',
                        'Esta tasa no permite exenciones (ajuste del catálogo).'],
  statut_non_posable: ['Ce statut se déduit des versements : il ne se pose pas à la main.',
                       'This status is derived from payments: it cannot be set by hand.',
                       'Este estado se deduce de los pagos: no se fija a mano.'],
  parametres_manquants: ['Information manquante : impossible d’enregistrer la décision.',
                         'Missing information: the decision cannot be saved.',
                         'Falta información: no se puede guardar la decisión.'],
  ecriture_refusee: ['Enregistrement refusé par le serveur.', 'Write refused by the server.', 'Escritura rechazada por el servidor.'],
};
