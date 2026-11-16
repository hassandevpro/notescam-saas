// Bulletin du SECONDAIRE (1er cycle APC et 2nd cycle) — gabarit « UNE PAGE, sobre ».
//
// Remplace, pour le trimestre / la séquence, BulletinApcOfficial (1er cycle) et
// BulletinScOfficial (2nd cycle). Mêmes données, MÊMES CALCULS : tout arrive en
// props (data.matieres / data.groups, moyennes, rang, stats), rien n'est recalculé.
//
// ── POURQUOI UNE PAGE EST GARANTIE ────────────────────────────────────────
// La feuille a une hauteur FIXE (zone imprimable A4, marge @page 8 mm). Le tableau
// occupe tout le reste (flex) : chaque ligne de matière s'étire pour remplir la
// hauteur, plafonnée à 2,1× sa hauteur naturelle (jamais de lignes obèses), et la
// police se réduit (k) quand les matières sont nombreuses (plancher 5,5 pt, avec
// un avertissement en console). Les textes libres sont bornés (line-clamp) :
// rien ne sort de la page, jamais de 2e feuille.
//
// ── LARGEUR ───────────────────────────────────────────────────────────────
// Le tableau est une grille en `fr` sur 100 % de la largeur utile (marges
// égales) ; la dernière colonne (Appréciation / Visa) absorbe le reste.
//
// ── ENCRE ─────────────────────────────────────────────────────────────────
// Fond blanc, pas de filigrane. Marine (accent de l'école) : titre et filets.
// Couleur ailleurs : uniquement les cotes.

import AssetImg from '../AssetImg';
import { bulletinFontFamily } from '../../lib/schoolTheme';
import { L, fix2, genderLabel } from './bulletinOfficialParts';
import { Entete, Photo } from './BulletinPrim1Page';
import { APC_COTE_CODES, APC_COTE_COLORS } from '../../core/apcEngine';
import { rangEnAnglais } from '../../core/bulletinScale';
import { PAL_SEC } from '../../core/bulletinAccent';

export const SEC1P_GABARIT = 'sec-1p-v1';

