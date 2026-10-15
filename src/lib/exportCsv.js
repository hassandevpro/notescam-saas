import { getLang } from './i18n';
import { useAuthStore } from '../store/authStore';
import { resolveCountryCode, defaultLangForCountry } from '../countries';

// Langue du MODÈLE d'import / export.
// Règle (alignée sur syncUiLangToSchool de authStore) :
//   1. Si l'admin a explicitement choisi une langue via la sidebar
//      (notescam_ui_lang_user_set), ce choix prime : le modèle suit l'UI.
//      Ex. école camerounaise dont l'UI est basculée en espagnol → modèle ES.
//   2. Sinon on suit la langue par défaut du pays de l'école (ses classes,
//      en-têtes et données d'exemple sont localisés). Une école Guinée Éq.
//      obtient le modèle espagnol par défaut.
//   3. À défaut d'école, on retombe sur la langue de l'UI.
function templateLang() {
  try {
    const userPick = localStorage.getItem('notescam_ui_lang_user_set') === 'true';
    if (userPick) return getLang();
    const school = useAuthStore.getState().school;
    if (school) return defaultLangForCountry(resolveCountryCode(school));
  } catch (_) { /* ignore */ }
  return getLang();
}

// User-facing import messages, localized FR / EN / ES.
const MSG = {
  empty:     { fr: 'Fichier vide.', en: 'Empty file.', es: 'Archivo vacío.' },
  emptyData: { fr: 'Fichier vide ou sans données.', en: 'Empty file or no data.', es: 'Archivo vacío o sin datos.' },
  cantRead:  { fr: 'Impossible de lire le fichier.', en: 'Could not read the file.', es: 'No se pudo leer el archivo.' },
  readErr:   { fr: 'Erreur de lecture : ', en: 'Read error: ', es: 'Error de lectura: ' },
  noStudentCols: {
    fr: 'Colonnes "prenom" et "nom" introuvables. Vérifiez les en-têtes.',
    en: 'Columns "firstName" and "lastName" not found. Check the headers.',
    es: 'No se encontraron las columnas "nombre" y "apellidos". Revise los encabezados.',
  },
  noTeacherCol: {
    fr: 'Colonne "nom_complet" introuvable. Vérifiez les en-têtes.',
    en: 'Column "full_name" not found. Check the headers.',
    es: 'No se encontró la columna "nombre_completo". Revise los encabezados.',
  },
};
const msg = (key) => MSG[key][getLang()] || MSG[key].fr;

// xlsx is loaded on-demand only when Excel read/write is actually needed
async function loadXLSX() {
  return (await import('xlsx'));
}

// ── CSV download ──────────────────────────────────────────────────────────────
export function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ── Excel download ────────────────────────────────────────────────────────────
export async function downloadExcel(filename, rows, sheetName = 'Données') {
  const XLSX = await loadXLSX();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ── Excel / CSV parse (returns { rows, error }) ───────────────────────────────
export function parseSpreadsheet(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);

    reader.onload = async (e) => {
      try {
        if (isExcel) {
          const XLSX = await loadXLSX();
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          resolve(rawRowsToStudents(raw));
        } else {
          resolve(parseCsvText(e.target.result));
        }
      } catch (err) {
        resolve({ rows: [], error: msg('readErr') + err.message });
      }
    };
    reader.onerror = () => resolve({ rows: [], error: msg('cantRead') });

    if (isExcel) reader.readAsArrayBuffer(file);
    else         reader.readAsText(file, 'UTF-8');
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: msg('emptyData') };
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const raw = lines.slice(1).map((l) => l.split(delim).map((c) => c.trim()));
  return rawRowsToStudents([headers, ...raw]);
}

