import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LogoMark from '../components/LogoMark';

// ─── Config ──────────────────────────────────────────────────────────────────
const WA_NUMBER  = '237670894721';
const WA_MSG     = encodeURIComponent('Bonjour, je voudrais une démonstration de NotesCam pour mon établissement.');
const WA_LINK    = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;

// ─── Animation helpers ────────────────────────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, vis];
}

function useCounter(target, active) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cur = 0;
    const step = target / 60;
    const id = setInterval(() => {
      cur += step;
      if (cur >= target) { setN(target); clearInterval(id); }
      else setN(Math.floor(cur));
    }, 30);
    return () => clearInterval(id);
  }, [target, active]);
  return n;
}

// ─── Global CSS injected once ─────────────────────────────────────────────────
function GlobalStyles() {
  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'landing-styles';
    el.textContent = `
      @keyframes fadeUp { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
      @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
      @keyframes glow   { 0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.35)} 50%{box-shadow:0 0 0 14px rgba(59,130,246,0)} }
      @keyframes shimmer{ from{background-position:-200% 0} to{background-position:200% 0} }
      .lp-fade-up { animation: fadeUp .65s ease-out both; }
      .lp-float   { animation: float 6s ease-in-out infinite; }
      .lp-glow    { animation: glow  2.5s ease-in-out infinite; }
      .lp-shimmer {
        background: linear-gradient(90deg,#e0eaff 25%,#c7d9ff 50%,#e0eaff 75%);
        background-size: 200% 100%;
        animation: shimmer 2s linear infinite;
      }
    `;
    if (!document.getElementById('landing-styles')) document.head.appendChild(el);
    return () => el.remove();
  }, []);
  return null;
}

// ─── Reusable atoms ───────────────────────────────────────────────────────────
function Check({ ok }) {
  return ok
    ? <span className="text-blue-600 font-bold text-lg">✓</span>
    : <span className="text-gray-300 font-bold text-lg">✗</span>;
}

function Stars({ n = 5 }) {
  return <span className="text-amber-400 text-sm">{'★'.repeat(n)}</span>;
}

function SectionTag({ children }) {
  return (
    <span className="inline-block bg-blue-50 text-blue-700 text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-4 border border-blue-100">
      {children}
    </span>
  );
}

function SectionTitle({ children, white }) {
  return (
    <h2 className={`text-3xl md:text-4xl font-extrabold leading-tight mb-4 ${white ? 'text-white' : 'text-slate-900'}`}>
      {children}
    </h2>
  );
}

function SectionSub({ children, white }) {
  return (
    <p className={`text-lg leading-relaxed max-w-2xl mx-auto ${white ? 'text-blue-100' : 'text-slate-500'}`}>
      {children}
    </p>
  );
}

// ─── Photo écolier (repli gracieux si la photo n'est pas encore fournie) ───────
// Déposez vos photos dans public/landing/ (ex. public/landing/ecoliers-1.jpg).
// Tant qu'une photo est absente, un joli dégradé + emoji s'affiche (jamais cassé).
function SchoolPhoto({ src, alt, className = '', emoji = '🎒', label }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return (
      <div className={`relative flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 via-indigo-100 to-blue-200 overflow-hidden ${className}`}>
        <span className="text-5xl opacity-70">{emoji}</span>
        {label && <span className="mt-2 text-xs font-semibold text-blue-700/70 px-3 text-center">{label}</span>}
      </div>
    );
  }
  return (
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)}
      className={`object-cover ${className}`} />
  );
}

