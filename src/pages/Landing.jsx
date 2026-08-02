import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import LogoMark from '../components/LogoMark';

// ═══════════════════════════════════════════════════════════════════════════
//  NotesCam — Landing premium (SaaS 2026)
//  Stack : Vite + React + Tailwind + Framer Motion.
//  DA : fond clair premium · dégradés subtils · ombres douces · glassmorphism
//       léger · charte ocre/terracotta + bleu confiance + accents verts.
//  AUCUN PRIX sur cette page : ni montant, ni pourcentage de remise, ni
//  échéancier. La qualification passe par la demande de devis (WA_DEVIS_LINK).
// ═══════════════════════════════════════════════════════════════════════════

// ─── Coordonnées (À MODIFIER ICI UNIQUEMENT) ──────────────────────────────────
const PHONE_DISPLAY = '+237 670 894 721';
const PHONE_RAW     = '237670894721';
const WHATSAPP_RAW  = '237670894721';
const EMAIL         = 'hassanousmane0@gmail.com';

// ─── Liens CTA dérivés ────────────────────────────────────────────────────────
const WA_MSG    = encodeURIComponent('Bonjour, je souhaite une démonstration de NotesCam pour mon établissement.');
const WA_DEVIS  = encodeURIComponent('Bonjour, je souhaite un devis NotesCam pour mon établissement.');
const WA_LINK   = `https://wa.me/${WHATSAPP_RAW}?text=${WA_MSG}`;
const WA_DEVIS_LINK = `https://wa.me/${WHATSAPP_RAW}?text=${WA_DEVIS}`;
const TEL_LINK  = `tel:+${PHONE_RAW}`;
const MAIL_LINK = `mailto:${EMAIL}?subject=${encodeURIComponent('Demande de démonstration NotesCam')}`;

// ─── SEO ───────────────────────────────────────────────────────────────────────
const SEO_TITLE = 'NotesCam — La gestion scolaire simple et fiable, même sans connexion';
const SEO_DESC  = "Logiciel de gestion scolaire conçu pour les réalités africaines : Cloud ou Local, fonctionne avec ou sans Internet. Notes, bulletins et scolarité. Devis sur demande.";

// ─── Variants Framer Motion réutilisables ─────────────────────────────────────
const EASE = [0.21, 0.47, 0.32, 0.98];
const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};
const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
};

// Section animée (révélation au scroll, une seule fois)
function Reveal({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 26 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay } } }}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}>
      {children}
    </motion.div>
  );
}

// ─── Icône WhatsApp ─────────────────────────────────────────────────────────────
function WhatsAppIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.502 3.93 1.385 5.608L0 24l6.533-1.371A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.877 9.877 0 01-5.031-1.371l-.36-.214-3.732.978.997-3.648-.235-.374A9.849 9.849 0 012.118 12C2.118 6.533 6.533 2.118 12 2.118c5.466 0 9.882 4.415 9.882 9.882 0 5.466-4.416 9.882-9.882 9.882z"/>
    </svg>
  );
}

