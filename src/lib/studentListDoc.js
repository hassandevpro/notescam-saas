// LA LISTE DES ÉLÈVES — document imprimable (A4 portrait).
//
// Extrait de src/pages/Students.jsx sans rien changer au document existant : un
// imprimable qui vit dans une page React n'est vérifiable ni par la suite
// d'impression (scripts/test-print.mjs) ni à l'œil, et tous les autres documents
// de l'application sont déjà des modules de src/lib.
//
// L'ENSEIGNANT PRINCIPAL Y FIGURE DÉSORMAIS, par classe. Même règle que les
// bulletins et les procès-verbaux (src/lib/headTeachers.js) : les DEUX titulaires
// s'il y en a deux, le libellé accordé au nombre, et RIEN si la classe n'a pas de
// titulaire — une ligne « P. principal : » vide sur un document officiel vaut
// moins que pas de ligne du tout.
//
// PUR : ni React, ni store, ni window. L'appelant ouvre la fenêtre d'impression.
import { officialHeaderHtml, officialSignatureHtml } from './officialDocHeader';
import { tutelleBasic } from './tutelle';
import { classesIdentity } from './schoolIdentity';
import { headTeacherNames, headTeacherLabel, SEPARATEUR } from './headTeachers';
import { classSectionKey } from '../core/engineResolver';
import { resolveCountryCode } from '../countries';

