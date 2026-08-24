// Briques communes aux BLOCS du tableau de bord d'accueil.
// Aucune décision de rôle ici : ces composants ne savent pas QUI regarde
// (cf. src/lib/dashboardBlocks.js), ils savent seulement dessiner.

import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { getDaysUntilLicenseExpires } from '../../lib/auth';
import { IS_LAN } from '../../lib/edition';
import { resolveSchoolLogo, hasSchoolLogo } from '../../lib/schoolLogo';

// `units` : unités du complexe scolaire. Une école organisée en complexe pose
// souvent son logo sur l'unité plutôt que sur l'établissement — sans cela, le
// badge reste vide alors que le logo existe.
export function SchoolBadge({ school, units }) {
  const logoUrl = resolveSchoolLogo(school, units);
  return (
    <div className="flex items-center gap-3">
      {logoUrl && (
        <img
          src={logoUrl}
          alt={school?.name || 'Logo'}
          className="w-11 h-11 rounded-lg object-contain shrink-0 border border-slate-100"
        />
      )}
      <div className="leading-tight">
        <p className="font-semibold text-gray-800">{school?.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{school?.current_year || '—'}</p>
      </div>
    </div>
  );
}

export function LicenseBadge({ school }) {
  const t = useT();
  const daysLeft = getDaysUntilLicenseExpires(school?.license_expires_at);
  // LAN (.exe) : produit sous licence, jamais en « essai » — affiché actif.
  const status = IS_LAN ? 'active' : school?.license_status;

  if (status === 'trial' && daysLeft > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
        {t(`Essai gratuit — ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`,
           `Free trial — ${daysLeft} day${daysLeft > 1 ? 's' : ''} left`)}
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        {t('Licence active', 'Active license')}
      </span>
    );
  }
  if (daysLeft !== null && daysLeft <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        {t('Licence expirée', 'License expired')}
      </span>
    );
  }
  return null;
}

const STAT_ICONS = {
  classes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 14v3M16 14v3M12 14v3"/>
    </svg>
  ),
  students: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  pass: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  fees: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
};

const STAT_THEMES = {
  brand:  'bg-brand-50 text-brand-600',
  green:  'bg-emerald-50 text-emerald-600',
  amber:  'bg-amber-50 text-amber-600',
  purple: 'bg-purple-50 text-purple-600',
  rose:   'bg-rose-50 text-rose-600',
};