// ─── En-tête de section réutilisable ──────────────────────────────────────────
function SectionHead({ tag, tagColor = 'terracotta', title, sub, white }) {
  const tagCls = white
    ? 'bg-white/10 text-white border border-white/20'
    : tagColor === 'blue'
      ? 'bg-blue-100 text-blue-700'
      : tagColor === 'ocre'
        ? 'bg-ocre-100 text-ocre-800'
        : 'bg-terracotta-100 text-terracotta-700';
  return (
    <Reveal className="text-center max-w-3xl mx-auto mb-14">
      {tag && <span className={`inline-block text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-4 ${tagCls}`}>{tag}</span>}
      <h2 className={`text-3xl md:text-4xl font-extrabold leading-tight mb-4 ${white ? 'text-white' : 'text-slate-900'}`}>{title}</h2>
      {sub && <p className={`text-lg leading-relaxed ${white ? 'text-blue-100/80' : 'text-slate-500'}`}>{sub}</p>}
    </Reveal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  NAVBAR — glassmorphism au scroll, CTA démo permanent
// ═══════════════════════════════════════════════════════════════════════════
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen]         = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const links = [
    { href: '#fonctionnalites', label: 'Fonctionnalités' },
    { href: '#demo',            label: 'Démo' },
    { href: '#versions',        label: 'Cloud & Local' },
    { href: '#faq',             label: 'FAQ' },
  ];

  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: EASE }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] border-b border-white/60' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-5 md:px-10 flex items-center justify-between h-16">
        <a href="#accueil" className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="font-extrabold text-lg tracking-tight text-slate-900">NotesCam</span>
        </a>

        <div className="hidden md:flex items-center gap-7">
          {links.map(({ href, label }) => (
            <a key={href} href={href} className="text-sm font-medium text-slate-600 hover:text-terracotta-600 transition-colors">{label}</a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-terracotta-600 px-3 py-2 rounded-lg transition-colors">Connexion</Link>
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
            className="text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-slate-900/15">
            Demander une démo
          </a>
        </div>

        <button onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}
          className="md:hidden p-2 rounded-lg text-slate-800">
          <div className="w-5 space-y-1.5">
            <span className={`block h-0.5 bg-current transition-transform ${open ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block h-0.5 bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 bg-current transition-transform ${open ? '-rotate-45 -translate-y-2' : ''}`} />
          </div>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 shadow-xl px-5 py-4 space-y-1">
          {links.map(({ href, label }) => (
            <a key={href} href={href} onClick={() => setOpen(false)}
              className="block text-sm font-medium text-slate-700 py-2.5 border-b border-slate-50">{label}</a>
          ))}
          <div className="pt-3 flex flex-col gap-2">
            <Link to="/login" onClick={() => setOpen(false)} className="text-sm text-center font-medium text-slate-600 py-2.5 rounded-xl border border-slate-200">Connexion</Link>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="text-sm text-center font-bold bg-slate-900 text-white py-3 rounded-xl">Demander une démo</a>
          </div>
        </div>
      )}
    </motion.nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MOCKUP PRODUIT — fenêtre app NotesCam en HTML/CSS (net en retina)
