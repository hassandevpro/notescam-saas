// Bulletin APC officiel (MINESEC, premier cycle) — APERÇU ÉCRAN imprimable.
//
// Rendu piloté par le moteur d'AUTO-FIT `planApcLayout` (src/core/apcLayout.js) :
//   • choisit la PLUS GRANDE police ≥ 10pt qui fait tenir le bulletin sur 2 pages ;
//   • répartit les matières sur les pages en remplissant l'espace ;
//   • coupe une matière au niveau compétence seulement si nécessaire — l'en-tête de
//     colonnes est répété et la matière coupée porte « (suite) » ;
//   • pied (TOTAL + synthèse) et signature sur la dernière page ;
//   • numérotation « Page X sur Y » par élève.
// En-tête institutionnel / filigrane / identité / signature mutualisés (parts).

import {
  mkCell, mkTH, fix2, L,
  OfficialHeader, OfficialIdentity, OfficialSignatures, OfficialSheet, ContinuationHeader,
} from './bulletinOfficialParts';
import { planApcLayout, apcHeaderPt } from '../../core/apcLayout';
import { APC_COTE_CODES, APC_COTE_COLORS, apcBulletinCols } from '../../core/apcEngine';
import { rangEnAnglais } from '../../core/bulletinScale';

// Colonnes fixes (toujours affichées) + colonnes de fin optionnelles pilotées par
// les bascules de l'établissement (COTE / [Min–Max] / Appréciation).
// ── LARGEURS : ELLES NE VALAIENT RIEN TANT QUE LE TABLEAU N'ÉTAIT PAS FIXE ───
//
// Mesuré le 2026-11-02 (scripts/apc-blocs-mesure.mjs) : la colonne COMPÉTENCES
// déclarait 42 % et recevait 186 px sur 720, soit 26 %. Sans
// `table-layout: fixed`, un navigateur ne lit ces pourcentages que comme des
// SOUHAITS : il redistribue selon le contenu, et les deux en-têtes les plus
// longs — « MATIÈRES ET NOM DE L'ENSEIGNANT » et « Appréciations et Visa »,
// cette dernière pour une colonne VIDE qui s'octroyait 114 px — prenaient la
// place du texte des compétences. Celui-ci passait donc à QUATRE lignes, et une
// ligne de matière faisait 72 px au lieu de 37. Sur onze matières, c'est
// 385 px perdus — plus que le débordement lui-même. Voilà la 2e page.
//
// Le tableau est maintenant FIXE (cf. `tableLayout` plus bas) et les largeurs
// sont donc tenues. Elles ont été rééquilibrées en conséquence : en mode fixe,
// 4 % (29 px) ne logent pas « 9.00–16.00 » et 5 % ne logent pas une
// appréciation — ces deux colonnes se replieraient ligne après ligne.
const FIXED_COLS = (sys) => [
  { key: 'mat',  w: '17%', label: L(sys, 'MATIÈRES / ENSEIGNANT', 'SUBJECT / TEACHER', 'ASIGNATURA / DOCENTE'), left: true },
  // 35 % : deux points rendus à « M×coef » et « Min–Max », dont les en-têtes
  // sortaient tronqués (« M×coe », « Min–Ma ») sur la capture du 2026-11-02.
  // La compétence, elle, est bornée à deux lignes : deux points de moins ne
  // lui coûtent pas un mot, ils lui coûtent une césure.
  { key: 'comp', w: '35%', label: L(sys, 'COMPÉTENCES ÉVALUÉES', 'COMPETENCIES ASSESSED', 'COMPETENCIAS EVALUADAS'), left: true },
  { key: 'n',    w: '6%',  label: 'N/20',   nowrap: true },
  { key: 'm',    w: '6%',  label: 'M/20',   nowrap: true },
  { key: 'coef', w: '5%',  label: 'Coef',   nowrap: true },
  { key: 'mc',   w: '8%',  label: 'M×coef', nowrap: true },
];
const TRAILING_DEF = (sys) => [
  { key: 'cote', opt: 'cote',         w: '6%', label: L(sys, 'COTE', 'GRADE', 'NOTA'), nowrap: true },
  // SANS LES CROCHETS. Mesuré sur la capture du 2026-11-02 : « [Min–Max] »
  // en nowrap fait 64 px pour une colonne de 57, et l'excédent se peignait
  // PAR-DESSUS la colonne voisine — « COTE [Min–Max]Appréc. » illisible. Les
  // crochets n'apportent rien que la ligne de tableau ne dise déjà.
  { key: 'mm',   opt: 'minmax',       w: '9%', label: 'Min–Max', nowrap: true },
  { key: 'app',  opt: 'appreciation', w: '8%', label: L(sys, 'Appréc. / Visa', 'Remarks / Visa', 'Apreciación / Visa') },
];
// Colonnes de fin visibles selon les bascules — au moins une (héberge « MOYENNE »).
const visibleTrailing = (cols, sys) => {
  const t = TRAILING_DEF(sys).filter((c) => cols[c.opt]);
  return t.length ? t : [{ key: 'ph', w: '10%', label: '' }];
};

