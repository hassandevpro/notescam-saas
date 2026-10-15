// ════════════════════════════════════════════════════════════════════════════
// ÉCHANGE DE NOTES ENTRE POSTES — « chaque enseignant son logiciel »
//
// L'établissement installe NotesCam chez chaque enseignant. Chacun saisit ses
// notes chez lui, clique « Exporter mes notes », et remet UN fichier à
// l'administration, qui l'importe dans la base de l'école.
//
// CE QUI REND LA CHOSE SÛRE (cf. src/lib/gradeBundle.js) :
//   • le fichier porte son origine — école, année, enseignant, et pour chaque
//     note sa classe, sa matière (ou compétence/critère/UA) et sa période. À
//     l'arrivée, rien n'est deviné : l'admin ne peut pas déverser la 5e dans la 6e ;
//   • une note déjà en base qui DIFFÈRE n'est jamais écrasée : elle devient un
//     conflit, listé, et l'admin tranche ensuite. Deux enseignants dont les
//     fichiers se recouvrent ne peuvent pas s'effacer l'un l'autre ;
//   • ce qui ne se rattache pas (classe absente, élève introuvable, note hors
//     barème) est AFFICHÉ, jamais écrit ailleurs.
//
// L'export est GLOBAL : toutes les classes visibles, toutes les matières, toutes
// les séquences, et les trois moteurs par compétences. Un enseignant ne doit pas
// avoir à répéter l'opération grille par grille — c'est précisément ce qui rendait
// l'export existant inutilisable pour ce besoin.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useRef, useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { useAuthStore } from '../../store/authStore';
import { useSchoolStore } from '../../store/schoolStore';
import {
  buildGradeBundle, collectTeacherGrades, countBundleNotes,
  parseGradeBundle, planGradeImport, groupClassicWrites,
} from '../../lib/gradeBundle';
// Les clés des trois magasins par compétences viennent de LEUR moteur, jamais
// recopiées ici : une clé reconstruite à la main dériverait un jour de celle qui
// écrit, et l'import ne verrait plus les notes existantes — donc écraserait.
import { noteNkey } from '../../core/apcEngine';
import { primNkey } from '../../core/primEngine';
import { obsNkey } from '../../core/matEngine';

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'notescam';

