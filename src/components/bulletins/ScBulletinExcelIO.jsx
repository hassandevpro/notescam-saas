// ════════════════════════════════════════════════════════════════════════════
// SECOND CYCLE (2nde–Tle) — LE CLASSEUR DES BULLETINS, DANS LES DEUX SENS
//
// L'écran Bulletins du second cycle savait IMPRIMER, et rien d'autre. Deux
// gestes y manquaient, que l'école faisait donc à la main :
//
//   • EXPORTER — emporter la classe entière dans un classeur : le récapitulatif
//     (une ligne par élève, matières rangées par GROUPE comme sur le bulletin
//     officiel, moyennes de groupe, moyenne générale, rang, décision) et, à
//     côté, UNE FEUILLE PAR SÉQUENCE de la période affichée.
//
//   • IMPORTER — relire ces feuilles de séquence après les avoir remplies dans
//     Excel. C'est ce qui permet à un établissement de saisir ses notes hors
//     application — un classeur circule entre les enseignants — puis de tout
//     verser d'un coup, au lieu de retaper matière par matière.
//
// Cet écran ne DÉCIDE rien : la forme du classeur, la lecture des feuilles, le
// rattachement des élèves et des matières et le comptage des remplacements sont
// dans `lib/scBulletinSheet.js`, éprouvé par `_scBulletinSheet.test.mjs`. On ne
// trouve ici que le branchement des magasins, les libellés traduits et
// l'aperçu.
//
// CE QUI N'EST JAMAIS DEVINÉ (et que le test fixe) : une feuille sans numéro de
// séquence est ignorée et annoncée ; un élève ou une matière que la classe ne
// connaît pas est listé, jamais rattaché au voisin le plus proche ; une note
// hors barème est rejetée, pas tronquée ; une cellule vide n'efface rien ; les
// notes qui remplaceraient une valeur différente déjà en base sont comptées à
// part, et rien n'est écrit avant validation ; une séquence verrouillée refuse
// l'écriture (saveGrade rend { locked }) — c'est compté, jamais contourné.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useSchoolStore } from '../../store/schoolStore';
import { downloadExcelSheets, readWorkbookAoa, parseGradesRows, EXCEL_ACCEPT } from '../../lib/exportCsv';
import {
  buildScWorkbook, planScSheetImport, groupScWrites, scSheetColumns,
} from '../../lib/scBulletinSheet';

