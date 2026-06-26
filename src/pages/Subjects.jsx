import { useState, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useT } from '../lib/i18n';
import { useCountry, geGradeMax, gePrimaryUsesCoef } from '../lib/useCountry';

// Famille pédagogique (déduite du nom + catégorie) — pour les filtres rapides.
function subjectFamily(name = '', catName = '') {
  const s = (name + ' ' + catName).toLowerCase();
  if (/techn|informat|ordinat|comput|industri|compta|mécan|mecan|electr|électr|vocational|profession|robot/.test(s)) return 'techniques';
  if (/math|physi|chimi|svt|biolog|scienc|géolog|geolog|exact/.test(s)) return 'sciences';
  if (/fran|angl|allem|espagn|langue|lengua|philo|histoir|géograph|geograph|littér|liter|social|human|civi|écm|ecm|religio/.test(s)) return 'litteraires';
  return 'autres';
}

function getSubjectCategory(subject, categories) {
  if (subject.category_id) {
    return categories.find((c) => c.id === subject.category_id) || null;
  }
  const nameLower = subject.name.toLowerCase();
  return categories.find((cat) =>
    cat.keywords.some((kw) => nameLower.includes(kw))
  ) || null;
}

// ── Formulaire matière ────────────────────────────────────────────────────────
function SubjectForm({ initial, classId, teachers, classes, categories, subjects = [], onSave, onCancel }) {
  const t = useT();
  const country = useCountry();
  const school  = useAuthStore((s) => s.school);
  const isGE    = country.code === 'guinea_eq';
  const geMax   = geGradeMax(school);
  // Max par défaut piloté par le pays : Cameroun FR = 20, Cameroun EN = 100,
  // Guinée Eq = échelle choisie par l'admin (10 ou 20).
  const defaultMax = isGE ? geMax : (country.maxGrade || 20);
  const [form, setForm] = useState({
    name: '', coef: 1, max: defaultMax, class_id: classId || '', teacher_id: '', category_id: '',
    parent_id: '', calc_method: '',
    ...initial,
  });
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Coefficients au primaire (GE) : masqués/forcés à 1 si l'admin les désactive.
  const selectedCls   = classes.find((c) => c.id === form.class_id) || null;
  const coefDisabledGE = isGE && selectedCls?.cycle === 'primaire' && !gePrimaryUsesCoef(school);
  // Matières principales de la même classe (parents possibles), hors self.
  const parentOptions = subjects.filter(
    (s) => s.class_id === form.class_id && s.id !== initial?.id && !s.parent_id,
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      coef:       coefDisabledGE ? 1 : Number(form.coef),
      max:        Number(form.max),
      teacher_id: form.teacher_id  || null,
      category_id: form.category_id || null,
      // Matière composite : parent_id = sous-composante d'une autre matière ;
      // calc_method ne concerne que les matières principales (parent_id vide).
      parent_id:   form.parent_id || null,
      calc_method: form.parent_id ? null : (form.calc_method || null),
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="pb-2">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="col-span-2 md:col-span-1">
          <label className="form-label">{t('Matière *', 'Subject *')}</label>
          <input type="text" required className="form-input" placeholder={t('Ex : Mathématiques', 'E.g. Mathematics')}
            value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className="form-label">{t('Classe *', 'Class *')}</label>
          <select required className="form-input" value={form.class_id} onChange={set('class_id')}>
            <option value="">— {t('Choisir', 'Select')} —</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Catégorie', 'Category')}</label>
          <select className="form-input" value={form.category_id || ''} onChange={set('category_id')}>
            <option value="">— {t('Aucune', 'None')} —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Coefficient *', 'Coefficient *')}</label>
          <input type="number" required min="1" max="10" className="form-input disabled:bg-gray-50 disabled:text-gray-400"
            disabled={coefDisabledGE}
            value={coefDisabledGE ? 1 : form.coef} onChange={set('coef')} />
          {coefDisabledGE && (
            <p className="text-xs text-gray-400 mt-1">Primaria sin coeficientes (todas las asignaturas pesan igual).</p>
          )}
        </div>
        <div>
          <label className="form-label">{t('Barème *', 'Max score *')}</label>
          {isGE ? (
            <select required className="form-input" value={form.max} onChange={set('max')}>
              <option value={10}>/ 10</option>
              <option value={20}>/ 20</option>
            </select>
          ) : (
            <select required className="form-input" value={form.max} onChange={set('max')}>
              <option value={20}>{t('/ 20 (système FR)', '/ 20 (FR system)')}</option>
              <option value={100}>{t('/ 100 (système EN)', '/ 100 (EN system)')}</option>
            </select>
          )}
        </div>
        <div>
          <label className="form-label">{t('Enseignant', 'Teacher')}</label>
          <select className="form-input" value={form.teacher_id || ''} onChange={set('teacher_id')}>
            <option value="">— {t('Aucun', 'None')} —</option>
            {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
          </select>
        </div>

        {/* Matières composites : rattacher comme sous-composante, ou définir la
            méthode de calcul si c'est une matière principale. */}
        <div>
          <label className="form-label">{t('Sous-composante de', 'Component of', 'Componente de')}</label>
          <select className="form-input" value={form.parent_id || ''} onChange={set('parent_id')}>
            <option value="">— {t('Matière principale', 'Main subject', 'Principal')} —</option>
            {parentOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {!form.parent_id && (
          <div>
            <label className="form-label">{t('Méthode de calcul', 'Calc. method', 'Cálculo')}</label>
            <select className="form-input" value={form.calc_method || ''} onChange={set('calc_method')}>
              <option value="">{t('Simple (sans composantes)', 'Simple (no components)', 'Simple')}</option>
              <option value="weighted_avg">{t('Moyenne pondérée', 'Weighted average', 'Media ponderada')}</option>
              <option value="avg">{t('Moyenne simple', 'Simple average', 'Media simple')}</option>
              <option value="weighted_sum">{t('Somme pondérée', 'Weighted sum', 'Suma ponderada')}</option>
            </select>
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-5">
        <button type="submit" disabled={saving} className="btn-primary"
          style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
          {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
      </div>
    </form>
  );
}

// ── Carte catégorie ───────────────────────────────────────────────────────────
function CategoryCard({ category, subjects, classes, teachers, onAddSubject, onEditSubject, onDeleteSubject, forceOpen = false }) {
  const t = useT();
  const [open, setOpen]         = useState(false);
  const [confirmDel, setConfDel] = useState(null);

  const isOpen = forceOpen || open;

  const classNameById   = (id) => classes.find((c) => c.id === id)?.name || '—';
  const teacherNameById = (id) => teachers.find((t) => t.id === id)?.name || null;

  return (
    <div className={`rounded-xl border transition-all ${
      isOpen ? 'border-brand-200 shadow-md' : 'border-gray-100 shadow-sm hover:border-brand-100 hover:shadow'
    } bg-white`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-4"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">{category.name}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{t('Ordre', 'Order')} {category.ordre}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">{category.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
            subjects.length > 0 ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-400'
          }`}>
            {subjects.length} {t('matière', 'subject')}{subjects.length !== 1 ? 's' : ''}
          </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="border-t border-gray-100 px-5 py-4">
          {subjects.length === 0 ? (
            <p className="text-sm text-gray-400 mb-3">{t('Aucune matière dans cette catégorie.', 'No subjects in this category.')}</p>
          ) : (
            <div className="divide-y divide-gray-50 mb-3">
              {subjects.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-800">{sub.name}</span>
                    <span className="text-xs text-gray-400 ml-2">coef {sub.coef} · /{sub.max}</span>
                    <span className="text-xs text-gray-400 ml-2">{classNameById(sub.class_id)}</span>
                    {sub.teacher_id && (
                      <span className="text-xs text-brand-600 ml-2">{teacherNameById(sub.teacher_id)}</span>
                    )}
                  </div>
                  {confirmDel?.id === sub.id ? (
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-red-600">{t('Supprimer ?', 'Delete?')}</span>
                      <button onClick={() => { onDeleteSubject(sub.id); setConfDel(null); }}
                        className="text-xs text-red-600 hover:underline font-semibold">{t('Oui', 'Yes')}</button>
                      <button onClick={() => setConfDel(null)}
                        className="text-xs text-gray-500 hover:underline">{t('Non', 'No')}</button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 shrink-0">
                      <button onClick={() => onEditSubject(sub)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        title={t('Modifier', 'Edit')}>
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                      </button>
                      <button onClick={() => setConfDel(sub)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title={t('Supprimer', 'Delete')}>
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => onAddSubject(category.id)}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
          >
            <span className="text-base leading-none">+</span> {t('Ajouter une matière à cette catégorie', 'Add subject to this category')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Assistant de création (3 étapes) ──────────────────────────────────────────
// Étape 1 Informations · Étape 2 Classes concernées (multi) · Étape 3 Paramètres.
// Crée une ligne par classe sélectionnée (barème adapté au système de la classe).
function SubjectWizard({ categories, classes, teachers, school, prefillCatId, onCreate, onClose }) {
  const t = useT();
  const geMax = geGradeMax(school);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(prefillCatId || '');
  const [classIds, setClassIds] = useState([]);
  const [coef, setCoef] = useState(1);
  const [max, setMax] = useState(20);
  const [teacherId, setTeacherId] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleClass = (id) => setClassIds((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id]);
  const maxForClass = (cls) => cls?.system === 'EN' ? 100 : cls?.system === 'ES' ? geMax : (Number(max) || 20);

  const TITLES = [
    t('Informations générales', 'General information', 'Información general'),
    t('Classes concernées', 'Classes involved', 'Clases'),
    t('Paramètres pédagogiques', 'Teaching settings', 'Parámetros'),
  ];
  const canNext = step === 0 ? name.trim() !== '' : step === 1 ? classIds.length > 0 : true;

  const finish = async () => {
    setSaving(true);
    const rows = classIds.map((cid) => {
      const cls = classes.find((c) => c.id === cid);
      return { name: name.trim(), category_id: categoryId || null, coef: Number(coef) || 1, max: maxForClass(cls), class_id: cid, teacher_id: teacherId || null };
    });
    await onCreate(rows);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8" style={{ animation: 'modal-in .18s ease-out' }}>
        <style>{`@keyframes modal-in{from{opacity:0;transform:scale(.97) translateY(-8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-indigo-600">{t('Étape', 'Step', 'Paso')} {step + 1}/3</p>
            <h2 className="text-lg font-bold text-slate-900">{TITLES[step]}</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-indigo-600' : i < step ? 'w-3 bg-indigo-300' : 'w-3 bg-slate-200'}`} />)}</div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
        </div>

        <div className="px-6 py-5 min-h-[260px]">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="form-label">{t('Nom de la matière', 'Subject name', 'Nombre')}</label>
                <input className="form-input" autoFocus placeholder={t('Ex : Mathématiques', 'E.g. Mathematics', 'Ej: Matemáticas')} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{t('Catégorie', 'Category', 'Categoría')}</label>
                <select className="form-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{t('— Auto (selon le nom) —', '— Auto (by name) —', '— Auto —')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}
          {step === 1 && (
            <div>
              <p className="text-sm text-slate-500 mb-3">{t('Sélectionnez les classes où cette matière est enseignée.', 'Select the classes where this subject is taught.', 'Seleccione las clases.')}</p>
              {classes.length === 0 ? (
                <p className="text-sm text-amber-600">{t('Aucune classe. Créez d\'abord une classe.', 'No classes yet.', 'Sin clases.')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => (
                    <button key={c.id} type="button" onClick={() => toggleClass(c.id)} aria-pressed={classIds.includes(c.id)}
                      className={`px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${classIds.includes(c.id) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {classIds.length > 0 && <p className="text-xs text-indigo-600 font-semibold mt-3">{classIds.length} {t('classe(s) sélectionnée(s)', 'class(es) selected', 'seleccionadas')}</p>}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">{t('Coefficient', 'Coefficient', 'Coeficiente')}</label>
                  <input type="number" min="1" max="10" className="form-input" value={coef} onChange={(e) => setCoef(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">{t('Barème (FR)', 'Scale (FR)', 'Escala')}</label>
                  <input type="number" min="1" max="200" className="form-input" value={max} onChange={(e) => setMax(e.target.value)} />
                  <p className="text-[11px] text-slate-400 mt-1">{t('Auto /100 pour EN, /' + geMax + ' pour ES.', 'Auto /100 for EN, /' + geMax + ' for ES.', 'Auto según sistema.')}</p>
                </div>
              </div>
              <div>
                <label className="form-label">{t('Enseignant (appliqué à toutes)', 'Teacher (applied to all)', 'Profesor')}</label>
                <select className="form-input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  <option value="">— {t('Aucun', 'None', 'Ninguno')} —</option>
                  {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <button onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold">{step === 0 ? t('Annuler', 'Cancel') : t('← Retour', '← Back')}</button>
          {step < 2 ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40">{t('Suivant →', 'Next →')}</button>
          ) : (
            <button onClick={finish} disabled={saving || classIds.length === 0} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40">
              {saving ? t('Création…', 'Creating…') : `${t('Créer', 'Create')} (${classIds.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Carte matière agrégée (par nom, toutes classes) ──────────────────────────
function AggSubjectCard({ agg, classes, teachers, onEdit, onDelete, onAddClass }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const classNameById = (id) => classes.find((c) => c.id === id)?.name || '—';
  const teacherNameById = (id) => teachers.find((x) => x.id === id)?.name || null;

  const coefArr = [...agg.coefs];
  const coefLabel = coefArr.length === 1 ? coefArr[0] : `${Math.min(...coefArr)}–${Math.max(...coefArr)}`;
  const maxArr = [...agg.maxes];
  const maxLabel = maxArr.length === 1 ? `/${maxArr[0]}` : t('mixte', 'mixed', 'mixto');
  const noTeacher = agg.rows.filter((r) => !r.teacher_id).length;
  const missingCoef = agg.rows.some((r) => !r.coef);

  const status = (!agg.cat || missingCoef) ? 'red' : noTeacher > 0 ? 'yellow' : 'green';
  const STATUS = {
    green:  { dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700', label: t('Complète', 'Complete', 'Completa') },
    yellow: { dot: 'bg-amber-500',  cls: 'bg-amber-50 text-amber-700',     label: t('À compléter', 'To complete', 'Por completar') },
    red:    { dot: 'bg-red-500',    cls: 'bg-red-50 text-red-700',         label: t('Action requise', 'Action required', 'Acción requerida') },
  }[status];

  const alerts = [];
  if (!agg.cat) alerts.push(t('Catégorie manquante', 'Missing category', 'Sin categoría'));
  if (noTeacher > 0) alerts.push(`${noTeacher} ${t('sans enseignant', 'no teacher', 'sin profesor')}`);
  if (missingCoef) alerts.push(t('Coefficient manquant', 'Missing coefficient', 'Sin coeficiente'));

  const teacherNames = [...agg.teacherIds].map(teacherNameById).filter(Boolean);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all flex flex-col">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 truncate">{agg.name}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{agg.cat?.name || t('Non catégorisée', 'Uncategorized', 'Sin categoría')}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${STATUS.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS.dot}`} />{STATUS.label}
        </span>
      </div>

      <div className="px-5 flex flex-wrap gap-1.5">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-100">{t('Coef', 'Coef', 'Coef')} {coefLabel}</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-100">{t('Barème', 'Scale', 'Escala')} {maxLabel}</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-100">{agg.classes.size} {t('classe', 'class', 'clase')}{agg.classes.size !== 1 ? 's' : ''}</span>
      </div>

      <div className="px-5 py-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">👨‍🏫 </span>
        {teacherNames.length ? teacherNames.join(', ') : <span className="text-amber-600">{t('Aucun enseignant', 'No teacher', 'Sin profesor')}</span>}
      </div>

      {alerts.length > 0 && (
        <div className="px-5 pb-2 flex flex-wrap gap-1.5">
          {alerts.map((a) => <span key={a} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">⚠ {a}</span>)}
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} className="px-5 py-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 text-left border-t border-slate-50 mt-auto">
        {open ? t('▾ Masquer les classes', '▾ Hide classes', '▾ Ocultar') : `▸ ${t('Voir / éditer les classes', 'View / edit classes', 'Ver clases')}`}
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-1.5">
          {agg.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
              <span className="flex-1 min-w-0 truncate font-medium text-slate-700">{classNameById(r.class_id)}</span>
              <span className="text-xs text-slate-400">{r.teacher_id ? teacherNameById(r.teacher_id) : <span className="text-amber-600">{t('—', '—')}</span>}</span>
              <button onClick={() => onEdit(r)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t('Éditer', 'Edit', 'Editar')}</button>
              <button onClick={() => { if (window.confirm(t('Supprimer ?', 'Delete?', '¿Eliminar?'))) onDelete(r.id); }} className="text-xs font-semibold text-red-500 hover:text-red-700">✕</button>
            </div>
          ))}
          <button onClick={onAddClass} className="text-xs font-semibold text-slate-500 hover:text-indigo-600">+ {t('Ajouter à une classe', 'Add to a class', 'Añadir a clase')}</button>
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Subjects() {
  const t = useT();

  const DEFAULT_CATEGORIES = [
    {
      id: 'sci-exactes',
      name: t('Sciences Exactes', 'Exact Sciences'),
      ordre: 1,
      description: t('Mathématiques, Physique, Chimie, Sciences de la Vie et de la Terre', 'Mathematics, Physics, Chemistry, Life and Earth Sciences'),
      keywords: ['mathématiques', 'maths', 'physique', 'chimie', 'svt', 'sciences de la vie', 'sciences naturelles', 'sciences physiques', 'biologie'],
    },
    {
      id: 'langues',
      name: t('Langues', 'Languages'),
      ordre: 2,
      description: t('Français, Anglais, Langue nationale, Langues étrangères', 'French, English, National Language, Foreign Languages'),
      keywords: ['français', 'anglais', 'espagnol', 'allemand', 'arabe', 'langue'],
    },
    {
      id: 'sci-humaines',
      name: t('Sciences Humaines', 'Social Sciences'),
      ordre: 3,
      description: t('Histoire, Géographie, Philosophie, Instruction Civique et Morale', 'History, Geography, Philosophy, Civic and Moral Education'),
      keywords: ['histoire', 'géographie', 'hist-geo', 'histoire-géographie', 'philosophie', 'instruction civique', 'éducation civique', 'civique'],
    },
    {
      id: 'tech',
      name: t('Techniques et Technologies', 'Technology & Engineering'),
      ordre: 4,
      description: t('Informatique, Technologie, Arts et Métiers, Sciences Techniques', 'Computer Science, Technology, Crafts, Technical Sciences'),
      keywords: ['informatique', 'technologie', 'arts et métiers', 'sciences techniques', 'technique'],
    },
    {
      id: 'arts-sports',
      name: t('Arts et Sports', 'Arts & Sports'),
      ordre: 5,
      description: t('Éducation Physique et Sportive, Éducation Artistique, Musique', 'Physical Education, Arts Education, Music'),
      keywords: ['eps', 'éducation physique', 'sport', 'arts plastiques', 'musique', 'éducation artistique'],
    },
    {
      id: 'formation-pro',
      name: t('Formation Professionnelle', 'Vocational Training'),
      ordre: 6,
      description: t('Enseignement technique et professionnel, Stages pratiques', 'Technical and vocational education, Internships'),
      keywords: ['formation', 'stage', 'professionnel', 'comptabilité', 'commerce'],
    },
    {
      id: 'eveil',
      name: t('Éveil et Développement', 'Early Learning & Development'),
      ordre: 7,
      description: t("Sciences d'Observation, Activités pratiques (pour les petites classes)", "Observation Sciences, Practical Activities (for early grades)"),
      keywords: ["sciences d'observation", 'éveil', 'activités pratiques', 'dessin', 'lecture'],
    },
  ];

  const school        = useAuthStore((s) => s.school);
  const doUpdateSchool = useAuthStore((s) => s.doUpdateSchool);

  const classes       = useSchoolStore((s) => s.classes);
  const subjects      = useSchoolStore((s) => s.subjects);
  const teachers      = useSchoolStore((s) => s.teachers);
  const addSubject    = useSchoolStore((s) => s.addSubject);
  const updateSubject = useSchoolStore((s) => s.updateSubject);
  const deleteSubject = useSchoolStore((s) => s.deleteSubject);

  const [tab,           setTab]          = useState('matieres');
  const [showForm,      setShowForm]     = useState(false);
  const [showWizard,    setShowWizard]   = useState(false);
  const [editing,       setEditing]      = useState(null);
  const [prefillCatId,  setPrefillCatId] = useState('');
  const [showAddCat,    setShowAddCat]   = useState(false);
  const [newCat,        setNewCat]       = useState({ name: '', description: '' });
  const [savingCat,     setSavingCat]    = useState(false);
  const [search,        setSearch]       = useState('');
  const [classFilter,   setClassFilter]  = useState('');
  const [familyF,       setFamilyF]      = useState('all');

  // Categories: from school settings, fallback to defaults
  const savedCats = Array.isArray(school?.subject_categories) && school.subject_categories.length > 0
    ? school.subject_categories
    : DEFAULT_CATEGORIES;
  const categories = [...savedCats].sort((a, b) => a.ordre - b.ordre);

  // Stats
  const activeSubjects  = subjects;
  const avgCoef         = activeSubjects.length
    ? Math.round(activeSubjects.reduce((s, x) => s + x.coef, 0) / activeSubjects.length)
    : 0;
  const classesWithSubs = new Set(activeSubjects.map((s) => s.class_id)).size;

  // Search + class filter
  const isFiltering = search.trim() !== '' || classFilter !== '';
  const filteredSubjects = isFiltering
    ? activeSubjects.filter((s) => {
        const matchName  = search.trim() === '' || s.name.toLowerCase().includes(search.trim().toLowerCase());
        const matchClass = classFilter === '' || s.class_id === classFilter;
        return matchName && matchClass;
      })
    : activeSubjects;

  // Group subjects by category
  const subjectsForCategory = (catId) =>
    filteredSubjects.filter((s) => {
      const cat = getSubjectCategory(s, categories);
      return cat?.id === catId;
    });

  // Subjects not in any category
  const uncategorized = filteredSubjects.filter((s) => !getSubjectCategory(s, categories));

  const handleSave = async (form) => {
    if (editing) {
      await updateSubject(editing.id, form);
      setEditing(null);
    } else {
      await addSubject(form);
      setShowForm(false);
    }
    setPrefillCatId('');
  };

  const handleCreateMany = async (rows) => {
    for (const r of rows) await addSubject(r);
    setShowWizard(false);
    setPrefillCatId('');
  };

  const handleAddSubjectInCategory = (catId) => {
    setPrefillCatId(catId);
    setEditing(null);
    setShowWizard(true);
  };

  const handleEditSubject = (sub) => {
    setEditing(sub);
    setShowForm(false);
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCat.name.trim()) return;
    setSavingCat(true);
    const newEntry = {
      id:          `cat-${Date.now()}`,
      name:        newCat.name.trim(),
      description: newCat.description.trim(),
      ordre:       categories.length + 1,
      keywords:    [],
    };
    const updated = [...savedCats, newEntry];
    await doUpdateSchool({ subject_categories: updated });
    setNewCat({ name: '', description: '' });
    setShowAddCat(false);
    setSavingCat(false);
  };

  // ── Cockpit : KPIs, familles, agrégation par nom ──────────────────────────
  const catNameOf = (s) => getSubjectCategory(s, categories)?.name || '';
  const kpiTeachers  = new Set(subjects.filter((s) => s.teacher_id).map((s) => s.teacher_id)).size;
  const kpiNoTeacher = subjects.filter((s) => !s.teacher_id).length;

  const cockpitRows = subjects.filter((s) => {
    const q = search.trim().toLowerCase();
    if (q && !s.name.toLowerCase().includes(q)) return false;
    if (classFilter && s.class_id !== classFilter) return false;
    if (familyF === 'noteacher') return !s.teacher_id;
    if (familyF !== 'all' && subjectFamily(s.name, catNameOf(s)) !== familyF) return false;
    return true;
  });

  const aggregated = (() => {
    const map = {};
    cockpitRows.forEach((s) => {
      const cat = getSubjectCategory(s, categories);
      const k = s.name.toLowerCase();
      (map[k] ||= { name: s.name, rows: [], classes: new Set(), teacherIds: new Set(), coefs: new Set(), maxes: new Set(), cat: null });
      const m = map[k];
      m.rows.push(s); m.classes.add(s.class_id);
      if (s.teacher_id) m.teacherIds.add(s.teacher_id);
      m.coefs.add(s.coef); m.maxes.add(s.max);
      if (!m.cat && cat) m.cat = cat;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const alertRows = subjects.map((s) => {
    const issues = [];
    if (!s.teacher_id) issues.push(t('Aucun enseignant', 'No teacher', 'Sin profesor'));
    if (!s.coef) issues.push(t('Coefficient manquant', 'Missing coefficient', 'Sin coeficiente'));
    if (!getSubjectCategory(s, categories)) issues.push(t('Catégorie manquante', 'Missing category', 'Sin categoría'));
    return { s, issues };
  }).filter((x) => x.issues.length);

  const teacherGroups = teachers.map((tc) => ({ tc, subs: subjects.filter((s) => s.teacher_id === tc.id) }));

  const FAMILIES = [
    { id: 'all',         label: t('Toutes', 'All', 'Todas') },
    { id: 'sciences',    label: t('Sciences', 'Sciences', 'Ciencias') },
    { id: 'litteraires', label: t('Littéraires', 'Humanities', 'Letras') },
    { id: 'techniques',  label: t('Techniques', 'Technical', 'Técnicas') },
    { id: 'noteacher',   label: t('Sans enseignant', 'No teacher', 'Sin profesor') },
  ];
  const TABS = [
    { id: 'matieres',    label: t('Matières', 'Subjects', 'Asignaturas') },
    { id: 'enseignants', label: t('Enseignants', 'Teachers', 'Profesores') },
    { id: 'categories',  label: t('Catégories', 'Categories', 'Categorías') },
    { id: 'alertes',     label: `${t('Alertes', 'Alerts', 'Alertas')}${alertRows.length ? ` (${alertRows.length})` : ''}` },
  ];

  return (
    <Layout>
      <div className="max-w-6xl">
        {/* HEADER */}
        <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('Gestion des matières', 'Subjects', 'Asignaturas')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t("Cockpit pédagogique : matières, enseignants, catégories et alertes.", 'Teaching cockpit: subjects, teachers, categories and alerts.', 'Cabina pedagógica.')}</p>
          </div>
          <button onClick={() => { setPrefillCatId(''); setShowWizard(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors">
            + {t('Nouvelle matière', 'New subject', 'Nueva asignatura')}
          </button>
        </div>

        {/* KPI DASHBOARD */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { emoji: '📚', tone: 'bg-indigo-50', value: subjects.length, label: t('Total matières', 'Total subjects', 'Asignaturas') },
            { emoji: '👨‍🏫', tone: 'bg-emerald-50', value: kpiTeachers, label: t('Enseignants assignés', 'Teachers assigned', 'Profesores') },
            { emoji: '⚠️', tone: kpiNoTeacher ? 'bg-red-50' : 'bg-slate-50', value: kpiNoTeacher, label: t('Sans enseignant', 'Without teacher', 'Sin profesor') },
            { emoji: '🏫', tone: 'bg-sky-50', value: classesWithSubs, label: t('Classes configurées', 'Classes configured', 'Clases') },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-2xl border border-slate-200/70 p-4 shadow-sm">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${c.tone}`}>{c.emoji}</span>
              <div className={`text-2xl font-extrabold mt-2 ${c.label.includes('enseignant') && kpiNoTeacher ? 'text-red-600' : 'text-slate-900'}`}>{c.value}</div>
              <div className="text-xs text-slate-500">{c.label}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div className="flex gap-1 mb-5 border-b border-slate-200 overflow-x-auto no-scrollbar">
          {TABS.map((tb) => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === tb.id ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {tb.label}
            </button>
          ))}
        </div>

        {/* MODALES */}
        {showWizard && (
          <SubjectWizard categories={categories} classes={classes} teachers={teachers} school={school}
            prefillCatId={prefillCatId} onCreate={handleCreateMany} onClose={() => { setShowWizard(false); setPrefillCatId(''); }} />
        )}
        {(showForm || editing) && (
          <Modal title={editing ? t('Modifier la matière', 'Edit subject') : t('Nouvelle matière', 'New subject')}
            onClose={() => { setShowForm(false); setEditing(null); setPrefillCatId(''); }} size="md">
            <SubjectForm
              initial={editing ? editing : { ...(prefillCatId ? { category_id: prefillCatId } : {}), ...(classFilter ? { class_id: classFilter } : {}) }}
              classId={editing?.class_id || classFilter || ''}
              teachers={teachers} classes={classes} categories={categories} subjects={subjects}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditing(null); setPrefillCatId(''); }}
            />
          </Modal>
        )}

        {classes.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800 mb-5">
            {t('Aucune classe disponible.', 'No classes available.')} <a href="/app/classes" className="font-semibold underline">{t("Créez d'abord vos classes", 'Create your classes first')}</a> {t("avant d'ajouter des matières.", 'before adding subjects.')}
          </div>
        )}

        {/* ── TAB : MATIÈRES ── */}
        {tab === 'matieres' && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Rechercher…', 'Search…', 'Buscar…')}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                {FAMILIES.map((fam) => (
                  <button key={fam.id} onClick={() => setFamilyF(fam.id)}
                    className={`px-3 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition-colors ${familyF === fam.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                    {fam.label}
                  </button>
                ))}
              </div>
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-indigo-400">
                <option value="">{t('Toutes les classes', 'All classes', 'Todas las clases')}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {aggregated.length === 0 && (
                <div className="col-span-full bg-white rounded-xl border border-slate-100 p-10 text-center text-sm text-slate-400">
                  {t('Aucune matière ne correspond aux filtres.', 'No subject matches the filters.', 'Sin resultados.')}
                </div>
              )}
              {aggregated.map((agg) => (
                <AggSubjectCard key={agg.name} agg={agg} classes={classes} teachers={teachers}
                  onEdit={handleEditSubject} onDelete={deleteSubject} onAddClass={() => { setPrefillCatId(agg.cat?.id || ''); setShowWizard(true); }} />
              ))}
            </div>
          </>
        )}

        {/* ── TAB : ENSEIGNANTS ── */}
        {tab === 'enseignants' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {kpiNoTeacher > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="font-bold text-red-700 text-sm">⚠ {kpiNoTeacher} {t('matière(s) sans enseignant', 'subject(s) without teacher', 'sin profesor')}</p>
                <p className="text-xs text-red-500 mt-1">{t('Assignez-les pour activer le suivi.', 'Assign them to enable monitoring.', 'Asígnelos.')}</p>
              </div>
            )}
            {teacherGroups.map(({ tc, subs }) => {
              const cls = new Set(subs.map((s) => s.class_id));
              return (
                <div key={tc.id} className="bg-white rounded-2xl border border-slate-200/70 p-4 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{tc.name.slice(0, 2).toUpperCase()}</div>
                    <p className="font-semibold text-slate-900 truncate">{tc.name}</p>
                  </div>
                  <p className="text-sm text-slate-500 mt-3"><strong className="text-slate-800">{subs.length}</strong> {t('matière(s)', 'subject(s)', 'asig.')} · <strong className="text-slate-800">{cls.size}</strong> {t('classe(s)', 'class(es)', 'clases')}</p>
                  {subs.length > 0 && <p className="text-xs text-slate-400 mt-1 truncate">{[...new Set(subs.map((s) => s.name))].join(', ')}</p>}
                </div>
              );
            })}
            {teachers.length === 0 && <div className="col-span-full text-sm text-slate-400 text-center py-8">{t('Aucun enseignant configuré.', 'No teachers configured.', 'Sin profesores.')}</div>}
          </div>
        )}

        {/* ── TAB : CATÉGORIES ── */}
        {tab === 'categories' && (
          <>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{t('Catégories des matières', 'Subject categories', 'Categorías')}</h2>
              <button onClick={() => setShowAddCat((v) => !v)} className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold">+ {t('Ajouter une catégorie', 'Add category', 'Añadir')}</button>
            </div>
            {showAddCat && (
              <form onSubmit={handleAddCategory} className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="form-label">{t('Nom *', 'Name *')}</label>
                  <input type="text" required className="form-input" placeholder={t('Ex : Nouvelles Technologies', 'E.g. New Technologies')} value={newCat.name} onChange={(e) => setNewCat((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="flex-[2] min-w-[250px]">
                  <label className="form-label">{t('Description', 'Description')}</label>
                  <input type="text" className="form-input" placeholder={t('Ex : Informatique, Robotique…', 'E.g. Computer science, Robotics…')} value={newCat.description} onChange={(e) => setNewCat((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingCat} className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">{savingCat ? '…' : t('Ajouter', 'Add')}</button>
                  <button type="button" onClick={() => setShowAddCat(false)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold">{t('Annuler', 'Cancel')}</button>
                </div>
              </form>
            )}
            <div className="space-y-3">
              {categories.map((cat) => (
                <CategoryCard key={cat.id} category={cat} subjects={subjectsForCategory(cat.id)} classes={classes} teachers={teachers}
                  onAddSubject={handleAddSubjectInCategory} onEditSubject={handleEditSubject} onDeleteSubject={deleteSubject} />
              ))}
              {uncategorized.length > 0 && (
                <CategoryCard category={{ id: '__none__', name: t('Non catégorisées', 'Uncategorized'), ordre: 99, description: t('Matières sans catégorie assignée', 'Subjects with no assigned category'), keywords: [] }}
                  subjects={uncategorized} classes={classes} teachers={teachers}
                  onAddSubject={() => { setShowWizard(true); }} onEditSubject={handleEditSubject} onDeleteSubject={deleteSubject} />
              )}
            </div>
          </>
        )}

        {/* ── TAB : ALERTES ── */}
        {tab === 'alertes' && (
          <div className="space-y-2">
            {alertRows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-sm text-emerald-600 font-semibold">{t('Aucune alerte. Toutes les matières sont configurées.', 'No alerts. All subjects are configured.', 'Sin alertas.')}</p>
              </div>
            ) : alertRows.map(({ s, issues }) => (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200/70 p-4 flex flex-wrap items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{s.name}</p>
                  <p className="text-xs text-slate-400">{classes.find((c) => c.id === s.class_id)?.name || '—'}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {issues.map((i) => <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">⚠ {i}</span>)}
                </div>
                <button onClick={() => handleEditSubject(s)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">{t('Configurer', 'Configure', 'Configurar')}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
