// FEUILLE DE NOTES À REMPLIR À LA MAIN — génération du document A4 paysage.
//
// Le papier que les écoles fabriquaient elles-mêmes (photographié le
// 2026-11-01) : un élève par ligne, une colonne par épreuve, le barème sous
// l'intitulé, et assez de place dans la case pour y écrire au stylo. Deux
// variantes du même gabarit — VIERGE (le défaut, pour corriger sur papier) et
// REMPLIE (les notes déjà saisies, pour relire).
//
// Ce fichier ne décrit QUE le contenu : la page, les marges, les couleurs et les
// sauts viennent du socle `lib/print` (profil `large` = A4 paysage, 8 mm), comme
// le procès-verbal du conseil de classe. Aucune règle @page ici.
//
// Le découpage en pages (colonnes et lignes) est fait par `core/feuilleNotes.js`,
// qui est pur et testé. Ce module ne sait que mettre en forme.

import { sheetOpen, SHEET_CLOSE, titleBandHtml, safe, CLASS } from './print';
import { construireFeuille, totalBareme } from '../core/feuilleNotes';

const PROFIL = 'large';   // A4 paysage — une feuille large, c'est tout l'objet

const L = (sys, fr, en) => (sys === 'EN' ? en : fr);

// ── Densités ─────────────────────────────────────────────────────────────────
//
// LA HAUTEUR DE LIGNE EST LA SEULE MESURE QUI COMPTE. Une grille imprimée dont
// les cases font 4 mm est inutilisable : on n'y écrit pas « 13,5 » à la main.
// 7 mm (≈ 26 px) est la hauteur d'une écriture manuscrite ordinaire — c'est la
// densité « confort », celle qui est proposée par défaut.
//
// MAIS LE PAPIER COÛTE. Onze compétences × quatre épreuves + leur total, c'est
// 55 colonnes : à l'aise, une classe de 35 sort sur huit pages. Les feuilles que
// les écoles fabriquent elles-mêmes sont plus serrées que ça — elles tiennent sur
// deux. On offre donc les deux, en le DISANT, plutôt que de choisir pour elles :
// une école qui photocopie à ses frais n'a pas le même arbitrage qu'une autre.
//
// Ces capacités sont celles de `core/feuilleNotes` (découpe) ET du gabarit
// (hauteur de case) : les deux doivent venir du même endroit, sinon la feuille
// annonce un nombre de pages qu'elle ne tient pas.
// LA COLONNE DU NOM SE MESURE EN POURCENTAGE, les cases en pixels. En
// `table-layout:fixed`, la place restante est répartie AU PRORATA des largeurs
// déclarées : avec un nom en pixels, huit matières se partageaient tout le
// surplus et « ABDOUL AZIZ ALIOU ABOUBAKAR » sortait tronqué sur une feuille
// pourtant à moitié vide. C'est elle qui dit DE QUI on parle — un nom rogné rend
// la ligne inutilisable, alors qu'une case de note plus étroite reste une case.
export const DENSITES = {
  confort: { colonnes: 16, lignes: 25, hLigne: 26, police: 10, largeurCol: 46, largeurNom: '18%' },
  serre:   { colonnes: 24, lignes: 34, hLigne: 18, police: 9,  largeurCol: 32, largeurNom: '16%' },
};
export const DENSITE_DEFAUT = 'confort';

const densiteDe = (cle) => DENSITES[cle] || DENSITES[DENSITE_DEFAUT];

const BORD  = '1px solid #475569';
const caseStyle = (d) => `border:${BORD};padding:0 3px;font-size:${d.police}px`;
const TH    = `border:${BORD};padding:3px 2px;font-size:9px;text-align:center;font-weight:bold;background:#e2e8f0;color:#0f172a`;
const TH_GR = `border:${BORD};padding:3px 4px;font-size:9.5px;text-align:center;font-weight:bold;background:#1e3a5f;color:#fff`;

