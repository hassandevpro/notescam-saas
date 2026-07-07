import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore } from '../store/uiStore';
import {
  listTemplates, upsertTemplate, duplicateTemplate, toggleTemplate, deleteTemplate, blankTemplate,
} from '../lib/honorRollTemplates';
import { applyTemplate, distinctLevels, distinctSubjectNames } from '../lib/honorRollEngine';
import { buildHonorRollSheets } from '../lib/honorRollDoc';
import { printSheets, buildPrintDocument } from '../lib/transcriptDoc';
import { exportTranscriptsPdf } from '../lib/transcriptPdf';
import TemplateWizard from '../components/honor/TemplateWizard';
import HonorAwardModal from '../components/HonorAwardModal';

// ── Icônes (inline SVG, style Lucide) ─────────────────────────────────────────
const I = {
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14"/></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  dots: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
};

const KPI_KEY = (id) => `nc_honor_kpi_${id || 'default'}`;
const LG_KEY  = (id) => `nc_honor_lastgen_${id || 'default'}`;

// ── Page principale (cockpit premium) ─────────────────────────────────────────
export default function HonorRoll() {
  const t = useT();
  const lang = useUiStore((s) => s.uiLang);
  const school   = useAuthStore((s) => s.school);
  const schoolId = school?.id;
  const classes  = useSchoolStore((s) => s.classes);
  const schoolUnits = useSchoolStore((s) => s.schoolUnits);
  const subjects = useSchoolStore((s) => s.subjects);
  const students = useSchoolStore((s) => s.students);
  const gradeMap = useSchoolStore((s) => s.gradeMap);
  const year     = school?.current_year || '';

  const [templates, setTemplates] = useState(() => listTemplates(schoolId));
  const [editing,   setEditing]   = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [pdfProg,   setPdfProg]   = useState(null);
  const [filter,    setFilter]    = useState('all');
  const [search,    setSearch]    = useState('');
  const [menuFor,   setMenuFor]   = useState(null);
  const [awardModal, setAwardModal] = useState(null); // diplômes premium (moteur carte scolaire)

  // Compteur PDF / trimestre (réinitialisé chaque année) + dernières générations.
  const [pdfCount, setPdfCount] = useState(() => {
    try { const r = JSON.parse(localStorage.getItem(KPI_KEY(schoolId))); return r?.period === year ? r.count : 0; } catch { return 0; }
  });
  const [lastGen, setLastGen] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LG_KEY(schoolId))) || {}; } catch { return {}; }
  });
  const bumpPdf = () => setPdfCount((c) => { const n = c + 1; try { localStorage.setItem(KPI_KEY(schoolId), JSON.stringify({ period: year, count: n })); } catch {} return n; });
  const markGen = (id) => setLastGen((m) => { const n = { ...m, [id]: Date.now() }; try { localStorage.setItem(LG_KEY(schoolId), JSON.stringify(n)); } catch {} return n; });

  const levels    = useMemo(() => distinctLevels(classes), [classes]);
  const subjNames = useMemo(() => distinctSubjectNames(subjects), [subjects]);
  const data = { school, classes, subjects, students, gradeMap };

  const refresh = () => setTemplates(listTemplates(schoolId));

  // Stats par modèle (élèves concernés) + agrégats KPI (modèles actifs).
  const { perTpl, kpi } = useMemo(() => {
    const map = {};
    const activeStudents = new Set();
    const activeClasses  = new Set();
    let activeModels = 0;
    templates.forEach((tpl) => {
      let count = 0; const cls = new Set();
      try {
        applyTemplate(tpl, data, { t }).forEach((g) => g.rows.forEach((r) => {
          count++; cls.add(r.classId);
          if (tpl.active) { activeStudents.add(r.id); if (r.classId) activeClasses.add(r.classId); }
        }));
      } catch {}
      map[tpl.id] = { students: count, classes: cls.size };
      if (tpl.active) activeModels++;
    });
    return { perTpl: map, kpi: { activeModels, students: activeStudents.size, classes: activeClasses.size } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, classes, subjects, students, gradeMap]);

  const sheetsFor = (tpl) => buildHonorRollSheets(tpl, applyTemplate(tpl, data, { t }), school, { year });
  const noData = (tpl) => { const s = sheetsFor(tpl); if (!s.length) { alert(t('Aucune donnée pour ce modèle.', 'No data for this template.', 'Sin datos.')); return null; } return s; };

  // Les documents individuels à encadrer (certificat / diplôme) passent par le
  // diplôme premium rendu via le MOTEUR de la carte scolaire (HonorAwardModal).
  // Les documents de liste (table collective / affiche) gardent le pipeline feuille.
  const isAwardLayout = (tpl) => tpl.layout === 'certificate' || tpl.layout === 'diploma';
  const openAward = (tpl) => {
    const rows = applyTemplate(tpl, data, { t }).flatMap((g) => g.rows);
    if (!rows.length) { alert(t('Aucune donnée pour ce modèle.', 'No data for this template.', 'Sin datos.')); return; }
    setAwardModal({ tpl, rows });
  };

  const handlePreview = (tpl) => {
    if (isAwardLayout(tpl)) return openAward(tpl);
    const s = noData(tpl); if (s) setPreview({ name: tpl.name, html: buildPrintDocument(s.slice(0, 4), tpl.name), sheets: s });
  };
  const handlePrint = (tpl) => {
    if (isAwardLayout(tpl)) return openAward(tpl);
    const s = noData(tpl); if (s) { printSheets(s, tpl.name); markGen(tpl.id); }
  };
  const handlePdf = async (tpl) => {
    if (isAwardLayout(tpl)) return openAward(tpl);
    const s = noData(tpl); if (!s) return;
    setPdfProg({ id: tpl.id, done: 0, total: s.length });
    try {
      await exportTranscriptsPdf(s, { fileName: `${tpl.name.toLowerCase().replace(/\s+/g, '-')}-${year}.pdf`, onProgress: (done, total) => setPdfProg({ id: tpl.id, done, total }) });
      bumpPdf(); markGen(tpl.id);
    } finally { setPdfProg(null); }
  };
  const handleSave = (m) => { upsertTemplate(schoolId, m); setEditing(null); refresh(); };
  const handleSaveAndPdf = (m) => { upsertTemplate(schoolId, m); setEditing(null); refresh(); handlePdf(m); };

  // ── Helpers d'affichage ────────────────────────────────────────────────────
  const iconOf = (tpl) => {
    const n = (tpl.name || '').toLowerCase();
    if (tpl.filters?.gender === 'F') return '👧';
    if (tpl.filters?.gender === 'M') return '👦';
    if (tpl.layout === 'diploma' || tpl.layout === 'certificate') return '🎓';
    if (n.includes('excell')) return '⭐';
    if (n.includes('major')) return '👑';
    if (n.includes('disciplin')) return '🎖️';
    if (n.includes('mérit') || n.includes('merit')) return '🌟';
    if (tpl.scope === 'subject') return '📘';
    return '🏆';
  };
  const describe = (tpl) => {
    const f = tpl.filters || {}; const n = tpl.limit;
    let base;
    if (f.gender === 'F') base = t('Meilleures filles', 'Top girls', 'Mejores chicas');
    else if (f.gender === 'M') base = t('Meilleurs garçons', 'Top boys', 'Mejores chicos');
    else if (tpl.scope === 'class') base = n ? `Top ${n} ${t('par classe', 'per class', 'por clase')}` : t('Classement par classe', 'Ranking by class', 'Por clase');
    else if (tpl.scope === 'level') base = n ? `Top ${n} ${t('par niveau', 'per level', 'por nivel')}` : t('Classement par niveau', 'Ranking by level', 'Por nivel');
    else if (tpl.scope === 'subject') base = n ? `Top ${n} ${t('par matière', 'per subject', 'por asignatura')}` : t('Par matière', 'By subject', 'Por asignatura');
    else base = n ? `Top ${n} ${t("de l'établissement", 'of the school', 'del centro')}` : t("Classement de l'établissement", 'School ranking', 'Del centro');
    const extra = [];
    if (f.minAvgPct) extra.push(`${t('Moy.', 'Avg', 'Media')} ≥ ${f.minAvgPct}%`);
    if (f.conduiteMin) extra.push(`${t('Conduite', 'Conduct', 'Conducta')} ≥ ${f.conduiteMin}`);
    if (f.maxAbsNJ === 0) extra.push(t('0 absence injust.', '0 unexcused abs.', '0 faltas'));
    return base + (extra.length ? ' · ' + extra.join(' · ') : '');
  };
  const categoryOf = (tpl) => {
    if (tpl.filters?.gender) return 'special';
    if (tpl.scope === 'class' || tpl.scope === 'level' || tpl.scope === 'subject') return 'class';
    return 'collective';
  };
  const matchesFilter = (tpl) => {
    if (filter === 'collective') return tpl.scope === 'school';
    if (filter === 'class')      return tpl.scope === 'class';
    if (filter === 'level')      return tpl.scope === 'level';
    if (filter === 'cert')       return tpl.layout === 'certificate' || tpl.layout === 'diploma';
    return true;
  };

  const visible = templates.filter((tpl) => matchesFilter(tpl) && (!search.trim() || tpl.name.toLowerCase().includes(search.trim().toLowerCase())));
  const SECTIONS = [
    { key: 'collective', label: t('Distinctions collectives', 'Collective distinctions', 'Distinciones colectivas') },
    { key: 'class',      label: t('Distinctions par classe', 'By-class distinctions', 'Por clase') },
    { key: 'special',    label: t('Distinctions spéciales', 'Special distinctions', 'Especiales') },
  ];
  const FILTERS = [
    { id: 'all',        label: t('Tous', 'All', 'Todos') },
    { id: 'collective', label: t('Collectifs', 'Collective', 'Colectivos') },
    { id: 'class',      label: t('Classe', 'Class', 'Clase') },
    { id: 'level',      label: t('Niveau', 'Level', 'Nivel') },
    { id: 'cert',       label: t('Certificats', 'Certificates', 'Certificados') },
  ];

  const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : t('Jamais générée', 'Never generated', 'Nunca');

  // ── Carte modèle ────────────────────────────────────────────────────────────
  const Card = ({ tpl }) => {
    const st = perTpl[tpl.id] || { students: 0 };
    const open = menuFor === tpl.id;
    return (
      <div className="group relative bg-white rounded-2xl border border-slate-200/70 p-5 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all duration-200">
        <div className="flex items-start justify-between">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-2xl">{iconOf(tpl)}</div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${tpl.active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {tpl.active ? t('Actif', 'Active', 'Activo') : t('Brouillon', 'Draft', 'Borrador')}
            </span>
            <div className="relative">
              <button onClick={() => setMenuFor(open ? null : tpl.id)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">{I.dots}</button>
              {open && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                  <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1 text-sm animate-fade-up">
                    {[
                      ['Aperçu', 'Preview', 'Vista', () => { setMenuFor(null); handlePreview(tpl); }],
                      ['Modifier', 'Edit', 'Editar', () => { setMenuFor(null); setEditing(tpl); }],
                      ['Dupliquer', 'Duplicate', 'Duplicar', () => { setMenuFor(null); duplicateTemplate(schoolId, tpl.id); refresh(); }],
                      ['Imprimer', 'Print', 'Imprimir', () => { setMenuFor(null); handlePrint(tpl); }],
                      [tpl.active ? 'Désactiver' : 'Activer', tpl.active ? 'Deactivate' : 'Activate', tpl.active ? 'Desactivar' : 'Activar', () => { setMenuFor(null); toggleTemplate(schoolId, tpl.id); refresh(); }],
                    ].map(([fr, en, es, fn]) => (
                      <button key={fr} onClick={fn} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700">{t(fr, en, es)}</button>
                    ))}
                    <div className="border-t border-slate-100 my-1" />
                    <button onClick={() => { setMenuFor(null); if (window.confirm(t('Supprimer ce modèle ?', 'Delete this template?', '¿Eliminar?'))) { deleteTemplate(schoolId, tpl.id); refresh(); } }}
                      className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600">{t('Supprimer', 'Delete', 'Eliminar')}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <h3 className="font-bold text-slate-900 mt-3 leading-snug">{tpl.name}</h3>
        <p className="text-sm text-slate-500 mt-1 leading-snug min-h-[2.5rem]">{describe(tpl)}</p>

        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">{I.users}<strong className="text-slate-700">{st.students}</strong> {t('élèves', 'students', 'alumnos')}</span>
          <span className="flex items-center gap-1.5">{I.calendar}{fmtDate(lastGen[tpl.id])}</span>
        </div>

        <button onClick={() => handlePdf(tpl)} disabled={!!pdfProg}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
          {pdfProg?.id === tpl.id ? `${t('Génération', 'Generating', 'Generando')} ${pdfProg.done}/${pdfProg.total}…` : <>{I.download}{t('Générer PDF', 'Generate PDF', 'Generar PDF')}</>}
        </button>
      </div>
    );
  };

  const KpiCard = ({ emoji, value, label, tone }) => (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-sm">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${tone}`}>{emoji}</span>
      <div className="text-3xl font-extrabold text-slate-900 mt-3">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
    </div>
  );

  return (
    <Layout>
      <div className="max-w-6xl">
        {/* HEADER */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("Tableaux d'honneur", 'Honour rolls', 'Cuadros de honor')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t('Gérez les distinctions académiques de votre établissement', "Manage your school's academic distinctions", 'Gestione las distinciones de su centro')}</p>
          </div>
          <button onClick={() => setEditing(blankTemplate())} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors">
            {I.plus}{t('Nouveau modèle', 'New template', 'Nueva plantilla')}
          </button>
        </div>

        {/* DASHBOARD */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard emoji="🏆" tone="bg-indigo-50" value={kpi.activeModels} label={t('Modèles actifs', 'Active templates', 'Plantillas activas')} />
          <KpiCard emoji="👨‍🎓" tone="bg-emerald-50" value={kpi.students} label={t('Élèves récompensés', 'Students rewarded', 'Alumnos premiados')} />
          <KpiCard emoji="📄" tone="bg-amber-50" value={pdfCount} label={t('PDF générés ce trimestre', 'PDFs this term', 'PDF este trimestre')} />
          <KpiCard emoji="📚" tone="bg-sky-50" value={kpi.classes} label={t('Classes concernées', 'Classes involved', 'Clases')} />
        </div>

        {/* FILTRES */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{I.search}</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Rechercher un modèle…', 'Search a template…', 'Buscar…')}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {FILTERS.map((ff) => (
              <button key={ff.id} onClick={() => setFilter(ff.id)}
                className={`px-3 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition-colors ${filter === ff.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                {ff.label}
              </button>
            ))}
          </div>
        </div>

        {/* SECTIONS PAR CATÉGORIE */}
        {visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-14 text-center">
            <div className="text-5xl mb-3">🏆</div>
            <p className="text-slate-700 font-semibold">{templates.length === 0 ? t('Aucun modèle créé', 'No template yet', 'Sin plantillas') : t('Aucun résultat', 'No results', 'Sin resultados')}</p>
            <p className="text-sm text-slate-400 mt-1">{t("Créez votre premier tableau d'honneur personnalisé.", 'Create your first custom honour roll.', 'Cree su primer cuadro de honor.')}</p>
            <button onClick={() => setEditing(blankTemplate())} className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
              {I.plus}{t('Créer mon premier tableau', 'Create my first template', 'Crear plantilla')}
            </button>
          </div>
        ) : (
          SECTIONS.map((sec) => {
            const items = visible.filter((tpl) => categoryOf(tpl) === sec.key);
            if (!items.length) return null;
            return (
              <div key={sec.key} className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{sec.label}</h2>
                  <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{items.length}</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {items.map((tpl) => <Card key={tpl.id} tpl={tpl} />)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <TemplateWizard
          tpl={editing}
          data={data}
          levels={levels}
          subjectNames={subjNames}
          onSave={handleSave}
          onSaveAndPdf={handleSaveAndPdf}
          onClose={() => setEditing(null)}
        />
      )}

      {awardModal && (
        <HonorAwardModal
          open
          onClose={() => setAwardModal(null)}
          rows={awardModal.rows}
          school={school}
          units={schoolUnits}
          classes={classes}
          template={awardModal.tpl}
          year={year}
          onGenerated={() => { bumpPdf(); markGen(awardModal.tpl.id); }}
        />
      )}

      {preview && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex flex-col p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-w-4xl w-full mx-auto my-4 overflow-hidden" style={{ height: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">{t('Aperçu', 'Preview', 'Vista')} — {preview.name}</h3>
              <div className="flex gap-2">
                <button onClick={() => printSheets(preview.sheets, preview.name)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors">🖨 {t('Imprimer', 'Print', 'Imprimir')}</button>
                <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors">{t('Fermer', 'Close', 'Cerrar')}</button>
              </div>
            </div>
            <iframe title="preview" srcDoc={preview.html} className="flex-1 w-full bg-slate-100" />
          </div>
        </div>
      )}
    </Layout>
  );
}
