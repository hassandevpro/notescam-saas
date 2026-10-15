// ════════════════════════════════════════════════════════════════════════════
// FICHIER D'ÉCHANGE DE NOTES « notescam-notes/v1 » — logique pure
//
// POURQUOI. Un établissement veut installer le logiciel chez CHAQUE enseignant :
// chacun saisit ses notes sur son poste, exporte UN fichier, et l'admin les
// réunit dans la base de l'école. L'export existant ne sert pas ce besoin : il
// sort une grille à la fois (une classe × une matière × une séquence) et le
// fichier ne dit PAS d'où il vient. À l'import, c'est l'écran qui décide de la
// classe et de la séquence — donc un admin fatigué écrit les notes de la 5e
// dans la 6e, en silence, et personne ne s'en aperçoit avant les bulletins.
//
// Ce format porte donc son identité : école, année, enseignant, et pour chaque
// note la classe, la matière (ou la compétence / le critère / l'UA) et la
// période. L'import n'a plus rien à deviner, et ce qu'il ne peut pas rattacher,
// il le DIT au lieu de l'écrire ailleurs.
//
// LES QUATRE MOTEURS sont couverts, parce qu'une école n'a pas que des matières
// sur 20 : le primaire et le collège APC notent des compétences, la maternelle
// observe des domaines. Un fichier qui ne porterait que les matières classiques
// sortirait VIDE chez une école par compétences.
//   classic → grades           : (classe, élève, séquence) → { matière: note }
//   apc     → apc_notes        : (élève, compétence, séquence)
//   prim    → prim_notes       : (élève, compétence, critère, UA)
//   mat     → mat_observations : (élève, domaine, trimestre)
//
// RIEN N'EST ÉCRASÉ. Une note déjà en base qui diffère de celle du fichier est
// un CONFLIT : la base garde sa valeur et le conflit est listé. Deux enseignants
// dont les fichiers se recouvrent ne peuvent donc pas s'effacer l'un l'autre, et
// un vieux fichier réimporté par erreur ne ramène pas d'anciennes notes.
// ════════════════════════════════════════════════════════════════════════════
import { validateGrade } from './gradeEntry';

export const BUNDLE_FORMAT = 'notescam-notes/v1';

// Appariement tolérant des libellés (casse, accents, espaces multiples) : le
// fichier vient d'un autre poste, où « Mathématiques » a pu être saisi
// « MATHEMATIQUES ». Les identifiants restent la voie principale.
export const normNom = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const estVide = (v) => v === null || v === undefined || String(v).trim() === '';

// ── Construction du fichier (poste de l'enseignant) ─────────────────────────
// `classes` est déjà filtré par l'appelant sur le périmètre de l'enseignant :
// ce module ne connaît ni les rôles ni les permissions, il met en forme.
export function buildGradeBundle({ school, teacher, classes = [], exportedAt, appVersion } = {}) {
  const propres = (classes || [])
    .map((c) => ({
      id: c.id,
      name: c.name || '',
      level: c.level || '',
      engine: c.engine || 'classic',
      students: (c.students || []).map((s) => ({
        id: s.id, matricule: s.matricule || '', name: s.name || '',
      })),
      classic: (c.classic || []).filter((b) => b && Object.keys(b.grades || {}).length),
      apc: (c.apc || []).filter((b) => b && Object.keys(b.notes || {}).length),
      prim: (c.prim || []).filter((b) => b && Object.keys(b.notes || {}).length),
      mat: (c.mat || []).filter((b) => b && Object.keys(b.observations || {}).length),
    }))
    // Une classe sans aucune note n'a rien à voyager : elle gonflerait le
    // fichier et le rapport d'import sans jamais rien écrire.
    .filter((c) => c.classic.length || c.apc.length || c.prim.length || c.mat.length);

  return {
    format: BUNDLE_FORMAT,
    exported_at: exportedAt || new Date().toISOString(),
    app_version: appVersion || null,
    school: { id: school?.id || null, name: school?.name || '', year: school?.current_year || '' },
    teacher: { id: teacher?.id || null, name: teacher?.name || '', email: teacher?.email || '' },
    classes: propres,
  };
}

