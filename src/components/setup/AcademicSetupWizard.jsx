import { useState, useMemo, useEffect } from 'react';
import { useT } from '../../lib/i18n';
import { useUiStore } from '../../store/uiStore';
import { TEMPLATE_COUNTRIES, listTemplates } from '../../templates';
import { buildPlan, applyTemplate, buildMergePlan, applyMerge } from '../../lib/templateEngine';
import { useSchoolStore } from '../../store/schoolStore';

// Assistant moderne de génération d'établissement (point #9).
// 4 étapes : Pays → Type d'établissement → Résumé → Génération (progression).
export default function AcademicSetupWizard({ onClose, onDone }) {
  const t = useT();
  const lang = useUiStore((s) => s.uiLang) || 'fr';
  const L = (obj) => obj?.[lang] ?? obj?.fr ?? '';   // libellés stockés {fr,en,es}

  const existingClasses  = useSchoolStore((s) => s.classes);
  const existingSubjects = useSchoolStore((s) => s.subjects);
  const isImport = existingClasses.length > 0;

  const [step, setStep]       = useState(1);
  const [country, setCountry] = useState(null);
  const [templateId, setTemplateId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone]       = useState(null);
  const [error, setError]     = useState(null);
  const [updateConflicts, setUpdateConflicts] = useState(false);

  const templates = useMemo(() => (country ? listTemplates(country) : []), [country]);
  const template  = useMemo(() => templates.find((x) => x.id === templateId) || null, [templates, templateId]);
  const plan      = useMemo(() => (template ? buildPlan(template) : null), [template]);
  // Fusion : diff modèle ↔ existant (uniquement si l'établissement a des classes).
  const mergePlan = useMemo(
    () => (template && isImport ? buildMergePlan(template, { classes: existingClasses, subjects: existingSubjects }) : null),
    [template, isImport, existingClasses, existingSubjects],
  );

  // Barre de progression animée pendant l'appel atomique (qui est rapide).
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setProgress((p) => (p < 90 ? p + 7 : p)), 120);
    return () => clearInterval(id);
  }, [running]);

  const handleGenerate = async () => {
    setRunning(true); setError(null); setProgress(8);
    try {
      const res = isImport
        ? await applyMerge(mergePlan, { updateConflicts })
        : await applyTemplate(plan);
      setProgress(100);
      setDone(res || plan.counts);
    } catch (e) {
      setError(e.message || 'Erreur');
    } finally {
      setRunning(false);
    }
  };

  const Stat = ({ value, label }) => (
    <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
      <div className="text-2xl font-extrabold text-brand-700">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={running ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* En-tête + stepper */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">{t('Créer mon établissement', 'Set up my school', 'Crear mi centro')}</h2>
            {!running && <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>}
          </div>
          <div className="flex gap-2 mt-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-brand-500' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Étape 1 — Pays */}
          {step === 1 && (
            <>
              <p className="text-sm text-gray-500 mb-4">{t('1. Choisissez le pays.', '1. Choose the country.', '1. Elija el país.')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TEMPLATE_COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    disabled={!c.available}
                    onClick={() => { setCountry(c.code); setTemplateId(null); setStep(2); }}
                    className={`rounded-xl border p-4 text-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      country === c.code ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    <div className="text-3xl">{c.flag}</div>
                    <div className="text-sm font-semibold text-gray-800 mt-1">{L(c.label)}</div>
                    {!c.available && <div className="text-[10px] text-gray-400 mt-0.5">{t('Bientôt', 'Soon', 'Pronto')}</div>}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Étape 2 — Type d'établissement */}
          {step === 2 && (
            <>
              <p className="text-sm text-gray-500 mb-4">{t("2. Choisissez le type d'établissement.", '2. Choose the school type.', '2. Elija el tipo.')}</p>
              <div className="space-y-2">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => { setTemplateId(tpl.id); setStep(3); }}
                    className={`w-full text-left rounded-xl border p-4 transition-colors ${
                      templateId === tpl.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 text-sm">{L(tpl.label)}</div>
                    {tpl.description && <div className="text-xs text-gray-500 mt-0.5">{L(tpl.description)}</div>}
                  </button>
                ))}
              </div>
              <div className="mt-5">
                <button onClick={() => setStep(1)} className="btn-secondary" style={{ width: 'auto' }}>← {t('Retour', 'Back', 'Atrás')}</button>
              </div>
            </>
          )}

          {/* Étape 3 — Résumé (création) ou Diff (import/fusion) */}
          {step === 3 && plan && !isImport && (
            <>
              <p className="text-sm text-gray-500 mb-1">{t('3. Résumé de ce qui sera créé.', '3. Summary of what will be created.', '3. Resumen.')}</p>
              <p className="text-base font-bold text-gray-900 mb-4">{L(template.label)}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat value={plan.counts.levels}       label={t('Niveaux', 'Levels', 'Niveles')} />
                <Stat value={plan.counts.classes}      label={t('Classes', 'Classes', 'Clases')} />
                <Stat value={plan.counts.series}       label={t('Séries', 'Streams', 'Series')} />
                <Stat value={plan.counts.subjects}     label={t('Matières', 'Subjects', 'Asignaturas')} />
                <Stat value={plan.counts.components}   label={t('Sous-composantes', 'Components', 'Componentes')} />
                <Stat value={plan.counts.coefficients} label={t('Coefficients', 'Coefficients', 'Coeficientes')} />
              </div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => setStep(2)} className="btn-secondary" style={{ width: 'auto' }}>← {t('Retour', 'Back', 'Atrás')}</button>
                <button onClick={() => setStep(4)} className="btn-primary" style={{ width: 'auto', paddingInline: '1.25rem' }}>{t('Continuer', 'Continue', 'Continuar')} →</button>
              </div>
            </>
          )}

          {step === 3 && mergePlan && isImport && (
            <>
              <p className="text-sm text-gray-500 mb-1">{t('3. Fusion intelligente avec l’existant.', '3. Smart merge with existing data.', '3. Fusión inteligente.')}</p>
              <p className="text-base font-bold text-gray-900 mb-1">{L(template.label)}</p>
              <p className="text-xs text-gray-400 mb-4">{t('Les doublons sont détectés : rien n’est dupliqué.', 'Duplicates are detected: nothing is duplicated.', 'Sin duplicados.')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat value={`+${mergePlan.counts.addedClasses}`}    label={t('Classes ajoutées', 'New classes', 'Clases')} />
                <Stat value={`+${mergePlan.counts.addedSubjects}`}   label={t('Matières ajoutées', 'New subjects', 'Asignaturas')} />
                <Stat value={`+${mergePlan.counts.addedComponents}`} label={t('Composantes', 'Components', 'Componentes')} />
                <Stat value={mergePlan.counts.conflicts}             label={t('Conflits', 'Conflicts', 'Conflictos')} />
              </div>
              {mergePlan.counts.matchedClasses > 0 && (
                <p className="text-xs text-gray-500 mt-3">{mergePlan.counts.matchedClasses} {t('classe(s) déjà présente(s) — réutilisée(s).', 'class(es) already present — reused.', 'clase(s) reutilizada(s).')}</p>
              )}
              {mergePlan.conflicts.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-amber-900 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={updateConflicts} onChange={(e) => setUpdateConflicts(e.target.checked)} />
                    {t('Mettre à jour coefficient/barème des matières en conflit', 'Update coefficient/scale of conflicting subjects', 'Actualizar conflictos')}
                  </label>
                  <ul className="mt-2 space-y-0.5 max-h-28 overflow-y-auto">
                    {mergePlan.conflicts.slice(0, 6).map((c, i) => (
                      <li key={i} className="text-xs text-amber-800">
                        {c.className} · {c.name} : coef {c.from.coef}→{c.to.coef}, /{c.from.max}→/{c.to.max}
                      </li>
                    ))}
                    {mergePlan.conflicts.length > 6 && <li className="text-xs text-amber-600">… +{mergePlan.conflicts.length - 6}</li>}
                  </ul>
                </div>
              )}
              {mergePlan.counts.addedClasses === 0 && mergePlan.counts.addedSubjects === 0 && mergePlan.counts.addedComponents === 0 && mergePlan.counts.conflicts === 0 && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
                  {t('Ce modèle est déjà entièrement présent. Rien à importer.', 'This template is already fully present. Nothing to import.', 'Ya está todo presente.')}
                </div>
              )}
              <div className="mt-5 flex gap-2">
                <button onClick={() => setStep(2)} className="btn-secondary" style={{ width: 'auto' }}>← {t('Retour', 'Back', 'Atrás')}</button>
                <button onClick={() => setStep(4)} className="btn-primary" style={{ width: 'auto', paddingInline: '1.25rem' }}>{t('Continuer', 'Continue', 'Continuar')} →</button>
              </div>
            </>
          )}

          {/* Étape 4 — Génération */}
          {step === 4 && plan && (
            <div className="text-center py-4">
              {!done ? (
                <>
                  <p className="text-sm text-gray-600 mb-5">
                    {t('Tout sera créé en une seule opération sécurisée.', 'Everything is created in one safe operation.', 'Todo se crea en una sola operación segura.')}
                  </p>
                  <button onClick={handleGenerate} disabled={running} className="btn-primary disabled:opacity-60" style={{ width: 'auto', paddingInline: '2rem' }}>
                    {running
                      ? t('Traitement…', 'Processing…', 'Procesando…')
                      : isImport
                        ? t('Importer dans mon établissement', 'Import into my school', 'Importar a mi centro')
                        : t('Créer automatiquement mon établissement', 'Create my school automatically', 'Crear mi centro automáticamente')}
                  </button>
                  {(running || progress > 0) && (
                    <div className="mt-6">
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="text-xs text-gray-400 mt-2">{progress}%</div>
                    </div>
                  )}
                  {error && <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
                  {!running && (
                    <div className="mt-5">
                      <button onClick={() => setStep(3)} className="btn-secondary" style={{ width: 'auto' }}>← {t('Retour', 'Back', 'Atrás')}</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-3xl font-bold">✓</div>
                  <p className="text-lg font-bold text-gray-900">{isImport ? t('Import terminé !', 'Import complete!', '¡Importación lista!') : t('Établissement créé !', 'School created!', '¡Centro creado!')}</p>
                  <p className="text-sm text-gray-500">
                    +{done.classes ?? 0} {t('classes', 'classes', 'clases')} · +{done.subjects ?? 0} {t('matières', 'subjects', 'asignaturas')}
                    {isImport && (done.updated ?? 0) > 0 ? ` · ${done.updated} ${t('mises à jour', 'updated', 'actualizadas')}` : ''}
                  </p>
                  <button onClick={() => { onDone?.(); onClose(); }} className="btn-primary mt-2" style={{ width: 'auto', paddingInline: '1.5rem' }}>
                    {t('Terminer', 'Done', 'Finalizar')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