// ═══════════════════════════════════════════════════════════════════════════
function ProductMockup() {
  const bars = [62, 48, 78, 55, 88, 70, 95];
  return (
    <div className="rounded-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 bg-white select-none">
      {/* Barre fenêtre */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <div className="flex-1 mx-3 bg-white rounded-md h-5 flex items-center px-3 gap-1.5 border border-slate-100">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] text-slate-400">notescam.app / tableau-de-bord</span>
        </div>
      </div>
      {/* Corps : sidebar + contenu */}
      <div className="flex">
        {/* Sidebar */}
        <div className="hidden sm:flex flex-col w-32 bg-slate-900 p-3 gap-1">
          <div className="flex items-center gap-1.5 px-1 mb-3">
            <span className="w-5 h-5 rounded-md bg-terracotta-500" />
            <span className="text-white text-[11px] font-bold">NotesCam</span>
          </div>
          {[['📊','Tableau'],['📝','Notes'],['📄','Bulletins'],['👥','Élèves'],['💰','Paiements']].map(([i,l], idx) => (
            <div key={l} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium ${idx===0 ? 'bg-white/10 text-white' : 'text-slate-400'}`}>
              <span>{i}</span>{l}
            </div>
          ))}
        </div>
        {/* Contenu */}
        <div className="flex-1 p-4 bg-slate-50/60">
          {/* KPI */}
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            {[['Moyenne','13,4','/20','text-blue-600'],['Réussite','86 %','','text-green-600'],['Élèves','412','','text-terracotta-600']].map(([l,v,u,c]) => (
              <div key={l} className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-sm">
                <div className="text-[9px] text-slate-400 font-medium">{l}</div>
                <div className={`text-base font-extrabold ${c}`}>{v}<span className="text-[9px] text-slate-300 font-semibold">{u}</span></div>
              </div>
            ))}
          </div>
          {/* Graphe */}
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm mb-3">
            <div className="text-[9px] text-slate-400 font-semibold mb-2">Moyennes par séquence</div>
            <div className="flex items-end gap-1.5 h-16">
              {bars.map((h, i) => (
                <motion.div key={i}
                  initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: i * 0.06, ease: EASE }}
                  className={`flex-1 rounded-t-md ${i === bars.length - 1 ? 'bg-terracotta-500' : 'bg-blue-200'}`} />
              ))}
            </div>
          </div>
          {/* Lignes */}
          <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-sm space-y-1.5">
            {[['Bulletins — 3e Trimestre','✓ Générés','text-green-600'],['Paiements MoMo','+ 245 000','text-terracotta-600']].map(([l,v,c]) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-[9.5px] text-slate-500">{l}</span>
                <span className={`text-[9.5px] font-bold ${c}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HERO
// ═══════════════════════════════════════════════════════════════════════════
const HERO_BADGES = ['Hors ligne', 'Réseau local', 'Cloud', 'Synchronisation automatique'];

function Hero() {
  return (
    <section id="accueil" className="relative overflow-hidden bg-gradient-to-b from-ocre-50 via-white to-white pt-28 md:pt-36 pb-20 md:pb-28">
      {/* Décor premium */}
      <div className="absolute -top-32 -left-32 w-[36rem] h-[36rem] bg-terracotta-200/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-10 right-0 w-[30rem] h-[30rem] bg-blue-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.4] pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(#0f172a0a 1px,transparent 1px),linear-gradient(90deg,#0f172a0a 1px,transparent 1px)', backgroundSize: '54px 54px', maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%,#000 40%,transparent 100%)' }} />

      <div className="relative max-w-7xl mx-auto px-5 md:px-10">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          {/* Texte */}
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-white border border-slate-200 shadow-sm text-slate-700 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-6">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Nouveau — Version Cloud &amp; Local
            </motion.div>

            <motion.h1 variants={fadeUp} className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-[1.08] mb-5">
              La gestion scolaire simple, fiable —{' '}
              <span className="bg-gradient-to-r from-terracotta-500 to-ocre-500 bg-clip-text text-transparent">même sans connexion.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-lg md:text-xl text-slate-500 leading-relaxed mb-7 max-w-lg">
              Version Cloud ou Local. Fonctionne avec ou sans Internet.
            </motion.p>

            {/* Badges */}
            <motion.div variants={fadeUp} className="flex flex-wrap gap-2 mb-8">
              {HERO_BADGES.map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm">
                  <span className="text-green-600 font-bold">✓</span> {b}
                </span>
              ))}
            </motion.div>

            {/* CTA */}
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row flex-wrap gap-3">
              <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 text-white font-bold px-7 py-4 rounded-xl text-base transition-all shadow-xl shadow-terracotta-500/30 hover:-translate-y-0.5">
                <WhatsAppIcon className="w-5 h-5" /> Demander une démonstration
              </a>
              <Link to="/signup"
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 font-bold px-7 py-4 rounded-xl text-base transition-all shadow-sm hover:-translate-y-0.5">
                Essayer NotesCam <span className="text-terracotta-500">→</span>
              </Link>
              <a href={WA_DEVIS_LINK} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 text-slate-600 hover:text-terracotta-600 font-bold px-4 py-4 rounded-xl text-base transition-colors">
                Demander un devis
              </a>
            </motion.div>
          </motion.div>

          {/* Mockup + flottants */}
          <motion.div className="relative" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: EASE }}>
            <motion.div animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}>
              <ProductMockup />
            </motion.div>

            {/* Carte flottante : bulletin */}
            <motion.div animate={{ y: [0, 10, 0] }} transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
              className="absolute -left-4 md:-left-8 top-1/4 bg-white rounded-xl shadow-xl ring-1 ring-slate-900/5 p-3 flex items-center gap-2.5">
              <span className="text-xl">⚡</span>
              <div>
                <div className="text-[10px] text-slate-400 font-medium">Bulletin généré en</div>
                <div className="text-sm font-extrabold text-slate-800">3 secondes</div>
              </div>
            </motion.div>

            {/* Badge offline */}
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
              className="absolute -right-2 md:-right-6 bottom-1/4 bg-green-500 text-white rounded-xl shadow-xl px-3 py-2 text-xs font-bold">
              ✓ Internet coupé — ça continue
            </motion.div>

            {/* Vignette photo école (contexte réel) */}
            <div className="absolute -right-3 -top-5 w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white">
              <img src="/assets/hero-ecole.jpg" alt="Cour d'école avec une enseignante et des élèves" loading="lazy" className="w-full h-full object-cover" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PREUVE — bandeau chiffres animés
// ═══════════════════════════════════════════════════════════════════════════
function Counter({ to, suffix = '', decimals = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf, start;
    const dur = 1400;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);
  const val = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString('fr-FR');
  return <span ref={ref}>{val}{suffix}</span>;
}

const STATS = [
  { to: 15,   suffix: '+',   label: 'Établissements équipés' },
  { to: 4800, suffix: '+',   label: 'Élèves gérés' },
  { to: 12000, suffix: '+',  label: 'Bulletins générés' },
  { to: 99.9, suffix: '%',   label: 'Disponibilité', decimals: 1 },
];

function ProofBar() {
  return (
    <section className="bg-slate-900 py-14 md:py-16">
      <div className="max-w-6xl mx-auto px-5 md:px-10">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <motion.div key={s.label} variants={fadeUp} className="text-center">
              <div className="text-3xl md:text-4xl font-extrabold text-white mb-1.5">
                <Counter to={s.to} suffix={s.suffix} decimals={s.decimals} />
              </div>
              <div className="text-slate-400 text-sm font-medium">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FONCTIONNALITÉS — cartes premium
// ═══════════════════════════════════════════════════════════════════════════
const FEATURES = [
  { icon: '📶', title: 'Fonctionne même sans Internet', desc: "Saisissez les notes, imprimez les bulletins, gérez les élèves et la scolarité même en l'absence totale de connexion." },
  { icon: '🔒', title: 'Données sécurisées', desc: 'Toutes les informations sont enregistrées localement et peuvent être synchronisées dans le cloud.' },
  { icon: '💻', title: 'Installation sur votre ordinateur', desc: "NotesCam s'installe directement sur votre ordinateur ou votre serveur local." },
  { icon: '🖧', title: 'Réseau local (LAN)', desc: 'Plusieurs utilisateurs travaillent simultanément dans le même établissement sans connexion Internet.' },
  { icon: '📄', title: 'Bulletins automatiques', desc: 'Génération automatique des bulletins conformes aux systèmes camerounais francophone, anglophone et bilingue.' },
  { icon: '⚡', title: 'Gain de temps', desc: 'Des journées entières de calculs et de saisies manuelles remplacées par quelques clics.' },
];

function Features() {
  return (
    <section id="fonctionnalites" className="py-20 md:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <SectionHead tag="Fonctionnalités" title={<>Tout ce dont une école moderne<br/>a besoin. Rien de superflu.</>}
          sub="Chaque fonctionnalité pensée pour un établissement africain, sur mobile comme sur ordinateur." />
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon, title, desc }) => (
            <motion.div key={title} variants={fadeUp} whileHover={{ y: -6 }}
              className="group relative bg-white rounded-2xl p-7 border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_40px_-12px_rgba(15,23,42,0.18)] transition-shadow">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-terracotta-400 to-ocre-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-terracotta-100 to-ocre-100 flex items-center justify-center text-3xl mb-4">{icon}</div>
              <h3 className="font-bold text-slate-900 mb-2 text-lg leading-snug">{title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  DÉMONSTRATION — « Comment fonctionne NotesCam » (4 étapes + progression)
// ═══════════════════════════════════════════════════════════════════════════
const STEPS = [
  { n: '1', icon: '📝', title: 'Saisie des notes', desc: 'Les enseignants entrent les notes depuis un téléphone ou un ordinateur, même hors ligne.' },
  { n: '2', icon: '⚙️', title: 'Calcul automatique', desc: 'Moyennes, coefficients, rangs et statistiques calculés instantanément, sans erreur.' },
  { n: '3', icon: '📄', title: 'Bulletins générés', desc: 'Bulletins conformes produits automatiquement, prêts en quelques secondes.' },
  { n: '4', icon: '🖨️', title: 'Impression', desc: 'Impression ou export PDF pour distribution aux parents et archivage.' },
];

function Demonstration() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  return (
    <section id="demo" className="py-20 md:py-28 bg-ocre-50">
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <SectionHead tag="Démonstration" tagColor="ocre" title="Comment fonctionne NotesCam"
          sub="De la saisie à l'impression, en quatre étapes simples." />
        <div ref={ref} className="relative grid md:grid-cols-4 gap-6">
          {/* Ligne de progression (desktop) */}
          <div className="hidden md:block absolute top-9 left-[12%] right-[12%] h-0.5 bg-ocre-200 rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-terracotta-400 to-ocre-500"
              initial={{ width: 0 }} animate={inView ? { width: '100%' } : {}} transition={{ duration: 1.6, ease: EASE }} />
          </div>
          {STEPS.map((s, i) => (
            <motion.div key={s.n} className="relative text-center"
              initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay: i * 0.25, ease: EASE }}>
              <div className="relative z-10 mx-auto w-18 h-18 mb-5">
                <div className="w-18 h-18 rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5 flex items-center justify-center text-3xl mx-auto" style={{ width: '4.5rem', height: '4.5rem' }}>
                  {s.icon}
                </div>
                <span className="absolute -top-2 -right-1 md:right-6 w-6 h-6 rounded-full bg-terracotta-500 text-white text-xs font-extrabold flex items-center justify-center shadow">{s.n}</span>
              </div>
              <h3 className="font-bold text-slate-900 mb-2">{s.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed px-2">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  COMPARAISON — NotesCam vs Excel vs Logiciels en ligne
// ═══════════════════════════════════════════════════════════════════════════
const COMPARE_ROWS = [
  ['Fonctionne sans Internet',          'yes', 'partial', 'no'],
  ['Calcul automatique des moyennes',   'yes', 'no',      'yes'],
  ['Bulletins conformes générés',       'yes', 'no',      'yes'],
  ['Réseau local multi-postes',         'yes', 'no',      'no'],
  ['Vos données restent chez vous',     'yes', 'yes',     'no'],
  ['Sauvegarde automatique',            'yes', 'no',      'yes'],
  ['Continue pendant les coupures',     'yes', 'partial', 'no'],
];
function Cell({ v }) {
  if (v === 'yes')     return <span className="inline-flex w-6 h-6 rounded-full bg-green-100 text-green-700 items-center justify-center text-sm font-bold">✓</span>;
  if (v === 'partial') return <span className="inline-flex w-6 h-6 rounded-full bg-amber-100 text-amber-700 items-center justify-center text-sm font-bold">~</span>;
  return <span className="inline-flex w-6 h-6 rounded-full bg-red-50 text-red-400 items-center justify-center text-sm font-bold">✗</span>;
}

function Comparison() {
  return (
    <section id="comparaison" className="py-20 md:py-28 bg-white">
      <div className="max-w-5xl mx-auto px-5 md:px-10">
        <SectionHead tag="Comparaison" title="Pourquoi NotesCam fait la différence"
          sub="Face à Excel et aux logiciels dépendants d'Internet, l'écart est net." />
        <Reveal className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 min-w-[560px]">
            <thead>
              <tr>
                <th className="text-left text-sm font-semibold text-slate-400 p-4"></th>
                <th className="p-4">
                  <div className="bg-gradient-to-br from-terracotta-500 to-terracotta-700 text-white rounded-t-2xl py-3 px-2 -mb-1 shadow-lg">
                    <div className="font-extrabold">NotesCam</div>
                    <div className="text-[11px] text-white/80 font-medium">Cloud & Local</div>
                  </div>
                </th>
                <th className="p-4 text-slate-500 font-bold text-sm">Excel</th>
                <th className="p-4 text-slate-500 font-bold text-sm">Logiciels<br/>en ligne</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(([label, a, b, c], i) => (
                <tr key={label} className={i % 2 ? 'bg-slate-50/60' : ''}>
                  <td className="text-sm font-medium text-slate-700 p-4">{label}</td>
                  <td className="p-4 text-center bg-terracotta-50/60 ring-1 ring-terracotta-100"><Cell v={a} /></td>
                  <td className="p-4 text-center"><Cell v={b} /></td>
                  <td className="p-4 text-center"><Cell v={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLOUD / LOCAL — flux visuel + illustration réseau + deux éditions
// ═══════════════════════════════════════════════════════════════════════════
const FLOW = [
  { icon: '☁️', label: 'Cloud' },
  { icon: '🔄', label: 'Synchronisation' },
  { icon: '🗄️', label: 'SQLite local' },
  { icon: '🖧', label: 'Réseau LAN' },
];
const EDITIONS = [
  { tag: 'En ligne', icon: '☁️', name: 'NotesCam Cloud', pitch: "Accessible partout, depuis n'importe quel appareil. Rien à installer.", accent: 'blue',
    points: ['Accès depuis tout téléphone ou ordinateur', 'Aucune installation à gérer', 'Données sauvegardées automatiquement dans le cloud', 'Mises à jour instantanées', 'Idéal avec une connexion correcte'] },
  { tag: 'Hors ligne · LAN', icon: '💻', name: 'NotesCam Local', pitch: 'Installé chez vous, fonctionne 100 % sans Internet, en réseau local.', accent: 'terracotta',
    points: ['Fonctionne sans aucune connexion Internet', 'Installé sur votre ordinateur ou serveur', 'Réseau local : plusieurs postes simultanés', 'Vos données restent dans votre établissement', 'Idéal en cas de connexion instable ou de délestage'] },
];

function CloudLocal() {
  return (
    <section id="versions" className="py-20 md:py-28 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 relative overflow-hidden">
      <div className="absolute -top-24 right-0 w-96 h-96 bg-terracotta-600/20 rounded-full blur-3xl" />
      <div className="relative max-w-7xl mx-auto px-5 md:px-10">
        <SectionHead white tag="Cloud & Local" title="En ligne ou en local — vous choisissez."
          sub="Mêmes fonctionnalités, deux façons de fonctionner. Combinez-les : travaillez en local et synchronisez dans le cloud quand vous voulez." />

        {/* Flux visuel */}
        <Reveal className="flex flex-wrap items-center justify-center gap-3 md:gap-4 mb-10">
          {FLOW.map((f, i) => (
            <div key={f.label} className="flex items-center gap-3 md:gap-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur border border-white/15 flex items-center justify-center text-2xl">{f.icon}</div>
                <span className="text-xs font-semibold text-blue-100/80">{f.label}</span>
              </div>
              {i < FLOW.length - 1 && <span className="text-white/30 text-xl">↔</span>}
            </div>
          ))}
        </Reveal>

        {/* Bandeau « Internet coupé » + illustration */}
        <Reveal className="grid md:grid-cols-2 gap-6 items-center mb-12">
          <div className="rounded-3xl overflow-hidden ring-1 ring-white/10 bg-white/5">
            {/* Illustration réseau local (Higgsfield). Repli : dégradé si absente. */}
            <img src="/assets/lan-network.jpg" alt="Ordinateurs d'une salle connectés à un serveur local"
              loading="lazy" className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          </div>
          <div className="text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-red-500/20 border border-red-400/30 text-red-200 text-xs font-bold px-4 py-2 rounded-full mb-4">
              <span className="w-2 h-2 bg-red-400 rounded-full" /> Internet coupé
            </div>
            <p className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
              = NotesCam continue<br/>de fonctionner.
            </p>
            <p className="text-blue-100/70 mt-3">Le serveur local de l'école reste joignable. Aucune donnée perdue, aucune interruption.</p>
          </div>
        </Reveal>

        {/* Deux éditions à parité */}
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}
          className="grid md:grid-cols-2 gap-6">
          {EDITIONS.map(({ tag, icon, name, pitch, accent, points }) => {
            const isTerra = accent === 'terracotta';
            return (
              <motion.div key={name} variants={fadeUp} whileHover={{ y: -5 }}
                className="rounded-3xl p-8 bg-white/5 backdrop-blur border border-white/10 hover:border-white/25 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${isTerra ? 'bg-terracotta-500/20' : 'bg-blue-500/20'}`}>{icon}</div>
                  <span className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full ${isTerra ? 'bg-terracotta-500 text-white' : 'bg-blue-500 text-white'}`}>{tag}</span>
                </div>
                <h3 className="text-2xl font-extrabold text-white mb-1.5">{name}</h3>
                <p className="text-blue-100/70 text-sm mb-6">{pitch}</p>
                <ul className="space-y-2.5">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-blue-50/90">
                      <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isTerra ? 'bg-terracotta-500/30 text-terracotta-200' : 'bg-blue-500/30 text-blue-200'}`}>✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SOLUTION CAMEROUN — checklist (contenu validé conservé)
// ═══════════════════════════════════════════════════════════════════════════
const SOLUTION_POINTS = ['Sans Internet', 'Avec une connexion instable', 'Pendant les coupures réseau', 'En réseau local dans votre établissement', 'Avec sauvegarde automatique'];

function SolutionCameroon() {
  return (
    <section className="py-20 md:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-5 md:px-10 grid md:grid-cols-2 gap-12 items-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 bg-ocre-100 text-ocre-800 text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-4">🇨🇲 Adapté au Cameroun</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight mb-5">Une solution taillée pour vos réalités.</h2>
          <p className="text-lg text-slate-500 leading-relaxed">
            Contrairement aux logiciels qui cessent de fonctionner lorsque la connexion disparaît, NotesCam continue à fonctionner :
          </p>
        </Reveal>
        <motion.ul variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} className="space-y-3">
          {SOLUTION_POINTS.map((point) => (
            <motion.li key={point} variants={fadeUp} className="flex items-start gap-3 bg-ocre-50 border border-ocre-100 rounded-xl px-5 py-4">
              <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">✓</span>
              <span className="text-slate-800 font-semibold">{point}</span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

// Sections TARIFS et OFFRE RENTRÉE retirées : plus aucun montant ni pourcentage
// commercial sur la page publique. La demande de devis reste le point d'entrée
// (WA_DEVIS_LINK, présent dans l'en-tête, le hero et l'appel à l'action final).

// ═══════════════════════════════════════════════════════════════════════════
//  INCLUS DANS TOUTES LES FORMULES (conservé)
// ═══════════════════════════════════════════════════════════════════════════
const INCLUDED = ['Installation complète', "Importation des listes d'élèves", "Paramétrage de l'établissement", 'Formation du personnel', 'Mises à jour du logiciel', 'Assistance technique'];

function IncludedAll() {
  return (
    <section className="py-20 md:py-24 bg-white">
      <div className="max-w-5xl mx-auto px-5 md:px-10">
        <SectionHead tag="Toujours inclus" tagColor="blue" title="Inclus dans toutes les formules." />
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {INCLUDED.map((item) => (
            <motion.div key={item} variants={fadeUp} className="flex items-center gap-3 bg-ocre-50 border border-ocre-100 rounded-xl px-5 py-4">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">✓</span>
              <span className="text-slate-800 font-semibold text-sm">{item}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  TÉMOIGNAGES
// ═══════════════════════════════════════════════════════════════════════════
const TESTIMONIALS = [
  { text: "Avant NotesCam, mes enseignants passaient des nuits sur les bulletins. Aujourd'hui, tout est prêt en une après-midi, même quand le réseau est coupé.", name: 'M. Patrick ONDOA', role: 'Proviseur', school: 'Lycée Technique Moderne, Bafoussam', init: 'PO' },
  { text: "J'ai installé NotesCam en local sur le serveur de l'école. Plus de dépendance à Internet, et les données restent chez nous. C'est exactement ce qu'il nous fallait.", name: 'Mme Hortense NKOLO', role: "Fondatrice d'école", school: 'Institut Privé Excellence, Douala', init: 'HN' },
  { text: "Le suivi des absences et de la discipline est devenu simple. Je gère tout depuis un seul écran, et les bulletins sortent sans erreur.", name: 'M. Jean-Baptiste MBASSI', role: 'Surveillant général', school: 'Collège Notre-Dame, Yaoundé', init: 'JM' },
];

function Stars() { return <span className="text-amber-400 text-sm tracking-tight">★★★★★</span>; }

function Testimonials() {
  return (
    <section id="temoignages" className="py-20 md:py-28 bg-ocre-50">
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <SectionHead tag="Témoignages" title="Ils ont modernisé leur établissement." />
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}
          className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(({ text, name, role, school, init }) => (
            <motion.div key={name} variants={fadeUp} whileHover={{ y: -5 }}
              className="bg-white rounded-2xl p-7 border border-slate-100 shadow-[0_10px_30px_-15px_rgba(15,23,42,0.2)] flex flex-col">
              <Stars />
              <blockquote className="text-slate-700 text-sm leading-relaxed mt-4 flex-1">« {text} »</blockquote>
              <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-100">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-terracotta-500 to-ocre-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{init}</div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">{name}</div>
                  <div className="text-slate-400 text-xs">{role} · {school}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  FAQ
// ═══════════════════════════════════════════════════════════════════════════
const FAQS = [
  { q: 'NotesCam fonctionne-t-il sans Internet ?', a: "Oui, totalement. NotesCam enregistre vos données localement et vous permet de saisir les notes, générer les bulletins et gérer la scolarité sans aucune connexion. La synchronisation se fait automatiquement lorsque la connexion revient (version Cloud) ou via votre serveur local (version LAN)." },
  { q: 'Comment installer NotesCam ?', a: "Pour la version Cloud, aucune installation : vous créez un compte et vous commencez. Pour la version Local, nous installons NotesCam sur votre ordinateur ou votre serveur local lors de la mise en place — c'est inclus dans toutes les formules." },
  { q: 'Puis-je utiliser plusieurs ordinateurs ?', a: "Oui. En réseau local (LAN), plusieurs postes de l'établissement se connectent simultanément au même serveur, sans Internet. Le nombre de comptes utilisateurs est défini avec vous lors du devis, selon la taille de votre établissement." },
  { q: 'Les données sont-elles sécurisées ?', a: "Vos données sont enregistrées localement et peuvent être synchronisées dans le cloud avec chiffrement et sauvegardes automatiques. Vous restez propriétaire de vos données, et en version locale elles ne quittent jamais votre établissement." },
];

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="py-20 md:py-28 bg-white">
      <div className="max-w-3xl mx-auto px-5 md:px-10">
        <SectionHead tag="FAQ" title="Vos questions, nos réponses." />
        <Reveal className="space-y-3">
          {FAQS.map(({ q, a }, i) => (
            <div key={q} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-slate-800 text-sm hover:text-terracotta-700 transition-colors">
                <span>{q}</span>
                <span className={`flex-shrink-0 w-6 h-6 rounded-full bg-terracotta-50 text-terracotta-600 flex items-center justify-center text-xs font-black transition-transform ${open === i ? 'rotate-45' : ''}`}>+</span>
              </button>
              <motion.div initial={false} animate={{ height: open === i ? 'auto' : 0, opacity: open === i ? 1 : 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
                <p className="px-6 pb-5 text-slate-500 text-sm leading-relaxed border-t border-slate-50 pt-4">{a}</p>
              </motion.div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  CTA FINAL + FOOTER / CONTACT
// ═══════════════════════════════════════════════════════════════════════════
function FinalCTA() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-br from-terracotta-600 to-ocre-600 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(white 1.5px,transparent 1.5px)', backgroundSize: '28px 28px' }} aria-hidden="true" />
      <Reveal className="relative max-w-3xl mx-auto px-5 md:px-10 text-center">
        <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-5">Prêt à moderniser votre établissement ?</h2>
        <p className="text-white/90 text-lg mb-9">Une démonstration suffit pour voir la différence. Sans engagement.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-white text-terracotta-700 font-extrabold px-8 py-4 rounded-xl text-base hover:bg-ocre-50 transition-all shadow-2xl hover:-translate-y-0.5">
            <WhatsAppIcon className="w-5 h-5" /> Demander une démonstration
          </a>
          <Link to="/signup" className="inline-flex items-center justify-center gap-2 bg-slate-900/20 border border-white/30 text-white font-bold px-8 py-4 rounded-xl text-base backdrop-blur hover:bg-slate-900/30 transition-all">
            Essayer NotesCam
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contact" className="bg-slate-950 text-slate-400 pt-16 pb-8">
      <div className="max-w-5xl mx-auto px-5 md:px-10">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <LogoMark size={36} />
            <span className="text-white font-extrabold text-2xl">NotesCam</span>
          </div>
          <p className="text-ocre-200 text-lg md:text-xl font-semibold max-w-2xl mx-auto">
            La gestion scolaire simple, fiable — même sans connexion.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 mb-12">
          <a href={TEL_LINK} className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold px-5 py-3.5 rounded-xl text-sm transition-colors">📞 {PHONE_DISPLAY}</a>
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 text-green-300 font-semibold px-5 py-3.5 rounded-xl text-sm transition-colors"><WhatsAppIcon className="w-4 h-4" /> WhatsApp {PHONE_DISPLAY}</a>
          <a href={MAIL_LINK} className="inline-flex items-center justify-center gap-2 bg-terracotta-500/15 hover:bg-terracotta-500/25 border border-terracotta-500/30 text-terracotta-200 font-semibold px-5 py-3.5 rounded-xl text-sm transition-colors">✉️ {EMAIL}</a>
        </div>
        <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <span>© {new Date().getFullYear()} NotesCam — Promoteur &amp; actionnaire principal : Hassan Ousman</span>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="text-slate-500 hover:text-white transition-colors">Conditions d'utilisation</Link>
            <span className="flex items-center gap-2 text-slate-500"><span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> MTN Mobile Money · Orange Money</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Bouton flottant mobile ───────────────────────────────────────────────────
function FloatingCTA() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const fn = () => setShow(window.scrollY > 500);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white/90 backdrop-blur border-t border-slate-100 shadow-2xl px-4 py-3 flex gap-3">
      <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 bg-terracotta-500 text-white text-sm font-bold py-3 rounded-xl"><WhatsAppIcon className="w-4 h-4" /> Démo</a>
      <Link to="/signup" className="flex-1 bg-slate-900 text-white text-sm font-bold py-3 rounded-xl text-center">Essayer</Link>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function Landing() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = SEO_TITLE;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    if (meta) meta.setAttribute('content', SEO_DESC);
    return () => { document.title = prevTitle; if (meta && prevDesc != null) meta.setAttribute('content', prevDesc); };
  }, []);

  return (
    <div className="bg-white antialiased">
      <Navbar />
      <main>
        <Hero />
        <ProofBar />
        <Features />
        <Demonstration />
        <Comparison />
        <CloudLocal />
        <SolutionCameroon />
        <IncludedAll />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <FloatingCTA />
    </div>
  );
}