function rawRowsToStudents(raw) {
  if (raw.length < 2) return { rows: [], error: msg('empty') };

  // Les ACCENTS sont retirés des en-têtes (NFD puis suppression des diacritiques).
  // Ils étaient conservés jusqu'ici, et c'est ce qui rendait « Nom du père »
  // invisible : normalisé « nomdupère », il ne contenait pas le candidat « pere »,
  // donc l'import ne reprenait NI le père NI la mère — les deux libellés français
  // les plus naturels. Le défaut comptait double, la notice 0.2.5 recommandant
  // justement de réimporter le fichier d'inscription pour rattraper ces champs.
  //
  // Les candidats accentués des listes ci-dessous (« prénom », « téléphone »,
  // « élève ») deviennent inatteignables, mais chacun a déjà son jumeau sans
  // accent dans la même liste : aucun en-tête ne cesse d'être reconnu.
  const headers = raw[0].map((h) => String(h).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]/g, ''));
  // Exact match first (avoids "nom" capturing the Spanish "nombre"), then loose substring.
  //
  // `exclude` : en-têtes à écarter AVANT la recherche approximative. Sans lui, un
  // candidat générique capture la colonne d'un champ voisin. Cas vécu : la date
  // cherche « naissance » et rencontre d'abord « Lieu de naissance », qui contient
  // le mot. Dans un fichier où le lieu précède la date, la date de naissance lisait
  // donc la colonne du LIEU.
  //
  // L'effet n'était pas d'écrire « YAOUNDE » comme date : `normalizeDate` rejette
  // ce qui n'est pas une date et rend `null`. C'est bien pire à repérer — la date
  // partait VIDE, et comme le champ est explicitement présent dans la ligne
  // importée, il ÉCRASAIT la date déjà enregistrée. Un réimport de rattrapage
  // effaçait ainsi silencieusement les dates de naissance de toute l'école.
  const col = (candidates, exclude = []) => {
    const eligible = (h) => !exclude.some((x) => h.includes(x));
    let i = headers.findIndex((h) => eligible(h) && candidates.includes(h));
    if (i === -1) i = headers.findIndex((h) => eligible(h) && candidates.some((c) => h.includes(c)));
    return i;
  };

  const prenomIdx    = col(['prenom', 'prénom', 'nombre', 'firstname', 'first_name']);
  const nomIdx       = col(['nom', 'apellidos', 'apellido', 'lastname', 'last_name', 'name', 'eleve', 'élève']);
  const matriculeIdx = col(['matricule', 'matricula', 'studentid', 'mat', 'immatricul']);
  const genderIdx    = col(['sexe', 'sexo', 'genre', 'gender']);
  // `neele` / `nele` : « Né(e) le » et « Né le », en-têtes courants des listes
  // d'école, que la normalisation réduit à « neele » / « nele ». Sans eux, la date
  // n'était reconnue par aucun candidat et la colonne repartait vide.
  // « nee » seul est volontairement ABSENT : il se retrouverait dans « année ».
  const dateIdx      = col(['datenaissance', 'fechanacimiento', 'dateofbirth', 'date_naissance', 'dob', 'birthdate', 'naissance', 'neele', 'nele'],
    ['lieu', 'lugar', 'place']);
  // La colonne COMBINÉE « date et lieu de naissance » est écartée d'ici : elle
  // contient le mot « lieu », et la recherche approximative la rencontrait AVANT
  // une vraie colonne « Lieu de naissance » placée plus loin dans le fichier. Un
  // fichier portant les DEUX voyait donc le lieu lu dans la colonne combinée. Le
  // cas combiné est traité à part, par `dateLieuIdx` + `splitDateLieu`.
  const lieuIdx      = col(['lieunaissance', 'lugarnacimiento', 'placeofbirth', 'lieu_naissance', 'birthplace', 'lieu'],
    ['dateetlieu', 'datetlieu', 'datelieu', 'dateandplace', 'fechaylugar']);
  const adresseIdx   = col(['adresse', 'direccion', 'address']);
  // Quartier de résidence — colonne À PART de l'adresse : c'est le secteur, et
  // il doit rester groupable (ramassage scolaire, visites, convocations).
  // `quartier` n'apparaît dans aucun candidat d'`adresse`, et réciproquement :
  // les deux colonnes d'un même fichier ne se volent pas.
  const quartierIdx  = col(['quartierresidence', 'quartierderesidence', 'quartier',
    'neighbourhood', 'neighborhood', 'barrio', 'district']);
  const phoneIdx     = col(['telephone', 'telefono', 'téléphone', 'tel', 'phone', 'parent_phone']);
  const urgenceIdx   = col(['contacturgence', 'contactoemergencia', 'emergencycontact', 'contact_urgence', 'urgence', 'emergency']);
  // DEUX défauts fermés ici, trouvés en éprouvant les en-têtes réels.
  //
  // 1. « Profession DU père » / « Profession DE LA mère ». Normalisés
  //    « professiondupere » / « professiondelamere », ils ne contenaient pas
  //    « professionpere » : aucun candidat ne les reconnaissait, et les deux
  //    professions repartaient VIDES — alors que ce sont les tournures les plus
  //    naturelles en français.
  // 2. Pire, le candidat générique « pere » de la colonne NOM rencontrait cette
  //    même colonne : « Profession du père » était lu comme le NOM du père, et
  //    « Ingénieur » s'affichait à la place d'une personne. Même piège côté
  //    anglais avec « fatherJob », que « father » capturait.
  // Les exclusions écartent donc toute colonne de profession ou de contact des
  // candidats de NOM, et les tournures avec article sont ajoutées aux candidats
  // de PROFESSION.
  const SANS_PROFESSION = ['profession', 'profesion', 'job', 'metier', 'oficio',
    'phone', 'telephone', 'tel', 'contact', 'mail'];
  const pereNomIdx   = col(['nompere', 'nombrepadre', 'fathername', 'nom_pere', 'father', 'padre', 'pere'],
    SANS_PROFESSION);
  const pereProfIdx  = col(['professionpere', 'professiondupere', 'profesionpadre',
    'profesiondelpadre', 'fatherjob', 'fathersprofession', 'profession_pere']);
  const mereNomIdx   = col(['nommere', 'nombremadre', 'mothername', 'nom_mere', 'mother', 'madre', 'mere'],
    SANS_PROFESSION);
  const mereProfIdx  = col(['professionmere', 'professiondelamere', 'professiondemere',
    'profesionmadre', 'profesiondelamadre', 'motherjob', 'mothersprofession', 'profession_mere']);
  // « Nom du parent » / « Responsable » : beaucoup de registres ne nomment qu'UN
  // responsable, sans dire s'il s'agit du père, de la mère ou d'un tuteur. Le
  // ranger dans `nom_pere` affirmerait une paternité que le registre n'affirme
  // pas — plusieurs de ces responsables portent un prénom féminin. Il va donc
  // dans `tuteur`, le champ qui ne présume rien, sa profession dans
  // `profession_tuteur`.
  //
  // Les exclusions ferment le piège du candidat générique « parent » : sans
  // elles, un en-tête « parent_phone » ou « Téléphone parent » était capturé
  // comme NOM du tuteur, et un numéro de téléphone atterrissait dans un champ nom.
  const tuteurIdx    = col(['tuteur', 'tutor', 'guardian', 'nomparent', 'nomduparent',
    'responsablelegal', 'responsable', 'parent'],
  // `profesion` (sans le second s) et `job` sont écartés en plus de
  // `profession` : sans eux, « profesionTutor » (espagnol) et « guardianJob »
  // (anglais) étaient capturés par les candidats génériques `tutor`/`guardian`,
  // et la PROFESSION du tuteur devenait son NOM.
    ['phone', 'telephone', 'tel', 'contact', 'profession', 'profesion', 'job',
     'mail', 'adresse', 'address']);
  const classeIdx    = col(['classe', 'clase', 'class', 'classname', 'class_name']);
  // Les DEUX statuts sont indépendants (cf. Students.jsx) et se piègent l'un
  // l'autre à la recherche approximative :
  //   • `statut`               = dans la classe  (nouveau/redoublant/transféré) ;
  //   • `statut_etablissement` = dans l'école    (nouveau/ancien) → frais d'inscription.
  // « Statut établissement » CONTIENT « statut », et l'en-tête anglais
  // « schoolStatus » contient « status ». Un fichier qui ne porte QUE la colonne
  // établissement voyait donc `statutIdx` la capturer, et le statut de classe
  // recevait « ancien » — valeur que `normalizeStatut` rejette, donc un champ
  // présent mais VIDE, qui écrase le statut déjà enregistré au réimport. On
  // écarte explicitement les en-têtes d'établissement du statut de classe.
  // Pas de candidat « etablissement » seul : il se retrouverait dans
  // « Établissement d'origine », et le statut lirait un nom d'école — que
  // `normalizeStatutEtab` rejette, donc un champ vide qui écrase. Les candidats
  // portent tous le mot « statut/status/estado », et `origine` est écarté.
  const statutEtabIdx = col(['statutetablissement', 'statut_etablissement', 'statutetab',
    'statutecole', 'schoolstatus', 'statusschool', 'estadoescuela', 'estadocentro'],
    ['origine', 'origen', 'provenance']);
  const statutIdx    = col(['statut', 'estado', 'status', 'inscription', 'type_eleve', 'typeeleve'],
    ['etablissement', 'etab', 'school', 'escuela', 'centro']);
  // École d'origine : d'où vient l'élève. `pays`/`country` sont écartés, sinon
  // le candidat « origine » capture une colonne « Pays d'origine ».
  // Ancien établissement / école d'origine. Les écoles disent les deux, d'où les
  // deux familles de candidats. `pays`/`country` sont écartés, sinon le candidat
  // générique « origine » capture une colonne « Pays d'origine ».
  const ecoleOrigIdx = col(['ancienetablissement', 'ancienneecole', 'etablissementprecedent',
    'ecoleprecedente', 'ecoleorigine', 'ecoledorigine', 'etablissementorigine',
    'ecoleprovenance', 'schoolorigin', 'originschool', 'previousschool', 'formerschool',
    'escuelaorigen', 'centroorigen', 'escuelaanterior', 'provenance', 'origine', 'origen'],
    ['pays', 'country', 'pais']);
  // Aptitude sportive (barème EPS du carnet MINEDUB primaire, compétence 6A).
  // Reconnue à l'import pour que le fichier EXPORTÉ par l'écran Élèves se
  // réimporte complètement, sans perdre cette colonne au passage.
  const aptitudeIdx  = col(['aptitudesportive', 'sportaptitude', 'sportfitness',
    'aptitudfisica', 'aptitude', 'eps']);

  // ── REGISTRE MATRICULE : entrée / sortie de l'établissement ───────────────
  // Colonnes du registre officiel — cf. supabase_student_registre_matricule.sql.
  //
  // Leurs en-têtes réels PORTENT LEUR LÉGENDE. Le registre d'où vient ce besoin
  // écrit « motif d'entrée: ED=étudedossier, ET=étudedossier+test » et, pour la
  // sortie, « motif: NM=normale, EX=exclusion, TF=transfert, … ». Normalisé, le
  // second ne contient PAS le mot « sortie » : d'où le candidat générique
  // « motif », et l'exclusion d'« entree » pour qu'il ne capture pas la colonne
  // d'entrée — qui, elle, porte le mot.
  const dateEntreeIdx  = col(['dateentree', 'datedentree', 'anneeentree', 'anneedentree',
    'entrydate', 'dateofentry', 'fechaentrada', 'dateadmission'],
    ['sortie', 'exit', 'salida', 'naissance', 'birth', 'nacimiento', 'motif', 'reason']);
  const motifEntreeIdx = col(['motifentree', 'motifdentree', 'motifadmission',
    'entryreason', 'reasonforentry', 'motivoentrada'],
    ['sortie', 'exit', 'salida']);
  const dateSortieIdx  = col(['datesortie', 'datedesortie', 'anneesortie', 'anneedesortie',
    'exitdate', 'dateofexit', 'leavingdate', 'fechasalida'],
    ['entree', 'entry', 'admission', 'naissance', 'birth', 'nacimiento', 'motif', 'reason']);
  const motifSortieIdx = col(['motifsortie', 'motifdesortie', 'motifdepart',
    'exitreason', 'leavingreason', 'motivosalida', 'motif'],
    ['entree', 'entry', 'admission', 'archiv', 'paiement', 'payment']);
  // Profession du tuteur — pendant de profession_pere / profession_mere. Le
  // candidat générique « profession » n'est atteignable qu'après exclusion du
  // père et de la mère : sinon « Profession du père » était lu DEUX fois, et la
  // profession du père devenait aussi celle du tuteur.
  const profTuteurIdx  = col(['professiontuteur', 'professiondututeur', 'professionparent',
    'professionduparent', 'guardianjob', 'jobguardian', 'profesiontutor', 'profession'],
    ['pere', 'mere', 'father', 'mother', 'padre', 'madre', 'eleve', 'student']);

  // Colonne COMBINÉE « date et lieu de naissance », telle que la portent les
  // registres manuscrits recopiés dans un tableur (« 28/03/2013 à Yaoundé »).
  //
  // Sans elle, le fichier perdait la date ET le lieu. L'en-tête contient le mot
  // « lieu », donc `dateIdx` l'écarte (son exclusion `['lieu']`) et `lieuIdx` la
  // capture : le lieu de naissance recevait la chaîne ENTIÈRE, « 28/03/2013 à
  // Yaoundé », et la date de naissance repartait vide.
  const dateLieuIdx = col(['dateetlieudenaissance', 'dateetlieunaissance', 'datelieunaissance',
    'dateandplaceofbirth', 'fechaylugardenacimiento']);

  if (prenomIdx === -1 && nomIdx === -1) {
    return { rows: [], error: msg('noStudentCols') };
  }

  const rows = raw.slice(1)
    .map((cols) => {
      const str = (i) => i >= 0 ? String(cols[i] || '').trim() : '';
      // Colonne combinée date+lieu : on la scinde. Une colonne DÉDIÉE présente
      // par ailleurs dans le même fichier garde la priorité — un fichier peut
      // très bien porter les deux, et c'est alors la colonne précise qui fait foi.
      const dl        = dateLieuIdx >= 0 ? splitDateLieu(cols[dateLieuIdx]) : null;
      const dateSeule = dateIdx >= 0 && dateIdx !== dateLieuIdx;
      const lieuSeul  = lieuIdx >= 0 && lieuIdx !== dateLieuIdx;

      let name = '';
      if (prenomIdx >= 0 && nomIdx >= 0) {
        const nom = str(nomIdx);
        const prenom = str(prenomIdx);
        name = nom && prenom ? `${nom} ${prenom}` : nom || prenom;
      } else {
        name = str(prenomIdx >= 0 ? prenomIdx : nomIdx);
      }

      return {
        name,
        matricule:        str(matriculeIdx),
        gender:           genderIdx    >= 0 ? normalizeGender(str(genderIdx)) : '',
        date_naissance:   dateSeule ? normalizeDate(cols[dateIdx]) : (dl ? dl.date : null),
        lieu_naissance:   lieuSeul  ? str(lieuIdx)                 : (dl ? dl.lieu : ''),
        adresse:          str(adresseIdx),
        parent_phone:     str(phoneIdx),
        contact_urgence:  str(urgenceIdx),
        nom_pere:         str(pereNomIdx),
        profession_pere:  str(pereProfIdx),
        nom_mere:         str(mereNomIdx),
        profession_mere:  str(mereProfIdx),
        tuteur:           str(tuteurIdx),
        class_name:       str(classeIdx),
        statut:           statutIdx >= 0 ? normalizeStatut(str(statutIdx)) : '',
        // Les champs AJOUTÉS sont omis quand le fichier n'a pas la colonne,
        // au lieu d'être posés à ''. Un champ présent-mais-vide est converti en
        // NULL par `sanitizeStudent` et ÉCRASE la valeur enregistrée : réimporter
        // un ancien fichier d'inscription (ce que recommande la notice 0.2.5)
        // effacerait donc ce que le secrétariat a saisi à la main entre-temps.
        ...(quartierIdx   >= 0 ? { quartier: str(quartierIdx) } : {}),
        ...(ecoleOrigIdx  >= 0 ? { ecole_origine: str(ecoleOrigIdx) } : {}),
        ...(statutEtabIdx >= 0 ? { statut_etablissement: normalizeStatutEtab(str(statutEtabIdx)) } : {}),
        // `sport_aptitude` est NOT NULL en base : on ne pose la clé que si la
        // colonne existe ET donne une valeur reconnue.
        ...(aptitudeIdx >= 0 && normalizeAptitude(str(aptitudeIdx))
          ? { sport_aptitude: normalizeAptitude(str(aptitudeIdx)) }
          : {}),
        // Registre matricule — même précaution que ci-dessus : la clé n'est
        // posée que si la colonne EXISTE, pour qu'un réimport d'un fichier plus
        // pauvre n'efface pas ce que le secrétariat a saisi depuis.
        ...(dateEntreeIdx  >= 0 ? { date_entree:  normalizeRegistreDate(cols[dateEntreeIdx]) } : {}),
        ...(motifEntreeIdx >= 0 ? { motif_entree: sansZero(str(motifEntreeIdx)) } : {}),
        ...(dateSortieIdx  >= 0 ? { date_sortie:  normalizeRegistreDate(cols[dateSortieIdx]) } : {}),
        ...(motifSortieIdx >= 0 ? { motif_sortie: sansZero(str(motifSortieIdx)) } : {}),
        ...(profTuteurIdx  >= 0 ? { profession_tuteur: sansZero(str(profTuteurIdx)) } : {}),
      };
    })
    .filter((r) => r.name);

  return { rows, error: null };
}

