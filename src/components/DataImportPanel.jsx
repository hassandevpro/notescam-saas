// Panneau d'import de données historiques (admin) — migration depuis une autre app.
//
// Flux : 1) l'admin dépose un fichier .json au format pivot v1
//        2) aperçu (validateBundle) : ce qui sera créé + avertissements
//        3) import (importBundle) : IDB + syncQueue + flush → cloud OU LAN
//
// Voir src/lib/dataImport.js (moteur) et examples/import-bundle.example.json.

import { useState } from 'react';
import { useT } from '../lib/i18n';
import { useAuthStore } from '../store/authStore';
import { validateBundle, importBundle } from '../lib/dataImport';

const PHASE_LABELS = {
  scan:  ['Analyse des données existantes…', 'Scanning existing data…'],
  build: ['Préparation des enregistrements…', 'Preparing records…'],
  write: ['Écriture locale…', 'Writing locally…'],
  queue: ['Mise en file de synchronisation…', 'Queuing for sync…'],
  sync:  ['Synchronisation…', 'Syncing…'],
  done:  ['Terminé', 'Done'],
};

export default function DataImportPanel() {
  const t        = useT();
  const schoolId = useAuthStore((s) => s.school?.id);

  const [bundle,  setBundle]  = useState(null);
  const [fileName, setFileName] = useState('');
  const [check,   setCheck]   = useState(null);   // résultat validateBundle
  const [busy,    setBusy]    = useState(false);
  const [phase,   setPhase]   = useState(null);
  const [report,  setReport]  = useState(null);
  const [error,   setError]   = useState('');

  const reset = () => { setBundle(null); setFileName(''); setCheck(null); setReport(null); setError(''); setPhase(null); };

  const onFile = async (file) => {
    reset();
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = JSON.parse(await file.text());
      setBundle(parsed);
      setCheck(validateBundle(parsed));
    } catch {
      setError(t('Fichier JSON illisible.', 'Unreadable JSON file.'));
    }
  };

  const run = async () => {
    if (!bundle || !schoolId) return;
    setBusy(true); setError('');
    try {
      const res = await importBundle(bundle, { schoolId, onProgress: (p) => setPhase(p.phase) });
      setReport(res);
    } catch (e) {
      setError(e?.message || t('Échec de l\'import.', 'Import failed.'));
    } finally {
      setBusy(false);
    }
  };

  // ── Rapport final ─────────────────────────────────────────────────────────
  if (report) {
    const c = report.created;
    const failed = report.sync?.failed ?? 0;
    const Row = ({ label, n }) => n > 0 ? (
      <div className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
        <span className="text-slate-500">{label}</span><span className="font-semibold text-slate-800">{n}</span>
      </div>
    ) : null;
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-emerald-800 font-semibold text-sm">✅ {t('Import terminé', 'Import complete')}</p>
          <div className="mt-3 bg-white rounded-lg px-3 py-2">
            <Row label={t('Classes', 'Classes')} n={c.classes} />
            <Row label={t('Matières', 'Subjects')} n={c.subjects} />
            <Row label={t('Inscriptions élèves', 'Student enrolments')} n={c.students} />
            <Row label={t('Enregistrements de notes', 'Grade records')} n={c.grades} />
            <Row label={t('Enseignants', 'Teachers')} n={c.teachers} />
            <Row label={t('Frais', 'Fees')} n={c.fees} />
            <Row label={t('Versements', 'Payments')} n={c.payments} />
          </div>
          {report.sync && (
            <p className="text-xs mt-2 text-emerald-700">
              {t('Synchronisé', 'Synced')} : {report.sync.synced}/{report.sync.total}
              {failed > 0 && <span className="text-amber-600"> · {failed} {t('en attente (resync auto)', 'pending (auto-resync)')}</span>}
            </p>
          )}
          {!report.sync && (
            <p className="text-xs mt-2 text-amber-600">
              {t('Hors ligne : les données seront synchronisées au retour du réseau.', 'Offline: data will sync when back online.')}
            </p>
          )}
        </div>
        {report.warnings?.length > 0 && (
          <details className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <summary className="cursor-pointer font-semibold">{report.warnings.length} {t('avertissement(s)', 'warning(s)')}</summary>
            <ul className="mt-2 space-y-1 list-disc list-inside max-h-40 overflow-auto">
              {report.warnings.slice(0, 100).map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </details>
        )}
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={reset}>{t('Importer un autre fichier', 'Import another file')}</button>
          <button className="btn-primary" onClick={() => window.location.reload()}>{t('Recharger l\'application', 'Reload application')}</button>
        </div>
      </div>
    );
  }

  // ── Sélection + aperçu ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {t('Reprenez plusieurs années d\'historique depuis un autre logiciel. Déposez un fichier au format NotesCam (JSON pivot v1).',
           'Migrate several years of history from another software. Drop a NotesCam-format file (JSON pivot v1).')}
      </p>

      <label className="block border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 hover:bg-slate-50 transition-colors">
        <input type="file" accept=".json,application/json" className="hidden"
               onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
        {fileName
          ? <span className="text-sm font-semibold text-slate-700">{fileName}</span>
          : <span className="text-sm text-slate-500">{t('Cliquer pour choisir un fichier .json', 'Click to choose a .json file')}</span>}
      </label>

      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}

      {check && (
        <div className={`rounded-xl border p-4 ${check.ok ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'}`}>
          {check.ok ? (
            <>
              <p className="text-sm font-semibold text-slate-700 mb-2">{t('Aperçu', 'Preview')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[
                  [t('Années', 'Years'), check.stats.years],
                  [t('Classes', 'Classes'), check.stats.classes],
                  [t('Élèves', 'Students'), check.stats.students],
                  [t('Notes', 'Grades'), check.stats.grades],
                  [t('Enseignants', 'Teachers'), check.stats.teachers],
                  [t('Frais', 'Fees'), check.stats.fees],
                  [t('Versements', 'Payments'), check.stats.payments],
                ].map(([label, n]) => (
                  <div key={label} className="bg-white rounded-lg py-2">
                    <div className="text-lg font-extrabold text-brand-700">{n}</div>
                    <div className="text-[11px] text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
              {check.warnings.length > 0 && (
                <p className="text-xs text-amber-600 mt-2">{check.warnings.length} {t('avertissement(s) — détaillés après l\'import.', 'warning(s) — detailed after import.')}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-red-700 mb-1">{t('Fichier invalide', 'Invalid file')}</p>
              <ul className="text-xs text-red-600 space-y-0.5 list-disc list-inside max-h-32 overflow-auto">
                {check.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      {check?.ok && (
        <button className="btn-primary disabled:opacity-50" onClick={run} disabled={busy || !schoolId}>
          {busy
            ? (PHASE_LABELS[phase]?.[0] ? t(...PHASE_LABELS[phase]) : t('Import en cours…', 'Importing…'))
            : t('Lancer l\'import', 'Start import')}
        </button>
      )}
    </div>
  );
}