const slug = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export default function ScBulletinExcelIO({
  classId, classStudents, subjects, seqs, periodLabel, className, serieLabel,
  sys, scDataById, canImport,
}) {
  const t = useT();
  const gradeMap  = useSchoolStore((s) => s.gradeMap);
  const saveGrade = useSchoolStore((s) => s.saveGrade);

  const [plan, setPlan] = useState(null);
  const [erreur, setErreur] = useState('');
  const [busy, setBusy] = useState(false);
  const [rapport, setRapport] = useState(null);
  const fileRef = useRef(null);

  const seqLabel = (n) => `${t('Séquence', 'Sequence', 'Secuencia')} ${n}`;
  const defaultMax = sys === 'EN' ? 100 : 20;

  const exportPossible = useMemo(
    () => classStudents.length > 0
      && scSheetColumns({ students: classStudents, scDataById, subjects, defaultMax }).matieres.length > 0,
    [classStudents, scDataById, subjects, defaultMax],
  );

  // ── Export ────────────────────────────────────────────────────────────────
  const exporter = async () => {
    setErreur(''); setRapport(null);
    if (!exportPossible) {
      setErreur(t('Rien à exporter : cette classe n’a ni élève ni matière.',
                  'Nothing to export: this class has no students or subjects.',
                  'Nada que exportar: esta clase no tiene alumnos ni materias.'));
      return;
    }
    const feuilles = buildScWorkbook({
      students: classStudents, scDataById, subjects, gradeMap, classId, seqs, defaultMax, seqLabel,
      labels: {
        rang:            t('Rang', 'Rank', 'Puesto'),
        matricule:       t('Matricule', 'Student ID', 'Matrícula'),
        eleve:           t('Élève', 'Student', 'Alumno'),
        moyenne:         t('Moyenne', 'Average', 'Media'),
        moyenneGenerale: t('Moyenne générale', 'Overall average', 'Media general'),
        appreciation:    t('Appréciation', 'Remark', 'Apreciación'),
        decision:        t('Décision', 'Decision', 'Decisión'),
        recapitulatif:   t('Récapitulatif', 'Summary', 'Resumen'),
      },
    });
    const nom = ['bulletins', slug(className) || 'classe', slug(serieLabel), slug(periodLabel),
      new Date().toISOString().slice(0, 10)].filter(Boolean).join('_');
    await downloadExcelSheets(`${nom}.xlsx`, feuilles);
    setRapport({ exporte: classStudents.length, feuilles: feuilles.length - 1 });
  };

  // ── Import : lecture et APERÇU (rien n'est écrit ici) ─────────────────────
  const lireFichier = async (file) => {
    if (!file) return;
    setErreur(''); setRapport(null); setPlan(null);
    setBusy(true);
    try {
      const { sheets, error } = await readWorkbookAoa(file);
      if (error) { setErreur(error); return; }

      // Le découpage des en-têtes est celui de l'écran Notes, pas un second :
      // le classeur exporté ici se relit donc là-bas, et l'inverse.
      const feuilles = sheets.map(({ name, raw }) => {
        const { rows, error: err } = parseGradesRows(raw);
        return { nom: name, lignes: rows, erreur: err };
      });

      const p = planScSheetImport({ feuilles, classStudents, subjects, gradeMap, classId });
      if (!p.feuilles.length) {
        // Les feuilles VUES sont nommées dans le message : sans elles, une école
        // dont les onglets s'appellent « Maths » et « Français » lirait « aucune
        // feuille de séquence » sur un classeur qui en est pourtant plein, sans
        // comprendre que c'est leur NOM qui ne dit pas la séquence.
        setErreur(
          t('Aucune feuille de séquence lue dans ce classeur. Chaque feuille à importer doit porter un numéro de séquence (« Séquence 1 »…).',
            'No sequence sheet read in this workbook. Each sheet to import must carry a sequence number (“Sequence 1”…).',
            'Ninguna hoja de secuencia leída en este libro. Cada hoja a importar debe llevar un número de secuencia («Secuencia 1»…).')
          + (p.ignorees.length
            ? ` — ${t('Feuilles vues', 'Sheets seen', 'Hojas vistas')} : ${p.ignorees.join(' · ')}`
            : ''),
        );
        return;
      }
      setPlan(p);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ── Import : écriture, après validation ──────────────────────────────────
  const appliquer = async () => {
    if (!plan?.ecritures.length) return;
    setBusy(true);
    try {
      let ecrites = 0, verrouillees = 0;
      for (const { student, seq, scores } of groupScWrites(plan.ecritures)) {
        const r = await saveGrade(classId, student.id, seq, scores, { silent: true });
        if (r?.locked) verrouillees += Object.keys(scores).length;
        else ecrites += Object.keys(scores).length;
      }
      setRapport({ ecrites, verrouillees });
      setPlan(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={exporter} disabled={busy || !exportPossible} className="btn-secondary disabled:opacity-50">
          {t('Exporter Excel', 'Export Excel', 'Exportar Excel')}
        </button>
        {canImport && (
          <>
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-secondary disabled:opacity-50">
              {busy ? t('Lecture…', 'Reading…', 'Leyendo…') : t('Importer Excel', 'Import Excel', 'Importar Excel')}
            </button>
            <input ref={fileRef} type="file" accept={EXCEL_ACCEPT} className="hidden"
              onChange={(e) => lireFichier(e.target.files?.[0])} />
          </>
        )}
        <span className="text-xs text-gray-400 italic">
          {t(`Récapitulatif de la classe + une feuille par séquence (${seqs.join(', ')})`,
             `Class summary + one sheet per sequence (${seqs.join(', ')})`,
             `Resumen de la clase + una hoja por secuencia (${seqs.join(', ')})`)}
        </span>
      </div>

      {erreur && (
        <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-800">{erreur}</div>
      )}

      {rapport && !plan && (
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-900">
          {rapport.exporte != null
            ? t(`${rapport.exporte} élève(s) exporté(s) — récapitulatif + ${rapport.feuilles} feuille(s) de séquence.`,
                `${rapport.exporte} student(s) exported — summary + ${rapport.feuilles} sequence sheet(s).`,
                `${rapport.exporte} alumno(s) exportado(s) — resumen + ${rapport.feuilles} hoja(s) de secuencia.`)
            : t(`${rapport.ecrites} note(s) enregistrée(s).`,
                `${rapport.ecrites} grade(s) saved.`,
                `${rapport.ecrites} nota(s) guardada(s).`)}
          {rapport.verrouillees > 0 && ' ' + t(`${rapport.verrouillees} refusée(s) : séquence verrouillée.`,
                                               `${rapport.verrouillees} refused: sequence locked.`,
                                               `${rapport.verrouillees} rechazada(s): secuencia bloqueada.`)}
        </div>
      )}

      {plan && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold text-gray-900">{t('Aperçu avant import', 'Preview before import', 'Vista previa antes de importar')}</h3>

          <table className="text-sm mt-3 w-full max-w-xl">
            <tbody className="divide-y divide-gray-100">
              {plan.feuilles.map((f) => (
                <tr key={f.nom}>
                  <td className="py-1 pr-4 text-gray-700">{f.nom} → {seqLabel(f.seq)}</td>
                  <td className="py-1 text-right font-mono">{f.notes}</td>
                  <td className="py-1 pl-3 text-xs text-amber-700">
                    {f.remplacements > 0 && t(`dont ${f.remplacements} remplacement(s)`,
                                              `incl. ${f.remplacements} replacement(s)`,
                                              `incl. ${f.remplacements} reemplazo(s)`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {plan.remplacements > 0 && (
            <p className="text-xs text-amber-700 mt-3">
              ⚠️ {t(`${plan.remplacements} note(s) du classeur diffèrent d’une note déjà enregistrée : l’import les REMPLACERA.`,
                    `${plan.remplacements} grade(s) in the workbook differ from a grade already saved: the import WILL REPLACE them.`,
                    `${plan.remplacements} nota(s) del libro difieren de una nota ya guardada: la importación las REEMPLAZARÁ.`)}
            </p>
          )}

          {plan.ignorees.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              {t('Feuilles ignorées (aucun numéro de séquence)', 'Sheets ignored (no sequence number)', 'Hojas ignoradas (sin número de secuencia)')} : {plan.ignorees.join(' · ')}
            </p>
          )}
          {plan.elevesInconnus.length > 0 && (
            <p className="text-xs text-amber-700 mt-2">
              {t('Élèves introuvables dans la classe', 'Students not found in the class', 'Alumnos no encontrados en la clase')} : {plan.elevesInconnus.join(', ')}
            </p>
          )}
          {plan.matieresInconnues.length > 0 && (
            <p className="text-xs text-amber-700 mt-2">
              {t('Matières absentes de la classe', 'Subjects not in the class', 'Materias ausentes de la clase')} : {plan.matieresInconnues.join(', ')}
            </p>
          )}
          {plan.horsBareme > 0 && (
            <p className="text-xs text-rose-700 mt-2">
              {t(`${plan.horsBareme} note(s) hors barème, non importée(s).`,
                 `${plan.horsBareme} grade(s) out of range, not imported.`,
                 `${plan.horsBareme} nota(s) fuera de escala, no importada(s).`)}
            </p>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={appliquer} disabled={busy || plan.ecritures.length === 0} className="btn-primary disabled:opacity-50">
              {busy
                ? t('Import en cours…', 'Importing…', 'Importando…')
                : t(`Enregistrer ${plan.ecritures.length} note(s)`,
                    `Save ${plan.ecritures.length} grade(s)`,
                    `Guardar ${plan.ecritures.length} nota(s)`)}
            </button>
            <button onClick={() => setPlan(null)} disabled={busy} className="btn-secondary">
              {t('Annuler', 'Cancel', 'Cancelar')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