export function studentListHtml({
  students = [], classes = [], teachers = [], school = null,
  classFilter = '', cols = {}, units = [],
} = {}) {
  const {
    matricule: showMatricule = true,
    genre: showGenre = true,
    dateNaissance: showDateNaissance = true,
    lieuNaissance: showLieuNaissance = true,
    contact: showContact = true,
  } = cols;

  // Guinée Équatoriale : document entièrement en espagnol.
  const isGE = resolveCountryCode(school) === 'guinea_eq';
  const Lp = (fr, es) => (isGE ? es : fr);
  const locale = isGE ? 'es-ES' : 'fr-FR';
  const isMale   = (g) => g === 'Masculin' || g === 'Masculino';
  const isFemale = (g) => g === 'Feminin'  || g === 'Femenino';

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(locale) : '—';
  const classeImprimee = classFilter ? classes.find((c) => c.id === classFilter) : null;
  const className = classeImprimee?.name || null;
  // Classes RÉELLEMENT représentées dans la liste imprimée — pas toutes celles de
  // l'école. Un utilisateur qui restreint sa liste aux élèves du primaire (par la
  // recherche, par son périmètre, par une sélection) imprime un document du
  // primaire, même sans avoir posé de filtre « classe ».
  const classesImprimees = classFilter
    ? [classeImprimee].filter(Boolean)
    : [...new Set(students.map((s) => s.class_id).filter(Boolean))]
        .map((id) => classes.find((c) => c.id === id))
        .filter(Boolean);

  // Tutelle : la classe filtrée décide ; sans filtre, la composition de la liste.
  const basic = tutelleBasic({ cls: classeImprimee, classes: classesImprimees });
  // Identité imprimée (nom + logo + cachet + chef d'établissement) : celle du
  // SECTEUR des classes imprimées, et le complexe dès que la liste en mélange
  // plusieurs — même règle que la tutelle juste au-dessus. L'en-tête portait
  // jusqu'ici l'école en toutes circonstances : dans un groupe scolaire qui tient
  // maternelle, primaire et collège sous des noms et des logos distincts, la
  // liste de la 6e sortait sous le logo du complexe.
  const docSchool = classesIdentity(school, classesImprimees, units);
  const today = new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const colCount   = 2 + (showMatricule ? 1 : 0) + (showGenre ? 1 : 0) + (showDateNaissance ? 1 : 0) + (showLieuNaissance ? 1 : 0) + (showContact ? 1 : 0);
  const studentWord = (n) => Lp(`élève${n !== 1 ? 's' : ''}`, `alumno${n !== 1 ? 's' : ''}`);

  // Tri alphabétique systématique des élèves dans la liste imprimée.
  const sortByName = (arr) =>
    [...arr].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  // Grouper par classe si pas de filtre. Chaque groupe garde SA classe : sans elle,
  // impossible d'imprimer le titulaire (le nom du groupe ne suffit pas à le
  // retrouver, et deux classes peuvent porter le même nom).
  const groups = classFilter
    ? [{ name: className, cls: classeImprimee, students: sortByName(students) }]
    : (() => {
        const map = {};
        students.forEach((s) => {
          const cls = classes.find((c) => c.id === s.class_id);
          const key = cls?.name || Lp('Non assigné', 'Sin asignar');
          if (!map[key]) map[key] = { cls: cls || null, students: [] };
          map[key].students.push(s);
        });
        return Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, g]) => ({ name, cls: g.cls, students: sortByName(g.students) }));
      })();

  // L'enseignant principal de la classe — mention identique aux bulletins et aux
  // procès-verbaux. Le libellé suit la classe, pas le document : « Class teacher »
  // pour une classe anglophone, « Enseignant(e) » au fondamental, « P. principal »
  // au secondaire. Deux titulaires → libellé au pluriel.
  const teacherLine = (cls) => {
    const noms = headTeacherNames(cls, teachers);
    if (!noms.length) return '';
    const sys   = isGE ? 'ES' : (cls?.system === 'EN' ? 'EN' : 'FR');
    const sec   = cls ? classSectionKey(cls) : 'autre';
    const label = headTeacherLabel(noms.length, sys, { basic: sec === 'maternelle' || sec === 'primaire' });
    return `<div class="class-teacher">${label} : <strong>${noms.join(SEPARATEUR)}</strong></div>`;
  };

  const tableRows = (sts) => sts.map((s, i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td class="center">${i + 1}</td>
      <td><strong>${s.name}</strong></td>
      ${showMatricule ? `<td class="center mono">${s.matricule || '—'}</td>` : ''}
      ${showGenre ? `<td class="center">${isMale(s.gender) ? 'M' : isFemale(s.gender) ? 'F' : '—'}</td>` : ''}
      ${showDateNaissance ? `<td class="center">${fmtDate(s.date_naissance)}</td>` : ''}
      ${showLieuNaissance ? `<td>${s.lieu_naissance || '—'}</td>` : ''}
      ${showContact ? `<td>${s.parent_phone || '—'}</td>` : ''}
    </tr>
  `).join('');

  const classSection = (g) => `
    <div class="class-section">
      <div class="class-header">
        <span class="class-name">${g.name}</span>
        <span class="class-count">${g.students.length} ${studentWord(g.students.length)}</span>
      </div>
      ${teacherLine(g.cls)}
      <table>
        <thead>
          <tr>
            <th class="center" style="width:36px">N°</th>
            <th>${Lp('Nom complet', 'Apellidos y nombre')}</th>
            ${showMatricule ? `<th class="center" style="width:100px">${Lp('Matricule', 'Matrícula')}</th>` : ''}
            ${showGenre ? `<th class="center" style="width:36px">${Lp('Sexe', 'Sexo')}</th>` : ''}
            ${showDateNaissance ? `<th class="center" style="width:100px">${Lp('Né(e) le', 'Fecha nac.')}</th>` : ''}
            ${showLieuNaissance ? `<th style="width:110px">${Lp('Lieu naiss.', 'Lugar nac.')}</th>` : ''}
            ${showContact ? `<th style="width:110px">${Lp('Tél. parent', 'Tel. padres')}</th>` : ''}
          </tr>
        </thead>
        <tbody>${tableRows(g.students)}</tbody>
        <tfoot>
          <tr><td colspan="${colCount}" style="text-align:right;padding:6px 8px;font-size:11px;color:#555">
            ${Lp('Total', 'Total')} : <strong>${g.students.length}</strong> ${studentWord(g.students.length)} —
            ${Lp('Garçons', 'Niños')} : <strong>${g.students.filter(s => isMale(s.gender)).length}</strong> —
            ${Lp('Filles', 'Niñas')} : <strong>${g.students.filter(s => isFemale(s.gender)).length}</strong>
          </td></tr>
        </tfoot>
      </table>
    </div>
  `;

  const html = `<!DOCTYPE html>
<html lang="${isGE ? 'es' : 'fr'}">
<head>
<meta charset="utf-8"/>
<title>${Lp('Liste des élèves', 'Lista de alumnos')} — ${school?.name || 'École'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111; }
  .page { padding: 16mm 14mm; }
  .header { text-align: center; margin-bottom: 18px; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; }
  .header .school { font-size: 15px; font-weight: 700; text-transform: uppercase; color: #1e3a5f; letter-spacing: 0.5px; }
  .header .subtitle { font-size: 11px; color: #555; margin-top: 2px; }
  .header .doc-title { font-size: 17px; font-weight: 800; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; }
  .header .meta { font-size: 10px; color: #777; margin-top: 4px; }
  .class-section { margin-bottom: 24px; }
  .class-header { display: flex; align-items: center; justify-content: space-between; background: #1e3a5f; color: #fff; padding: 6px 10px; border-radius: 4px 4px 0 0; margin-bottom: 0; }
  .class-name { font-size: 13px; font-weight: 700; }
  .class-count { font-size: 11px; opacity: 0.8; }
  .class-teacher { font-size: 10.5px; color: #33425c; background: #eef2f8; border-bottom: 1px solid #bcc8d8; padding: 4px 10px; }
  .class-teacher strong { color: #1e3a5f; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { background: #e8edf4; }
  th { padding: 6px 8px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid #bcc8d8; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e9ef; vertical-align: middle; }
  tr.even td { background: #f7f9fc; }
  tfoot td { background: #f0f3f8 !important; border-top: 1px solid #bcc8d8; }
  .center { text-align: center; }
  .mono { font-family: monospace; font-size: 10px; }
  .footer { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #777; }
  .sign-area { display: flex; gap: 60px; margin-top: 30px; }
  .sign-box { flex: 1; text-align: center; }
  .sign-line { border-bottom: 1px solid #999; margin: 40px 0 4px; }
  .sign-label { font-size: 10px; color: #555; }
  @media print {
    @page { margin: 14mm; size: A4 portrait; }
    body { padding: 0; }
    .page { padding: 0; }
    .class-section { break-inside: auto; }
    .class-header { break-after: avoid; }
    /* Le titulaire reste collé à l'en-tête de SA classe : seul, en haut d'une
       page, il se lirait comme le titulaire de la classe précédente. */
    .class-teacher { break-after: avoid; break-before: avoid; }
  }
</style>
</head>
<body>
<div class="page">
  ${officialHeaderHtml(docSchool, { sys: isGE ? 'ES' : 'FR', title: Lp('LISTE DES ÉLÈVES', 'LISTA DE ALUMNOS'), subtitle: className || '', basic })}
  <div style="text-align:center;font-size:9px;color:#777;margin:-2px 0 12px">${Lp('Imprimé le', 'Impreso el')} ${today}</div>

  ${groups.map(classSection).join('')}

  <div class="footer">
    <span>${Lp('Total général', 'Total general')} : <strong>${students.length}</strong> ${studentWord(students.length)}</span>
    <span>${docSchool?.name || ''} — ${today}</span>
  </div>

  ${officialSignatureHtml(docSchool, isGE ? 'ES' : 'FR')}
</div>
</body>
</html>`;

  return html;
}