// Combien de notes transporte un fichier — affiché avant l'envoi comme avant
// l'import : un fichier « vide » doit se voir tout de suite.
export function countBundleNotes(bundle) {
  let n = 0;
  for (const c of bundle?.classes || []) {
    for (const b of c.classic || []) n += Object.keys(b.grades || {}).length;
    for (const b of c.apc || []) n += Object.keys(b.notes || {}).length;
    for (const b of c.prim || []) n += Object.keys(b.notes || {}).length;
    for (const b of c.mat || []) n += Object.keys(b.observations || {}).length;
  }
  return n;
}

// ── Collecte depuis les structures du store (poste de l'enseignant) ─────────
// Traduit les quatre magasins de notes de l'application en sections du fichier.
// Fonction PURE : on lui passe les données, pas le store — c'est ce qui permet
// de l'éprouver sans navigateur.
//
// `gradeMap` est indexé `${classId}_${studentId}_${sequence}` → { matière: note }.
// On ne découpe PAS ces clés pour les relire : on les reconstruit à partir des
// classes, des élèves et des séquences. Un identifiant contenant un « _ » (base
// migrée, identifiant maison) ferait dérailler un découpage, en silence.
export function collectTeacherGrades({
  classes = [], students = [], subjects = [], gradeMap = {},
  apcNotes = {}, primNotes = {}, matObservations = {},
  sequences = [1, 2, 3, 4, 5, 6], labels = {},
}) {
  const parClasse = [];
  for (const cls of classes) {
    const eleves = students.filter((s) => s.class_id === cls.id);
    if (!eleves.length) continue;
    const idsEleves = new Set(eleves.map((s) => s.id));
    const matieres = subjects.filter((m) => m.class_id === cls.id);

    // Matières classiques : un bloc par (matière, séquence) réellement notée.
    const classic = [];
    for (const m of matieres) {
      for (const seq of sequences) {
        const grades = {};
        for (const e of eleves) {
          const v = gradeMap[`${cls.id}_${e.id}_${seq}`]?.[m.id];
          if (!estVide(v)) grades[e.id] = String(v);
        }
        if (Object.keys(grades).length) {
          classic.push({ subject_id: m.id, subject_name: m.name, max: m.max ?? 20, sequence: seq, grades });
        }
      }
    }

    // Compétences et observations : on part des ENREGISTREMENTS (ils portent
    // leurs identifiants), pas des clés — aucune hypothèse sur leur format.
    const groupes = { apc: new Map(), prim: new Map(), mat: new Map() };
    for (const r of Object.values(apcNotes || {})) {
      if (!idsEleves.has(r?.eleve_id) || estVide(r.note)) continue;
      const k = `${r.competence_id}|${r.sequence_id}`;
      if (!groupes.apc.has(k)) {
        groupes.apc.set(k, {
          competence_id: r.competence_id, sequence_id: r.sequence_id,
          competence_label: labels.apc?.[r.competence_id] || '', notes: {},
        });
      }
      groupes.apc.get(k).notes[r.eleve_id] = { note: String(r.note), note_max: r.note_max ?? null };
    }
    for (const r of Object.values(primNotes || {})) {
      if (!idsEleves.has(r?.eleve_id) || estVide(r.note)) continue;
      const k = `${r.competence_id}|${r.critere_id}|${r.ua}`;
      if (!groupes.prim.has(k)) {
        groupes.prim.set(k, {
          competence_id: r.competence_id, critere_id: r.critere_id, ua: r.ua,
          competence_label: labels.prim?.[r.competence_id] || '',
          critere_label: labels.critere?.[r.critere_id] || '', notes: {},
        });
      }
      groupes.prim.get(k).notes[r.eleve_id] = { note: String(r.note), points_max: r.points_max ?? null };
    }
    for (const r of Object.values(matObservations || {})) {
      if (!idsEleves.has(r?.eleve_id) || estVide(r.niveau_acquis)) continue;
      const k = `${r.domaine_id}|${r.trimestre_id}`;
      if (!groupes.mat.has(k)) {
        groupes.mat.set(k, {
          domaine_id: r.domaine_id, trimestre_id: r.trimestre_id,
          domaine_label: labels.mat?.[r.domaine_id] || '', observations: {},
        });
      }
      groupes.mat.get(k).observations[r.eleve_id] = {
        niveau_acquis: r.niveau_acquis, observation: r.observation || '',
      };
    }

    parClasse.push({
      id: cls.id, name: cls.name, level: cls.level, engine: cls.engine || 'classic',
      students: eleves.map((s) => ({ id: s.id, matricule: s.matricule || '', name: s.name })),
      classic,
      apc: [...groupes.apc.values()],
      prim: [...groupes.prim.values()],
      mat: [...groupes.mat.values()],
    });
  }
  return parClasse;
}

