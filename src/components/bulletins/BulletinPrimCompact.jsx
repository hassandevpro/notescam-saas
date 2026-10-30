// Bulletin PRIMAIRE APC — disposition COMPACTE du carnet de référence.
//
// Fidèle au « REPORT OF MARKS » de Bright Continent : UNE ligne par compétence,
// les critères d'évaluation en COLONNES (Oral / Écrit / Pratique / Savoir-être),
// chaque cellule portant `note /barème`, puis le total et la cote.
//
// ── POURQUOI UN SECOND GABARIT, À CÔTÉ DE BulletinPrimAnnualUA ─────────────
// `BulletinPrimAnnualUA` met les UA en COLONNES et les critères en LIGNES (un
// mini-tableau par compétence). C'est la bonne lecture pour un trimestre ou une
// année — on y suit la progression d'une UA à l'autre. Mais pour UNE unité
// d'apprentissage, cette disposition occupe une page entière pour onze valeurs,
// alors que le carnet officiel tient la même information sur onze lignes.
// Les deux coexistent donc, et l'écran choisit selon la période.
//
// ── CE QUE CE GABARIT NE CALCULE PAS ──────────────────────────────────────
// Rien. Toutes les valeurs arrivent en PROPS, déjà calculées par Bulletins.jsx
// à partir du moteur (`pointsForPeriod`, `pointsOverall`, `generalAverage`).
// Un gabarit qui recalculerait ses totaux finirait par contredire l'aperçu,
// le rapport de classe et le PDF — c'est la règle de tous les bulletins ici.
//
// RAPPEL SUR LES DEUX LIGNES DE SYNTHÈSE, qui ne se déduisent pas l'une de
// l'autre (décision du 2026-10-12) :
//   « Total obtenu »  = Σ points / Σ barèmes des évaluations faites
//   « Moyenne »       = `generalAverage`, moyenne des compétences pondérée par
//                       coefficient — la règle du bulletin APC primaire, CONSERVÉE
// Sur les mêmes notes, le carnet de référence affiche 14,82 là où
// `generalAverage` donne 15,08. Les deux sont justes ; ce ne sont pas le même
// calcul. Ne pas « aligner » l'une sur l'autre ici.

import { Fragment } from 'react';
import {
  mkCell, mkTH, mkCellVar, mkTHVar, fix2, L, B,
  OfficialHeader, OfficialIdentityBand, OfficialSignatures, OfficialSheet,
} from './bulletinOfficialParts';
import { headTeacherLabel, headTeacherCount } from '../../lib/headTeachers';
import { PRIM_GRADE_MAX } from '../../core/primEngine';
// Les six regroupements officiels du carnet MINEDUB. Le calcul est dans le
// moteur : ce gabarit n'additionne rien lui-même (règle de tous les bulletins).
import { groupesDe, reperesDeGroupe, lignesParEpreuve } from '../../core/primCompactRows';
// LA VARIANTE BILINGUE : deux blocs de programme au lieu des six familles. Le
// découpage et ses totaux sont dans le moteur, comme les familles — ce gabarit
// dessine le même bandeau dans les deux cas.
import { ordonnerParProgramme } from '../../core/primProgramme';
import { primCoteLabel } from '../../core/referentielI18n';
import { MARQUE_NON_EVALUEE } from '../../core/noteEtat';
// LA DENSITÉ N'EST PLUS ESTIMÉE, ELLE EST MESURÉE.
// Toutes les tailles de ce gabarit dérivent de `--nc-d`, que
// `lib/print/fitDensity.js` cherche par dichotomie en mesurant la feuille
// dans la géométrie d'impression. Voir l'en-tête de ce module pour le
// pourquoi : l'estimation se trompait de quelques millimètres, et quelques
// millimètres suffisent à expédier le bloc signatures sur une 2e page.
// Les teintes du bulletin sont DÉDUITES de la couleur choisie par l'école.
import { teintesDeLEcole } from '../../core/bulletinAccent';

const COTE_COLORS = { 'A+': '#059669', A: '#10b981', ECA: '#f59e0b', IP: '#f59e0b', NA: '#ef4444' };
// LES COTES GARDENT LEURS COULEURS, et elles seules. Vert / orange / rouge ne
// sont pas une identité d'école mais un CODE : un parent lit « rouge » comme
// « non acquis ». Les faire varier avec la charte d'un établissement ferait
// perdre au bulletin sa seule couleur porteuse de sens.
// Le reste — bandeaux, en-têtes, filets — vient de `bulletinAccent`.

