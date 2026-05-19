import { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';

// ── Table of contents ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 's1',  num: 1,  fr: 'Présentation',                en: 'Overview' },
  { id: 's2',  num: 2,  fr: 'Inscription & connexion',      en: 'Sign-up & login' },
  { id: 's3',  num: 3,  fr: 'Configuration initiale',       en: 'Initial setup' },
  { id: 's4',  num: 4,  fr: 'Tableau de bord',              en: 'Dashboard' },
  { id: 's5',  num: 5,  fr: 'Classes',                      en: 'Classes' },
  { id: 's6',  num: 6,  fr: 'Matières',                     en: 'Subjects' },
  { id: 's7',  num: 7,  fr: 'Élèves',                       en: 'Students' },
  { id: 's8',  num: 8,  fr: 'Saisie des notes',             en: 'Entering grades' },
  { id: 's9',  num: 9,  fr: 'Bulletins',                    en: 'Report cards' },
  { id: 's10', num: 10, fr: 'Absences',                     en: 'Attendance' },
  { id: 's11', num: 11, fr: 'Enseignants',                  en: 'Teachers' },
  { id: 's12', num: 12, fr: 'Frais scolaires',              en: 'School fees' },
  { id: 's13', num: 13, fr: 'Emploi du temps',              en: 'Timetable' },
  { id: 's14', num: 14, fr: 'Rapports',                     en: 'Reports' },
  { id: 's15', num: 15, fr: 'Conseil de classe',            en: 'Class council' },
  { id: 's16', num: 16, fr: 'Année académique',             en: 'Academic year' },
  { id: 's17', num: 17, fr: 'Paramètres',                   en: 'Settings' },
  { id: 's18', num: 18, fr: 'Rôles & accès',                en: 'Roles & access' },
  { id: 's19', num: 19, fr: 'Plans & fonctionnalités',      en: 'Plans & features' },
  { id: 's20', num: 20, fr: 'Mode hors ligne',              en: 'Offline mode' },
  { id: 's21', num: 21, fr: 'Questions fréquentes',         en: 'FAQ' },
];

// ── Small helpers ─────────────────────────────────────────────────────────────

function Section({ id, num, title, children }) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-7 h-7 rounded-lg bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
          {num}
        </span>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      </div>
      <div className="space-y-4 text-sm text-slate-700 leading-relaxed pl-10">
        {children}
      </div>
    </section>
  );
}

function H3({ children }) {
  return <h3 className="font-semibold text-slate-900 mt-5 mb-1.5">{children}</h3>;
}

function Note({ children, type = 'info' }) {
  const styles = {
    info:    'bg-blue-50   border-blue-200   text-blue-800',
    tip:     'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50  border-amber-200   text-amber-800',
  };
  const icons = { info: 'ℹ️', tip: '💡', warning: '⚠️' };
  return (
    <div className={`flex gap-2.5 border rounded-xl p-3.5 text-sm ${styles[type]}`}>
      <span className="shrink-0 text-base leading-5">{icons[type]}</span>
      <span>{children}</span>
    </div>
  );
}

