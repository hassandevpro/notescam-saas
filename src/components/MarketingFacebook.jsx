import { useState, useEffect, useMemo } from 'react';

// ── Data ─────────────────────────────────────────────────────────────────────

const PHASES = [
  {
    id: 'semaine0',
    label: 'Semaine 0',
    sub: 'Préparation',
    color: { ring: 'ring-gray-400', bar: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400', num: 'bg-gray-100 text-gray-600' },
    items: [
      { id: 's0_1', text: 'Créer/optimiser la page Facebook Business' },
      { id: 's0_2', text: 'Configurer WhatsApp Business avec message automatique' },
      { id: 's0_3', text: 'Installer Facebook Pixel sur notescam.vercel.app' },
      { id: 's0_4', text: 'Créer 20 visuels avec Canva (templates réutilisables)' },
      { id: 's0_5', text: 'Filmer 3 vidéos courtes (démo, témoignage, coulisses)' },
      { id: 's0_6', text: 'Planifier les 28 premiers posts dans Meta Business Suite' },
    ],
  },
  {
    id: 'semaine12',
    label: 'Semaines 1–2',
    sub: 'Lancement',
    color: { ring: 'ring-blue-400', bar: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', num: 'bg-blue-50 text-blue-700' },
    items: [
      { id: 's12_1', text: 'Publier selon le calendrier éditorial (J1→J14)' },
      { id: 's12_2', text: 'Rejoindre 5 groupes Facebook pertinents (directeurs, éducation…)' },
      { id: 's12_3', text: 'Lancer la 1ère campagne Facebook Ads (5 000 FCFA de test)' },
      { id: 's12_4', text: 'Contacter 10 directeurs d\'école existants pour des témoignages' },
    ],
  },
  {
    id: 'semaine34',
    label: 'Semaines 3–4',
    sub: 'Optimisation',
    color: { ring: 'ring-violet-400', bar: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500', num: 'bg-violet-50 text-violet-700' },
    items: [
      { id: 's34_1', text: 'Analyser les performances (quels posts ont le plus engagé ?)' },
      { id: 's34_2', text: 'Doubler le budget sur l\'ad la plus performante' },
      { id: 's34_3', text: 'Organiser un Live Facebook démo avec Q&R' },
      { id: 's34_4', text: 'Lancer le programme ambassadeur (1 mois offert pour témoignage vidéo)' },
    ],
  },
  {
    id: 'mois23',
    label: 'Mois 2–3',
    sub: 'Scaling',
    color: { ring: 'ring-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', num: 'bg-emerald-50 text-emerald-700' },
    items: [
      { id: 'm23_1', text: 'Augmenter le budget ads sur les audiences gagnantes' },
      { id: 'm23_2', text: 'Créer un groupe Facebook "Directeurs d\'écoles Afrique francophone"' },
      { id: 'm23_3', text: 'Produire 2 case studies détaillés avec clients existants' },
      { id: 'm23_4', text: 'Tester les campagnes Lookalike (1% de vos meilleurs clients)' },
    ],
  },
];

const POSTS_CATEGORIES = [
  {
    id: 'A', label: 'Douleur', color: 'bg-red-50 text-red-700 border-red-200',
    posts: [
      'Il est 23h. Vous faites encore les bulletins à la main. C\'est normal pour vous ?',
      'Excel plante. Les notes de 200 élèves disparaissent. Ça vous est déjà arrivé ?',
      'Votre secrétaire est malade. Qui fait les bulletins ? Avec NotesCam, tout le monde peut.',
      'La réunion de parents est dans 2 jours. Les bulletins ne sont pas finis. Stress.',
      'Combien d\'enseignants dans votre école utilisent encore des cahiers de notes en 2026 ?',
      'Un directeur africain gère en moyenne 12h de paperasse par semaine. 12h volées à sa famille.',
      'Les parents demandent les résultats. Vous cherchez encore dans vos classeurs.',
      'Rentrée scolaire : l\'inscription de 150 élèves à la main prend 3 jours. Avec NotesCam : 2 heures.',
      'Vous avez payé un logiciel français 500€. Il ne comprend pas le système camerounais. Normal ?',
      'Votre école est professionnelle. Vos outils de gestion aussi ?',
    ],
  },
  {
    id: 'B', label: 'Solution', color: 'bg-blue-50 text-blue-700 border-blue-200',
    posts: [
      'NotesCam génère les bulletins de toute une classe en 4 minutes. Pas 4 heures.',
      'Un enseignant entre ses notes depuis son téléphone. Même sans internet. Les données synchronisent dès qu\'il y a du réseau.',
      'Suivi des absences, frais scolaires, emploi du temps — tout dans une seule application.',
      'Les parents reçoivent les résultats par WhatsApp. Plus besoin de déplacements pour rien.',
      'NotesCam calcule automatiquement les moyennes, les rangs, les mentions. Zéro calcul manuel.',
      'Chaque école a ses propres données. Aucun directeur ne voit les données d\'une autre école.',
      'Votre école compte 50 élèves ou 800 ? NotesCam s\'adapte.',
      'Exportez les bulletins en PDF. Imprimez. Distribuez. Archivé automatiquement.',
      'Tableau de bord : qui a payé, qui n\'a pas payé, quel montant manque — en temps réel.',
      'NotesCam fonctionne sur téléphone, tablette ou ordinateur. Pas besoin de matériel spécial.',
    ],
  },
  {
    id: 'C', label: 'Preuve sociale', color: 'bg-green-50 text-green-700 border-green-200',
    posts: [
      '[Témoignage] "Avant NotesCam, je passais chaque fin de trimestre à ne pas dormir." — Directeur, Yaoundé',
      '[Témoignage] "Les parents font confiance à notre école maintenant. Les bulletins sont professionnels." — Fondatrice, Douala',
      '37 écoles camerounaises font confiance à NotesCam. Rejoignez-les.',
      '[Avant/Après] Bulletin manuscrit vs bulletin NotesCam — vous choisissez lequel ?',
      '"J\'ai configuré NotesCam en une matinée. Mon équipe l\'utilise depuis le lendemain." — Directeur, Bafoussam',
      'Taux de satisfaction : 94% des directeurs recommandent NotesCam à leurs collègues.',
      '[Screenshot] Voici à quoi ressemble le tableau de bord d\'une école de 400 élèves.',
      'Une école de 6 classes a économisé 40 heures de travail au 1er trimestre. Le calcul est simple.',
      '"Mon comptable est rassuré. Tout est traçable." — Fondateur, Bafoussam',
      'Croissance : +18 nouvelles écoles en avril. Quelque chose se passe.',
    ],
  },
  {
    id: 'D', label: 'Éducatif', color: 'bg-amber-50 text-amber-700 border-amber-200',
    posts: [
      '5 signes que votre école a besoin d\'un logiciel de gestion (maintenant).',
      'La différence entre une école qui grandit et une qui stagne ? La gestion des données.',
      'Excel n\'est pas un logiciel de gestion scolaire. Voici pourquoi.',
      'Comment calculer le taux d\'absentéisme de votre école en 3 clics.',
      'Les 3 erreurs qui font fuir les parents d\'élèves sérieux de votre école.',
      'Mode hors-ligne : pourquoi c\'est indispensable pour les écoles africaines.',
      'Qu\'est-ce qu\'un bulletin numérique professionnel ? (avec exemples)',
      'Comment NotesCam protège les données de vos élèves.',
      '5 choses à vérifier avant de choisir un logiciel de gestion scolaire.',
      'La gestion scolaire digitale : luxe ou nécessité en Afrique en 2026 ?',
    ],
  },
  {
    id: 'E', label: 'Offre / Prix', color: 'bg-violet-50 text-violet-700 border-violet-200',
    posts: [
      'Plan Starter : gratuit. 1 classe, 30 élèves. Parfait pour commencer.',
      'Plan École : 8 500 FCFA/mois. Illimité. Moins cher qu\'une rame de papier A4 par semaine.',
      '280 FCFA par jour. C\'est le prix de NotesCam Plan École. Et un café à Yaoundé ?',
      'Essai gratuit. Aucune carte bancaire requise. Commencez en 2 minutes.',
      'Comparez : logiciel français (300€/mois) vs NotesCam (8 500 FCFA/mois). Cherchez la différence.',
      'Ce mois-ci : 2 mois gratuits pour toute école qui s\'inscrit avec un code partenaire.',
      'Paiement en FCFA. Pas de conversion. Pas de surprise. Mobile Money accepté.',
      'Votre école a plusieurs succursales ? Le plan Réseau est fait pour vous.',
      'Formation incluse. Support WhatsApp inclus. Mises à jour incluses. Prix fixe.',
      'Calculez votre retour sur investissement : X heures économisées × salaire horaire secrétaire = ?',
    ],
  },
  {
    id: 'F', label: 'Engagement', color: 'bg-orange-50 text-orange-700 border-orange-200',
    posts: [
      'Combien d\'élèves dans votre école ? (Répondez en commentaire)',
      'Quel est votre plus grand défi en gestion scolaire ?',
      'Papier, Excel ou logiciel dédié — qu\'utilisez-vous aujourd\'hui ?',
      'Si vous aviez 5h de plus par semaine, que feriez-vous pour votre école ?',
      'Quelle fonctionnalité serait la plus utile pour votre école ?',
      'Avez-vous déjà perdu des données importantes de votre école ? Comment ?',
      'À quel moment de l\'année êtes-vous le plus débordé administrativement ?',
      'Vos enseignants ont-ils un téléphone pour entrer les notes directement ?',
      'Les parents de vos élèves paient-ils leurs frais à temps ?',
      'Si NotesCam pouvait ajouter une seule fonctionnalité, laquelle choisiriez-vous ?',
    ],
  },
  {
    id: 'G', label: 'Coulisses', color: 'bg-teal-50 text-teal-700 border-teal-200',
    posts: [
      'Nous développons NotesCam depuis Yaoundé. Pour les écoles africaines. Par des Africains.',
      'Mise à jour de cette semaine : le module de gestion des frais est encore plus rapide.',
      'Voici pourquoi nous avons choisi de ne pas copier les logiciels français.',
      'En coulisses : comment nous testons NotesCam avec de vraies écoles camerounaises.',
      'La prochaine fonctionnalité que nous développons : vous avez voté, on construit.',
      'Notre équipe support répond en moins de 2h sur WhatsApp. Toujours.',
      'NotesCam fonctionne hors-ligne parce que l\'internet ne l\'est pas toujours. C\'est un choix.',
      'Chaque retour d\'un directeur d\'école améliore NotesCam. Merci à tous nos bêta-testeurs.',
      'Bilan de l\'année : X bulletins générés, Y écoles inscrites, Z heures économisées.',
      'Nous refusons de vendre vos données. Jamais. Politique de confidentialité lisible en 2 minutes.',
    ],
  },
  {
    id: 'H', label: 'Viral', color: 'bg-pink-50 text-pink-700 border-pink-200',
    posts: [
      'Partagez si vous connaissez un directeur d\'école qui mérite de dormir plus la nuit.',
      'Taguez un directeur d\'école qui fait encore les bulletins à la main.',
      'Ce post est pour tous les directeurs d\'école qui travaillent jusqu\'à minuit chaque trimestre.',
      'Si vous êtes enseignant, partagez ça à votre directeur.',
      'Chaque école privée camerounaise devrait voir ça.',
    ],
  },
  {
    id: 'I', label: 'Urgence', color: 'bg-red-50 text-red-800 border-red-300',
    posts: [
      'Rentrée septembre dans 3 mois. Vos inscriptions sont-elles prêtes ?',
      'Fin de trimestre dans 2 semaines. Vos bulletins sont-ils configurés ?',
      'Dernier jour de l\'offre de lancement. Prix augmente demain.',
      'Juin : bilan annuel. Avec NotesCam, le rapport annuel se génère en 1 clic.',
      'Nouvelles inscriptions 2026-2027 : gérez-les proprement dès maintenant.',
    ],
  },
  {
    id: 'J', label: 'FAQ', color: 'bg-sky-50 text-sky-700 border-sky-200',
    posts: [
      'Non, vous n\'avez pas besoin d\'être informaticien pour utiliser NotesCam.',
      'Oui, NotesCam fonctionne sans internet. Vos données se synchronisent quand le réseau revient.',
      'Non, migrer vers NotesCam ne signifie pas perdre vos anciennes données.',
      'Oui, plusieurs utilisateurs peuvent travailler en même temps sur NotesCam.',
      'Non, il n\'y a pas de frais cachés. Le prix affiché est le prix final.',
      'Oui, NotesCam respecte le programme camerounais (MINESEC/MINESUP).',
      'Non, vous n\'avez pas besoin d\'un serveur. NotesCam est dans le cloud.',
      'Oui, vos données restent les vôtres. Exportez-les quand vous voulez.',
      'Non, NotesCam n\'est pas qu\'un logiciel de bulletins. C\'est une suite complète.',
      'Oui, nous formons votre équipe. Accompagnement inclus dans tous les plans.',
    ],
  },
  {
    id: 'K', label: 'ROI', color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    posts: [
      'Une école de 200 élèves génère ses bulletins trimestriels en 6 heures. Avant : 3 jours.',
      'Réduction des erreurs de calcul de notes : 100%. Les machines ne se trompent pas en addition.',
      'Recouvrement des frais scolaires : +23% quand les parents reçoivent un rappel automatique.',
      'Le directeur qui utilise NotesCam récupère en moyenne 8h par semaine.',
      'Économie sur le papier : une école passe de 50 000 FCFA/an à 10 000 FCFA/an de papier.',
      'Taux de rétention des élèves : +15% dans les écoles qui envoient les résultats rapidement aux parents.',
      'Temps de configuration initiale : 30 minutes pour une école de 200 élèves.',
      'Satisfaction enseignants : 89% disent que NotesCam a réduit leur stress administratif.',
      'Une école sur trois recommande NotesCam à une autre école dans les 2 premiers mois.',
      'ROI moyen : NotesCam est rentabilisé en moins de 2 semaines pour une école de 150 élèves.',
    ],
  },
];

const STORAGE_KEY = 'notescam_marketing_checklist';

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 56, stroke = 5, color = '#6366f1' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={copy}
      title="Copier le post"
      className={`shrink-0 p-1.5 rounded-lg transition-colors text-xs font-semibold ${
        copied ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      {copied ? '✓' : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/>
          <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/>
        </svg>
      )}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MarketingFacebook() {
  const [section,   setSection]   = useState('plan');      // 'plan' | 'posts'
  const [checked,   setChecked]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  });
  const [openPhase, setOpenPhase] = useState('semaine0');
  const [catFilter, setCatFilter] = useState('all');
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
  }, [checked]);

  const toggle = (id) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  // Progress calculations
  const phaseProgress = useMemo(() =>
    PHASES.map((p) => {
      const done = p.items.filter((i) => checked[i.id]).length;
      return { id: p.id, done, total: p.items.length, pct: Math.round((done / p.items.length) * 100) };
    }),
  [checked]);

  const allItems = PHASES.flatMap((p) => p.items);
  const globalDone = allItems.filter((i) => checked[i.id]).length;
  const globalPct  = Math.round((globalDone / allItems.length) * 100);

  // Identify current active phase (first incomplete)
  const activePhaseIdx = phaseProgress.findIndex((p) => p.pct < 100);
  const activePhaseId  = activePhaseIdx === -1 ? PHASES[PHASES.length - 1].id : PHASES[activePhaseIdx].id;

  // Next unchecked item
  const nextItem = allItems.find((i) => !checked[i.id]);

  // Posts filtering
  const filteredPosts = useMemo(() => {
    const cats = catFilter === 'all' ? POSTS_CATEGORIES : POSTS_CATEGORIES.filter((c) => c.id === catFilter);
    if (!search.trim()) return cats;
    const q = search.toLowerCase();
    return cats.map((c) => ({ ...c, posts: c.posts.filter((p) => p.toLowerCase().includes(q)) })).filter((c) => c.posts.length);
  }, [catFilter, search]);

  const totalPostsShown = filteredPosts.reduce((acc, c) => acc + c.posts.length, 0);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-blue-600">
              <svg className="w-6 h-6 inline" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </span>
            Stratégie Marketing Facebook
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">Plan d'action 30 jours — NotesCam Cameroun</p>
        </div>

        {/* Global progress */}
        <div className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 shadow-sm border border-gray-100">
          <div className="relative flex items-center justify-center">
            <ProgressRing pct={globalPct} color={globalPct === 100 ? '#10b981' : '#6366f1'} />
            <span className="absolute text-xs font-bold text-gray-700">{globalPct}%</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{globalDone}/{allItems.length} étapes</p>
            <p className="text-xs text-gray-400">progression globale</p>
          </div>
        </div>
      </div>

      {/* Next action banner */}
      {nextItem && globalPct < 100 && (
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <span className="text-indigo-500 mt-0.5">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd"/>
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-0.5">Prochaine action</p>
            <p className="text-sm text-indigo-800 font-medium">{nextItem.text}</p>
          </div>
          <button
            onClick={() => { toggle(nextItem.id); setOpenPhase(PHASES.find((p) => p.items.some((i) => i.id === nextItem.id))?.id); }}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
          >
            Marquer fait
          </button>
        </div>
      )}

      {globalPct === 100 && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <span className="text-2xl">🎉</span>
          <p className="text-sm font-semibold text-emerald-800">Toutes les étapes du plan 30 jours sont complétées !</p>
        </div>
      )}

      {/* Section nav */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'plan', label: 'Plan d\'action' },
          { id: 'posts', label: `Banque de posts (100)` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              section === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── PLAN D'ACTION ─────────────────────────────────────────────────── */}
      {section === 'plan' && (
        <div className="space-y-3">
          {PHASES.map((phase, idx) => {
            const prog   = phaseProgress[idx];
            const isOpen = openPhase === phase.id;
            const isActive = phase.id === activePhaseId;

            return (
              <div
                key={phase.id}
                className={`bg-white rounded-2xl shadow-sm border transition-all ${
                  isActive ? 'border-indigo-200 ring-1 ring-indigo-200' : 'border-gray-100'
                }`}
              >
                {/* Phase header */}
                <button
                  onClick={() => setOpenPhase(isOpen ? null : phase.id)}
                  className="w-full px-5 py-4 flex items-center gap-4 text-left"
                >
                  {/* Phase number */}
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${phase.color.num}`}>
                    {idx + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-sm">{phase.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${phase.color.badge}`}>
                        {phase.sub}
                      </span>
                      {isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-700">
                          En cours
                        </span>
                      )}
                      {prog.pct === 100 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">
                          ✓ Terminé
                        </span>
                      )}
                    </div>
                    {/* Mini progress bar */}
                    <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full w-40">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${phase.color.bar}`}
                        style={{ width: `${prog.pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-700">{prog.done}/{prog.total}</p>
                    <p className="text-xs text-gray-400">{prog.pct}%</p>
                  </div>

                  <svg
                    className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20" fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </button>

                {/* Phase items */}
                {isOpen && (
                  <div className="border-t border-gray-50 divide-y divide-gray-50">
                    {phase.items.map((item, iIdx) => {
                      const done = !!checked[item.id];
                      return (
                        <label
                          key={item.id}
                          className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                            done ? 'bg-gray-50/60' : 'hover:bg-gray-50/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => toggle(item.id)}
                            className="mt-0.5 w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0 flex items-start gap-2">
                            <span className={`text-xs font-bold shrink-0 mt-0.5 ${phase.color.badge.split(' ')[1]} opacity-70`}>
                              {iIdx + 1}.
                            </span>
                            <span className={`text-sm leading-relaxed transition-colors ${
                              done ? 'line-through text-gray-400' : 'text-gray-700'
                            }`}>
                              {item.text}
                            </span>
                          </div>
                          {done && <span className="text-emerald-500 text-xs font-bold shrink-0 mt-0.5">✓</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Reset */}
          {globalDone > 0 && (
            <div className="text-right">
              <button
                onClick={() => { if (window.confirm('Réinitialiser toutes les cases ?')) setChecked({}); }}
                className="text-xs text-gray-400 hover:text-red-400 transition-colors"
              >
                Réinitialiser la progression
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── BANQUE DE POSTS ───────────────────────────────────────────────── */}
      {section === 'posts' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Rechercher dans les posts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 w-56"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCatFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${catFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Tous ({totalPostsShown})
              </button>
              {POSTS_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCatFilter(c.id === catFilter ? 'all' : c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    catFilter === c.id ? c.color + ' font-bold' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {c.id} — {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Posts list */}
          {filteredPosts.map((cat) => (
            <div key={cat.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className={`px-5 py-3 border-b border-gray-50 flex items-center gap-2 ${cat.color} border`}>
                <span className="text-xs font-black tracking-wider">Catégorie {cat.id}</span>
                <span className="font-bold text-sm">{cat.label}</span>
                <span className="ml-auto text-xs opacity-60">{cat.posts.length} posts</span>
              </div>
              <div className="divide-y divide-gray-50">
                {cat.posts.map((post, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50/40 group transition-colors">
                    <span className="text-xs text-gray-300 font-mono mt-0.5 shrink-0 w-5 text-right">{i + 1}</span>
                    <p className="flex-1 text-sm text-gray-700 leading-relaxed">{post}</p>
                    <CopyButton text={post} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredPosts.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm shadow-sm border border-gray-100">
              Aucun post trouvé.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