function normalizeStatut(val) {
  const v = val.trim().toLowerCase();
  if (['n', 'nouveau', 'new', 'nouvelle', 'nuevo', 'nueva', '0', 'non'].includes(v)) return 'nouveau';
  if (['r', 'redoublant', 'redoublante', 'repeating', 'repetidor', 'repetidora', 'repite', '1', 'oui', 'red'].includes(v)) return 'redoublant';
  if (['t', 'transfere', 'transféré', 'transfer', 'transfert', 'transferido', 'transferida', 'trasladado', 'mutation'].includes(v)) return 'transfere';
  return '';
}

// Statut DANS L'ÉTABLISSEMENT (nouveau/ancien) — pilote les frais d'inscription
// (cf. `inscriptionApplies`). Distinct du statut de classe : un élève peut être
// « nouveau dans l'établissement » ET « redoublant ».
//
// « redoublant » et « transféré » n'ont PAS d'équivalent ici : un redoublant est
// par définition un ancien, un transféré un nouveau. On les traduit donc plutôt
// que de rendre '' — c'est l'information que l'école a écrite, et la facturation
// de l'inscription en dépend.
function normalizeStatutEtab(val) {
  const v = String(val ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (['n', 'nouveau', 'nouvelle', 'new', 'nuevo', 'nueva',
       't', 'transfere', 'transfer', 'transfert', 'transferido', 'trasladado'].includes(v)) return 'nouveau';
  if (['a', 'ancien', 'ancienne', 'old', 'existing', 'returning', 'antiguo', 'antigua',
       'r', 'redoublant', 'redoublante', 'repeating', 'repetidor'].includes(v)) return 'ancien';
  return '';
}

// Aptitude sportive : 'apte' | 'inapte' (colonne NOT NULL DEFAULT 'apte').
// Rend '' si la valeur n'est pas reconnue — l'appelant n'écrit alors rien,
// plutôt que de déclarer inapte un élève sur un libellé mal lu.
function normalizeAptitude(val) {
  const v = String(val ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (['inapte', 'unfit', 'no apto', 'noapto', 'inapta', 'dispense', 'dispensee', 'exempt'].includes(v)) return 'inapte';
  if (['apte', 'fit', 'apto', 'apta', 'oui', 'yes', 'si'].includes(v)) return 'apte';
  return '';
}

function normalizeGender(val) {
  const v = val.trim().toLowerCase();
  if (['m', 'masculin', 'masculino', 'male', 'garçon', 'garcon', 'h', 'homme', 'hombre'].includes(v)) return 'Masculin';
  if (['f', 'féminin', 'feminin', 'femenino', 'femenina', 'female', 'fille', 'femme', 'mujer'].includes(v)) return 'Feminin';
  return '';
}

function normalizeDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  // Excel serial number — pure JS conversion (no XLSX needed)
  if (/^\d{4,5}$/.test(s)) {
    const n = Number(s);
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // YYYY-MM-DD passthrough
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

// Date du REGISTRE MATRICULE (entrée / sortie). Rend du TEXTE, et pas une date
// ISO stricte, parce que les registres portent le plus souvent l'ANNÉE seule :
//   « 2024 »       -> « 2024 »        année telle qu'écrite au registre
//   « 2024-2025 »  -> « 2024-2025 »   année scolaire
//   « 15/09/2024 » -> « 2024-09-15 »  date complète, normalisée en ISO
// Les trois formes se trient correctement entre elles.
//
// L'année seule est reconnue AVANT d'appeler `normalizeDate`, et c'est
// essentiel : `normalizeDate` voit dans « 2024 » un numéro de série Excel
// (/^\d{4,5}$/) et rendrait 1905-07-15. Une année d'entrée devenait une date
// de 1905, sur un champ que personne ne relit élève par élève.
function normalizeRegistreDate(val) {
  const s = String(val ?? '').trim();
  if (!s || s === '0') return '';
  if (/^(19|20)\d{2}$/.test(s)) return s;
  const scolaire = s.match(/^((?:19|20)\d{2})\s*[/\-–]\s*((?:19|20)\d{2})$/);
  if (scolaire) return `${scolaire[1]}-${scolaire[2]}`;
  return normalizeDate(s) || '';
}

// Scinde une cellule « 28/03/2013 à Yaoundé » en { date, lieu }.
//
// C'est la forme du registre matricule manuscrit, recopié tel quel dans un
// tableur : une seule colonne « date et lieu de naissance ». Le séparateur
// accepté couvre ce qu'écrivent les secrétariats (« à », « a », « au », « en »).
//
// Trois cas, et aucun ne jette la cellule :
//   « 28/03/2013 à Yaoundé » -> date ISO + lieu
//   « 28/03/2013 »           -> date ISO, lieu vide
//   « Yaoundé »              -> lieu seul (ni date reconnue, ni séparateur)
// Une date illisible avec un lieu lisible (« 18/1182011 à N'Djaména », vu dans
// le classeur) rend le lieu et une date nulle : mieux vaut un champ vide qu'une
// date inventée à partir d'une coquille.
function splitDateLieu(val) {
  const s = String(val ?? '').trim();
  if (!s || s === '0') return { date: null, lieu: '' };
  const m = s.match(/^(.*?)\s+(?:à|a|au|en)\s+(.+)$/i);
  const d = normalizeDate(m ? m[1] : s);
  if (!d && !m) return { date: null, lieu: s };
  return { date: d, lieu: m ? m[2].trim() : '' };
}

// Les registres recopiés dans un tableur emploient « 0 » comme marque de case
// VIDE — constaté sur le classeur de 436 élèves qui a motivé ces colonnes :
// téléphone 0, quartier 0, motif 0, profession 0. Gardé tel quel, ce « 0 »
// devenait une profession « 0 » et un motif de sortie « 0 ».
//
// La règle ne s'applique QU'aux colonnes du registre ajoutées ici. L'élargir
// aux autres champs changerait un comportement établi : `normalizeStatut`
// traduit déjà « 0 » par « nouveau », et c'est voulu.
function sansZero(s) {
  return s === '0' ? '' : s;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Grades CSV import ─────────────────────────────────────────────────────────
// Input: the CSV exported by Grades page (Élève, Sub1 /20, Sub2 /20, Moyenne)
// Returns: { subjectNames: string[], rows: [{studentName, grades: {name: val}}], error }
export function parseGradesCSV(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);

    reader.onload = async (e) => {
      try {
        let raw; // tableau de lignes (chaque ligne = tableau de cellules)
        if (isExcel) {
          const XLSX = await loadXLSX();
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
            .map((r) => r.map((c) => String(c ?? '').trim()));
        } else {
          const lines = e.target.result.split(/\r?\n/).filter((l) => l.trim());
          if (lines.length < 2) { resolve({ rows: [], subjectNames: [], error: 'Fichier vide.' }); return; }
          const delim = lines[0].includes(';') ? ';' : ',';
          raw = lines.map((l) => splitCSVLine(l, delim).map((c) => c.trim()));
        }
        resolve(rawRowsToGrades(raw));
      } catch (err) {
        resolve({ rows: [], subjectNames: [], error: `Erreur : ${err.message}` });
      }
    };
    reader.onerror = () => resolve({ rows: [], subjectNames: [], error: 'Impossible de lire le fichier.' });
    if (isExcel) reader.readAsArrayBuffer(file);
    else         reader.readAsText(file, 'UTF-8');
  });
}

// Transforme un tableau de lignes brutes (en-tête « Élève, Mat /20…, Moyenne »)
// en { rows, subjectNames }. La virgule décimale d'Excel FR (« 12,5 ») est
// conservée telle quelle : validateGrade la normalise à l'import.
function rawRowsToGrades(raw) {
  if (!raw || raw.length < 2) return { rows: [], subjectNames: [], error: 'Fichier vide.' };
  const headers = raw[0].map((h) => String(h).trim());

  // Colonnes du milieu = matières (col 0 = Élève, on saute Moyenne/Moy)
  const subjectCols = [];
  for (let i = 1; i < headers.length; i++) {
    const h = headers[i];
    if (/^moy/i.test(h.replace(/[^a-z]/gi, ''))) continue;
    const name = h.replace(/\s*\/\d+\s*$/, '').trim();
    if (name) subjectCols.push({ index: i, name });
  }
  if (subjectCols.length === 0) {
    return { rows: [], subjectNames: [], error: 'Aucune colonne de matière trouvée.' };
  }

  const rows = raw.slice(1).map((cols) => {
    const studentName = String(cols[0] || '').trim();
    const grades = {};
    subjectCols.forEach(({ index, name }) => {
      const v = String(cols[index] ?? '').trim();
      if (v) grades[name] = v;
    });
    return { studentName, grades };
  }).filter((r) => r.studentName);

  return { rows, subjectNames: subjectCols.map((c) => c.name), error: null };
}

// ── Lecture brute d'une feuille (grilles compétences) ─────────────────────────
// Retourne { raw: string[][], error }. Contrairement à parseGradesCSV, aucune
// hypothèse sur les colonnes (les intitulés de compétences contiennent chiffres,
// « / » et accents) : l'appelant fait lui-même la correspondance en-tête→colonne.
export function readSheetAoa(file) {
  return new Promise((resolve) => {
    const reader  = new FileReader();
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);

    reader.onload = async (e) => {
      try {
        let raw;
        if (isExcel) {
          const XLSX = await loadXLSX();
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
            .map((r) => r.map((c) => String(c ?? '').trim()));
        } else {
          const lines = e.target.result.split(/\r?\n/).filter((l) => l.trim());
          if (lines.length < 2) { resolve({ raw: [], error: msg('emptyData') }); return; }
          const delim = lines[0].includes(';') ? ';' : ',';
          raw = lines.map((l) => splitCSVLine(l, delim).map((c) => c.trim()));
        }
        if (!raw || raw.length < 2) { resolve({ raw: [], error: msg('emptyData') }); return; }
        resolve({ raw, error: null });
      } catch (err) {
        resolve({ raw: [], error: msg('readErr') + err.message });
      }
    };
    reader.onerror = () => resolve({ raw: [], error: msg('cantRead') });
    if (isExcel) reader.readAsArrayBuffer(file);
    else         reader.readAsText(file, 'UTF-8');
  });
}