function Steps({ steps }) {
  return (
    <ol className="space-y-2 list-none pl-0">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Tag({ children, color = 'gray' }) {
  const c = {
    gray:    'bg-slate-100 text-slate-600',
    green:   'bg-emerald-100 text-emerald-700',
    blue:    'bg-blue-100 text-blue-700',
    amber:   'bg-amber-100 text-amber-700',
    red:     'bg-red-100 text-red-700',
    violet:  'bg-violet-100 text-violet-700',
  };
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${c[color]}`}>
      {children}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Help() {
  const t = useT();
  const [active, setActive] = useState('s1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef(null);

  // Highlight TOC entry as user scrolls
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: '-20% 0px -75% 0px' }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileOpen(false);
  };

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('Guide d\'utilisation', 'User Guide')}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {t('Tout ce dont vous avez besoin pour utiliser NotesCam.', 'Everything you need to use NotesCam.')}
          </p>
        </div>
        {/* Mobile TOC toggle */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/>
          </svg>
          {t('Sommaire', 'Contents')}
        </button>
      </div>

      {/* Mobile TOC drawer */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-lg">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            {t('Sommaire', 'Contents')}
          </p>
          <div className="grid grid-cols-2 gap-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                  active === s.id
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="text-slate-300 mr-1">{s.num}.</span>
                {t(s.fr, s.en)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-8 items-start">
        {/* Desktop TOC — sticky */}
        <aside className="hidden lg:block w-52 shrink-0 sticky top-6 self-start">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2.5">
            {t('Sommaire', 'Contents')}
          </p>
          <nav className="space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                  active === s.id
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="text-[11px] text-slate-300 w-5 shrink-0 text-right">{s.num}.</span>
                <span className="truncate">{t(s.fr, s.en)}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main ref={mainRef} className="flex-1 min-w-0 space-y-12 pb-20">

          {/* ── 1 ── */}
          <Section id="s1" num={1} title={t('Présentation', 'Overview')}>
            <p>
              {t(
                'NotesCam est une plateforme de gestion scolaire conçue pour les établissements camerounais (primaire, secondaire, maternelle).',
                'NotesCam is a school management platform designed for Cameroonian schools (primary, secondary, nursery).',
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
              {[
                { icon: '🏫', title: t('Classes & matières', 'Classes & subjects'), desc: t('Organisez toute la structure pédagogique.', 'Organize your full academic structure.') },
                { icon: '✏️', title: t('Notes & bulletins', 'Grades & reports'), desc: t('Saisie, calcul automatique, impression PDF.', 'Entry, auto-calculation, PDF printing.') },
                { icon: '📶', title: t('Hors ligne', 'Offline'), desc: t('Fonctionne sans connexion, sync automatique.', 'Works without internet, auto-sync.') },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="text-2xl mb-2">{icon}</div>
                  <p className="font-semibold text-slate-800 text-sm mb-1">{title}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <p className="font-semibold text-slate-800 mb-2">{t('Systèmes pédagogiques supportés', 'Supported teaching systems')}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-500 font-semibold">
                      <th className="text-left px-3 py-2 rounded-l-lg">{t('Système', 'System')}</th>
                      <th className="text-left px-3 py-2">{t('Périodes', 'Periods')}</th>
                      <th className="text-left px-3 py-2 rounded-r-lg">{t('Barème', 'Scale')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr><td className="px-3 py-2">{t('Francophone', 'Francophone')}</td><td className="px-3 py-2">6 {t('séquences', 'sequences')}</td><td className="px-3 py-2">/20</td></tr>
                    <tr><td className="px-3 py-2">{t('Anglophone', 'Anglophone')}</td><td className="px-3 py-2">3 terms</td><td className="px-3 py-2">/100</td></tr>
                    <tr><td className="px-3 py-2">{t('Bilingue', 'Bilingual')}</td><td className="px-3 py-2">{t('Les deux', 'Both')}</td><td className="px-3 py-2">{t('Les deux', 'Both')}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          {/* ── 2 ── */}
          <Section id="s2" num={2} title={t('Inscription & connexion', 'Sign-up & login')}>
            <H3>{t('Créer un établissement (administrateur)', 'Create a school (administrator)')}</H3>
            <Steps steps={[
              t('Allez sur notescam.app → cliquez « Créer un établissement ».', 'Go to notescam.app → click "Create a school".'),
              t('Renseignez le nom, type, région et système d\'enseignement de l\'établissement.', 'Fill in the school name, type, region, and teaching system.'),
              t('Créez votre compte admin : nom complet, email, mot de passe (8 caractères min.).', 'Create your admin account: full name, email, password (8 chars min).'),
              t('Vérifiez votre boîte mail et cliquez le lien de confirmation pour activer le compte.', 'Check your inbox and click the confirmation link to activate the account.'),
            ]} />
            <Note type="tip">{t('Le plan Starter est gratuit et sans engagement. Aucune carte bancaire requise.', 'The Starter plan is free with no commitment. No credit card required.')}</Note>

            <H3>{t('Se connecter', 'Sign in')}</H3>
            <p>{t('Rendez-vous sur notescam.app/login, saisissez votre email et mot de passe.', 'Go to notescam.app/login, enter your email and password.')}</p>
            <p>{t('Mot de passe oublié ? Cliquez sur « Oublié ? » pour recevoir un lien de réinitialisation.', 'Forgot password? Click "Forgot?" to receive a reset link.')}</p>

            <H3>{t('Inscription enseignant', 'Teacher sign-up')}</H3>
            <Steps steps={[
              t('L\'administrateur communique le code établissement (8 caractères, visible dans Paramètres).', 'The admin shares the school code (8 characters, visible in Settings).'),
              t('L\'enseignant accède à notescam.app/teacher-signup.', 'The teacher goes to notescam.app/teacher-signup.'),
              t('Il saisit son nom, email, mot de passe et le code de l\'établissement.', 'They enter their name, email, password, and school code.'),
              t('Après connexion, il voit uniquement ses classes et matières assignées.', 'After login, they see only their assigned classes and subjects.'),
            ]} />
          </Section>

          {/* ── 3 ── */}
          <Section id="s3" num={3} title={t('Configuration initiale', 'Initial setup')}>
            <p>{t('À la première connexion, un assistant en 3 étapes guide la configuration de base.', 'On first login, a 3-step wizard guides the initial setup.')}</p>
            <div className="space-y-3 mt-2">
              {[
                {
                  step: t('Étape 1 — Première classe', 'Step 1 — First class'),
                  desc: t('Choisissez le cycle (Secondaire/Primaire/Maternelle), le système (FR/EN), le niveau et une section optionnelle.', 'Choose the cycle (Secondary/Primary/Nursery), system (FR/EN), level, and optional section.'),
                },
                {
                  step: t('Étape 2 — Matières', 'Step 2 — Subjects'),
                  desc: t('Une liste de matières recommandées s\'affiche. Cochez celles à activer et ajoutez des matières personnalisées si besoin.', 'A list of suggested subjects appears. Check the ones to activate and add custom ones if needed.'),
                },
                {
                  step: t('Étape 3 — Code établissement', 'Step 3 — School code'),
                  desc: t('Un code unique est généré. Partagez-le à vos enseignants via le bouton WhatsApp intégré.', 'A unique code is generated. Share it with your teachers via the built-in WhatsApp button.'),
                },
              ].map(({ step, desc }) => (
                <div key={step} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <p className="font-semibold text-slate-800 text-sm mb-1">{step}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
              ))}
            </div>
            <Note>{t('Vous pouvez ignorer l\'assistant et tout configurer manuellement depuis les menus.', "You can skip the wizard and configure everything manually from the menus.")}</Note>
          </Section>

          {/* ── 4 ── */}
          <Section id="s4" num={4} title={t('Tableau de bord', 'Dashboard')}>
            <H3>{t('Vue administrateur', 'Administrator view')}</H3>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('Statistiques globales : classes, élèves, enseignants.', 'Global stats: classes, students, teachers.')}</li>
              <li>{t('Élèves en difficulté : liste des élèves avec moyenne < 10/20.', 'Struggling students: list of students with average below 10/20.')}</li>
              <li>{t('Activité récente : dernières saisies de notes par enseignant.', 'Recent activity: latest grade entries by teacher.')}</li>
              <li>{t('Notifications : alertes de l\'équipe pédagogique.', 'Notifications: alerts from teaching staff.')}</li>
            </ul>
            <H3>{t('Vue enseignant', 'Teacher view')}</H3>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('Mes classes : liste des classes auxquelles l\'enseignant est affecté.', 'My classes: list of classes the teacher is assigned to.')}</li>
              <li>{t('Progression de saisie : taux de remplissage par classe et séquence.', 'Entry progress: completion rate per class and sequence.')}</li>
              <li>{t('Accès rapide vers la saisie de notes.', 'Quick access to grade entry.')}</li>
            </ul>
          </Section>

          {/* ── 5 ── */}
          <Section id="s5" num={5} title={t('Classes', 'Classes')}>
            <H3>{t('Créer une classe', 'Create a class')}</H3>
            <Steps steps={[
              t('Cliquez sur « + Nouvelle classe ».', 'Click "+ New class".'),
              t('Choisissez le cycle, le niveau, le système (FR/EN), la section (optionnel) et l\'effectif maximum.', 'Choose the cycle, level, system (FR/EN), section (optional), and maximum enrolment.'),
              t('Assignez un enseignant titulaire si souhaité.', 'Assign a head teacher if desired.'),
              t('Enregistrez. Le nom de classe est généré automatiquement (ex. « 6ème A »).', 'Save. The class name is auto-generated (e.g. "6ème A").'),
            ]} />
            <H3>{t('Fiche classe', 'Class detail')}</H3>
            <p>{t('Cliquez sur une classe pour accéder à sa fiche. Vous pouvez y gérer les matières, voir les élèves, consulter le taux de complétion des notes et accéder directement à la saisie.', 'Click a class to open its detail. You can manage subjects, view students, check grade completion, and jump to grade entry.')}</p>
            <Note type="warning">{t('Supprimer une classe supprime aussi toutes les matières, élèves et notes associés. Action irréversible.', 'Deleting a class also deletes all associated subjects, students, and grades. Irreversible.')}</Note>
          </Section>

          {/* ── 6 ── */}
          <Section id="s6" num={6} title={t('Matières', 'Subjects')}>
            <p>{t('Chaque matière est associée à une classe. Vous définissez son coefficient et son barème.', 'Each subject belongs to a class. You set its coefficient and scale.')}</p>
            <H3>{t('Ajouter une matière', 'Add a subject')}</H3>
            <Steps steps={[
              t('Sélectionnez la classe dans le menu déroulant.', 'Select the class from the dropdown.'),
              t('Cliquez sur « + Ajouter une matière ».', 'Click "+ Add a subject".'),
              t('Renseignez : nom, coefficient (ex. 4 pour Maths), barème (20 ou 100), enseignant assigné.', 'Fill in: name, coefficient (e.g. 4 for Maths), scale (20 or 100), assigned teacher.'),
            ]} />
            <Note type="warning">{t('Supprimer une matière supprime toutes les notes associées. Action irréversible.', 'Deleting a subject removes all associated grades. Irreversible.')}</Note>
          </Section>

          {/* ── 7 ── */}
          <Section id="s7" num={7} title={t('Élèves', 'Students')}>
            <H3>{t('Ajouter un élève', 'Add a student')}</H3>
            <p>{t('Cliquez sur « + Nouvel élève ». Seuls le nom et la classe sont obligatoires. Les informations personnelles, familiales et les contacts parentaux sont optionnels.', 'Click "+ New student". Only name and class are required. Personal, family, and parent contact info are optional.')}</p>

            <H3>{t('Importer via CSV', 'Import via CSV')}</H3>
            <Steps steps={[
              t('Cliquez sur « Importer CSV » et téléchargez le modèle.', 'Click "Import CSV" and download the template.'),
              t('Remplissez les colonnes : nom (obligatoire), classe (obligatoire), date_naissance, genre, matricule, parent_phone…', 'Fill the columns: nom (required), classe (required), date_naissance, genre, matricule, parent_phone…'),
              t('Importez le fichier. Les élèves sont créés automatiquement.', 'Import the file. Students are created automatically.'),
            ]} />

            <H3>{t('Fiche élève', 'Student profile')}</H3>
            <p>{t('La fiche affiche les informations personnelles, les notes par séquence, les bulletins générés, l\'historique des frais et un lien de portail parent.', 'The profile shows personal info, grades by sequence, generated reports, fee history, and a parent portal link.')}</p>

            <H3>{t('Portail parent', 'Parent portal')}</H3>
            <p>{t('Chaque élève dispose d\'un lien unique partageable aux parents. Ils accèdent en lecture seule aux notes et bulletins, sans créer de compte NotesCam.', 'Each student has a unique link shareable with parents. They can view grades and reports in read-only mode, without creating a NotesCam account.')}</p>
          </Section>

          {/* ── 8 ── */}
          <Section id="s8" num={8} title={t('Saisie des notes', 'Entering grades')}>
            <H3>{t('Sélectionner le contexte', 'Select context')}</H3>
            <p>{t('En haut de la page, choisissez la classe, la matière et la séquence (ou le terme).', 'At the top of the page, choose the class, subject, and sequence (or term).')}</p>
            <H3>{t('Saisir les notes', 'Enter grades')}</H3>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('Cliquez sur la cellule d\'un élève et saisissez la note.', 'Click on a student cell and enter the grade.')}</li>
              <li>{t('Appuyez sur Entrée ou Tab pour passer à l\'élève suivant.', 'Press Enter or Tab to move to the next student.')}</li>
              <li>{t('Saisissez « ABS » pour marquer un élève absent lors de la composition.', 'Type "ABS" to mark a student absent during the exam.')}</li>
            </ul>
            <Note type="tip">{t('Les notes sont sauvegardées automatiquement à chaque saisie, même hors ligne.', 'Grades are saved automatically on each entry, even offline.')}</Note>
            <H3>{t('Données spéciales (bulletin)', 'Special data (report)')}</H3>
            <p>{t('En bas du tableau, renseignez pour chaque élève : absences justifiées/non justifiées, conduite, mentions (Encouragement, Félicitation), avertissements, blâmes, décision du conseil.', 'At the bottom of the table, fill in per student: justified/unjustified absences, conduct, mentions (Encouragement, Commendation), warnings, reprimands, council decision.')}</p>
          </Section>

          {/* ── 9 ── */}
          <Section id="s9" num={9} title={t('Bulletins', 'Report cards')}>
            <H3>{t('Générer un bulletin', 'Generate a report card')}</H3>
            <Steps steps={[
              t('Sélectionnez la classe et la séquence.', 'Select the class and sequence.'),
              t('Choisissez un élève ou « Tous les élèves ».', 'Choose a student or "All students".'),
              t('Cliquez sur « Aperçu » pour visualiser, puis « Imprimer » pour générer le PDF.', 'Click "Preview" to view, then "Print" to generate the PDF.'),
            ]} />
            <H3>{t('Contenu du bulletin', 'Report card content')}</H3>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('En-tête de l\'établissement (logo, nom, région)', 'School header (logo, name, region)')}</li>
              <li>{t('Tableau des notes : matière, note, coefficient, note pondérée, rang, appréciation', 'Grade table: subject, grade, coefficient, weighted grade, rank, appreciation')}</li>
              <li>{t('Moyenne générale et rang dans la classe', 'Overall average and class rank')}</li>
              <li>{t('Absences, conduite, mentions, décision du conseil', 'Absences, conduct, mentions, council decision')}</li>
              <li>{t('Emplacement de signature du Directeur', 'Principal signature space')}</li>
            </ul>
            <H3>{t('Impression en masse', 'Bulk printing')}</H3>
            <p>{t('Pour imprimer tous les bulletins d\'une classe : sélectionnez la classe et la séquence → « Imprimer tous les bulletins ». Un PDF regroupé est généré, un bulletin par page.', 'To print all reports for a class: select the class and sequence → "Print all reports". A merged PDF is generated, one report per page.')}</p>
          </Section>

          {/* ── 10 ── */}
          <Section id="s10" num={10} title={t('Absences', 'Attendance')}>
            <div className="mb-3"><Tag color="blue">{t('Plan École et supérieur', 'École plan and above')}</Tag></div>
            <p>{t('Le module Absences suit les présences quotidiennes, distinct des absences aux compositions (gérées dans les notes).', 'The Attendance module tracks daily presence, separate from exam absences (managed in grades).')}</p>
            <H3>{t('Saisie des absences', 'Recording attendance')}</H3>
            <Steps steps={[
              t('Sélectionnez la classe, la date, la session (Matin / Après-midi / Journée entière) et optionnellement la matière.', 'Select class, date, session (Morning / Afternoon / Full day), and optionally the subject.'),
              t('Pour chaque élève, cliquez sur A (Absent), R (Retard) ou E (Excusé). Par défaut, tous les élèves sont présents.', 'For each student, click A (Absent), R (Late), or E (Excused). By default, all students are present.'),
              t('Cliquez sur « Enregistrer la saisie ».', 'Click "Save entry".'),
            ]} />
            <H3>{t('Statistiques', 'Statistics')}</H3>
            <p>{t('L\'onglet Statistiques récapitule, par plage de dates, le nombre d\'absences, retards et excuses par élève. Une icône ⚠️ signale les élèves avec 10 absences ou plus.', 'The Statistics tab summarizes, by date range, absences, lates, and excused absences per student. A ⚠️ icon flags students with 10 or more absences.')}</p>
          </Section>

          {/* ── 11 ── */}
          <Section id="s11" num={11} title={t('Enseignants', 'Teachers')}>
            <div className="mb-3"><Tag color="blue">{t('Plan École et supérieur', 'École plan and above')}</Tag></div>
            <H3>{t('Ajouter un enseignant manuellement', 'Add a teacher manually')}</H3>
            <p>{t('Cliquez sur « + Ajouter un enseignant » et renseignez son nom, spécialité et contact.', 'Click "+ Add a teacher" and fill in their name, specialty, and contact.')}</p>
            <Note>{t('Pour accéder à l\'application, l\'enseignant doit s\'inscrire via /teacher-signup avec le code établissement. Son compte sera automatiquement lié à sa fiche.', 'To access the app, the teacher must sign up at /teacher-signup with the school code. Their account will be auto-linked to their profile.')}</Note>
            <H3>{t('Assigner un enseignant', 'Assign a teacher')}</H3>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('Titulaire d\'une classe : fiche classe → champ Enseignant.', 'Class head: class detail → Teacher field.')}</li>
              <li>{t('Responsable d\'une matière : fiche matière → champ Enseignant.', 'Subject teacher: subject detail → Teacher field.')}</li>
            </ul>
            <H3>{t('Moniteur enseignants', 'Teacher monitor')}</H3>
            <p>{t('Le moniteur (menu Surveillance) donne à l\'administrateur un aperçu en temps réel : quels enseignants ont saisi des notes, pour quelles classes et séquences, et la date de dernière activité.', 'The monitor (Monitoring menu) gives the admin a real-time overview: which teachers entered grades, for which classes and sequences, and the last activity date.')}</p>
          </Section>

          {/* ── 12 ── */}
          <Section id="s12" num={12} title={t('Frais scolaires', 'School fees')}>
            <H3>{t('Enregistrer un paiement', 'Record a payment')}</H3>
            <Steps steps={[
              t('Ouvrez la fiche d\'un élève ou accédez au menu Frais scolaires.', 'Open a student profile or go to the School Fees menu.'),
              t('Cliquez sur « Modifier les frais ».', 'Click "Edit fees".'),
              t('Renseignez : frais annuels (montant dû), frais payés (montant réglé), date du dernier paiement et notes éventuelles.', 'Fill in: annual fees (amount due), fees paid (amount settled), last payment date, and optional notes.'),
              t('Cliquez sur « Imprimer le reçu » pour générer un reçu officiel au nom de l\'élève.', 'Click "Print receipt" to generate an official receipt in the student\'s name.'),
            ]} />
            <H3>{t('Vue d\'ensemble', 'Overview')}</H3>
            <p>{t('La page Frais affiche le total collecté, le total dû, et la liste des élèves avec leur statut : À jour, Partiel ou Non payé. Filtrez par classe ou statut.', 'The Fees page shows total collected, total due, and the student list with their status: Up to date, Partial, or Unpaid. Filter by class or status.')}</p>
          </Section>

          {/* ── 13 ── */}
          <Section id="s13" num={13} title={t('Emploi du temps', 'Timetable')}>
            <div className="mb-3"><Tag color="violet">{t('Plan Pro et supérieur', 'Pro plan and above')}</Tag></div>
            <Steps steps={[
              t('Sélectionnez la classe.', 'Select the class.'),
              t('Cliquez sur un créneau horaire dans la grille (lundi→vendredi).', 'Click on a time slot in the grid (Monday→Friday).'),
              t('Sélectionnez la matière et l\'enseignant pour ce créneau.', 'Select the subject and teacher for that slot.'),
            ]} />
            <p className="mt-2">{t('Les enseignants peuvent consulter leur propre emploi du temps depuis leur interface.', 'Teachers can view their own timetable from their interface.')}</p>
          </Section>

          {/* ── 14 ── */}
          <Section id="s14" num={14} title={t('Rapports', 'Reports')}>
            <p>{t('Les rapports permettent d\'analyser les performances globales de l\'établissement.', 'Reports let you analyze school-wide performance.')}</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>{t('Moyenne par classe — classement des classes par moyenne générale.', 'Average by class — class ranking by overall average.')}</li>
              <li>{t('Moyenne par matière — identifier les matières fortes et faibles.', 'Average by subject — identify strong and weak subjects.')}</li>
              <li>{t('Taux de réussite — pourcentage d\'élèves au-dessus de 10/20.', 'Pass rate — percentage of students above 10/20.')}</li>
              <li>{t('Comparaison séquences — évolution d\'une séquence à l\'autre.', 'Sequence comparison — trend from one sequence to another.')}</li>
            </ul>
            <Note type="tip">{t('Tous les rapports sont exportables en PDF.', 'All reports can be exported as PDF.')}</Note>
          </Section>

          {/* ── 15 ── */}
          <Section id="s15" num={15} title={t('Conseil de classe', 'Class council')}>
            <Steps steps={[
              t('Sélectionnez la classe et la séquence.', 'Select the class and sequence.'),
              t('La liste des élèves s\'affiche avec leur moyenne, rang et données comportementales.', 'The student list appears with their average, rank, and behavioural data.'),
              t('Saisissez la décision pour chaque élève : Passage, Redoublement, Renvoi…', 'Enter the decision for each student: Pass, Repeat, Expel…'),
              t('Ajoutez des appréciations générales. Les décisions apparaissent sur les bulletins.', 'Add general appreciations. Decisions appear on the report cards.'),
            ]} />
          </Section>

          {/* ── 16 ── */}
          <Section id="s16" num={16} title={t('Année académique', 'Academic year')}>
            <H3>{t('Promotion vers une nouvelle année', 'Promoting to a new year')}</H3>
            <p>{t('En fin d\'année, accédez au menu Année scolaire et cliquez sur « Promouvoir vers l\'année suivante ». L\'application va automatiquement :', 'At year-end, go to Academic Year and click "Promote to next year". The app will automatically:')}</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>{t('créer de nouvelles classes (ex. 6ème → 5ème) ;', 'create new classes (e.g. 6ème → 5ème);')}</li>
              <li>{t('copier les matières et coefficients dans les nouvelles classes ;', 'copy subjects and coefficients into the new classes;')}</li>
              <li>{t('transférer les élèves dans leur nouvelle classe ;', 'transfer students to their new class;')}</li>
              <li>{t('archiver les données des élèves diplômés.', 'archive graduating students\' data.')}</li>
            </ul>
            <H3>{t('Consulter les années passées', 'Browse past years')}</H3>
            <p>{t('Un sélecteur en haut à droite permet de basculer entre les années archivées pour consulter notes, bulletins et élèves en lecture seule.', 'A selector in the top right lets you switch between archived years to view grades, reports, and students in read-only mode.')}</p>
          </Section>

          {/* ── 17 ── */}
          <Section id="s17" num={17} title={t('Paramètres', 'Settings')}>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>{t('Établissement', 'School')}</strong> — {t('nom, type, région, directeur, logo (affiché sur les bulletins).', 'name, type, region, principal, logo (shown on reports).')}</li>
              <li><strong>{t('Code école', 'School code')}</strong> — {t('partagez ce code aux enseignants pour rejoindre l\'établissement.', 'share this code with teachers to join the school.')}</li>
              <li><strong>{t('Langue', 'Language')}</strong> — {t('basculez entre Français et English depuis le bas de la barre latérale.', 'toggle between French and English from the bottom of the sidebar.')}</li>
              <li><strong>{t('Synchronisation', 'Sync')}</strong> — {t('voir les opérations en attente, forcer une sync ou vider la file en cas de blocage.', 'view pending operations, force a sync, or clear the queue if stuck.')}</li>
            </ul>
          </Section>

          {/* ── 18 ── */}
          <Section id="s18" num={18} title={t('Rôles & accès', 'Roles & access')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="border border-slate-200 rounded-xl p-4">
                <p className="font-semibold text-slate-800 mb-2">{t('Administrateur', 'Administrator')}</p>
                <ul className="text-xs space-y-1 text-slate-600">
                  {[
                    t('Toutes les classes, matières, élèves', 'All classes, subjects, students'),
                    t('Saisie des notes pour toutes les classes', 'Grade entry for all classes'),
                    t('Génération et impression de bulletins', 'Generate and print report cards'),
                    t('Gestion des enseignants et des frais', 'Manage teachers and fees'),
                    t('Rapports globaux', 'Global reports'),
                    t('Paramètres et code établissement', 'Settings and school code'),
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-emerald-500 text-[10px]">✓</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-slate-200 rounded-xl p-4">
                <p className="font-semibold text-slate-800 mb-2">{t('Enseignant', 'Teacher')}</p>
                <ul className="text-xs space-y-1 text-slate-600">
                  {[
                    t('Uniquement ses classes assignées', 'Only assigned classes'),
                    t('Saisie des notes pour ses matières', 'Grade entry for own subjects'),
                    t('Bulletins de ses classes', 'Reports for own classes'),
                    t('Absences de ses classes', 'Attendance for own classes'),
                    t('Son emploi du temps', 'Own timetable'),
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-emerald-500 text-[10px]">✓</span>{item}
                    </li>
                  ))}
                  {[
                    t('Paramètres de l\'établissement', 'School settings'),
                    t('Classes d\'autres enseignants', 'Other teachers\' classes'),
                    t('Frais scolaires', 'School fees'),
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-red-400 text-[10px]">✕</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          {/* ── 19 ── */}
          <Section id="s19" num={19} title={t('Plans & fonctionnalités', 'Plans & features')}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-500 font-semibold">
                    <th className="text-left px-3 py-2 rounded-l-lg">{t('Fonctionnalité', 'Feature')}</th>
                    <th className="text-center px-3 py-2">Starter</th>
                    <th className="text-center px-3 py-2">École</th>
                    <th className="text-center px-3 py-2">Pro</th>
                    <th className="text-center px-3 py-2 rounded-r-lg">Réseau</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    [t('Classes, matières, élèves', 'Classes, subjects, students'), true, true, true, true],
                    [t('Saisie des notes & bulletins', 'Grade entry & reports'), true, true, true, true],
                    [t('Frais scolaires', 'School fees'), true, true, true, true],
                    [t('Gestion des enseignants', 'Teacher management'), false, true, true, true],
                    [t('Suivi des absences', 'Attendance tracking'), false, true, true, true],
                    [t('Rapports avancés', 'Advanced reports'), false, true, true, true],
                    [t('Emploi du temps', 'Timetable'), false, false, true, true],
                    [t('Conseil de classe', 'Class council'), false, false, true, true],
                    [t('Multi-établissements', 'Multi-school'), false, false, false, true],
                  ].map(([feature, ...plans]) => (
                    <tr key={feature}>
                      <td className="px-3 py-2 text-slate-700">{feature}</td>
                      {plans.map((has, i) => (
                        <td key={i} className="px-3 py-2 text-center">
                          {has
                            ? <span className="text-emerald-500 font-bold">✓</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note>{t('Pour passer à un plan supérieur, contactez NotesCam — WhatsApp : +237 670 894 721 · Email : contact@notescam.app', 'To upgrade, contact NotesCam — WhatsApp: +237 670 894 721 · Email: contact@notescam.app')}</Note>
          </Section>

          {/* ── 20 ── */}
          <Section id="s20" num={20} title={t('Mode hors ligne', 'Offline mode')}>
            <p>{t('NotesCam fonctionne sans connexion internet. Vos actions sont enregistrées localement et synchronisées dès que la connexion revient.', 'NotesCam works without internet. Your actions are saved locally and synced as soon as the connection returns.')}</p>
            <H3>{t('Indicateur de synchronisation', 'Sync indicator')}</H3>
            <ul className="list-disc pl-5 space-y-1">
              <li><Tag color="green">{t('Vert', 'Green')}</Tag> — {t('tout est synchronisé.', 'everything is synced.')}</li>
              <li><Tag color="amber">{t('Orange + chiffre', 'Orange + number')}</Tag> — {t('X opérations en attente.', 'X operations pending.')}</li>
              <li><Tag color="red">{t('Rouge', 'Red')}</Tag> — {t('erreur de synchronisation. Cliquez pour voir les détails.', 'sync error. Click to see details.')}</li>
            </ul>
            <H3>{t('Bonnes pratiques', 'Best practices')}</H3>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('Ne vous déconnectez pas si des données ne sont pas encore synchronisées.', "Don't log out if data hasn't been synced yet.")}</li>
              <li>{t('En cas d\'erreur persistante : Paramètres → Synchronisation → Vider la file.', 'If errors persist: Settings → Sync → Clear queue.')}</li>
              <li>{t('Sur mobile Chrome (Android), installez l\'app via « Ajouter à l\'écran d\'accueil » pour un accès hors ligne optimal.', 'On Android Chrome, install the app via "Add to home screen" for best offline access.')}</li>
            </ul>
          </Section>

          {/* ── 21 ── */}
          <Section id="s21" num={21} title={t('Questions fréquentes', 'FAQ')}>
            <div className="space-y-4">
              {[
                {
                  q: t("Je ne reçois pas l'email de confirmation.", "I didn't receive the confirmation email."),
                  a: t("Vérifiez votre dossier spam. Sur la page de connexion, cliquez sur « Email non confirmé » puis « Renvoyer l'email ».", 'Check your spam folder. On the login page, click "Email not confirmed" then "Resend email".'),
                },
                {
                  q: t("Un enseignant ne voit aucune classe après inscription.", "A teacher sees no classes after signing up."),
                  a: t("L'enseignant doit être assigné à une classe (titulaire) ou une matière. Faites-le depuis la fiche classe ou la fiche matière.", "The teacher must be assigned to a class (head teacher) or a subject. Do this from the class or subject detail."),
                },
                {
                  q: t("La moyenne calculée ne correspond pas à mes attentes.", "The calculated average doesn't match what I expected."),
                  a: t("NotesCam calcule la moyenne pondérée : (somme des notes × coefficients) ÷ (somme des coefficients). Vérifiez que les coefficients des matières sont corrects.", "NotesCam calculates the weighted average: (sum of grades × coefficients) ÷ (sum of coefficients). Check that subject coefficients are correct."),
                },
                {
                  q: t("Les notes n'apparaissent pas sur le bulletin.", "Grades don't appear on the report card."),
                  a: t("Vérifiez que la matière a un coefficient ≥ 1 et que la note est enregistrée pour la bonne séquence.", "Check that the subject has a coefficient ≥ 1 and that the grade is saved for the correct sequence."),
                },
                {
                  q: t("Comment supprimer un élève ?", "How do I delete a student?"),
                  a: t("Fiche élève → Menu (···) → Supprimer. Attention : toutes les notes et bulletins sont supprimés avec l'élève.", "Student profile → Menu (···) → Delete. Warning: all grades and reports are deleted with the student."),
                },
                {
                  q: t("Puis-je utiliser NotesCam sur téléphone ?", "Can I use NotesCam on mobile?"),
                  a: t("Oui. L'app est responsive et fonctionne sur mobile. Sur Android, installez-la via Chrome → « Ajouter à l'écran d'accueil ».", 'Yes. The app is responsive and works on mobile. On Android, install it via Chrome → "Add to home screen".'),
                },
                {
                  q: t("Comment imprimer les bulletins sans logo ?", "How do I print reports without a logo?"),
                  a: t("Si aucun logo n'est uploadé dans Paramètres, les bulletins s'impriment sans logo. Ajoutez-en un dans Paramètres → Logo de l'établissement.", "If no logo is uploaded in Settings, reports print without a logo. Add one in Settings → School logo."),
                },
              ].map(({ q, a }) => (
                <details key={q} className="group border border-slate-200 rounded-xl overflow-hidden">
                  <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer font-medium text-slate-800 hover:bg-slate-50 transition-colors list-none">
                    <span>{q}</span>
                    <svg className="w-4 h-4 text-slate-400 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </summary>
                  <div className="px-4 pb-4 pt-1 text-sm text-slate-600 border-t border-slate-100 bg-slate-50">
                    {a}
                  </div>
                </details>
              ))}
            </div>
          </Section>

          {/* ── Contact card ── */}
          <div className="bg-gradient-to-br from-brand-50 to-indigo-50 border border-brand-100 rounded-2xl p-6 text-center">
            <p className="text-2xl mb-2">💬</p>
            <p className="font-bold text-slate-900 mb-1">{t('Besoin d\'aide ?', 'Need help?')}</p>
            <p className="text-slate-500 text-sm mb-4">{t('Notre équipe est disponible par WhatsApp et email.', 'Our team is available via WhatsApp and email.')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://wa.me/237670894721"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                WhatsApp
              </a>
              <a
                href="mailto:contact@notescam.app"
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                contact@notescam.app
              </a>
            </div>
          </div>

        </main>
      </div>
    </Layout>
  );
}