export function StatCard({ label, value, sub, accent = 'brand', icon, to }) {
  const inner = (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow h-full">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${STAT_THEMES[accent] || STAT_THEMES.brand}`}>
        {icon ? STAT_ICONS[icon] : null}
      </div>
      <div className="text-3xl font-bold text-gray-900 mt-4 tracking-tight tabular-nums">{value}</div>
      <div className="text-sm font-semibold text-gray-700 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

// Carte de section : un titre, un sous-titre, une action facultative.
export function BlockCard({ title, subtitle, action, tone = 'plain', children }) {
  const tones = {
    plain:  'bg-white border-gray-100',
    amber:  'bg-amber-50 border-amber-200',
    rose:   'bg-rose-50 border-rose-200',
    indigo: 'bg-indigo-50 border-indigo-200',
  };
  return (
    <section className={`rounded-xl border shadow-sm overflow-hidden ${tones[tone] || tones.plain}`}>
      <div className="px-6 py-4 border-b border-black/5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CountPill({ n, tone = 'amber' }) {
  const tones = {
    amber:   'bg-amber-200 text-amber-900',
    rose:    'bg-rose-200 text-rose-900',
    emerald: 'bg-emerald-200 text-emerald-900',
    slate:   'bg-slate-200 text-slate-700',
  };
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tones[tone] || tones.amber}`}>{n}</span>;
}

export function LoadingCard() {
  const t = useT();
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400 animate-pulse">
      {t('Chargement…', 'Loading…', 'Cargando…')}
    </div>
  );
}

export function EmptyHint({ children }) {
  return <p className="px-6 py-5 text-sm text-gray-400 italic">{children}</p>;
}

const SETUP_STEPS = [
  { key: 'year',      label: 'Année scolaire renseignée',   check: (s) => !!s.school?.current_year,  to: '/app/settings', hint: 'Ex : 2025-2026' },
  { key: 'type',      label: "Type d'établissement défini",  check: (s) => !!s.school?.type,          to: '/app/settings', hint: 'Public, Privé…' },
  { key: 'region',    label: 'Région / Département saisis',  check: (s) => !!s.school?.region,        to: '/app/settings', hint: 'Localisation officielle' },
  { key: 'director',  label: 'Directeur / Proviseur renseigné', check: (s) => !!s.school?.director,   to: '/app/settings', hint: 'Apparaît sur les bulletins' },
  // Le logo compte comme fourni qu'il soit posé sur l'établissement OU sur une
  // unité du complexe scolaire : sinon l'étape reste éternellement à cocher pour
  // une école qui l'a déjà téléversé côté complexe.
  { key: 'logo',      label: "Logo de l'école téléversé",    check: (s) => hasSchoolLogo(s.school, s.units), to: '/app/settings', hint: 'PNG ou SVG recommandé' },
  { key: 'class',     label: 'Au moins une classe créée',    check: (s) => s.classes.length > 0,      to: '/app/classes',  hint: 'Ex : 6ème A, Form 1…' },
  { key: 'subject',   label: 'Au moins une matière ajoutée', check: (s) => s.subjects.length > 0,     to: '/app/classes',  hint: 'Ex : Mathématiques' },
  { key: 'student',   label: 'Au moins un élève inscrit',    check: (s) => s.students.length > 0,     to: '/app/students', hint: 'Importer ou ajouter manuellement' },
];

const SETUP_STEPS_EN = [
  { label: 'Academic year set',             hint: 'E.g. 2025-2026' },
  { label: 'Institution type defined',      hint: 'Public, Private…' },
  { label: 'Region / Department filled',    hint: 'Official location' },
  { label: 'Principal / Director set',      hint: 'Appears on report cards' },
  { label: 'School logo uploaded',          hint: 'PNG or SVG recommended' },
  { label: 'At least one class created',    hint: 'E.g. 6th A, Form 1…' },
  { label: 'At least one subject added',    hint: 'E.g. Mathematics' },
  { label: 'At least one student enrolled', hint: 'Import or add manually' },
];

export function SetupChecklist({ school, classes, subjects, students, units }) {
  const t = useT();
  const ctx = { school, classes, subjects, students, units };

  const results = SETUP_STEPS.map((step, i) => ({
    ...step,
    labelT: t(step.label, SETUP_STEPS_EN[i].label),
    hintT:  t(step.hint,  SETUP_STEPS_EN[i].hint),
    done: step.check(ctx),
  }));
  const done  = results.filter((r) => r.done).length;
  const total = results.length;
  if (done === total) return null;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="bg-white rounded-xl border border-brand-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('Guide de démarrage', 'Getting started')}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{done} {t('sur', 'of')} {total} {t('étapes complétées', 'steps completed')}</p>
        </div>
        <div className="flex items-center gap-3 min-w-[140px]">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-bold text-brand-600 w-8 text-right">{pct}%</span>
        </div>
      </div>
      <div className="divide-y divide-slate-50">
        {results.map((step) => (
          <div key={step.key} className={`flex items-center gap-4 px-6 py-3 ${step.done ? 'opacity-50' : 'hover:bg-slate-50'} transition-colors`}>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${step.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
              {step.done && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7"/>
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium ${step.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{step.labelT}</span>
              {!step.done && <p className="text-xs text-gray-400 mt-0.5">{step.hintT}</p>}
            </div>
            {!step.done && (
              <Link to={step.to} className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline">
                {t('Configurer →', 'Set up →')}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