// Les notes classiques s'enregistrent par (classe, élève, séquence) d'un bloc :
// `saveGrade` reçoit toutes les matières à la fois. Sans ce regroupement, cinq
// matières d'un même élève feraient cinq écritures concurrentes sur la MÊME
// ligne — la dernière gagnerait et les quatre autres seraient perdues.
export function groupClassicWrites(ecritures = []) {
  const parLigne = new Map();
  const autres = [];
  for (const e of ecritures) {
    if (e.kind !== 'classic') { autres.push(e); continue; }
    const k = `${e.classId}|${e.studentId}|${e.sequence}`;
    if (!parLigne.has(k)) {
      parLigne.set(k, { classId: e.classId, studentId: e.studentId, sequence: e.sequence, scores: {} });
    }
    parLigne.get(k).scores[e.subjectId] = e.value;
  }
  return { classic: [...parLigne.values()], autres };
}

// ── Lecture du fichier (poste de l'admin) ───────────────────────────────────
// Le contenu vient d'ailleurs : il est contrôlé, jamais cru sur parole.
export function parseGradeBundle(texte) {
  let b;
  try {
    b = JSON.parse(texte);
  } catch (e) {
    return { bundle: null, error: `Fichier illisible (JSON) : ${e.message}` };
  }
  if (!b || typeof b !== 'object') return { bundle: null, error: 'Fichier vide.' };
  if (b.format !== BUNDLE_FORMAT) {
    return {
      bundle: null,
      error: `Ce n'est pas un fichier de notes NotesCam (format « ${b.format || '?'} », attendu « ${BUNDLE_FORMAT} »).`,
    };
  }
  if (!Array.isArray(b.classes)) return { bundle: null, error: 'Fichier sans section « classes ».' };
  return { bundle: b, error: null };
}