const GRIS = '#c9ced6';
const FILET = `0.5pt solid ${GRIS}`;
const coupe = (n) => ({ display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' });

// Hauteur de la zone imprimable (pt) et logo, par orientation.
const GEO = {
  portrait: { H: 790, W: 560, logo: 60, base: 7.8 },
  paysage:  { H: 544, W: 800, logo: 50, base: 7.4 },
};
const PLAFOND = 2.1;   // une ligne ne dépasse jamais 2,1× sa hauteur naturelle
const LH = 1.2;

// ── Colonnes (fr) ───────────────────────────────────────────────────────────
// La DERNIÈRE colonne (appréciation) est la variable d'ajustement : `1fr` absorbe
// le reste, les autres sont des poids fixes.
function colonnes(cycle, cols) {
  if (cycle === 2) {
    return [
      { k: 'mat',  w: 27, label: ['MATIÈRES / ENSEIGNANT', 'SUBJECTS / TEACHER', 'ASIGNATURAS / DOCENTE'], left: true },
      { k: 'coef', w: 6,  label: ['Coef', 'Coef', 'Coef'] },
      { k: 'ch',   w: 7,  label: ['Charge h', 'Periods', 'Horas'] },
      { k: 'moy',  w: 8,  label: ['Moy/20', 'Avg/20', 'Prom/20'] },
      { k: 'mc',   w: 9,  label: ['M×coef', 'Avg×Coef', 'M×coef'] },
      { k: 'rang', w: 7,  label: ['Rang', 'Rank', 'Puesto'] },
      { k: 'mm',   w: 11, label: ['Min–Max', 'Min–Max', 'Mín–Máx'] },
      { k: 'app',  w: 0,  label: ['Appréciation / Visa', 'Remarks / Visa', 'Apreciación / Visa'], left: true },
    ];
  }
  return [
    { k: 'mat',  w: 17, label: ['MATIÈRE / ENSEIGNANT', 'SUBJECT / TEACHER', 'ASIGNATURA / DOCENTE'], left: true },
    { k: 'comp', w: 30, label: ['COMPÉTENCES ÉVALUÉES', 'COMPETENCIES ASSESSED', 'COMPETENCIAS EVALUADAS'], left: true },
    { k: 'n',    w: 6,  label: ['N/20', 'N/20', 'N/20'] },
    { k: 'm',    w: 6,  label: ['M/20', 'M/20', 'M/20'] },
    { k: 'coef', w: 5,  label: ['Coef', 'Coef', 'Coef'] },
    { k: 'mc',   w: 7,  label: ['M×coef', 'M×coef', 'M×coef'] },
    ...(cols.cote ? [{ k: 'cote', w: 6, label: ['Cote', 'Grade', 'Nota'] }] : []),
    ...(cols.minmax ? [{ k: 'mm', w: 9, label: ['Min–Max', 'Min–Max', 'Mín–Máx'] }] : []),
    ...(cols.appreciation ? [{ k: 'app', w: 0, label: ['Appréc. / Visa', 'Remarks / Visa', 'Apreciación / Visa'], left: true }] : []),
  ];
}
const gabarit = (cs) => { const reste = Math.max(8, 100 - cs.reduce((a, c) => a + c.w, 0)); return cs.map((c) => `minmax(0, ${c.w || reste}fr)`).join(' '); };
// Si aucune colonne « absorbante » n'existe, la dernière devient élastique.
const normalise = (cs) => (cs.some((c) => !c.w) ? cs : cs.map((c, i) => (i === cs.length - 1 ? { ...c, w: 0 } : c)));

const idx = (sys) => (sys === 'EN' ? 1 : sys === 'ES' ? 2 : 0);

// Nombre de lignes estimé d'un texte dans une colonne de `largeurPt` à `fs` pt.
const lignesDe = (txt, largeurPt, fs) => {
  const t = String(txt || '');
  if (!t) return 1;
  const cap = Math.max(4, Math.floor(largeurPt / (0.6 * fs)));
  return Math.max(1, Math.ceil(t.length / cap));
};

// ── Lignes à plat (1er cycle : matières ; 2nd cycle : groupes + matières) ────
function lignesCycle1(data) {
  return (data?.matieres || []).map((m, i) => ({
    type: 'mat', key: `m${i}`, m,
    comps: (m.competences || []).length ? m.competences : [{ intitule: '', note: null, max: null }],
  }));
}
function lignesCycle2(data) {
  const out = [];
  (data?.groups || []).forEach((g, gi) => {
    out.push({ type: 'grp', key: `g${gi}`, g });
    g.rows.forEach((r) => out.push({ type: 'mat', key: `r${r.id}`, r }));
    out.push({ type: 'sub', key: `s${gi}`, g });
  });
  return out;
}

export default function BulletinSecUnePage({
  cycle = 1, paysage = false, school, sys = 'FR', title, student, classLabel, serieLabel, effectif,
  profPrincipal = '', rang, classStats, data, appreciation = '', discipline, decision,
  cols = { cote: true, minmax: true, appreciation: true }, maxScale = 20, headLabel, teacherLabel,
}) {
  const g = paysage ? GEO.paysage : GEO.portrait;
  const accent = PAL_SEC().accent;
  const i = idx(sys);
  const lig = cycle === 2 ? lignesCycle2(data) : lignesCycle1(data);
  const nMat = lig.filter((l) => l.type === 'mat').length;
  const cs = normalise(colonnes(cycle, cols));
  const tpl = gabarit(cs);
  const sommeW = cs.reduce((a, c) => a + c.w, 0);
  const largeurDe = (k) => {
    const c = cs.find((x) => x.k === k);
    const reste = Math.max(8, 100 - sommeW);
    return g.W * ((c?.w || reste) / (sommeW + reste));
  };

  // ── Hauteur disponible pour les lignes, et échelle de police k ─────────────
  // Réserves (pt) mesurées au banc (scripts/sec1p-essais.mjs) : en-tête, titre, bloc élève,
  // en-tête de tableau, ligne TOTAL, bas de page.
  const reserves = paysage ? 292 : 345;
  const dispo = g.H - reserves;
  // Peu de hauteur par ligne (beaucoup de matieres) : l'enseignant passe sur la MEME ligne que la matiere.
  const enLigne = dispo / Math.max(1, lig.length) < 21;
  const natLigne = (l, fs) => {
    const pad = 3.2;
    if (l.type === 'grp' || l.type === 'sub') return fs * LH + 3;
    if (cycle === 2) {
      const r = l.r;
      const a = enLigne ? lignesDe(`${r.nom} ${r.enseignant || ''}`, largeurDe('mat') - 6, fs) : lignesDe(r.nom, largeurDe('mat') - 6, fs) + (r.enseignant ? 1 : 0);
      const b = lignesDe(r.appreciation, largeurDe('app') - 6, fs);
      return Math.max(a, Math.min(b, 3)) * fs * LH + pad;
    }
    const m = l.m;
    const nom = enLigne ? lignesDe(`${m.nom} ${m.enseignant || ''}`, largeurDe('mat') - 6, fs) : lignesDe(m.nom, largeurDe('mat') - 6, fs) + (m.enseignant ? lignesDe(m.enseignant, largeurDe('mat') - 6, fs) : 0);
    const comps = l.comps.reduce((s, c) => s + Math.min(3, lignesDe(c.intitule, largeurDe('comp') - 6, fs)), 0);
    const app = cols.appreciation ? Math.min(3, lignesDe(m.appreciation, largeurDe('app') - 6, fs)) : 1;
    return Math.max(nom, comps, app, enLigne ? 1 : 2) * fs * LH + pad;
  };
  let k = 1;
  const total = (kk) => lig.reduce((s, l) => s + natLigne(l, g.base * kk), 0);
  while (k > 0.7 && total(k) > dispo) k = Math.round((k - 0.02) * 100) / 100;
  const fs = Math.max(5.5, Math.round(g.base * k * 10) / 10);
  if (total(k) > dispo && typeof console !== 'undefined') {
    console.warn(`[bulletin secondaire] ${nMat} matières : police ${fs} pt, lignes comprimées (retenues sur la page).`);
  }
  const nat = (l) => natLigne(l, fs);

  const cell = { minWidth: 0, overflow: 'hidden', padding: '1pt 3pt', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderLeft: FILET };
  const cellG = { ...cell, justifyContent: 'flex-start', textAlign: 'left' };
  const lbl = (t) => <span style={{ color: '#555' }}>{t}</span>;

  const tete = (
    <div style={{ display: 'grid', gridTemplateColumns: tpl, borderTop: `1.2pt solid ${accent}`, borderBottom: `1.2pt solid ${accent}`, color: accent, fontWeight: 'bold', fontSize: `${Math.min(7.4, fs)}pt`, flexShrink: 0, minHeight: '17pt' }}>
      {cs.map((c, ci) => (
        <div key={c.k} style={{ ...(c.left ? cellG : cell), borderLeft: ci === 0 ? 'none' : FILET, lineHeight: 1.1 }}>
          <span style={coupe(2)}>{c.label[i]}</span>
        </div>
      ))}
    </div>
  );

  const hLigne = (l) => ({ flex: `1 1 ${nat(l)}pt`, maxHeight: `${nat(l) * PLAFOND}pt`, minHeight: 0 });
  const ligneBase = { display: 'grid', gridTemplateColumns: tpl, borderBottom: FILET, overflow: 'hidden', fontSize: `${fs}pt`, lineHeight: LH };

  const rendu = lig.map((l) => {
    if (l.type === 'grp') {
      return <div key={l.key} style={{ ...ligneBase, flex: '0 0 auto', background: '#f3f4f6', fontWeight: 'bold', padding: '0.5pt 3pt', display: 'block', ...coupe(1) }}>{l.g.nom}</div>;
    }
    if (l.type === 'sub') {
      const t = l.g;
      const v = { moy: fix2(t.moyenne), coef: fix2(t.coefSum), ch: fix2(t.chargeSum), mc: fix2(t.mxSum) };
      return (
        <div key={l.key} style={{ ...ligneBase, flex: '0 0 auto', fontWeight: 'bold' }}>
          {cs.map((c, ci) => (
            <div key={c.k} style={{ ...cell, borderLeft: ci === 0 ? 'none' : FILET, justifyContent: c.k === 'mat' ? 'flex-end' : 'center', minHeight: `${fs * LH + 1}pt` }}>
              {c.k === 'mat' ? `${L(sys, 'Total', 'Total', 'Total')} ${t.nom}` : v[c.k] ?? ''}
            </div>
          ))}
        </div>
      );
    }
    if (cycle === 2) {
      const r = l.r;
      const v = { coef: String(r.coef ?? ''), ch: r.charge ?? '', moy: fix2(r.moyenne), mc: fix2(r.ponderee), rang: r.rang ?? '', mm: r.minmax ? `${fix2(r.minmax.min)}–${fix2(r.minmax.max)}` : '' };
      return (
        <div key={l.key} style={{ ...ligneBase, ...hLigne(l) }}>
          {cs.map((c, ci) => (
            <div key={c.k} style={{ ...(c.left ? cellG : cell), borderLeft: ci === 0 ? 'none' : FILET, flexDirection: c.k === 'mat' ? 'column' : 'row', alignItems: c.k === 'mat' ? 'flex-start' : 'center', justifyContent: c.k === 'mat' ? 'center' : c.k === 'app' ? 'flex-start' : 'center', fontWeight: c.k === 'moy' ? 'bold' : 'normal' }}>
              {c.k === 'mat' ? (
                <>
                  {enLigne
                    ? <span style={coupe(2)}><strong>{r.nom}</strong>{r.enseignant ? <span style={{ color: '#666' }}> · {r.enseignant}</span> : null}</span>
                    : <><strong style={coupe(2)}>{r.nom}</strong>{r.enseignant ? <span style={{ color: '#666', ...coupe(1) }}>{r.enseignant}</span> : null}</>}
                </>
              ) : c.k === 'app' ? <span style={coupe(3)}>{r.appreciation || ''}</span> : v[c.k]}
            </div>
          ))}
        </div>
      );
    }
    // ── 1er cycle : une matière, plusieurs compétences EMPILÉES dans la même ligne ──
    const m = l.m;
    const cote = m.moyenne != null ? m.cote : '';
    const pile = (fn) => (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
        {l.comps.map((c, ci) => (
          <div key={ci} style={{ flex: '1 1 0', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'inherit', borderTop: ci ? `0.4pt dotted ${GRIS}` : undefined, overflow: 'hidden' }}>{fn(c)}</div>
        ))}
      </div>
    );
    const note = (c) => (c.note == null ? '' : (c.max == null || c.max === 20 ? fix2(c.note) : `${fix2(c.note)}/${fix2(c.max)}`));
    return (
      <div key={l.key} style={{ ...ligneBase, ...hLigne(l) }}>
        {cs.map((c, ci) => {
          const st = { ...(c.left ? cellG : cell), borderLeft: ci === 0 ? 'none' : FILET };
          let body = null;
          switch (c.k) {
            case 'mat': body = enLigne
              ? (<div style={{ minWidth: 0, ...coupe(2) }}><strong>{m.nom}</strong>{m.enseignant ? <span style={{ color: '#666' }}> · {m.enseignant}</span> : null}</div>)
              : (<div style={{ minWidth: 0 }}><strong style={coupe(2)}>{m.nom}</strong>{m.enseignant ? <span style={{ color: '#666', ...coupe(1) }}>{m.enseignant}</span> : null}</div>); break;
            case 'comp': return <div key={c.k} style={{ ...st, padding: 0 }} title={l.comps.map((x) => x.intitule).join(' / ')}>{pile((x) => <span style={{ padding: '0 3pt', ...coupe(3) }}>{x.intitule}</span>)}</div>;
            case 'n': return <div key={c.k} style={{ ...st, padding: 0 }}>{pile((x) => <span style={{ width: '100%', textAlign: 'center' }}>{note(x)}</span>)}</div>;
            case 'm': body = <strong>{fix2(m.moyenne)}</strong>; break;
            case 'coef': body = String(m.coef ?? ''); break;
            case 'mc': body = fix2(m.ponderee); break;
            case 'cote': body = <strong style={{ color: m.moyenne != null ? APC_COTE_COLORS[m.cote] : undefined }}>{cote}</strong>; break;
            case 'mm': body = m.minmax ? `${fix2(m.minmax.min)}–${fix2(m.minmax.max)}` : ''; break;
            case 'app': body = <span style={coupe(3)}>{m.appreciation || ''}</span>; break;
            default: body = null;
          }
          return <div key={c.k} style={st}>{body}</div>;
        })}
      </div>
    );
  });

  // ── Ligne TOTAL / MOYENNE sous le tableau ──────────────────────────────────
  const moyG = data?.moyenneGenerale;
  const totalLigne = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderTop: `1.2pt solid ${accent}`, borderBottom: `1.2pt solid ${accent}`, padding: '2pt 4pt', fontWeight: 'bold', fontSize: `${Math.max(7, Math.min(8.4, fs + 0.6))}pt`, flexShrink: 0, marginTop: 2 }}>
      <span>TOTAL · Coef {fix2(data?.coefSum)} · M×coef {fix2(data?.mxSum)}</span>
      <span>{L(sys, 'MOYENNE', 'AVERAGE', 'PROMEDIO')} : {fix2(moyG)}{moyG != null ? ` / ${maxScale}` : ''}{cycle === 1 && moyG != null && data?.cote ? <span style={{ color: APC_COTE_COLORS[data.cote] }}> · {data.cote}</span> : null}</span>
    </div>
  );

  // ── Bas de page : trois cases, appréciation, signatures ────────────────────
  const d = discipline || {};
  const kv = (k, v, strong) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, minWidth: 0 }}>
      <span style={{ ...coupe(1), color: '#444' }}>{k}</span>
      <span style={{ fontWeight: strong ? 'bold' : 'normal', whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  );
  const boite = (titre, kids, flex = '1 1 0') => (
    <div style={{ flex, minWidth: 0, border: FILET, padding: '2pt 4pt', overflow: 'hidden' }}>
      <div style={{ color: accent, fontWeight: 'bold', fontSize: '7pt', borderBottom: `0.8pt solid ${accent}`, marginBottom: 1.5, ...coupe(1) }}>{titre}</div>
      <div style={{ fontSize: '6.8pt', lineHeight: 1.28 }}>{kids}</div>
    </div>
  );
  const coteCounts = APC_COTE_CODES.reduce((o, code) => { o[code] = (data?.matieres || []).filter((m) => m.moyenne != null && m.cote === code).length; return o; }, {});
  const rangTxt = cycle === 1
    ? (rang ? `${sys === 'EN' ? rangEnAnglais(rang) : rang} / ${effectif ?? ''}` : '')
    : (data?.generalRank ? `${data.generalRank}${effectif ? ` / ${effectif}` : ''}` : '');
  const travail = boite(L(sys, "TRAVAIL DE L'ÉLÈVE", "STUDENT'S WORK", 'TRABAJO DEL ALUMNO'), (
    <>
      {kv(L(sys, 'Total général (M×coef)', 'Grand total (M×coef)', 'Total general'), fix2(data?.mxSum))}
      {kv(L(sys, 'Total coefficients', 'Total coefficients', 'Total coeficientes'), fix2(data?.coefSum))}
      {kv(L(sys, 'MOYENNE', 'AVERAGE', 'PROMEDIO'), `${fix2(moyG)}${moyG != null ? `/${maxScale}` : ''}`, true)}
      {kv(L(sys, 'Rang', 'Rank', 'Puesto'), rangTxt, true)}
      {cycle === 1
        ? <div style={{ color: '#444' }}>{APC_COTE_CODES.map((c) => `${c} ${coteCounts[c]}`).join(' · ')}</div>
        : kv(L(sys, 'Appréciation', 'Remarks', 'Apreciación'), data?.appreciation || '')}
    </>
  ));
  const discip = boite(L(sys, 'DISCIPLINE', 'DISCIPLINE', 'DISCIPLINA'), (
    <>
      {kv(L(sys, 'Abs. non just. (h)', 'Unjust. abs. (h)', 'Faltas injust. (h)'), d.absNJ ?? '')}
      {kv(L(sys, 'Abs. just. (h)', 'Just. abs. (h)', 'Faltas just. (h)'), d.absJ ?? '')}
      {cycle === 2 ? kv(L(sys, 'Conduite', 'Conduct', 'Conducta'), d.conduite || '') : kv(L(sys, 'Retards / consignes', 'Lateness / detention', 'Retrasos / sanciones'), '')}
      {kv(L(sys, 'Avertissement / blâme', 'Warning / reprimand', 'Amonestación'), '')}
      {kv(L(sys, 'Exclusion (jours)', 'Exclusion (days)', 'Expulsión (días)'), cycle === 2 ? (d.exclusions || '') : '')}
    </>
  ));
  const profil = boite(L(sys, 'PROFIL DE LA CLASSE', 'CLASS PROFILE', 'PERFIL DE LA CLASE'), (
    <>
      {kv(L(sys, 'Moyenne de la classe', 'Class average', 'Promedio de la clase'), fix2(classStats?.avg))}
      {kv('Min – Max', classStats ? `${fix2(classStats.min)} – ${fix2(classStats.max)}` : '')}
      {kv(L(sys, 'Nombre de moyennes', 'Number of averages', 'N.º de promedios'), classStats?.count ?? '')}
      {kv(L(sys, 'Taux de réussite', 'Pass rate', 'Tasa de aprobados'), classStats?.rate != null ? `${classStats.rate}%` : '')}
    </>
  ));
  const decisionTxt = decision || d.decision || '';
  const appBox = boite(
    cycle === 2 ? L(sys, 'DÉCISION DU CONSEIL DE CLASSE', 'CLASS COUNCIL DECISION', 'DECISIÓN DEL CONSEJO DE CLASE') : L(sys, "APPRÉCIATION DU TRAVAIL DE L'ÉLÈVE", "REMARKS ON THE STUDENT'S WORK", 'APRECIACIÓN DEL TRABAJO'),
    <div style={{ fontSize: '7.6pt', ...coupe(3), whiteSpace: 'pre-wrap' }}>
      {cycle === 2 ? <strong>{decisionTxt}</strong> : appreciation}
      {cycle === 2 && d.mentions?.length > 0 ? <span style={{ color: '#444' }}> · {d.mentions.join(' · ')}</span> : null}
    </div>,
    paysage ? '1.3 1 0' : '1 1 0',
  );
  const hd = headLabel || L(sys, "Le Chef d'établissement", 'The Principal', 'El Director');
  const tl = teacherLabel || L(sys, 'Professeur principal', 'Form master', 'Profesor tutor');
  const colSign = (titre, nom, extra) => (
    <div style={{ flex: '1 1 0', minWidth: 0, borderLeft: FILET, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '2pt 3pt', position: 'relative' }}>
      <div style={{ fontWeight: 'bold', fontSize: '7.6pt', textAlign: 'center', ...coupe(1) }}>{titre}</div>
      {extra}
      <div style={{ color: '#666', fontSize: '7pt', minHeight: 9, textAlign: 'center', ...coupe(1) }}>{nom}</div>
    </div>
  );
  const signatures = (
    <div style={{ display: 'flex', border: FILET, height: '50pt', flex: paysage ? '2 1 0' : '0 0 auto', overflow: 'hidden' }}>
      <div style={{ flex: '1 1 0', minWidth: 0, padding: '2pt 3pt', textAlign: 'center', fontWeight: 'bold', fontSize: '7.6pt' }}>{L(sys, 'Parent / Tuteur', 'Parent / Guardian', 'Padre / Tutor')}</div>
      {colSign(tl, profPrincipal)}
      {colSign(hd, school?.director || '', (school?.stamp_url || school?.signature_url) ? (
        <div style={{ position: 'relative', flex: 1, width: '100%', minHeight: 0 }}>
          {school?.stamp_url && <AssetImg src={school.stamp_url} alt="" className="bulletin-stamp-img" style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', height: '90%', width: 'auto', maxWidth: 'none', objectFit: 'contain', margin: 0 }} />}
          {school?.signature_url && <AssetImg src={school.signature_url} alt="" className="bulletin-sig-img" style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', height: '70%', width: 'auto', maxWidth: 'none', objectFit: 'contain', margin: 0 }} />}
        </div>
      ) : null)}
    </div>
  );

  // ── Bloc élève (Série pour le 2nd cycle) ───────────────────────────────────
  const redoublant = String(student?.statut || '').toLowerCase().includes('redoubl');
  const parents = [student?.nom_pere, student?.nom_mere, student?.tuteur].filter(Boolean).join(' · ');
  const tel = student?.parent_phone ? ` (${student.parent_phone})` : '';
  const nomPt = (student?.name || '').length > 30 ? 9 : 11;
  const eleve = (
    <div style={{ border: FILET, display: 'flex', alignItems: 'stretch', flexShrink: 0, padding: '3pt', gap: 6, fontSize: '7.4pt', lineHeight: 1.3 }}>
      <Photo src={student?.photo_url} w={paysage ? 30 : 34} h={paysage ? 38 : 44} />
      <div style={{ flex: '1.15 1 0', minWidth: 0 }}>
        <div style={{ fontSize: `${nomPt}pt`, fontWeight: 'bold', lineHeight: 1.15, ...coupe(2) }}>{student?.name || ''}</div>
        <div style={coupe(1)}>{lbl(L(sys, 'Classe', 'Class', 'Clase'))} : <strong>{classLabel}</strong>{cycle === 2 && serieLabel ? <> · {lbl(L(sys, 'Série', 'Series', 'Serie'))} : <strong>{serieLabel}</strong></> : null}{effectif != null ? <> · {lbl(L(sys, 'Effectif', 'Size', 'Total'))} : {effectif}</> : null}</div>
        <div style={coupe(1)}>{lbl(L(sys, 'Né(e) le', 'Born on', 'Nacido/a el'))} : {student?.date_naissance || '—'}{student?.lieu_naissance ? ` ${L(sys, 'à', 'in', 'en')} ${student.lieu_naissance}` : ''}</div>
      </div>
      <div style={{ flex: '1 1 0', minWidth: 0, borderLeft: FILET, paddingLeft: 6 }}>
        <div style={coupe(1)}>{lbl(L(sys, 'Genre', 'Gender', 'Género'))} : {genderLabel(student?.gender, sys)} · {lbl(L(sys, 'Redoublant', 'Repeater', 'Repetidor'))} : {redoublant ? L(sys, 'Oui', 'Yes', 'Sí') : L(sys, 'Non', 'No', 'No')}</div>
        <div style={coupe(1)}>{lbl(L(sys, 'Identifiant', 'Unique ID', 'Identificador'))} : {student?.matricule || '—'}</div>
        <div style={coupe(1)}>{lbl(L(sys, 'P. principal', 'Form master', 'Tutor'))} : {profPrincipal || '—'}</div>
      </div>
      <div style={{ flex: '1 1 0', minWidth: 0, borderLeft: FILET, paddingLeft: 6, ...coupe(4) }}>
        {lbl(L(sys, 'Parents / Tuteurs', 'Parents / Guardians', 'Padres / Tutores'))} : {parents || '—'}{tel}
      </div>
    </div>
  );

  return (
    <div
      className="bulletin-paper sec1p"
      data-gabarit={SEC1P_GABARIT}
      data-orientation={paysage ? 'paysage' : 'portrait'}
      data-cycle={cycle}
      style={{
        boxSizing: 'border-box', height: `${g.H}pt`, width: '100%', maxWidth: paysage ? '800pt' : '560pt', margin: '0 auto', overflow: 'hidden', boxShadow: 'none', borderRadius: 0,
        display: 'flex', flexDirection: 'column', background: '#fff', color: '#111',
        fontFamily: bulletinFontFamily(school), fontSize: '8pt', padding: '3pt',
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      }}
    >
      <Entete school={school} sys={sys} g={g} paysage={paysage} />
      <div style={{ borderTop: `1.2pt solid ${accent}`, borderBottom: `1.2pt solid ${accent}`, textAlign: 'center', color: accent, fontWeight: 'bold', fontSize: paysage ? '10pt' : '11pt', padding: '3pt 0', margin: '2pt 0 4pt', flexShrink: 0, ...coupe(1) }}>{title}</div>
      {eleve}
      <div style={{ marginTop: 4, flexShrink: 0 }}>{tete}</div>
      {/* Lignes : se partagent TOUTE la hauteur restante, chacune plafonnée à 2,1× sa hauteur naturelle. */}
      <div data-zone="lignes" style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', alignContent: 'flex-start', borderBottom: FILET }}>
        {nMat === 0
          ? <div style={{ padding: 8, textAlign: 'center', color: '#9ca3af' }}>{L(sys, 'Aucune matière notée pour cette période.', 'No subject graded for this period.', 'Ninguna asignatura calificada en este periodo.')}</div>
          : rendu}
      </div>
      {totalLigne}
      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexShrink: 0, height: '62pt' }}>{discip}{travail}{profil}</div>
      {paysage ? (
        <div style={{ display: 'flex', gap: 4, marginTop: 3, flexShrink: 0, height: '50pt' }}>{appBox}{signatures}</div>
      ) : (
        <>
          <div style={{ marginTop: 3, flexShrink: 0, height: '34pt', display: 'flex' }}>{appBox}</div>
          <div style={{ marginTop: 3, flexShrink: 0 }}>{signatures}</div>
        </>
      )}
      <div style={{ textAlign: 'center', fontSize: '6.5pt', color: '#777', marginTop: 2, flexShrink: 0 }}>
        {L(sys, 'Page 1 sur 1', 'Page 1 of 1', 'Página 1 de 1')} <span style={{ color: '#aaa' }}>· {SEC1P_GABARIT}</span>
      </div>
    </div>
  );
}
