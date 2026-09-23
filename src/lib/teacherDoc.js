// Fiche de renseignements d'un ENSEIGNANT (impression).
//
// Le module RH (lib/hrDoc.js) imprime déjà une fiche de dossier personnel, mais
// il travaille sur la table `staff` et son contenu est tourné vers le dossier
// administratif (contrat, congés, présences, évaluations). Un enseignant vit
// dans `teachers` : beaucoup d'écoles n'ont AUCUNE ligne `staff` pour leur corps
// enseignant, et leur réalité est ailleurs — matières, classes couvertes, accès
// à l'application. Imprimer la fiche RH pour un enseignant sortirait une page de
// tirets ; d'où ce document distinct, sur le même socle d'en-tête.
//
// L'attestation de travail, elle, n'est PAS redupliquée : printWorkCertificate
// (hrDoc) fonctionne tel quel avec un enseignant, contrat absent compris.
import { openPrintDocument, docRef, esc } from './printDoc.js';
import { dateLabel } from './hrDoc.js';

// « Masculin » / « M » → libellé lisible ; on n'invente rien si c'est vide.
function genderLabel(v, tr) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('m')) return tr('Masculin', 'Male', 'Masculino');
  if (s.startsWith('f')) return tr('Féminin', 'Female', 'Femenino');
  return v;
}

