import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';


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
function SubjectForm({ initial, classId, teachers, classes, categories, onSave, onCancel }) {
  const t = useT();
  const [form, setForm] = useState({
    name: '', coef: 1, max: 20, class_id: classId || '', teacher_id: '', category_id: '',
    ...initial,
  });
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      coef:       Number(form.coef),
      max:        Number(form.max),
      teacher_id: form.teacher_id  || null,
      category_id: form.category_id || null,
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-5">
      <h3 className="text-base font-semibold text-gray-800 mb-4">
        {initial?.id ? t('Modifier la matière', 'Edit subject') : t('Nouvelle matière', 'New subject')}
      </h3>
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
          <input type="number" required min="1" max="10" className="form-input"
            value={form.coef} onChange={set('coef')} />
        </div>
        <div>
          <label className="form-label">{t('Barème *', 'Max score *')}</label>
          <select required className="form-input" value={form.max} onChange={set('max')}>
            <option value={20}>{t('/ 20 (système FR)', '/ 20 (FR system)')}</option>
            <option value={100}>{t('/ 100 (système EN)', '/ 100 (EN system)')}</option>
          </select>
        </div>
        <div>
          <label className="form-label">{t('Enseignant', 'Teacher')}</label>
          <select className="form-input" value={form.teacher_id || ''} onChange={set('teacher_id')}>
            <option value="">— {t('Aucun', 'None')} —</option>
            {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
          </select>
        </div>
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

  const [tab,           setTab]          = useState('actives');
  const [showForm,      setShowForm]     = useState(false);
  const [editing,       setEditing]      = useState(null);
  const [prefillCatId,  setPrefillCatId] = useState('');
  const [showAddCat,    setShowAddCat]   = useState(false);
  const [newCat,        setNewCat]       = useState({ name: '', description: '' });
  const [savingCat,     setSavingCat]    = useState(false);
  const [search,        setSearch]       = useState('');
  const [classFilter,   setClassFilter]  = useState('');

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

  const handleAddSubjectInCategory = (catId) => {
    setPrefillCatId(catId);
    setEditing(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditSubject = (sub) => {
    setEditing(sub);
    setShowForm(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  return (
    <Layout>
      <div className="max-w-4xl">

        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex justify-between items-start gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Gestion des Matières', 'Subjects')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('Configuration et gestion des matières enseignées', 'Configure and manage taught subjects')}</p>
          </div>
          {!showForm && !editing && (
            <button onClick={() => { setShowForm(true); setEditing(null); }}
              className="btn-primary" style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
              + {t('Nouvelle matière', 'New subject')}
            </button>
          )}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          {['actives', 'supprimees'].map((tabKey) => (
            <button key={tabKey} onClick={() => setTab(tabKey)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === tabKey
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tabKey === 'actives' ? t('Actives', 'Active') : t('Supprimées', 'Deleted')}
            </button>
          ))}
        </div>

        {tab === 'supprimees' && (
          <div className="bg-white rounded-xl p-10 text-center shadow-sm border border-gray-100 mb-6">
            <p className="text-gray-400 text-sm">{t('La suppression définitive est immédiate — aucune matière archivée.', 'Deletion is permanent — no subjects are archived.')}</p>
          </div>
        )}

        {tab === 'actives' && (
          <>
            {/* ── Stats ─────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: t('Total matières', 'Total subjects'),         value: activeSubjects.length },
                { label: t('Coefficient moyen', 'Average coefficient'), value: avgCoef },
                { label: t('Classes utilisatrices', 'Classes using'),   value: classesWithSubs },
              ].map(({ label, value }) => (
                <div key={label}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-center">
                  <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            {/* ── Search & filter ───────────────────────────────── */}
            <div className="flex flex-wrap gap-3 mb-5">
              <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={t('Rechercher une matière…', 'Search subjects…')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="form-input pl-9"
                />
              </div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="form-input"
                style={{ width: 'auto', minWidth: '160px' }}
              >
                <option value="">{t('Toutes les classes', 'All classes')}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {isFiltering && (
                <button
                  onClick={() => { setSearch(''); setClassFilter(''); }}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                >
                  {t('✕ Effacer', '✕ Clear')}
                </button>
              )}
            </div>
            {isFiltering && (
              <p className="text-xs text-gray-400 mb-4">
                {filteredSubjects.length} {t(
                  `résultat${filteredSubjects.length !== 1 ? 's' : ''} trouvé${filteredSubjects.length !== 1 ? 's' : ''}`,
                  `result${filteredSubjects.length !== 1 ? 's' : ''} found`
                )}
              </p>
            )}

            {/* ── Add / Edit form ────────────────────────────────── */}
            {(showForm || editing) && (
              <SubjectForm
                initial={editing
                  ? editing
                  : {
                      ...(prefillCatId ? { category_id: prefillCatId } : {}),
                      ...(classFilter  ? { class_id: classFilter }     : {}),
                    }
                }
                classId={editing?.class_id || classFilter || ''}
                teachers={teachers}
                classes={classes}
                categories={categories}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditing(null); setPrefillCatId(''); }}
              />
            )}

            {/* ── Category sections ──────────────────────────────── */}
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">
                {t('Catégories des matières', 'Subject categories')}
              </h2>
              <button onClick={() => setShowAddCat((v) => !v)}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                + {t('Ajouter une catégorie', 'Add category')}
              </button>
            </div>

            {/* Add category form */}
            {showAddCat && (
              <form onSubmit={handleAddCategory}
                className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="form-label">{t('Nom *', 'Name *')}</label>
                  <input type="text" required className="form-input" placeholder={t('Ex : Nouvelles Technologies', 'E.g. New Technologies')}
                    value={newCat.name} onChange={(e) => setNewCat((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="flex-[2] min-w-[250px]">
                  <label className="form-label">{t('Description', 'Description')}</label>
                  <input type="text" className="form-input" placeholder={t('Ex : Informatique, Robotique…', 'E.g. Computer science, Robotics…')}
                    value={newCat.description}
                    onChange={(e) => setNewCat((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingCat} className="btn-primary"
                    style={{ width: 'auto', paddingLeft: '1.25rem', paddingRight: '1.25rem' }}>
                    {savingCat ? '…' : t('Ajouter', 'Add')}
                  </button>
                  <button type="button" onClick={() => setShowAddCat(false)} className="btn-secondary">
                    {t('Annuler', 'Cancel')}
                  </button>
                </div>
              </form>
            )}

            {/* Category cards */}
            <div className="space-y-3">
              {categories.map((cat) => {
                const catSubjects = subjectsForCategory(cat.id);
                if (isFiltering && catSubjects.length === 0) return null;
                return (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    subjects={catSubjects}
                    classes={classes}
                    teachers={teachers}
                    forceOpen={isFiltering}
                    onAddSubject={handleAddSubjectInCategory}
                    onEditSubject={handleEditSubject}
                    onDeleteSubject={deleteSubject}
                  />
                );
              })}

              {/* Uncategorized */}
              {uncategorized.length > 0 && (
                <CategoryCard
                  category={{ id: '__none__', name: t('Non catégorisées', 'Uncategorized'), ordre: 99, description: t('Matières sans catégorie assignée', 'Subjects with no assigned category'), keywords: [] }}
                  subjects={uncategorized}
                  classes={classes}
                  teachers={teachers}
                  forceOpen={isFiltering}
                  onAddSubject={() => { setShowForm(true); setEditing(null); }}
                  onEditSubject={handleEditSubject}
                  onDeleteSubject={deleteSubject}
                />
              )}

              {isFiltering && filteredSubjects.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
                  {t('Aucune matière ne correspond à votre recherche.', 'No subjects match your search.')}
                </div>
              )}
            </div>

            {classes.length === 0 && (
              <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
                {t('Aucune classe disponible.', 'No classes available.')} <a href="/app/classes" className="font-semibold underline">{t('Créez d\'abord vos classes', 'Create your classes first')}</a> {t('avant d\'ajouter des matières.', 'before adding subjects.')}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