export default function GradeBundleIO() {
  const t = useT();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const fullName = useAuthStore((s) => s.fullName);
  const userEmail = useAuthStore((s) => s.user?.email || '');
  const userName = fullName || userEmail;
  const teacherId = useAuthStore((s) => s.teacherId);

  // Les notes et les listes sont lues au MOMENT de l'action, via `getState()` —
  // pas abonnées ici : entre le rendu et le clic, les trois magasins par
  // compétences ont pu être chargés, et c'est leur contenu FRAIS qui décide
  // d'écrire ou de signaler un conflit. S'abonner ne ferait que re-rendre ce
  // panneau à chaque note saisie sur l'écran voisin.
  const apcReferentiel = useSchoolStore((s) => s.apcReferentiel);
  const primReferentiel = useSchoolStore((s) => s.primReferentiel);
  const matReferentiel = useSchoolStore((s) => s.matReferentiel);
  const saveGrade = useSchoolStore((s) => s.saveGrade);
  const saveApcNote = useSchoolStore((s) => s.saveApcNote);
  const savePrimNote = useSchoolStore((s) => s.savePrimNote);
  const saveMatObservation = useSchoolStore((s) => s.saveMatObservation);
  const loadApc = useSchoolStore((s) => s.loadApc);
  const loadPrim = useSchoolStore((s) => s.loadPrim);
  const loadMat = useSchoolStore((s) => s.loadMat);

  const [ouvert, setOuvert] = useState(false);
  const [plan, setPlan] = useState(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [rapport, setRapport] = useState(null);
  const fileRef = useRef(null);

  const peutImporter = role === 'admin';

  // Libellés joints au fichier pour que le rapport de conflits de l'admin parle
  // de « Lire · Oral » et non de « 1a · oral ».
  const labels = useMemo(() => ({
    apc: Object.fromEntries((apcReferentiel?.competences || []).map((c) => [c.id, c.intitule || c.code || ''])),
    prim: Object.fromEntries((primReferentiel?.competences || []).map((c) => [c.id, c.intitule || c.code || ''])),
    critere: Object.fromEntries((primReferentiel?.criteres || []).map((c) => [c.id, c.nom || ''])),
    mat: Object.fromEntries((matReferentiel?.domaines || []).map((d) => [d.id, d.intitule || ''])),
  }), [apcReferentiel, primReferentiel, matReferentiel]);

  // ── Export ────────────────────────────────────────────────────────────────
  // Les trois magasins par compétences sont chargés À LA DEMANDE, par le poste
  // qui en a besoin. Exporter depuis l'écran classique sans les charger d'abord
  // produirait un fichier amputé des notes de compétences — et personne ne s'en
  // apercevrait avant les bulletins. On les charge donc tous, puis on lit l'état
  // FRAIS du store (les valeurs capturées par le rendu sont d'avant le chargement).
  const handleExport = async () => {
    setErreur('');
    setEnCours(true);
    try {
      await Promise.all([loadApc(), loadPrim(), loadMat()].map((p) => Promise.resolve(p).catch(() => null)));
    } finally {
      setEnCours(false);
    }
    const st = useSchoolStore.getState();
    const bundle = buildGradeBundle({
      school,
      teacher: { id: teacherId, name: userName, email: userEmail },
      classes: collectTeacherGrades({
        classes: st.classes, students: st.students, subjects: st.subjects,
        gradeMap: st.gradeMap, apcNotes: st.apcNotes, primNotes: st.primNotes,
        matObservations: st.matObservations, labels,
      }),
    });
    const total = countBundleNotes(bundle);
    if (!total) {
      setErreur(t('Aucune note à exporter pour le moment.', 'No grades to export yet.'));
      return;
    }
    setErreur('');
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-${slug(school?.name)}-${slug(userName || 'enseignant')}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setRapport({ exporte: total, classes: bundle.classes.length });
  };

  // ── Import (admin) ────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    setRapport(null);
    setPlan(null);
    const texte = await file.text();
    const { bundle, error } = parseGradeBundle(texte);
    if (error) { setErreur(error); return; }

    // CE CHARGEMENT N'EST PAS UNE OPTIMISATION, C'EST LA GARANTIE CENTRALE.
    // Les notes par compétences ne sont en mémoire que si le poste concerné a
    // été ouvert. Sans elles, `existant` répond « rien en base » pour chacune :
    // aucun conflit ne serait détecté et l'import ÉCRASERAIT les notes déjà
    // saisies — exactement ce que cet écran promet de ne jamais faire.
    setEnCours(true);
    try {
      await Promise.all([loadApc(), loadPrim(), loadMat()].map((p) => Promise.resolve(p).catch(() => null)));
    } finally {
      setEnCours(false);
    }
    const st = useSchoolStore.getState();

    const p = planGradeImport(bundle, {
      schoolId: school?.id,
      schoolName: school?.name,
      classes: st.classes,
      students: st.students,
      subjects: st.subjects,
      existant: {
        classic: (classId, eleveId, sequence, subjectId) =>
          st.gradeMap[`${classId}_${eleveId}_${sequence}`]?.[subjectId],
        apc: (eleveId, competenceId, sequenceId) => st.apcNotes[noteNkey(eleveId, competenceId, sequenceId)],
        prim: (eleveId, competenceId, critereId, ua) => st.primNotes[primNkey(eleveId, competenceId, critereId, ua)],
        mat: (eleveId, domaineId, trimestreId) => st.matObservations[obsNkey(eleveId, domaineId, trimestreId)],
      },
    });
    if (!p.ok) { setErreur(p.erreur); return; }
    setErreur('');
    setPlan(p);
  };

  const appliquer = async () => {
    if (!plan) return;
    setEnCours(true);
    const { classic, autres } = groupClassicWrites(plan.ecritures);
    let ecrites = 0, verrouillees = 0;
    try {
      for (const l of classic) {
        // `saveGrade` refuse et renvoie { locked } si la séquence est verrouillée :
        // on agrège plutôt que de noyer l'admin sous un message par élève.
        const r = await saveGrade(l.classId, l.studentId, l.sequence, l.scores, { silent: true });
        if (r?.locked) verrouillees += Object.keys(l.scores).length;
        else ecrites += Object.keys(l.scores).length;
      }
      for (const e of autres) {
        if (e.kind === 'apc') {
          await saveApcNote({ eleveId: e.eleveId, competenceId: e.competenceId, sequenceId: e.sequenceId, note: e.note, noteMax: e.noteMax });
        } else if (e.kind === 'prim') {
          await savePrimNote({ eleveId: e.eleveId, competenceId: e.competenceId, critereId: e.critereId, ua: e.ua, note: e.note, pointsMax: e.pointsMax });
        } else if (e.kind === 'mat') {
          await saveMatObservation({ eleveId: e.eleveId, domaineId: e.domaineId, trimestreId: e.trimestreId, niveauAcquis: e.niveauAcquis, observation: e.observation });
        }
        ecrites++;
      }
      setRapport({ ecrites, verrouillees, conflits: plan.conflits.length, ignores: plan.ignores.length });
      setPlan(null);
    } finally {
      setEnCours(false);
    }
  };

  const ignoresParType = useMemo(() => {
    const m = new Map();
    for (const i of plan?.ignores || []) m.set(i.type, (m.get(i.type) || 0) + 1);
    return [...m.entries()];
  }, [plan]);

  const LIBELLE_IGNORE = {
    classe_inconnue: t('classe absente de cette base', 'class not in this database'),
    eleve_introuvable: t('élève introuvable dans la classe', 'student not found in the class'),
    eleve_ambigu: t('deux élèves du même nom (non tranché)', 'two students with the same name (not resolved)'),
    matiere_inconnue: t('matière absente de la classe', 'subject not in the class'),
    note_invalide: t('note hors barème', 'grade out of range'),
  };

  return (
    <div className="mb-4 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={handleExport} className="btn-secondary">
          {t('Exporter mes notes (fichier)', 'Export my grades (file)')}
        </button>
        {peutImporter && (
          <>
            <button onClick={() => { setOuvert((v) => !v); setErreur(''); }} className="btn-secondary">
              {t('Importer les notes d’un enseignant', 'Import a teacher’s grades')}
            </button>
            <input
              ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </>
        )}
      </div>

      {erreur && (
        <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-800">{erreur}</div>
      )}

      {rapport && !plan && (
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-900">
          {rapport.exporte != null
            ? t(`${rapport.exporte} note(s) exportée(s) sur ${rapport.classes} classe(s). Remettez le fichier à l’administration.`,
                `${rapport.exporte} grade(s) exported across ${rapport.classes} class(es). Hand the file to the administration.`)
            : t(`${rapport.ecrites} note(s) importée(s).`, `${rapport.ecrites} grade(s) imported.`)}
          {rapport.verrouillees > 0 && ' ' + t(`${rapport.verrouillees} refusée(s) : période verrouillée.`, `${rapport.verrouillees} refused: period locked.`)}
          {rapport.conflits > 0 && ' ' + t(`${rapport.conflits} conflit(s) non appliqué(s).`, `${rapport.conflits} conflict(s) not applied.`)}
          {rapport.ignores > 0 && ' ' + t(`${rapport.ignores} ligne(s) non rattachée(s).`, `${rapport.ignores} unmatched row(s).`)}
        </div>
      )}

      {peutImporter && ouvert && !plan && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-600 mb-3">
            {t('Déposez le fichier .json produit par le poste de l’enseignant. Rien n’est écrit avant votre validation.',
               'Drop the .json file produced on the teacher’s computer. Nothing is written before you confirm.')}
          </p>
          <button onClick={() => fileRef.current?.click()} className="btn-primary">
            {t('Choisir le fichier…', 'Choose the file…')}
          </button>
        </div>
      )}

      {plan && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-gray-900">{t('Aperçu avant import', 'Preview before import')}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {t('Enseignant', 'Teacher')} : <b>{plan.resume.enseignant}</b>
            {plan.resume.exporte_le && ` · ${t('exporté le', 'exported on')} ${String(plan.resume.exporte_le).slice(0, 10)}`}
            {plan.resume.classes.length > 0 && ` · ${plan.resume.classes.join(', ')}`}
          </p>
          <ul className="text-sm mt-3 space-y-1">
            <li>✅ <b>{plan.resume.a_ecrire}</b> {t('note(s) à enregistrer', 'grade(s) to save')}</li>
            <li>➖ <b>{plan.resume.identiques}</b> {t('déjà identique(s) en base', 'already identical in the database')}</li>
            <li>⚠️ <b>{plan.resume.conflits}</b> {t('conflit(s) — la base garde sa valeur', 'conflict(s) — the database keeps its value')}</li>
            <li>❌ <b>{plan.resume.ignores}</b> {t('ligne(s) non rattachée(s)', 'unmatched row(s)')}</li>
          </ul>

          {plan.conflits.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">
                {t('Conflits (non appliqués)', 'Conflicts (not applied)')}
              </p>
              <div className="max-h-48 overflow-auto border border-amber-200 rounded-lg">
                <table className="w-full text-xs">
                  <tbody>
                    {plan.conflits.slice(0, 50).map((c, i) => (
                      <tr key={i} className="border-b border-amber-100 last:border-0">
                        <td className="px-2 py-1">{c.classe}</td>
                        <td className="px-2 py-1">{c.eleve}</td>
                        <td className="px-2 py-1">{c.colonne}</td>
                        <td className="px-2 py-1 text-gray-500">{c.periode}</td>
                        <td className="px-2 py-1 text-right font-mono">{c.actuel} → {c.entrant}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.conflits.length > 50 && (
                <p className="text-xs text-gray-500 mt-1">
                  {t(`… ${plan.conflits.length - 50} autre(s)`, `… ${plan.conflits.length - 50} more`)}
                </p>
              )}
            </div>
          )}

          {ignoresParType.length > 0 && (
            <p className="text-xs text-gray-600 mt-3">
              {t('Non rattaché', 'Unmatched')} : {ignoresParType.map(([type, n]) => `${n} × ${LIBELLE_IGNORE[type] || type}`).join(' · ')}
            </p>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={appliquer} disabled={enCours || plan.resume.a_ecrire === 0} className="btn-primary">
              {enCours
                ? t('Import en cours…', 'Importing…')
                : t(`Enregistrer ${plan.resume.a_ecrire} note(s)`, `Save ${plan.resume.a_ecrire} grade(s)`)}
            </button>
            <button onClick={() => { setPlan(null); setOuvert(false); }} disabled={enCours} className="btn-secondary">
              {t('Annuler', 'Cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
