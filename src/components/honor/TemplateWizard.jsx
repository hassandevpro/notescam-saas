import { useState, useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { applyTemplate } from '../../lib/honorRollEngine';
import { buildHonorRollSheets } from '../../lib/honorRollDoc';
import { buildPrintDocument } from '../../lib/transcriptDoc';

// Assistant de création de modèle de tableau d'honneur (5 étapes + aperçu temps réel).
// Remplace l'ancien formulaire de 18 champs par un parcours guidé : l'utilisateur
// pense « je veux le Top 10 » plutôt qu'en paramètres techniques.

const PALETTES = [
  { key: 'excellence',  dot: '🟣', color: '#7c3aed', fr: 'Excellence',  en: 'Excellence',  es: 'Excelencia' },
  { key: 'academique',  dot: '🔵', color: '#1e3a8a', fr: 'Académique',  en: 'Academic',    es: 'Académico' },
  { key: 'merite',      dot: '🟢', color: '#15803d', fr: 'Mérite',      en: 'Merit',       es: 'Mérito' },
  { key: 'distinction', dot: '🟠', color: '#b45309', fr: 'Distinction', en: 'Distinction', es: 'Distinción' },
];

const COL_LABELS = {
  rank: ['Rang', 'Rank', 'Puesto'], photo: ['Photo', 'Photo', 'Foto'], name: ['Nom', 'Name', 'Nombre'],
  class: ['Classe', 'Class', 'Clase'], avg: ['Moyenne', 'Average', 'Media'], mention: ['Mention', 'Remark', 'Mención'],
  conduite: ['Conduite', 'Conduct', 'Conducta'], gender: ['Sexe', 'Gender', 'Sexo'],
};
const COLS_ORDER = ['rank', 'photo', 'name', 'class', 'avg', 'mention', 'conduite', 'gender'];

function StepDots({ step, total }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-indigo-600' : i < step ? 'w-3 bg-indigo-300' : 'w-3 bg-slate-200'}`} />
      ))}
    </div>
  );
}