function TableHead({ th, cols }) {
  return (
    <thead>
      <tr>
        {cols.map((c) => (
          // `overflow: hidden` AVEC le nowrap, toujours : sans lui, un en-tête
          // trop long pour sa colonne ne se coupe pas, il DÉBORDE sur la
          // colonne d'à côté et les deux deviennent illisibles. Mieux vaut un
          // libellé tronqué qu'un en-tête superposé.
          <th key={c.key} style={{ ...th, width: c.w, ...(c.left ? { textAlign: 'left' } : null), ...(c.nowrap ? { whiteSpace: 'nowrap', overflow: 'hidden' } : null) }}>{c.label}</th>
        ))}
      </tr>
    </thead>
  );
}

// Un « chunk » de matière = la part de ses compétences présente sur une page.
function MatiereChunk({ chunk, cell, trailing, sys }) {
  const m = chunk.m;
  const rs = chunk.comps.length || 1;
  const span = (first, content, extra) => (first
    ? <td rowSpan={rs} style={{ ...cell, textAlign: 'center', ...extra }}>{content}</td>
    : null);
  const trailContent = (key) => {
    if (key === 'cote') return <strong style={{ color: m.moyenne != null ? APC_COTE_COLORS[m.cote] : undefined }}>{m.moyenne != null ? m.cote : ''}</strong>;
    if (key === 'mm')   return m.minmax ? `${fix2(m.minmax.min)}–${fix2(m.minmax.max)}` : '';
    if (key === 'app')  return m.appreciation || '';
    return '';
  };
  return (
    <tbody className="apc-mat">
      {chunk.comps.map((c, i) => {
        const first = i === 0;
        return (
          <tr key={i}>
            {first && (
              <td rowSpan={rs} style={cell}>
                {/* LE CLAMP VIT DANS UN <div>, JAMAIS SUR LE <td>.
                    `display: -webkit-box` sur une cellule lui retire son
                    `display: table-cell` et demolit la table entiere : les
                    largeurs fixes ne s appliquent plus et la ligne se disloque. */}
                <div className="apc-clamp2">
                  <strong>{m.nom}{chunk.contFromPrev ? L(sys, ' (suite)', ' (cont.)', ' (cont.)') : ''}</strong><br />
                  {/* Pas de « M/Mme » quand l'école n'a pas saisi l'enseignant :
                      un bulletin officiel n'annonce pas un nom qu'il n'a pas. */}
                  {m.enseignant ? <span style={{ color: '#666' }}>{m.enseignant}</span> : null}
                </div>
              </td>
            )}
            {/* LE DÉTAIL DES ÉVALUATIONS, à la suite de l'intitulé et en petit :
                « (Éval. 1 : 12 · Éval. 2 : 16) », la colonne N portant leur
                moyenne (14). Aucune colonne n'est ajoutée au tableau.

                RÉSERVÉ AUX MATIÈRES DE 1 OU 2 COMPÉTENCES, et c’est une mesure,
                pas une préférence : au-delà, le détail ajoute assez de lignes
                pour faire passer le bulletin de 3 pages à 4 (`npm run
                test:print`, scénario « APC 14×4 »). C’est exactement le cas
                demandé le 2026-11-01, et il tient à pleine taille — scénario
                « APC 14×1 », ajouté au banc pour le prouver.

                CE RENDU DOIT RESTER IDENTIQUE à celui du document imprimé
                (`lib/apcBulletinDoc.js`, `evalDetailHtml`) : l’écran et le PDF
                sont deux rendus des MÊMES données, et un parent qui lit l’un
                puis l'autre ne doit pas y trouver deux bulletins. */}
            {/* DEUX LIGNES AU PLUS, avec points de suspension (demande du
                2026-11-02). Un intitule officiel de competence fait couramment
                80 caracteres ; au-dela de deux lignes il fait exploser la
                hauteur du tableau. Le texte ENTIER reste accessible : attribut
                title ici, et en clair sur l ecran de saisie. */}
            <td style={cell} title={c.intitule}>
              <div className="apc-clamp2">
                {c.intitule}
                {c.evaluations?.length > 1 && c.nbCompetencesMatiere <= 2 && (
                  <span style={{ color: '#666', fontSize: '.9em', whiteSpace: 'nowrap' }}>
                    {' ('}
                    {c.evaluations
                      .map((e) => `${L(sys, 'Éval.', 'Assess.', 'Eval.')} ${e.rang} : ${
                        e.max == null || e.max === 20 ? fix2(e.note) : `${fix2(e.note)}/${fix2(e.max)}`}`)
                      .join(' \u00b7 ')}
                    {')'}
                  </span>
                )}
              </div>
            </td>
            {/* Barème réel de l'évaluation : la valeur seule quand c'est /20,
                sinon « 2/3 » — un « N/20 » au-dessus d'un 2/3 mentirait. */}
            <td style={{ ...cell, textAlign: 'center' }}>
              {c.note == null ? '' : (c.max == null || c.max === 20 ? fix2(c.note) : `${fix2(c.note)}/${fix2(c.max)}`)}
            </td>
            {span(first, <strong>{fix2(m.moyenne)}</strong>)}
            {span(first, String(m.coef))}
            {span(first, fix2(m.ponderee))}
            {first && trailing.map((tc) => (
              <td key={tc.key} rowSpan={rs} style={{ ...cell, textAlign: 'center' }}>{trailContent(tc.key)}</td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}

function TotalRow({ data, cell, empty, colCount, trailCount, sys }) {
  return (
    <tbody>
      {empty && (
        <tr><td colSpan={colCount} style={{ ...cell, textAlign: 'center', color: '#9ca3af', padding: '10px' }}>{L(sys, 'Aucune compétence évaluée pour cette période.', 'No competency assessed for this period.', 'Ninguna competencia evaluada en este periodo.')}</td></tr>
      )}
      <tr>
        <td colSpan={3} style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>TOTAL</td>
        <td style={cell} />
        <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{fix2(data.coefSum)}</td>
        <td style={{ ...cell, textAlign: 'center', fontWeight: 'bold' }}>{fix2(data.mxSum)}</td>
        <td colSpan={trailCount} style={{ ...cell, textAlign: 'right', fontWeight: 'bold' }}>{L(sys, 'MOYENNE', 'AVERAGE', 'PROMEDIO')} : {fix2(data.moyenneGenerale)}</td>
      </tr>
    </tbody>
  );
}

// Pieds : Discipline | Travail de l'élève | Profil de la classe + appréciation.
function FooterBlocks({ data, classStats, rang, effectif, cell, head, sys, appreciation }) {
  const coteCounts = APC_COTE_CODES.reduce((o, code) => {
    o[code] = data.matieres.filter((m) => m.moyenne != null && m.cote === code).length; return o;
  }, {});
  const KV = ({ k, v, strong }) => (
    <tr><td style={cell}>{k}</td><td style={{ ...cell, textAlign: 'center' }}>{strong ? <strong>{v}</strong> : v}</td></tr>
  );
  const Mini = ({ title, children }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody><tr><td colSpan={2} style={head}>{title}</td></tr>{children}</tbody>
    </table>
  );
  return (
    <>
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 5 }}>
        <tbody>
          <tr>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini title={L(sys, 'Discipline', 'Discipline', 'Disciplina')}>
                <KV k={L(sys, 'Abs. non just. (h)', 'Unjust. abs. (h)', 'Faltas injust. (h)')} v="" /><KV k={L(sys, 'Abs. just. (h)', 'Just. abs. (h)', 'Faltas just. (h)')} v="" />
                <KV k={L(sys, 'Retards (nombre)', 'Lateness (count)', 'Retrasos (n.º)')} v="" /><KV k={L(sys, 'Consignes (h)', 'Detention (h)', 'Sanciones (h)')} v="" />
                <KV k={L(sys, 'Avertissement', 'Warning', 'Amonestación')} v="" /><KV k={L(sys, 'Blâme de conduite', 'Conduct reprimand', 'Censura de conducta')} v="" />
                <KV k={L(sys, 'Exclusions (jours)', 'Exclusions (days)', 'Expulsiones (días)')} v="" /><KV k={L(sys, 'Exclusion définitive', 'Permanent exclusion', 'Expulsión definitiva')} v="" />
              </Mini>
            </td>
            <td style={{ width: '34%', verticalAlign: 'top', paddingRight: 4 }}>
              <Mini title={L(sys, "Travail de l'élève", "Student's work", 'Trabajo del alumno')}>
                <KV k={L(sys, 'Total général', 'Grand total', 'Total general')} v={fix2(data.mxSum)} />
                <KV k="Coef" v={fix2(data.coefSum)} />
                <KV k={L(sys, 'MOYENNE', 'AVERAGE', 'PROMEDIO')} v={fix2(data.moyenneGenerale)} strong />
                <KV k={L(sys, 'Cote', 'Grade', 'Nota')} v={data.moyenneGenerale != null ? data.cote : ''} strong />
                <KV k={L(sys, 'Rang', 'Rank', 'Puesto')} v={rang ? `${sys === 'EN' ? rangEnAnglais(rang) : rang} / ${effectif ?? ''}` : ''} strong />
                {APC_COTE_CODES.map((c) => <KV key={c} k={c} v={coteCounts[c]} />)}
              </Mini>
            </td>
            <td style={{ width: '32%', verticalAlign: 'top' }}>
              <Mini title={L(sys, 'Profil de la classe', 'Class profile', 'Perfil de la clase')}>
                <KV k={L(sys, 'Moyenne générale', 'General average', 'Promedio general')} v={fix2(classStats?.avg)} />
                <KV k="[Min – Max]" v={classStats ? `${fix2(classStats.min)} – ${fix2(classStats.max)}` : ''} />
                <KV k={L(sys, 'Nombre de moyennes', 'Number of averages', 'N.º de promedios')} v={classStats?.count ?? ''} />
                <KV k={L(sys, 'Taux de réussite', 'Pass rate', 'Tasa de aprobados')} v={classStats?.rate != null ? `${classStats.rate}%` : ''} />
              </Mini>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="apc-keep" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 3 }}>
        <tbody>
          <tr>
            {/* 12 mm (45 px) : la case où le titulaire écrit à la main. Elle
                COÛTE de la hauteur, et c'est assumé — demandée à 12 mm le
                2026-11-02. Une case de deux lignes ne reçoit pas une phrase. */}
            <td style={{ ...cell, height: 45, verticalAlign: 'top' }}>
              <div style={{ fontWeight: 'bold' }}>{L(sys, "Appréciation du travail de l'élève (points forts et points à améliorer)", "Remarks on the student's work (strengths and areas to improve)", 'Apreciación del trabajo del alumno (puntos fuertes y a mejorar)')}</div>
              {appreciation ? <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{appreciation}</div> : null}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ── Bulletin APC officiel (auto-fit, 1–2 pages numérotées par élève) ──────────
export default function BulletinApcOfficial({
  school, sys = 'FR', title, student, classLabel, effectif,
  profPrincipal = '', rang, classStats, data, appreciation = '',
}) {
  const { fontPt, lineH, cellPadV, pages, footerPageIndex, totalPages } = planApcLayout(data.matieres);
  const cell = mkCell(fontPt, lineH, cellPadV);
  const th   = mkTH(apcHeaderPt(fontPt), lineH, cellPadV);   // en-tête de colonnes +1pt (11–12pt)
  const idProps = { student, classLabel, effectif, profPrincipal, sys };
  // Un bulletin d'UNE page se rend en mode compact : c'est la condition pour
  // qu'il tienne. Dès qu'il en faut deux, la place existe et on rend au
  // gabarit normal — plus lisible, et c'est le réglage d'origine.
  const compact = totalPages === 1;
  // Colonnes de fin selon les bascules de l'établissement.
  const trailing = visibleTrailing(apcBulletinCols(school), sys);
  // En-tête « N/20 » tant que toutes les compétences notées le sont sur /20 —
  // c'est-à-dire pour tous les bulletins existants. Dès qu'une évaluation suit
  // un autre barème, la colonne devient « N » et chaque cellule porte le sien.
  const uniforme = (data?.matieres || []).every((m) => (m.competences || [])
    .every((c) => c.note == null || c.max == null || c.max === 20));
  const allCols  = [
    ...FIXED_COLS(sys).map((c) => (c.key === 'n' && !uniforme ? { ...c, label: 'N' } : c)),
    ...trailing,
  ];

  return (
    <>
      {pages.map((chunks, i) => (
        /* `total={0}` quand il n'y a qu'une page : `PageNumber` ne rend alors
           rien. « Page 1 sur 1 » n'apprend rien à personne et coûte 21 px plus
           un filet — demandé supprimé le 2026-11-02. Dès qu'il y a deux pages il
           revient : là, il dit au parent qu'il lui manque une feuille. */
        <OfficialSheet key={i} school={school} pt={fontPt} pageNo={i + 1}
          total={totalPages > 1 ? totalPages : 0} sys={sys} dense={totalPages === 1}>
          {i === 0 ? (
            <>
              {/* MODE COMPACT SUR UNE PAGE. `dense` existait déjà sur l'en-tête,
                  le bandeau titre et les signatures, et donne exactement les
                  cotes demandées le 2026-11-02 : en-tête 28 mm (logo 38 px,
                  corps 8 pt), bandeau titre 7 mm (11 pt, rembourrage 2 px),
                  signatures 18 mm (cadre 58 px). Il n'était simplement jamais
                  branché ici. L'identité reçoit sa variante deux lignes. */}
              <OfficialHeader school={school} sys={sys} title={title} dense={compact} />
              <OfficialIdentity {...idProps} dense={compact} />
            </>
          ) : (
            <ContinuationHeader title={title} student={student} classLabel={classLabel} sys={sys} />
          )}

          {/* table-layout FIXE — SANS LUI LES LARGEURS CI-DESSUS SONT IGNORÉES
              (voir le commentaire de FIXED_COLS : 42 % rendus en 26 %). */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <TableHead th={th} cols={allCols} />
            {chunks.map((chunk, j) => <MatiereChunk key={j} chunk={chunk} cell={cell} trailing={trailing} sys={sys} />)}
            {i === footerPageIndex && <TotalRow data={data} cell={cell} empty={data.matieres.length === 0} colCount={allCols.length} trailCount={trailing.length} sys={sys} />}
          </table>

          {i === footerPageIndex && (
            <FooterBlocks data={data} classStats={classStats} rang={rang} effectif={effectif} cell={cell} head={th} sys={sys} appreciation={appreciation} />
          )}
          {i === footerPageIndex && <OfficialSignatures school={school} sys={sys} profPrincipal={profPrincipal} dense={compact} />}
        </OfficialSheet>
      ))}
    </>
  );
}
