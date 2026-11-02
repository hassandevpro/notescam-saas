// ════════════════════════════════════════════════════════════════════════════
// EXPORT EXCEL D'UN SERVICE — par mois, ou année entière
// ════════════════════════════════════════════════════════════════════════════
//
// Réutilise `downloadExcelSheets` d'exportCsv.js, comme `staffExport.js` : un
// seul endroit du dépôt sait écrire un classeur, et c'est là que vit la
// dépendance `xlsx`. Rien de nouveau n'est introduit.
//
// ── DES NOMBRES, PAS DES MONTANTS FORMATÉS ─────────────────────────────────
//
// C'est la différence qui compte avec l'impression. `« 15 000 XAF »` est une
// CHAÎNE : Excel ne peut ni la sommer, ni la trier, et l'école qui pose
// `=SOMME()` dessus obtient zéro. Les colonnes d'argent portent donc des
// nombres nus, et la devise est annoncée une fois, dans l'en-tête de la
// colonne (« Attendu (XAF) »). C'est aussi pour cela que le CSV précédent ne
// suffisait pas : son séparateur `;` et ses montants déjà formatés se
// retrouvaient dans une seule colonne sur la moitié des postes.
//
// ── UNE FEUILLE PAR QUESTION ───────────────────────────────────────────────
//
// Année entière : « Par élève » (une ligne par abonné, une colonne par mois,
// plus les totaux), « Par mois » (l'état de caisse), et « Détail » (une ligne
// par élève ET par mois — c'est celle sur laquelle on fait un tableau croisé).
// Un mois : la feuille du mois seule, à l'identique de l'imprimé.
//
// Les états y sont écrits EN MOT (« Payé », « Impayé »…), pas en signe : un
// filtre Excel sur « Impayé » doit pouvoir se taper au clavier.
import { downloadExcelSheets } from './exportCsv';
import { pastilleCellule, motPeriode } from './cantineEngine';
import { SIGNES } from './serviceDoc';

// Le nom d'un fichier, sans espace ni accent — il voyage par clé USB et par
// WhatsApp, et les deux abîment le reste.
function slug(s) {
  return String(s || 'service').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'service';
}

// L'état d'une case, en mot, dans la langue de l'écran.
function motEtat(cellule, t) {
  const p = pastilleCellule(cellule);
  const d = SIGNES[p.ton] || SIGNES.vide;
  return t(d.fr, d.en, d.es);
}

// Excel n'a pas de « vide » typé : une case sans valeur reçoit la chaîne vide,
// et surtout PAS 0. Un 0 dans une colonne d'argent se somme et fausse le total
// de ceux qui filtrent avant de sommer.
const nb = (v) => (Number(v) > 0 ? Number(v) : '');

/**
 * Exporte un service en classeur Excel.
 *
 * @param {object}   o
 * @param {object}   o.service    le service ({ name, quote_part })
 * @param {Array}    o.entete     [{ period_key, label }]
 * @param {Array}    o.abonnes    [{ name, matricule, className, section, cellules[], du, paye, reste, statut }]
 * @param {Array}    o.parMois    [{ inscrits, attendu, encaisse, impaye, quotePart, moisSansService }]
 * @param {object}   o.total      { inscrits, attendu, encaisse, impaye, quotePart }
 * @param {string}  [o.moisCible] clé d'un mois → classeur DU MOIS ; absent → année
 * @param {string}   o.devise     code devise, pour les en-têtes de colonnes
 * @param {string}   o.annee      année scolaire, pour le nom du fichier
 * @param {function} o.t          i18n (fr, en, es)
 * @param {string}  [o.filtre]    libellé du filtre actif, porté dans le classeur
 */