// Une cellule de critère : « 6.3 /10 ». Le barème est affiché À CÔTÉ de la note,
// comme sur le carnet, parce qu'il VARIE d'une compétence à l'autre (l'Écrit vaut
// 20 en 1A et 30 en 2A) et d'une évaluation à l'autre. Une note nue serait
// illisible — 17 ne dit rien sans savoir sur combien.
function CritereCell({ val, pt, vars = false }) {
  const cell = {
    ...(vars ? mkCellVar() : mkCell(pt)),
    textAlign: 'center', whiteSpace: 'nowrap',
  };
  // Distinction CAPITALE : une absence de note (`null`) s'écrit « — », jamais 0.
  // Un zéro réellement attribué s'écrit « 0 », et compte dans les totaux.
  if (!val || val.note == null) return <td style={{ ...cell, color: '#9ca3af' }}>—</td>;
  return (
    <td style={cell}>
      {fix2(val.note)}
      <span style={{ color: '#6b7280', fontSize: '0.86em' }}> /{fix2(val.max)}</span>
    </td>
  );
}

export default function BulletinPrimCompact({
  school, cls, student, sys = 'FR', effectif, qrSrc,
  periodLabel,                 // « UA 1 », « Trimestre 1 », « Annuel »
  critereColumns = [],         // [{ id, nom }] — colonnes, dans l'ordre du référentiel
  rows = [],                   // [{ code, intitule, parCritere, achieved, possible, cote, appreciation }]
  overall,                     // { achieved, possible, pct, evaluees, nonEvaluees }
  niveauTotal,                 // barème théorique du niveau (300) — pour la mention provisoire
  nonEvalueesCodes = [],       // ['1C','3B','4A']
  moyenneGenerale, coteGenerale, appreciationGenerale,
  rank, decision,
  // ── CE QUE LE CARNET DE L'ÉCOLE PORTE EN PLUS (modèle THE GENIUS, SIL) ────
  // Toutes FACULTATIVES : un bulletin qui ne les reçoit pas s'imprime comme
  // avant, sans case vide ni ligne fantôme.
  mentions,                    // { avertissement, tableauHonneur, encouragement, felicitation }
  statsClasse,                 // { premier, dernier, generale } — moyennes de la classe
  repartition = [],            // [{ label: '[10-11.99]', n: 3 }] — élèves par intervalle
  repartitionTotal,            // effectif noté — la colonne « Total » du carnet papier
  signatureParent = false,     // ajoute la case « Signature du parent »
  // ── DISPOSITION DES LIGNES ───────────────────────────────────────────────
  //   'criteres' — les critères en COLONNES (Oral / Écrit / Pratique /
  //                Savoir-être), une ligne par compétence. Historique.
  //   'epreuves' — une ligne par ÉPREUVE, avec les colonnes
  //                « U.A. · Bar. · Note · Cote » du carnet PAPIER de THE GENIUS.
  // Le reste du document — en-tête, bandeau d'identité, regroupements, pied,
  // signatures — est le MÊME dans les deux cas : c'est bien une disposition, pas
  // un second bulletin.
  disposition = 'criteres',
  groupes: avecGroupes = false, // affiche les six regroupements officiels
  // ── LE CARNET D'UNE CLASSE BILINGUE ──────────────────────────────────────
  // Blocs de `primProgramme.programmesDe` : un par programme (English, French),
  // plus « Autres matières » s'il reste des lignes qu'aucun des deux
  // vocabulaires officiels ne reconnaît. FOURNIS, ils REMPLACENT les six
  // familles — c'est ce que fait le carnet papier de Class 2/CP, qui n'imprime
  // aucune famille. VIDES — toute classe monolingue — rien ne change.
  programmes = [],
  additionalSubjects = [],     // matières hors référentiel (tableau secondaire)
  coteBareme = [],             // bandes de cotes, pour la légende
  titulaire,
  pt = 9,
  pageNo, total,
}) {
  // Les six regroupements, calcules par le moteur. `finDeGroupe(i)` rend le
  // groupe quand la ligne i est la DERNIERE de sa famille — c'est la que se
  // pose la ligne « n) INTITULE · Total · Moyenne » du carnet.
  // Une ligne par ÉPREUVE : la disposition du carnet papier. Le découpage est
  // dans le moteur (`lignesParEpreuve`), qui ne fait que RELIRE `parCritere` —
  // aucun total n'est recalculé ici.
  const parEpreuve = disposition === 'epreuves';
  const bilingue = programmes.length > 0;
  // EN BILINGUE, LES LIGNES SONT REGROUPÉES AVANT D'ÊTRE DESSINÉES. Les deux
  // programmes arrivent entrelacés dans l'ordre du référentiel (English,
  // Français, Mathematics, Mathématiques…) ; sans ce tri, le bandeau
  // « English · Total » se poserait après la dernière ligne anglophone — donc
  // au-dessous de lignes francophones, et le total deviendrait illisible.
  const base = bilingue ? ordonnerParProgramme(rows, programmes) : rows;
  const lignes = parEpreuve ? lignesParEpreuve(base, critereColumns) : base;

  // La COTE du groupe n'est demandée qu'en disposition par épreuve, parce que
  // c'est la seule que le carnet papier porte (« Grade: A » au bout du bandeau).
  const groupes = bilingue
    ? programmes
    : (avecGroupes ? groupesDe(rows, sys, parEpreuve ? coteBareme : null) : []);
  // Les repères viennent du moteur : une famille dont les membres ne se suivent
  // pas — une compétence maison intercalée — n'imprime plus son total deux fois.
  // `lignes` dérive de `base` ligne à ligne (`map`), donc les index coïncident.
  const { fin: finsDeGroupe } = reperesDeGroupe(base, groupes);
  const finDeGroupe = (i) => ((avecGroupes || bilingue) ? finsDeGroupe.get(i) || null : null);

  const classLabel = cls?.name || '';
  // LE TITRE DU CARNET PAPIER EST UNE PAIRE BILINGUE, et l'ordre des deux
  // langues suit celle de la classe : les bulletins anglophones de l'école
  // portent « GRADEBOOK / BULLETIN DE NOTES », les francophones
  // « BULLETIN DE NOTES / PROGRESS REPORT CARD » (relevé sur les sept bulletins
  // photographiés le 2026-10-29). La classe reste dans le bandeau d'identité
  // juste dessous — le carnet ne la met pas deux fois.
  const titre = parEpreuve
    ? L(sys, 'BULLETIN DE NOTES / PROGRESS REPORT CARD',
         'GRADEBOOK / BULLETIN DE NOTES', 'BOLETÍN DE NOTAS')
    : L(sys, `BULLETIN DE NOTES — ${classLabel}`,
         `REPORT OF MARKS – ${classLabel}`, `BOLETÍN DE NOTAS — ${classLabel}`);
  const sousTitre = [periodLabel, school?.current_year].filter(Boolean).join(' · ');

  // ── « LE BULLETIN DOIT TENIR SUR UNE PAGE », DANS LES DEUX SENS ───────────
  //
  // Ce gabarit n'écrit plus aucune hauteur. Tout — corps du tableau,
  // rembourrage des cellules, interstices, logo, cachet, cadres de signature,
  // case d'observations — dérive de `--nc-d`, cherchée par DICHOTOMIE sur la
  // feuille réelle avant chaque impression (lib/print/fitDensity.js).
  //
  // Beaucoup de compétences → `--nc-d` descend vers le plancher de lisibilité
  // (corps à 7 pt) ; peu de compétences → elle monte vers le plafond (10 pt),
  // et le reliquat va aux zones où l'on ÉCRIT : observations du titulaire,
  // cadres de signature. Plus de grand vide en bas, plus de débordement — et
  // surtout, plus d'estimation à recalibrer à chaque changement de gabarit.
  const gap = 'var(--nc-gap)';

  // L'accent de l'ÉCOLE, et les teintes qui s'en déduisent. Une école qui n'a
  // rien choisi obtient exactement le vert d'avant : rien ne change sans
  // décision de sa part.
  const C = teintesDeLEcole(school);
  const ACCENT = C.accent;
  const TH_BG = C.tint;
  const TH_TXT = C.texte;
  const th = { ...mkTH(pt), background: TH_BG, color: TH_TXT };
  const cell = mkCell(pt);
  const num = { ...cell, textAlign: 'center', whiteSpace: 'nowrap' };
  // Le tableau des compétences, piloté par la densité mesurée. C'est lui qui
  // porte l'essentiel de la hauteur : une ligne de plus ou de moins s'y paie
  // vingt fois.
  const thL = { ...mkTHVar(), background: TH_BG, color: TH_TXT };
  const cellL = mkCellVar();
  const numL = { ...cellL, textAlign: 'center', whiteSpace: 'nowrap' };

  // Mention « provisoire » : elle n'apparaît QUE s'il reste des compétences non
  // évaluées, et elle dit les trois choses dont l'école a besoin — lesquelles,
  // le dénominateur réellement utilisé, et sur quoi la moyenne est calculée.
  // Sans elle, un total sur 240 se lit comme un total sur 300 et l'élève paraît
  // avoir échoué sur un programme qu'on ne lui a pas encore enseigné.
  const provisoire = nonEvalueesCodes.length > 0;

  return (
    <OfficialSheet school={school} pageNo={pageNo} total={total} pt={pt} sys={sys} vars>
      <OfficialHeader
        school={school} sys={sys} title={titre} accent={ACCENT} rounded basic vars
      />

      {/* Le bandeau de période reste une LIGNE À PART, comme sur le carnet de
          référence. Il ne coûte plus une décision : sa hauteur suit `--nc-d`
          avec le reste. */}
      <div style={{
        background: ACCENT, color: C.surAccent, textAlign: 'center', fontWeight: 'bold',
        padding: 'calc(var(--nc-gap) * 0.5) 6px', fontSize: 'var(--nc-body)',
        letterSpacing: '0.02em',
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      }}>
        {sousTitre}
      </div>

      <OfficialIdentityBand
        student={student} classLabel={classLabel} effectif={effectif}
        profPrincipal={titulaire} sys={sys} accent={ACCENT} tint={TH_BG}
        variant="carnet"
        vars
        ppLabel={headTeacherLabel(headTeacherCount(titulaire), sys, { basic: true })}
      />

      {/* ── Tableau principal : une ligne par compétence ─────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: gap, tableLayout: 'fixed' }}>
        {/* ── LARGEURS DE COLONNES ─────────────────────────────────────────
            « Savoir-être » ne tenait pas en 8 % : il passait à la ligne, et
            l'en-tête du tableau gagnait une ligne entière pour un seul mot
            coupé en deux. 9 % le fait tenir — c'est aussi l'ordre de grandeur
            du modèle de référence, qui donne au dernier critère un peu plus de
            place qu'aux trois autres.
            Le reste va à l'intitulé de la compétence (colonne sans largeur) :
            c'est la seule qui porte du texte long, donc la seule qui doit
            absorber ce qui reste. */}
        {parEpreuve ? (
          /* SIX COLONNES, celles du carnet papier. « U.A. » reçoit 13 % : elle
             porte « Savoir-être », le plus long des quatre libellés d'épreuve.
             « Bar. » et « Note » sont des nombres courts ; « Cote » garde les
             9 % qu'exige « Moy: 14.75 » sur la ligne de regroupement. */
          <colgroup>
            <col style={{ width: '6%' }} />
            <col />
            <col style={{ width: '13%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
        ) : (
        <colgroup>
          <col style={{ width: '6%' }} />
          <col />
          {critereColumns.map((c) => <col key={c.id} style={{ width: '9%' }} />)}
          <col style={{ width: '10%' }} />
          {/* 9 %, ET NON 7 %. Une cote (« ECA ») tient dans 7 %, mais la LIGNE
              DE REGROUPEMENT met sa moyenne dans cette même colonne, et
              « Moy: 14.75 » n'y tenait pas : relevé au rendu, l'élève lisait
              « Moy: 14.7 » — pas un texte coupé, un NOMBRE FAUX. Les 2 %
              viennent de la colonne d'intitulé, la seule qui puisse les rendre
              (elle n'a pas de largeur fixe et absorbe le reste). */}
          <col style={{ width: '9%' }} />
        </colgroup>
        )}
        {parEpreuve ? (
          /* L'EN-TÊTE DU CARNET PAPIER, dans ses mots. « U.A. » (« L.U. » côté
             anglophone) y porte la NATURE de l'épreuve — « Écrite »,
             « Pratique » — et non un numéro d'unité d'apprentissage ; c'est le
             libellé de l'école, on le garde tel quel pour que le document reste
             reconnaissable par ceux qui le remplissent. */
          <thead>
            <tr>
              <th style={thL}>{L(sys, 'Comp.', 'Comp.', 'Comp.')}</th>
              <th style={thL}>{L(sys, 'COMPÉTENCES', 'COMPETENCES', 'COMPETENCIAS')}</th>
              <th style={thL}>{L(sys, 'U.A.', 'L.U.', 'U.A.')}</th>
              <th style={thL}>{L(sys, 'Bar.', 'Scale', 'Esc.')}</th>
              <th style={thL}>{L(sys, 'Note', 'Mark', 'Nota')}</th>
              <th style={thL}>{L(sys, 'Cote', 'Grade', 'Calif.')}</th>
            </tr>
          </thead>
        ) : (
        <thead>
          <tr>
            <th style={thL} rowSpan={2}>{L(sys, 'Comp.', 'Comp.', 'Comp.')}</th>
            <th style={thL} rowSpan={2}>{L(sys, 'Compétence évaluée', 'Competence assessed', 'Competencia evaluada')}</th>
            <th style={thL} colSpan={critereColumns.length}>
              {L(sys, 'Critères d’évaluation — note / barème',
                 'Assessment criteria — mark / scale',
                 'Criterios de evaluación — nota / escala')}
            </th>
            <th style={thL} rowSpan={2}>{L(sys, 'Total', 'Total', 'Total')}</th>
            <th style={thL} rowSpan={2}>{L(sys, 'Cote', 'Grade', 'Nota')}</th>
          </tr>
          <tr>
            {critereColumns.map((c) => <th key={c.id} style={thL}>{c.nom}</th>)}
          </tr>
        </thead>
        )}
        <tbody>
          {parEpreuve && lignes.map((r, i) => {
            // Une compétence sans AUCUNE épreuve garde sa ligne : la règle du
            // responsable (« pas une seule matière cochée absente du bulletin »)
            // vaut aussi quand rien n'a encore été noté. On y écrit « — », pas 0.
            const eps = r.epreuves.length ? r.epreuves : [null];
            return (
              <Fragment key={r.code}>
                {eps.map((e, j) => (
                  <tr key={e ? e.id : 'vide'} style={{ breakInside: 'avoid' }}>
                    {j === 0 && (
                      <td style={{ ...numL, fontWeight: 'bold' }} rowSpan={eps.length}>{r.code}</td>
                    )}
                    {j === 0 && <td style={cellL} rowSpan={eps.length}>{r.intitule}</td>}
                    <td style={cellL}>{e ? e.nom : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td style={numL}>{e ? fix2(e.max) : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td style={{ ...numL, fontWeight: 'bold' }}>
                      {/* « - - - - » = la classe a DÉCLARÉ ne pas évaluer cette
                          compétence ; « — » = rien n'a été saisi. Deux choses
                          différentes, que le parent doit pouvoir distinguer. */}
                      {e ? fix2(e.note)
                        : r.nonEvaluee
                          ? <span style={{ color: '#6b7280', letterSpacing: '0.1em' }}>{MARQUE_NON_EVALUEE}</span>
                          : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    {j === 0 && (
                      <td
                        style={{ ...numL, fontWeight: 'bold', color: COTE_COLORS[r.cote] || '#111' }}
                        rowSpan={eps.length}
                      >
                        {r.cote || <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                    )}
                  </tr>
                ))}
                {finDeGroupe(i) && (
                  <tr style={{ background: '#f3f4f6', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                    <td style={{ ...cellL, fontStyle: 'italic', fontSize: '0.88em' }} colSpan={3}>
                      {finDeGroupe(i).numero != null ? `${finDeGroupe(i).numero}) ` : ''}{finDeGroupe(i).intitule}
                    </td>
                    <td style={{ ...numL, fontWeight: 'bold', whiteSpace: 'normal', fontSize: '0.88em' }}>
                      {finDeGroupe(i).achieved == null ? '—'
                        : `${L(sys, 'Total', 'Total', 'Total')}: ${fix2(finDeGroupe(i).achieved)}`}
                    </td>
                    <td style={{ ...numL, fontWeight: 'bold', whiteSpace: 'normal', fontSize: '0.88em' }}>
                      {finDeGroupe(i).moyenne == null ? '—'
                        : `${L(sys, 'Moy', 'Avg', 'Prom')}: ${fix2(finDeGroupe(i).moyenne)}`}
                    </td>
                    <td style={{
                      ...numL, fontWeight: 'bold', whiteSpace: 'normal', fontSize: '0.88em',
                      color: COTE_COLORS[finDeGroupe(i).cote] || '#111',
                    }}>
                      {finDeGroupe(i).cote || '—'}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {!parEpreuve && lignes.map((r, i) => (
            <Fragment key={r.code}>
            <tr style={{ breakInside: 'avoid' }}>
              <td style={{ ...numL, fontWeight: 'bold' }}>{r.code}</td>
              <td style={cellL}>{r.intitule}</td>
              {critereColumns.map((c) => (
                <CritereCell key={c.id} val={r.parCritere?.[c.id]} vars />
              ))}
              {/* « - - - - » ET « — » NE DISENT PAS LA MÊME CHOSE, et le parent
                  qui lit le bulletin doit pouvoir les distinguer. Le tiret seul
                  = rien n'a été saisi ; « - - - - » = la classe a DÉCLARÉ n'avoir
                  pas évalué cette compétence, et c'est pour cela qu'elle ne
                  compte dans aucun total. */}
              <td style={{ ...numL, fontWeight: 'bold' }}>
                {r.nonEvaluee
                  ? <span style={{ color: '#6b7280', letterSpacing: '0.1em' }}>{MARQUE_NON_EVALUEE}</span>
                  : r.achieved == null
                  ? <span style={{ color: '#9ca3af' }}>—</span>
                  : <>{fix2(r.achieved)}<span style={{ color: '#6b7280', fontSize: '0.86em' }}> /{fix2(r.possible)}</span></>}
              </td>
              <td style={{ ...numL, fontWeight: 'bold', color: COTE_COLORS[r.cote] || '#111' }}>
                {r.cote || <span style={{ color: '#9ca3af' }}>—</span>}
              </td>
            </tr>
            {/* ── LIGNE DE REGROUPEMENT ────────────────────────────────────
                Le carnet officiel ne liste pas les compétences à plat : il les
                range sous SIX intitulés numérotés, chacun suivi d'un total et
                d'une moyenne. Cette ligne se pose après la DERNIÈRE compétence
                de sa famille, d'où la comparaison avec la ligne suivante. */}
            {finDeGroupe(i) && (
              <tr style={{ background: '#f3f4f6', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                <td style={{ ...cellL, fontStyle: 'italic', fontSize: '0.88em' }} colSpan={2 + critereColumns.length}>
                  {finDeGroupe(i).numero != null ? `${finDeGroupe(i).numero}) ` : ''}{finDeGroupe(i).intitule}
                </td>
                {/* `whiteSpace: normal` : si la valeur ne tient toujours pas,
                    elle REVIENT À LA LIGNE. Une ligne plus haute se voit ;
                    une décimale perdue, non — et c'est elle qui ment. */}
                <td style={{ ...numL, fontWeight: 'bold', whiteSpace: 'normal', fontSize: '0.88em' }}>
                  {finDeGroupe(i).achieved == null ? '—'
                    : `${L(sys, 'Total', 'Total', 'Total')}: ${fix2(finDeGroupe(i).achieved)}`}
                </td>
                <td style={{ ...numL, fontWeight: 'bold', whiteSpace: 'normal', fontSize: '0.88em' }}>
                  {finDeGroupe(i).moyenne == null ? '—'
                    : `${L(sys, 'Moy', 'Avg', 'Prom')}: ${fix2(finDeGroupe(i).moyenne)}`}
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          <tr style={{ background: C.tintFort, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            {/* En disposition par épreuve, la valeur occupe les colonnes
                « Bar. » et « Note » : c'est bien un rapport entre les deux
                (« Total 380 / 430 » sur le carnet papier), pas une note isolée. */}
            <td style={{ ...thL, textAlign: 'left' }} colSpan={parEpreuve ? 3 : 2 + critereColumns.length}>
              {L(sys, 'TOTAL GÉNÉRAL', 'OVERALL TOTAL', 'TOTAL GENERAL')}
            </td>
            <td style={{ ...thL }} colSpan={parEpreuve ? 2 : 1}>
              {overall?.achieved == null ? '—' : `${fix2(overall.achieved)} /${fix2(overall.possible)}`}
            </td>
            <td style={{ ...thL, color: COTE_COLORS[coteGenerale] || TH_TXT }}>{coteGenerale || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Matières hors référentiel ─────────────────────────────────────
          Le carnet de référence porte un second tableau « Additional subjects »
          (Social Values, Music, National Language…) : des matières que l'école
          évalue sans qu'elles correspondent à une compétence du référentiel
          national. Elles n'entrent PAS dans le total général — sinon le /240
          cesserait d'être comparable au barème du niveau. */}
      {additionalSubjects.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: gap, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }} colSpan={2 + critereColumns.length + 2}>
                {L(sys, `Matières complémentaires — évaluation ${classLabel}`,
                   `Additional subjects – ${classLabel} evaluation`,
                   `Asignaturas complementarias — ${classLabel}`)}
              </th>
            </tr>
            <tr>
              <th style={th} colSpan={2}>{L(sys, 'Matière', 'Subject', 'Asignatura')}</th>
              {critereColumns.map((c) => <th key={c.id} style={th}>{c.nom}</th>)}
              <th style={th}>{L(sys, 'Total', 'Total', 'Total')}</th>
              <th style={th}>{L(sys, 'Cote', 'Grade', 'Nota')}</th>
            </tr>
          </thead>
          <tbody>
            {additionalSubjects.map((s) => (
              <tr key={s.id || s.name} style={{ breakInside: 'avoid' }}>
                <td style={cell} colSpan={2}>{s.name}</td>
                {critereColumns.map((c) => <CritereCell key={c.id} val={s.parCritere?.[c.id]} pt={pt} />)}
                <td style={{ ...num, fontWeight: 'bold' }}>
                  {s.achieved == null
                    ? <span style={{ color: '#9ca3af' }}>—</span>
                    : <>{fix2(s.achieved)}<span style={{ color: '#6b7280', fontSize: '0.86em' }}> /{fix2(s.possible)}</span></>}
                </td>
                <td style={{ ...num, fontWeight: 'bold', color: COTE_COLORS[s.cote] || '#111' }}>
                  {s.cote || <span style={{ color: '#9ca3af' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Légende des cotes ────────────────────────────────────────────── */}
      {coteBareme.length > 0 && (
        <div style={{ marginTop: gap, fontSize: `${pt - 0.8}pt`, color: '#374151' }}>
          <strong>{L(sys, 'Échelle', 'Grading scale', 'Escala')} :</strong>{' '}
          {/* Le libellé passe par `primCoteLabel` : `PRIM_COTE_DEFAULT` porte des
              libellés FRANÇAIS, et la légende d'un bulletin anglophone affichait
              donc « Très bien acquis », « En cours d'acquisition ». Le carnet de
              référence dit « Very well achieved », « In progress ». Constaté sur
              le rendu réel le 2026-10-12. Le fallback reste le libellé de
              l'école : un barème reconfiguré garde SES mots. */}
          {coteBareme.map((b, i) => (
            <span key={b.cote}>
              {i > 0 && ' · '}
              <strong style={{ color: COTE_COLORS[b.cote] || '#111' }}>{b.cote}</strong>{' '}
              {primCoteLabel(b.cote, b.libelle, sys)} (≥ {b.seuil_min} %)
            </span>
          ))}
        </div>
      )}

      {/* ── Mention « bulletin provisoire » ──────────────────────────────── */}
      {provisoire && (
        <div style={{
          marginTop: gap, padding: 'calc(var(--nc-gap) * 0.5) 6px', border: `1px solid ${ACCENT}`,
          background: '#ecfdf5', fontSize: `${pt - 0.8}pt`, color: '#065f46',
          WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
        }}>
          <strong>{L(sys, 'Bulletin provisoire', 'Provisional report', 'Boletín provisional')} :</strong>{' '}
          {/* ── « LE TOTAL PORTE SUR  POINTS » ──────────────────────────────
              Défaut relevé sur le carnet de référence (CE1 BIL, bulletin
              VIERGE) : `overall.possible` est alors `null`, `fix2` rend une
              chaîne vide, et la phrase s'imprimait « Le total porte sur points
              et non sur 300 » — un trou au milieu d'une phrase, sur un document
              remis aux parents.
              La cause n'est pas la mise en forme mais le PROPOS : tant
              qu'aucune compétence n'est évaluée, il n'y a pas de dénominateur à
              annoncer. On dit donc l'autre chose, la vraie. */}
          {overall?.possible == null
            ? L(sys,
              `aucune compétence n’a encore été évaluée (${nonEvalueesCodes.join(', ')}). Ni total ni moyenne ne peuvent être établis à ce stade ; le barème complet du niveau est de ${fix2(niveauTotal)} points.`,
              `no competence has been assessed yet (${nonEvalueesCodes.join(', ')}). Neither a total nor an average can be established at this stage; the full scale for this level is ${fix2(niveauTotal)} points.`,
              `aún no se ha evaluado ninguna competencia (${nonEvalueesCodes.join(', ')}). No puede establecerse total ni promedio; la escala completa del nivel es de ${fix2(niveauTotal)} puntos.`)
            : L(sys,
              `compétences non encore évaluées (${nonEvalueesCodes.join(', ')}). Le total porte sur ${fix2(overall.possible)} points et non sur ${fix2(niveauTotal)} ; la moyenne ne tient compte que des compétences évaluées.`,
              `competences not yet assessed (${nonEvalueesCodes.join(', ')}). The total is out of ${fix2(overall.possible)}, not ${fix2(niveauTotal)}; the average is calculated on the assessed competences only.`,
              `competencias aún no evaluadas (${nonEvalueesCodes.join(', ')}). El total es sobre ${fix2(overall.possible)}, no sobre ${fix2(niveauTotal)}.`)}
        </div>
      )}

      {/* ── Synthèse ─────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: gap }}>
        <tbody>
          <tr>
            <td style={{ ...th, width: '20%' }}>{L(sys, 'Total obtenu', 'Total obtained', 'Total obtenido')}</td>
            <td style={num}>
              {overall?.achieved == null ? '—' : `${fix2(overall.achieved)} / ${fix2(overall.possible)}`}
            </td>
            <td style={{ ...th, width: '14%' }}>{L(sys, 'Moyenne', 'Average', 'Promedio')}</td>
            <td style={num}>
              {moyenneGenerale == null ? '—' : `${fix2(moyenneGenerale)} / ${PRIM_GRADE_MAX}`}
            </td>
            <td style={{ ...th, width: '10%' }}>{L(sys, 'Cote', 'Grade', 'Nota')}</td>
            <td style={{ ...num, fontWeight: 'bold', color: COTE_COLORS[coteGenerale] || '#111' }}>
              {coteGenerale || '—'}
            </td>
            <td style={{ ...th, width: '10%' }}>{L(sys, 'Rang', 'Rank', 'Puesto')}</td>
            {/* Le rang absent s'écrit « — / effectif » et non « — » : l'effectif
                est connu même quand le rang ne l'est pas, et le parent qui lit
                « — » seul ne sait pas si la classe compte 8 élèves ou 60. */}
            <td style={num}>{rank ? `${rank} / ${effectif}` : `— / ${effectif ?? ''}`}</td>
          </tr>
          {(appreciationGenerale || decision) && (
            <tr>
              <td style={th}>{L(sys, 'Appréciation', 'Appreciation', 'Apreciación')}</td>
              <td style={cell} colSpan={3}>{appreciationGenerale || ''}</td>
              <td style={th} colSpan={2}>{L(sys, 'Décision', 'Decision', 'Decisión')}</td>
              <td style={cell} colSpan={2}>{decision || ''}</td>
            </tr>
          )}
          {/* ── TRAVAIL ACADÉMIQUE ────────────────────────────────────────
              LES QUATRE DISTINCTIONS DU CARNET, SUR UNE LIGNE.
              « Félicitations » manquait — alors que les photos du carnet de
              l'école la portent, et que l'école la SAISIT déjà au conseil de
              classe (`__felicitation__`, lu par `getAbsCond` depuis toujours).
              Elle s'imprimait donc nulle part : un élève félicité par son
              conseil recevait un carnet muet là-dessus.
              La ligne de synthèse compte HUIT colonnes, et les trois paires
              d'alors en occupaient déjà huit avec l'en-tête « Travail
              académique ». L'en-tête part : c'est un nom de rubrique, pas une
              donnée, le carnet papier ne le porte pas, et les quatre paires
              (libellé + valeur) tiennent alors exactement. */}
          {mentions && (
            <tr>
              <td style={th}>{L(sys, 'Avertissement', 'Warning', 'Advertencia')}</td>
              <td style={num}>{mentions.avertissement || '—'}</td>
              <td style={th}>{L(sys, 'Tableau d’honneur', 'Honour roll', 'Cuadro de honor')}</td>
              <td style={num}>{mentions.tableauHonneur || '—'}</td>
              <td style={th}>{L(sys, 'Encouragement', 'Commendation', 'Estímulo')}</td>
              <td style={num}>{mentions.encouragement || '—'}</td>
              <td style={th}>{L(sys, 'Félicitations', 'Congratulations', 'Felicitación')}</td>
              <td style={num}>{mentions.felicitation || '—'}</td>
            </tr>
          )}

          {/* ── STATS DE PERFORMANCE ──────────────────────────────────────
              Situer l'élève dans sa classe : la meilleure moyenne, la plus
              faible, et celle de la classe. */}
          {statsClasse && (
            <tr>
              <td style={th}>{L(sys, 'Stats de performance', 'Performance stats', 'Estadísticas')}</td>
              <td style={th}>{L(sys, 'Moy. premier', 'Top average', 'Prom. primero')}</td>
              <td style={num}>{statsClasse.premier == null ? '—' : fix2(statsClasse.premier)}</td>
              <td style={th} colSpan={statsClasse.reussite == null ? 2 : 1}>
                {L(sys, 'Moy. dernier', 'Lowest average', 'Prom. último')}
              </td>
              <td style={num}>{statsClasse.dernier == null ? '—' : fix2(statsClasse.dernier)}</td>
              <td style={th}>{L(sys, 'Moy. générale', 'Class average', 'Prom. general')}</td>
              <td style={num}>{statsClasse.generale == null ? '—' : fix2(statsClasse.generale)}</td>
              {/* LE « % DE RÉUSSITE » TIENT DANS CETTE LIGNE SANS L'AGRANDIR.
                  « Moy. dernier » y occupait deux colonnes sur huit pour un
                  libellé de deux mots ; le carnet papier, lui, porte QUATRE
                  valeurs — 1st Avr., Least Avr., Gen. avr., Suc. rates. La
                  colonne rendue accueille la quatrième, et la ligne garde sa
                  hauteur : une ligne de plus coûterait de la place à la zone où
                  l'enseignant ÉCRIT. Sans taux fourni — toutes les écoles qui
                  n'ont rien demandé — la ligne reste celle d'avant, au point. */}
              {statsClasse.reussite != null && (
                <td style={{ ...num, fontWeight: 'bold' }}>
                  {L(sys, 'Réussite', 'Pass', 'Éxito')} : {statsClasse.reussite} %
                </td>
              )}
            </tr>
          )}

          <tr>
            <td style={th}>{L(sys, 'Observations du titulaire', 'Class teacher’s remarks', 'Observaciones')}</td>
            {/* ZONE LIBRE : sa hauteur suit `--nc-observ`, qui reçoit en plus
                le RELIQUAT de la page (cf. `--nc-reliquat`). C'est ici que va
                la place restante d'un carnet peu rempli — pas dans un grand
                vide en bas de feuille — parce que c'est ici qu'on écrit. */}
            <td style={{ ...cell, height: 'var(--nc-observ)', borderTop: B }} colSpan={signatureParent ? 4 : 7} />
            {signatureParent && (
              <>
                <td style={th} colSpan={1}>{L(sys, 'Signature du parent', 'Parent’s signature', 'Firma del padre')}</td>
                <td style={{ ...cell, height: 26, borderTop: B }} colSpan={2} />
              </>
            )}
          </tr>
        </tbody>
      </table>

      {/* ── AUTRES STATISTIQUES ───────────────────────────────────────────
          Combien d'élèves par tranche de moyenne. Le carnet la porte en pied :
          un parent y lit où se situe son enfant dans la classe. */}
      {repartition.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: gap }}>
          <tbody>
            {/* LA COLONNE « TOTAL » DU CARNET PAPIER. Elle n'est pas décorative :
                sans elle, un parent qui additionne les neuf tranches et tombe
                sur 18 là où la classe compte 24 élèves ne sait pas si six
                camarades manquent ou si le tableau est faux. Le total est
                l'effectif RÉELLEMENT noté, fourni par l'écran — ce gabarit
                n'additionne rien. */}
            <tr>
              <td style={{ ...th, textAlign: 'left' }} colSpan={repartition.length + (repartitionTotal != null ? 2 : 1)}>
                {L(sys, 'Autres statistiques', 'Other statistics', 'Otras estadísticas')}
              </td>
            </tr>
            <tr>
              <td style={th}>
                {L(sys, 'Intervalle de moyenne', 'Average range', 'Intervalo')}
              </td>
              {repartition.map((r) => <td key={r.label} style={th}>{r.label}</td>)}
              {repartitionTotal != null && <td style={th}>{L(sys, 'Total', 'Total', 'Total')}</td>}
            </tr>
            <tr>
              <td style={th}>{L(sys, 'Nombre d’élèves', 'Number of pupils', 'N.º de alumnos')}</td>
              {repartition.map((r) => <td key={r.label} style={num}>{r.n}</td>)}
              {repartitionTotal != null && (
                <td style={{ ...num, fontWeight: 'bold' }}>{repartitionTotal}</td>
              )}
            </tr>
          </tbody>
        </table>
      )}

      <OfficialSignatures
        school={school} sys={sys} profPrincipal={titulaire} vars
        headLabel={L(sys, 'Le Directeur / La Directrice', 'The Head Teacher', 'El Director / La Directora')}
        teacherLabel={L(sys, "L'Enseignant(e)", 'The Class Teacher', 'El Maestro / La Maestra')}
      />
    </OfficialSheet>
  );
}
