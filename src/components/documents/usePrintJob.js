// ── Travail d'impression partagé par les ateliers de documents ───────────────
// Un seul endroit pour : la progression, le découpage en lots, la traduction du
// résultat d'impression (pop-up bloqué, rien à imprimer) et l'écriture au
// journal avec le bon statut.
//
// POURQUOI DES LOTS. Envoyer mille relevés dans une seule fenêtre, c'est un
// document de mille pages que l'utilisateur ne peut ni annuler ni imprimer
// progressivement — et un poste modeste y passe plusieurs minutes. Au-delà du
// seuil (BATCH_SIZE), le travail est découpé : chaque lot part sur un clic de
// l'utilisateur, ce qui est aussi la seule façon fiable d'ouvrir plusieurs
// fenêtres sans se faire bloquer par le navigateur.

import { useCallback, useMemo, useState } from 'react';
import { printSheets, PRINT_RESULT, chunk, needsBatching, BATCH_SIZE, auditDocument } from '../../lib/print';
import { recordGeneration, GEN_STATUS } from '../../lib/documentLog';

export { BATCH_SIZE, GEN_STATUS };

/**
 * @param {object} o
 * @param {Array}  o.targets       éléments à imprimer (élèves, classes…)
 * @param {(items:Array, onProgress:Function)=>Promise<{sheets:string[], skipped:number}>} o.buildSheets
 * @param {()=>string} o.title     titre de la fenêtre d'impression
 * @param {object} [o.printOpts]   { profile } — profil de page du document
 * @param {string} o.logType       type journalisé ('single', 'pv-class'…)
 * @param {()=>string} [o.scope]   portée journalisée (nom de classe, niveau…)
 * @param {string} o.schoolId
 * @param {string} o.userName
 * @param {Function} o.t           i18n (fr, en, es)
 * @param {Function} [o.onLogged]  rafraîchissement de l'historique
 */
export function usePrintJob({
  targets = [], buildSheets, title, printOpts = {}, logType,
  scope = () => '', schoolId, userName, t, onLogged,
}) {
  const [progress, setProgress] = useState(null);   // { done, total }
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);       // information non bloquante
  const [batchIndex, setBatchIndex] = useState(0);  // lot suivant à imprimer

  const batches = useMemo(() => chunk(targets, BATCH_SIZE), [targets]);
  const batched = needsBatching(targets.length);

  const log = useCallback(async (status, count, detail) => {
    if (!schoolId) return;
    await recordGeneration({ schoolId, userName, type: logType, scope: scope(), count, status, detail });
    onLogged?.();
  }, [schoolId, userName, logType, scope, onLogged]);

  const reset = useCallback(() => { setBatchIndex(0); setError(null); setNotice(null); }, []);

  /** Imprime le lot `index` (ou l'unique lot). */
  const run = useCallback(async (index = batchIndex) => {
    const items = batches[index] || [];
    if (!items.length) return;
    setError(null);
    setNotice(null);
    setProgress({ done: 0, total: items.length });

    try {
      const { sheets, skipped = 0 } = await buildSheets(items, (done, total) => setProgress({ done, total }));

      if (!sheets.length) {
        await log(GEN_STATUS.FAILED, 0, 'aucun document générable');
        throw new Error(t(
          'Aucun document générable — vérifiez les données de la sélection.',
          'Nothing to generate — check the data for this selection.',
          'Nada que generar — verifique los datos de la selección.',
        ));
      }

      // Auto-contrôle : un document officiel ne part pas à l'impression avec
      // « NaN » ou « undefined » dedans. On imprime quand même (l'utilisateur
      // attend son document) mais l'incident est tracé et signalé.
      const audit = auditDocument(sheets.join(''));
      if (!audit.ok) {
        setNotice(t(
          `Valeurs manquantes détectées dans le document (${audit.issues.length}) — vérifiez les notes de la sélection.`,
          `Missing values detected in the document (${audit.issues.length}) — check the grades for this selection.`,
          `Valores faltantes detectados (${audit.issues.length}).`,
        ));
        console.warn('[impression] valeurs non imprimables', audit.issues.slice(0, 10));
      }

      const result = printSheets(sheets, title(), printOpts);

      if (result === PRINT_RESULT.BLOCKED) {
        await log(GEN_STATUS.BLOCKED, 0, 'popup bloqué');
        throw new Error(t(
          "Fenêtre d'impression bloquée par le navigateur. Autorisez les pop-ups pour ce site, puis relancez.",
          'Print window blocked by the browser. Allow pop-ups for this site, then try again.',
          'Ventana de impresión bloqueada. Permita las ventanas emergentes y vuelva a intentarlo.',
        ));
      }

      const partial = skipped > 0 || !audit.ok;
      await log(
        partial ? GEN_STATUS.PARTIAL : GEN_STATUS.SUCCESS,
        sheets.length,
        [
          batched ? `lot ${index + 1}/${batches.length}` : 'impression',
          skipped ? `${skipped} ignoré(s)` : '',
          audit.ok ? '' : `${audit.issues.length} valeur(s) manquante(s)`,
        ].filter(Boolean).join(' · '),
      );

      if (skipped) {
        setNotice(t(
          `${skipped} document(s) ignoré(s) — données incomplètes.`,
          `${skipped} document(s) skipped — incomplete data.`,
          `${skipped} documento(s) omitido(s) — datos incompletos.`,
        ));
      }
      setBatchIndex(index + 1);
    } catch (e) {
      console.error('impression', e);
      setError(e?.message || String(e));
    } finally {
      setProgress(null);
    }
  }, [batches, batchIndex, buildSheets, title, printOpts, log, t, batched]);

  return {
    run, reset,
    progress, error, notice, setError, setNotice,
    batches, batchIndex, batched,
    remaining: Math.max(0, batches.length - batchIndex),
    busy: !!progress,
  };
}

export default usePrintJob;