// ── En-tête d'identification ─────────────────────────────────────────────────
//
// PAS D'EN-TÊTE MINISTÉRIEL ICI, et c'est délibéré. Ce n'est pas une pièce
// remise à un parent : c'est l'outil de travail de l'enseignant, et les trois
// blocs République/Ministère/Délégation lui mangeraient six lignes d'élèves par
// feuille. On garde l'identification STRICTEMENT nécessaire pour qu'une feuille
// ramassée sur une table se recolle à sa classe : établissement, classe,
// période, matière, effectif, enseignant, et une place pour la date.
function enteteHtml({ school, sys, classe, periode, portee, effectif, enseignant }) {
  const cell = 'border:1px solid #94a3b8;padding:3px 6px;font-size:9.5px';
  const champ = (lib, val) => `<td style="${cell}"><strong>${lib}</strong> : ${val}</td>`;
  return `
    <table class="${CLASS.keep}" style="width:100%;border-collapse:collapse;margin-bottom:5px">
      <tbody>
        <tr>
          ${champ(L(sys, 'Établissement', 'School'), safe(school?.name, '—'))}
          ${champ(L(sys, 'Classe', 'Class'), safe(classe, '—'))}
          ${champ(L(sys, 'Effectif', 'Enrolment'), safe(effectif, '—'))}
          ${champ(L(sys, 'Année', 'Year'), safe(school?.current_year, '—'))}
        </tr>
        <tr>
          ${champ(portee?.libelle || L(sys, 'Matière', 'Subject'), safe(portee?.valeur, '—'))}
          ${champ(L(sys, 'Période', 'Period'), safe(periode, '—'))}
          ${champ(L(sys, 'Enseignant', 'Teacher'), safe(enseignant, '…………………………'))}
          ${champ(L(sys, 'Date', 'Date'), '………………………')}
        </tr>
      </tbody>
    </table>`;
}

