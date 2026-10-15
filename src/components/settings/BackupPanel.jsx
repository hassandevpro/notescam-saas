// Paramètres → Sauvegarde & restauration (admin).
//
// Trois blocs :
//   1. Sauvegardes automatiques (cloud : instantanés nocturnes ; LAN : copies
//      .db du serveur toutes les 2 h) + sauvegarde immédiate + restauration.
//   2. Export complet JSON — toutes les tables de l'école, découvertes
//      automatiquement (un module ajouté y entre sans modification).
//   3. Restauration / import d'un fichier JSON, avec APERÇU obligatoire avant
//      toute écriture.
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../lib/i18n';
import { IS_LAN } from '../../lib/edition';
import {
  exportSchool, downloadJson, readBundleFile, previewRestore, restoreBundle, validateBundle,
  listAutoBackups, snapshotNow, loadCloudSnapshot, downloadServerBackup,
  scheduleServerRestore, cancelServerRestore, serverRestoreStatus,
} from '../../lib/backupService';

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden">
      <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50/70">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</h2>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

const fmtDate = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
const fmtSize = (b) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

export default function BackupPanel() {
  const t = useT();
  const school = useAuthStore((s) => s.school);
  const schoolId = school?.id;

  const [autos, setAutos] = useState([]);
  const [autoErr, setAutoErr] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState(null);           // { tone, text }
  const [restoreStatus, setRestoreStatus] = useState(null);

  // Restauration JSON
  const [bundle, setBundle] = useState(null);
  const [source, setSource] = useState('');
  const [mode, setMode] = useState('missing');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [confirmText, setConfirmText] = useState('');

  const refresh = async () => {
    if (!schoolId) return;
    setAutoErr('');
    try { setAutos(await listAutoBackups(schoolId)); }
    catch (e) { setAutoErr(e.message); }
    if (IS_LAN) { try { setRestoreStatus(await serverRestoreStatus()); } catch { /* ignore */ } }
  };
  useEffect(() => { refresh(); }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key, fn) => {
    setBusy(key); setMsg(null);
    try { await fn(); }
    catch (e) { setMsg({ tone: 'error', text: e.message }); }
    finally { setBusy(''); setProgress(null); }
  };

  const onSnapshot = () => run('snap', async () => {
    await snapshotNow(schoolId);
    setMsg({ tone: 'ok', text: t('Sauvegarde effectuée.', 'Backup done.', 'Copia realizada.') });
    await refresh();
  });

  const onExport = () => run('export', async () => {
    const b = await exportSchool({ schoolId, onProgress: setProgress });
    downloadJson(b, school?.name);
    setMsg({ tone: 'ok', text: t(
      `Export terminé : ${b.totalRows} lignes, ${Object.keys(b.tables).length} tables.`,
      `Export done: ${b.totalRows} rows, ${Object.keys(b.tables).length} tables.`,
      `Exportación lista: ${b.totalRows} filas, ${Object.keys(b.tables).length} tablas.`) });
  });

  const loadBundle = async (b, label) => {
    setResult(null); setPreview(null); setConfirmText('');
    const v = validateBundle(b, { schoolId });
    if (!v.ok) { setBundle(null); throw new Error(v.errors.join(' ')); }
    setBundle(b); setSource(label);
    setPreview(await previewRestore(b, { schoolId, mode }));
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    run('read', async () => loadBundle(await readBundleFile(f), f.name));
  };

  const onPickCloud = (b) => run(`load-${b.id}`, async () => {
    await loadBundle(await loadCloudSnapshot(b.id), `${t('Sauvegarde du', 'Backup of', 'Copia del')} ${fmtDate(b.at)}`);
  });

  const onMode = (m) => {
    setMode(m);
    if (bundle) run('read', async () => setPreview(await previewRestore(bundle, { schoolId, mode: m })));
  };

  const onRestore = () => run('restore', async () => {
    const r = await restoreBundle(bundle, { schoolId, mode, onProgress: setProgress });
    setResult(r); setPreview(null);
  });

  const onServerRestore = (b) => run(`srv-${b.id}`, async () => {
    const warn = b.emergency
      ? t('ATTENTION : cette sauvegarde a été prise pendant une synchronisation incomplète.\n\n', 'WARNING: this backup was taken during an incomplete sync.\n\n', 'ATENCIÓN: copia tomada durante una sincronización incompleta.\n\n')
      : '';
    const ok = window.confirm(warn + t(
      `Remplacer TOUTE la base par la sauvegarde du ${fmtDate(b.at)} ?\n\nTout ce qui a été saisi depuis sera retiré de la base active (l'ancienne base est conservée sur le serveur). La restauration s'appliquera au prochain redémarrage du serveur NotesCam.`,
      `Replace the WHOLE database with the backup of ${fmtDate(b.at)}?\n\nEverything entered since will be removed from the active database (the old one is kept on the server). Applied at the next NotesCam server restart.`,
      `¿Reemplazar TODA la base por la copia del ${fmtDate(b.at)}?\n\nLo introducido desde entonces se retirará (la base anterior se conserva). Se aplica al reiniciar el servidor.`));
    if (!ok) return;
    await scheduleServerRestore(b.id);
    await refresh();
  });

  const totals = preview?.totals;
  const writes = totals ? totals.toInsert + totals.toUpdate : 0;
  const confirmWord = t('RESTAURER', 'RESTORE', 'RESTAURAR');
  const needsTyped = mode === 'overwrite';

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${msg.tone === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {msg.text}
        </div>
      )}
      {progress && (
        <div className="rounded-xl px-4 py-3 text-sm bg-slate-50 border border-slate-200 text-slate-600">
          {progress.phase === 'export' ? t('Export', 'Export', 'Exportación') : t('Restauration', 'Restore', 'Restauración')}
          {' '}— {progress.done}/{progress.total}{progress.table ? ` · ${progress.table}` : ''}
        </div>
      )}

      {IS_LAN && restoreStatus?.pending && (
        <div className="rounded-xl px-4 py-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 flex flex-wrap items-center gap-3">
          <span className="flex-1">
            {t('Restauration programmée', 'Restore scheduled', 'Restauración programada')} : <b>{restoreStatus.pending.label}</b>.{' '}
            {t('Redémarrez le serveur NotesCam (ou le PC serveur) pour l’appliquer.', 'Restart the NotesCam server (or the server PC) to apply it.', 'Reinicie el servidor NotesCam para aplicarla.')}
          </span>
          <button className="btn-secondary" onClick={() => run('cancel', async () => { await cancelServerRestore(); await refresh(); })}>
            {t('Annuler', 'Cancel', 'Cancelar')}
          </button>
        </div>
      )}
      {IS_LAN && restoreStatus?.last && !restoreStatus?.pending && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${restoreStatus.last.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {restoreStatus.last.ok
            ? t(`Dernière restauration réussie le ${fmtDate(restoreStatus.last.at)}.`, `Last restore succeeded on ${fmtDate(restoreStatus.last.at)}.`, `Última restauración correcta el ${fmtDate(restoreStatus.last.at)}.`)
            : `${t('Dernière restauration ÉCHOUÉE', 'Last restore FAILED', 'Última restauración FALLIDA')} : ${restoreStatus.last.error}`}
        </div>
      )}

      <Card title={t('Sauvegardes automatiques', 'Automatic backups', 'Copias automáticas')}>
        <p className="text-sm text-slate-500">
          {IS_LAN
            ? t('Le serveur de l’école copie toute la base toutes les 2 heures et au démarrage. Conservées : les 14 dernières + une par jour sur 14 jours. Copiez régulièrement une sauvegarde sur une clé USB : si le disque du PC lâche, les sauvegardes partent avec lui.',
                'The school server copies the whole database every 2 hours and at startup. Kept: the last 14 + one per day for 14 days. Regularly copy a backup to a USB key: if the PC disk fails, backups go with it.',
                'El servidor copia toda la base cada 2 horas. Se conservan las 14 últimas + una por día durante 14 días. Copie una a una memoria USB con regularidad.')
            : t('Chaque nuit, une copie complète de l’établissement est enregistrée. Conservées : les 7 dernières automatiques + les 5 dernières manuelles. Elles vous protègent des erreurs (suppression, import raté) ; téléchargez aussi un export de temps en temps pour garder une copie chez vous.',
                'Every night a full copy of the school is stored. Kept: the last 7 automatic + the last 5 manual. They protect against mistakes (deletion, bad import); also download an export now and then to keep a copy yourself.',
                'Cada noche se guarda una copia completa. Se conservan las 7 últimas automáticas + 5 manuales. Descargue también una exportación de vez en cuando.')}
        </p>
        {IS_LAN && restoreStatus?.cloudSync && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t('Synchronisation Cloud active : la restauration d’une base complète est désactivée (le Cloud la réécraserait). Utilisez la restauration depuis un fichier JSON ci-dessous.',
               'Cloud sync is on: full database restore is disabled (the cloud would overwrite it). Use the JSON restore below.',
               'Sincronización activa: la restauración completa está desactivada. Use la restauración JSON.')}
          </p>
        )}
        <button className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }} disabled={!!busy} onClick={onSnapshot}>
          {busy === 'snap' ? '…' : t('Sauvegarder maintenant', 'Back up now', 'Copiar ahora')}
        </button>
        {autoErr && (
          <p className="text-sm text-red-600">
            {t('Liste indisponible', 'List unavailable', 'Lista no disponible')} : {autoErr}
            {!IS_LAN && /school_backups|backup_/.test(autoErr) ? ` — ${t('la migration supabase_backup_restore.sql n’est pas encore appliquée.', 'migration supabase_backup_restore.sql not applied yet.', 'migración no aplicada.')}` : ''}
          </p>
        )}
        {!autoErr && autos.length === 0 && (
          <p className="text-sm text-slate-400">{t('Aucune sauvegarde pour l’instant.', 'No backup yet.', 'Ninguna copia todavía.')}</p>
        )}
        {autos.length > 0 && (
          <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {autos.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 min-w-[12rem]">
                  <b>{fmtDate(b.at)}</b>
                  <span className="text-slate-400"> · {b.kind === 'manual' ? t('manuelle', 'manual', 'manual') : b.kind === 'auto' ? t('automatique', 'automatic', 'automática') : (b.label || '')}</span>
                  {b.totalRows != null && <span className="text-slate-400"> · {b.totalRows} {t('lignes', 'rows', 'filas')} · {fmtSize(b.bytes)}</span>}
                  {b.emergency && <span className="ml-2 text-amber-700 font-semibold">⚠ {t('synchro incomplète', 'incomplete sync', 'sincronización incompleta')}</span>}
                </span>
                {IS_LAN ? (
                  <>
                    <button className="btn-secondary" disabled={!!busy} onClick={() => run(`dl-${b.id}`, () => downloadServerBackup(b.id))}>
                      {t('Télécharger', 'Download', 'Descargar')}
                    </button>
                    <button className="btn-secondary" disabled={!!busy || restoreStatus?.cloudSync} onClick={() => onServerRestore(b)}>
                      {busy === `srv-${b.id}` ? '…' : t('Restaurer la base', 'Restore database', 'Restaurar base')}
                    </button>
                  </>
                ) : (
                  <button className="btn-secondary" disabled={!!busy} onClick={() => onPickCloud(b)}>
                    {busy === `load-${b.id}` ? '…' : t('Restaurer…', 'Restore…', 'Restaurar…')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('Exporter toutes les données', 'Export all data', 'Exportar todos los datos')}>
        <p className="text-sm text-slate-500">
          {t('Un fichier JSON avec toutes les données de l’établissement : élèves, notes, frais, paiements, personnel, budgets, vie scolaire… Les tables sont détectées automatiquement : un module ajouté plus tard est inclus sans réglage. Les secrets (jetons, clés, identifiants SMS) ne sont jamais exportés. Les photos et logos ne sont pas dans le fichier.',
             'A JSON file with all the school’s data: students, grades, fees, payments, staff, budgets, school life… Tables are detected automatically: a module added later is included with no setup. Secrets (tokens, keys, SMS credentials) are never exported. Photos and logos are not in the file.',
             'Un archivo JSON con todos los datos del centro. Las tablas se detectan automáticamente: un módulo añadido después se incluye sin configuración. Los secretos nunca se exportan. Las fotos no se incluyen.')}
        </p>
        <button className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }} disabled={!!busy} onClick={onExport}>
          {busy === 'export' ? '…' : t('Exporter (.json)', 'Export (.json)', 'Exportar (.json)')}
        </button>
      </Card>

      <Card title={t('Restaurer / importer un fichier', 'Restore / import a file', 'Restaurar / importar')}>
        <p className="text-sm text-slate-500">
          {t('Choisissez un export NotesCam de cet établissement. Un aperçu s’affiche avant toute écriture. Rien n’est jamais supprimé : ce qui a été ajouté après la sauvegarde reste en place.',
             'Choose a NotesCam export of this school. A preview is shown before anything is written. Nothing is ever deleted: what was added after the backup stays.',
             'Elija una exportación NotesCam de este centro. Se muestra una vista previa antes de escribir. Nunca se borra nada.')}
        </p>
        <label className="btn-secondary inline-block cursor-pointer">
          {busy === 'read' ? '…' : t('Choisir un fichier .json', 'Choose a .json file', 'Elegir archivo .json')}
          <input type="file" accept="application/json,.json" className="hidden" onChange={onFile} disabled={!!busy} />
        </label>

        {bundle && preview && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="text-sm">
              <b>{source}</b> — {t('sauvegarde du', 'backup of', 'copia del')} {fmtDate(bundle.createdAt)}, {bundle.totalRows} {t('lignes', 'rows', 'filas')}.
            </p>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="radio" checked={mode === 'missing'} onChange={() => onMode('missing')} />
                <span><b>{t('Réinsérer ce qui manque', 'Re-insert what is missing', 'Reinsertar lo que falta')}</b> ({t('recommandé', 'recommended', 'recomendado')}) — {t('les données actuelles ne sont pas modifiées.', 'current data is not modified.', 'los datos actuales no se modifican.')}</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" checked={mode === 'overwrite'} onChange={() => onMode('overwrite')} />
                <span><b>{t('Revenir à l’état de la sauvegarde', 'Revert to the backup state', 'Volver al estado de la copia')}</b> — {t('réinsère ce qui manque ET annule les modifications faites depuis sur les lignes existantes.', 're-inserts what is missing AND undoes later changes to existing rows.', 'reinserta y deshace los cambios posteriores.')}</span>
              </label>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
              {t('À réinsérer', 'To insert', 'A insertar')} : <b>{totals.toInsert}</b> · {t('À remettre en l’état', 'To revert', 'A revertir')} : <b>{totals.toUpdate}</b> · {t('Inchangées', 'Unchanged', 'Sin cambios')} : {totals.unchanged}
              {preview.unknownTables?.length > 0 && (
                <p className="text-xs text-amber-700 mt-1">{t('Tables absentes de la version actuelle (ignorées)', 'Tables missing in the current version (skipped)', 'Tablas ausentes (ignoradas)')} : {preview.unknownTables.join(', ')}</p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-500">{t('Détail par table', 'Per-table detail', 'Detalle por tabla')}</summary>
                <ul className="mt-1 max-h-48 overflow-auto text-xs text-slate-600">
                  {Object.entries(preview.tables).filter(([, r]) => r.toInsert || r.toUpdate).map(([name, r]) => (
                    <li key={name}>{name} : +{r.toInsert}{r.toUpdate ? ` / ↺${r.toUpdate}` : ''}</li>
                  ))}
                </ul>
              </details>
            </div>

            {writes === 0 ? (
              <p className="text-sm text-emerald-700">{t('Rien à restaurer : la base contient déjà tout le contenu de cette sauvegarde.', 'Nothing to restore: the database already holds all of this backup.', 'Nada que restaurar.')}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {needsTyped && (
                  <input className="form-input" style={{ width: '12rem' }} placeholder={`${t('Tapez', 'Type', 'Escriba')} ${confirmWord}`}
                    value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                )}
                <button className="btn-primary" style={{ width: 'auto', paddingInline: '1.5rem' }}
                  disabled={!!busy || (needsTyped && confirmText.trim().toUpperCase() !== confirmWord)} onClick={onRestore}>
                  {busy === 'restore' ? '…' : t(`Restaurer ${writes} ligne(s)`, `Restore ${writes} row(s)`, `Restaurar ${writes} fila(s)`)}
                </button>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className={`rounded-xl px-4 py-3 text-sm border ${result.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <p>
              {t('Réinsérées', 'Inserted', 'Insertadas')} : <b>{result.totals.inserted}</b> · {t('Remises en l’état', 'Reverted', 'Revertidas')} : <b>{result.totals.updated}</b>
              {result.totals.failed > 0 && <> · {t('Refusées', 'Rejected', 'Rechazadas')} : <b>{result.totals.failed}</b></>}
            </p>
            {result.totals.failed > 0 && (
              <ul className="mt-1 text-xs">
                {Object.entries(result.tables).filter(([, r]) => r.failed).map(([name, r]) => (
                  <li key={name}>{name} : {r.failed} — {r.errors[0]}</li>
                ))}
              </ul>
            )}
            <button className="btn-secondary mt-2" onClick={() => window.location.reload()}>
              {t('Recharger l’application', 'Reload the app', 'Recargar la aplicación')}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