// ── Plan d'import ───────────────────────────────────────────────────────────
// `cible` décrit la base de l'admin, en données pures (aucun store ici) :
//   { schoolId, schoolName, classes[], students[], subjects[], existant }
//   existant : { classic(classId, eleveId, sequence, subjectId),
//                apc(eleveId, competenceId, sequenceId),
//                prim(eleveId, competenceId, critereId, ua),
//                mat(eleveId, domaineId, trimestreId) }
//   chaque fonction renvoie la valeur en base, ou null/undefined si absente.
//
// Renvoie { ok, erreur, ecritures, conflits, identiques, ignores, resume }.
// `ecritures` est la liste EXACTE des écritures à faire : l'écran n'a plus qu'à
// la dérouler, et rien d'autre ne doit être écrit.
export function planGradeImport(bundle, cible = {}) {
  const vide = { ok: false, ecritures: [], conflits: [], identiques: 0, ignores: [], resume: null };
  if (!bundle) return { ...vide, erreur: 'Aucun fichier.' };

  // École : un fichier d'une AUTRE école ne s'importe pas. Les identifiants
  // survivent à la migration cloud→LAN, donc ils doivent coïncider ; on accepte
  // par le nom quand l'identifiant diffère (base recréée), jamais au-delà.
  const memeId = bundle.school?.id && cible.schoolId && bundle.school.id === cible.schoolId;
  const memeNom = bundle.school?.name && cible.schoolName
    && normNom(bundle.school.name) === normNom(cible.schoolName);
  if (!memeId && !memeNom) {
    return {
      ...vide,
      erreur: `Ce fichier vient d'un autre établissement (« ${bundle.school?.name || '?'} ») — rien n'a été importé.`,
    };
  }

  const classesParId = new Map((cible.classes || []).map((c) => [c.id, c]));
  const classesParNom = new Map((cible.classes || []).map((c) => [normNom(c.name), c]));
  const elevesParClasse = new Map();
  for (const s of cible.students || []) {
    if (!elevesParClasse.has(s.class_id)) elevesParClasse.set(s.class_id, []);
    elevesParClasse.get(s.class_id).push(s);
  }
  const matieresParClasse = new Map();
  for (const m of cible.subjects || []) {
    if (!matieresParClasse.has(m.class_id)) matieresParClasse.set(m.class_id, []);
    matieresParClasse.get(m.class_id).push(m);
  }

  const ecritures = [];
  const conflits = [];
  const ignores = [];
  let identiques = 0;
  const ex = cible.existant || {};

  // Un élève se retrouve par identifiant, puis par matricule, puis par nom —
  // dans SA classe seulement. Chercher dans toute l'école apparierait deux
  // homonymes de niveaux différents, ce qui est pire que ne pas trouver.
  const trouverEleve = (classeCible, ref) => {
    const liste = elevesParClasse.get(classeCible.id) || [];
    if (ref.id) {
      const parId = liste.find((s) => s.id === ref.id);
      if (parId) return parId;
    }
    if (ref.matricule) {
      const m = normNom(ref.matricule);
      const parMat = liste.find((s) => s.matricule && normNom(s.matricule) === m);
      if (parMat) return parMat;
    }
    if (ref.name) {
      const n = normNom(ref.name);
      const homonymes = liste.filter((s) => normNom(s.name) === n);
      if (homonymes.length === 1) return homonymes[0];
      // Deux élèves du même nom dans la même classe : on refuse de choisir.
      if (homonymes.length > 1) return { ambigu: true };
    }
    return null;
  };

  const noter = (type, info) => ignores.push({ type, ...info });

  // Compare l'existant à l'entrant. Existant absent = on écrit ; égal = no-op ;
  // différent = conflit, et la base garde sa valeur.
  const arbitrer = (actuel, entrant, meta, ecriture) => {
    if (estVide(entrant)) return;
    if (estVide(actuel)) { ecritures.push(ecriture); return; }
    if (String(actuel).trim() === String(entrant).trim()) { identiques++; return; }
    conflits.push({ ...meta, actuel: String(actuel), entrant: String(entrant) });
  };

  for (const cls of bundle.classes || []) {
    const classeCible = (cls.id && classesParId.get(cls.id)) || classesParNom.get(normNom(cls.name));
    if (!classeCible) { noter('classe_inconnue', { classe: cls.name }); continue; }

    const refEleves = new Map((cls.students || []).map((s) => [s.id, s]));
    const resoudre = (eleveId) => {
      const ref = refEleves.get(eleveId) || { id: eleveId };
      const trouve = trouverEleve(classeCible, ref);
      if (trouve?.ambigu) { noter('eleve_ambigu', { classe: cls.name, eleve: ref.name }); return null; }
      if (!trouve) { noter('eleve_introuvable', { classe: cls.name, eleve: ref.name || eleveId }); return null; }
      return trouve;
    };

    // ── Matières classiques ────────────────────────────────────────────────
    for (const bloc of cls.classic || []) {
      const matieres = matieresParClasse.get(classeCible.id) || [];
      const matiere = (bloc.subject_id && matieres.find((m) => m.id === bloc.subject_id))
        || matieres.find((m) => normNom(m.name) === normNom(bloc.subject_name));
      if (!matiere) { noter('matiere_inconnue', { classe: cls.name, matiere: bloc.subject_name }); continue; }
      const max = Number(matiere.max) || Number(bloc.max) || 20;
      for (const [eleveId, brut] of Object.entries(bloc.grades || {})) {
        const eleve = resoudre(eleveId);
        if (!eleve) continue;
        // Même validation que la saisie à la main (« ABS », virgule décimale,
        // bornes 0..max) : un fichier ne doit pas introduire ce que l'écran
        // refuserait.
        const valide = validateGrade(brut, max);
        if (valide === null) {
          noter('note_invalide', {
            classe: cls.name, matiere: matiere.name, eleve: eleve.name, valeur: String(brut),
          });
          continue;
        }
        if (valide === '') continue;
        const actuel = ex.classic?.(classeCible.id, eleve.id, bloc.sequence, matiere.id);
        arbitrer(
          actuel, valide,
          {
            kind: 'classic', classe: classeCible.name, colonne: matiere.name,
            periode: `séq. ${bloc.sequence}`, eleve: eleve.name,
          },
          {
            kind: 'classic', classId: classeCible.id, studentId: eleve.id,
            sequence: bloc.sequence, subjectId: matiere.id, value: valide,
          },
        );
      }
    }

    // ── Compétences APC (collège) ─────────────────────────────────────────
    for (const bloc of cls.apc || []) {
      for (const [eleveId, v] of Object.entries(bloc.notes || {})) {
        const eleve = resoudre(eleveId);
        if (!eleve) continue;
        const note = v && typeof v === 'object' ? v.note : v;
        const noteMax = v && typeof v === 'object' ? v.note_max : undefined;
        const actuel = ex.apc?.(eleve.id, bloc.competence_id, bloc.sequence_id);
        arbitrer(
          actuel?.note ?? actuel, note,
          {
            kind: 'apc', classe: classeCible.name,
            colonne: bloc.competence_label || bloc.competence_id,
            periode: bloc.sequence_id, eleve: eleve.name,
          },
          {
            kind: 'apc', eleveId: eleve.id, competenceId: bloc.competence_id,
            sequenceId: bloc.sequence_id, note, noteMax,
          },
        );
      }
    }

    // ── Compétences primaires (compétence × critère × UA) ─────────────────
    for (const bloc of cls.prim || []) {
      for (const [eleveId, v] of Object.entries(bloc.notes || {})) {
        const eleve = resoudre(eleveId);
        if (!eleve) continue;
        const note = v && typeof v === 'object' ? v.note : v;
        const pointsMax = v && typeof v === 'object' ? v.points_max : undefined;
        const actuel = ex.prim?.(eleve.id, bloc.competence_id, bloc.critere_id, bloc.ua);
        arbitrer(
          actuel?.note ?? actuel, note,
          {
            kind: 'prim', classe: classeCible.name,
            colonne: `${bloc.competence_label || bloc.competence_id} · ${bloc.critere_label || bloc.critere_id}`,
            periode: `UA ${bloc.ua}`, eleve: eleve.name,
          },
          {
            kind: 'prim', eleveId: eleve.id, competenceId: bloc.competence_id,
            critereId: bloc.critere_id, ua: bloc.ua, note, pointsMax,
          },
        );
      }
    }

    // ── Maternelle (domaine × trimestre) ──────────────────────────────────
    // Le niveau d'acquisition (A/ECA/NA) tranche le conflit ; l'observation
    // écrite l'accompagne et ne se compare pas mot à mot.
    for (const bloc of cls.mat || []) {
      for (const [eleveId, v] of Object.entries(bloc.observations || {})) {
        const eleve = resoudre(eleveId);
        if (!eleve) continue;
        const niveau = v && typeof v === 'object' ? v.niveau_acquis : v;
        const texte = v && typeof v === 'object' ? v.observation : '';
        const actuel = ex.mat?.(eleve.id, bloc.domaine_id, bloc.trimestre_id);
        arbitrer(
          actuel?.niveau_acquis ?? actuel, niveau,
          {
            kind: 'mat', classe: classeCible.name,
            colonne: bloc.domaine_label || bloc.domaine_id,
            periode: bloc.trimestre_id, eleve: eleve.name,
          },
          {
            kind: 'mat', eleveId: eleve.id, domaineId: bloc.domaine_id,
            trimestreId: bloc.trimestre_id, niveauAcquis: niveau, observation: texte,
          },
        );
      }
    }
  }

  return {
    ok: true,
    erreur: null,
    ecritures,
    conflits,
    identiques,
    ignores,
    resume: {
      notes_du_fichier: countBundleNotes(bundle),
      a_ecrire: ecritures.length,
      conflits: conflits.length,
      identiques,
      ignores: ignores.length,
      enseignant: bundle.teacher?.name || bundle.teacher?.email || '(non renseigné)',
      exporte_le: bundle.exported_at || null,
      classes: (bundle.classes || []).map((c) => c.name),
    },
  };
}