export default function TemplateWizard({ tpl, data, levels = [], subjectNames = [], onSave, onSaveAndPdf, onClose }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [w, setW] = useState(() => JSON.parse(JSON.stringify(tpl)));

  const set  = (k, v) => setW((s) => ({ ...s, [k]: v }));
  const setF = (k, v) => setW((s) => ({ ...s, filters: { ...s.filters, [k]: v === '' || v == null ? undefined : v } }));
  const setP = (k, v) => setW((s) => ({ ...s, personalization: { ...s.personalization, [k]: v } }));
  const f = w.filters || {};
  const p = w.personalization || {};

  const BLUEPRINTS = [
    { icon: '🏆', fr: "Tableau d'honneur général", en: 'General honour roll', es: 'Cuadro general', d: ["Top 10 de l'établissement", 'Top 10 of the school', 'Top 10 del centro'],
      apply: { scope: 'school', limit: 10, layout: 'table', sort: 'score', filters: {}, personalization: { ...p, title: "Tableau d'honneur" } } },
    { icon: '🌟', fr: "Tableau d'excellence", en: 'Excellence board', es: 'Cuadro de excelencia', d: ['Moyenne ≥ 16/20', 'Average ≥ 16/20', 'Media ≥ 16/20'],
      apply: { scope: 'school', limit: 15, layout: 'poster', sort: 'score', filters: { minAvgPct: 80 }, personalization: { ...p, title: "Tableau d'excellence", primaryColor: '#1e3a8a' } } },
    { icon: '👑', fr: 'Major de classe', en: 'Class top student', es: 'Mejor de la clase', d: ['Premier de chaque classe', 'First of each class', 'Primero de cada clase'],
      apply: { scope: 'class', limit: 1, layout: 'diploma', sort: 'score', filters: { maxRank: 1 }, personalization: { ...p, title: "TABLEAU D'HONNEUR" } } },
    { icon: '🎖️', fr: 'Élèves méritants', en: 'Deserving students', es: 'Alumnos meritorios', d: ['Moyenne ≥ 14/20', 'Average ≥ 14/20', 'Media ≥ 14/20'],
      apply: { scope: 'school', limit: 20, layout: 'table', sort: 'score', filters: { minAvgPct: 70 }, personalization: { ...p, title: 'Élèves méritants', primaryColor: '#15803d' } } },
    { icon: '👦', fr: 'Meilleurs garçons', en: 'Top boys', es: 'Mejores chicos', d: ['Top 10 garçons', 'Top 10 boys', 'Top 10 chicos'],
      apply: { scope: 'school', limit: 10, layout: 'table', sort: 'score', filters: { gender: 'M' }, personalization: { ...p, title: 'Meilleurs garçons', primaryColor: '#0369a1' } } },
    { icon: '👧', fr: 'Meilleures filles', en: 'Top girls', es: 'Mejores chicas', d: ['Top 10 filles', 'Top 10 girls', 'Top 10 chicas'],
      apply: { scope: 'school', limit: 10, layout: 'table', sort: 'score', filters: { gender: 'F' }, personalization: { ...p, title: 'Meilleures filles', primaryColor: '#be185d' } } },
    { icon: '📚', fr: 'Élèves disciplinés', en: 'Best conduct', es: 'Alumnos disciplinados', d: ['Conduite exemplaire', 'Exemplary conduct', 'Conducta ejemplar'],
      apply: { scope: 'school', limit: 20, layout: 'table', sort: 'conduite', filters: { conduiteMin: 16, maxAbsNJ: 0 }, personalization: { ...p, title: 'Élèves disciplinés', primaryColor: '#7c3aed', columns: ['rank', 'name', 'class', 'conduite'] } } },
    { icon: '✨', fr: 'Partir de zéro', en: 'Start from scratch', es: 'Desde cero', d: ['Modèle personnalisé', 'Custom template', 'Plantilla personalizada'],
      apply: { scope: 'school', limit: 10, layout: 'table', sort: 'score', filters: {}, personalization: { ...p, title: 'Tableau personnalisé' } } },
  ];

  const chooseBlueprint = (bp) => {
    setW((s) => ({ ...s, ...bp.apply, name: s.name && s.name !== 'Nouveau tableau' ? s.name : t(bp.fr, bp.en, bp.es) }));
    setStep(1);
  };

  const SCOPES = [
    { v: 'school', icon: '🏫', fr: 'Établissement entier', en: 'Whole school', es: 'Todo el centro' },
    { v: 'level',  icon: '📚', fr: 'Par niveau', en: 'By level', es: 'Por nivel' },
    { v: 'class',  icon: '👨‍🏫', fr: 'Par classe', en: 'By class', es: 'Por clase' },
    { v: 'subject', icon: '📘', fr: 'Par matière', en: 'By subject', es: 'Por asignatura' },
  ];

  // Aperçu temps réel (calculé seulement à partir de l'étape 4 pour la fluidité).
  const previewHtml = useMemo(() => {
    if (step < 3) return null;
    try {
      const groups = applyTemplate(w, data, { t });
      const sheets = buildHonorRollSheets(w, groups, data.school, { year: data.school?.current_year });
      if (!sheets.length) return '__EMPTY__';
      return buildPrintDocument(sheets.slice(0, 2), w.name);
    } catch { return '__EMPTY__'; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, JSON.stringify(w), data.classes, data.students, data.subjects, data.gradeMap]);

  const topOptions = [3, 5, 10, 20];
  const isCustomTop = w.limit != null && !topOptions.includes(w.limit);

  const toggleCol = (c) => {
    const cur = new Set(p.columns && p.columns.length ? p.columns : ['rank', 'name', 'class', 'avg', 'mention']);
    cur.has(c) ? cur.delete(c) : cur.add(c);
    setP('columns', COLS_ORDER.filter((x) => cur.has(x)));
  };
  const activeCols = new Set(p.columns && p.columns.length ? p.columns : ['rank', 'name', 'class', 'avg', 'mention']);

  const TITLES = [
    t('Choisissez un modèle', 'Choose a template', 'Elija una plantilla'),
    t('Qui est concerné ?', 'Who is concerned?', '¿A quién afecta?'),
    t('Règles de sélection', 'Selection rules', 'Reglas'),
    t('Personnalisation', 'Personalization', 'Personalización'),
    t('Aperçu & enregistrement', 'Preview & save', 'Vista y guardar'),
  ];

  const card = (active) => `relative text-left rounded-2xl border-2 p-4 transition-all ${active ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-slate-200 hover:border-indigo-300 hover:shadow-sm'}`;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-6" onClick={(e) => e.stopPropagation()}>
        {/* En-tête assistant */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-indigo-600">{t('Étape', 'Step', 'Paso')} {step + 1}/5</p>
            <h2 className="text-lg font-bold text-slate-900">{TITLES[step]}</h2>
          </div>
          <div className="flex items-center gap-4">
            <StepDots step={step} total={5} />
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 min-h-[360px]">
          {/* ÉTAPE 1 — modèles */}
          {step === 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {BLUEPRINTS.map((bp) => (
                <button key={bp.fr} onClick={() => chooseBlueprint(bp)} className={card(false)}>
                  <div className="text-3xl mb-2">{bp.icon}</div>
                  <div className="font-bold text-slate-900 text-sm">{t(bp.fr, bp.en, bp.es)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{t(bp.d[0], bp.d[1], bp.d[2])}</div>
                  <span className="inline-block mt-3 text-xs font-semibold text-indigo-600">{t('Utiliser', 'Use', 'Usar')} →</span>
                </button>
              ))}
            </div>
          )}

          {/* ÉTAPE 2 — périmètre */}
          {step === 1 && (
            <div className="grid sm:grid-cols-2 gap-3">
              {SCOPES.map((s) => (
                <button key={s.v} onClick={() => set('scope', s.v)} className={card(w.scope === s.v)}>
                  <div className="text-3xl mb-2">{s.icon}</div>
                  <div className="font-bold text-slate-900">{t(s.fr, s.en, s.es)}</div>
                </button>
              ))}
            </div>
          )}

          {/* ÉTAPE 3 — règles */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">{t('Combien d\'élèves ?', 'How many students?', '¿Cuántos?')}</p>
                <div className="flex flex-wrap gap-2">
                  {topOptions.map((n) => (
                    <button key={n} onClick={() => set('limit', n)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${w.limit === n ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                      Top {n}
                    </button>
                  ))}
                  <button onClick={() => set('limit', isCustomTop ? w.limit : 25)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${isCustomTop ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                    {t('Personnalisé', 'Custom', 'Otro')}
                  </button>
                  {isCustomTop && (
                    <input type="number" min="1" value={w.limit} onChange={(e) => set('limit', Number(e.target.value) || 1)}
                      className="w-20 px-3 py-2 rounded-xl border-2 border-indigo-300 text-sm" />
                  )}
                  <button onClick={() => set('limit', null)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${w.limit == null ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                    {t('Tous', 'All', 'Todos')}
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">{t('Trier par', 'Sort by', 'Ordenar por')}</p>
                <div className="flex flex-wrap gap-2">
                  {[['score', t('Moyenne', 'Average', 'Media')], ['conduite', t('Conduite', 'Conduct', 'Conducta')], ['absNJ', t('Assiduité', 'Attendance', 'Asistencia')]].map(([v, label]) => (
                    <button key={v} onClick={() => set('sort', v)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${w.sort === v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {w.scope === 'subject' && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">{t('Matière', 'Subject', 'Asignatura')}</p>
                  <select className="form-input max-w-xs" value={w.subjectName || ''} onChange={(e) => set('subjectName', e.target.value || undefined)}>
                    <option value="">{t('Toutes', 'All', 'Todas')}</option>
                    {subjectNames.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <button onClick={() => setAdvanced((a) => !a)} className="text-sm font-semibold text-indigo-600 flex items-center gap-1">
                {t('Critères avancés', 'Advanced criteria', 'Criterios avanzados')} <span className={`transition-transform ${advanced ? 'rotate-90' : ''}`}>▸</span>
              </button>
              {advanced && (
                <div className="grid sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 border border-slate-100 p-4">
                  <div><label className="form-label">{t('Moyenne min (%)', 'Min avg (%)', 'Media mín %')}</label><input type="number" className="form-input" value={f.minAvgPct ?? ''} onChange={(e) => setF('minAvgPct', e.target.value ? Number(e.target.value) : '')} /></div>
                  <div><label className="form-label">{t('Conduite min /20', 'Min conduct', 'Conducta mín')}</label><input type="number" className="form-input" value={f.conduiteMin ?? ''} onChange={(e) => setF('conduiteMin', e.target.value ? Number(e.target.value) : '')} /></div>
                  <div><label className="form-label">{t('Abs. injust. max', 'Max abs.', 'Faltas máx')}</label><input type="number" className="form-input" value={f.maxAbsNJ ?? ''} onChange={(e) => setF('maxAbsNJ', e.target.value !== '' ? Number(e.target.value) : '')} /></div>
                  <div><label className="form-label">{t('Rang max', 'Max rank', 'Puesto máx')}</label><input type="number" className="form-input" value={f.maxRank ?? ''} onChange={(e) => setF('maxRank', e.target.value ? Number(e.target.value) : '')} /></div>
                  <div>
                    <label className="form-label">{t('Sexe', 'Gender', 'Sexo')}</label>
                    <select className="form-input" value={f.gender ?? ''} onChange={(e) => setF('gender', e.target.value)}>
                      <option value="">{t('Tous', 'All', 'Todos')}</option><option value="M">{t('Garçons', 'Boys', 'Chicos')}</option><option value="F">{t('Filles', 'Girls', 'Chicas')}</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ÉTAPE 4 — personnalisation */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="form-label">{t('Titre imprimé', 'Printed title', 'Título')}</label>
                <input className="form-input max-w-md" value={p.title || ''} onChange={(e) => setP('title', e.target.value)} />
              </div>
              <div>
                <p className="form-label">{t('Couleur', 'Color', 'Color')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {PALETTES.map((pal) => (
                    <button key={pal.key} onClick={() => setP('primaryColor', pal.color)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${p.primaryColor === pal.color ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
                      <span className="w-4 h-4 rounded-full" style={{ background: pal.color }} />{t(pal.fr, pal.en, pal.es)}
                    </button>
                  ))}
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-slate-200 text-sm font-semibold cursor-pointer">
                    🎨 {t('Perso', 'Custom', 'Otro')}
                    <input type="color" className="w-6 h-6 rounded cursor-pointer" value={p.primaryColor || '#7c2d12'} onChange={(e) => setP('primaryColor', e.target.value)} />
                  </label>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="form-label">{t("Texte d'introduction", 'Intro text', 'Introducción')}</label><input className="form-input" value={p.introText || ''} onChange={(e) => setP('introText', e.target.value)} /></div>
                <div><label className="form-label">{t('Texte de félicitations', 'Congrats text', 'Felicitación')}</label><input className="form-input" value={p.congratsText || ''} onChange={(e) => setP('congratsText', e.target.value)} /></div>
                <div className="sm:col-span-2"><label className="form-label">{t('Mention spéciale', 'Special mention', 'Mención')}</label><input className="form-input" value={p.specialMention || ''} onChange={(e) => setP('specialMention', e.target.value)} /></div>
              </div>
              <p className="text-xs text-slate-400">{t('Le logo, les signatures et le tampon de l\'établissement (Paramètres) sont ajoutés automatiquement.', 'School logo, signatures and stamp (Settings) are added automatically.', 'El logo y sellos del centro se añaden automáticamente.')}</p>
            </div>
          )}

          {/* ÉTAPE 5 — aperçu temps réel */}
          {step === 4 && (
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div>
                  <label className="form-label">{t('Nom du modèle', 'Template name', 'Nombre')}</label>
                  <input className="form-input" value={w.name} onChange={(e) => set('name', e.target.value)} />
                </div>
                <div>
                  <p className="form-label">{t('Colonnes affichées', 'Displayed columns', 'Columnas')}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {COLS_ORDER.map((c) => (
                      <label key={c} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer py-1">
                        <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={activeCols.has(c)} onChange={() => toggleCol(c)} />
                        {t(...COL_LABELS[c])}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 space-y-1">
                  <p><strong className="text-slate-700">{t('Récapitulatif', 'Summary', 'Resumen')}</strong></p>
                  <p>{t('Mise en page', 'Layout', 'Diseño')} : {w.layout} · {w.scope} · {w.limit ? `Top ${w.limit}` : t('Tous', 'All', 'Todos')}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-100 min-h-[300px] flex flex-col">
                <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-white border-b border-slate-100">{t('Aperçu en temps réel', 'Live preview', 'Vista en vivo')}</div>
                {previewHtml === '__EMPTY__' || !previewHtml ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-6 text-center">{t('Aucune donnée à afficher (notes manquantes ou critères trop stricts).', 'No data to show (missing grades or strict criteria).', 'Sin datos.')}</div>
                ) : (
                  <iframe title="live" srcDoc={previewHtml} className="flex-1 w-full bg-white" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pied — navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <button onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors">
            {step === 0 ? t('Annuler', 'Cancel', 'Cancelar') : t('← Retour', '← Back', '← Atrás')}
          </button>
          {step < 4 ? (
            <button onClick={() => setStep((s) => Math.min(4, s + 1))}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
              {t('Suivant →', 'Next →', 'Siguiente →')}
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => onSave(w)} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors">
                {t('Enregistrer', 'Save', 'Guardar')}
              </button>
              <button onClick={() => onSaveAndPdf(w)} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
                {t('Enregistrer & générer PDF', 'Save & generate PDF', 'Guardar y PDF')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
