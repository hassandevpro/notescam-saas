// REGISTRE MENSUEL D'UN SERVICE À ABONNEMENT — cantine, transport, internat…
//
// L'école tient aujourd'hui un tableau Word : une ligne par élève, une colonne
// par mois, quatre conventions de lecture (`15 000`, `7 500`, `/`, `ABANDON`) et
// une ligne de quote-part sous le tableau. Tout cela existait déjà en base ; ce
// qui manquait était la PRÉSENTATION. Cet écran ne fait que la rendre.
//
// AUCUNE ÉCRITURE FINANCIÈRE NOUVELLE. Les recettes passent par `fee_payments`
// (guichet des Frais scolaires), les dépenses par `budget_expenses`. Ici on ne
// peut que LIRE la grille et POSER un statut sur une échéance — ce que l'écran
// des frais permet déjà élève par élève, et que l'école voulait voir en grille.
//
// La quote-part est CALCULÉE à la lecture et n'est écrite nulle part : elle est
// déjà contenue dans ce que paie la famille, l'enregistrer la compterait deux
// fois. Voir docs/MODULE_CANTINE.md § 4 et src/lib/cantineEngine.js.
import { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { useStrictMatrix } from '../lib/useStrictMatrix';
import { loadWithCache, writeCache } from '../lib/offlineCache';
import {
  fetchCatalog, fetchStudentFeeItems, upsertCatalogItem, upsertStudentFeeItem,
  dependancesDuService, supprimerService,
} from '../lib/feeCatalogService';
import {
  fetchSchedule, setScheduleStatus, createScheduleMonths, creerEcheancesReprise, paidForSchedule,
} from '../lib/feeScheduleService';
import { nouveauLot, dateReprise, MODE_REPRISE } from '../lib/serviceImportEngine';
import { logAction } from '../lib/historyService';
import { STATUTS_POSABLES, SCHEDULE_STATUS } from '../lib/feeScheduleEngine';
import { SCHEDULE_STATUS_LABELS, FEE_CATEGORY_LABELS } from '../components/fees/feeCatalogUi';
import EncaissementServiceModal from '../components/fees/EncaissementServiceModal';
import ServiceFicheEleve from '../components/fees/ServiceFicheEleve';
import ListeAbonnes from '../components/services/ListeAbonnes';
import GrilleMensuelle from '../components/services/GrilleMensuelle';
import ResumeService from '../components/services/ResumeService';
import FiltresRegistre from '../components/services/FiltresRegistre';
import BanniereFiltre from '../components/services/BanniereFiltre';
import ImportRegistreModal from '../components/services/ImportRegistreModal';
import ImportModeleModal, { telechargerModele } from '../components/services/ImportModeleModal';
import SupprimerServiceModal from '../components/services/SupprimerServiceModal';
// La section d'une classe est RÉSOLUE, pas stockée : `classSectionKey` connaît
// déjà CRECHE/NURSERY, SIL/CP/CE1/CE2/CM1/CM2 et leurs variantes BIL, Class 1→6,
// 6eme/FORM1… Ajouter une colonne `section` créerait une seconde vérité, qui
// divergerait de celle-ci au premier renommage de classe.
import SectionFilterSelect from '../components/SectionFilterSelect';
import { classSectionKey, SECTIONS } from '../core/engineResolver';
import {
  moisDuService, enteteMois, tarifPleinDe, grilleCantine, etatsMensuels,
  csvEtatsMensuels, motPeriode,
  // La liste des abonnés — état, filtre et tri — est DANS LE MOTEUR depuis la
  // refonte. C'était la dernière règle métier de cet écran écrite en JSX :
  // on ne pouvait pas l'exercer sans monter React, et ce dépôt n'a pas de
  // moteur de rendu. Voir `src/lib/_cantineListe.test.mjs`, qui la compare au
  // jeu d'essai champ par champ.
  listeAbonnes, filtrerAbonnes, trierAbonnes,
} from '../lib/cantineEngine';
import { printServiceEtat } from '../lib/serviceDoc';
import { exportServiceExcel } from '../lib/serviceExport';

// Services à abonnement MENSUEL : ceux dont l'école tient un registre par mois.
// La scolarité n'en est pas — elle a ses grilles tarifaires et son guichet.
const CATEGORIES_SERVICE = ['cantine', 'transport', 'tenue', 'internat', 'soutien', 'activites'];

// Recherche par NOM ou MATRICULE — même idiome que l'écran des frais
// (`Fees.jsx`), pour qu'une école qui tape « MAT07 » ici retrouve là-bas le même
// élève. La classe est acceptée en plus : « 6eme A » est la façon dont une
// école désigne un groupe d'élèves, et l'exiger autrement serait une chicane.
// Hors du composant : appelée dans des `useMemo`, une déclaration plus bas dans
// le corps lèverait une ReferenceError au rendu.
function correspond(e, q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return true;
  return (e.name || '').toLowerCase().includes(s)
    || (e.matricule || '').toLowerCase().includes(s)
    || (e.className || '').toLowerCase().includes(s);
}

export default function Cantine() {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const schoolId = school?.id;
  const year = school?.current_year || '';
  const { canCollectFees, isFinanceReader, isFinanceOfficer } = useStrictMatrix();

  const students = useSchoolStore((s) => s.students);
  const classes = useSchoolStore((s) => s.classes);
  const feePayments = useSchoolStore((s) => s.feePayments);
  const classById = useMemo(
    () => Object.fromEntries((classes || []).map((c) => [c.id, c])), [classes]);

  const [catalog, setCatalog] = useState([]);
  const [serviceId, setServiceId] = useState('');
  const [echeances, setEcheances] = useState([]);
  const [abonnements, setAbonnements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState(null);
  const [cellule, setCellule] = useState(null);     // case ouverte pour décision
  // Le registre se suffit à lui-même : créer le service et y abonner des élèves
  // se fait ICI. Il renvoyait vers « Frais scolaires » → Catalogue, l'écran
  // justement réservé à la pension et à l'inscription (règle du 31/10/2026) —
  // une impasse : l'école ne pouvait pas créer sa cantine sans passer par
  // l'écran dont elle doit sortir.
  const [form, setForm] = useState(null);           // création / modification
  const [abonnementOuvert, setAbonnementOuvert] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const [importModeleOuvert, setImportModeleOuvert] = useState(false);
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [choix, setChoix] = useState(() => new Set());
  const [debut, setDebut] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [rechercheAbo, setRechercheAbo] = useState('');     // qui abonner
  const [rechercheGrille, setRechercheGrille] = useState(''); // qui est dans la grille
  const [sectionGrille, setSectionGrille] = useState('');
  const [classeGrille, setClasseGrille] = useState('');
  // Filtrer PAR ÉTAT, et pas seulement trier : la secrétaire qui relance les
  // familles veut la liste des impayés, pas la liste entière commençant par
  // eux. Et comme les totaux suivent le filtre, « Impayé » lui donne du même
  // coup la somme à réclamer — à l'écran comme sur le papier.
  const [etatGrille, setEtatGrille] = useState('');
  // LA PÉRIODE REGARDÉE. Ce n'est pas un filtre — elle ne retire personne de
  // la liste —, c'est la LENTILLE par laquelle on lit « reste à payer ».
  //
  // Sans elle, depuis que les dix mois de l'année sont créés d'avance
  // (THE GENIUS, 2026-11-04), la colonne affichait le solde ANNUEL : environ
  // 120 000 XAF en face de chaque nom, et plus personne ne voyait qui n'avait
  // pas payé le mois en cours. Vide = l'année entière.
  const [periodeVue, setPeriodeVue] = useState('');
  const [sectionAbo, setSectionAbo] = useState('');
  const [classeAbo, setClasseAbo] = useState('');
  const [moisChoisis, setMoisChoisis] = useState(() => new Set()); // mois à facturer
  const [encaisse, setEncaisse] = useState(null);   // ligne de grille en cours d'encaissement
  const [fiche, setFiche] = useState(null);         // fiche élève ouverte
  // L'onglet courant. « liste » par défaut : c'est la vue dont la secrétaire a
  // besoin pour ses trois gestes — trouver un élève, encaisser, imprimer.
  const [onglet, setOnglet] = useState('liste');
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  // Le mois en cours, pour le surligner dans la grille : c'est celui qu'on
  // encaisse dans la grande majorité des cas.
  const moisCourant = new Date().toISOString().slice(0, 7);

  // ── Chargement ────────────────────────────────────────────────────────────
  const cleCatalogue = `nc_feecatalog_${schoolId}_${year}`;

  const poserCatalogue = useCallback((rows, idVoulu) => {
    const services = (rows || []).filter((r) => CATEGORIES_SERVICE.includes(r.category));
    setCatalog(services);
    setServiceId((id) => {
      if (idVoulu) return idVoulu;
      if (id && services.some((s) => s.id === id)) return id;
      return services.find((s) => s.category === 'cantine')?.id || services[0]?.id || '';
    });
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    let vivant = true;
    (async () => {
      const { rows } = await loadWithCache(
        cleCatalogue, () => fetchCatalog(schoolId, { yearLabel: year }));
      if (vivant) poserCatalogue(rows);
    })();
    return () => { vivant = false; };
  }, [schoolId, year, cleCatalogue, poserCatalogue]);

  // Après une écriture, on relit SANS passer par le cache et on le réécrit.
  // Sans cela le service qu'on vient de créer disparaîtrait au prochain
  // affichage, resservi par la liste d'avant.
  const rechargerCatalogue = useCallback(async (idVoulu) => {
    const rows = await fetchCatalog(schoolId, { yearLabel: year });
    if (Array.isArray(rows) && rows.length) writeCache(cleCatalogue, rows);
    poserCatalogue(rows, idVoulu);
  }, [schoolId, year, cleCatalogue, poserCatalogue]);

  const recharger = useCallback(async () => {
    if (!schoolId) { setChargement(false); return; }
    setChargement(true);
    // Les deux ensemble : `fee_schedule_items` ne porte PAS le catalogue, c'est
    // l'abonnement qui fait le lien. Sans les abonnements on ne saurait pas
    // distinguer l'échéance de cantine de celle du transport, du même mois.
    const [lignes, items] = await Promise.all([
      fetchSchedule(schoolId, { yearLabel: year }),
      fetchStudentFeeItems(schoolId, { yearLabel: year }),
    ]);
    setEcheances(lignes || []);
    setAbonnements(items || []);
    setChargement(false);
  }, [schoolId, year]);

  useEffect(() => { recharger(); }, [recharger]);

  // ── Le service choisi, ses mois, son tarif ────────────────────────────────
  const service = useMemo(
    () => catalog.find((c) => c.id === serviceId) || null, [catalog, serviceId]);
  const mois = useMemo(() => moisDuService(service, year), [service, year]);
  const entete = useMemo(() => enteteMois(mois), [mois]);
  const tarifPlein = tarifPleinDe(service);
  // Le vocabulaire suit la PÉRIODICITÉ du service : « Grille trimestrielle »
  // pour le transport de THE GENIUS, « Grille mensuelle » pour la cantine.
  const mot = useMemo(() => motPeriode(service, t), [service, t]);
  const quotePart = service?.quote_part ?? null;

  // Échéances DE CE SERVICE, et d'aucun autre : l'abonnement porte
  // `fee_catalog_id`, l'échéance porte `student_fee_item_id`. On joint les deux.
  const idsAbonnement = useMemo(() => new Set(
    abonnements.filter((a) => a.fee_catalog_id === serviceId).map((a) => a.id),
  ), [abonnements, serviceId]);

  const echeancesDuService = useMemo(
    () => echeances.filter((l) => idsAbonnement.has(l.student_fee_item_id)),
    [echeances, idsAbonnement]);

  // ── Les élèves présents dans la grille ────────────────────────────────────
  //
  // EST DANS LE REGISTRE QUI EST ABONNÉ, pas qui est déjà facturé.
  //
  // Le critère retenu était « avoir au moins une échéance pour ce service ».
  // Un élève qu'on vient d'abonner et dont les mois ne sont pas encore créés
  // n'apparaissait donc NULLE PART : ni dans la liste, ni dans la grille, ni
  // dans le compte annoncé. La secrétaire l'abonnait, l'écran ne bougeait pas,
  // et rien ne disait pourquoi. C'est aussi ce qui rendait l'état « Rien dû »
  // inatteignable à l'écran, alors que le composant sait le peindre et que le
  // bouton « Encaisser » sait s'éteindre pour lui.
  //
  // Trouvé par `e2e/02-registre-services` : 320 abonnés amorcés, 319 affichés.
  // `grilleCantine` traite déjà le cas sans rien changer — un élève sans
  // échéance reçoit des cases « non inscrit », donc `du = 0`, donc « Rien dû ».
  const eleves = useMemo(() => {
    const abonnesAuService = new Set(
      abonnements.filter((a) => a.fee_catalog_id === serviceId && a.status !== 'removed')
        .map((a) => a.student_id));
    for (const l of echeancesDuService) abonnesAuService.add(l.student_id);
    return (students || [])
      .filter((e) => abonnesAuService.has(e.id))
      .map((e) => ({
        id: e.id,
        name: [e.last_name, e.first_name].filter(Boolean).join(' ') || e.name || '—',
        className: classById[e.class_id]?.name || '',
        matricule: e.matricule || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [students, echeancesDuService, abonnements, serviceId, classById]);

  // LE TARIF DE CHAQUE ÉLÈVE, et non celui du service. Le registre transport
  // réel de THE GENIUS porte treize tarifs mensuels (5 000 → 15 000) selon la
  // résidence : sans cette table, le moteur prenait le tarif du service pour
  // repère et étiquetait « demi-mois » presque tous les abonnés — ce qui
  // divisait leur quote-part par deux. Voir `celluleDuMois`.
  const tarifParEleve = useMemo(() => {
    const m = {};
    for (const a of abonnements) {
      if (a.fee_catalog_id !== serviceId || a.status === 'removed') continue;
      const v = Math.max(0, Math.floor(Number(a.amount ?? 0) || 0));
      if (v > 0) m[a.student_id] = v;
    }
    return m;
  }, [abonnements, serviceId]);

  const grille = useMemo(
    () => grilleCantine({
      eleves, echeances: echeancesDuService, paiements: feePayments || [],
      mois, tarifPlein, tarifParEleve,
    }),
    [eleves, echeancesDuService, feePayments, mois, tarifPlein, tarifParEleve]);

  // Section d'un élève, résolue par `classSectionKey` — la même fonction que
  // les écrans Élèves et Rapports. Pas de colonne `section` ajoutée aux
  // classes : elle serait une seconde vérité, qui divergerait de celle-ci au
  // premier renommage de classe.
  const sectionParEleve = useMemo(() => {
    const m = {};
    for (const e of students || []) m[e.id] = classSectionKey(classById[e.class_id]);
    return m;
  }, [students, classById]);

  // ── LA LISTE, PUIS LE FILTRE, PUIS LES TOTAUX ─────────────────────────────
  //
  // L'ordre a changé avec la refonte, et il le fallait. Le filtre s'appliquait
  // à la GRILLE BRUTE, et l'état de l'abonné (« Impayé », « À jour »…) était
  // calculé APRÈS, dans le JSX : on ne pouvait donc pas filtrer par état,
  // puisqu'il n'existait pas encore au moment où l'on filtrait.
  //
  // Désormais : on pose l'état sur toute la grille, on filtre ensuite, et les
  // totaux se calculent sur ce qui reste. Les trois onglets, la bannière,
  // l'impression et le classeur lisent donc tous la MÊME sélection — deux
  // chiffres contradictoires sur le même écran ne sont plus possibles.
  const abonnesTous = useMemo(
    () => listeAbonnes({ grille, sections: sectionParEleve, periode: periodeVue }),
    [grille, sectionParEleve, periodeVue]);

  const classeDe = useCallback(
    (id) => (students || []).find((e) => e.id === id)?.class_id || '',
    [students]);

  const grilleAffichee = useMemo(() => filtrerAbonnes(abonnesTous, {
    texte: rechercheGrille, section: sectionGrille, classe: classeGrille,
    etat: etatGrille, classeDe,
  }), [abonnesTous, rechercheGrille, sectionGrille, classeGrille, etatGrille, classeDe]);

  const filtreActif = Boolean(
    sectionGrille || classeGrille || etatGrille || rechercheGrille.trim());

  const effacerFiltres = useCallback(() => {
    setSectionGrille(''); setClasseGrille(''); setEtatGrille(''); setRechercheGrille('');
  }, []);

  // LES TOTAUX SUIVENT LE FILTRE — règle du responsable (2026-10-31) : « les
  // totaux doivent refléter le filtre actif ». C'est utile : une école veut le
  // total de la cantine du Primaire. Mais un total partiel présenté comme un
  // total est un faux chiffre, et c'est celui que l'école recopie dans son
  // cahier. Il est donc ANNONCÉ à l'écran dès qu'un filtre est posé, avec
  // l'effectif sur lequel il porte — voir le bandeau au-dessus du tableau.
  const { parMois, total } = useMemo(
    () => etatsMensuels({ grille: grilleAffichee, mois, quotePart }),
    [grilleAffichee, mois, quotePart]);

  // ── Poser une décision sur une case ───────────────────────────────────────
  const poser = async (statut) => {
    if (!cellule?.echeance_id) return;
    const ligne = echeancesDuService.find((l) => l.id === cellule.echeance_id);
    const r = await setScheduleStatus({
      ligne, statut, schoolId,
      allowExemption: service?.allow_exemption !== 0 && service?.allow_exemption !== false,
      payments: feePayments || [],
    });
    setCellule(null);
    if (!r?.ok) { setMessage(t('Décision refusée.', 'Decision refused.', 'Decisión rechazada.')); return; }
    setMessage(null);
    await recharger();
  };

  // ── La liste des abonnés, sous la grille ──────────────────────────────────
  // Même matière que la grille, lue autrement : la grille montre les mois, la
  // liste montre les élèves. Elle se dérive de `grilleAffichee`, donc elle suit
  // exactement les mêmes filtres — deux listes qui divergeraient sous le même
  // filtre seraient pires qu'une seule.
  // `grilleAffichee` porte déjà l'état et la section : `listeAbonnes` les a
  // posés avant le filtre (voir plus haut). La liste n'a donc plus rien à
  // recalculer — c'est ce que vérifie le critère d'acceptation n° 8.
  const abonnes = grilleAffichee;

  // Libellé traduit d'une section, ou la clé brute si elle est inconnue — mieux
  // vaut « autre » affiché tel quel qu'une case vide qu'on ne sait pas lire.
  const libelleSection = useCallback((cle) => {
    const s = SECTIONS.find((x) => x.key === cle);
    return s ? t(s.fr, s.en, s.es) : cle;
  }, [t]);

  const [tri, setTri] = useState('nom');
  const abonnesTries = useMemo(() => trierAbonnes(abonnes, tri), [abonnes, tri]);

  const STATUT_ABONNE = {
    a_jour:     ['À jour', 'Up to date', 'Al día'],
    partiel:    ['Partiel', 'Partial', 'Parcial'],
    impaye:     ['Impayé', 'Unpaid', 'Impago'],
    sans_dette: ['Rien dû', 'Nothing due', 'Nada debido'],
  };

  const exporterAbonnes = () => {
    const sep = ';';
    const lignes = [[
      t('Élève', 'Student', 'Alumno'), t('Matricule', 'ID', 'Matrícula'),
      t('Classe', 'Class', 'Clase'), t('Section', 'Section', 'Sección'),
      t('Mois créés', 'Months billed', 'Meses'), t('Attendu', 'Expected', 'Esperado'),
      t('Encaissé', 'Collected', 'Cobrado'), t('Reste', 'Balance', 'Saldo'),
      t('Statut', 'Status', 'Estado'),
    ].join(sep)];
    for (const a of abonnesTries) {
      lignes.push([
        a.name, a.matricule || '', a.className || '', a.section,
        a.moisCrees, a.du, a.paye, a.reste, t(...STATUT_ABONNE[a.statut]),
      ].join(sep));
    }
    // BOM : sans lui, Excel francophone rend « Février » illisible.
    const csv = '﻿' + lignes.join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `abonnes-${service?.name || 'service'}-${year}.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── IMPRIMER / EXPORTER, AUX DEUX PORTÉES ────────────────────────────────
  // « en fonction du mois et l'année entière » (responsable, 2026-10-31). La
  // portée est un CHOIX EXPLICITE, pas une devinette d'après l'onglet ouvert :
  // on imprime la feuille d'octobre depuis n'importe quel onglet, et une école
  // qui veut l'année ne doit pas avoir à changer d'écran pour l'obtenir.
  // Par défaut le MOIS COURANT s'il est facturé — c'est la feuille qu'on
  // réclame neuf fois sur dix — sinon l'année.
  const [portee, setPortee] = useState('annee');
  useEffect(() => {
    setPortee(entete.some((e) => e.period_key === moisCourant) ? moisCourant : 'annee');
  }, [entete, moisCourant]);

  // La période regardée suit la même règle que la portée d'impression : le
  // mois courant s'il est facturé, l'année sinon. On la recale quand le
  // service change, sinon un mois de la cantine resterait sélectionné sur un
  // transport trimestriel, et la liste n'aurait plus aucune case à lire.
  useEffect(() => {
    setPeriodeVue((p) => {
      if (p && entete.some((e) => e.period_key === p)) return p;
      return entete.some((e) => e.period_key === moisCourant) ? moisCourant : '';
    });
  }, [entete, moisCourant]);

  // CHANGER DE MOIS À L'ÉCRAN CHANGE AUSSI CE QU'ON IMPRIME. On regarde
  // novembre, on imprime novembre : l'inverse serait un piège. La portée reste
  // néanmoins modifiable seule sous « ⋯ Plus » — imprimer la feuille d'octobre
  // depuis l'écran de novembre doit rester possible, c'est une décision prise
  // le 2026-10-31 et on ne la défait pas.
  const choisirPeriode = useCallback((v) => {
    setPeriodeVue(v);
    setPortee(v || 'annee');
  }, []);

  // Le libellé du mois regardé, pour que l'écran dise de quoi il parle.
  const libellePeriodeVue = useMemo(() => (
    periodeVue
      ? (entete.find((e) => e.period_key === periodeVue)?.label || periodeVue)
      : t('toute l’année', 'the whole year', 'todo el año')
  ), [periodeVue, entete, t]);

  // Le filtre actif est PORTÉ sur le papier et dans le classeur : un état
  // partiel qu'on prend pour l'état du service entier est un faux chiffre, et
  // il voyage — on le classe, on le recopie.
  const libelleFiltre = useMemo(() => {
    if (!filtreActif) return '';
    return [
      sectionGrille ? `${t('Section', 'Section', 'Sección')} : ${libelleSection(sectionGrille)}` : '',
      classeGrille ? `${t('Classe', 'Class', 'Clase')} : ${classById[classeGrille]?.name || classeGrille}` : '',
      rechercheGrille.trim() ? `${t('Recherche', 'Search', 'Búsqueda')} : « ${rechercheGrille.trim()} »` : '',
    ].filter(Boolean).join(' · ');
  }, [filtreActif, sectionGrille, classeGrille, rechercheGrille, classById, libelleSection, t]);

  const argumentsEtat = () => ({
    school, service, entete, abonnes: abonnesTries, parMois, total,
    moisCible: portee === 'annee' ? null : portee,
    quotePart, tarifPlein, filtre: libelleFiltre, lang: school?.language,
    currency: school?.currency,
  });

  const imprimerEtat = () => {
    if (!printServiceEtat(argumentsEtat())) {
      setMessage(t('Le navigateur a bloqué la fenêtre d’impression.',
        'The browser blocked the print window.', 'El navegador bloqueó la ventana.'));
    }
  };

  const exporterExcel = () => exportServiceExcel({
    service, entete, abonnes: abonnesTries, parMois, total,
    moisCible: portee === 'annee' ? null : portee,
    devise: school?.currency || 'XAF', annee: year, t, filtre: libelleFiltre,
  });

  const exporter = () => {
    const csv = csvEtatsMensuels({ parMois, total, devise: school?.currency || 'XAF' });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${service?.name || 'service'}-${year}.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(url);
  };

  const statutLabel = (s) => t(...(SCHEDULE_STATUS_LABELS[s] || [s]));

  // ── Créer ou corriger le service ──────────────────────────────────────────
  // `periodicity: 'mensuel'` n'est pas un détail : c'est elle qui donne au
  // service un échéancier, donc un registre. Sans elle `generateSchedule` sort
  // immédiatement et la grille resterait vide sans rien dire.
  const enregistrerService = async (e) => {
    e.preventDefault();
    const nom = (form?.name || '').trim();
    if (!nom) return;
    setOccupe(true);
    const existant = form.id ? catalog.find((c) => c.id === form.id) : null;
    const saved = await upsertCatalogItem({
      ...(existant || {}),
      id: form.id || undefined,
      school_id: schoolId, academic_year: year,
      name: nom, category: form.category,
      amount: Number(form.amount) || 0,
      quote_part: form.quote_part,
      periodicity: 'mensuel', payment_type: 'echelonne',
      mandatory: false, optional: true, active: true,
    });
    setOccupe(false);
    if (!saved) {
      setMessage(t('Enregistrement refusé.', 'Save refused.', 'Registro rechazado.'));
      return;
    }
    setMessage(null);
    setForm(null);
    await rechargerCatalogue(saved.id);
  };

  // Élèves pas encore abonnés à CE service — on ne propose pas deux fois le
  // même, un second abonnement poserait un second échéancier pour les mêmes mois.
  const dejaAbonnes = useMemo(() => new Set(
    abonnements.filter((a) => a.fee_catalog_id === serviceId && a.status !== 'removed')
      .map((a) => a.student_id),
  ), [abonnements, serviceId]);

  // Tous les élèves de la base, abonnés compris. `candidats` ne sert qu'à
  // l'abonnement manuel et exclut les abonnés ; le rapprochement d'un import a
  // besoin de les voir, sinon un élève déjà abonné serait rapporté comme
  // « introuvable en base » et l'école le chercherait pour rien.
  const elevesBase = useMemo(() => (students || []).map((e) => ({
    id: e.id,
    name: [e.last_name, e.first_name].filter(Boolean).join(' ') || e.name || '—',
    className: classById[e.class_id]?.name || '',
    matricule: e.matricule || '',
    created_at: e.created_at || null,
  })), [students, classById]);

  const candidats = useMemo(() => (students || [])
    .filter((e) => !dejaAbonnes.has(e.id))
    .map((e) => ({
      id: e.id,
      name: [e.last_name, e.first_name].filter(Boolean).join(' ') || e.name || '—',
      className: classById[e.class_id]?.name || '',
      matricule: e.matricule || '',
      class_id: e.class_id || null,
      created_at: e.created_at || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr')), [students, dejaAbonnes, classById]);

  const candidatsFiltres = useMemo(
    () => candidats.filter((c) => {
      if (sectionAbo && classSectionKey(classById[c.class_id]) !== sectionAbo) return false;
      if (classeAbo && c.class_id !== classeAbo) return false;
      return correspond(c, rechercheAbo);
    }),
    [candidats, rechercheAbo, sectionAbo, classeAbo, classById]);

  // Classes proposées : celles de la section choisie, et elles seules. Une liste
  // de soixante classes dont cinquante-cinq sont hors section n'est pas un
  // filtre, c'est un obstacle.
  const classesDeSection = useCallback(
    (section) => (classes || []).filter((c) => !section || classSectionKey(c) === section),
    [classes]);

  // Par défaut, le service commence en septembre de l'année scolaire : c'est ce
  // que dit le cahier de l'école. Mettre « aujourd'hui » ferait disparaître les
  // mois déjà servis ; la date reste modifiable avant de valider.
  const debutParDefaut = `${String(year).split('-')[0] || ''}-09-01`;

  // UN SEUL mois coché par défaut : celui en cours s'il est servi, sinon le
  // premier du service. Tout cocher par défaut reviendrait à reconduire la
  // facturation d'office que l'on vient d'enlever, d'un clic distrait.
  const moisParDefaut = useMemo(() => {
    if (!mois.length) return null;
    const courant = new Date().toISOString().slice(0, 7);
    return mois.includes(courant) ? courant : mois[0];
  }, [mois]);

  // ABONNER NE FACTURE QUE LES MOIS COCHÉS. L'année entière était posée d'office
  // — dix mois dus dès la souscription. Le registre de l'école dit le contraire :
  // ses effectifs vont de 22 à 37 selon le mois. Une dette que personne n'a
  // contractée est pire qu'une donnée manquante : elle se réclame au parent.
  // ── ÉCRIRE UN IMPORT ─────────────────────────────────────────────────
  //
  // Même chemin que l'abonnement manuel : `upsertStudentFeeItem` puis, si
  // l'école a coché des mois, `createScheduleMonths`. Rien de neuf côté base.
  //
  // CE QUI CHANGE : le montant. Il vient du registre de l'école — treize tarifs
  // différents selon la résidence — et non du tarif unique du service. C'est la
  // colonne `amount` de `student_fee_items`, que le moteur d'échéances lit déjà
  // en priorité sur celui du catalogue.
  //
  // Les échecs sont COMPTÉS ET RAPPORTÉS un par un. Un import qui annonce
  // « terminé » en ayant perdu douze lignes est pire qu'un import qui échoue.
  const ecrireImport = async ({ prets = [], mois: moisVoulus = [] }) => {
    if (!service || !prets.length) return { abonnes: 0, echeances: 0, echecs: 0, detailEchecs: [] };
    let abonnes = 0;
    let echeances = 0;
    const detailEchecs = [];
    for (const ligne of prets) {
      const saved = await upsertStudentFeeItem({
        school_id: schoolId, student_id: ligne.student_id, fee_catalog_id: service.id,
        academic_year: year, name: service.name, category: service.category,
        // LE TARIF DE CET ÉLÈVE, pas celui du service.
        amount: Number(ligne.abonnement?.amount) || 0,
        mandatory: false, payment_type: 'echelonne', status: 'active',
        started_at: ligne.abonnement?.started_at || debutParDefaut,
      }).catch(() => null);
      if (!saved) { detailEchecs.push(`${ligne.nom} — abonnement refusé par la base`); continue; }
      abonnes += 1;
      if (moisVoulus.length) {
        const r = await createScheduleMonths({
          schoolId, catalogItem: service, studentFeeItem: saved,
          periodKeys: moisVoulus, enrolledAt: ligne.eleveBase?.created_at || null,
        }).catch(() => ({ crees: 0 }));
        echeances += r.crees || 0;
      }
    }
    // La page doit RELIRE : sans ça, la grille afficherait encore l'état d'avant
    // et l'école croirait l'import perdu.
    await recharger();
    return { abonnes, echeances, echecs: detailEchecs.length, detailEchecs };
  };

  // ── IMPORT PAR LE MODÈLE : montants dus et versements de reprise ─────────
  //
  // Ordre : abonnements → échéances (montant dû DU FICHIER) → versements. Chaque
  // versement est un versement de REPRISE : daté du 1er du mois, mode 'reprise',
  // référence = identifiant du lot. Il passe par `addPayment` (file hors-ligne,
  // journal, synchro, numéro de reçu), donc se synchronise comme tout versement,
  // mais l'arrêté de caisse l'ignore (cf. cashSessionEngine). Les échecs sont
  // comptés et rapportés un par un.
  const ecrireModele = async (plan) => {
    const retenues = plan?.retenues || [];
    if (!service || !retenues.length) return { lot: null, abonnes: 0, echeances: 0, versements: 0, total: 0, echecs: 0, detailEchecs: [], importees: [] };
    const lot = nouveauLot();
    const detailEchecs = [];
    const libelle = Object.fromEntries(entete.map((e) => [e.period_key, e.label]));

    // 1. Abonnements manquants — une fois par élève, démarrant au 1er mois du fichier.
    const aboParEleve = new Map();
    for (const l of retenues) if (l.abonnement) aboParEleve.set(l.student_id, l.abonnement.id);
    const parEleve = new Map();
    for (const l of retenues) parEleve.set(l.student_id, [...(parEleve.get(l.student_id) || []), l]);
    let abonnes = 0;
    for (const [sid, lignes] of parEleve) {
      if (aboParEleve.has(sid)) continue;
      const premier = lignes.map((l) => l.period_key).sort()[0];
      const saved = await upsertStudentFeeItem({
        school_id: schoolId, student_id: sid, fee_catalog_id: service.id, academic_year: year,
        name: service.name, category: service.category, amount: lignes[0].du,
        mandatory: false, payment_type: 'echelonne', status: 'active',
        started_at: dateReprise(premier) || debutParDefaut,
      }).catch(() => null);
      if (!saved) { detailEchecs.push(`${lignes[0].nom} — abonnement refusé par la base`); continue; }
      aboParEleve.set(sid, saved.id);
      abonnes += 1;
    }

    // 2. Échéances manquantes, au montant dû du fichier.
    const aCreer = retenues.filter((l) => l.creerEcheance && aboParEleve.has(l.student_id)).map((l) => ({
      student_id: l.student_id, student_fee_item_id: aboParEleve.get(l.student_id),
      academic_year: year, period_key: l.period_key,
      period_label: libelle[l.period_key] || l.period_key, amount_due: l.du,
    }));
    const { creees, echecs: echecsEch } = await creerEcheancesReprise({ schoolId, lot, lignes: aCreer });
    if (echecsEch.length) detailEchecs.push(`${echecsEch.length} échéance(s) refusée(s) par la base`);
    const idEch = new Map(creees.map((e) => [`${e.student_id}|${e.period_key}`, e.id]));

    // 3. Versements de reprise (l'écart seulement).
    const { addPayment } = useSchoolStore.getState();
    let versements = 0; let total = 0; const importees = [];
    for (const l of retenues) {
      const echeanceId = l.echeance?.id || idEch.get(`${l.student_id}|${l.period_key}`);
      if (!echeanceId) { detailEchecs.push(`${l.nom} (${l.period_key}) — échéance introuvable`); continue; }
      if (l.versement > 0) {
        const rec = await addPayment(l.student_id, {
          amount: l.versement, date: dateReprise(l.period_key),
          note: `Reprise ${service.name} ${libelle[l.period_key] || l.period_key} — ${lot}`,
          student_fee_item_id: aboParEleve.get(l.student_id) || null,
          fee_schedule_item_id: echeanceId, method: MODE_REPRISE, reference: lot,
        }).catch(() => null);
        if (!rec) { detailEchecs.push(`${l.nom} (${l.period_key}) — versement refusé`); continue; }
        versements += 1; total += l.versement;
      }
      importees.push(l);
    }
    logAction({ action: 'create', table: 'fee_payments', target_id: lot, details: {
      source: 'import_registre', lot, service: service.name, annee: year,
      echeances: creees.length, versements, total, echecs: detailEchecs.length,
    } });
    await recharger();
    return {
      lot, abonnes, echeances: creees.length, versements, total,
      echecs: detailEchecs.length, detailEchecs, importees,
    };
  };

  // Le dernier lot de reprise de CE service, tel que la base le porte.
  const dernierLot = useMemo(() => {
    const echIds = new Set(echeancesDuService.map((l) => l.id));
    const parLot = new Map();
    for (const p of feePayments || []) {
      if (p.method !== MODE_REPRISE || !p.reference || !echIds.has(p.fee_schedule_item_id)) continue;
      const g = parLot.get(p.reference) || { lot: p.reference, versements: 0, total: 0, date: '', crea: '' };
      if (!p.reversal_of) {
        g.versements += 1;
        if (String(p.created_at || '') > g.crea) { g.crea = String(p.created_at); g.date = g.crea.slice(0, 10); }
      }
      g.total += Number(p.amount) || 0;
      parLot.set(p.reference, g);
    }
    const lots = [...parLot.values()].filter((g) => g.total > 0);
    return lots.sort((a, b) => String(b.crea).localeCompare(String(a.crea)))[0] || null;
  }, [feePayments, echeancesDuService]);

  // Annulation d'un lot : chaque versement est CONTRE-PASSÉ (motif et auteur
  // tracés, daté de l'écriture d'origine, hors caisse), puis les échéances que ce
  // lot a créées passent en « non applicable » si plus rien n'y est versé.
  const annulerLot = async (g) => {
    const { reversePayment } = useSchoolStore.getState();
    const tous = useSchoolStore.getState().feePayments || [];
    const dejaAnnules = new Set(tous.filter((p) => p.reversal_of).map((p) => p.reversal_of));
    const aAnnuler = tous.filter((p) => p.reference === g.lot && p.method === MODE_REPRISE && !p.reversal_of && !dejaAnnules.has(p.id));
    let annules = 0; let echecs = 0;
    for (const p of aAnnuler) {
      const ok = await reversePayment(p.id, p.student_id, `Annulation de l'import ${g.lot}`).catch(() => null);
      if (ok) annules += 1; else echecs += 1;
    }
    const paiementsApres = useSchoolStore.getState().feePayments || [];
    let neutralisees = 0;
    for (const l of echeances.filter((x) => x.notes === g.lot)) {
      if (paidForSchedule(l.id, paiementsApres) > 0) continue;
      const r = await setScheduleStatus({ ligne: l, statut: 'not_applicable', schoolId, payments: paiementsApres }).catch(() => ({ ok: false }));
      if (r?.ok) neutralisees += 1;
    }
    logAction({ action: 'void', table: 'fee_payments', target_id: g.lot, details: { source: 'annulation_import', lot: g.lot, annules, echecs, echeances: neutralisees } });
    await recharger();
    return { annules, echecs, echeances: neutralisees };
  };

  const abonnerChoisis = async () => {
    if (!service || !choix.size) return;
    if (!moisChoisis.size) {
      setMessage(t('Choisissez au moins un mois à facturer.',
                   'Pick at least one month to bill.',
                   'Elija al menos un mes a facturar.'));
      return;
    }
    setOccupe(true);
    const voulus = [...moisChoisis];
    let abonnes = 0;
    let echeancesPosees = 0;
    const refuses = new Set();
    for (const sid of choix) {
      const eleve = candidats.find((c) => c.id === sid);
      const saved = await upsertStudentFeeItem({
        school_id: schoolId, student_id: sid, fee_catalog_id: service.id,
        academic_year: year, name: service.name, category: service.category,
        amount: Number(service.amount) || 0,
        mandatory: false, payment_type: 'echelonne', status: 'active',
        started_at: debut || debutParDefaut,
      });
      if (!saved) continue;
      abonnes += 1;
      const r = await createScheduleMonths({
        schoolId, catalogItem: service, studentFeeItem: saved,
        periodKeys: voulus, enrolledAt: eleve?.created_at || null,
      }).catch(() => ({ crees: 0, ignores: [] }));
      echeancesPosees += r.crees;
      (r.ignores || []).forEach((k) => refuses.add(k));
    }
    setOccupe(false);
    setChoix(new Set());
    setAbonnementOuvert(false);

    // Tout ce qui n'a pas eu lieu est dit. Un mois coché qui n'apparaît pas dans
    // la grille, sans un mot, laisserait croire à une perte de données.
    if (!abonnes) {
      setMessage(t('Aucun abonnement enregistré.', 'No subscription saved.', 'Ninguna suscripción guardada.'));
    } else if (refuses.size) {
      setMessage(t(
        `Mois écartés car antérieurs au début du service : ${[...refuses].join(', ')}.`,
        `Months skipped (before the service start): ${[...refuses].join(', ')}.`,
        `Meses omitidos (anteriores al inicio): ${[...refuses].join(', ')}.`));
    } else if (!echeancesPosees) {
      setMessage(t('Ces mois étaient déjà facturés pour ces élèves — rien n’a été ajouté.',
                   'Those months were already billed for these students — nothing added.',
                   'Esos meses ya estaban facturados — no se añadió nada.'));
    } else {
      setMessage(null);
    }
    await recharger();
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  if (!isFinanceReader && school?.strict_role_enforcement) {
    return (
      <Layout><div className="max-w-md mx-auto py-24 text-center text-gray-500">
        <div className="text-3xl mb-2">🔒</div>
        <p className="text-sm">
          {t("Cet écran montre de l'argent : il demande une autorité financière.",
             'This screen shows money: it requires financial authority.',
             'Esta pantalla muestra dinero: requiere autoridad financiera.')}
        </p>
      </div></Layout>
    );
  }

  return (
    <Layout>
      {/* ── EN-TÊTE : UNE SEULE ACTION PRINCIPALE ─────────────────────────────
          Avant, six boutons au même niveau — Nouveau service, Modifier,
          Abonner, Exporter — plus le tarif plein et la quote-part affichés en
          permanence. La secrétaire a trois gestes à faire : trouver un élève,
          encaisser, imprimer. Le reste est rare : il passe sous « ⋯ Plus ».  */}
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">
            {t('Registre des services', 'Service register', 'Registro de servicios')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{year || '—'}</p>
        </div>

        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
            {t('Service', 'Service', 'Servicio')}
          </span>
          <select
            className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            {catalog.length === 0 && <option value="">—</option>}
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {t(...(FEE_CATEGORY_LABELS[c.category] || [c.category]))}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-end gap-2 self-end">
          {canCollectFees && service && (
            <button
              type="button" disabled={occupe}
              onClick={() => setEncaisse({ libre: true })}
              className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              + {t('Encaisser un paiement', 'Collect a payment', 'Cobrar un pago')}
            </button>
          )}

          {/* LES ACTIONS RARES, repliées. Un <details> plutôt qu'un menu
              maison : il se ferme à l'Échap, se navigue au clavier et ne coûte
              aucune dépendance. */}
          <details className="relative">
            <summary className="min-h-[44px] flex items-center rounded-lg border border-slate-300 dark:border-slate-600 px-3 text-sm cursor-pointer list-none select-none">
              ⋯ {t('Plus', 'More', 'Más')}
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-lg space-y-1">
              {service && (
                <div className="px-2 py-1.5 text-xs text-slate-500 border-b border-slate-100 dark:border-slate-700 mb-1">
                  <div>{t('Tarif plein', 'Full rate', 'Tarifa completa')} : <b>{money(tarifPlein)}</b></div>
                  <div>
                    {t('Quote-part', 'School share', 'Cuota')} :{' '}
                    {quotePart ? <b>{money(quotePart)}</b>
                      : <span className="italic">{t('non renseignée', 'not set', 'sin definir')}</span>}
                  </div>
                </div>
              )}
              {canCollectFees && (
                <>
                  <button
                    type="button" disabled={occupe}
                    onClick={() => { setAbonnementOuvert(false); setForm({ name: '', category: 'cantine', amount: '', quote_part: '' }); }}
                    className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    + {t('Nouveau service', 'New service', 'Nuevo servicio')}
                  </button>
                  {service && (
                    <button
                      type="button" disabled={occupe}
                      onClick={() => {
                        setAbonnementOuvert(false);
                        setForm({
                          id: service.id, name: service.name, category: service.category,
                          amount: service.amount ?? '', quote_part: service.quote_part ?? '',
                        });
                      }}
                      className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                    >
                      {t('Modifier le service et son tarif', 'Edit the service and its rate', 'Modificar el servicio')}
                    </button>
                  )}
                  {service && (
                    <button
                      type="button" disabled={occupe}
                      onClick={() => {
                        setForm(null);
                        setDebut(debutParDefaut);
                        setMoisChoisis(new Set(moisParDefaut ? [moisParDefaut] : []));
                        setAbonnementOuvert((v) => !v);
                      }}
                      className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                    >
                      {t('Abonner des élèves', 'Subscribe students', 'Suscribir alumnos')}
                    </button>
                  )}
                </>
              )}
              {/* La PORTÉE d'abord : ce qu'on imprime dépend d'elle, et la
                  lire après avoir cliqué serait trop tard. */}
              <label className="block px-2 pt-1 pb-2">
                <span className="block text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                  {t('Portée', 'Scope', 'Alcance')}
                </span>
                <select
                  value={portee} onChange={(e) => setPortee(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                >
                  <option value="annee">{t('Année entière', 'Whole year', 'Año completo')}</option>
                  {entete.map((e) => (
                    <option key={e.period_key} value={e.period_key}>{e.label || e.period_key}</option>
                  ))}
                </select>
              </label>
              <button
                type="button" onClick={imprimerEtat} disabled={!entete.length}
                className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                {t('Imprimer l’état', 'Print the statement', 'Imprimir el estado')} (PDF)
              </button>
              <button
                type="button" onClick={exporterExcel} disabled={!entete.length}
                className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                {t('Exporter', 'Export', 'Exportar')} (Excel)
              </button>
              <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
              <button
                type="button" onClick={() => telechargerModele({ service, annee: year, classes: (classes || []).map((c) => ({ id: c.id, name: c.name })), mois: entete, devise: school?.currency || 'XAF' })}
                disabled={!service || !entete.length} data-role="import-modele-telecharger"
                className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                {t('Télécharger le modèle d’import', 'Download the import template', 'Descargar el modelo de importación')} (Excel)
              </button>
              <button
                type="button" onClick={() => setImportModeleOuvert(true)} disabled={!service || !entete.length}
                data-role="import-modele"
                className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                {t('Importer avec le modèle', 'Import with the template', 'Importar con el modelo')} (Excel)
              </button>
              <button
                type="button" onClick={() => setImportOuvert(true)} disabled={!service}
                data-role="import"
                className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                {t('Importer un registre', 'Import a register', 'Importar un registro')} (Excel)
              </button>
              <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
              <button
                type="button" onClick={exporter} disabled={!parMois.length}
                className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                {t('Exporter la grille', 'Export the grid', 'Exportar la cuadrícula')} (CSV)
              </button>
              <button
                type="button" onClick={exporterAbonnes} disabled={!abonnesTries.length}
                className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                {t('Exporter les abonnés', 'Export subscribers', 'Exportar suscritos')} (CSV)
              </button>
              {/* ── SUPPRIMER ────────────────────────────────────────────────
                  En bas, détaché, et réservé à l'autorité financière : un
                  caissier encaisse, il ne supprime pas un service avec ses
                  dettes de familles. */}
              {isFinanceOfficer && (
                <>
                  <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                  <button
                    type="button" onClick={() => setSuppressionOuverte(true)} disabled={!service}
                    className="w-full text-left min-h-[40px] rounded-lg px-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                  >
                    {t('Supprimer le service', 'Delete the service', 'Eliminar el servicio')}
                  </button>
                </>
              )}
            </div>
          </details>
        </div>
      </div>
      {/* ── Créer / corriger le service ─────────────────────────────────── */}
      {form && (
        <form onSubmit={enregistrerService} className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">{t('Nom', 'Name', 'Nombre')}</span>
            <input
              value={form.name} autoFocus required
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('Cantine', 'Canteen', 'Comedor')}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">{t('Catégorie', 'Category', 'Categoría')}</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
            >
              {CATEGORIES_SERVICE.map((c) => (
                <option key={c} value={c}>{t(...(FEE_CATEGORY_LABELS[c] || [c]))}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
              {t('Tarif plein par mois', 'Full monthly rate', 'Tarifa mensual')}
            </span>
            <input
              type="number" min="0" step="1" value={form.amount} required
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-40 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
              {t('Quote-part par élève et par mois', 'School share per student-month', 'Cuota por alumno y mes')}
            </span>
            <input
              type="number" min="0" step="1" value={form.quote_part}
              onChange={(e) => setForm((f) => ({ ...f, quote_part: e.target.value }))}
              placeholder={t('facultatif', 'optional', 'opcional')}
              className="w-40 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={occupe}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              {t('Enregistrer', 'Save', 'Guardar')}
            </button>
            <button type="button" onClick={() => setForm(null)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm">
              {t('Annuler', 'Cancel', 'Cancelar')}
            </button>
          </div>
          <p className="w-full text-xs text-slate-500">
            {t('La quote-part est un TAUX retenu par élève et par mois servi. Elle n’est écrite nulle part dans les comptes : elle sert à lire ce que l’activité laisse à l’école, et l’enregistrer la compterait deux fois.',
               'The school share is a RATE per student and per month served. It is never posted to the accounts: it only reads what the activity leaves to the school.',
               'La cuota es una TASA por alumno y mes servido; nunca se asienta en las cuentas.')}
          </p>
        </form>
      )}

      {/* ── Abonner des élèves ──────────────────────────────────────────── */}
      {abonnementOuvert && service && (
        <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <label className="text-sm">
              <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
                {t('Début du service', 'Service start', 'Inicio del servicio')}
              </span>
              <input
                type="date" value={debut}
                onChange={(e) => setDebut(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
              />
            </label>
            <p className="text-xs text-slate-500 leading-5 max-w-md">
              {t('Aucune échéance n’est posée avant cette date : un élève qui prend le service en février ne doit pas les mois d’avant.',
                 'No instalment is created before this date: a student joining in February does not owe earlier months.',
                 'No se crea ningún vencimiento antes de esta fecha.')}
            </p>
            <div className="w-full">
              <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
                {t('Mois à facturer', 'Months to bill', 'Meses a facturar')}
                <span className="ml-2 font-normal normal-case text-slate-400">
                  {t('seuls les mois cochés créeront une dette',
                     'only ticked months create a debt',
                     'solo los meses marcados crean deuda')}
                </span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {entete.map((m) => {
                  const pris = moisChoisis.has(m.period_key);
                  return (
                    <button
                      key={m.period_key} type="button"
                      onClick={() => setMoisChoisis((s) => {
                        const n = new Set(s);
                        if (n.has(m.period_key)) n.delete(m.period_key); else n.add(m.period_key);
                        return n;
                      })}
                      className={`px-2.5 py-1.5 rounded-lg text-sm border ${pris
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold dark:bg-emerald-900/30 dark:text-emerald-200'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}
                    >
                      {pris ? '✓ ' : ''}{m.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t('Attendu par élève', 'Expected per student', 'Esperado por alumno')} :{' '}
                <b>{money(moisChoisis.size * tarifPlein)}</b>
                {' '}({moisChoisis.size} × {money(tarifPlein)})
                {' · '}
                {t('Les autres mois resteront vides : ni dus, ni impayés.',
                   'Other months stay empty: neither due nor unpaid.',
                   'Los demás meses quedan vacíos.')}
              </p>
            </div>
            <button
              type="button" onClick={abonnerChoisis} disabled={occupe || !choix.size}
              className="ml-auto rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              {t('Abonner', 'Subscribe', 'Suscribir')} ({choix.size})
            </button>
          </div>

          {/* Chercher qui abonner. La SÉLECTION SURVIT à la recherche : on peut
              cocher Marie, chercher « MAT07 », cocher Paul, et abonner les deux.
              Un filtre qui viderait la sélection ferait perdre le travail fait. */}
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <input
              type="search" value={rechercheAbo}
              onChange={(e) => setRechercheAbo(e.target.value)}
              placeholder={t('Chercher un élève — nom, matricule ou classe',
                             'Search a student — name, ID or class',
                             'Buscar alumno — nombre, matrícula o clase')}
              className="w-80 max-w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <SectionFilterSelect
              classes={classes || []}
              value={sectionAbo}
              onChange={(v) => { setSectionAbo(v); setClasseAbo(''); }}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <select
              value={classeAbo} onChange={(e) => setClasseAbo(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              <option value="">{t('Toutes les classes', 'All classes', 'Todas las clases')}</option>
              {classesDeSection(sectionAbo).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              {candidatsFiltres.length} / {candidats.length} {t('à abonner', 'to subscribe', 'por suscribir')}
              {choix.size > 0 && ` · ${choix.size} ${t('choisi(s)', 'selected', 'elegido(s)')}`}
            </span>
            {candidatsFiltres.length > 0 && (
              <button
                type="button"
                onClick={() => setChoix((s) => {
                  const n = new Set(s);
                  const tousPris = candidatsFiltres.every((c) => n.has(c.id));
                  candidatsFiltres.forEach((c) => (tousPris ? n.delete(c.id) : n.add(c.id)));
                  return n;
                })}
                className="text-xs underline text-slate-600 dark:text-slate-300"
              >
                {candidatsFiltres.every((c) => choix.has(c.id))
                  ? t('Retirer les résultats', 'Unselect results', 'Quitar resultados')
                  : t('Choisir les résultats', 'Select results', 'Elegir resultados')}
              </button>
            )}
          </div>

          {candidats.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t('Tous les élèves sont déjà abonnés à ce service.',
                 'Every student is already subscribed to this service.',
                 'Todos los alumnos ya están suscritos.')}
            </p>
          ) : candidatsFiltres.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t('Aucun élève ne correspond à cette recherche.',
                 'No student matches this search.',
                 'Ningún alumno coincide.')}
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto flex flex-wrap gap-1.5">
              {candidatsFiltres.map((c) => {
                const pris = choix.has(c.id);
                return (
                  <button
                    key={c.id} type="button"
                    onClick={() => setChoix((s) => {
                      const n = new Set(s);
                      if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                      return n;
                    })}
                    className={`px-2.5 py-1.5 rounded-lg text-sm border ${pris
                      ? 'bg-brand-50 border-brand-300 text-brand-800 font-semibold dark:bg-brand-900/30 dark:text-brand-200'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}
                  >
                    {pris ? '✓ ' : ''}{c.name}{c.className ? ` · ${c.className}` : ''}
                    {c.matricule && (
                      <span className="ml-1 text-[11px] font-normal text-slate-400">{c.matricule}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {message && <p className="mb-3 text-sm text-rose-600">{message}</p>}

      {chargement ? (
        <p className="text-sm text-slate-500">{t('Chargement…', 'Loading…', 'Cargando…')}</p>
      ) : !service ? (
        <p className="text-sm text-slate-500">
          {canCollectFees
            ? t("Aucun service pour cette année. Créez-le ici avec « + Nouveau service » — la cantine ne passe pas par les frais scolaires.",
                'No service for this year. Create it here with “+ New service” — a service does not go through school fees.',
                'Ningún servicio para este año. Créelo aquí con «+ Nuevo servicio».')
            : t("Aucun service pour cette année, et votre compte ne peut pas en créer : demandez-le au service financier.",
                'No service for this year, and your account cannot create one: ask the finance desk.',
                'Ningún servicio para este año, y su cuenta no puede crearlo.')}
        </p>
      ) : (
        <>
        {/* ── LES FILTRES, COMMUNS AUX TROIS ONGLETS ──────────────────────
            Ils vivaient en dur ici, sur 46 lignes. Extraits dans
            `FiltresRegistre` : la page ne porte plus que leurs valeurs, et
            l'état rejoint la section et la classe — il manquait, alors que
            « donne-moi les impayés » est la demande la plus fréquente du
            guichet. */}
        <FiltresRegistre
          recherche={rechercheGrille} setRecherche={setRechercheGrille}
          section={sectionGrille} setSection={setSectionGrille}
          classe={classeGrille} setClasse={setClasseGrille}
          etat={etatGrille} setEtat={setEtatGrille}
          periode={periodeVue} setPeriode={choisirPeriode}
          entete={entete} motPeriode={mot}
          classes={classes || []} classesDeSection={classesDeSection}
          libelleStatut={(st) => t(...STATUT_ABONNE[st])}
          filtreActif={filtreActif} onEffacer={effacerFiltres}
          ouverts={filtresOuverts} setOuverts={setFiltresOuverts}
          t={t}
        />

        {/* ── TROIS ONGLETS ──────────────────────────────────────────────────
            DEUX LIBELLÉS PAR ONGLET, et c'est la correction d'un débordement
            réel : à 390 px, « Élèves abonnés · Grille mensuelle · Résumé »
            dépasse la largeur et la barre prend sa propre glissière
            horizontale. Le critère d'acceptation interdit tout défilement
            horizontal hors de la boîte de la grille. Plutôt que de tronquer
            ou de replier les onglets dans un menu — qui cacherait la
            navigation de l'écran —, on écrit le libellé COURT sous `sm` et le
            libellé complet au-dessus. Le mot long reste dans `title` et dans
            `aria-label` : rien n'est perdu pour un lecteur d'écran. */}
        <div className="mb-3 flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {[['liste',
             t('Élèves abonnés', 'Subscribed students', 'Alumnos suscritos'),
             t('Abonnés', 'Students', 'Suscritos')],
            ['grille', mot.parPeriode, mot.le],
            ['resume',
             t('Résumé', 'Summary', 'Resumen'),
             t('Résumé', 'Summary', 'Resumen')]].map(([cle, lib, court]) => (
              <button
                key={cle} type="button" onClick={() => setOnglet(cle)}
                aria-current={onglet === cle ? 'page' : undefined}
                aria-label={lib} title={lib} data-role={`onglet-${cle}`}
                className={`min-h-[44px] px-3 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${
                  onglet === cle
                    ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
              >
                <span className="sm:hidden">{court}</span>
                <span className="hidden sm:inline">{lib}</span>
              </button>
          ))}
        </div>

        {/* LA BANNIÈRE EST AU-DESSUS DES TROIS ONGLETS, ET NON DANS CHACUN.
            Elle vivait dans le bloc de filtres, visible du seul onglet
            « grille » : on pouvait filtrer, basculer sur « Résumé », et lire
            quatre cartes partielles sans aucun avertissement. Montée ici, elle
            suit l'onglet quoi qu'il arrive. */}
        {filtreActif && (
          <BanniereFiltre
            affiches={grilleAffichee.length} total={grille.length}
            onEffacer={effacerFiltres} t={t}
          />
        )}

        {onglet === 'liste' && (
          <ListeAbonnes
            abonnes={abonnesTries} tri={tri} setTri={setTri}
            libelleStatut={(s) => t(...STATUT_ABONNE[s])}
            canCollect={canCollectFees}
            onEncaisser={(a) => setEncaisse(a)}
            onFiche={(a) => setFiche(a)}
            onAbonner={canCollectFees ? () => {
              setForm(null);
              setDebut(debutParDefaut);
              setMoisChoisis(new Set(moisParDefaut ? [moisParDefaut] : []));
              setAbonnementOuvert(true);
            } : null}
            periodeLabel={libellePeriodeVue}
            money={money} t={t}
          />
        )}

        {onglet === 'grille' && (
          <GrilleMensuelle
            grille={grilleAffichee} entete={entete} parMois={parMois} total={total}
            quotePart={quotePart} moisCourant={moisCourant}
            canCollect={canCollectFees}
            onCellule={(c) => setCellule(c)}
            onEncaisser={(r) => setEncaisse(r)}
            money={money} t={t}
          />
        )}

        {onglet === 'resume' && (
          <ResumeService
            total={total} parMois={parMois} entete={entete} quotePart={quotePart}
            nbAbonnes={abonnesTries.length} filtreActif={filtreActif}
            money={money} t={t} onExport={exporter}
          />
        )}
        </>
      )}

      {/* Encaissement. Les échéances passées sont celles de CE service et de CET
          élève : le modal ne doit jamais pouvoir imputer sur le transport un
          versement remis pour la cantine. */}
      {/* ── IMPORTER UN REGISTRE EXCEL ───────────────────────────────────
          L'écran lit, planifie et rapproche sans rien écrire ; `onEcrire` est
          le seul chemin qui touche la base, et il passe par le même service
          que l'abonnement manuel. */}
      {suppressionOuverte && service && (
        <SupprimerServiceModal
          service={service}
          charger={dependancesDuService}
          onSupprimer={supprimerService}
          onFerme={() => setSuppressionOuverte(false)}
          onFini={async (r) => {
            setSuppressionOuverte(false);
            setMessage(t(
              `Service supprimé : ${r.abonnements} abonnement(s) et ${r.echeances} échéance(s) retirés.`,
              `Service deleted: ${r.abonnements} subscription(s) and ${r.echeances} instalment(s) removed.`,
              `Servicio eliminado: ${r.abonnements} suscripciones y ${r.echeances} plazos.`));
            // Le catalogue d'abord : c'est lui qui choisit le service affiché.
            // Sans ça, l'écran garderait le service supprimé en sélection.
            await rechargerCatalogue();
            await recharger();
          }}
          t={t}
          money={money}
        />
      )}

      {importOuvert && service && (
        <ImportRegistreModal
          service={service}
          schoolId={schoolId}
          year={year}
          eleves={elevesBase}
          abonnesExistants={[...dejaAbonnes]}
          mois={entete}
          onEcrire={ecrireImport}
          onFerme={() => setImportOuvert(false)}
          t={t}
          money={money}
        />
      )}

      {importModeleOuvert && service && (
        <ImportModeleModal
          service={service}
          schoolId={schoolId}
          year={year}
          eleves={elevesBase}
          classes={(classes || []).map((c) => ({ id: c.id, name: c.name }))}
          mois={entete}
          abonnements={abonnements.filter((a) => a.fee_catalog_id === serviceId)}
          echeances={echeancesDuService}
          payeDe={(id) => paidForSchedule(id, feePayments || [])}
          dernierLot={dernierLot}
          devise={school?.currency || 'XAF'}
          onEcrire={ecrireModele}
          onAnnulerLot={annulerLot}
          onFerme={() => setImportModeleOuvert(false)}
          t={t}
          money={money}
        />
      )}

      {encaisse && service && (
        <EncaissementServiceModal
          service={service}
          // Deux entrées dans la même fenêtre : depuis la LIGNE d'un élève,
          // auquel cas il est pré-rempli ; ou depuis le bouton principal, et
          // l'élève se cherche dans la fenêtre (`libre`).
          eleve={encaisse.libre ? { libre: true } : {
            id: encaisse.student_id, student_id: encaisse.student_id, name: encaisse.name,
            className: encaisse.className, matricule: encaisse.matricule,
          }}
          lignes={encaisse.libre ? []
            : echeancesDuService.filter((l) => l.student_id === encaisse.student_id)}
          abonnes={abonnesTries}
          lignesDe={(id) => echeancesDuService.filter((l) => l.student_id === id)}
          payments={feePayments || []}
          school={school}
          onClose={() => setEncaisse(null)}
          onDone={async () => { setEncaisse(null); await recharger(); }}
        />
      )}

      {/* Fiche d'un élève pour CE service. L'annulation est réservée à un rôle
          supérieur : encaisser et défaire un encaissement ne sont pas le même
          geste, et le second doit laisser une trace signée. */}
      {fiche && service && (
        <ServiceFicheEleve
          service={service}
          eleve={{
            id: fiche.student_id, name: fiche.name,
            className: fiche.className, matricule: fiche.matricule,
            startedAt: abonnements.find(
              (a) => a.student_id === fiche.student_id && a.fee_catalog_id === serviceId,
            )?.started_at || null,
          }}
          mois={mois}
          entete={entete}
          lignes={echeancesDuService.filter((l) => l.student_id === fiche.student_id)}
          payments={feePayments || []}
          school={school}
          canCollect={canCollectFees}
          canVoid={isFinanceOfficer}
          onEncaisser={() => { setEncaisse(fiche); setFiche(null); }}
          onAjouterMois={() => {
            // « Ajouter des mois » rouvre le panneau d'abonnement sur cet élève
            // seul : on n'y recrée pas l'abonnement, on lui ajoute des mois.
            setChoix(new Set([fiche.student_id]));
            setMoisChoisis(new Set());
            setAbonnementOuvert(true);
            setFiche(null);
          }}
          onClose={() => setFiche(null)}
          onChange={async () => { await recharger(); }}
        />
      )}

      {/* Décision sur une échéance — exactement les statuts que la base accepte. */}
      {cellule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
             onClick={() => setCellule(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 p-4 shadow-xl"
               onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-1">{cellule.eleve}</h3>
            <p className="text-xs text-slate-500 mb-3">
              {cellule.period_key} · {money(cellule.montantDu)} · {statutLabel(cellule.statut)}
            </p>
            <div className="grid gap-2">
              {STATUTS_POSABLES.filter((s) => SCHEDULE_STATUS.includes(s)).map((s) => (
                <button key={s} type="button" onClick={() => poser(s)}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-left">
                  {statutLabel(s)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-4 text-slate-500">
              {t("Un versement déjà encaissé empêche certaines décisions : la base les refusera, et c'est voulu.",
                 'A payment already collected blocks some decisions: the database refuses them, by design.',
                 'Un pago ya cobrado bloquea algunas decisiones.')}
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}

// Une ligne de totaux sous la grille. Extraite parce qu'il y en a six, et que
// six copies du même JSX divergent toujours.
// `action` : la colonne « Encaisser » n'existe que pour qui peut encaisser. Sans
// cette cellule vide, le pied de totaux se décalerait d'une colonne par rapport
// au tableau — et un total affiché sous la mauvaise colonne est un faux chiffre
// que personne ne soupçonne.