// ─── App screenshot mockup ────────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="lp-float relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-white select-none">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 border-b border-gray-200">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <div className="flex-1 mx-3 bg-white rounded-md h-6 flex items-center px-3 gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-[11px] text-gray-400">notescam-saas.vercel.app/app/grades</span>
        </div>
      </div>
      {/* Real screenshot */}
      <img
        src="/app-screenshot.png"
        alt="Interface NotesCam — Saisie des notes"
        className="w-full block"
        style={{ maxHeight: '340px', objectFit: 'cover', objectPosition: 'top' }}
      />
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen]         = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const links = [
    { href: '#fonctionnalites', label: 'Fonctionnalités' },
    { href: '#tarifs',          label: 'Tarifs' },
    { href: '#temoignages',     label: 'Témoignages' },
    { href: '#faq',             label: 'FAQ' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur shadow-lg border-b border-gray-100' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-5 md:px-10 flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className={`font-extrabold text-lg tracking-tight ${scrolled ? 'text-slate-900' : 'text-white'}`}>NotesCam</span>
        </Link>
        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {links.map(({ href, label }) => (
            <a key={href} href={href}
              className={`text-sm font-medium transition-colors hover:text-blue-400 ${scrolled ? 'text-slate-600' : 'text-white/80'}`}>
              {label}
            </a>
          ))}
        </div>
        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${scrolled ? 'text-slate-600 hover:text-blue-600' : 'text-white/80 hover:text-white'}`}>
            Connexion
          </Link>
          <Link to="/signup" className="text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/25 lp-glow">
            Essai gratuit
          </Link>
        </div>
        {/* Mobile burger */}
        <button onClick={() => setOpen(!open)} className={`md:hidden p-2 rounded-lg ${scrolled ? 'text-slate-700' : 'text-white'}`}>
          <div className="w-5 space-y-1.5">
            <span className={`block h-0.5 bg-current transition-transform ${open ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block h-0.5 bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 bg-current transition-transform ${open ? '-rotate-45 -translate-y-2' : ''}`} />
          </div>
        </button>
      </div>
      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-xl px-5 py-4 space-y-3">
          {links.map(({ href, label }) => (
            <a key={href} href={href} onClick={() => setOpen(false)}
              className="block text-sm font-medium text-slate-700 py-2 border-b border-gray-50">
              {label}
            </a>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <Link to="/login" className="text-sm text-center font-medium text-slate-600 py-2.5 rounded-xl border border-gray-200">
              Connexion
            </Link>
            <Link to="/signup" className="text-sm text-center font-bold bg-blue-600 text-white py-3 rounded-xl">
              Essai gratuit
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 flex items-center overflow-hidden pt-16">
      {/* Background blobs */}
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(white 1px,transparent 1px),linear-gradient(90deg,white 1px,transparent 1px)', backgroundSize: '60px 60px' }} />

      <div className="relative max-w-7xl mx-auto px-5 md:px-10 py-20 md:py-28">
        <div className="grid md:grid-cols-2 gap-14 items-center">
          {/* Text */}
          <div className="lp-fade-up">
            {/* Badge urgency */}
            <div className="inline-flex items-center gap-2 bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-bold px-4 py-2 rounded-full mb-6">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              Offre fondateurs — 20% de réduction pour les 50 premiers établissements
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-6">
              Votre école mérite{' '}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                mieux qu'Excel.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-blue-100/80 leading-relaxed mb-10 max-w-lg">
              NotesCam automatise vos bulletins, notes et frais scolaires.
              En 5 minutes, votre administration entre dans le XXI<sup>e</sup> siècle.
            </p>
            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <Link to="/signup"
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-4 rounded-xl text-base transition-all shadow-2xl shadow-blue-600/30 lp-glow">
                Commencer gratuitement
                <span className="text-blue-300">→</span>
              </Link>
              <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-7 py-4 rounded-xl text-base transition-all shadow-xl shadow-green-500/25">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.502 3.93 1.385 5.608L0 24l6.533-1.371A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.877 9.877 0 01-5.031-1.371l-.36-.214-3.732.978.997-3.648-.235-.374A9.849 9.849 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118c5.466 0 9.882 4.415 9.882 9.882 0 5.466-4.416 9.882-9.882 9.882z"/></svg>
                Voir une démo WhatsApp
              </a>
            </div>
            {/* Social proof mini */}
            <div className="flex items-center gap-3 text-blue-200/60 text-sm">
              <div className="flex -space-x-2">
                {['M','H','P','A'].map((l, i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 border-2 border-slate-950 flex items-center justify-center text-white text-xs font-bold">{l}</div>
                ))}
              </div>
              <span>+15 directeurs utilisent NotesCam ce mois-ci</span>
            </div>
          </div>
          {/* Mockup */}
          <div className="lp-fade-up hidden md:block" style={{ animationDelay: '.2s' }}>
            <DashboardMockup />
            {/* Floating badges */}
            <div className="absolute -left-6 top-1/3 bg-white rounded-xl shadow-2xl p-3 flex items-center gap-2.5 text-sm font-bold text-slate-700">
              <span className="text-2xl">⚡</span>
              <div>
                <div className="text-xs text-slate-400 font-normal">Bulletin généré en</div>
                <div>3 secondes</div>
              </div>
            </div>
            <div className="absolute -right-4 bottom-1/4 bg-green-500 rounded-xl shadow-2xl p-3 text-white text-xs font-bold">
              ✓ Paiement MTN MoMo accepté
            </div>
            {/* Vignette écolier */}
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/90 lp-float" style={{ animationDelay: '.6s' }}>
              <SchoolPhoto src="/landing/ecolier-hero.jpg" alt="Écolier souriant" emoji="🎓"
                className="w-full h-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Logo bar ─────────────────────────────────────────────────────────────────
function LogoBar() {
  const schools = [
    'Collège Notre-Dame', 'Institut Excellence', 'Lycée Moderne',
    'École Bilingue', 'Groupe Scolaire Avenir', 'Institut Privé Lumière',
  ];
  return (
    <div className="bg-slate-900 py-8 border-y border-slate-800">
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <p className="text-center text-slate-400 text-xs font-bold tracking-widest uppercase mb-6">
          Ils nous font déjà confiance
        </p>
        <div className="flex flex-wrap justify-center items-center gap-4 md:gap-8">
          {schools.map((s) => (
            <div key={s} className="text-slate-500 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-700/50 bg-slate-800/50 hover:border-blue-500/40 hover:text-slate-300 transition-all">
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Problems ─────────────────────────────────────────────────────────────────
const PROBLEMS = [
  { icon: '🌙', title: 'Nuits blanches sur les bulletins', desc: 'Chaque fin de séquence, vos enseignants passent des nuits entières à calculer à la main. Une erreur, et tout est à refaire.' },
  { icon: '📊', title: 'Excel qui ralentit tout', desc: 'Des colonnes qui débordent, des formules cassées, des fichiers perdus. Excel n\'a pas été conçu pour gérer une école.' },
  { icon: '❌', title: 'Erreurs de calcul embarrassantes', desc: 'Un bulletin mal calculé découvert par un parent ou un inspecteur. Votre crédibilité en prend un coup irréparable.' },
  { icon: '💸', title: 'Frais scolaires ingérables', desc: 'Qui a payé ? Combien reste dû ? Sans outil dédié, la comptabilité devient un cauchemar administratif quotidien.' },
  { icon: '😤', title: 'Parents qui perdent confiance', desc: 'Les parents modernes veulent un accès transparent. L\'attente et le manque d\'info nuisent à l\'image de votre école.' },
  { icon: '🔍', title: 'L\'inspecteur arrive sans prévenir', desc: 'Dossiers éparpillés, statistiques introuvables, archives en désordre. Votre école mérite d\'être prête à tout instant.' },
];

function Problems() {
  const [ref, vis] = useInView();
  return (
    <section className="py-20 md:py-28 bg-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <div className="text-center mb-14">
          <SectionTag>Le problème</SectionTag>
          <SectionTitle>Votre école court encore<br/>avec les outils d'hier.</SectionTitle>
          <SectionSub>Chaque semaine perdue sur Excel, c'est une semaine gagnée par vos concurrents qui ont déjà modernisé.</SectionSub>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {PROBLEMS.map(({ icon, title, desc }, i) => (
            <div key={title}
              className={`group p-6 rounded-2xl border border-red-100 bg-red-50/50 hover:bg-red-50 hover:border-red-200 transition-all ${vis ? 'lp-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${i * .08}s` }}>
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="font-bold text-slate-900 mb-2 text-sm">{title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        {/* Transition */}
        <div className="mt-16 text-center">
          <div className="inline-block bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold px-8 py-4 rounded-2xl text-base shadow-xl shadow-blue-500/20">
            Il existe une meilleure façon de gérer votre école. ↓
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Solution ─────────────────────────────────────────────────────────────────
function Solution() {
  const [ref, vis] = useInView();
  return (
    <section className="py-20 md:py-28 bg-gradient-to-br from-blue-950 to-indigo-950 relative overflow-hidden" ref={ref}>
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'radial-gradient(white 1px,transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="relative max-w-7xl mx-auto px-5 md:px-10">
        <div className="text-center mb-14">
          <SectionTag>La solution</SectionTag>
          <SectionTitle white>NotesCam. Simple, rapide,<br/>taillé pour le Cameroun.</SectionTitle>
          <SectionSub white>Conçu pour des directeurs comme vous, qui n'ont pas le temps de se former pendant 3 semaines.</SectionSub>
        </div>
        {/* Before/After */}
        <div className={`grid md:grid-cols-2 gap-6 ${vis ? 'lp-fade-up' : 'opacity-0'}`}>
          {/* Before */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-7 space-y-3">
            <p className="text-red-400 font-bold text-sm uppercase tracking-widest mb-4">Avant NotesCam</p>
            {['3 nuits sur les bulletins','Moyennes calculées à la main','Frais notés dans un cahier','Parents qui appellent sans cesse','Fichiers Excel impossibles à retrouver','Stress à chaque inspection'].map((t) => (
              <div key={t} className="flex items-center gap-3 text-slate-300 text-sm">
                <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold flex-shrink-0">✗</span>
                {t}
              </div>
            ))}
          </div>
          {/* After */}
          <div className="bg-white/10 border border-blue-400/20 rounded-2xl p-7 space-y-3">
            <p className="text-green-400 font-bold text-sm uppercase tracking-widest mb-4">Avec NotesCam</p>
            {['Bulletins générés en quelques heures','Zéro erreur de calcul garantie','Frais suivis en temps réel','Portail parents en 1 lien WhatsApp','Tout sur votre téléphone, partout','Inspection ? Toujours prêt.'].map((t) => (
              <div key={t} className="flex items-center gap-3 text-white text-sm">
                <span className="w-5 h-5 rounded-full bg-green-500/25 text-green-400 flex items-center justify-center text-xs font-bold flex-shrink-0">✓</span>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '📋', title: 'Bulletins générés en quelques heures', desc: 'Saisissez les notes, NotesCam calcule tout automatiquement. Bulletins complets, rangés, prêts à distribuer ou à imprimer.', badge: null },
  { icon: '🎯', title: 'Zéro erreur de moyenne, garantie', desc: 'Algorithme de calcul certifié. Coefficients, moyennes générales, classements — tout est exact, toujours, sans vérification manuelle.', badge: null },
  { icon: '👨‍👩‍👧', title: 'Les parents reçoivent tout sur WhatsApp', desc: 'Partagez un lien sécurisé. Les parents voient les notes, frais et informations de leur enfant depuis leur téléphone, sans application.', badge: 'Pro' },
  { icon: '💰', title: 'Plus aucun impayé ignoré', desc: 'Suivez chaque versement MTN MoMo / Orange Money en temps réel. Relancez les retards. Imprimez les reçus en un clic.', badge: 'École' },
  { icon: '🗓️', title: 'Emploi du temps en 10 minutes', desc: 'Créez et modifiez votre planning hebdomadaire visuellement. Vos enseignants le consultent depuis leur téléphone.', badge: 'Pro' },
  { icon: '📱', title: 'Votre école dans votre poche', desc: 'Application mobile optimisée. Fonctionne hors-ligne. Votre administration complète dans votre smartphone, 24h/24.', badge: null },
];

function Features() {
  const [ref, vis] = useInView();
  return (
    <section id="fonctionnalites" className="py-20 md:py-28 bg-slate-50" ref={ref}>
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <div className="text-center mb-14">
          <SectionTag>Fonctionnalités</SectionTag>
          <SectionTitle>Tout ce dont une école moderne<br/>a besoin. Rien de superflu.</SectionTitle>
          <SectionSub>Chaque fonctionnalité a été pensée pour un directeur africain, sur mobile, sans temps à perdre.</SectionSub>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon, title, desc, badge }, i) => (
            <div key={title}
              className={`group bg-white rounded-2xl p-7 shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all ${vis ? 'lp-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${i * .08}s` }}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  {icon}
                </div>
                {badge && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge === 'Pro' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                    {badge}
                  </span>
                )}
              </div>
              <h3 className="font-bold text-slate-900 mb-2 leading-snug">{title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function StatCard({ target, suffix, label, active }) {
  const n = useCounter(target, active);
  return (
    <div className="text-center">
      <div className="text-4xl md:text-5xl font-extrabold text-white mb-2">
        {n.toLocaleString()}{suffix}
      </div>
      <div className="text-blue-200/70 text-sm font-medium">{label}</div>
    </div>
  );
}

function Stats() {
  const [ref, vis] = useInView();
  return (
    <section className="py-16 md:py-20 bg-blue-700" ref={ref}>
      <div className="max-w-5xl mx-auto px-5 md:px-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <StatCard target={500}  suffix="+"  label="Élèves gérés"       active={vis} />
          <StatCard target={120}  suffix="+"  label="Bulletins générés"  active={vis} />
          <StatCard target={15}   suffix=""   label="Écoles partenaires" active={vis} />
          <StatCard target={98}   suffix="%"  label="Taux de satisfaction" active={vis} />
        </div>
      </div>
    </section>
  );
}

// ─── Galerie écoliers ──────────────────────────────────────────────────────────
const GALLERY = [
  { src: '/landing/ecoliers-1.jpg', emoji: '🎒', label: 'Élèves du primaire',  span: 'row-span-2' },
  { src: '/landing/ecoliers-2.jpg', emoji: '📚', label: 'En classe',            span: '' },
  { src: '/landing/ecoliers-3.jpg', emoji: '✏️', label: 'Travail de groupe',   span: '' },
  { src: '/landing/ecoliers-4.jpg', emoji: '🎓', label: 'Fierté de réussir',   span: 'row-span-2' },
  { src: '/landing/ecoliers-5.jpg', emoji: '🏫', label: 'Cour de récréation',  span: '' },
  { src: '/landing/ecoliers-6.jpg', emoji: '😀', label: 'Sourires d’élèves',   span: '' },
];

function Gallery() {
  const [ref, vis] = useInView();
  return (
    <section className="py-20 md:py-28 bg-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <div className="text-center mb-14">
          <SectionTag>Au cœur de l'école</SectionTag>
          <SectionTitle>La réussite des élèves,<br/>mieux accompagnée.</SectionTitle>
          <SectionSub>Derrière chaque bulletin, il y a un enfant. NotesCam libère du temps administratif pour ce qui compte vraiment : enseigner.</SectionSub>
        </div>
        <div className={`grid grid-cols-2 md:grid-cols-4 auto-rows-[140px] md:auto-rows-[170px] gap-4 ${vis ? 'lp-fade-up' : 'opacity-0'}`}>
          {GALLERY.map(({ src, emoji, label, span }, i) => (
            <div key={i}
              className={`relative rounded-2xl overflow-hidden shadow-sm ring-1 ring-black/5 group ${span}`}>
              <SchoolPhoto src={src} alt={label} emoji={emoji} label={label}
                className="w-full h-full transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-blue-950/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="absolute bottom-2 left-3 right-3 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Prestige ─────────────────────────────────────────────────────────────────
function Prestige() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-5xl mx-auto px-5 md:px-10 text-center">
        <SectionTag>Positionnement</SectionTag>
        <SectionTitle>Les écoles modernes<br/>utilisent NotesCam.</SectionTitle>
        <p className="text-slate-500 text-lg mb-10 max-w-xl mx-auto">
          Rester sur Excel en 2025, c'est envoyer un message à vos parents et concurrents.<br/>
          <strong className="text-slate-800">Votre école vaut mieux que ça.</strong>
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          {[
            { icon: '🔒', text: 'Données hébergées et sécurisées' },
            { icon: '📱', text: 'Optimisé mobile & hors-ligne' },
            { icon: '🇨🇲', text: 'Conçu pour le Cameroun' },
            { icon: '💳', text: 'Paiement MTN MoMo / Orange Money' },
            { icon: '⚡', text: 'Bulletins en quelques heures' },
            { icon: '🎓', text: 'Support pédagogique inclus' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 text-blue-800 text-sm font-semibold px-4 py-2.5 rounded-xl">
              <span>{icon}</span> {text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    text: 'Avant NotesCam, mes enseignants passaient 3 nuits sur les bulletins. Maintenant c\'est réglé en une après-midi. Le prix d\'une année vaut largement une seule nuit de travail économisée.',
    name: 'M. Jean-Baptiste MBASSI', role: 'Directeur', school: 'Collège Notre-Dame de la Paix, Yaoundé', init: 'JM',
  },
  {
    text: 'Les parents nous contactaient sans cesse pour les résultats. Depuis le portail parents, les appels ont diminué de 80%. C\'est professionnel et ça inspire confiance.',
    name: 'Mme Hortense NKOLO', role: 'Fondatrice & Directrice', school: 'Institut Privé Excellence, Douala', init: 'HN',
  },
  {
    text: 'J\'étais sceptique. Mais en 30 minutes, mon secrétaire maîtrisait l\'outil. La formation est incluse, le support répond vite. On ne reviendra jamais en arrière.',
    name: 'M. Patrick ONDOA', role: 'Principal', school: 'Lycée Technique Moderne, Bafoussam', init: 'PO',
  },
];

function Testimonials() {
  const [ref, vis] = useInView();
  return (
    <section id="temoignages" className="py-20 md:py-28 bg-slate-50" ref={ref}>
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <div className="text-center mb-14">
          <SectionTag>Témoignages</SectionTag>
          <SectionTitle>Ce que disent les directeurs<br/>qui ont osé changer.</SectionTitle>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(({ text, name, role, school, init }, i) => (
            <div key={name}
              className={`bg-white rounded-2xl p-7 shadow-sm border border-gray-100 hover:shadow-lg transition-all flex flex-col ${vis ? 'lp-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${i * .1}s` }}>
              <Stars />
              <blockquote className="text-slate-700 text-sm leading-relaxed mt-4 flex-1">
                "{text}"
              </blockquote>
              <div className="flex items-center gap-3 mt-6 pt-5 border-t border-gray-100">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {init}
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">{name}</div>
                  <div className="text-slate-400 text-xs">{role} · {school}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing (tarification par élève, négociée) ────────────────────────────────
const PRICE_INCLUDED = [
  'Toutes les fonctionnalités incluses',
  'Élèves & classes illimités',
  'Notes, bulletins & relevés',
  'Frais scolaires & reçus',
  'Portail parents WhatsApp',
  'Emploi du temps & rapports',
  'Sans filigrane · Export PDF / Excel',
  'Formation & support inclus',
];

function Pricing() {
  const [ref, vis] = useInView();
  const [students, setStudents] = useState(250);
  const PRICE = 1000; // FCFA par élève — exemple ; le tarif final est négocié.
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
  const total = (Number(students) || 0) * PRICE;

  return (
    <section id="tarifs" className="py-20 md:py-28 bg-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <div className="text-center mb-10">
          <SectionTag>Tarifs</SectionTag>
          <SectionTitle>Une tarification juste :<br/>vous payez par élève.</SectionTitle>
          <SectionSub>
            Pas de forfait rigide. Un prix unique <strong>par élève</strong>, négocié avec vous selon la taille
            de votre établissement. Toutes les fonctionnalités sont incluses.
          </SectionSub>
        </div>

        <div className={`grid lg:grid-cols-2 gap-6 items-stretch ${vis ? 'lp-fade-up' : 'opacity-0'}`}>
          {/* Estimateur */}
          <div className="rounded-3xl p-8 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl shadow-blue-500/25 flex flex-col">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-200 mb-2">Estimez votre tarif</p>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-5xl font-extrabold">{fmt(PRICE)}</span>
              <span className="text-blue-200 mb-1.5 text-sm">FCFA / élève<sup>*</sup></span>
            </div>
            <p className="text-blue-100/80 text-sm mb-6">Exemple indicatif — le prix réel est négocié pour votre école.</p>

            <label className="text-sm font-semibold text-blue-100 mb-2">
              Nombre d'élèves : <span className="text-white font-bold">{fmt(students)}</span>
            </label>
            <input
              type="range" min="30" max="2000" step="10"
              value={students}
              onChange={(e) => setStudents(Number(e.target.value))}
              className="w-full accent-amber-400 mb-2 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-blue-200/70 mb-6">
              <span>30</span><span>2 000</span>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/15 p-5 text-center mb-6">
              <p className="text-xs text-blue-200 mb-1">Budget estimé pour votre établissement</p>
              <p className="text-4xl font-extrabold text-amber-300">{fmt(total)} <span className="text-lg text-amber-200">FCFA</span></p>
              <p className="text-[11px] text-blue-200/70 mt-1">{fmt(PRICE)} FCFA × {fmt(students)} élèves</p>
            </div>

            <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
              className="mt-auto block text-center font-bold py-3.5 rounded-xl text-sm bg-amber-400 text-amber-950 hover:bg-amber-300 transition-all shadow-lg">
              💬 Obtenir mon devis personnalisé
            </a>
            <p className="text-[11px] text-blue-200/60 mt-3 text-center"><sup>*</sup> Tarif dégressif négocié selon l'effectif.</p>
          </div>

          {/* Tout inclus + essai gratuit */}
          <div className="rounded-3xl p-8 bg-white border border-gray-200 shadow-sm flex flex-col">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Tout est inclus</p>
            <h3 className="text-2xl font-extrabold text-slate-900 mb-5">Un seul tarif, zéro option cachée.</h3>
            <div className="space-y-2.5 flex-1">
              {PRICE_INCLUDED.map((t) => (
                <div key={t} className="flex items-center gap-2.5 text-sm text-slate-700">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">✓</span>
                  {t}
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl bg-blue-50 border border-blue-100 p-5">
              <p className="text-sm font-bold text-blue-900 mb-1">🎁 Essayez gratuitement</p>
              <p className="text-xs text-blue-700/80 mb-4">Démarrez sans carte bancaire et testez NotesCam avec votre première classe.</p>
              <Link to="/signup"
                className="block text-center font-bold py-3 rounded-xl text-sm bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20">
                Commencer gratuitement
              </Link>
            </div>
          </div>
        </div>

        {/* Payment methods */}
        <div className="mt-10 text-center text-sm text-slate-400">
          Paiement accepté : <strong className="text-slate-600">MTN Mobile Money</strong> · <strong className="text-slate-600">Orange Money</strong> · Virement bancaire
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'Et si mon école n\'a pas toujours internet ?', a: 'NotesCam fonctionne hors-ligne. Les données sont sauvegardées localement sur vos appareils et synchronisées automatiquement dès que la connexion revient. Vos données ne sont jamais perdues.' },
  { q: 'Les données de mon école sont-elles sécurisées ?', a: 'Vos données sont hébergées sur des serveurs sécurisés (chiffrement SSL, sauvegardes automatiques quotidiennes). Nous ne partageons jamais vos informations avec des tiers. Votre école reste propriétaire de ses données.' },
  { q: 'Mes enseignants vont-ils savoir utiliser NotesCam ?', a: 'L\'interface a été conçue pour être utilisée sans formation technique. La prise en main se fait en moins de 30 minutes. Notre équipe vous accompagne lors de la mise en place, gratuitement.' },
  { q: 'Comment fonctionne la tarification par élève ?', a: 'Vous payez un montant unique par élève inscrit, et toutes les fonctionnalités sont incluses. Le prix par élève est négocié avec vous selon la taille de votre établissement (tarif dégressif). Contactez-nous sur WhatsApp pour obtenir votre devis personnalisé.' },
  { q: 'Puis-je essayer gratuitement avant de payer ?', a: 'Oui. Vous démarrez gratuitement, sans carte bancaire, et testez NotesCam avec votre première classe. Vous ne passez au tarif par élève que lorsque vous êtes convaincu.' },
  { q: 'Comment se passe le paiement ?', a: 'Nous acceptons MTN Mobile Money, Orange Money et virement bancaire. La facturation se fait selon l\'effectif de votre établissement, au tarif par élève convenu ensemble.' },
  { q: 'Que se passe-t-il si je veux arrêter ?', a: 'Vous pouvez annuler à tout moment, sans frais de résiliation. Vos données restent accessibles pendant 30 jours après l\'arrêt. Vous pouvez les exporter en format Excel ou PDF avant de partir.' },
];

function FAQ() {
  const [open, setOpen] = useState(null);
  const [ref, vis] = useInView();
  return (
    <section id="faq" className="py-20 md:py-28 bg-slate-50" ref={ref}>
      <div className="max-w-3xl mx-auto px-5 md:px-10">
        <div className="text-center mb-14">
          <SectionTag>FAQ</SectionTag>
          <SectionTitle>Vos questions,<br/>nos réponses franches.</SectionTitle>
        </div>
        <div className={`space-y-3 ${vis ? 'lp-fade-up' : 'opacity-0'}`}>
          {FAQS.map(({ q, a }, i) => (
            <div key={q} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-slate-800 text-sm hover:text-blue-700 transition-colors">
                <span>{q}</span>
                <span className={`flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-black transition-transform ${open === i ? 'rotate-45' : ''}`}>
                  +
                </span>
              </button>
              {open === i && (
                <div className="px-6 pb-5 text-slate-500 text-sm leading-relaxed border-t border-gray-50 pt-4">
                  {a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTA() {
  const [ref, vis] = useInView();
  return (
    <section className="py-20 md:py-28 bg-gradient-to-br from-blue-700 to-indigo-800 relative overflow-hidden" ref={ref}>
      <div className="absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: 'radial-gradient(white 1px,transparent 1px)', backgroundSize: '28px 28px' }} />
      <div className={`relative max-w-4xl mx-auto px-5 md:px-10 text-center ${vis ? 'lp-fade-up' : 'opacity-0'}`}>
        <div className="text-4xl mb-5">🎓</div>
        <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-5">
          Votre école change aujourd'hui,<br/>ou elle attend encore un an.
        </h2>
        <p className="text-blue-100 text-lg mb-10 max-w-2xl mx-auto">
          Des directeurs comme vous ont déjà transformé leur administration. Il ne vous faut que 5 minutes pour commencer.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link to="/signup"
            className="flex items-center justify-center gap-2 bg-white text-blue-700 font-extrabold px-8 py-4 rounded-xl text-base hover:bg-blue-50 transition-all shadow-2xl">
            Commencer gratuitement — sans carte
          </Link>
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-8 py-4 rounded-xl text-base transition-all shadow-xl">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.502 3.93 1.385 5.608L0 24l6.533-1.371A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.877 9.877 0 01-5.031-1.371l-.36-.214-3.732.978.997-3.648-.235-.374A9.849 9.849 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118c5.466 0 9.882 4.415 9.882 9.882 0 5.466-4.416 9.882-9.882 9.882z"/></svg>
            Demander une démo WhatsApp
          </a>
        </div>
        <p className="text-blue-200/60 text-sm">Essai 14 jours gratuit · Aucune carte bancaire requise · Annulation facile</p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400 pt-14 pb-8">
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <LogoMark size={32} />
              <span className="text-white font-extrabold text-lg">NotesCam</span>
            </div>
            <p className="text-sm leading-relaxed mb-4">La plateforme de gestion scolaire des écoles privées modernes d'Afrique francophone.</p>
            <div className="flex gap-3">
              <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 bg-green-500/15 hover:bg-green-500/25 rounded-lg flex items-center justify-center text-green-400 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.502 3.93 1.385 5.608L0 24l6.533-1.371A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.877 9.877 0 01-5.031-1.371l-.36-.214-3.732.978.997-3.648-.235-.374A9.849 9.849 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118c5.466 0 9.882 4.415 9.882 9.882 0 5.466-4.416 9.882-9.882 9.882z"/></svg>
              </a>
              <a href="https://www.facebook.com/profile.php?id=61589995983671" target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 bg-blue-500/15 hover:bg-blue-500/25 rounded-lg flex items-center justify-center text-blue-400 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              </a>
            </div>
          </div>
          {/* Links */}
          {[
            { title: 'Produit',  links: ['#fonctionnalites', '#tarifs', '#temoignages', '#faq'].map((h, i) => ({ href: h, label: ['Fonctionnalités','Tarifs','Témoignages','FAQ'][i] })) },
            { title: 'Compte',   links: [{ href: '/signup', label: 'Créer un compte' }, { href: '/login', label: 'Se connecter' }, { href: WA_LINK, label: 'Demander une démo' }] },
            { title: 'Contact',  links: [{ href: WA_LINK, label: 'WhatsApp direct' }, { href: 'mailto:contact@notescam.app', label: 'Email' }, { href: 'https://www.facebook.com/profile.php?id=61589995983671', label: 'Page Facebook' }] },
          ].map(({ title, links }) => (
            <div key={title}>
              <p className="text-white font-bold text-sm mb-4">{title}</p>
              <div className="space-y-2.5">
                {links.map(({ href, label }) => (
                  href.startsWith('/') ? (
                    <Link key={label} to={href} className="block text-sm hover:text-white transition-colors">{label}</Link>
                  ) : (
                    <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="block text-sm hover:text-white transition-colors">{label}</a>
                  )
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <span>© {new Date().getFullYear()} NotesCam — Promoteur &amp; actionnaire principal : Hassan Ousman</span>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="text-slate-500 hover:text-white transition-colors">Conditions d'utilisation</Link>
            <div className="flex items-center gap-2 text-slate-500">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              MTN Mobile Money · Orange Money
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Mobile sticky bar ────────────────────────────────────────────────────────
function MobileStickyBar() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const fn = () => setShow(window.scrollY > 400);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-200 shadow-2xl px-4 py-3 flex gap-3">
      <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
        className="flex-1 bg-green-500 text-white text-sm font-bold py-3 rounded-xl text-center flex items-center justify-center gap-1.5">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.502 3.93 1.385 5.608L0 24l6.533-1.371A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.877 9.877 0 01-5.031-1.371l-.36-.214-3.732.978.997-3.648-.235-.374A9.849 9.849 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118c5.466 0 9.882 4.415 9.882 9.882 0 5.466-4.416 9.882-9.882 9.882z"/></svg>
        Démo WhatsApp
      </a>
      <Link to="/signup"
        className="flex-1 bg-blue-600 text-white text-sm font-bold py-3 rounded-xl text-center">
        Essai gratuit
      </Link>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <>
      <GlobalStyles />
      <Navbar />
      <main>
        <Hero />
        <LogoBar />
        <Problems />
        <Solution />
        <Gallery />
        <Features />
        <Stats />
        <Prestige />
        <Testimonials />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <MobileStickyBar />
    </>
  );
}