function splitCSVLine(line, delim) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === delim && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// ── Teacher export ────────────────────────────────────────────────────────────
const TEACHER_EXPORT_HEADERS = {
  fr: { cols: ['Nom complet', 'Email', 'Téléphone', 'Spécialité', 'Compte app'], yes: 'Oui', no: 'Non', file: 'enseignants' },
  en: { cols: ['Full name', 'Email', 'Phone', 'Specialty', 'App account'],       yes: 'Yes', no: 'No',  file: 'teachers' },
  es: { cols: ['Nombre completo', 'Email', 'Teléfono', 'Especialidad', 'Cuenta app'], yes: 'Sí', no: 'No', file: 'profesores' },
};

export function exportTeachers(teachers) {
  const h = TEACHER_EXPORT_HEADERS[templateLang()] || TEACHER_EXPORT_HEADERS.fr;
  const rows = [
    h.cols,
    ...teachers.map((t) => [
      t.name || '',
      t.email || '',
      t.phone || '',
      t.specialty || '',
      t.auth_user_id ? h.yes : h.no,
    ]),
  ];
  downloadCSV(`${h.file}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

// ── Teacher import template ───────────────────────────────────────────────────
const TEACHER_TEMPLATE = {
  fr: {
    filename: 'modele_import_enseignants.csv',
    rows: [
      ['nom_complet', 'email', 'telephone', 'specialite'],
      ['M. KAMGA Paul',    'paul.kamga@ecole.cm',   '677001122', 'Mathématiques'],
      ['Mme NKENG Claire', 'claire.nkeng@ecole.cm', '699334455', 'Français'],
      ['M. BIBI Samuel',   '',                      '655778899', 'Histoire-Géographie'],
    ],
  },
  en: {
    filename: 'teacher_import_template.csv',
    rows: [
      ['full_name', 'email', 'phone', 'specialty'],
      ['Mr Paul KAMGA',     'paul.kamga@school.gq',   '222001122', 'Mathematics'],
      ['Mrs Claire NKENG',  'claire.nkeng@school.gq', '222334455', 'English'],
      ['Mr Samuel BIBI',    '',                       '222778899', 'Geography & History'],
    ],
  },
  es: {
    filename: 'modelo_importacion_profesores.csv',
    rows: [
      ['nombre_completo', 'email', 'telefono', 'especialidad'],
      ['Sr. NGUEMA Pedro',  'pedro.nguema@escuela.gq', '222001122', 'Matemáticas'],
      ['Sra. OBIANG Carmen','carmen.obiang@escuela.gq','222334455', 'Lengua Española'],
      ['Sr. ABAGA Daniel',  '',                        '222778899', 'Geografía e Historia'],
    ],
  },
};

export function downloadTeacherTemplate() {
  const tpl = TEACHER_TEMPLATE[templateLang()] || TEACHER_TEMPLATE.fr;
  downloadCSV(tpl.filename, tpl.rows);
}

// ── Teacher spreadsheet parse ─────────────────────────────────────────────────
export function parseTeachersSpreadsheet(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    const isExcel = /\.(xlsx|xls|ods)$/i.test(file.name);

    reader.onload = async (e) => {
      try {
        let raw;
        if (isExcel) {
          const XLSX = await loadXLSX();
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        } else {
          const lines = e.target.result.split(/\r?\n/).filter((l) => l.trim());
          const delim = lines[0]?.includes(';') ? ';' : ',';
          raw = lines.map((l) => l.split(delim).map((c) => c.trim()));
        }

        if (!raw || raw.length < 2) {
          resolve({ rows: [], error: msg('emptyData') });
          return;
        }

        const headers = raw[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-zàâéèêëîïôùûç0-9_]/g, ''));
        const col = (candidates) => headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

        const nomIdx       = col(['nomcomplet', 'nom_complet', 'nombrecompleto', 'nombre_completo', 'nom', 'name', 'enseignant', 'fullname', 'full_name']);
        const emailIdx     = col(['email', 'mail', 'courriel']);
        const phoneIdx     = col(['telephone', 'telefono', 'téléphone', 'tel', 'phone', 'portable']);
        const specialtyIdx = col(['specialite', 'spécialité', 'especialidad', 'specialty', 'matiere', 'discipline', 'asignatura']);

        if (nomIdx === -1) {
          resolve({ rows: [], error: msg('noTeacherCol') });
          return;
        }

        const rows = raw.slice(1)
          .map((cols) => {
            const str = (i) => i >= 0 ? String(cols[i] || '').trim() : '';
            const name = str(nomIdx);
            if (!name) return null;
            return {
              name,
              email:     str(emailIdx),
              phone:     str(phoneIdx),
              specialty: str(specialtyIdx),
            };
          })
          .filter(Boolean);

        resolve({ rows, error: null });
      } catch (err) {
        resolve({ rows: [], error: msg('readErr') + err.message });
      }
    };

    reader.onerror = () => resolve({ rows: [], error: msg('cantRead') });
    if (isExcel) reader.readAsArrayBuffer(file);
    else         reader.readAsText(file, 'UTF-8');
  });
}

// ── Student import template ───────────────────────────────────────────────────
const STUDENT_TEMPLATE = {
  fr: {
    filename: 'modele_import_eleves.xlsx',
    sheet:    'Modèle élèves',
    rows: [
      ['matricule', 'prenom', 'nom', 'dateNaissance', 'lieuNaissance',
       'sexe', 'statut', 'statutEtablissement', 'ancienEtablissement',
       'quartier', 'adresse', 'telephone', 'contactUrgence',
       'nomPere', 'professionPere', 'nomMere', 'professionMere',
       'tuteur', 'professionTuteur',
       'dateEntree', 'motifEntree', 'dateSortie', 'motifSortie', 'classe'],
      ['s260001', 'Jean', 'DUPONT', '2015-03-15', 'Yaoundé',
       'MALE', 'nouveau', 'nouveau', 'EP de Bastos',
       'Bastos', 'Rue 1.234, Yaoundé', '677123456', '699987654',
       'Pierre DUPONT', 'Ingénieur', 'Marie DUPONT', 'Enseignante',
       '', '',
       '2024', 'ED', '', '', 'CP A'],
      ['s260002', 'Brigitte', 'ELOUNDOU', '2014-09-22', 'Douala',
       'FEMALE', 'redoublant', 'ancien', '',
       'Akwa', 'Rue Njo-Njo, Douala', '655000001', '',
       'Paul ELOUNDOU', 'Commerçant', 'Anne ELOUNDOU', 'Ménagère',
       'ELOUNDOU Sylvie', 'Couturière',
       '2023-2024', 'ET', '', '', 'CP A'],
    ],
  },
  en: {
    filename: 'student_import_template.xlsx',
    sheet:    'Students template',
    rows: [
      ['studentId', 'firstName', 'lastName', 'dateOfBirth', 'placeOfBirth',
       'gender', 'status', 'schoolStatus', 'previousSchool',
       'neighbourhood', 'address', 'phone', 'emergencyContact',
       'fatherName', 'fatherJob', 'motherName', 'motherJob',
       'guardian', 'guardianJob',
       'entryDate', 'entryReason', 'exitDate', 'exitReason', 'class'],
      ['s260001', 'John', 'SMITH', '2015-03-15', 'Malabo',
       'MALE', 'new', 'new', 'Malabo Primary School',
       'Ela Nguema', '12 Independence Ave., Malabo', '222123456', '222987654',
       'Peter SMITH', 'Engineer', 'Mary SMITH', 'Teacher',
       '', '',
       '2024', 'ED', '', '', '1st A'],
      ['s260002', 'Grace', 'JONES', '2014-09-22', 'Bata',
       'FEMALE', 'repeating', 'old', '',
       'Mondoasi', 'Mondoasi district, Bata', '222000001', '',
       'Paul JONES', 'Trader', 'Anne JONES', 'Homemaker',
       'Sylvia JONES', 'Seamstress',
       '2023-2024', 'ET', '', '', '1st A'],
    ],
  },
  es: {
    filename: 'modelo_importacion_alumnos.xlsx',
    sheet:    'Modelo alumnos',
    rows: [
      ['matricula', 'nombre', 'apellidos', 'fechaNacimiento', 'lugarNacimiento',
       'sexo', 'estado', 'estadoCentro', 'escuelaAnterior',
       'barrio', 'direccion', 'telefono', 'contactoEmergencia',
       'nombrePadre', 'profesionPadre', 'nombreMadre', 'profesionMadre',
       'tutor', 'profesionTutor',
       'fechaEntrada', 'motivoEntrada', 'fechaSalida', 'motivoSalida', 'clase'],
      ['s260001', 'Juan', 'MBA NDONG', '2015-03-15', 'Malabo',
       'MASCULINO', 'nuevo', 'nuevo', 'Escuela Ela Nguema',
       'Ela Nguema', 'Calle 12, Malabo', '222123456', '222987654',
       'Pedro MBA', 'Ingeniero', 'María NDONG', 'Profesora',
       '', '',
       '2024', 'ED', '', '', '1º A'],
      ['s260002', 'Lucía', 'OYANA OBONO', '2014-09-22', 'Bata',
       'FEMENINO', 'repetidor', 'antiguo', '',
       'Mondoasi', 'Calle 3, Bata', '222000001', '',
       'Pablo OYANA', 'Comerciante', 'Ana OBONO', 'Ama de casa',
       'Silvia OBONO', 'Costurera',
       '2023-2024', 'ET', '', '', '1º A'],
    ],
  },
};

export function downloadStudentTemplate() {
  const tpl = STUDENT_TEMPLATE[templateLang()] || STUDENT_TEMPLATE.fr;
  return downloadExcel(tpl.filename, tpl.rows, tpl.sheet);
}