// ── Une page ─────────────────────────────────────────────────────────────────
function pageHtml(page, ctx) {
  const { sys, titre, d } = ctx;
  const CASE = caseStyle(d);

  // Deux rangs d'en-tête : le GROUPE (matière, compétence) puis la COLONNE
  // (l'épreuve) avec son barème. C'est la forme des feuilles de l'école, et
  // c'est ce qui permet d'écrire « oral /5 » sans répéter la compétence quatre
  // fois. `<thead>` est réimprimé par le navigateur sur chaque page (socle).
  const rangGroupes = page.groupes.map((g) => {
    const total = totalBareme(g);
    const sur = total ? ` <span style="font-weight:normal">/${total}</span>` : '';
    return `<th style="${TH_GR}" colspan="${g.colonnes.length}">${safe(g.label, '')}${sur}</th>`;
  }).join('');

  const rangColonnes = page.colonnes.map((c) => {
    const bareme = Number(c.bareme);
    const sur = Number.isFinite(bareme) && bareme > 0
      ? `<br/><span style="font-weight:normal;font-size:8px;color:#334155">${L(sys, 'sur', 'out of')} ${bareme}</span>`
      : '';
    // Les colonnes CALCULÉES (Total, Moyenne, Rang) se distinguent à l'œil :
    // elles se remplissent après coup, une fois les notes posées.
    const fond = c.calculee ? 'background:#f1f5f9' : '';
    return `<th style="${TH};${fond};width:${c.largeur || d.largeurCol}px">${safe(c.label, '')}${sur}</th>`;
  }).join('');

  const corps = page.lignes.map((ligne) => {
    const cases = page.colonnes.map((c) => {
      const v = ligne.cellules?.[c.id];
      const fond = c.calculee ? 'background:#f8fafc' : '';
      return `<td style="${CASE};${fond};height:${d.hLigne}px;text-align:center">${v ? safe(v) : ''}</td>`;
    }).join('');
    // Une ligne SANS NOM reste une ligne complète : on l'écrit à la main.
    const creux = ligne.vide ? 'color:#94a3b8' : '';
    return `
      <tr class="${CLASS.keepRow}">
        <td style="${CASE};height:${d.hLigne}px;text-align:center;font-size:9px;${creux}">${safe(ligne.numero, '')}</td>
        <td style="${CASE};height:${d.hLigne}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${creux}">${safe(ligne.nom, '')}</td>
        ${cases}
      </tr>`;
  }).join('');

  const suite = page.suite ? ` (${L(sys, 'suite', 'continued')})` : '';
  const pagination = page.total > 1
    ? ` — ${L(sys, 'page', 'page')} ${page.no}/${page.total}${suite}`
    : '';

  // DÉBORDEMENT ANNONCÉ, JAMAIS SUBI. Un groupe plus large que la page sort
  // quand même, en entier, et le dit : une colonne rognée en silence se
  // découvre une fois les photocopies faites.
  const trop = page.groupes.some((g) => g.deborde)
    ? `<p style="font-size:8px;color:#b45309;margin:4px 0 0;font-style:italic">
         ${L(sys,
           'Cette partie compte plus de colonnes qu’une page n’en tient : les cases y sont resserrées.',
           'This part has more columns than a page holds: the cells are tighter here.')}
       </p>`
    : '';

  return `
    ${sheetOpen({ school: ctx.school, profile: PROFIL, fontSize: d.police })}
      ${titleBandHtml(`${safe(titre, '')}${pagination}`, { fontSize: 12 })}
      ${enteteHtml(ctx)}
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <thead>
          <tr>
            <th style="${TH};width:26px" rowspan="2">N°</th>
            <th style="${TH};text-align:left;width:${d.largeurNom}" rowspan="2">${L(sys, 'Nom et prénoms', 'Full name')}</th>
            ${rangGroupes}
          </tr>
          <tr>${rangColonnes}</tr>
        </thead>
        <tbody>${corps}</tbody>
      </table>
      ${trop}
    ${SHEET_CLOSE}`;
}

// ── Point d'entrée ───────────────────────────────────────────────────────────
//
// @param  opts  tout ce que `construireFeuille` attend, plus le contexte
//               d'impression (école, classe, période, matière/UA, enseignant).
// @returns {{ sheets: string[], pages: number, profile: string }}
//
// Renvoie les FEUILLES, pas l'impression : l'appelant décide d'imprimer
// (`printSheets`) ou d'afficher un aperçu. Même chaîne HTML dans les deux cas —
// c'est la règle « aperçu = impression » du socle.
export function feuilleNotesSheets({
  school, sys = 'FR', titre, classe, periode, portee, enseignant,
  groupes = [], eleves = [], valeur = null, vierge = true, lignesVides = 0,
  densite = DENSITE_DEFAUT,
} = {}) {
  // La DENSITÉ décide de tout à la fois : combien de colonnes et de lignes
  // tiennent sur une page (la découpe) et la hauteur des cases (le gabarit).
  // Une seule source, sinon la feuille annonce des pages qu'elle ne tient pas.
  const d = densiteDe(densite);
  const { pages } = construireFeuille({
    groupes, eleves, valeur, vierge, lignesVides,
    maxColonnes: d.colonnes, maxLignes: d.lignes,
  });
  const ctx = {
    school, sys, classe, periode, portee, enseignant, d,
    effectif: eleves.length || '',
    titre: titre || (vierge
      ? L(sys, 'FEUILLE DE NOTES — À REMPLIR', 'MARK SHEET — TO FILL IN')
      : L(sys, 'RELEVÉ DE NOTES', 'MARK SHEET')),
  };
  return {
    sheets: pages.map((p) => pageHtml(p, ctx)),
    pages: pages.length,
    profile: PROFIL,
  };
}

export const FEUILLE_NOTES_PROFIL = PROFIL;