export function printTeacherFile({ school, t, teacher, subjects = [], classNames = [], docs = [], sectorLabel }) {
  const tr = t || ((fr) => fr);
  const ref = docRef('ENS', String(school?.current_year || '').slice(0, 4), teacher?.id);
  const row = (k, v) => (v ? `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>` : '');

  const identite = `
    <div class="box avoid-break">
      <h3>${esc(tr('Identité', 'Identity', 'Identidad'))}</h3>
      <table class="kv">
        ${row(tr('Nom & prénom', 'Full name', 'Nombre completo'), teacher?.name)}
        ${row(tr('Matricule', 'Staff ID', 'Matrícula'), teacher?.matricule)}
        ${row(tr('Sexe', 'Gender', 'Sexo'), genderLabel(teacher?.gender, tr))}
        ${row(tr('Fonction', 'Role', 'Función'), teacher?.fonction)}
        ${row(tr('Spécialité', 'Specialty', 'Especialidad'), teacher?.specialty)}
        ${row(tr('Secteur', 'Section', 'Sector'), sectorLabel ? sectorLabel(teacher?.sector) : teacher?.sector)}
        ${row(tr('Date de recrutement', 'Hire date', 'Fecha de contratación'), dateLabel(teacher?.hire_date))}
        ${row(tr('Statut', 'Status', 'Estado'), teacher?.status)}
      </table>
    </div>`;

  const contact = `
    <div class="box avoid-break">
      <h3>${esc(tr('Contact', 'Contact', 'Contacto'))}</h3>
      <table class="kv">
        ${row(tr('Téléphone', 'Phone', 'Teléfono'), teacher?.phone)}
        ${row(tr('Email', 'Email', 'Correo'), teacher?.email)}
        ${row(tr('Adresse', 'Address', 'Dirección'), teacher?.address)}
      </table>
      ${!teacher?.phone && !teacher?.email && !teacher?.address
        ? `<p style="font-size:11px;color:#b45309">${esc(tr('Aucun contact renseigné.', 'No contact on file.', 'Sin contacto registrado.'))}</p>` : ''}
    </div>`;

  // Charge pédagogique : le tableau liste la matière ET sa classe, parce qu'un
  // même intitulé enseigné dans trois classes est trois charges, pas une.
  const lignes = subjects.map((s) => `
    <tr><td>${esc(s.name || '—')}</td><td>${esc(s.className || '—')}</td>${s.coef != null ? `<td class="num">${esc(s.coef)}</td>` : '<td class="num">—</td>'}</tr>`).join('');

  const charge = `
    <div class="box avoid-break">
      <h3>${esc(tr('Charge pédagogique', 'Teaching load', 'Carga docente'))}</h3>
      ${subjects.length ? `
        <table>
          <thead><tr>
            <th>${esc(tr('Matière', 'Subject', 'Materia'))}</th>
            <th>${esc(tr('Classe', 'Class', 'Clase'))}</th>
            <th class="right">${esc(tr('Coef.', 'Coef.', 'Coef.'))}</th>
          </tr></thead>
          <tbody>${lignes}</tbody>
        </table>` : `<p style="font-size:11px;color:#b45309">${esc(tr('Aucune matière assignée.', 'No subject assigned.', 'Sin materia asignada.'))}</p>`}
      <table class="kv" style="margin-top:8px">
        ${row(tr('Nombre de matières', 'Subjects', 'Materias'), String(subjects.length))}
        ${row(tr('Classes couvertes', 'Classes covered', 'Clases cubiertas'), classNames.length ? classNames.join(', ') : '')}
      </table>
    </div>`;

  const pieces = `
    <div class="box avoid-break">
      <h3>${esc(tr('Pièces au dossier', 'Documents on file', 'Documentos del expediente'))}</h3>
      ${docs.length
        ? `<ol style="font-size:11.5px;padding-left:18px;line-height:1.7">${docs.map((d) => `<li>${esc(d.name || tr('Document sans nom', 'Unnamed document', 'Documento sin nombre'))}</li>`).join('')}</ol>`
        : `<p style="font-size:11px;color:#b45309">${esc(tr('Aucune pièce jointe au dossier.', 'No document on file.', 'Sin documentos adjuntos.'))}</p>`}
      <p style="font-size:9.5px;color:#888;margin-top:6px">${esc(tr(
        'Les pièces listées sont conservées dans l’application ; ce document en atteste la présence, il ne les reproduit pas.',
        'Listed documents are stored in the app; this page records their presence, it does not reproduce them.',
        'Los documentos listados se conservan en la aplicación; esta página acredita su presencia, no los reproduce.'))}</p>
    </div>`;

  const acces = `
    <div class="box avoid-break">
      <h3>${esc(tr('Accès à l’application', 'App access', 'Acceso a la aplicación'))}</h3>
      <table class="kv">
      <tr><td class="k">${esc(tr('Compte application', 'App account', 'Cuenta de la aplicación'))}</td><td>${
        teacher?.auth_user_id
          ? esc(tr('Actif', 'Active', 'Activo'))
          : esc(tr('Aucun accès créé', 'No access created', 'Sin acceso creado'))}</td></tr>
      <tr><td class="k">${esc(tr('Impression des bulletins', 'Report card printing', 'Impresión de boletines'))}</td><td>${
        (teacher?.can_print_bulletin ?? true)
          ? esc(tr('Autorisée', 'Allowed', 'Autorizada'))
          : esc(tr('Bloquée', 'Blocked', 'Bloqueada'))}</td></tr>
      </table>
    </div>`;

  // Identité et contact côte à côte : deux colonnes courtes tiennent sur une
  // page là où deux blocs empilés faisaient déborder le pied de page tout seul
  // sur une seconde feuille (constaté au rendu PDF).
  const bodyHtml = `
    <div style="display:flex;gap:10px;align-items:stretch">
      <div style="flex:1;min-width:0">${identite}</div>
      <div style="flex:1;min-width:0">${contact}</div>
    </div>
    ${charge}
    ${pieces}
    ${acces}
    <div class="sign-area avoid-break">
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('L’intéressé(e)', 'The employee', 'El/La interesado(a)'))}</div></div>
      <div class="sign-box"><div class="sign-line"></div><div class="sign-label">${esc(tr('Le Chef d’établissement', 'The Head of institution', 'El Director'))}</div></div>
    </div>`;

  return openPrintDocument({
    school, t: tr,
    title: tr('Fiche de renseignements', 'Staff information sheet', 'Ficha de información'),
    ref, subtitle: teacher?.name, bodyHtml,
  });
}