export function exportServiceExcel({
  service, entete = [], abonnes = [], parMois = [], total = {},
  moisCible = null, devise = 'XAF', annee = '', t = (fr) => fr, filtre = '',
}) {
  const nom = service?.name || 'service';
  const quotePart = service?.quote_part ?? null;
  const mot = motPeriode(service, t);
  const j = moisCible ? entete.findIndex((e) => e.period_key === moisCible) : -1;
  const d = devise;

  // Une ligne de contexte en tête de chaque feuille : sans elle, un classeur
  // retrouvé dans six mois ne dit plus de quel service ni de quelle sélection
  // il parle.
  const contexte = [
    [t('Service', 'Service', 'Servicio'), nom],
    [t('Année', 'Year', 'Año'), annee],
    ...(j >= 0 ? [[mot.le, entete[j]?.label || moisCible]] : []),
    ...(filtre ? [[t('Sélection', 'Selection', 'Selección'), filtre]] : []),
    [t('Exporté le', 'Exported on', 'Exportado el'), new Date().toISOString().slice(0, 10)],
    [],
  ];

  if (j >= 0) {
    const m = parMois[j] || {};
    const inscrits = abonnes.filter((a) => pastilleCellule(a.cellules?.[j]).ton !== 'vide');
    const rows = [
      ...contexte,
      [
        'N°', t('Élève', 'Student', 'Alumno'), t('Matricule', 'ID', 'Matrícula'),
        t('Classe', 'Class', 'Clase'), t('Section', 'Section', 'Sección'),
        `${t('Dû', 'Due', 'Debido')} (${d})`, `${t('Payé', 'Paid', 'Pagado')} (${d})`,
        `${t('Reste', 'Balance', 'Saldo')} (${d})`, t('État', 'Status', 'Estado'),
      ],
      ...inscrits.map((a, i) => {
        const c = a.cellules?.[j];
        return [
          i + 1, a.name, a.matricule || '', a.className || '', a.section || '',
          nb(c?.montantDu), nb(c?.paye), nb(c?.reste), motEtat(c, t),
        ];
      }),
      [],
      ['', t('Total du mois', 'Month total', 'Total del mes'), '', '', '',
        nb(m.attendu), nb(m.encaisse), nb(m.impaye), ''],
    ];
    const cle = (entete[j]?.period_key || moisCible || '').replace(/[^0-9-]/g, '');
    return downloadExcelSheets(`service_${slug(nom)}_${cle}.xlsx`,
      [{ name: coupe(entete[j]?.label || cle), rows }]);
  }

  // ── Feuille 1 : par élève, une colonne par mois ─────────────────────────
  const parEleve = [
    ...contexte,
    [
      'N°', t('Élève', 'Student', 'Alumno'), t('Matricule', 'ID', 'Matrícula'),
      t('Classe', 'Class', 'Clase'), t('Section', 'Section', 'Sección'),
      ...entete.map((e) => e.label || e.period_key),
      `${t('Attendu', 'Expected', 'Esperado')} (${d})`,
      `${t('Encaissé', 'Collected', 'Cobrado')} (${d})`,
      `${t('Reste', 'Balance', 'Saldo')} (${d})`,
    ],
    ...abonnes.map((a, i) => [
      i + 1, a.name, a.matricule || '', a.className || '', a.section || '',
      ...entete.map((_, k) => motEtat(a.cellules?.[k], t)),
      nb(a.du), nb(a.paye), nb(a.reste),
    ]),
    [],
    ['', t('Total', 'Total', 'Total'), '', '', '', ...entete.map(() => ''),
      nb(total.attendu), nb(total.encaisse), nb(total.impaye)],
  ];

  // ── Feuille 2 : par mois, l'état de caisse ──────────────────────────────
  const parMoisRows = [
    ...contexte,
    [
      mot.le, t('Inscrits', 'Enrolled', 'Inscritos'),
      `${t('Attendu', 'Expected', 'Esperado')} (${d})`,
      `${t('Encaissé', 'Collected', 'Cobrado')} (${d})`,
      `${t('Impayé', 'Unpaid', 'Impago')} (${d})`,
      ...(quotePart ? [`${t('Quote-part', 'School share', 'Cuota')} (${d})`] : []),
    ],
    ...parMois.map((m, i) => [
      entete[i]?.label || entete[i]?.period_key || '',
      m.moisSansService ? '' : m.inscrits,
      nb(m.attendu), nb(m.encaisse), nb(m.impaye),
      ...(quotePart ? [nb(m.quotePart)] : []),
    ]),
    [],
    [t('Total', 'Total', 'Total'), total.inscrits || '',
      nb(total.attendu), nb(total.encaisse), nb(total.impaye),
      ...(quotePart ? [nb(total.quotePart)] : [])],
  ];

  // ── Feuille 3 : le détail, une ligne par élève ET par mois ──────────────
  // C'est la feuille d'où sort n'importe quel tableau croisé. Les mois non
  // souscrits n'y figurent pas : une ligne à zéro sur un mois où l'élève
  // n'était pas inscrit fabriquerait une dette qui n'existe pas.
  const detail = [
    ...contexte,
    [
      t('Élève', 'Student', 'Alumno'), t('Matricule', 'ID', 'Matrícula'),
      t('Classe', 'Class', 'Clase'), t('Section', 'Section', 'Sección'),
      mot.le, t(`Clé du ${mot.un}`, `${mot.le} key`, `Clave del ${mot.un}`),
      `${t('Dû', 'Due', 'Debido')} (${d})`, `${t('Payé', 'Paid', 'Pagado')} (${d})`,
      `${t('Reste', 'Balance', 'Saldo')} (${d})`, t('État', 'Status', 'Estado'),
    ],
  ];
  for (const a of abonnes) {
    entete.forEach((e, k) => {
      const c = a.cellules?.[k];
      if (pastilleCellule(c).ton === 'vide') return;
      detail.push([
        a.name, a.matricule || '', a.className || '', a.section || '',
        e.label || e.period_key, e.period_key,
        nb(c?.montantDu), nb(c?.paye), nb(c?.reste), motEtat(c, t),
      ]);
    });
  }

  return downloadExcelSheets(`service_${slug(nom)}_${slug(annee) || 'annee'}.xlsx`, [
    { name: coupe(t('Par élève', 'By student', 'Por alumno')), rows: parEleve },
    { name: coupe(mot.parX), rows: parMoisRows },
    { name: coupe(t('Détail', 'Detail', 'Detalle')), rows: detail },
  ]);
}

// Excel refuse un nom d'onglet de plus de 31 caractères, et les caractères
// `:\/?*[]`. Un classeur qui ne s'ouvre pas vaut moins qu'un onglet au nom
// tronqué.
function coupe(s) {
  return String(s || 'Feuille').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);
}
